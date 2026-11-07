// Free scraper: checks each brand in data/watchlist.json on the brand's OWN website and writes data/deals.json.
// No API keys, no paid services. Usage: node pipeline/run.mjs [watchlist-id]
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { sleep, allowed, robots, fetchHtml, render, htmlToText, quoteInText, isOfficial, hash } from "./lib.mjs";
import { extractFacts } from "./extract.mjs";

const dir = process.env.DATA_DIR ? pathToFileURL(process.env.DATA_DIR.replace(/\/?$/, "/")) : new URL("../data/", import.meta.url);
const DELAY = +(process.env.DELAY_MS ?? 1500);
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")); } catch { return d; } };
const watch = read("watchlist.json", []);
const old = new Map(read("deals.json", { deals: [] }).deals.map((d) => [d.id, d]));
const today = new Date().toISOString().slice(0, 10);
const only = process.argv[2];
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

async function getPage(u, w) {
  if (!(await allowed(u))) throw new Error("blocked by robots.txt");
  await sleep(DELAY);
  let { html, final } = await fetchHtml(u);
  if (!isOfficial(final, w.domains)) throw new Error("redirected off the brand's domain");
  let text = htmlToText(html);
  if (text.length < 600 || w.render) {
    try {
      ({ html, final } = await render(final));
      if (!isOfficial(final, w.domains)) throw new Error("redirected off the brand's domain");
      text = htmlToText(html);
    } catch (e) { if (text.length < 600) throw new Error("too little text: " + e.message); }
  }
  return { html, final, text };
}

// Find likely pages: links on the homepage and URLs in the sitemap that mention birthdays or rewards.
async function candidates(w) {
  const base = w.start || "https://" + w.domains[0] + "/", origin = new URL(base).origin, found = new Set();
  const keep = (u) => isOfficial(u, w.domains) && (!w.pathHint || new RegExp(w.pathHint).test(u));
  try {
    const { html, final } = await getPage(base, w);
    for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
      try { const u = new URL(m[1], final).href; if (keep(u) && /birthday|reward|loyalty|club|member|perks/i.test(u)) found.add(u); } catch {}
    }
  } catch {}
  const queue = [...(await robots(origin)).sitemaps, origin + "/sitemap.xml"], seen = new Set();
  while (queue.length && seen.size < 8) {
    const sm = queue.shift(); if (seen.has(sm) || /\.gz$/.test(sm)) continue; seen.add(sm);
    try {
      if (!(await allowed(sm))) continue;
      await sleep(DELAY);
      const { html: xml } = await fetchHtml(sm);
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
        if (/\.xml$/i.test(m[1])) queue.push(m[1]);
        else if (/birthday/i.test(m[1]) && keep(m[1])) found.add(m[1]);
      }
    } catch {}
  }
  return [...found].sort((a, b) => /birthday/i.test(b) - /birthday/i.test(a)).slice(0, 8);
}

function build(w, x, url, text) {
  if (!x.found) throw new Error("page has no birthday reward");
  if (!quoteInText(x.evidence, text)) throw new Error("evidence quote not found on the page");
  const timingOk = !!(x.timing && quoteInText(x.timingQuote, text));
  const joinOk = !!(x.join && quoteInText(x.joinQuote, text));
  const prev = old.get(w.id), h = hash(x.evidence);
  return {
    id: w.id, brand: w.brand, offer: x.offer, categories: w.categories, countries: w.countries, kids: !!w.kids,
    window: timingOk ? x.timing : { type: "month", from: 0, to: 0 },
    joinDaysBefore: joinOk ? x.join : 0,
    needs: [x.membership && "Membership", x.app && "App", x.id && "ID needed", x.purchase && "Purchase may be needed"].filter(Boolean),
    steps: [x.membership && "Join the brand’s rewards programme", x.addBirthday && "Add your birthday to your account", x.app && "Redeem it in the brand’s app", "Check the brand’s own terms for the details"].filter(Boolean),
    estValue: w.estValue ?? null,
    sourceUrl: url, evidence: x.evidence, evidenceHash: h,
    timingVerified: timingOk, confidence: timingOk ? "high" : "medium",
    firstSeen: prev?.firstSeen || today, lastVerified: today, status: "active", failures: 0,
    changedAt: prev && prev.evidenceHash !== h ? today : prev?.changedAt || null,
  };
}

const out = [];
for (const w of watch) {
  if (only && w.id !== only) { if (old.has(w.id)) out.push(old.get(w.id)); continue; }
  const tried = new Set(), known = [old.get(w.id)?.sourceUrl, w.seedUrl].filter(Boolean);
  let rec = null, err = "no page describing a birthday reward found";
  for (let pass = 0; pass < 2 && !rec; pass++) {
    for (const u of pass === 0 ? known : await candidates(w)) {
      if (tried.has(u)) continue; tried.add(u);
      try {
        const p = await getPage(u, w);
        rec = build(w, extractFacts(p.text), p.final, p.text);
        break;
      } catch (e) { err = e.message; }
    }
  }
  if (rec) { out.push(rec); console.log("verified", w.id, rec.confidence); continue; }
  const prev = old.get(w.id);
  if (!prev) { console.log("skipped ", w.id, "-", err); continue; }
  const failures = (prev.failures || 0) + 1;
  const status = failures >= 5 ? "removed" : failures >= 2 || daysBetween(prev.lastVerified, today) > 45 ? "stale" : prev.status;
  out.push({ ...prev, failures, status, lastError: err });
  console.log("failed  ", w.id, status, "-", err);
}
fs.writeFileSync(new URL("deals.json", dir), JSON.stringify({ generatedAt: new Date().toISOString(), deals: out }, null, 2) + "\n");
