"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import MeetingRoom from "@/components/MeetingRoom";
import type { AvailabilitySlot, BookingResponse } from "@/types";

interface BookingSectionProps {
  profileId: string;
  profileName: string;
}

/** Un día con huecos publicados, ya listo para pintar. */
interface AvailableDay {
  /** `yyyy-MM-dd`, sirve como identificador del botón. */
  dateKey: string;
  /** "Vie" */
  weekday: string;
  /** "15 Ene" */
  dayMonth: string;
  /** "viernes, 15 de enero de 2027" (para lectores de pantalla). */
  fullLabel: string;
  slots: AvailabilitySlot[];
}

/** date-fns devuelve los nombres en minúscula ("vie"); queremos "Vie". */
function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function slotCountLabel(count: number) {
  return `${count} horario${count === 1 ? "" : "s"}`;
}

/**
 * Sección de reserva del perfil público.
 *
 * Es un Client Component porque necesita estado (día y hora elegidos) y llamar
 * a la API. Muestra solo los días que tienen huecos publicados —una fila de
 * botones que se desliza en pantallas angostas— y, debajo, los bloques de 30
 * minutos del día elegido.
 */
export default function BookingSection({
  profileId,
  profileName,
}: BookingSectionProps) {
  const router = useRouter();

  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    link: string;
    when: string;
  } | null>(null);

  const [reloadToken, setReloadToken] = useState(0);

  // Carga inicial (y reintentos) de la disponibilidad pública del perfil.
  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/availability?userId=${profileId}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudo cargar la disponibilidad.");
        }

        return (await response.json()) as { slots: AvailabilitySlot[] };
      })
      .then((payload) => {
        if (controller.signal.aborted) return;

        setSlots(payload.slots ?? []);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setLoadError(
          error instanceof Error ? error.message : "Error desconocido.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [profileId, reloadToken]);

  const retryLoad = () => {
    setIsLoading(true);
    setLoadError(null);
    setReloadToken((token) => token + 1);
  };

  // Agrupa los huecos por día (ordenados) para los botones de la fila superior.
  const availableDays = useMemo<AvailableDay[]>(() => {
    const slotsByDate = new Map<string, AvailabilitySlot[]>();

    for (const slot of slots) {
      const dateKey = format(parseISO(slot.start_time), "yyyy-MM-dd");
      const daySlots = slotsByDate.get(dateKey);

      if (daySlots) {
        daySlots.push(slot);
      } else {
        slotsByDate.set(dateKey, [slot]);
      }
    }

    return [...slotsByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dateKey, daySlots]) => {
        const date = parseISO(`${dateKey}T00:00:00`);

        return {
          dateKey,
          weekday: capitalize(format(date, "EEE", { locale: es })),
          dayMonth: `${format(date, "d")} ${capitalize(
            format(date, "MMM", { locale: es }),
          )}`,
          fullLabel: format(date, "PPPP", { locale: es }),
          slots: [...daySlots].sort((left, right) =>
            left.start_time.localeCompare(right.start_time),
          ),
        };
      });
  }, [slots]);

  // Día elegido a mano o, por defecto, el primero con disponibilidad. Se deriva
  // del estado (en vez de sincronizarlo en un efecto) para que al recargar o
  // reservar siempre haya un día válido seleccionado.
  const activeDate = selectedDate ?? availableDays[0]?.dateKey ?? null;
  const activeDay =
    availableDays.find((day) => day.dateKey === activeDate) ?? null;

  const handleBook = async (slot: AvailabilitySlot) => {
    setBookingSlotId(slot.id);
    setBookingError(null);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability_id: slot.id }),
      });

      if (response.status === 401) {
        const redirect = encodeURIComponent(`/perfil/${profileId}`);
        router.push(`/login?redirectedFrom=${redirect}`);
        return;
      }

      const payload = (await response.json()) as BookingResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo agendar la reunión.");
      }

      setConfirmation({
        link: payload.virtual_link,
        when: format(parseISO(slot.start_time), "PPPp", { locale: es }),
      });
      setSlots((prev) => prev.filter((item) => item.id !== slot.id));
      setSelectedDate(null);
    } catch (error) {
      setBookingError(
        error instanceof Error ? error.message : "Error desconocido.",
      );
    } finally {
      setBookingSlotId(null);
    }
  };

  if (confirmation) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
        <h3 className="font-semibold text-green-900 dark:text-green-100">
          ¡Reunión agendada!
        </h3>
        <p className="mt-1 text-sm text-green-800 dark:text-green-200">
          Con {profileName}: {confirmation.when} (hora local).
        </p>
        <MeetingRoom virtualLink={confirmation.link} />
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-3 block text-sm text-green-800 underline dark:text-green-200"
        >
          Ver mis reuniones en el dashboard
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Cargando disponibilidad...
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={retryLoad}
          className="mt-2 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {profileName} todavía no ha publicado horarios disponibles.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Solo los días con huecos. En pantallas angostas la fila se desliza. */}
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {availableDays.map((day) => {
            const isActive = day.dateKey === activeDate;

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setSelectedDate(day.dateKey)}
                aria-pressed={isActive}
                aria-label={`${day.fullLabel}, ${slotCountLabel(day.slots.length)}`}
                className={`min-w-[5.25rem] shrink-0 snap-start rounded-lg border px-3 py-2 text-center transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                  isActive
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-zinc-200 bg-zinc-100 text-zinc-800 hover:border-zinc-300 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
                }`}
              >
                <span
                  className={`block text-[11px] font-semibold tracking-wide uppercase ${
                    isActive
                      ? "text-blue-100"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {day.weekday}
                </span>
                <span className="mt-0.5 block text-sm font-semibold whitespace-nowrap">
                  {day.dayMonth}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] whitespace-nowrap ${
                    isActive
                      ? "text-blue-100"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {slotCountLabel(day.slots.length)}
                </span>
              </button>
            );
          })}
        </div>

        {activeDay && (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {activeDay.fullLabel}
            </h3>
            <p className="mt-0.5 mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Bloques de 30 minutos · elige una hora
            </p>

            <ul className="grid grid-cols-3 gap-2">
              {activeDay.slots.map((slot) => {
                const start = parseISO(slot.start_time);
                const end = parseISO(slot.end_time);
                const isBooking = bookingSlotId === slot.id;

                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      onClick={() => void handleBook(slot)}
                      disabled={bookingSlotId !== null}
                      aria-label={`Reservar el ${format(
                        start,
                        "PPPP 'a las' HH:mm",
                        { locale: es },
                      )}`}
                      className="w-full rounded-md border border-blue-600 px-1 py-2 text-center transition-colors hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:hover:bg-blue-950"
                    >
                      <span className="block text-[13px] font-semibold text-blue-700 sm:text-sm dark:text-blue-300">
                        {format(start, "HH:mm")}
                      </span>
                      <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {isBooking ? "Reservando" : `a ${format(end, "HH:mm")}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Horas en tu zona horaria local.
            </p>
          </div>
        )}
      </div>

      {bookingError && (
        <p className="text-sm text-red-600 dark:text-red-400">{bookingError}</p>
      )}
    </div>
  );
}
