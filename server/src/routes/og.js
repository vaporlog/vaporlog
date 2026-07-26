/**
 * vaporlog API — OG meta injection for shared session cards.
 *
 *   GET /api/og/s/:id  (open) → text/html
 *
 * Crawlers (WhatsApp, X, iMessage…) don't run JavaScript, so a React SPA
 * can't give them per-session link previews on its own. This route serves
 * the SPA's index.html with Open Graph / Twitter meta rewritten for the
 * requested session — but ONLY when the session is public. Private or
 * unknown ids get the unmodified shell: the preview leaks nothing.
 * Browsers receive the same HTML and boot the SPA as usual.
 *
 * The base HTML is fetched once from the web container (OG_BASE_HTML_URL,
 * default http://web/) and cached in memory; in local dev it falls back to
 * the vite server on localhost:3000.
 */
import http from "node:http";
import { pool } from "../db.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL = (process.env.SITE_URL ?? "https://vaporlog.online").replace(
  /\/$/,
  "",
);
const OG_IMAGE_URL = `${SITE_URL}/brand/og-default.jpg`;

const BASE_HTML_CANDIDATES = [
  // Caddy only answers for the real domain, so the internal fetch must
  // carry the site's Host header — plain http://web/ gets a 404/redirect.
  {
    url: process.env.OG_BASE_HTML_URL ?? "http://web/",
    host: new URL(SITE_URL).host,
  },
  { url: "http://localhost:3000/" }, // local dev (vite), any host works
];

/** Cached SPA shell — the build only changes on deploy, and a failed
 *  refetch keeps serving the last good copy. */
let cachedBaseHtml = null;

/**
 * Plain-HTTP GET that returns the body as text. node:http — not fetch —
 * because undici silently strips the Host header, and Caddy only serves
 * the SPA shell when the request carries the real domain as Host.
 */
function httpGetText(url, host) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      url,
      { headers: host ? { Host: host } : {}, timeout: 3000 },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${url} answered ${response.statusCode}`));
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve(body));
      },
    );
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

async function getBaseHtml() {
  for (const candidate of BASE_HTML_CANDIDATES) {
    try {
      cachedBaseHtml = await httpGetText(candidate.url, candidate.host);
      return cachedBaseHtml;
    } catch {
      // try the next candidate
    }
  }
  return cachedBaseHtml; // last good copy, or null on a cold start outage
}

/** Small acronyms that must stay uppercase when humanizing slugs. */
const ACRONYMS = new Map([
  ["og", "OG"],
  ["cbd", "CBD"],
  ["thc", "THC"],
  ["xhale", "Xhale"],
]);

/** "og-kush" → "OG Kush" — display fallback when only a slug is known.
 *  Exported for og-image.js, which renders the same display names. */
export function humanizeSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => ACRONYMS.get(word) ?? word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** HTML-escape interpolated values (titles/descriptions go into attributes). */
function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Rewrites the default preview tags of the SPA shell for one public
 * session. The defaults in index.html are replaced in place (crawlers take
 * the FIRST og:title they see, so appending after them would lose); if the
 * markers are ever missing, the session tags go right after <head> so they
 * still win.
 */
function injectSessionMeta(html, session, id) {
  const strain = humanizeSlug(session.strain_slug || "session");
  const rating = Number(session.rating);
  const author = session.owner_handle || session.author || "anonymous";
  const device = session.device_name || humanizeSlug(session.device_slug || "");

  const title = `${strain} · ${rating.toFixed(1)}/10${session.liked === true ? " — liked" : ""} — a vaporlog session`;
  const ritual = [
    device,
    session.temperature_c !== null ? `${session.temperature_c}°C` : null,
    session.duration_min !== null ? `${session.duration_min} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const description = `${ritual ? `${ritual} — ` : ""}logged by @${author}. Terps, effects and ritual notes on vaporlog.`;
  const url = `${SITE_URL}/s/${id}`;
  // Public sessions get a dynamically rendered card (see og-image.js);
  // private/unknown ids keep the static brand image from index.html.
  const image = `${SITE_URL}/api/og/s/${id}/card.png`;

  const replacements = new Map([
    [/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`],
    [
      /<meta property="og:title"[^>]*>/,
      `<meta property="og:title" content="${esc(title)}" />`,
    ],
    [
      /<meta property="og:image"[^>]*>/,
      `<meta property="og:image" content="${esc(image)}" />\n    <meta property="og:image:type" content="image/png" />`,
    ],
    [
      /<meta name="twitter:image"[^>]*>/,
      `<meta name="twitter:image" content="${esc(image)}" />`,
    ],
    [
      /<meta property="og:description"[^>]*>/,
      `<meta property="og:description" content="${esc(description)}" />`,
    ],
    [
      /<meta property="og:url"[^>]*>/,
      `<meta property="og:url" content="${esc(url)}" />`,
    ],
    [
      /<meta property="og:type"[^>]*>/,
      `<meta property="og:type" content="article" />`,
    ],
    [
      /<meta name="twitter:title"[^>]*>/,
      `<meta name="twitter:title" content="${esc(title)}" />`,
    ],
    [
      /<meta name="twitter:description"[^>]*>/,
      `<meta name="twitter:description" content="${esc(description)}" />`,
    ],
    [
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${esc(description)}" />`,
    ],
  ]);

  let out = html;
  for (const [pattern, tag] of replacements) {
    out = out.replace(pattern, tag);
  }
  return out;
}

export default async function ogRoutes(app) {
  app.get("/api/og/s/:id", async (request, reply) => {
    const html = await getBaseHtml();
    if (html === null) {
      return reply
        .code(502)
        .send({ error: "Preview renderer is warming up — try again." });
    }

    const { id } = request.params;
    let out = html;
    if (UUID_RE.test(id)) {
      const { rows } = await pool.query(
        `select s.strain_slug, s.device_slug, s.temperature_c,
                s.duration_min, s.rating, s.author, s.liked,
                p.handle as owner_handle,
                d.name   as device_name
           from sessions s
           left join profiles p on p.id = s.user_id
           left join devices  d on d.slug = s.device_slug
          where s.id = $1 and s.is_public`,
        [id],
      );
      if (rows.length > 0) {
        out = injectSessionMeta(html, rows[0], id);
      }
    }

    return reply
      .type("text/html; charset=utf-8")
      .header("cache-control", "public, max-age=300")
      .send(out);
  });
}
