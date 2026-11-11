import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Cliente anónimo sin cookies para leer datos públicos desde el servidor
 * (directorio y perfiles). Al no tocar `cookies()` estos componentes pueden
 * prerenderizarse sin necesidad de una sesión.
 */
export function createPublicSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
