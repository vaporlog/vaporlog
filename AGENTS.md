# AGENTS.md — vaporlog

Contexto operativo para agentes (Kimi Code, Kimi Work, etc.) que trabajen en este
repositorio. Léelo completo antes de tocar nada. La guía de despliegue para
humanos está en `DEPLOY.md`; este archivo es el mapa de cómo se trabaja aquí,
y `ROADMAP.md` es el backlog priorizado de lo que sigue.

## Qué es vaporlog

Diario de vaporización de cannabis (hierba seca). Los usuarios registran cada
sesión (strain, dispositivo, temperatura, duración, cantidad, rating, aromas,
sabores, moods, actividades, notas), la llevan en su diario privado y pueden
**publicar** sesiones individuales al feed comunitario. Catálogos: ~400 strains
(datos verificados de Leafly) y 113 vaporizadores. Sitio: https://vaporlog.online
App 100% gratis por decisión del dueño (sin planes de pago por ahora).

Principios de producto que rigen las decisiones de diseño/copy: ver
`.kimi/skills/viral-product` y `.kimi/skills/revenue-centric-design`.

## Stack y mapa del repo

- `src/` — frontend React 19 + TypeScript + Vite + Tailwind + shadcn/ui.
  - `src/pages/` — Landing, Welcome, Diary, LogSession, SessionCard (`/s/:id`),
    Feed, Strains, StrainDetail, Recommendations, Profile (`/profile`),
    PublicProfile (`/u/:handle`).
  - `src/components/` — AppLayout (header + UserMenu), ui/ (shadcn), y una
    carpeta por dominio (diary, feed, log, profile, session-card, strains…).
  - `src/lib/` — `api.ts` (fetch + token bearer en localStorage), `data.ts`
    (cachés optimistas), `profile.ts`, `types.ts` (formas camelCase del API).
  - `src/i18n/locales/{en,es}/<namespace>.json` — se auto-registran por glob;
    el namespace es el nombre del archivo. `useTranslation("<namespace>")`.
- `server/` — API Fastify (Node 22, ESM).
  - `server/src/routes/` — auth, sessions, devices, profile, og, og-image.
  - `server/src/db.js` — dos modos: `DATABASE_URL` (prod, pg Pool lazy) o
    PGlite embebido (dev local, persiste en `server/.dev-data/`).
  - `server/db/init.sql` + `server/db/migrations/*.sql` — esquema y seeds.
  - `server/assets/` — fuentes DejaVu + mascota para la imagen OG (resvg).
- Raíz — `docker-compose.yml` (web/api/db), `Dockerfile` (web: build + Caddy),
  `Caddyfile`, `server/Dockerfile`, `DEPLOY.md`, `.env.example`.

## Desarrollo local (Windows, Git Bash)

```bash
export PATH="/c/Users/enriq/Documents/Kimi/Workspaces/vaporlog/.bin:/c/Users/enriq/AppData/Local/Programs/kimi-desktop/resources/resources/runtime:$PATH"
npm run dev      # API :4000 (PGlite) + vite :3000 (proxy /api → :4000)
npm run build    # tsc -b + vite build — DEBE pasar antes de cada commit
```

Reglas duras de esta máquina:

- **No hay Node de sistema ni Docker local**: usa siempre el PATH export de
  arriba. No existe shim `npx`; usa `npx.cmd` o `node` directo.
- **Matar procesos SIEMPRE por PID de Windows**:
  `netstat -ano | findstr :PUERTO` → `taskkill //PID <pid> //F //T`.
  `$!` de bash no funciona. **Nunca dejes dev servers corriendo** al terminar.
- El proxy `/api` de vite está fijo a `localhost:4000` (sin env para cambiarlo).
- PGlite local: si `.dev-data` se corrompe (taskkill /F a medio write), la API
  lo mueve a `.dev-data.corrupt-*` o arranca en `.dev-data.fresh-*` — dev data
  es desechable. Para resetear: mata procesos y `rm -rf server/.dev-data*`.
