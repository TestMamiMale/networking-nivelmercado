# Networking Games

Directorio y agenda de reuniones para eventos de networking entre estudios indie
y publishers. Next.js 16 (App Router, `cacheComponents`) + Supabase (Postgres,
Auth y RLS).

## Puesta en marcha

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Crea el fichero de entorno y rellena los valores de tu proyecto de Supabase
   (Settings → API) y, si vas a usar videollamadas, los de JaaS (ver
   [Videollamadas (JaaS)](#videollamadas-jaas)):

   ```bash
   cp .env.example .env.local
   ```

3. Aplica el esquema en la base de datos. Con la CLI de Supabase:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

   O pega en el SQL Editor, **en este orden**, el contenido de:

   1. `supabase/migrations/0001_init.sql` (tablas, funciones y RLS).
   2. `supabase/migrations/0002_invitations.sql` (acceso por invitación y
      `profiles` solo para usuarios autenticados).

4. Invita a la gente que va a asistir (ver
   [Invitaciones](#invitaciones-acceso-por-invitación)).

5. Arranca el servidor de desarrollo:

   ```bash
   npm run dev
   ```

## Flujo de uso

1. **Registro** en `/login` → solo con un correo invitado (ver
   [Invitaciones](#invitaciones-acceso-por-invitación)); Supabase envía el correo
   de confirmación y el enlace vuelve por `/auth/callback` (intercambio PKCE).
2. **Dashboard** (`/dashboard`): edita tu perfil público, publica huecos con el
   calendario y consulta tus huecos y reuniones. El proxy exige sesión en todas
   las rutas de la app.
3. **Directorio** (`/directorio`): perfiles de los asistentes con buscador y
   filtro por tipo (`indie` / `publisher`). Requiere sesión: RLS no expone
   `profiles` a la clave anónima.
4. **Perfil** (`/perfil/[slug]`): ficha + calendario para reservar un hueco
   libre. Al confirmar la reserva se puede entrar directamente a la
   videollamada integrada (JaaS); en el dashboard, cada reunión tiene su propio
   botón **Entrar a la videollamada**.

## Invitaciones (acceso por invitación)

La app es cerrada: el proxy exige sesión en **todas** las rutas salvo `/login`,
`/auth/*` y `/api/*`, y RLS solo deja leer `profiles` a usuarios autenticados.
Para entrar hay que estar en la tabla `public.invitations`.

### Dar de alta invitados

Desde el SQL Editor (la tabla no es accesible desde el cliente: RLS está activo
y sin políticas):

```sql
insert into public.invitations (email) values
  ('ana@estudio.cl'),
  ('bruno@publisher.com')
on conflict (email) do nothing;
```

- `email` se normaliza solo (trim + minúsculas) y es único.
- `code` se genera automáticamente (`NG-1A2B3C4D`) por si repartes enlaces.
- `is_used` pasa a `true` y `used_at` se rellena cuando la persona crea su
  cuenta.

### Cómo funciona el registro

1. El formulario de `/login` llama a `POST /api/invitations/verify` **antes** de
   `auth.signUp()`. Si el correo no está invitado o ya se usó, muestra el error
   y no crea nada.
2. El endpoint usa `public.check_invitation(email)` (`SECURITY DEFINER`), que
   solo responde por *ese* correo: no permite listar invitados.
3. Al insertarse la fila en `auth.users`, el trigger
   `on_auth_user_invitation_used` marca la invitación como usada en la misma
   transacción (si el alta falla, la invitación sigue disponible).

### Consultar y reutilizar

```sql
-- Estado de las invitaciones
select email, code, is_used, used_at
from public.invitations
order by is_used, email;

-- Volver a habilitar un correo (por ejemplo, si se escribió mal)
update public.invitations
   set is_used = false, used_at = null
 where email = 'ana@estudio.cl';
```

> **Bloqueo estricto (opcional).** El formulario da el mensaje amable, pero un
> `signUp` lanzado a mano desde la consola del navegador seguiría creando la
> cuenta: el trigger solo *marca* la invitación. Para que la base de datos
> rechace cualquier alta sin invitación, añade al principio del cuerpo de
> `public.mark_invitation_used()`:
>
> ```sql
> if not exists (
>   select 1 from public.invitations
>   where email = lower(trim(new.email)) and is_used = false
> ) then
>   raise exception 'invitation_required' using errcode = '42501';
> end if;
> ```
>
> Ojo: con eso también fallan los usuarios creados a mano desde el panel de
> Supabase; invítalos antes.

`POST /api/invitations/verify` no limita intentos (es un `POST` sin estado). Si
te preocupa que alguien deduzca qué correos están invitados, mete rate limiting
en el proxy o en el edge de tu hosting.

## API

| Método y ruta | Descripción |
| --- | --- |
| `GET /api/availability?userId=<uuid>` | Huecos futuros y libres de un perfil (público). Sin `userId`, los del usuario autenticado. |
| `POST /api/availability` | Publica huecos (`{ slots: [{ start_time, end_time }] }`, máx. 50). |
| `DELETE /api/availability?id=<uuid>` | Borra un hueco propio que aún no esté reservado. |
| `GET /api/meetings` | Reuniones del usuario con el nombre del otro participante. |
| `POST /api/meetings` | Reserva un hueco (`{ availability_id }`) llamando a la función `book_availability`. |
| `POST /api/jitsi-token` | Firma un JWT de JaaS (`{ roomName, userName? }`) para entrar en la sala de una reunión propia. |
| `POST /api/invitations/verify` | Comprueba si un correo está invitado (`{ email }`): `200 { allowed: true }`, `403` con `reason: "not_found" \| "already_used"`. No modifica nada. |
| `GET /auth/callback` | Intercambia el código PKCE por una sesión. |

## Videollamadas (JaaS)

La videollamada va integrada en la página con `@jitsi/react-sdk` y el tenant de
[Jitsi as a Service](https://jaas.8x8.vc), autenticada con un JWT firmado en el
servidor.

### Configuración

1. En la consola de JaaS crea una **API key** para tu App ID y descarga la clave
   privada (`.pk`). Guárdala como **`private.key` en la raíz del proyecto**
   (`networking-games/private.key`): la ruta del token la lee con
   `fs.readFileSync`, así que los saltos de línea del PEM no dan problemas. El
   fichero está en `.gitignore` y nunca se sube al repositorio.
2. Rellena `.env.local`:

   ```bash
   NEXT_PUBLIC_JITSI_APP_ID=vpaas-magic-cookie-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   JITSI_APP_SECRET=   # vacío = usar ./private.key
   # ID completo de la API key (kid del header JWT)
   # JITSI_APP_KID=vpaas-magic-cookie-.../4f4910
   ```

   La clave de firma se resuelve en este orden: `JITSI_APP_SECRET` y, si está
   vacío, `./private.key`. Se firma con **HS256** si la clave es un secreto HMAC
   y con **RS256** si es un PEM (`-----BEGIN PRIVATE KEY-----`).

   Con un PEM el `kid` **debe** ser el *API Key ID* completo que muestra la
   consola (`<appId>/<sufijo>`, p. ej. `.../4f4910`), no solo el App ID; si el
   iframe rechaza el token, revisa `JITSI_APP_KID`.

3. Reinicia `npm run dev`: las variables `NEXT_PUBLIC_*` se inyectan al compilar.

### Cómo funciona

- `POST /api/jitsi-token` exige sesión, comprueba que la sala corresponde a una
  reunión del usuario y firma el JWT (`aud: "jitsi"`, `iss: "chat"`,
  `sub: <appId>`, `room: <sala>`, `context.user` y caducidad de 2 h).
- El dueño del hueco (`participant2_id`) entra como **moderador**; el otro
  participante, sin permisos de moderación.
- `MeetingRoom` pide el token al pulsar **Entrar a la videollamada** y solo
  entonces monta el iframe de 8x8.vc (600 px de alto). El secreto nunca sale
  del servidor.
- `meetings.virtual_link` sigue guardando la URL de la sala
  (`https://meet.jit.si/NetworkingGames-<uuid>`): de su último segmento sale el
  `roomName`. Así no hace falta migrar los datos al activar JaaS.
- **Sin configurar** (`NEXT_PUBLIC_JITSI_APP_ID` vacío) la app no falla: muestra
  un aviso y el enlace externo a `meet.jit.si` como plan B.

## Notas de arquitectura

- **Reservas sin dobles asignaciones**: `book_availability` es una función
  `SECURITY DEFINER` que marca el hueco con un `UPDATE ... WHERE is_booked =
  false AND start_time > now() RETURNING *`. Si dos personas reservan a la vez,
  la segunda recibe `slot_unavailable` (HTTP 409).
- **Acceso cerrado desde el proxy**: `src/proxy.ts` (el "middleware" de Next 16
  se llama `proxy.ts` y exporta `proxy`) refresca la sesión y redirige a
  `/login?redirectedFrom=…` cualquier ruta sin sesión. Quedan abiertas `/login`,
  `/auth/*` y `/api/*` (los Route Handlers responden su propio 401 en JSON).
- **RLS**: `profiles` solo es legible por `authenticated` (política
  `profiles_authenticated_read`); `availability` mantiene lectura pública;
  `meetings`, solo sus participantes. `invitations` tiene RLS activo **sin
  políticas**, así que solo se consulta a través de `check_invitation()`.
- **Tres clientes de Supabase**: navegador (`src/lib/supabase.ts`, singleton
  perezoso), servidor con cookies (`src/lib/supabase/server.ts`) y público sin
  cookies (`src/lib/supabase/public.ts`). El directorio y los perfiles usan el
  de cookies; el público queda para lo que no necesita sesión (por ejemplo los
  huecos libres de `/api/availability`).
- **JWT de JaaS solo en el servidor**: `src/lib/jitsi-secret.ts` obtiene la clave
  (`JITSI_APP_SECRET` o `./private.key` con `fs.readFileSync`) y
  `src/lib/jitsi-token.ts` firma con `jsonwebtoken`; el navegador únicamente
  recibe el token ya firmado desde `POST /api/jitsi-token`. Nunca importar esos
  módulos desde un Client Component.
- **`private.key` fuera de git**: además de `*.pem`, `.gitignore` ignora
  `/private.key`, `*.key` y `*.pk`. En despliegues el fichero no viaja con el
  build: define `JITSI_APP_SECRET` con el PEM completo.
- **Next 16**: `params` es una `Promise`, `cookies()` es async, y las consultas no
  cacheadas viven dentro de `<Suspense>` con `await connection()` para que la
  página se renderice por petición (PPR). Con `cacheComponents` no se puede usar
  `export const runtime`, así que las rutas que necesitan Node (por ejemplo la de
  JaaS) se quedan con el runtime por defecto.

## Solución de problemas

### La videollamada no carga (`503`, `403` o iframe vacío)

| Síntoma | Causa y solución |
| --- | --- |
| `JaaS no está configurado...` (HTTP 503) | Falta `NEXT_PUBLIC_JITSI_APP_ID`, o la clave de firma: `private.key` en la raíz del proyecto / `JITSI_APP_SECRET` en `.env.local`. |
| `No tienes acceso a esta sala` (HTTP 403) | La sala no coincide con el `virtual_link` de ninguna reunión tuya, o la reunión se creó con otro formato de enlace. |
| El iframe queda negro o muestra un error de autenticación | El `kid` o la clave no corresponden a la API key. Con clave PEM define `JITSI_APP_KID` con el *API Key ID* completo (`<appId>/<sufijo>`) que da la consola JaaS; el servidor avisa por consola cuando firma con RS256 sin él. |
| `Invalid signature` | La clave no es la de la API key (o el PEM está cortado). Comprueba que `private.key` empieza por `-----BEGIN PRIVATE KEY-----` y termina en `-----END PRIVATE KEY-----`. |
| `error:1E08010C:DECODER routines::unsupported` al firmar | El fichero no es un PEM válido o le falta la cabecera/pie. Vuelve a descargar la clave desde la consola de JaaS. |

El token caduca a las 2 horas y se vuelve a pedir al pulsar de nuevo **Entrar a
la videollamada**.

### El registro rechaza a alguien que sí está invitado

| Síntoma | Causa y solución |
| --- | --- |
| `Este correo no está en la lista de invitados` | No hay fila en `public.invitations` para ese correo. Añádela (el `email` se guarda en minúsculas y sin espacios). |
| `Esta invitación ya fue utilizada` | `is_used = true`. Si la cuenta existe, que inicie sesión; si no, pon `is_used = false` y `used_at = null` antes de reintentar. |
| `Could not find the function public.check_invitation(p_email)` (500) | Falta aplicar `supabase/migrations/0002_invitations.sql` en el proyecto de Supabase. |
| El directorio o un perfil salen vacíos (o `permission denied for table profiles`) | Ese proyecto aún tiene la política pública de `0001_init.sql`. Aplica `0002_invitations.sql` y comprueba que la sesión está activa. |

### `ERROR: 42703: column "participant1_id" does not exist` al aplicar `0001_init.sql`

El proyecto ya tenía una tabla `meetings` (de una prueba anterior o de otra
versión del esquema) con otras columnas: `create table if not exists` no la
modifica y por eso fallaban los índices y las políticas que vienen después.

La migración incluye un bloque de reconciliación al principio que:

1. renombra columnas antiguas conocidas (`user1_id`, `owner_id`, `start_at`…)
   al nombre actual;
2. si sigue faltando alguna columna y la tabla está vacía, la elimina para
   recrearla con el esquema del script;
3. si la tabla tiene datos y no es compatible, aborta con un mensaje que dice
   qué columnas faltan (nunca borra datos sin avisar).

Para ver qué hay en tu proyecto antes de reejecutar:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'availability', 'meetings')
order by table_name, ordinal_position;
```

Si es una base de pruebas y no necesitas los datos:

```sql
drop table if exists public.meetings cascade;
drop table if exists public.availability cascade;
drop table if exists public.profiles cascade;
```

o directamente `supabase/reset.sql` (borra también funciones, triggers y el
enumerado). Después vuelve a ejecutar `supabase/migrations/0001_init.sql`
completo (es idempotente).

## Scripts

```bash
npm run dev    # desarrollo
npm run build  # build de producción
npm run start  # servidor de producción
npm run lint   # ESLint
```
