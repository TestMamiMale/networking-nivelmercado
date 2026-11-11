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

   O pega el contenido de `supabase/migrations/0001_init.sql` en el SQL Editor.

4. Arranca el servidor de desarrollo:

   ```bash
   npm run dev
   ```

## Flujo de uso

1. **Registro** en `/login` → Supabase envía el correo de confirmación y el
   enlace vuelve por `/auth/callback` (intercambio PKCE).
2. **Dashboard** (`/dashboard`, protegido por `src/proxy.ts`): edita tu perfil
   público, publica huecos con el calendario y consulta tus huecos y reuniones.
3. **Directorio** (`/directorio`): perfiles públicos con buscador y filtro por
   tipo (`indie` / `publisher`).
4. **Perfil** (`/perfil/[slug]`): ficha pública + calendario para reservar un hueco
   libre. Al confirmar la reserva se puede entrar directamente a la
   videollamada integrada (JaaS); en el dashboard, cada reunión tiene su propio
   botón **Entrar a la videollamada**.

## API

| Método y ruta | Descripción |
| --- | --- |
| `GET /api/availability?userId=<uuid>` | Huecos futuros y libres de un perfil (público). Sin `userId`, los del usuario autenticado. |
| `POST /api/availability` | Publica huecos (`{ slots: [{ start_time, end_time }] }`, máx. 50). |
| `DELETE /api/availability?id=<uuid>` | Borra un hueco propio que aún no esté reservado. |
| `GET /api/meetings` | Reuniones del usuario con el nombre del otro participante. |
| `POST /api/meetings` | Reserva un hueco (`{ availability_id }`) llamando a la función `book_availability`. |
| `POST /api/jitsi-token` | Firma un JWT de JaaS (`{ roomName, userName? }`) para entrar en la sala de una reunión propia. |
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
- **RLS activado** en `profiles`, `availability` y `meetings`: lectura pública de
  perfiles/huecos libres y escritura limitada al dueño.
- **Tres clientes de Supabase**: navegador (`src/lib/supabase.ts`, singleton
  perezoso), servidor con cookies (`src/lib/supabase/server.ts`) y público sin
  cookies (`src/lib/supabase/public.ts`) para páginas prerenderizables.
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
