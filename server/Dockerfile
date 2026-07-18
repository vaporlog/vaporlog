# vaporlog API — small Node (fastify) REST service
FROM node:22-alpine
WORKDIR /srv

ENV NODE_ENV=production
ENV PORT=4000

# Production dependencies only (layer cached unless manifests change)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application source (ESM, "type": "module" in package.json)
COPY src ./src

EXPOSE 4000
CMD ["node", "src/index.js"]
