import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Proxy (antes "middleware"): refresca la sesión de Supabase en cada petición
 * para que los tokens no caduquen en silencio y exige sesión en todas las
 * rutas de la app.
 *
 * En Next 16 el archivo se llama `proxy.ts` y debe exportar `proxy`
 * (https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
 *
 * Rutas públicas (sin sesión):
 *   - `/login`        → formulario de acceso / registro.
 *   - `/auth/*`       → callback de confirmación de correo y recuperación.
 *   - `/api/*`        → los Route Handlers responden JSON con su propio 401
 *                       (redirigir un fetch a /login devolvería HTML).
 * Todo lo demás (`/`, `/dashboard`, `/directorio`, `/perfil/[slug]`, ...)
 * redirige a /login conservando el destino en `?redirectedFrom=`.
 */

const PUBLIC_PATHS = new Set(["/login"]);

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/auth/")) return true;

  return false;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // Evita que un CDN cachee respuestas que escriben cookies de sesión.
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // IMPORTANTE: `getUser()` valida el token contra Supabase y dispara el
  // refresco; no usar `getSession()` aquí.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo excepto estáticos, imágenes optimizadas y ficheros con extensión
     * (favicon, svg, png...). Sin este filtro el proxy bloquearía CSS y JS.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
