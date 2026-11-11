/**
 * Firma de los JWT de JaaS. Solo se importa desde el servidor: maneja el
 * secreto del tenant y nunca debe acabar en un bundle de cliente.
 */
import jwt from "jsonwebtoken";

/** Los tokens de JaaS caducan; 2 h cubre de sobra una reunión de networking. */
const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

/** Margen para tolerar relojes ligeramente desincronizados. */
const CLOCK_SKEW_SECONDS = 10;

export interface JitsiTokenUser {
  /** `auth.users.id`: identifica al participante en la reunión. */
  id: string;
  name: string;
  email?: string;
  moderator: boolean;
}

export interface CreateJitsiTokenOptions {
  appId: string;
  /** Clave HMAC del tenant o clave privada PEM de la API key. */
  appSecret: string;
  /** `kid` del header: ID de la API key de JaaS. Por defecto, el App ID. */
  kid?: string;
  roomName: string;
  user: JitsiTokenUser;
  ttlSeconds?: number;
}

export interface CreatedJitsiToken {
  token: string;
  /** Segundos desde epoch. */
  expiresAt: number;
  algorithm: "HS256" | "RS256";
}

/**
 * Construye y firma el JWT con la estructura estándar de JaaS:
 * `aud`, `iss`, `sub`, `room` y `context.user`, más las features desactivadas
 * que no usamos en reuniones 1:1.
 */
export function createJitsiToken({
  appId,
  appSecret,
  kid,
  roomName,
  user,
  ttlSeconds = DEFAULT_TTL_SECONDS,
}: CreateJitsiTokenOptions): CreatedJitsiToken {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;

  const payload = {
    aud: "jitsi",
    iss: "chat",
    sub: appId,
    room: roomName,
    nbf: now - CLOCK_SKEW_SECONDS,
    iat: now,
    exp: expiresAt,
    context: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        moderator: user.moderator,
      },
      features: {
        livestreaming: false,
        "outbound-call": false,
        transcription: false,
        recording: false,
        "file-upload": false,
      },
      room: { regex: false },
    },
  };

  // La clave HMAC del tenant se firma con HS256; una clave privada PEM
  // (API key asimétrica de JaaS) con RS256.
  const algorithm = appSecret.includes("-----BEGIN") ? "RS256" : "HS256";

  const token = jwt.sign(payload, appSecret, {
    algorithm,
    keyid: kid?.trim() || appId,
  });

  return { token, expiresAt, algorithm };
}
