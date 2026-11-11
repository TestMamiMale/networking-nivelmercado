// src/app/login/page.tsx
"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ProfileType,
  RegisterWithCodePayload,
  RegisterWithCodeResponse,
} from "@/types";

const INPUT_CLASS =
  "block w-full rounded-md border-0 py-1.5 text-zinc-950 shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700 dark:focus:ring-blue-500";

const LABEL_CLASS =
  "block text-sm font-medium leading-6 text-zinc-950 dark:text-zinc-50";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

/**
 * Destino tras autenticarse. Solo rutas internas: aceptar `//dominio.com`
 * sería un open redirect.
 */
function redirectTarget(redirectedFrom: string | null) {
  if (
    redirectedFrom &&
    redirectedFrom.startsWith("/") &&
    !redirectedFrom.startsWith("//")
  ) {
    return redirectedFrom;
  }

  return "/dashboard";
}

function LoginForm() {
  const searchParams = useSearchParams();
  // Permite repartir enlaces tipo `/login?code=NG-ABC123`.
  const codeFromLink = (searchParams.get("code") ?? "").trim().toUpperCase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>("indie");
  const [code, setCode] = useState(codeFromLink);
  const [isRegistering, setIsRegistering] = useState(codeFromLink !== "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Error devuelto por /auth/callback (por ejemplo, un enlace caducado).
  const callbackError = searchParams.get("error");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (isRegistering && !name.trim()) {
      setError("Indica tu nombre o el de tu estudio.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isRegistering) {
        // El alta la hace el servidor: valida el código, crea el usuario con
        // email confirmado y deja la sesión en cookies.
        const payload: RegisterWithCodePayload = {
          name: name.trim(),
          email: normalizedEmail,
          password,
          type: profileType,
          code: code.trim().toUpperCase(),
        };

        let response: Response;

        try {
          response = await fetch("/api/auth/register-with-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {
          setError(
            "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
          );
          return;
        }

        const result = (await response.json().catch(() => null)) as
          | RegisterWithCodeResponse
          | null;

        if (!response.ok) {
          setError(
            result?.error ??
              "No pudimos crear tu cuenta. Inténtalo de nuevo en unos segundos.",
          );
          return;
        }

        if (!result?.session) {
          // La cuenta se creó, pero el servidor no pudo abrir sesión: la
          // abrimos desde aquí con las mismas credenciales.
          const { error: fallbackError } =
            await createClient().auth.signInWithPassword({
              email: normalizedEmail,
              password,
            });

          if (fallbackError) {
            setError(
              "Tu cuenta se creó, pero no pudimos iniciar sesión. Entra con tu email y contraseña.",
            );
            return;
          }
        }

        router.push(redirectTarget(searchParams.get("redirectedFrom")));
        router.refresh();
        return;
      }

      const { error: signInError } = await createClient().auth.signInWithPassword(
        { email: normalizedEmail, password },
      );

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push(redirectTarget(searchParams.get("redirectedFrom")));
      router.refresh();
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
            Usa tu código de invitación y el correo que prefieras. No hace falta
            confirmar el correo.
          </p>
        )}
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
        <form className="space-y-6" onSubmit={handleSubmit}>
          {isRegistering && (
            <div>
              <label htmlFor="name" className={LABEL_CLASS}>
                Nombre
              </label>
              <div className="mt-2">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  maxLength={80}
                  autoComplete="organization"
                  placeholder="Tu nombre o el de tu estudio"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className={LABEL_CLASS}>
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
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className={LABEL_CLASS}>
              Contraseña
            </label>
            <div className="mt-2">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isRegistering ? "new-password" : "current-password"}
                required
                minLength={isRegistering ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            {isRegistering && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Mínimo 8 caracteres.
              </p>
            )}
          </div>

          {isRegistering && (
            <>
              <div>
                <label htmlFor="type" className={LABEL_CLASS}>
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
                    className={INPUT_CLASS}
                  >
                    <option value="indie">Estudio indie</option>
                    <option value="publisher">Publisher</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="code" className={LABEL_CLASS}>
                  Código de invitación
                </label>
                <div className="mt-2">
                  <input
                    id="code"
                    name="code"
                    type="text"
                    required
                    maxLength={15}
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="NG-XXXXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className={`${INPUT_CLASS} font-mono uppercase tracking-widest`}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Te lo entregó el equipo del evento. Cada código vale para un
                  solo registro.
                </p>
              </div>
            </>
          )}

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

        <p className="mt-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {isRegistering ? "Ya tienes una cuenta?" : "No tienes una cuenta?"}{" "}
          <button
            onClick={() => {
              setError(null);
              setIsRegistering((v) => !v);
            }}
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
