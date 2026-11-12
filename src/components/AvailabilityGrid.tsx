"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  EVENT_DAYS,
  GRID_TIMES,
  SLOT_MINUTES,
  blockCountLabel,
  durationLabel,
  gridKeyFromStart,
  gridKeyOf,
  slotKey,
  slotRange,
} from "@/lib/availability-grid";
import type { AvailabilitySlot, AvailabilitySyncResponse } from "@/types";

interface AvailabilityGridProps {
  /** Huecos guardados del usuario. Se incluyen los reservados (aparecen bloqueados). */
  slots: AvailabilitySlot[];
  /** Se llama después de guardar o borrar: el padre recarga sus datos. */
  onSaved?: () => void | Promise<void>;
}

type DragMode = "add" | "remove";

/** Etiquetas de las columnas, calculadas una vez (las fechas del evento son fijas). */
const DAY_COLUMNS = EVENT_DAYS.map((day) => {
  const date = parseISO(`${day}T12:00:00`);

  return {
    day,
    short: format(date, "EEE d", { locale: es }),
    long: format(date, "EEEE d 'de' MMMM", { locale: es }),
  };
});

/**
 * Cuadrícula de disponibilidad del evento.
 *
 * Pinta bloques de 30 minutos (09:00–18:00) en las tres columnas del evento y
 * deja que el usuario los active arrastrando el ratón: `onMouseDown` decide si
 * el gesto suma o quita (según el estado del primer bloque tocado) y
 * `onMouseEnter` repite esa acción en cada celda por la que pasa. El gesto
 * termina con `onMouseUp`; además se escucha `mouseup` en `window` para que
 * soltar el botón fuera de la cuadrícula no deje el arrastre activo.
 *
 * Al guardar se envía a `PUT /api/availability` el conjunto completo de bloques
 * pintados: el servidor inserta los nuevos y borra los que ya no están. Los
 * huecos reservados nunca se envían ni se borran.
 */
