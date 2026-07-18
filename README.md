# vaporlog

Session journal for vaporization lovers: log every session with strain,
device, temperature, duration, flavors, effects and rating; keep a private
diary; publish sessions to a public community feed; get strain
recommendations from your own taste.

## Stack

- **Frontend** — React 19 + Vite + TypeScript + Tailwind (`src/`)
- **Backend** — Fastify + PostgreSQL (`server/`)
- **Deploy** — Docker Compose (nginx + api + db). See **[DEPLOY.md](DEPLOY.md)**
  (en español) for the full VPS guide.

## Local development

```bash
# 1. Database (any local Postgres works; easiest is Docker):
docker run -d --name vaporlog-db -p 5432:5432 \
  -e POSTGRES_USER=vaporlog -e POSTGRES_DB=vaporlog \
  -e POSTGRES_PASSWORD=dev postgres:17-alpine

# 2. API
cd server && npm install
DATABASE_URL=postgres://vaporlog:dev@localhost:5432/vaporlog npm start

# 3. Frontend (proxies /api → localhost:4000 automatically)
npm install
npm run dev
```

## Production

Everything runs in Docker Compose on your own VPS — no third-party
services. Follow **[DEPLOY.md](DEPLOY.md)** step by step.
