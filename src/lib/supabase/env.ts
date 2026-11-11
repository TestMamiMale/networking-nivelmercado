/**
 * Lectura centralizada de las variables de entorno públicas de Supabase.
 * Se valida en tiempo de ejecución para dar un error claro en lugar de un
 * `undefined` silencioso.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copia .env.example a .env.local y rellena los valores de tu proyecto de Supabase.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL no es una URL válida ("${url}"). ` +
        "Debe ser algo como https://tu-proyecto.supabase.co — revisa .env.local.",
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL debe usar http o https (valor actual: "${url}").`,
    );
  }

  return { url, anonKey };
}