export default function AvailabilityGrid({
  slots,
  onSaved,
}: AvailabilityGridProps) {
  /** Bloques que ya están guardados y encajan en la cuadrícula. */
  const savedKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const slot of slots) {
      if (slot.is_booked) continue;

      const key = gridKeyFromStart(slot.start_time);
      if (key) keys.add(key);
    }

    return keys;
  }, [slots]);

  // La selección arranca de lo que hay en la base de datos. El dashboard solo
  // monta la cuadrícula cuando ya ha cargado los huecos, así que en el primer
  // render `slots` ya trae el estado real; a partir de ahí manda lo que pinte
  // el usuario (y al guardar el padre recarga, dejando `savedKeys` al día).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(savedKeys),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // En un ref y no en el estado: `onMouseEnter` se dispara antes de que React
  // vuelva a renderizar, así que el modo debe leerse siempre actualizado.
  const dragMode = useRef<DragMode | null>(null);

  /** Intervalos ya reservados: cualquier bloque que los solape queda bloqueado. */
  const bookedIntervals = useMemo(
    () =>
      slots
        .filter((slot) => slot.is_booked)
        .map((slot) => ({
          start: parseISO(slot.start_time).getTime(),
          end: parseISO(slot.end_time).getTime(),
        }))
        .filter(
          (interval) =>
            Number.isFinite(interval.start) && Number.isFinite(interval.end),
        ),
    [slots],
  );

  /** Huecos que no caben en la cuadrícula (duraciones u horarios antiguos). */
  const offGridSlots = useMemo(
    () => slots.filter((slot) => gridKeyOf(slot) === null),
    [slots],
  );

  const isLocked = useCallback(
    (day: string, time: string) => {
      const { start, end } = slotRange(day, time);

      return bookedIntervals.some(
        (interval) =>
          start.getTime() < interval.end && end.getTime() > interval.start,
      );
    },
    [bookedIntervals],
  );

  const paintCell = useCallback((key: string, mode: DragMode) => {
    setSelected((previous) => {
      const has = previous.has(key);

      if (mode === "add" ? has : !has) return previous;

      const next = new Set(previous);

      if (mode === "add") next.add(key);
      else next.delete(key);

      return next;
    });
  }, []);

  const endDrag = useCallback(() => {
    dragMode.current = null;
  }, []);

  // Soltar el botón fuera de la cuadrícula (o perder el foco) cierra el gesto.
  useEffect(() => {
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("blur", endDrag);

    return () => {
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("blur", endDrag);
      endDrag();
    };
  }, [endDrag]);

  const handleMouseDown = (
    event: MouseEvent<HTMLDivElement>,
    key: string,
    locked: boolean,
  ) => {
    if (locked || isSaving || event.button !== 0) return;

    // Evita que el navegador seleccione texto mientras se arrastra.
    event.preventDefault();

    const mode: DragMode = selected.has(key) ? "remove" : "add";

    dragMode.current = mode;
    paintCell(key, mode);
  };

  const handleMouseEnter = (key: string, locked: boolean) => {
    if (locked || isSaving) return;

    const mode = dragMode.current;

    if (mode) paintCell(key, mode);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    key: string,
    locked: boolean,
  ) => {
    if (locked) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    // Espacio en un div con role="button" haría scroll si no se cancela.
    event.preventDefault();
    paintCell(key, selected.has(key) ? "remove" : "add");
  };

  /** ¿Hay cambios sin guardar respecto a lo que ya está en la base de datos? */
  const hasChanges = useMemo(() => {
    if (selected.size !== savedKeys.size) return true;

    for (const key of selected) {
      if (!savedKeys.has(key)) return true;
    }

    return false;
  }, [savedKeys, selected]);

  const discardChanges = () => {
    setSelected(new Set(savedKeys));
    setError(null);
    setNotice(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setNotice(null);

    // Solo los bloques pintados: el servidor recibe el estado final completo.
    const desiredSlots = EVENT_DAYS.flatMap((day) =>
      GRID_TIMES.filter((time) => selected.has(slotKey(day, time))).map(
        (time) => {
          const { start, end } = slotRange(day, time);

          return {
            start_time: start.toISOString(),
            end_time: end.toISOString(),
          };
        },
      ),
    );

    try {
      const response = await fetch("/api/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: desiredSlots }),
      });

      const payload = (await response.json()) as AvailabilitySyncResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo guardar tu disponibilidad.");
      }

      setNotice(
        payload.inserted === 0 && payload.deleted === 0
          ? "Tu disponibilidad ya estaba al día."
          : `Guardado: ${payload.inserted} nuevo(s) y ${payload.deleted} eliminado(s).`,
      );

      await onSaved?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Error desconocido.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  /** Borra un hueco antiguo que no encaja en la cuadrícula. */
  const handleDeleteSlot = async (slotId: string) => {
    setDeletingId(slotId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/availability?id=${slotId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo borrar el hueco.");
      }

      await onSaved?.();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Error desconocido.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const cellClass = (active: boolean, locked: boolean) => {
    if (locked) {
      return "cursor-not-allowed border-emerald-600 bg-emerald-500";
    }

    if (active) {
      return "cursor-pointer border-blue-500 bg-blue-600 hover:bg-blue-500";
    }

    return "cursor-pointer border-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700";
  };

  const selectedMinutes = selected.size * SLOT_MINUTES;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Arrastra el ratón para pintar los bloques que quieras ofrecer.
        </p>

        <ul className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            Libre
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-blue-500 bg-blue-600" />
            Tu hueco
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-emerald-600 bg-emerald-500" />
            Reservado
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          className="grid min-w-[24rem] select-none grid-cols-[3.25rem_repeat(3,minmax(0,1fr))] gap-1"
          onMouseUp={endDrag}
        >
          <div aria-hidden />

          {DAY_COLUMNS.map((column) => (
            <div key={column.day} className="pb-1 text-center">
              <span className="block text-sm font-semibold text-zinc-950 capitalize dark:text-zinc-50">
                {column.short}
              </span>
            </div>
          ))}

          {GRID_TIMES.map((time) => (
            <Fragment key={time}>
              <div className="pr-2 text-right text-[11px] leading-6 tabular-nums text-zinc-500 dark:text-zinc-400">
                {time}
              </div>

              {DAY_COLUMNS.map((column) => {
                const key = slotKey(column.day, time);
                const locked = isLocked(column.day, time);
                const active = selected.has(key);
                const state = locked
                  ? "reservado"
                  : active
                    ? "disponible"
                    : "libre";

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={locked ? -1 : 0}
                    aria-pressed={locked || active}
                    aria-disabled={locked || undefined}
                    aria-label={`${column.long}, ${time}: ${state}`}
                    title={`${column.short} · ${time} · ${state}`}
                    onMouseDown={(event) => handleMouseDown(event, key, locked)}
                    onMouseEnter={() => handleMouseEnter(key, locked)}
                    onKeyDown={(event) => handleKeyDown(event, key, locked)}
                    className={`h-6 rounded-[3px] border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${cellClass(
                      active,
                      locked,
                    )}`}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-950 dark:text-zinc-50">
            {blockCountLabel(selected.size)}
          </span>{" "}
          ({durationLabel(selectedMinutes)} seleccionados)
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={discardChanges}
              disabled={isSaving}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Descartar cambios
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !hasChanges}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Guardando..." : "Guardar disponibilidad"}
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {offGridSlots.length > 0 && (
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Huecos fuera de la cuadrícula
          </h4>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Los creaste con la vista anterior (otra duración u horario). La
            cuadrícula solo gestiona bloques de 30 minutos entre las 09:00 y las
            18:00; estos puedes borrarlos aquí.
          </p>

          <ul className="mt-2 space-y-1.5">
            {offGridSlots.map((slot) => (
              <li
                key={slot.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-800"
              >
                <span className="text-zinc-700 dark:text-zinc-300">
                  {format(parseISO(slot.start_time), "PPPp", { locale: es })}
                  {slot.is_booked && (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                      Reservado
                    </span>
                  )}
                </span>

                {!slot.is_booked && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteSlot(slot.id)}
                    disabled={deletingId === slot.id}
                    className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    {deletingId === slot.id ? "Borrando..." : "Borrar"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
