"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Sparkles, X } from "lucide-react";
import AvailabilityGrid from "@/components/AvailabilityGrid";
import MeetingRoom from "@/components/MeetingRoom";
import ProfileEditor from "@/components/ProfileEditor";
import { durationLabel } from "@/lib/availability-grid";
import { MAX_MEETINGS_PER_USER, MEETING_LIMIT_MESSAGE } from "@/lib/meetings";
import { EVENT } from "@/lib/site";
import { createClient } from "@/lib/supabase";
import type { AvailabilitySlot } from "@/types";

interface MeetingSummary {
  id: string;
  start_time: string;
  end_time: string;
  virtual_link: string;
  other_participant_name: string;
}

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  const loadData = useCallback(async () => {
    const [meetingsResponse, availabilityResponse] = await Promise.all([
      fetch("/api/meetings", { cache: "no-store" }),
      fetch("/api/availability", { cache: "no-store" }),
    ]);

    if (meetingsResponse.status === 401 || availabilityResponse.status === 401) {
      router.replace("/login");
      return;
    }

    if (!meetingsResponse.ok || !availabilityResponse.ok) {
      throw new Error("No se pudieron cargar tus datos.");
    }

    const meetingsPayload = (await meetingsResponse.json()) as {
      meetings: MeetingSummary[];
    };
    const availabilityPayload = (await availabilityResponse.json()) as {
      slots: AvailabilitySlot[];
    };

    setMeetings(meetingsPayload.meetings ?? []);
    setAvailability(availabilityPayload.slots ?? []);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!data.user) {
        router.replace("/login");
        return;
      }

      setUser(data.user);

      try {
        await loadData();
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Error desconocido.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [loadData, router]);

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-zinc-700 dark:text-zinc-300">
        Cargando...
      </div>
    );
  }

  const openSlots = availability.filter((slot) => !slot.is_booked);

  const openMinutes = openSlots.reduce(
    (total, slot) =>
      total +
      Math.max(
        0,
        (new Date(slot.end_time).getTime() -
          new Date(slot.start_time).getTime()) /
          60_000,
      ),
    0,
  );

  // Onboarding: solo mientras no haya ningún bloque guardado.
  const showOnboarding = showGuide && !error && availability.length === 0;
  const reachedMeetingLimit = meetings.length >= MAX_MEETINGS_PER_USER;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-zinc-950 dark:text-zinc-50">
            Dashboard
          </h1>
          {user && (
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">
              Bienvenido, {user.email}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {user && (
            <Link
              href={`/perfil/${user.id}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Ver mi perfil público
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {showOnboarding && <OnboardingBanner onDismiss={() => setShowGuide(false)} />}

      <section aria-labelledby="disponibilidad">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-blue-600 uppercase dark:text-blue-400">
              Paso 1
            </p>
            <h2
              id="disponibilidad"
              className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50"
            >
              Define tu disponibilidad
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Bloques de 30 minutos, del {EVENT.datesLabel}, entre las 09:00 y
              las 18:00. Solo lo que pintes se podrá reservar.
            </p>
          </div>

          <p className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {openSlots.length} huecos · {durationLabel(openMinutes)}
          </p>
        </div>

        <AvailabilityGrid slots={availability} onSaved={loadData} />
      </section>

      <section className="mt-12" aria-labelledby="reuniones">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-blue-600 uppercase dark:text-blue-400">
              Paso 2
            </p>
            <h2
              id="reuniones"
              className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50"
            >
              Mis reuniones
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Explora el{" "}
              <Link href="/directorio" className="underline">
                directorio
              </Link>{" "}
              y reserva un hueco libre. Máximo {MAX_MEETINGS_PER_USER} reuniones
              por persona durante el evento.
            </p>
          </div>

          <p className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {meetings.length} de {MAX_MEETINGS_PER_USER}
          </p>
        </div>

        {reachedMeetingLimit && (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {MEETING_LIMIT_MESSAGE}
          </p>
        )}

        {meetings.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No tienes reuniones agendadas.{" "}
            <Link href="/directorio" className="underline">
              Explora el directorio
            </Link>{" "}
            para reservar una.
          </p>
        ) : (
          <ul className="space-y-4">
            {meetings.map((meeting) => (
              <li
                key={meeting.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                  Reunión con {meeting.other_participant_name}
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {format(parseISO(meeting.start_time), "PPPp", {
                    locale: es,
                  })}{" "}
                  – {format(parseISO(meeting.end_time), "p", { locale: es })}{" "}
                  (hora local)
                </p>
                <MeetingRoom
                  virtualLink={meeting.virtual_link}
                  displayName={user?.user_metadata?.name as string | undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {user && (
        <section className="mt-12" aria-labelledby="perfil">
          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold tracking-wide text-blue-600 uppercase dark:text-blue-400">
              Paso 3
            </p>
            <h2
              id="perfil"
              className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50"
            >
              Mi perfil público
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Así te ven los demás participantes en el directorio.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <ProfileEditor userId={user.id} />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Guía de bienvenida. Solo se muestra mientras el usuario no tenga ningún
 * bloque de disponibilidad guardado; se puede cerrar y no vuelve hasta la
 * próxima visita (si sigue sin disponibilidad).
 */
function OnboardingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-5 pr-12 dark:border-blue-900 dark:from-blue-950/60 dark:via-zinc-900 dark:to-zinc-900">
      <div
        aria-hidden
        className="absolute -top-12 -right-12 size-40 rounded-full bg-blue-500/10 blur-2xl"
      />

      <div className="relative flex gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <Sparkles size={18} />
        </span>

        <p className="max-w-3xl text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          ¡Hola! Paso 1: Define tu disponibilidad. Pinta los bloques de 30
          minutos que quieras ofrecer. Una vez guardes, tu perfil aparecerá en
          el directorio para que otros te agenden.
        </p>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Ocultar la guía"
        className="absolute top-3 right-3 rounded-full p-1 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}

