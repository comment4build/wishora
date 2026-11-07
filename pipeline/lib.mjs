import { createHash } from "node:crypto";

export const UA = "WishoraBot/1.0 (birthday deal verification; respects robots.txt)";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function htmlToText(h) {
  return h
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&apos;/g, "'")
    .replace(/\s+/g, " ").trim();
}
export const norm = (s) =>
  String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

// A quote only counts if it is long enough to mean something AND appears verbatim on the page.
export const quoteInText = (q, text) => !!q && q.trim().split(/\s+/).length >= 4 && norm(text).includes(norm(q));

export const isOfficial = (url, domains) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return domains.some((d) => h === d || h.endsWith("." + d));
  } catch { return false; }
};
export const hash = (s) => createHash("sha256").update(norm(s)).digest("hex").slice(0, 12);

// ---- robots.txt (the scraper only reads pages the site allows) ----
const cache = new Map();
const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
export async function robots(origin) {
  if (!cache.has(origin)) {
    const rules = [], sitemaps = [];
    try {
      const r = await fetch(origin + "/robots.txt", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        let on = false;
        for (const line of (await r.text()).split(/\r?\n/)) {
          const m = line.replace(/#.*/, "").match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
          if (!m) continue;
          const k = m[1].toLowerCase(), v = m[2];
          if (k === "user-agent") on = v === "*";
          else if (on && (k === "disallow" || k === "allow") && v) rules.push([k, v]);
          else if (k === "sitemap") sitemaps.push(v);
        }
      }
    } catch {}
    cache.set(origin, { rules, sitemaps });
  }
  return cache.get(origin);
}
export async function allowed(url) {
  const u = new URL(url), { rules } = await robots(u.origin), path = u.pathname + u.search;
  let best = null;
  for (const [k, v] of rules) {
    const end = v.endsWith("$"), body = end ? v.slice(0, -1) : v;
    if (new RegExp("^" + body.split("*").map(esc).join(".*") + (end ? "$" : "")).test(path)) {
      if (!best || v.length > best[1].length || (v.length === best[1].length && k === "allow")) best = [k, v];
    }
  }
  return !best || best[0] === "allow";
}

export async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xml;q=0.9,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return { final: r.url, html: await r.text() };
}

// Optional: pages that only fill in with JavaScript. Needs `npm i playwright` (free).
export async function render(url) {
  let pw;
  try { pw = await import("playwright"); } catch { throw new Error("page needs JavaScript; install playwright to render it"); }
  const b = await pw.chromium.launch();
  try {
    const p = await b.newPage({ userAgent: UA });
    await p.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    return { html: await p.content(), final: p.url() };
  } finally { await b.close(); }
}
