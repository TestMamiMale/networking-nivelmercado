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

/**
 * Fila de `public.invitations`. Solo se gestiona desde el SQL Editor: RLS no
 * expone la tabla a los clientes.
 */
export interface Invitation {
  id: string;
  email: string;
  code: string;
  is_used: boolean;
  created_at: string;
  used_at: string | null;
}

/** Respuesta de `POST /api/invitations/verify`. */
export interface InvitationVerifyResponse {
  allowed: boolean;
  /** Motivo del rechazo (para mostrar un mensaje distinto en /login). */
  reason?: "invalid_email" | "not_found" | "already_used";
  error?: string;
}

