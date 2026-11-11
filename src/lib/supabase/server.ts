import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 * Lee la sesión de las cookies, así que respeta las políticas RLS del usuario
 * autenticado. En Next 16 `cookies()` es asíncrono.
 *
 * Debe crearse uno nuevo en cada petición: nunca compartir instancias.
 */
export async function createServerSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Los Server Components no pueden escribir cookies. El refresco de
          // sesión lo hace `src/proxy.ts`; aquí basta con ignorarlo.
        }
      },
    },
  });
}
