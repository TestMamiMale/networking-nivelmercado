/**
 * Geometría de la cuadrícula de disponibilidad.
 *
 * El evento se reparte en bloques de 30 minutos: la cuadrícula del dashboard y
 * la sincronización con Supabase (`PUT /api/availability`) tienen que hablar
 * exactamente el mismo idioma, así que las constantes y las conversiones viven
 * aquí y no dentro del componente.
 *
 * Un "bloque" se identifica con una clave local `yyyy-MM-ddTHH:mm`
 * (p. ej. `2027-01-15T09:30`): es la hora que el usuario ve en su navegador.
 * Los `Date` se construyen sin zona explícita, de modo que se interpretan en la
 * hora local de quien los crea, igual que hacía el formulario anterior.
 */

import { format, parseISO } from "date-fns";
import { EVENT } from "@/lib/site";

/** Duración de cada bloque, en minutos. */
export const SLOT_MINUTES = 30;

/** Primera hora del evento (incluida) y hora de cierre (excluida). */
export const FIRST_HOUR = 9;
export const LAST_HOUR = 18;

/** Días del evento (`yyyy-MM-dd`), en orden. */
export const EVENT_DAYS: readonly string[] = EVENT.days;

function buildTimes(): string[] {
  const times: string[] = [];

  for (
    let minutes = FIRST_HOUR * 60;
    minutes < LAST_HOUR * 60;
    minutes += SLOT_MINUTES
  ) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const rest = String(minutes % 60).padStart(2, "0");
    times.push(`${hours}:${rest}`);
  }

  return times;
}

/** Horas de inicio de cada fila: 09:00, 09:30 … 17:30. */
export const GRID_TIMES: readonly string[] = buildTimes();

/** Clave de un bloque a partir del día y la hora. */
export function slotKey(day: string, time: string): string {
  return `${day}T${time}`;
}

/** Rango real (en hora local) que cubre un bloque. */
export function slotRange(day: string, time: string): { start: Date; end: Date } {
  const start = parseISO(`${slotKey(day, time)}:00`);

  return {
    start,
    end: new Date(start.getTime() + SLOT_MINUTES * 60_000),
  };
}

/** `true` si la clave corresponde a una celda de la cuadrícula. */
export function isGridKey(key: string): boolean {
  const [day, time] = key.split("T");

  return EVENT_DAYS.includes(day) && GRID_TIMES.includes(time);
}

/**
 * Clave de cuadrícula de una hora de inicio, sin mirar la duración.
 *
 * Sirve para pintar como "activa" una celda cuyo hueco guardado empieza en esa
 * fila aunque sea más largo (por ejemplo, uno de 60 min de la vista anterior).
 */
export function gridKeyFromStart(startTime: string): string | null {
  const start = parseISO(startTime);

  if (Number.isNaN(start.getTime())) return null;

  const key = format(start, "yyyy-MM-dd'T'HH:mm");

  return isGridKey(key) ? key : null;
}

/**
 * Clave de cuadrícula de un hueco guardado, o `null` si no encaja.
 *
 * Se exigen bloques de 30 min que caigan en un día del evento y en una fila de
 * la cuadrícula; los huecos antiguos (45 o 60 min, otros horarios) quedan fuera
 * y el componente los lista aparte para poder borrarlos.
 */
export function gridKeyOf(slot: {
  start_time: string;
  end_time: string;
}): string | null {
  const start = parseISO(slot.start_time);
  const end = parseISO(slot.end_time);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() - start.getTime() !== SLOT_MINUTES * 60_000) return null;

  return gridKeyFromStart(slot.start_time);
}

/** "1 bloque" / "4 bloques". */
export function blockCountLabel(count: number): string {
  return count === 1 ? "1 bloque" : `${count} bloques`;
}

/** "30 min", "1 h", "1 h 30 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
