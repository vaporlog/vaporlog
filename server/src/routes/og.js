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
import { pool } from "../db.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL = (process.env.SITE_URL ?? "https://vaporlog.online").replace(
  /\/$/,
  "",
);
const OG_IMAGE_URL = `${SITE_URL}/brand/og-default.jpg`;

const BASE_HTML_CANDIDATES = [
  process.env.OG_BASE_HTML_URL ?? "http://web/",
  "http://localhost:3000/",
];

/** Cached SPA shell — the build only changes on deploy, and a failed
 *  refetch keeps serving the last good copy. */
let cachedBaseHtml = null;

async function getBaseHtml() {
  for (const url of BASE_HTML_CANDIDATES) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        cachedBaseHtml = await response.text();
        return cachedBaseHtml;
      }
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

/** "og-kush" → "OG Kush" — display fallback when only a slug is known. */
function humanizeSlug(slug) {
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

  const title = `${strain} · ${rating.toFixed(1)}/10 — a vaporlog session`;
  const ritual = [
    device,
    session.temperature_c !== null ? `${session.temperature_c}°C` : null,
    session.duration_min !== null ? `${session.duration_min} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const description = `${ritual ? `${ritual} — ` : ""}logged by @${author}. Terps, effects and ritual notes on vaporlog.`;
  const url = `${SITE_URL}/s/${id}`;

  const replacements = new Map([
    [/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`],
    [
      /<meta property="og:title"[^>]*>/,
      `<meta property="og:title" content="${esc(title)}" />`,
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
                s.duration_min, s.rating, s.author,
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
