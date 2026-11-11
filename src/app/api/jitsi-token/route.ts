import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getJitsiAppId, getRoomNameFromLink, isValidRoomName } from "@/lib/jitsi";
import { createJitsiToken } from "@/lib/jitsi-token";
import { getJitsiSigningKey, PRIVATE_KEY_FILE } from "@/lib/jitsi-secret";

// `jsonwebtoken` usa el módulo `crypto` de Node. Con `cacheComponents` no se
// puede fijar `runtime`, pero el runtime por defecto ya es Node.js.

const MAX_USER_NAME_LENGTH = 80;

/** Para no repetir el aviso del `kid` en cada petición. */
let warnedAboutMissingKid = false;

/**
 * Con una clave privada PEM se firma con RS256 y JaaS exige que el header
 * `kid` sea el ID completo de la API key (`<appId>/<sufijo>`), no el App ID.
 */
function warnIfKidMissing(algorithm: "HS256" | "RS256") {
  if (algorithm !== "RS256" || warnedAboutMissingKid) return;
  if (process.env.JITSI_APP_KID?.trim()) return;

  warnedAboutMissingKid = true;
  console.warn(
    "[jitsi] Firmando con RS256 y sin JITSI_APP_KID: el header usa el App ID. " +
      "Si JaaS rechaza el token, define JITSI_APP_KID con el API Key ID de la " +
      "consola (formato vpaas-magic-cookie-.../xxxxxx).",
  );
}

interface MeetingRow {
  participant1_id: string;
  participant2_id: string;
  virtual_link: string;
}

/**
 * POST /api/jitsi-token
 * Body: { roomName: string, userName?: string }
 *
 * Devuelve un JWT firmado para entrar en la sala con el SDK de JaaS.
 *
 * Reglas de seguridad:
 * - Solo usuarios autenticados (el secreto de firma no se expone nunca).
 * - Solo participantes de la reunión: la sala debe coincidir con el
 *   `virtual_link` de una reunión de `meetings` en la que esté el usuario.
 * - El `id` y el `email` del JWT salen siempre de la sesión, no del body.
 * - El dueño del hueco (`participant2_id`) entra como moderador.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const fields =
    body && typeof body === "object"
      ? (body as { roomName?: unknown; userName?: unknown })
      : {};

  // Toleramos que llegue la URL completa (así el cliente no duplica lógica).
  const roomName =
    typeof fields.roomName === "string"
      ? getRoomNameFromLink(fields.roomName)
      : "";

  if (!roomName || !isValidRoomName(roomName)) {
    return NextResponse.json(
      { error: "Falta roomName o no es un nombre de sala válido." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "No autenticado. Inicia sesión para entrar a la reunión." },
      { status: 401 },
    );
  }

  const { data: meetings, error: meetingsError } = await supabase
    .from("meetings")
    .select("participant1_id, participant2_id, virtual_link")
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
    .returns<MeetingRow[]>();

  if (meetingsError) {
    console.error("Error fetching meetings for JaaS token:", meetingsError);
    return NextResponse.json(
      { error: "No se pudo comprobar el acceso a la reunión." },
      { status: 500 },
    );
  }

  const meeting = (meetings ?? []).find(
    (row) =>
      typeof row.virtual_link === "string" &&
      getRoomNameFromLink(row.virtual_link) === roomName,
  );

  if (!meeting) {
    return NextResponse.json(
      {
        error:
          "No tienes acceso a esta sala: solo pueden entrar los participantes de la reunión.",
      },
      { status: 403 },
    );
  }

  const appId = getJitsiAppId();
  // Prioridad: JITSI_APP_SECRET y, si está vacío, ./private.key (PEM).
  const appSecret = getJitsiSigningKey();

  if (!appId || !appSecret) {
    return NextResponse.json(
      {
        error:
          "JaaS no está configurado: falta NEXT_PUBLIC_JITSI_APP_ID y la clave " +
          `de firma (${PRIVATE_KEY_FILE} en la raíz del proyecto o ` +
          "JITSI_APP_SECRET en .env.local).",
      },
      { status: 503 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle<{ name: string }>();

  const requestedName =
    typeof fields.userName === "string"
      ? fields.userName.trim().slice(0, MAX_USER_NAME_LENGTH)
      : "";

  const displayName =
    requestedName ||
    profile?.name ||
    user.email?.split("@")[0] ||
    "Participante";

  const isModerator = meeting.participant2_id === user.id;

  try {
    const { token, expiresAt, algorithm } = createJitsiToken({
      appId,
      appSecret,
      kid: process.env.JITSI_APP_KID,
      roomName,
      user: {
        id: user.id,
        name: displayName,
        email: user.email,
        moderator: isModerator,
      },
    });

    warnIfKidMissing(algorithm);

    return NextResponse.json(
      { token, appId, roomName, expiresAt, moderator: isModerator },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (signError) {
    console.error("Error signing JaaS token:", signError);
    return NextResponse.json(
      {
        error:
          "No se pudo firmar el token de JaaS. Revisa la clave privada " +
          `(${PRIVATE_KEY_FILE}) o JITSI_APP_SECRET en .env.local.`,
      },
      { status: 500 },
    );
  }
}
