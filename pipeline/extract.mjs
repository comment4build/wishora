// Rule-based extraction: no AI, no API. Every claim comes with a quote copied from the page.
const REWARD = /\b(free|complimentary|freebie|gift|treat|discount|voucher|coupon|reward|offer|perk|surprise|bonus|points|stars)\b|\d+\s?% off/i;
const STRONG = /\b(free|complimentary|freebie|gift|treat|discount|voucher|coupon)\b|\d+\s?% off|(?:bonus|double|triple|\d\s?x)\s+(?:points|stars)/i;
const STOP = /^(or|and|on|for|in|at|with|when|to|of|your|a|an|the|if|is)$/i;
const days = (n, u) => +n * (/week/i.test(u) ? 7 : /month/i.test(u) ? 30 : 1);
// 25-word window of the sentence, starting just before character index idx (exact substring of the page text)
const around = (s, idx) => {
  const words = s.split(" "), wi = s.slice(0, idx).split(" ").length - 1;
  return words.slice(Math.max(0, wi - 3)).slice(0, 25).join(" ");
};

export function extractFacts(text) {
  const S = text.split(/(?<=[.!?])\s+/).filter((s) => s.length < 600);
  const B = S.filter((s) => /birth ?day/i.test(s));
  const cands = B.filter((s) => REWARD.test(s) && s.split(" ").length >= 4);
  if (!cands.length) return { found: false };
  const score = (s) => (STRONG.test(s) ? 2 : 0) + (/your birth ?day/i.test(s) ? 1 : 0);
  const best = cands.slice().sort((a, b) => score(b) - score(a))[0];

  let offer = "Birthday reward for members";
  const m = best.match(/(?:free|complimentary) ([a-z]+)(?: ([a-z]+))?|(\d+\s?% off)|(birthday (?:gift|treat|voucher))|\b(discount|voucher|coupon)\b|((?:bonus|double|triple|\d\s?x)\s+(?:points|stars))/i);
  if (m) {
    if (m[1] && !STOP.test(m[1])) offer = "Free " + m[1] + (m[2] && !STOP.test(m[2]) ? " " + m[2] : "");
    else if (m[3] || m[4] || m[5] || m[6]) offer = (m[3] || m[4] || m[5] || m[6]).replace(/^./, (c) => c.toUpperCase());
  }

  const times = []; let join = null, x;
  for (const s of B) {
    if ((x = s.match(/(\d+)\s*(days?|weeks?|months?)\s+(?:before|prior to|ahead of)\s+(?:your|their|the)\s+birth ?day/i)))
      join = { d: days(x[1], x[2]), q: around(s, x.index) };
    if ((x = s.match(/birth ?day month|month of your birth ?day/i)))
      times.push({ w: { type: "month", from: 0, to: 0 }, q: around(s, x.index) });
    else if ((x = s.match(/(?:valid|redeemable|available|good|expires?)[^.]{0,30}?(?:for|within|up to)\s+(\d+)\s+days?/i)))
      times.push({ w: { type: "week", from: 0, to: +x[1] }, q: around(s, x.index) });
    else if ((x = s.match(/\bon (?:the day of )?your (?:actual )?birth ?day\b|\bbirth ?day only\b/i)))
      times.push({ w: { type: "day", from: 0, to: 0 }, q: around(s, x.index) });
  }
  // If the page describes different timings (e.g. tiers), we don't guess.
  const timing = new Set(times.map((t) => t.w.type + t.w.to)).size === 1 ? times[0] : null;

  const ctx = B.join(" ");
  return {
    found: true, offer, evidence: best.split(" ").slice(0, 25).join(" "),
    timing: timing && timing.w, timingQuote: timing && timing.q,
    join: join && join.d, joinQuote: join && join.q,
    membership: /\b(member|join|sign(?:ed)? up|register|account|rewards|club)\b/i.test(ctx),
    app: /\bapp\b/i.test(ctx),
    id: /\bID\b|proof of (age|identity)/.test(ctx),
    purchase: /\bpurchase\b|minimum spend|when you (?:spend|buy)|with any order/i.test(ctx),
    addBirthday: /(add|enter|include|provide)[^.]{0,30}(birth ?day|birth date|date of birth)/i.test(ctx),
  };
}
