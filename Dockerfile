# ---------- Build stage: compile the React SPA ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first so this layer is cached
# unless package.json / package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source (respects .dockerignore) and build.
# vite.config.ts uses base './', so the static bundle works
# when served same-origin from nginx on the VPS.
COPY . .
RUN npm run build

# ---------- Runtime stage: serve the static bundle with Caddy ----------
# Caddy terminates HTTPS (Let's Encrypt, fully automatic) and proxies /api.
FROM caddy:2-alpine

# SPA + /api reverse proxy configuration
COPY Caddyfile /etc/caddy/Caddyfile

# Static frontend built in the previous stage
COPY --from=build /app/dist /usr/share/caddy
