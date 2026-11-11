import { NextResponse, type NextRequest } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { InvitationVerifyResponse } from "@/types";

/**
 * POST /api/invitations/verify
 * Body: { email: string }
 *
 * Comprueba, ANTES de crear la cuenta, si el correo está en `invitations` y
 * sin usar. La tabla tiene RLS sin políticas, así que solo se puede consultar
 * a través de la función `check_invitation()` (SECURITY DEFINER).
 *
 * No crea ni modifica nada: la invitación se marca como usada en la base de
 * datos por el trigger `on_auth_user_invitation_used` cuando Supabase crea el
 * usuario en `auth.users` (ver supabase/migrations/0002_invitations.sql), así
 * que no se puede saltar desde el navegador.
 *
 * Respuestas:
 *   200 { allowed: true }
 *   400 { allowed: false, reason: "invalid_email", error }
 *   403 { allowed: false, reason: "not_found" | "already_used", error }
 *   500 { allowed: false, error }
 *   503 { allowed: false, error }  (Supabase sin configurar)
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 320;

function denied(
  status: number,
  reason: InvitationVerifyResponse["reason"] | null,
  error: string,
) {
  const body: InvitationVerifyResponse = { allowed: false, error };
  if (reason) body.reason = reason;
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return denied(400, "invalid_email", "Cuerpo inválido.");
  }

  const rawEmail = (body as { email?: unknown }).email;

  if (typeof rawEmail !== "string") {
    return denied(400, "invalid_email", "Indica un correo electrónico.");
  }

  const email = rawEmail.trim().toLowerCase();

  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return denied(400, "invalid_email", "El correo no tiene un formato válido.");
  }

  let supabase;

  try {
    supabase = createPublicSupabaseClient();
  } catch (configError) {
    console.error("Supabase no está configurado:", configError);
    return denied(
      503,
      null,
      "No pudimos verificar tu invitación: el servidor no está configurado.",
    );
  }

  const { data, error } = await supabase.rpc("check_invitation", {
    p_email: email,
  });

  if (error) {
    console.error("Error verificando la invitación:", error);
    return denied(
      500,
      null,
      "No pudimos verificar tu invitación. Inténtalo de nuevo en unos segundos.",
    );
  }

  // `returns table (...)` siempre devuelve una fila; por si acaso, toleramos
  // también un objeto suelto.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { invited?: boolean; used?: boolean }
    | null
    | undefined;

  if (!row?.invited) {
    return denied(
      403,
      "not_found",
      "Este correo no está en la lista de invitados del evento. Revisa que sea el mismo con el que te invitaron.",
    );
  }

  if (row.used) {
    return denied(
      403,
      "already_used",
      "Esta invitación ya fue utilizada. Inicia sesión con tu cuenta o escribe al equipo del evento.",
    );
  }

  const response: InvitationVerifyResponse = { allowed: true };
  return NextResponse.json(response);
}
