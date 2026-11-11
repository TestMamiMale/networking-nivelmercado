"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import BookingCalendar from "@/components/BookingCalendar";
import MeetingRoom from "@/components/MeetingRoom";
import type { AvailabilitySlot, BookingResponse } from "@/types";

interface BookingSectionProps {
  profileId: string;
  profileName: string;
}

/**
 * Sección de reserva del perfil público.
 *
 * Es un Client Component porque necesita estado (día y hora elegidos) y llamar
 * a la API. Antes esta lógica vivía en la página de servidor y le pasaba una
 * función a BookingCalendar, algo que React no permite entre Server y Client
 * Components.
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

  // { "YYYY-MM-DD": ["HH:mm", ...] } para pintar el calendario.
  const availableSlots = useMemo(
    () =>
      slots.reduce<Record<string, string[]>>((acc, slot) => {
        const dateKey = format(parseISO(slot.start_time), "yyyy-MM-dd");
        (acc[dateKey] ??= []).push(format(parseISO(slot.start_time), "HH:mm"));
        return acc;
      }, {}),
    [slots],
  );

  const daySlots = useMemo(() => {
    if (!selectedDate) return [];
    return slots.filter(
      (slot) => format(parseISO(slot.start_time), "yyyy-MM-dd") === selectedDate,
    );
  }, [selectedDate, slots]);

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
      <BookingCalendar
        onSelectDate={(date) => setSelectedDate(format(date, "yyyy-MM-dd"))}
        availableSlots={availableSlots}
      />

      {selectedDate && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {format(parseISO(`${selectedDate}T00:00:00`), "PPPP", {
              locale: es,
            })}
          </h3>

          {daySlots.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No quedan horas libres ese día.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {daySlots.map((slot) => (
                <li key={slot.id}>
                  <button
                    type="button"
                    onClick={() => void handleBook(slot)}
                    disabled={bookingSlotId !== null}
                    className="rounded-md border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
                  >
                    {bookingSlotId === slot.id
                      ? "Reservando..."
                      : `${format(parseISO(slot.start_time), "HH:mm")} – ${format(
                          parseISO(slot.end_time),
                          "HH:mm",
                        )}`}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Horas en tu zona horaria local.
          </p>
        </div>
      )}

      {bookingError && (
        <p className="text-sm text-red-600 dark:text-red-400">{bookingError}</p>
      )}
    </div>
  );
}
