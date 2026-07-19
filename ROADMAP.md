# ROADMAP.md — vaporlog

Backlog priorizado del proyecto. Cada ítem incluye contexto y punteros de
implementación para que cualquier agente (o humano) pueda retomarlo sin
preguntar. El contexto general del repo está en `AGENTS.md`.

Leyenda: 🟢 listo para agarrar · 🟡 requiere decisión del dueño · 🔵 idea
exploratoria.

---

## Corto plazo (siguientes features)

### 🟢 "Más sesiones de @handle" en `/s/:id`
Al final de la tarjeta pública de una sesión, listar las demás sesiones
públicas del mismo autor cuando `authorProfilePublic === true`, enlazando a
`/u/:handle`.
- Backend: ningún cambio (el feed público ya expone el flag); el frontend ya
  tiene las sesiones del feed para filtrar por `author`, o añadir
  `GET /api/sessions/public?author=<handle>` si se prefiere server-side.
- Archivos: `src/pages/SessionCard.tsx`, `src/components/session-card/`,
  i18n `sessionCard.json` (en+es).

### 🟢 Editar una sesión ya registrada
Complemento natural del borrado (el `DELETE` ya existe; el API ya soporta
upsert por id — revisar `PUT/POST /api/sessions` en
`server/src/routes/sessions.js` para ver si acepta id o hay que añadir PATCH).
- UX: botón "Editar" en la tarjeta propia → `/log` precargado (reusar
  `LogSession.tsx` con estado inicial) → guardar.
- Cuidado: la imagen OG cacheada se invalida sola (key = hash de la fila).

### 🟢 Página de detalle por dispositivo
Como la de strains (`StrainDetail.tsx`) pero para los 113 dispositivos:
rango de temperatura, cámara, batería, tipo de calentamiento, enlaces de
compra/review. Requiere ampliar la tabla `devices` (migración `006_*.sql` con
columnas de specs) — curar datos con fuentes verificadas, como se hizo con
strains y con la línea XVAPE/XMAX. Página enlazable desde el selector y desde
la colección del perfil.

### 🟢 OG tags/imagen para perfiles públicos
`/u/:handle` actualmente sirve el shell genérico. Inyectar
`og:title`/`og:description` (handle, bio, dispositivo favorito) solo cuando el
perfil es público, siguiendo el patrón de `server/src/routes/og.js`
(privado/inexistente → genérico, idéntico criterio que `/api/u/:handle`).
- Extra: imagen dinámica por perfil con `og-image.js` (handle + favorito +
  total de sesiones públicas).

---

## Medio plazo

### 🟡 Chat / mensajería entre usuarios
El dueño mencionó que el agente Judy "estaba trabajando en la parte del chat".
No hay código de chat en el repo — **definir primero el alcance** (¿mensajes
directos? ¿comentarios en sesiones públicas? ¿tiempo real con websockets o
polling?). Recomendado: usar la skill `grill-me` para cerrar el diseño antes
de construir.

### 🟡 Soporte para dispositivos de concentrados
Se excluyeron a propósito del catálogo (XMAX Daboo, QOMO, Riggo, Tunke, XVAPE
Vista Mini 2) porque el diario es de hierba seca. Si se quieren sesiones de
concentrados: añadirlos con su categoría y decidir si las sesiones necesitan
un campo "material" (hierba/concentrado).

### 🟡 Recomendaciones más finas
Existe `Recommendations.tsx` ("qué te podría gustar según tus efectos").
Evaluar con datos reales si el algoritmo actual basta o si conviene pesar
por terpenos/efectos del catálogo de strains.

### 🟡 Seed de datos demo en local
Para no empezar de cero tras cada reset de PGlite: script
`server/scripts/seed-dev.mjs` que cree un usuario demo con sesiones variadas
(solo local; jamás correr contra producción).

---

## Infraestructura

### 🟢 Backups automáticos de Postgres
`DEPLOY.md` documenta el `pg_dump` manual. Automatizar: cron en el VPS que
deje dumps rotados (7 diarios) fuera del contenedor, p. ej.
`0 5 * * * docker exec vaporlog-db-1 pg_dump -U vaporlog vaporlog | gzip > /opt/backups/vaporlog-$(date +\%F).sql.gz`
y documentar restauración. (Programar a minuto NO en punto — evitar la hora
en punto por congestión.)

### 🟡 Monitoreo básico
Healthcheck externo (p. ej. Uptime Kuma en el propio VPS o un cron que haga
curl a `/api/health` y avise) para enterarnos si el sitio cae.

### 🔵 CI ligero
GitHub Action que corra `npm run build` en cada push a main para cazar
errores de TypeScript antes del deploy (hoy el build se valida local).

---

## Ideas por decidir (🟡/🔵 — no construir sin confirmar)

- PWA / instalable móvil (manifest + service worker; la app ya es responsive).
- "Primera sesión del día" como dato estructurado (se decidió NO campo nuevo;
  hoy se motiva vía hint en comentarios — reabrir solo si la comunidad lo pide).
- Compartir imagen de la tarjeta OG directamente desde la app (descargar el
  PNG de `/api/og/s/:id/card.png` con un botón en `/s/:id`).
- Perfil: avatar/foto de usuario (hoy el avatar es la inicial del handle).
- Internacionalización de los nombres de strains/dispositivos (hoy se
  muestran en su nombre original en ambos idiomas — decisión consciente).

---

### Reglas del backlog

1. Nada entra a producción sin que el dueño lo pida explícitamente.
2. Toda feature respeta las reglas de privacidad de `AGENTS.md` (privado por
   defecto; gramos/horas nunca públicos; 404 idéntico para privado/inexistente).
3. Toda migración es idempotente y se aplica a mano en prod.
4. Antes de features grandes (chat, PWA), sesión `grill-me` con el dueño.
