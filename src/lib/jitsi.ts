/**
 * Utilidades de JaaS (Jitsi as a Service) compartidas por cliente y servidor.
 *
 * Este módulo no toca secretos: solo lee el App ID público del tenant.
 */

/** Dominio del Jitsi público; se usa como identificador si no hay JaaS. */
export const DEFAULT_JITSI_DOMAIN = "meet.jit.si";

/** Prefijo de las salas que crea la app. */
export const ROOM_NAME_PREFIX = "NetworkingGames";

/**
 * Nombres de sala válidos: sin espacios, barras ni acentos, para que quepan en
 * la URL y en el claim `room` del JWT sin escapes raros.
 */
const ROOM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

/** App ID del tenant de JaaS, o `null` si aún no se ha configurado. */
export function getJitsiAppId(): string | null {
  const appId = process.env.NEXT_PUBLIC_JITSI_APP_ID?.trim();
  return appId ? appId : null;
}

/**
 * `meetings.virtual_link` guarda la URL completa de la sala
 * (`https://meet.jit.si/NetworkingGames-<uuid>`), que es el identificador
 * estable de la reunión en la base de datos. El SDK de JaaS, en cambio, espera
 * solo el nombre de la sala, así que lo extraemos del último segmento.
 *
 * Acepta tanto una URL (`https://8x8.vc/<appId>/<sala>`) como un nombre de sala
 * ya limpio, y devuelve siempre lo mismo para un mismo enlace.
 */
export function getRoomNameFromLink(link: string): string {
  const trimmed = link.trim();

  try {
    const segments = new URL(trimmed).pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];

    if (last) return last;
  } catch {
    // No es una URL absoluta: asumimos que ya es el nombre de la sala.
  }

  return trimmed;
}

export function isValidRoomName(name: string): boolean {
  return ROOM_NAME_RE.test(name);
}

/**
 * Enlace que se guarda en `meetings.virtual_link`.
 *
 * Es el identificador estable de la sala: de ahí sale el `roomName` que se le
 * pasa a JaaS, sin tener que migrar la base de datos al activar JaaS.
 */
export function buildMeetingLink(): string {
  return `https://${DEFAULT_JITSI_DOMAIN}/${ROOM_NAME_PREFIX}-${crypto.randomUUID()}`;
}
