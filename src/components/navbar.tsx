"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

const links = [
  { href: "/", label: "Evento" },
  { href: "/directorio", label: "Directorio" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    setOpen(false);
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Networking Games
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {l.label}
            </Link>
          ))}
          {email ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Salir
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-950 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Acceder
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden"
          aria-label="Abrir menú"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="flex flex-col gap-1 border-t border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {l.label}
            </Link>
          ))}
          {email ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-1 rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              Salir
            </button>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-full bg-zinc-950 px-4 py-2 text-center text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Acceder
            </Link>
          )}
        </div>
      )}
    </header>
  );
}