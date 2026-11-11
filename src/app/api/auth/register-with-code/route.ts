import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProfileType, RegisterWithCodeResponse } from "@/types";

/**
 * POST /api/auth/register-with-code
 * Body: { name, email, password, type, code }
 *
 * Alta de un asistente con un código de invitación. Se hace en el servidor
 * porque necesita dos cosas que el navegador no puede tener:
 *
 *   1. La **service role key** (omite RLS) para leer y consumir `access_codes`.
 *   2. La **Admin API** (`auth.admin.createUser`), que permite crear la cuenta
 *      con `email_confirm: true` y saltarse el correo de confirmación.
 *
 * Orden: se *consume* el código antes de crear el usuario y, si el alta falla,
 * se libera. El consumo es un único `UPDATE ... WHERE is_used = false`, así
 * que dos peticiones con el mismo código no pueden ganar las dos.
 *
 * Respuestas:
 *   201 { user, session }
 *   400 { error, reason: "invalid_input" }
 *   403 { error, reason: "invalid_code" }
 *   409 { error, reason: "code_used" | "email_taken" }
 *   500 { error, reason: "server_error" }
 *   503 { error, reason: "unavailable" }  (sin SUPABASE_SERVICE_ROLE_KEY)
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 80;
// La misma longitud que generan las migraciones (`NG-XXXXXX`); se aceptan 4–12
// caracteres para no romper con códigos repartidos a mano.
const CODE_RE = /^NG-[A-Z0-9]{4,12}$/;
const MIN_PASSWORD_LENGTH = 8;
// Límite de bcrypt en Supabase Auth: por encima, el hash se trunca.
const MAX_PASSWORD_LENGTH = 72;

function fail(
  status: number,
  reason: RegisterWithCodeResponse["reason"],
  error: string,
) {
  const body: RegisterWithCodeResponse = { error, reason };
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "invalid_input", "Cuerpo inválido.");
  }

  const input = body as Record<string, unknown>;

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const type = input.type;
  const code =
    typeof input.code === "string" ? input.code.trim().toUpperCase() : "";

  if (!name || name.length > MAX_NAME_LENGTH) {
    return fail(
      400,
      "invalid_input",
      `Indica tu nombre o el de tu estudio (máximo ${MAX_NAME_LENGTH} caracteres).`,
    );
  }

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return fail(400, "invalid_input", "El correo no tiene un formato válido.");
  }

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return fail(
      400,
      "invalid_input",
      `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`,
    );
  }

  if (type !== "indie" && type !== "publisher") {
    return fail(
      400,
      "invalid_input",
      "Indica si tu perfil es de estudio indie o de publisher.",
    );
  }

  const profileType: ProfileType = type;

  if (!CODE_RE.test(code)) {
    return fail(
      400,
      "invalid_input",
      "El código de invitación tiene el formato NG-XXXXXX. Revísalo.",
    );
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;

  try {
    admin = createAdminSupabaseClient();
  } catch (configError) {
    console.error("Registro no disponible:", configError);
    return fail(
      503,
      "unavailable",
      "El registro no está disponible ahora mismo. Escribe al equipo del evento.",
    );
  }

  // 1) Comprobación previa, solo para dar un mensaje claro (no consume nada).
  const { data: existing, error: lookupError } = await admin
    .from("access_codes")
    .select("id, is_used")
    .eq("code", code)
    .maybeSingle();

  if (lookupError) {
    console.error("Error leyendo access_codes:", lookupError);
    return fail(
      500,
      "server_error",
      "No pudimos validar tu código. Inténtalo de nuevo en unos segundos.",
    );
  }

  if (!existing) {
    return fail(
      403,
      "invalid_code",
      "Ese código no existe. Revisa que esté bien escrito (NG-XXXXXX).",
    );
  }

  if (existing.is_used) {
    return fail(
      409,
      "code_used",
      "Ese código ya fue utilizado. Cada código vale para un solo registro.",
    );
  }

  // 2) Consumo atómico: el `WHERE is_used = false` hace que solo una petición
  //    pueda quedarse con el código aunque lleguen dos a la vez.
  const { data: claimed, error: claimError } = await admin
    .from("access_codes")
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("is_used", false)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("Error consumiendo el código:", claimError);
    return fail(
      500,
      "server_error",
      "No pudimos validar tu código. Inténtalo de nuevo en unos segundos.",
    );
  }

  if (!claimed) {
    return fail(
      409,
      "code_used",
      "Ese código acaba de ser utilizado. Cada código vale para un solo registro.",
    );
  }

  /** Devuelve el código a la bolsa si el alta no llega a buen puerto. */
  const releaseCode = async () => {
    const { error } = await admin
      .from("access_codes")
      .update({ is_used: false, used_at: null })
      .eq("id", claimed.id);

    if (error) {
      console.error("No se pudo liberar el código tras un alta fallida:", error);
    }
  }

  // 3) Alta con la Admin API: `email_confirm: true` evita el correo de
  //    confirmación. El trigger `handle_new_user` crea el perfil con los
  //    metadatos (`name`, `type`).
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, type: profileType },
    });

  if (createError || !created?.user) {
    await releaseCode();

    const message = createError?.message ?? "";
    const alreadyRegistered =
      createError?.code === "email_exists" ||
      /already\s+(been\s+)?registered|user already exists/i.test(message);

    if (alreadyRegistered) {
      return fail(
        409,
        "email_taken",
        "Ese correo ya tiene una cuenta. Inicia sesión o usa otro correo.",
      );
    }

    console.error("Error creando el usuario:", createError);
    return fail(
      500,
      "server_error",
      "No pudimos crear tu cuenta. Inténtalo de nuevo en unos segundos.",
    );
  }

  const user = {
    id: created.user.id,
    email,
    name,
    type: profileType,
  };

  // 4) Sesión: el cliente con cookies escribe las de `@supabase/ssr`, así que
  //    el navegador queda autenticado sin volver a pedir la contraseña.
  try {
    const supabase = await createServerSupabaseClient();
    const { data: signIn, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !signIn.session) {
      // La cuenta existe, así que el código sigue consumido.
      console.error(
        "Usuario creado pero sin sesión (habrá que iniciar sesión a mano):",
        signInError,
      );
      return NextResponse.json<RegisterWithCodeResponse>(
        { user, session: null },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }

    const session = signIn.session;

    return NextResponse.json<RegisterWithCodeResponse>(
      {
        user,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at ?? 0,
          expires_in: session.expires_in,
          token_type: session.token_type,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (sessionError) {
    console.error("Error iniciando sesión tras el registro:", sessionError);
    return NextResponse.json<RegisterWithCodeResponse>(
      { user, session: null },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  }
}
