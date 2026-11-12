import { ImageResponse } from "next/og";
import { EVENT, ORGANIZER_NAME, SITE_NAME, SITE_URL } from "@/lib/site";

export const alt = `${SITE_NAME} · ${EVENT.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HOST = SITE_URL.replace(/^https?:\/\//, "");

/**
 * Tarjeta que se ve al compartir el enlace en WhatsApp, Discord o X.
 *
 * Se genera en el build con `ImageResponse` (satori), así que no hay que subir
 * ningún PNG al repositorio ni depender de un placeholder externo.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: "#09090b",
          backgroundImage:
            "radial-gradient(circle at 12% 0%, rgba(37,99,235,0.45), transparent 55%), radial-gradient(circle at 92% 100%, rgba(192,38,211,0.35), transparent 55%)",
          color: "#fafafa",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 26,
            color: "#a1a1aa",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                backgroundColor: "#34d399",
              }}
            />
            <span>Evento de networking</span>
          </div>
          <span style={{ color: "#71717a" }}>{HOST}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 8,
              textTransform: "uppercase",
              color: "#60a5fa",
            }}
          >
            {EVENT.datesLabel}
          </div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 700 }}>
            {SITE_NAME}
          </div>
          <div style={{ display: "flex", fontSize: 52, color: "#d4d4d8" }}>
            {EVENT.tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 26,
            color: "#a1a1aa",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: 28,
          }}
        >
          <span>Un evento organizado por {ORGANIZER_NAME}</span>
          <span style={{ color: "#fafafa" }}>Acceso con código de invitación</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
