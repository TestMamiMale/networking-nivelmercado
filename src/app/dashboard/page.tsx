"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import BookingCalendar from "@/components/BookingCalendar";
import MeetingRoom from "@/components/MeetingRoom";
import ProfileEditor from "@/components/ProfileEditor";
import { createClient } from "@/lib/supabase";
import type { AvailabilitySlot } from "@/types";

interface MeetingSummary {
  id: string;
  start_time: string;
  end_time: string;
  virtual_link: string;
  other_participant_name: string;
}

const DURATION_OPTIONS = [15, 30, 45, 60];

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gestión de disponibilidad
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  const mappedAvailabilitySlots = useMemo(
    () =>
      availability.reduce<Record<string, string[]>>((acc, slot) => {
        const dateKey = format(parseISO(slot.start_time), "yyyy-MM-dd");
        (acc[dateKey] ??= []).push(format(parseISO(slot.start_time), "HH:mm"));
        return acc;
      }, {}),
    [availability],
  );

  const handleSelectDateForAvailability = (date: Date) => {
    setSelectedDay(format(date, "yyyy-MM-dd"));
    setNotice(null);
  };

  const publishSlot = async () => {
    if (!selectedDay) return;

    const start = new Date(`${selectedDay}T${startTime}:00`);

    if (Number.isNaN(start.getTime())) {
      setNotice("La hora indicada no es válida.");
      return;
    }

    const end = new Date(start.getTime() + durationMinutes * 60_000);

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: [
            { start_time: start.toISOString(), end_time: end.toISOString() },
          ],
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo publicar el hueco.");
      }

      setNotice(`Hueco publicado: ${format(start, "PPPp", { locale: es })}`);
      await loadData();
    } catch (publishError) {
      setNotice(
        publishError instanceof Error
          ? publishError.message
          : "Error desconocido.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSlot = async (slotId: string) => {
    setNotice(null);

    try {
      const response = await fetch(`/api/availability?id=${slotId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo borrar el hueco.");
      }

      await loadData();
    } catch (deleteError) {
      setNotice(
        deleteError instanceof Error
          ? deleteError.message
          : "Error desconocido.",
      );
    }
  };

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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Mis Reuniones
          </h2>

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

        <section>
          <h2 className="mb-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Definir mi Disponibilidad
          </h2>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            Haz clic en un día y publica los huecos que quieras ofrecer.
          </p>

          <BookingCalendar
            onSelectDate={handleSelectDateForAvailability}
            availableSlots={mappedAvailabilitySlots}
            allowEmptySelection
            allowWeekends
            selectedDate={selectedDay}
          />

          {selectedDay && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {format(parseISO(`${selectedDay}T00:00:00`), "PPPP", {
                  locale: es,
                })}
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label
                    htmlFor="start-time"
                    className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Hora de inicio
                  </label>
                  <input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="mt-1 rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="duration"
                    className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Duración
                  </label>
                  <select
                    id="duration"
                    value={durationMinutes}
                    onChange={(event) =>
                      setDurationMinutes(Number(event.target.value))
                    }
                    className="mt-1 rounded-md border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  >
                    {DURATION_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => void publishSlot()}
                  disabled={isSaving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Publicando..." : "Publicar hueco"}
                </button>
              </div>

              {notice && (
                <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                  {notice}
                </p>
              )}
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Huecos publicados
            </h3>

            {availability.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Todavía no has publicado nada. Sin huecos, nadie podrá reservar
                contigo.
              </p>
            ) : (
              <ul className="space-y-2">
                {availability.map((slot) => (
                  <li
                    key={slot.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {format(parseISO(slot.start_time), "PPPp", { locale: es })}
                      {slot.is_booked && (
                        <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                          Reservado
                        </span>
                      )}
                    </span>

                    {!slot.is_booked && (
                      <button
                        type="button"
                        onClick={() => void deleteSlot(slot.id)}
                        className="text-red-600 hover:underline dark:text-red-400"
                      >
                        Borrar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {user && (
        <section className="mt-12">
          <h2 className="mb-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Mi perfil público
          </h2>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Así te ven los demás participantes en el directorio.
          </p>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <ProfileEditor userId={user.id} />
          </div>
        </section>
      )}
    </div>
  );
}
