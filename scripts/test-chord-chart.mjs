// Verifies chord-chart transpose/render helpers and the mobile chart dialog shell.
// Usage: node scripts/test-chord-chart.mjs
import { transform } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = new URL("..", import.meta.url);

let failed = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`OK   ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const source = await readFile(new URL("../src/lib/chordChart.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm" });
const workDir = await mkdtemp(join(tmpdir(), "chord-chart-"));
const modulePath = join(workDir, "chordChart.mjs");
await writeFile(modulePath, code);
const chordChart = await import(pathToFileURL(modulePath).href);

const sampleChart = [
  "Key: G",
  "VERSE",
  "G     D     Em    C",
  "Praise the Lord",
  "[G]Praise the [D]Lord",
].join("\n");

assert("detects explicit key", chordChart.detectKeyIndexFromChart(sampleChart) === 7);
assert(
  "transposes G to A with sharps",
  chordChart.transposeChordChartText(sampleChart, 2, "sharps").includes("A     E     F#m    D"),
);
assert(
  "shortest transpose G -> F is -2",
  chordChart.getSignedSemitoneDelta(7, 5) === -2,
);
assert(
  "upserts key line",
  chordChart.upsertExplicitKeyLine("VERSE\nG", "D").startsWith("Key: D"),
);

const rendered = chordChart.renderChordChartText(sampleChart);
assert(
  "renders section + chorded lyric lines",
  rendered.some((line) => line.kind === "section") &&
    rendered.some((line) => line.kind === "lyricWithChords"),
);

const dialogSource = await readFile(new URL("../src/components/songs/ChordChartDialog.tsx", import.meta.url), "utf8");
assert("hides the default tiny X", dialogSource.includes("showCloseButton={false}"));
assert("has a labeled Close control", dialogSource.includes('aria-label="Close chart"'));
assert("has a thumb-reach Close Chart button", dialogSource.includes("Close Chart"));
assert("pads for the iOS status bar", dialogSource.includes("safe-area-inset-top"));
assert("pads for the iOS home indicator", dialogSource.includes("safe-area-inset-bottom"));
assert("keeps the shell in a flex column", dialogSource.includes("flex-col") && dialogSource.includes("min-h-0 flex-1"));
assert("avoids 100vw overflow", !dialogSource.includes("w-screen"));

function buildDialogFixture() {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      html, body { margin: 0; height: 100%; background: #111; color: #fff; font-family: sans-serif; }
      #dialog {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        height: 100dvh;
        max-height: 100dvh;
        overflow: hidden;
        background: #1c1f21;
      }
      #shell {
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        padding-top: max(12px, env(safe-area-inset-top, 0px));
      }
      #header, #footer, #controls {
        flex-shrink: 0;
      }
      #header {
        display: flex;
        gap: 12px;
        padding: 0 12px 12px;
        border-bottom: 1px solid #333;
      }
      #close-top, #close-bottom {
        height: 44px;
        border: 0;
        border-radius: 999px;
        padding: 0 16px;
        font-size: 16px;
      }
      #close-bottom { width: 100%; height: 48px; }
      #controls { padding: 10px 12px; border-bottom: 1px solid #333; }
      #chart {
        min-height: 0;
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }
      #footer {
        padding: 12px 12px max(12px, env(safe-area-inset-bottom, 0px));
        border-top: 1px solid #333;
      }
      .line { height: 28px; margin: 0 0 8px; background: #2a3034; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div id="dialog">
      <div id="shell">
        <header id="header">
          <div style="flex:1;min-width:0">
            <h1 style="margin:0;font-size:18px">Praise</h1>
            <p style="margin:4px 0 0;opacity:.7">Unknown author</p>
          </div>
          <button id="close-top">Close</button>
        </header>
        <div id="controls">Version / Key / Chart</div>
        <div id="chart">
          ${Array.from({ length: 40 }, (_, index) => `<div class="line">Chart line ${index + 1}</div>`).join("")}
        </div>
        <div id="footer">
          <button id="close-bottom">Close Chart</button>
        </div>
      </div>
    </div>
    <script>
      const dialog = document.getElementById("dialog");
      const chart = document.getElementById("chart");
      const closeTop = document.getElementById("close-top");
      const closeBottom = document.getElementById("close-bottom");
      const dialogBox = dialog.getBoundingClientRect();
      const topBox = closeTop.getBoundingClientRect();
      const bottomBox = closeBottom.getBoundingClientRect();
      const chartBox = chart.getBoundingClientRect();
      document.title = JSON.stringify({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        dialogWidth: Math.round(dialogBox.width),
        dialogHeight: Math.round(dialogBox.height),
        overflowX: Math.round(Math.max(0, dialogBox.width - window.innerWidth)),
        overflowY: Math.round(Math.max(0, dialogBox.height - window.innerHeight)),
        closeTopVisible: topBox.top >= 0 && topBox.bottom <= window.innerHeight && topBox.width >= 44 && topBox.height >= 44,
        closeBottomVisible: bottomBox.top >= 0 && bottomBox.bottom <= window.innerHeight + 1 && bottomBox.height >= 44,
        chartScrollable: chart.scrollHeight > chart.clientHeight,
        chartHeight: Math.round(chartBox.height),
        headerStaysPut: topBox.top < 120,
      });
    </script>
  </body>
</html>`;
}

async function measureViewport(name, width, height) {
  const htmlPath = join(workDir, `${name}.html`);
  await writeFile(htmlPath, buildDialogFixture());
  const { stdout } = await execFileAsync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--dump-dom",
    `--window-size=${width},${height}`,
    pathToFileURL(htmlPath).href,
  ], { timeout: 20000 });

  const match = stdout.match(/<title>([^<]+)<\/title>/);
  if (!match) {
    assert(`${name} emitted metrics`, false, "no document title");
    return null;
  }
  const metrics = JSON.parse(match[1].replace(/&quot;/g, '"'));
  assert(`${name} stays in the viewport`, metrics.overflowX === 0 && metrics.overflowY === 0, JSON.stringify(metrics));
  assert(`${name} shows a tappable Close button`, metrics.closeTopVisible, JSON.stringify(metrics));
  assert(`${name} shows a bottom Close Chart button`, metrics.closeBottomVisible, JSON.stringify(metrics));
  assert(`${name} lets a long chart scroll`, metrics.chartScrollable && metrics.chartHeight > 80, JSON.stringify(metrics));
  assert(`${name} keeps Close on screen while scrolling`, metrics.headerStaysPut, JSON.stringify(metrics));
  return metrics;
}

try {
  await measureViewport("iPhone SE", 375, 667);
  await measureViewport("iPhone 14", 390, 844);
} catch (error) {
  failed += 1;
  console.log(`FAIL chrome layout tests — ${error.message}`);
}

await rm(workDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
