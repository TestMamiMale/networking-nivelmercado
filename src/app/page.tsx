import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Handshake,
  Ticket,
} from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EVENT, ORGANIZER_NAME, ORGANIZER_URL, SITE_NAME } from "@/lib/site";

const steps = [
  {
    icon: Ticket,
    title: "Regístrate con tu código",
    description:
      "Introduce el código de invitación que te enviamos y crea tu perfil de estudio indie o publisher. Sin correos de confirmación ni esperas.",
    hint: "Menos de 1 minuto",
  },
  {
    icon: CalendarClock,
    title: "Publica tus horarios",
    description:
      "Elige los días y las horas en los que quieres reunirte y cuánto dura cada hueco. Tú decides cuándo estás disponible.",
    hint: "Huecos de 15 a 60 min",
  },
  {
    icon: Handshake,
    title: "Agenda reuniones 1 a 1",
    description:
      "Explora el directorio, encuentra a quién quieres conocer y reserva un hueco libre. La sala de videollamada se prepara sola.",
    hint: "Un clic por reunión",
  },
];

const facts = [
  { value: EVENT.datesShortLabel, label: "tres días de evento" },
  { value: "1 a 1", label: "reuniones sin salas de espera" },
  { value: "15 – 60", label: "minutos por reunión" },
];

/** La landing es la única URL canónica del sitio; el resto vive tras el login. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="bg-zinc-950 text-zinc-50">
      <section className="relative overflow-hidden">
        {/* Halos de color: dan profundidad al fondo oscuro sin usar imágenes. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-56 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-blue-600/25 blur-3xl" />
          <div className="absolute -right-32 -bottom-56 h-[32rem] w-[32rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-16 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Evento de networking · {EVENT.datesLabel}
            </span>

            <h1 className="mt-8 text-5xl font-bold tracking-tight text-balance sm:text-7xl">
              <span className="bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                {EVENT.tagline}
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-zinc-300 sm:text-xl">
              El directorio y la agenda del evento de {ORGANIZER_NAME}: publica
              cuándo estás disponible y reserva reuniones con estudios indie y
              publishers en un clic.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/* La única parte de la landing que depende de la sesión. */}
              <Suspense fallback={<HeroCta signedIn={false} />}>
                <SessionHeroCta />
              </Suspense>
            </div>

            <p className="mt-4 text-sm text-zinc-500">
              El acceso es solo con código de invitación.
            </p>
          </div>

          <dl className="mx-auto mt-16 grid max-w-4xl grid-cols-1 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {facts.map((fact) => (
              <div key={fact.label} className="px-6 py-5 text-center">
                <dt className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {fact.label}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="como-funciona" className="border-t border-white/10 bg-black/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
              Cómo funciona
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Tres pasos y estás dentro del evento
            </h2>
            <p className="mt-4 text-pretty text-zinc-400">
              Sin formularios eternos ni cadenas de correos: tu código de acceso
              lo abre todo.
            </p>
          </div>

          <ol className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <li
                  key={step.title}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/25 to-fuchsia-500/25 text-blue-300 ring-1 ring-white/10 ring-inset">
                      <Icon size={20} />
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-zinc-600">
                      0{index + 1}
                    </span>
                  </div>

                  <h3 className="mt-6 text-lg font-semibold text-zinc-50">
                    {step.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                    {step.description}
                  </p>

                  <p className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {step.hint}
                  </p>
                </li>
              );
            })}
          </ol>

          <p className="mt-12 flex items-center justify-center gap-2 text-sm text-zinc-500">
            <CalendarDays size={16} className="text-zinc-400" />
            {EVENT.datesLabel} · Evento online para estudios indie y publishers
          </p>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{SITE_NAME}</p>
            <p className="mt-1 text-sm text-zinc-400">
              Un evento organizado por{" "}
              <a
                href={ORGANIZER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 transition-colors hover:text-white"
              >
                {ORGANIZER_NAME}
              </a>
            </p>
          </div>

          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10"
          >
            Acceder al evento
          </Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * Botón principal del hero. No usa hooks para poder renderizarse tanto en el
 * `fallback` de <Suspense> como con la sesión ya resuelta.
 */
function HeroCta({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <Link
        href={signedIn ? "/dashboard" : "/login"}
        className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 sm:w-auto"
      >
        {signedIn ? "Ir a mi Dashboard" : "Acceder al evento"}
        <ArrowRight
          size={18}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </Link>

      <a
        href="#como-funciona"
        className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 text-base font-medium text-zinc-100 transition-colors hover:bg-white/10 sm:w-auto"
      >
        Cómo funciona
      </a>
    </>
  );
}

/**
 * Lee la sesión de las cookies para elegir el texto del botón principal.
 *
 * `connection()` marca el bloque como dato de petición: con `cacheComponents`
 * el resto de la landing se sigue prerenderizando y solo este trozo se
 * resuelve en cada visita.
 */
async function SessionHeroCta() {
  await connection();

  let signedIn = false;

  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch (error) {
    // Si Supabase no está configurado o no responde, la landing sigue en pie
    // con el acceso público.
    console.error("No se pudo comprobar la sesión en la landing:", error);
  }

  return <HeroCta signedIn={signedIn} />;
}

