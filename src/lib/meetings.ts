/**
 * Reglas de negocio de las reuniones.
 *
 * El límite se define aquí para que la API, el dashboard y la migración
 * `0004_meeting_limit.sql` digan lo mismo. El valor se valida dos veces:
 *
 * - en `POST /api/meetings`, para responder con un error amigable antes de
 *   tocar la base de datos;
 * - dentro de `book_availability`, con un candado de transacción, para que dos
 *   reservas simultáneas no puedan colarse por encima del límite.
 *
 * Si cambias el número, actualízalo también en la migración.
 */
export const MAX_MEETINGS_PER_USER = 3;

export const MEETING_LIMIT_MESSAGE = `Has alcanzado el límite de ${MAX_MEETINGS_PER_USER} reuniones para este evento. ¡Deja espacio para los demás!`;
