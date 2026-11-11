import Link from "next/link";

const steps = [
  {
    title: "Crea tu perfil",
    description:
      "Regístrate como estudio indie o publisher y cuéntale al resto del evento a qué te dedicas.",
  },
  {
    title: "Publica tus huecos",
    description:
      "Elige día, hora y duración de las franjas en las que estás disponible para reunirte.",
  },
  {
    title: "Reserva reuniones",
    description:
      "Explora el directorio, reserva un hueco libre y recibe el enlace a la sala virtual al instante.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
      <section className="text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          Networking Games
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-950 sm:text-6xl dark:text-zinc-50">
          Agenda reuniones de networking sin fricción
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-700 dark:text-zinc-300">
          El directorio y calendario del evento: publica cuándo estás
          disponible y deja que otros participantes reserven su hueco contigo en
          un clic.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/directorio"
            className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-950 px-8 text-base font-medium text-white transition-colors hover:bg-zinc-800 sm:w-auto dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Explorar el directorio
          </Link>
          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-full border border-zinc-300 px-8 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Publicar mi disponibilidad
          </Link>
        </div>
      </section>

      <section className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <span className="mb-3 inline-flex size-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {index + 1}
            </span>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {step.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {step.description}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
