/**
 * Tipos de dominio de Networking Games.
 *
 * TODO: cuando el esquema esté estable, generar los tipos completos con
 * `supabase gen types typescript --project-id <id> > src/lib/database.types.ts`
 * y usar `createClient<Database>()` en lugar de estos tipos manuales.
 */

export type ProfileType = "indie" | "publisher";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface Profile {
  id: string;
  name: string;
  type: ProfileType;
  description: string;
  long_description: string | null;
  image_url: string | null;
  website_url: string | null;
  social_links: SocialLink[];
}

export interface AvailabilitySlot {
  id: string;
  start_time: string;
  end_time: string;
  is_booked?: boolean;
}

/** Respuesta de `PUT /api/availability` (sincronización de la cuadrícula). */
export interface AvailabilitySyncResponse {
  /** Bloques nuevos que se han insertado. */
  inserted: number;
  /** Bloques que se han borrado porque ya no estaban pintados. */
  deleted: number;
}

export interface Meeting {
  id: string;
  start_time: string;
  end_time: string;
  virtual_link: string;
  participant1_id: string;
  participant2_id: string;
}

/** Respuesta de `POST /api/meetings`. */
export interface BookingResponse {
  id: string;
  virtual_link: string;
  message?: string;
}

/** Respuesta de `POST /api/jitsi-token` (JaaS). */
export interface JitsiTokenResponse {
  token: string;
  appId: string;
  roomName: string;
  /** Segundos desde epoch en los que caduca el JWT. */
  expiresAt: number;
  /** `true` si el usuario es el dueño del hueco reservado. */
  moderator: boolean;
}

export interface AccessCode {
  id: string;
  code: string;
  /** Anotación del organizador (empresa/persona). No se usa para validar. */
  assigned_to: string | null;
  is_used: boolean;
  created_at: string;
  used_at: string | null;
}

/** Cuerpo de `POST /api/auth/register-with-code`. */
export interface RegisterWithCodePayload {
  name: string;
  email: string;
  password: string;
  type: ProfileType;
  code: string;
}

/** Sesión que devuelve `POST /api/auth/register-with-code`. */
export interface AuthSessionPayload {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
}

/** Respuesta de `POST /api/auth/register-with-code`. */
export interface RegisterWithCodeResponse {
  user?: {
    id: string;
    email: string;
    name: string;
    type: ProfileType;
  };
  /** `null` si la cuenta se creó pero no se pudo iniciar sesión. */
  session?: AuthSessionPayload | null;
  error?: string;
  /** Motivo del rechazo, para que /login muestre el mensaje adecuado. */
  reason?:
    | "invalid_input"
    | "invalid_code"
    | "code_used"
    | "email_taken"
    | "unavailable"
    | "server_error";
}

