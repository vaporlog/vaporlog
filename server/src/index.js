/**
 * vaporlog API — entrypoint.
 *
 * Fastify on 0.0.0.0:${PORT:-4000}, every route under /api. PostgreSQL via
 * DATABASE_URL (pg Pool). Errors are always { error: "message" } + a proper
 * status code. The process must boot and answer /api/health even when the
 * database is unreachable (the pool connects lazily).
 *
 * Structure:
 *   src/db.js            — pg Pool
 *   src/authenticate.js  — Bearer-token preHandler
 *   src/mappers.js       — snake_case rows ↔ camelCase API shapes
 *   src/routes/auth.js   — /api/auth/*
 *   src/routes/sessions.js — /api/sessions/*
 *   src/routes/devices.js  — /api/devices (public catalog)
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import { pool } from "./db.js";
import authRoutes from "./routes/auth.js";
import sessionRoutes from "./routes/sessions.js";
import deviceRoutes from "./routes/devices.js";
import ogRoutes from "./routes/og.js";

const app = Fastify({ logger: true });

// Same-origin in production (nginx proxies /api), but the vite dev server
// proxies too — permissive CORS keeps every deployment shape working.
await app.register(cors, { origin: true });

// Tolerant JSON parsing: an empty body (e.g. POST /api/auth/signout sends
// none) parses as {} instead of failing fastify's strict JSON parser, and a
// malformed body becomes a clean 400.
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_request, body, done) => {
    if (typeof body !== "string" || body.trim() === "") {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(body));
    } catch (error) {
      error.statusCode = 400;
      error.message = "Request body is not valid JSON.";
      done(error);
    }
  },
);

// Uniform error contract: { error: "message" } + proper status. Internal
// details are never leaked on 5xx.
app.setErrorHandler((error, request, reply) => {
  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;
  if (statusCode >= 500) {
    request.log.error(error);
  }
  void reply.code(statusCode).send({
    error: statusCode >= 500 ? "Internal server error." : error.message,
  });
});

app.setNotFoundHandler((_request, reply) => {
  void reply.code(404).send({ error: "Not found." });
});

// Liveness: ALWAYS answers 200, reporting whether the database responded
// within 1.5 s — this is the deployment smoke test and must not depend on
// the DB being up.
app.get("/api/health", async () => {
  let timer;
  try {
    await Promise.race([
      pool.query("select 1"),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("health check timeout")), 1500);
      }),
    ]);
    return { ok: true, db: "up" };
  } catch {
    return { ok: true, db: "down" };
  } finally {
    clearTimeout(timer);
  }
});

await app.register(authRoutes);
await app.register(sessionRoutes);
await app.register(deviceRoutes);
await app.register(ogRoutes);

const port = Number(process.env.PORT ?? 4000);
try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
