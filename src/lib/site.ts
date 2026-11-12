/**
 * Identidad del sitio y datos del evento.
 *
 * La landing, el layout (metadatos) y la tarjeta Open Graph leen de aquí, así
 * que fechas y textos se cambian en un único sitio.
 */

export const SITE_NAME = "Networking Games";
export const ORGANIZER_NAME = "Nivel Mercado";
export const ORGANIZER_URL = "https://nivelmercado.cl";

/**
 * URL pública del sitio, sin barra final.
 *
 * La app vive en un subdominio del sitio principal, así que los metadatos que
 * exigen URL absoluta (`og:image`, `metadataBase`) se construyen desde aquí.
 * Si `NEXT_PUBLIC_SITE_URL` no está definida o no es válida se usa el dominio
 * de producción: nunca conviene que un metadato rompa el build.
 */
export const SITE_URL = resolveSiteUrl();

function resolveSiteUrl() {
  const fallback = "https://networking.nivelmercado.cl";
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!configured) return fallback;

  try {
    return new URL(configured).origin;
  } catch {
    console.warn(
      `NEXT_PUBLIC_SITE_URL no es una URL válida ("${configured}"): se usará ${fallback}.`,
    );
    return fallback;
  }
}

export const EVENT = {
  tagline: "Conecta. Agenda. Juega.",
  datesLabel: "15 – 17 de enero de 2027",
  datesShortLabel: "15 – 17 ene",
  /**
   * Días del evento en formato `yyyy-MM-dd`, en orden. La cuadrícula de
   * disponibilidad pinta una columna por día, así que las fechas se declaran
   * aquí una sola vez.
   */
  days: ["2027-01-15", "2027-01-16", "2027-01-17"],
  description:
    "Tres días para conocer estudios indie y publishers, publicar cuándo estás disponible y agendar reuniones 1 a 1 durante el evento.",
} as const;

/** Título con el que se comparte el enlace en WhatsApp, Discord o X. */
export const SITE_TITLE = `${SITE_NAME} | ${ORGANIZER_NAME}`;
