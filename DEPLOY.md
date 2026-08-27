# Despliegue de vaporlog en tu VPS

Esta guía te lleva de cero a tener **vaporlog** funcionando en tu propio servidor,
aunque sea la primera vez que administras un VPS. No necesitas experiencia previa
con Docker: solo copiar y pegar comandos.

La aplicación se compone de tres piezas que Docker levanta por ti:

| Pieza | Qué es | Puerto |
|-------|--------|--------|
| `web` | nginx sirviendo la web (React) | **80** (el único expuesto a internet) |
| `api` | API REST en Node.js | 4000 (solo interno, no se expone) |
| `db`  | Base de datos PostgreSQL 17 | 5432 (solo interno, no se expone) |

Los datos (cuentas y sesiones) se guardan en un volumen Docker llamado `pgdata`,
así que sobreviven a reinicios y actualizaciones.

---

## 1. Requisitos

- Un VPS con **Ubuntu 22.04 o 24.04** (cualquier proveedor: Hetzner, DigitalOcean,
  OVH, Contabo…).
- **1 GB de RAM o más** (2 GB recomendados para que la compilación del frontend
  vaya holgada).
- Acceso **SSH** con un usuario que tenga permisos de administrador (`sudo`).
- La **IP pública** del servidor (la llamaremos `TU-IP` a partir de aquí).

## 2. Conéctate al servidor

Desde tu ordenador:

```bash
ssh tu-usuario@TU-IP
```

## 3. Instala Docker

Docker ofrece un script oficial que lo instala todo en Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
```

Después, añade tu usuario al grupo `docker` para no tener que escribir `sudo`
en cada comando:

```bash
sudo usermod -aG docker $USER
```

**Cierra la sesión SSH y vuelve a entrar** para que el cambio de grupo tenga
efecto. Comprueba que todo está instalado:

```bash
docker --version
docker compose version
```

Ambos comandos deben mostrar una versión sin errores.

## 4. Abre el firewall

Solo necesitas abrir el puerto 80 (web). El 22 (SSH) debe seguir abierto
¡o perderás el acceso al servidor!

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

Cuando pregunte, responde `y`. El estado debe mostrar `22/tcp` y `80/tcp` como
`ALLOW`.

## 5. Descarga el código

```bash
git clone https://github.com/vaporlog/vaporlog.git
cd vaporlog
```

## 6. Configura la contraseña de la base de datos

Copia el archivo de ejemplo y edítalo:

```bash
cp .env.example .env
nano .env
```

Cambia el valor de `POSTGRES_PASSWORD` por una contraseña **larga y aleatoria**.
Puedes generar una con:

```bash
openssl rand -hex 32
```

En `nano`: pega el texto, guarda con `Ctrl+O`, `Enter`, y sal con `Ctrl+X`.

> No necesitas tocar nada más. `VITE_API_URL` viene comentada porque solo hace
> falta si la API viviera en otro servidor; con este despliegue todo va en el
> mismo origen.

## 7. Arranca la aplicación

```bash
docker compose up -d --build
```

La primera vez tarda unos minutos: descarga las imágenes base, instala
dependencias y compila el frontend. Verás el progreso en pantalla.

Comprueba que los tres contenedores están levantados:

```bash
docker compose ps
```

Debes ver `web`, `api` y `db` con estado `running` (la base de datos aparecerá
como `healthy`).

## 8. Verifica que funciona

Desde el propio servidor:

```bash
curl http://localhost/api/health
```

Debe responder algo como:

```json
{"ok":true,"db":"up"}
```

Luego abre en tu navegador:

```
http://TU-IP
```

Ya puedes crear tu cuenta y registrar tu primera sesión. 🎉

## 9. Comandos útiles del día a día

```bash
# Ver los logs de todo (Ctrl+C para salir, la app sigue corriendo)
docker compose logs -f

# Ver solo los logs de una pieza
docker compose logs -f api
docker compose logs -f db

# Reiniciar la aplicación
docker compose restart

# Parar todo (los datos se conservan)
docker compose down