- Signup del API: `POST /api/auth/signup` con `{"handle","password","birthdate"}`.
  El campo es **handle**, no username.

## Base de datos y migraciones

- Local (PGlite): `init.sql` se re-afirma en cada boot (idempotente) y las
  migraciones de `server/db/migrations/` corren solas una vez cada una
  (registro en tabla `schema_migrations`).
- **Producción (Postgres): las migraciones NO corren solas.** Se aplican a
  mano después del `git pull` en el VPS:
  `ssh -i ~/.ssh/vaporlog_vps root@2.25.87.157 "cd /opt/vaporlog && docker exec -i vaporlog-db-1 psql -U vaporlog -d vaporlog < server/db/migrations/00X_nombre.sql"`
- Toda migración debe ser **idempotente** (`IF NOT EXISTS`,
  `ON CONFLICT DO NOTHING`) y **nunca se edita una ya aplicada**: se crea la
  siguiente numerada. `docker compose down -v` en prod está PROHIBIDO (borra
  `pgdata`).

## Deploy a producción

VPS: `ssh -i ~/.ssh/vaporlog_vps -o StrictHostKeyChecking=no root@2.25.87.157`,
repo `/opt/vaporlog`, docker compose (`web` = build del frontend + Caddy con
HTTPS Let's Encrypt para vaporlog.online; `api` = Fastify :4000 interno;
`db` = Postgres 17, volumen `pgdata`). Solo 80/443 expuestos.

Flujo (siempre): `npm run build` local OK → commit → push →
`ssh … "cd /opt/vaporlog && git pull -q && docker compose up -d --build web api"`
(reconstruye solo lo afectado: `web` si tocaste `src/` o `Caddyfile`;
`api` si tocaste `server/src` o `server/assets`) → aplicar migración a mano si
la hay → **verificar**: home 200, `/api/health` → `{"ok":true,"db":"up"}`, más
los endpoints tocados. Si algo falla y no se resuelve en ~3 intentos:
`git revert` + rebuild y reportar.

Detalles Caddy: proxifica `/api/*` → api:4000; reescribe `/s/*` →
`/api/og/s/:id` (inyección de meta OG); el bloque interno `:8080` sirve el
shell SPA por HTTP plano para que la API lo fetchee sin redirect TLS
(`OG_BASE_HTML_URL=http://web:8080/`). El fetch del shell usa `node:http`
porque undici elimina el header `Host`.

## Reglas de privacidad (producto, no negociables)

- Sesiones: privadas por defecto; cada una se publica individualmente.
- Perfil: privado por defecto; `is_public` es el switch maestro y los flags
  `public_stats/reviews/collection` abren bloques individuales.
- `GET /api/u/:handle` devuelve 404 `{"error":"private"}` IDÉNTICO para
  handle desconocido y perfil privado (no revelar existencia).
- Gramos y horas NUNCA aparecen en payloads públicos (stats/collection del
  perfil público solo llevan contadores y referencias de dispositivo).
- Meta/imagen OG personalizadas SOLO para sesiones públicas; privadas e
  inexistentes caen al genérico de marca (`/brand/og-default.jpg`).
- `authorProfilePublic` en el feed decide si el @handle enlaza a `/u/:handle`.

## i18n

Toda cadena visible vive en `src/i18n/locales/{en,es}/` — cualquier texto
nuevo va en AMBOS idiomas, en el namespace de su dominio. Nada hardcodeado.

## Secretos — qué vive fuera del repo (y así debe seguir)

- `.env` / `.env.local` (gitignored): `POSTGRES_PASSWORD`, etc. Ver `.env.example`.
- Llave SSH del VPS: `~/.ssh/vaporlog_vps` (local, nunca commitear).
- Contraseña root del VPS: existe solo en el gestor del dueño; **no la pidas
  para guardarla en ningún archivo**. No subir secretos al repo, jamás.
- No llevar datos de dev (PGlite) a producción; los tests e2e en prod se
  hacen con usuarios `*test*` que se autodestruyen (DELETE /api/profile).

## Historial — qué se construyó y por qué (log de features)

