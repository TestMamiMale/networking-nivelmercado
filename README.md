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
   (Settings → API): la URL, la clave `anon` y la **`service_role`** (esta última
   es secreta: solo se usa en el servidor, para el registro con código). Si vas a
   usar videollamadas, añade también los de JaaS (ver
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
   2. `supabase/migrations/0002_invitations.sql` (`profiles` solo para usuarios
      autenticados y el primer flujo de invitaciones).
   3. `supabase/migrations/0003_access_codes.sql` (tabla `access_codes`; retira
      las invitaciones por correo).

4. Genera los códigos de invitación y repártelos (ver
   [Códigos de acceso](#códigos-de-acceso-registro-cerrado)).

5. Arranca el servidor de desarrollo:

   ```bash
   npm run dev
   ```

## Flujo de uso

1. **Landing** (`/`): página pública del evento (fecha, "Cómo funciona" y
   llamada a la acción). Es la única vista de la app que se sirve sin sesión, así
   que se puede compartir por WhatsApp o Discord: lleva su tarjeta Open Graph.
2. **Registro** en `/login` con **nombre, email, contraseña, tipo y código de
   invitación** (ver
   [Códigos de acceso](#códigos-de-acceso-registro-cerrado)). La cuenta se crea
   ya confirmada, sin correo de verificación, y la sesión queda iniciada.
3. **Dashboard** (`/dashboard`): edita tu perfil público, publica huecos con el
   calendario y consulta tus huecos y reuniones. El proxy exige sesión en el
   resto de rutas de la app.
4. **Directorio** (`/directorio`): perfiles de los asistentes con buscador y
   filtro por tipo (`indie` / `publisher`). Requiere sesión: RLS no expone
   `profiles` a la clave anónima.
5. **Perfil** (`/perfil/[slug]`): ficha + calendario para reservar un hueco
   libre. Al confirmar la reserva se puede entrar directamente a la
   videollamada integrada (JaaS); en el dashboard, cada reunión tiene su propio
   botón **Entrar a la videollamada**.

## Landing pública y metadatos

`/` es la página que se comparte como `networking.nivelmercado.cl`: hero con la
fecha del evento (15–17 de enero de 2027), sección "Cómo funciona" y pie con el
enlace a [Nivel Mercado](https://nivelmercado.cl). El botón principal lleva a
`/login`, o a `/dashboard` si ya hay sesión: el resto de la página se
prerenderiza y solo ese botón se resuelve en cada petición.

- Textos y fechas del evento: `src/lib/site.ts`.
- La tarjeta de Open Graph se genera en el build con
  `src/app/opengraph-image.tsx` (PNG 1200×630), así que no hay que subir ninguna
  imagen al repositorio. Si la URL del proxy la bloqueara, los crawlers no
  podrían leerla: `/opengraph-image` está en las rutas públicas.
- `NEXT_PUBLIC_SITE_URL` fija el dominio de los enlaces absolutos de los
  metadatos. Si no se define, se asume `https://networking.nivelmercado.cl`.

## Códigos de acceso (registro cerrado)

La app es cerrada: el proxy exige sesión en **todas** las rutas salvo la landing
pública (`/`), `/login`, `/auth/*`, `/api/*` y las imágenes de metadatos
(`/opengraph-image`, `/icon`…), que los crawlers piden sin cookies. RLS solo deja
leer `profiles` a usuarios autenticados.
Para registrarse hace falta un **código de invitación** de la tabla
`public.access_codes`. Cada código vale para **un solo registro** y sirve con el
correo que la persona prefiera: ya no hay una lista de emails invitados.

### Generar y repartir códigos

Desde el SQL Editor (la tabla no es accesible desde el cliente: RLS está activo
y sin políticas):

```sql
-- 25 códigos de golpe, anotando a quién va cada uno
insert into public.access_codes (assigned_to)
select 'Estudio ' || g from generate_series(1, 25) g;

-- Lista para imprimir / pegar en la hoja de cálculo del evento
select code, assigned_to, is_used, used_at
from public.access_codes
order by created_at;
```

- `code` se genera solo: `NG-XXXXXX` (`NG-` + 6 caracteres sin `0/O/1/I`, para
  poder dictarlo por teléfono sin errores). Es único.
- `assigned_to` es una **anotación libre** del organizador (empresa, persona,
  mesa…). No se usa para validar: cualquier correo vale con cualquier código
  libre.
- Si en vez de códigos sueltos repartes enlaces, `/login?code=NG-ABC123` abre el
  formulario de registro con el código ya rellenado.

### Cómo funciona el registro

1. El formulario de `/login` pide **nombre, email, contraseña, tipo y código** y
   hace `POST /api/auth/register-with-code`. No hay correo de confirmación.
2. La Route Handler (servidor) comprueba que el código exista y esté libre, y lo
   **consume** con un único `UPDATE ... WHERE code = $1 AND is_used = false`: si
   llegan dos peticiones con el mismo código, solo una gana.
3. Crea la cuenta con la **Admin API** (`supabase.auth.admin.createUser` con
   `email_confirm: true`) usando la `SUPABASE_SERVICE_ROLE_KEY`. El trigger
   `handle_new_user` crea el perfil con los metadatos `name` y `type`.
4. Si el alta falla (por ejemplo, porque el correo ya tiene cuenta), el código se
   **libera** (`is_used = false`, `used_at = null`) y vuelve a estar disponible.
5. Si el alta va bien, se inicia sesión con el cliente de cookies: la respuesta
   incluye `{ user, session }` y el navegador queda autenticado, así que el
   formulario navega directo al dashboard.

> La `service_role` key **omite RLS**. Vive solo en `SUPABASE_SERVICE_ROLE_KEY`
> (sin prefijo `NEXT_PUBLIC_`), se usa únicamente en `src/lib/supabase/admin.ts`
> y en `POST /api/auth/register-with-code`, y nunca llega al bundle del
> navegador. No la subas al repositorio.

### Cerrar el registro público (recomendado)

Al retirar el trigger `on_auth_user_invitation_used` ya no queda nada en la base
de datos que impida un `auth.signUp()` lanzado a mano con la clave `anon` desde
la consola del navegador. Para que el **único** camino de alta sea la Admin API
(que sí exige código):

1. Supabase → **Authentication → Sign In / Providers → Email**.
2. Desactiva **Allow new users to sign up**.

`auth.admin.createUser` sigue funcionando con esa opción desactivada (el ajuste
solo bloquea el endpoint público `/signup`), así que el registro con código no se
ve afectado.

### Consultar y reutilizar códigos

```sql
-- Códigos ya usados, del más reciente al más antiguo
select code, assigned_to, used_at
from public.access_codes
where is_used
order by used_at desc;

-- Volver a habilitar uno (por ejemplo, si el registro se hizo con mal correo)
update public.access_codes
   set is_used = false, used_at = null
 where code = 'NG-ABC123';

-- Los que quedan sin usar, en una sola línea para copiarlos
select string_agg(code, ' ' order by code)
from public.access_codes
where not is_used;
```

Los códigos que ya existieran en `public.invitations` (flujo antiguo de `0002`)
se copian a `access_codes` al aplicar `0003`, y después la tabla anterior se
elimina.

`POST /api/auth/register-with-code` no limita intentos: con 32^6 combinaciones
(≈ 1 000 millones) adivinar un código es inviable, pero si quieres cortar fuerza
bruta mete rate limiting en el proxy o en el edge de tu hosting.

## API

| Método y ruta | Descripción |
| --- | --- |
| `GET /api/availability?userId=<uuid>` | Huecos futuros y libres de un perfil (público). Sin `userId`, los del usuario autenticado. |
| `POST /api/availability` | Publica huecos (`{ slots: [{ start_time, end_time }] }`, máx. 50). |
| `DELETE /api/availability?id=<uuid>` | Borra un hueco propio que aún no esté reservado. |
| `GET /api/meetings` | Reuniones del usuario con el nombre del otro participante. |
| `POST /api/meetings` | Reserva un hueco (`{ availability_id }`) llamando a la función `book_availability`. |
| `POST /api/jitsi-token` | Firma un JWT de JaaS (`{ roomName, userName? }`) para entrar en la sala de una reunión propia. |
| `POST /api/auth/register-with-code` | Registro con código (`{ name, email, password, type, code }`): `201 { user, session }`, `403 reason: "invalid_code"`, `409 reason: "code_used" \| "email_taken"`, `503` si falta `SUPABASE_SERVICE_ROLE_KEY`. Consume el código de forma atómica. |
| `GET /auth/callback` | Intercambia el código PKCE por una sesión (enlaces de Supabase Auth; el registro ya no lo usa). |

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
  `meetings`, solo sus participantes. `access_codes` tiene RLS activo **sin
  políticas**, con los permisos revocados a `anon` y `authenticated`: solo la
  toca el servidor con la service role key.
- **Cuatro clientes de Supabase**: navegador (`src/lib/supabase.ts`, singleton
  perezoso), servidor con cookies (`src/lib/supabase/server.ts`), público sin
  cookies (`src/lib/supabase/public.ts`) y admin con la service role key
  (`src/lib/supabase/admin.ts`, solo para crear usuarios y consumir códigos). El
  directorio y los perfiles usan el de cookies; el público queda para lo que no
  necesita sesión (por ejemplo los huecos libres de `/api/availability`).
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

### El registro con código falla

| Síntoma | Causa y solución |
| --- | --- |
| `Ese código no existe` | El código no está en `public.access_codes`. Revisa mayúsculas y guiones (`NG-ABC123`); el formulario las fuerza, pero un `curl` no. |
| `Ese código ya fue utilizado` | `is_used = true`. Mira `used_at`; si fue un error, pon `is_used = false, used_at = null` y vuelve a probar. |
| `Ese correo ya tiene una cuenta` | El email ya está registrado: que inicie sesión. El código se libera automáticamente, así que puedes usarlo con otro correo. |
| `El registro no está disponible ahora mismo` (503) | Falta `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Si la acabas de añadir, reinicia `npm run dev` (las variables solo se leen al arrancar). |
| `No pudimos validar tu código` (500) | Falta aplicar `supabase/migrations/0003_access_codes.sql`, o la tabla no conserva el `grant` para `service_role` (el bloque final de la migración lo repone). |
| `permission denied for table access_codes` | La clave usada no es la `service_role`: revisa que `SUPABASE_SERVICE_ROLE_KEY` sea la de Settings → API y no la `anon`. |
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
