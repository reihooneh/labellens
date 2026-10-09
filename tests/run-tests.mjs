// LabelLens parser tests. Run from the repo root:
//   npm install playwright && npx playwright install chromium
//   node labellens/tests/run-tests.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(path.join(here, "expected.json"), "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + path.join(here, "..", "index.html"));

let pass = 0;
for (const c of cases) {
  const got = await page.evaluate((t) => {
    const r = LabelLensEngine.parseLabel(t);
    if (!r || r.refused || !r.instr || r.instr.unsafe) return { status: "refused" };
    const i = r.instr;
    return {
      status: i.unusual ? "unusual" : (r.unknown.length || i.leftover ? "partial" : "ok"),
      unit: i.unit, dose: i.dose, perDay: i.perDay, every: i.every, prn: i.prn,
      max: i.max, food: i.food, warnings: r.warnings.slice().sort()
    };
  }, c.text);
  const ok = Object.entries(c.expect).every(([k, v]) => JSON.stringify(got[k]) === JSON.stringify(v));
  console.log((ok ? "PASS " : "FAIL ") + c.name + (ok ? "" : "\n   expected " + JSON.stringify(c.expect) + "\n   got      " + JSON.stringify(got)));
  if (ok) pass++;
}
console.log(`\n${pass}/${cases.length} passed`);
await browser.close();
process.exit(pass === cases.length ? 0 : 1);