Base (repo inicial): auth handle+password con tokens bearer, diario, sesiones
con catálogos, feed público, `/s/:id`, i18n en/es, strains verificados de
Leafly, despliegue dockerizado con HTTPS. Fixes v1 móvil: scroll-to-top al
navegar, pantalla en blanco al recargar en Chrome móvil, persistencia de
opciones (aromas/sabores/moods) entre sesiones, redirección post-login al
diario, hint en comentarios para "primera sesión del día".

- `dff0d69` + `d9884c9`/`7c40b98`/`8e45089` — previews OG: meta por sesión
  pública en `/s/:id` + imagen PNG dinámica 1200×630 por sesión
  (`/api/og/s/:id/card.png`, resvg + DejaVu bundled, caché en memoria,
  fallback al estático). Motivo: compartir por WhatsApp con tarjeta rica.
  Ojo: WhatsApp cachea previews.
- `f80795f` — borrar sesiones (botón en diario + tarjeta, confirm dialog,
  optimista; `DELETE /api/sessions/:id` ya existía).
- `256fa7e` / `2a97c03` — catálogo de dispositivos: +XVAPE Aria, +12 modelos
  XVAPE/XMAX (113 total). Concentrate-only excluidos a propósito.
- `a4f622e` (agente "Judy") — OG card split-panel con mascota y mood chips.
- `206417f` — **perfil de usuario** (Judy + terminación): `/profile` (bio,
  privacidad, dispositivo favorito, stats privados con gráfica semanal,
  reviews de dispositivos 1–5, export JSON, borrar cuenta), `/u/:handle`
  público, migración `005_profile.sql`.
- `c34fe5d` — menú de usuario colapsado en el nav (avatar+handle ▾) y
  @handle enlazado a `/u/:handle` en tarjetas cuando el perfil es público
  (`authorProfilePublic`).
- `a370ab1` — **liked + efectos no deseados**: cada sesión puede marcar
  👍/👎 (`liked`) y llevar etiquetas de efectos no deseados (catálogo fijo
  de 12 + personales). Los efectos no deseados son privados por sesión con
  switch propio (`unwantedEffectsPublic`, migración
  `007_liked_and_unwanted_effects.sql`); el feed solo los muestra si ambos
  switches están activos. Stats privados en `/profile` los incluyen.
- `fe09229` — **usabilidad del /log**: ChipGroups colapsan a ~10 chips
  ordenados por frecuencia propia del usuario (+ "ver todos"), sticky bar
  con checklist de requeridos (el botón dice qué falta y scrollea ahí),
  quick-picks de duración/cantidad, banner "¿igual que la última vez?" que
  prellena strain+device+temp de la sesión anterior, y efectos no deseados
  tras un toggle. `personal.ts` exporta `VOCAB_CATEGORIES`.
- `b8bc46c` — **templates de miniatura OG al compartir**: la fila de
  compartir en `/s/:id` ofrece 3 previews reales (split/minimal/stats); la
  elección viaja como `?t=` en el link (`/s/:id?t=minimal`), `og.js` la
  propaga al `og:image` y `og-image.js` renderiza ese diseño (caché por
  template; valores desconocidos caen a `split`). Última elección en
  `localStorage["vaporlog.og-template"]`. Cepa, dispositivo y rating
  visibles en los 3 diseños. Caddy no cambió (`{uri}` ya pasa el query).

## Skills del proyecto (`.kimi/skills/`)

- `grill-me` — entrevistar al dueño hasta cerrar cada rama del diseño antes
  de construir. Úsala cuando pida "grill me" o haya que estresar un plan.
- `viral-product` — 32 principios de landing/copy/producto viral.
- `revenue-centric-design` — playbook de 101 principios de conversión,
  retención y pricing (sin assets de video; NO usar en productos de apuestas).
- `emil-design-eng`, `apple-design`, `animation-vocabulary`,
  `find-animation-opportunities`, `improve-animations`, `review-animations` —
  criterio de diseño/animación UI (de emilkowalski).