# Volver a arrancar
docker compose up -d
```

> ⚠️ **Cuidado:** `docker compose down -v` borra también el volumen con la base
> de datos. No lo uses salvo que quieras empezar de cero.

## 10. Actualizar a una nueva versión

Cuando haya cambios en el repositorio:

```bash
cd vaporlog
git pull
docker compose up -d --build
```

Docker reconstruye solo lo que haya cambiado y reinicia los contenedores. Los
datos se conservan.

## 11. Copias de seguridad (recomendado)

Vuelca la base de datos a un archivo de texto:

```bash
docker compose exec -T db pg_dump -U vaporlog vaporlog > backup-vaporlog.sql
```

Guarda ese archivo en otro sitio (tu PC, otro servidor…). Para restaurarlo en
una instalación nueva:

```bash
cat backup-vaporlog.sql | docker compose exec -T db psql -U vaporlog vaporlog
```

## 12. HTTPS con dominio propio (ya configurado)

El contenedor web usa **Caddy**, que obtiene y renueva el certificado HTTPS
de **Let's Encrypt** automáticamente — sin pasos manuales de certificados:

1. En el panel DNS de tu dominio, crea un registro **A** que apunte
   `vaporlog.online` → la IP del VPS (y espera a que propague).
2. Actualiza el servidor: `git pull && docker compose up -d --build web`
3. Abre el puerto 443: `ufw allow 443/tcp`
4. Listo: **https://vaporlog.online** (HTTP redirige solo a HTTPS).

> Si el dominio aún no resuelve cuando arrancas el contenedor, Caddy
> reintenta con paciencia — evita reiniciarlo en bucle para no gastar los
> intentos de Let's Encrypt.

## 13. Inicio de sesión con Google (opcional)

La app funciona sin esto — si no configuras nada, el botón de Google simplemente
no aparece y el registro con handle+password sigue igual. Para activarlo:

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) y crea un
   proyecto (o usa uno existente).
2. En **APIs & Services → OAuth consent screen**: tipo *External*, rellena nombre
   y correo de contacto. Los scopes básicos (`openid`, `email`, `profile`) no
   requieren verificación de Google.
3. En **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Tipo: **Web application**.
   - **Authorized JavaScript origins**: `https://vaporlog.online` (y
     `http://localhost:3000` si quieres probarlo en tu PC).
   - No hacen falta redirect URIs (el flujo usa el botón de Google, sin redirects).
4. Copia el **Client ID** (termina en `.apps.googleusercontent.com`) — no es un
   secreto — y ponlo en `.env`:
   ```
   GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
   ```
5. Aplica la migración y reconstruye la API:
   ```bash
   git pull
   docker exec -i vaporlog-db-1 psql -U vaporlog -d vaporlog < server/db/migrations/008_google_auth.sql
   docker compose up -d --build api web
   ```

Cómo funciona por dentro: el botón de Google entrega un token firmado al
navegador; la API lo verifica con las llaves públicas de Google (librería `jose`,
sin secretos que guardar) y crea la cuenta al vuelo con un handle derivado del
correo. La fecha de nacimiento del age gate (21+) se sigue pidiendo — Google no
la comparte.

---

## 14. Endurecimiento de seguridad (migración 013)

La migración `013_hash_auth_tokens.sql` cambia `auth_tokens` para guardar solo
el hash SHA-256 de cada token. **Al aplicarla, todas las sesiones activas se
invalidan** y cada usuario vuelve a iniciar sesión — es el comportamiento
esperado, no un fallo.

```bash
git pull
docker exec -i vaporlog-db-1 psql -U vaporlog -d vaporlog < server/db/migrations/013_hash_auth_tokens.sql
docker compose up -d --build api web
```

El rebuild de `web` también activa los headers de seguridad del `Caddyfile`
(CSP, HSTS, X-Frame-Options…). Verifica después: home 200, `/api/health`, y un
login completo (incluido el botón de Google, que la CSP permite explícitamente).

---

¿Problemas? Revisa `docker compose logs -f` — casi siempre el error está ahí a
la vista (contraseña de `.env` sin configurar, puerto 80 ocupado, etc.).
