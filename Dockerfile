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

# ---------- Runtime stage: serve the static bundle with nginx ----------
FROM nginx:1.27-alpine

# SPA + /api reverse proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static frontend built in the previous stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
