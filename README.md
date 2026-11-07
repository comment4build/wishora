# Wishora

Birthday rewards, planned. The site (`index.html`) is static. Deals live in `data/deals.json`, refreshed by a
free scraper that reads each brand's **own** website. No API keys, no paid services.

## How a deal becomes "verified"
1. **Find:** the scraper opens the brand's homepage and sitemap and looks for pages about birthdays or rewards
   (or uses `seedUrl` from `data/watchlist.json`). It only reads pages `robots.txt` allows, one request every 1.5 s.
2. **Extract:** plain rules (no AI) pull the reward, requirements and timing out of the page text.
3. **Verify:** each claim needs a quote that appears word for word on the page; the page must be on the brand's
   domain (also after redirects). Timing (join-by date, claim window) is only trusted if its own quote matches
   and the page doesn't describe conflicting timings (e.g. tiers); otherwise the site shows "Check timing".
4. **Age:** every deal keeps its `lastVerified` date. Two failed re-checks mark it stale, five remove it.

Coverage: about 70 US brands (coffee, fast food, restaurants, pizza, sweets, beauty, fashion, books, kids, games, cinemas, pets, crafts) plus a few UK and Belgian ones.
Programmes change: some brands have cut birthday freebies or never had them. Those are skipped, not guessed.
After every run, `data/report.json` lists each brand as verified, skipped or failed, with the reason.

Third-party blogs are never a source. They often contradict each other and the brand.

## Set up (free)
1. Push this folder to GitHub, enable **Settings → Pages**.
2. Run **Actions → Refresh verified deals** once; it then runs weekly and commits `data/deals.json`.
   Locally: `node pipeline/run.mjs` (one brand: `node pipeline/run.mjs starbucks-us`), tests: `npm test`.

## Tuning the watchlist (`data/watchlist.json`)
`domains` (required) the brand's official domains · `seedUrl` direct page to read · `start` page to crawl from ·
`pathHint` regex to keep only one country's URLs · `render: true` open the page in a headless browser first ·
`estValue` your own estimate of the reward's worth, used for the savings total (otherwise the site shows no total).

## Known limits
- Rules read plain sentences. Unusual wording gets skipped or marked "Check timing" instead of guessed.
  Early runs will skip some brands: add a `seedUrl` for those (open the brand's birthday page and paste its URL).
- Pages built with JavaScript are only read if Playwright is available (the workflow tries to install it).
- Domains in the watchlist are guesses; a wrong one publishes nothing.
- Check each brand's terms of use before crawling regularly.
- Serve `index.html` from GitHub Pages or a web server; browsers block loading `data/deals.json` from `file://`.
