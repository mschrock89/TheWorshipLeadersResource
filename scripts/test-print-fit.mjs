// Verifies the Service Flow print layout fits on exactly one landscape-letter
// page, including the runtime zoom-to-fit logic from printServiceFlowDocument.
// Usage: node scripts/test-print-fit.mjs
import { transform } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const source = await readFile(
  new URL("../src/components/service-flow/printServiceFlowDocument.ts", import.meta.url),
  "utf8",
);
const { code } = await transform(source, { loader: "ts", format: "esm" });

const workDir = await mkdtemp(join(tmpdir(), "print-fit-"));
const modulePath = join(workDir, "printServiceFlowDocument.mjs");
await writeFile(modulePath, code);
const { buildPrintHtml } = await import(pathToFileURL(modulePath).href);

const item = (title, duration, extra = {}) => ({
  id: title,
  title,
  type: "other",
  duration,
  ...extra,
});

// Mirrors the flow from the reported screenshot (12 items across 4 sections).
const service = {
  title: "Weekend Worship",
  date: "2026-07-25",
  totalTime: "1:27:19",
  sections: [
    {
      id: "pre",
      title: "Pre-Service",
      items: [item("iPod Music", "30:00"), item("Pre-Roll Video", "03:44")],
    },
    {
      id: "ann",
      title: "Anncouncements",
      items: [
        item("Andrew Wheeler", "00:30"),
        item("PSA Video", "00:45"),
        item("Andrew Wheeler", "03:00"),
      ],
    },
    {
      id: "set",
      title: "Worship Set",
      items: [
        item("Praise", "TBD", { bpm: 127, key: "G", leader: "Mark Green" }),
        item("I Speak Jesus", "TBD", { bpm: 74, key: "E", leader: "Kyle Elkins, Courtney Gadson" }),
        item("Living Hope", "TBD", { bpm: 72, key: "A", leader: "Tamara Wagner" }),
        item("Gratitude", "TBD", { bpm: 78, key: "A", leader: "Kyle Elkins" }),
      ],
    },
    {
      id: "lesson",
      title: "Lesson",
      items: [
        item("Bumper Video", "01:20"),
        item("Corey", "45:00"),
        item("Andrew Wheeler", "03:00"),
      ],
    },
  ],
};

// Inline the same fit logic the app applies to the iframe before printing.
const fitScript = `<script>
  window.addEventListener("load", () => {
    const pair = document.querySelector(".pair");
    const sheets = [...document.querySelectorAll(".sheet")];
    const bodyStyle = getComputedStyle(document.body);
    const available =
      document.body.clientHeight -
      parseFloat(bodyStyle.paddingTop) -
      parseFloat(bodyStyle.paddingBottom);
    pair.style.height = "auto";
    pair.style.width = "100%";
    pair.style.removeProperty("zoom");
    for (const sheet of sheets) sheet.style.height = "auto";
    const needed = pair.scrollHeight;
    for (const sheet of sheets) sheet.style.height = "";
    if (needed <= available || available <= 0) {
      pair.style.height = "";
    } else {
      const scale = (available / needed) * 0.995;
      pair.style.width = "100%";
      pair.style.height = (available / scale).toFixed(2) + "px";
      pair.style.setProperty("zoom", scale.toFixed(4));
    }
    const bodyPadL = parseFloat(bodyStyle.paddingLeft);
    const bodyPadR = parseFloat(bodyStyle.paddingRight);
    const bodyBox = document.body.getBoundingClientRect();
    const pairBox = pair.getBoundingClientRect();
    const sheetBoxes = sheets.map((sheet) => sheet.getBoundingClientRect());
    const contentRight = bodyBox.right - bodyPadR;
    const contentLeft = bodyBox.left + bodyPadL;
    const overflowRight = Math.max(0, pairBox.right - contentRight);
    const sheetWidthDelta = Math.abs((sheetBoxes[0]?.width || 0) - (sheetBoxes[1]?.width || 0));
    document.title = JSON.stringify({
      needed,
      available,
      zoom: pair.style.zoom || "1",
      overflowRight: Math.round(overflowRight * 100) / 100,
      sheetWidthDelta: Math.round(sheetWidthDelta * 100) / 100,
      pairWidth: Math.round(pairBox.width * 100) / 100,
      contentWidth: Math.round((contentRight - contentLeft) * 100) / 100,
    });
  });
</script>`;

async function measureFit(name, html) {
  const htmlPath = join(workDir, `${name}.html`);
  await writeFile(htmlPath, html.replace("</body>", `${fitScript}</body>`));
  const { stdout } = await execFileAsync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--window-size=1056,816",
    "--virtual-time-budget=5000",
    "--dump-dom",
    pathToFileURL(htmlPath).href,
  ]);
  const title = stdout.match(/<title>([^<]*)<\/title>/)?.[1] || "{}";
  try {
    return JSON.parse(title);
  } catch {
    return { error: title };
  }
}

async function printAndCountPages(name, html) {
  const htmlPath = join(workDir, `${name}.html`);
  const pdfPath = join(workDir, `${name}.pdf`);
  await writeFile(htmlPath, html.replace("</body>", `${fitScript}</body>`));

  await execFileAsync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--window-size=1056,816",
    "--virtual-time-budget=5000",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ]);

  if (process.env.DEBUG_FIT) {
    const metrics = await measureFit(`${name}-debug`, html);
    console.log(`  debug ${name}:`, metrics);
  }

  const pdf = await readFile(pdfPath);
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  return pages;
}

let failed = false;

function checkLayout(name, metrics) {
  const overflowOk = (metrics.overflowRight ?? 99) <= 1;
  const equalCols = (metrics.sheetWidthDelta ?? 99) <= 2;
  console.log(
    `${name} layout: overflowRight=${metrics.overflowRight} sheetΔ=${metrics.sheetWidthDelta} zoom=${metrics.zoom} ${overflowOk && equalCols ? "OK" : "FAIL"}`,
  );
  if (!overflowOk || !equalCols) failed = true;
}

const baseHtml = buildPrintHtml(service);
const basePages = await printAndCountPages("base", baseHtml);
console.log(`12-item flow: ${basePages} page(s) ${basePages === 1 ? "OK" : "FAIL"}`);
if (basePages !== 1) failed = true;
checkLayout("12-item", await measureFit("base-metrics", baseHtml));

// Stress test: a much longer flow must still compress onto one page.
const bigService = {
  ...service,
  sections: [
    ...service.sections,
    {
      id: "extra",
      title: "Extra Long Section",
      items: Array.from({ length: 8 }, (_, i) =>
        item(`Extra Item ${i + 1}`, "05:00", { bpm: 120, key: "C", leader: "Somebody Longname" }),
      ),
    },
  ],
};
const bigHtml = buildPrintHtml(bigService);
const bigPages = await printAndCountPages("big", bigHtml);
console.log(`20-item flow: ${bigPages} page(s) ${bigPages === 1 ? "OK" : "FAIL"}`);
if (bigPages !== 1) failed = true;
checkLayout("20-item", await measureFit("big-metrics", bigHtml));

// Short flow should still be a single full-height page.
const smallService = { ...service, sections: service.sections.slice(0, 2) };
const smallHtml = buildPrintHtml(smallService);
const smallPages = await printAndCountPages("small", smallHtml);
console.log(`5-item flow: ${smallPages} page(s) ${smallPages === 1 ? "OK" : "FAIL"}`);
if (smallPages !== 1) failed = true;
checkLayout("5-item", await measureFit("small-metrics", smallHtml));

await rm(workDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
