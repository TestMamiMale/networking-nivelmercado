import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Cliente de Supabase con la **service role key**.
 *
 * Omite RLS, así que solo puede usarse en el servidor (Route Handlers y Server
 * Actions) y NUNCA importarse desde un Client Component. La clave vive en
 * `SUPABASE_SERVICE_ROLE_KEY` (sin el prefijo `NEXT_PUBLIC_`), por lo que Next
 * no la incluye en el bundle del navegador: si alguien importara este módulo
 * desde un componente cliente, la variable llegaría como `undefined` y la
 * función lanzaría el error de configuración de abajo.
 */
export function createAdminSupabaseClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminSupabaseClient() solo puede ejecutarse en el servidor.",
    );
  }

  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Settings → API → " +
        "`service_role`). Es una clave secreta: no debe llevar el prefijo " +
        "NEXT_PUBLIC_ ni subirse al repositorio.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      // Este cliente no representa a ningún usuario: no guarda sesión.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
