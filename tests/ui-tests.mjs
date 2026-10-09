// LabelLens interface, safety and security tests, run in a real browser.
//   npm install && npx playwright install chromium && npm test
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = "file://" + path.join(here, "..", "index.html");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log((ok ? "PASS " : "FAIL ") + name + (ok || !detail ? "" : "\n   " + detail));
}

const browser = await chromium.launch();

async function open(width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Fonts come from Google Fonts; tests must not depend on the network.
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(PAGE);
  return { page, errors };
}

async function translate(page, text, lang) {
  await page.fill("#labelText", text);
  await page.click("#go");
  if (lang) await page.click(`#langs button[data-code="${lang}"]`);
  return page.evaluate(() => ({
    text: document.getElementById("out").innerText,
    badge: document.querySelector("#out .badge")?.textContent ?? "",
  }));
}

// 1. Every sample in every language renders completely, with no gaps.
{
  const { page, errors } = await open();
  const langs = await page.$$eval("#langs button", (bs) => bs.map((b) => b.dataset.code));
  const samples = await page.$$eval("#paneSample button", (bs) => bs.length);
  let gaps = [];
  for (let s = 0; s < samples; s++) {
    for (const lang of langs) {
      await page.click(`#langs button[data-code="${lang}"]`);
      await page.locator("#paneSample button").nth(s).click();
      const out = await page.locator("#out").innerText();
      if (/\bundefined\b|\bnull\b|\bNaN\b|\{[a-z]\}/.test(out)) gaps.push(`sample ${s + 1} in ${lang}`);
    }
  }
  check(`all ${samples} samples render in all ${langs.length} language options without gaps`, gaps.length === 0, gaps.join(", "));
  check("no script errors while switching samples and languages", errors.length === 0, errors.join("; "));
  await page.close();
}

// 2. Safety behaviour.
{
  const { page } = await open();
  let r = await translate(page, "PREDNISOLONE 25MG TABLETS\nTake TWO tablets daily for 3 days then ONE tablet daily for 3 days then stop.", "fa");
  check("a reducing dose is refused", r.badge === "Refused for safety");
  r = await translate(page, "Use as directed.", "ar");
  check('"as directed" is refused', r.badge === "Refused for safety");
  r = await translate(page, "METHOTREXATE 10MG TABLETS\nTake ONE tablet once a week on Monday.", "zh");
  check("a weekly medicine is refused", r.badge === "Refused for safety");
  r = await translate(page, "Take 10 tablets twice a day.", "vi");
  check("an unusual dose is flagged for the pharmacist", /unusual|bất thường/i.test(r.text));
  r = await translate(page, "x".repeat(4001), "en");
  check("text far longer than any label is refused", r.badge === "Refused for safety");
  r = await translate(page, "METFORMIN 500MG TABLETS\nTake ONE tablet TWICE a day with food.", "en");
  check("a normal label is fully translated", r.badge === "Fully translated" && /Twice a day/.test(r.text));
  // The check question marks the right answer as correct.
  await page.locator(".quiz .opts button", { hasText: /^1 tablet$/ }).first().click();
  const fb = await page.locator(".quiz .fb").first().textContent();
  check("the check question accepts the right answer", fb === "Correct.");
  await page.close();
}

// 3. Security: label text is always shown as text, never run as code.
{
  const { page, errors } = await open();
  const attacks = [
    '<img src=x onerror="window.__pwned=1">\nTake one tablet twice a day.',
    'Take one tablet twice a day.\n<script>window.__pwned=1</script>',
    'PANADOL"><svg onload="window.__pwned=1"> 500MG\nTake one tablet twice a day.',
    "Take one tablet twice a day. javascript:window.__pwned=1",
  ];
  for (const attack of attacks) {
    for (const lang of ["en", "fa", "ar"]) await translate(page, attack, lang);
  }
  const pwned = await page.evaluate(() => window.__pwned === 1);
  const injected = await page.$$eval("#out img, #out script, #out iframe", (els) => els.length);
  check("markup in label text never runs", !pwned && errors.length === 0, errors.join("; "));
  check("markup in label text never becomes page elements", injected === 0, `${injected} injected elements`);
  const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.content);
  check("a Content-Security-Policy blocks plug-ins, base tags and form posts", /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp));
  check("the label box limits length", (await page.getAttribute("#labelText", "maxlength")) === "4000");
  await page.close();
}

// 4. Works on phone, tablet and laptop widths without sideways scrolling.
for (const width of [360, 768, 1280]) {
  const { page } = await open(width);
  for (const lang of ["fa", "ta", "en"]) await translate(page, "PARACETAMOL 500MG TABLETS\nTake 1 to 2 tablets every 4 to 6 hours when required for pain.\nDo not take more than 8 tablets in 24 hours.", lang);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no sideways scrolling at ${width}px wide`, overflow <= 0, `${overflow}px too wide`);
  await page.close();
}

// 5. Right-to-left languages are marked as such.
{
  const { page } = await open();
  await translate(page, "Take one tablet twice a day.", "ar");
  const rtl = await page.$$eval('#out [lang="ar"]', (els) => els.length > 0 && els.every((e) => !e.hasAttribute("dir") || e.getAttribute("dir") === "rtl"));
  check("Arabic text is laid out right to left", rtl);
  await page.close();
}

await browser.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
