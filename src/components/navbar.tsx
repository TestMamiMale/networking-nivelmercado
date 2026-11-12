"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

/**
 * Estado de sesión del navbar.
 *
 * `loading` existe para no enseñar "Acceder" a quien ya tiene sesión: el HTML
 * se sirve sin cookies de sesión en el árbol de React, así que hasta que
 * `getUser()` responde se muestra un esqueleto.
 */
type AuthStatus = "loading" | "authenticated" | "anonymous";

const LOGO_TITLE = "Networking Games";
const LOGO_SUBTITLE = "por Nivel Mercado";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profileHref, setProfileHref] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    // "Mi Perfil" apunta a /perfil/[slug], y el slug es el id del perfil: no
    // viaja en la sesión, hay que consultarlo (RLS lo permite al autenticado).
    const syncProfileHref = async (userId: string | null) => {
      if (!userId) {
        if (active) setProfileHref(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (active) setProfileHref(data ? `/perfil/${data.id}` : null);
    };

    const syncUser = (userId: string | null) => {
      if (!active) return;
      setStatus(userId ? "authenticated" : "anonymous");
      void syncProfileHref(userId);
    };

    void supabase.auth
      .getUser()
      .then(({ data }) => syncUser(data.user?.id ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        syncUser(session?.user?.id ?? null);
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    setOpen(false);
    // "/" es la landing pública (el proxy no la bloquea sin sesión).
    router.replace("/");
    router.refresh();
  };

  const signedIn = status === "authenticated";

  const links = signedIn
    ? [
        { href: "/directorio", label: "Directorio" },
        { href: "/dashboard", label: "Dashboard" },
        ...(profileHref ? [{ href: profileHref, label: "Mi Perfil" }] : []),
      ]
    : [];

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex flex-col justify-center gap-0.5"
        >
          <span className="text-base leading-none font-semibold tracking-tight">
            {LOGO_TITLE}
          </span>
          <span className="text-[10px] leading-none font-medium tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400">
            {LOGO_SUBTITLE}
          </span>
        </Link>

        {/* Escritorio */}
        <div className="hidden items-center gap-6 md:flex">
          {status === "loading" ? (
            <span
              aria-hidden
              className="h-8 w-24 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800"
            />
          ) : signedIn ? (
            <>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  {link.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-950 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Acceder
            </Link>
          )}
        </div>

        {/* Móvil */}
        {status === "loading" ? (
          <span
            aria-hidden
            className="h-8 w-20 animate-pulse rounded-full bg-zinc-200 md:hidden dark:bg-zinc-800"
          />
        ) : signedIn ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="md:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-zinc-950 px-4 py-1.5 text-sm font-medium text-white md:hidden dark:bg-white dark:text-black"
          >
            Acceder
          </Link>
        )}
      </nav>

      {/* Menú móvil: solo con sesión, porque sin ella no hay enlaces privados */}
      {signedIn && open && (
        <div className="flex flex-col gap-1 border-t border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-1 rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Salir
          </button>
        </div>
      )}
    </header>
  );
}
