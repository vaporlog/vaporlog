#!/usr/bin/env node
/**
 * vaporlog local dev orchestrator (`npm run dev`).
 *
 * Starts both halves of the app and ties their lifecycles together:
 *
 *   [api]  node server/src/index.js — PORT=4000 with DATABASE_URL stripped
 *          from its environment, so the API boots the embedded PGlite dev
 *          database (server/.dev-data/) instead of expecting Postgres.
 *   [web]  the vite dev server — every CLI argument is forwarded verbatim
 *          (e.g. `npm run dev -- --port 5173 --host`), and its /api proxy
 *          targets the API above (see vite.config.ts).
 *
 * Both children's output is reprinted with an [api]/[web] prefix. Ctrl+C
 * (SIGINT/SIGTERM) or the death of either child shuts the other one down —
 * no orphaned processes.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const children = [];
let shuttingDown = false;

/** Reprints a child's stdout/stderr with a per-line [name] prefix. */
function prefixLogs(name, child) {
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep the trailing partial line for next chunk
      for (const line of lines) {
        if (line.trimEnd() !== "") {
          process.stdout.write(`[${name}] ${line}\n`);
        }
      }
    });
    stream.on("end", () => {
      if (buffer.trimEnd() !== "") {
        process.stdout.write(`[${name}] ${buffer}\n`);
      }
    });
  }
}

/** Tears down every child and exits — idempotent. */
function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }
  // Give the children a brief moment to exit cleanly, then leave.
  setTimeout(() => process.exit(exitCode), 500).unref();
}

function start(name, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixLogs(name, child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(
      `[dev] ${name} exited (code ${code ?? "null"}, signal ${signal ?? "none"}) — shutting down`,
    );
    shutdown(code ?? 1);
  });
  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev] failed to start ${name}: ${error.message}`);
    shutdown(1);
  });
  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// [api] — embedded-database mode: DATABASE_URL must NOT leak through from
// the developer's shell, or the API would try real Postgres instead.
const apiEnv = { ...process.env, PORT: "4000" };
delete apiEnv.DATABASE_URL;

start("api", [path.join("server", "src", "index.js")], apiEnv);
start(
  "web",
  [path.join("node_modules", "vite", "bin", "vite.js"), ...process.argv.slice(2)],
  { ...process.env },
);
