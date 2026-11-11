// src/app/login/page.tsx
"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import type { InvitationVerifyResponse, ProfileType } from "@/types";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>("indie");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Error devuelto por /auth/callback (por ejemplo, un enlace caducado).
  const callbackError = searchParams.get("error");

  /**
   * Pregunta al servidor si el correo está invitado. Devuelve el mensaje de
   * error a mostrar, o `null` si puede continuar.
   *
   * La tabla `invitations` no es legible desde el navegador (RLS sin
   * políticas): la comprobación pasa por /api/invitations/verify.
   */
  const verifyInvitation = async (): Promise<string | null> => {
    let response: Response;

    try {
      response = await fetch("/api/invitations/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
    }

    const result = (await response.json().catch(() => null)) as
      | InvitationVerifyResponse
      | null;

    if (!response.ok || !result?.allowed) {
      return (
        result?.error ??
        "No pudimos verificar tu invitación. Inténtalo de nuevo en unos segundos."
      );
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      if (isRegistering) {
        if (!name.trim()) {
          setError("Indica tu nombre o el de tu estudio.");
          return;
        }

        // 1) Solo los correos invitados pueden registrarse.
        const invitationError = await verifyInvitation();

        if (invitationError) {
          setError(invitationError);
          return;
        }

        // 2) Alta en Supabase Auth. El trigger de la base de datos marca la
        //    invitación como usada y crea el perfil.
        const { error } = await createClient().auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            // El trigger handle_new_user crea el perfil con estos metadatos.
            data: { name: name.trim(), type: profileType },
          },
        });
        if (error) {
          setError(error.message);
        } else {
          setMessage(
            "Registro exitoso. Revisa tu correo para confirmar tu cuenta.",
          );
        }
      } else {
        const { error } = await createClient().auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(error.message);
        } else {
          const redirectedFrom = searchParams.get("redirectedFrom");
          // Solo rutas internas: `//dominio.com` sería un open redirect.
          const destination =
            redirectedFrom &&
            redirectedFrom.startsWith("/") &&
            !redirectedFrom.startsWith("//")
              ? redirectedFrom
              : "/dashboard";

          router.push(destination);
          router.refresh();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold leading-9 tracking-tight text-zinc-950 dark:text-zinc-50">
          {isRegistering ? "Regístrate" : "Inicia sesión"}
        </h2>
        {isRegistering && (
          <p className="mt-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
            El acceso es por invitación: usa el correo con el que te invitaron
            al evento.
          </p>
        )}
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
        <form className="space-y-6" onSubmit={handleSubmit}>
          {isRegistering && (
            <>
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium leading-6 text-zinc-950 dark:text-zinc-50"
                >
                  Nombre del estudio
                </label>
                <div className="mt-2">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full rounded-md border-0 py-1.5 text-zinc-950 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700 dark:focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="type"
                  className="block text-sm font-medium leading-6 text-zinc-950 dark:text-zinc-50"
                >
                  Tipo de perfil
                </label>
                <div className="mt-2">
                  <select
                    id="type"
                    name="type"
                    value={profileType}
                    onChange={(e) =>
                      setProfileType(e.target.value as ProfileType)
                    }
                    className="block w-full rounded-md border-0 py-1.5 text-zinc-950 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700 dark:focus:ring-blue-500"
                  >
                    <option value="indie">Estudio indie</option>
                    <option value="publisher">Publisher</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium leading-6 text-zinc-950 dark:text-zinc-50"
            >
              Email
            </label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-zinc-950 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700 dark:focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm font-medium leading-6 text-zinc-950 dark:text-zinc-50"
              >
                Contraseña
              </label>
            </div>
            <div className="mt-2">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isRegistering ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-zinc-950 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700 dark:focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {isSubmitting
                ? "Un momento…"
                : isRegistering
                  ? "Registrarme"
                  : "Iniciar sesión"}
            </button>
          </div>
        </form>

        {(error ?? callbackError) && (
          <p className="mt-4 text-center text-sm text-red-500">
            {error ?? callbackError}
          </p>
        )}
        {message && <p className="mt-4 text-center text-sm text-green-500">{message}</p>}

        <p className="mt-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {isRegistering ? "Ya tienes una cuenta?" : "No tienes una cuenta?"}{" "}
          <button
            onClick={() => setIsRegistering((v) => !v)}
            className="font-semibold leading-6 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isRegistering ? "Inicia sesión" : "Regístrate"}
          </button>
        </p>
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mx-auto h-9 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="mt-10 space-y-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="h-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-9 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
