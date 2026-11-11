import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./supabase/env";

let browserClient: SupabaseClient | null = null;

/**
 * Cliente de Supabase para componentes del lado del cliente.
 *
 * Es un singleton perezoso: nunca se crea en el ámbito del módulo (para no
 * ejecutarse durante el prerender) y se reutiliza entre componentes para no
 * abrir varias conexiones de auth.
 */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const { url, anonKey } = getSupabaseEnv();
  browserClient = createBrowserClient(url, anonKey);

  return browserClient;
}
