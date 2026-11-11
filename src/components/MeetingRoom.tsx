"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { getJitsiAppId, getRoomNameFromLink } from "@/lib/jitsi";
import type { JitsiTokenResponse } from "@/types";

/**
 * El SDK de JaaS inyecta `external_api.js` en el navegador, así que solo puede
 * cargarse en cliente: con `ssr: false` evitamos romper el render del servidor.
 */
const JaaSMeeting = dynamic(
  () => import("@jitsi/react-sdk").then((mod) => mod.JaaSMeeting),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        Cargando la videollamada...
      </div>
    ),
  },
);

/** Alto del iframe de la videollamada. */
const MEETING_HEIGHT_PX = 600;

/** Ajustes de la sala pensados para reuniones 1:1 de networking. */
const MEETING_CONFIG = {
  // Entramos directamente: el nombre ya viene en el JWT.
  prejoinPageEnabled: false,
  prejoinConfig: { enabled: false },
  // Entrar con el micro cerrado es lo más cómodo en un evento.
  startWithAudioMuted: true,
  startWithVideoMuted: false,
  // Evita que iOS/Android abran la app nativa en lugar del iframe.
  disableDeepLinking: true,
};

interface MeetingRoomProps {
  /** Enlace guardado en `meetings.virtual_link`; identifica la sala. */
  virtualLink: string;
  /** Nombre a mostrar en la llamada. Si falta, el servidor usa el del perfil. */
  displayName?: string;
}

type Status = "idle" | "requesting" | "connected";

/**
 * Videollamada integrada con JaaS (Jitsi as a Service).
 *
 * Antes de montar el iframe pide un JWT a `POST /api/jitsi-token`; así el
 * secreto de JaaS nunca sale del servidor y la sala queda autenticada.
 */
export default function MeetingRoom({
  virtualLink,
  displayName,
}: MeetingRoomProps) {
  const appId = getJitsiAppId();
  const roomName = getRoomNameFromLink(virtualLink);

  const [status, setStatus] = useState<Status>("idle");
  const [session, setSession] = useState<JitsiTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setIframeParent = useCallback((parentNode: HTMLDivElement) => {
    parentNode.style.height = `${MEETING_HEIGHT_PX}px`;
    parentNode.style.width = "100%";
  }, []);

  const join = async () => {
    setStatus("requesting");
    setError(null);

    try {
      const response = await fetch("/api/jitsi-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, userName: displayName }),
        cache: "no-store",
      });

      const payload = (await response.json()) as JitsiTokenResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "No se pudo obtener el acceso a la videollamada.",
        );
      }

      setSession(payload);
      setStatus("connected");
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Error desconocido.",
      );
      setStatus("idle");
    }
  };

  const leave = () => {
    setSession(null);
    setStatus("idle");
  };

  // Sin App ID no hay JaaS: dejamos el enlace externo como plan B para que la
  // app siga siendo usable mientras se configuran las credenciales.
  if (!appId) {
    return (
      <div className="mt-2 text-sm">
        <p className="text-amber-700 dark:text-amber-300">
          La videollamada integrada no está configurada: falta{" "}
          <code>NEXT_PUBLIC_JITSI_APP_ID</code> en <code>.env.local</code>.
        </p>
        <a
          href={virtualLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-blue-600 hover:underline dark:text-blue-400"
        >
          Abrir la sala en una pestaña nueva
        </a>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {status === "connected" && session ? (
        <>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-black dark:border-zinc-800">
            <JaaSMeeting
              appId={session.appId}
              roomName={session.roomName}
              jwt={session.token}
              lang="es"
              configOverwrite={MEETING_CONFIG}
              getIFrameRef={setIframeParent}
              onReadyToClose={leave}
            />
          </div>

          <button
            type="button"
            onClick={leave}
            className="mt-2 text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Cerrar la videollamada
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void join()}
          disabled={status === "requesting"}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "requesting"
            ? "Preparando la videollamada..."
            : "Entrar a la videollamada"}
        </button>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
