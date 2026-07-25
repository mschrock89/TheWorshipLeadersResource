import type { Service } from "./ServiceFlow";

const BRAND = {
  blue: "#35B0E5",
  blueDark: "#27749D",
  teal: "#008DB3",
  yellow: "#FFB838",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  sectionBg: "#f1f5f9",
} as const;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatServiceDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function splitServiceTitle(title: string) {
  const match = title.match(/^(.+?)\s+(Worship|Service|Night)$/i);
  if (match) {
    return { primary: match[1].trim(), secondary: match[2] };
  }
  return { primary: title.trim(), secondary: null as string | null };
}

export function buildPrintHtml(service: Service) {
  const { primary, secondary } = splitServiceTitle(service.title);
  const formattedDate = formatServiceDate(service.date);

  const sectionsHtml = service.sections
    .map((section) => {
      const itemsHtml = section.items
        .map((item) => {
          const metaParts = [
            typeof item.bpm === "number" ? `${item.bpm} BPM` : "",
            item.key ? `Key ${escapeHtml(item.key)}` : "",
            item.leader ? escapeHtml(item.leader) : "",
          ].filter(Boolean);

          return `<li class="item">
            <div class="item-main">
              <span class="item-title">${escapeHtml(item.title)}</span>
              ${metaParts.length > 0 ? `<span class="item-meta">${metaParts.join(" · ")}</span>` : ""}
            </div>
            <span class="item-duration">${escapeHtml(item.duration || "")}</span>
          </li>`;
        })
        .join("");

      return `<section class="section">
        <h2 class="section-title">${escapeHtml(section.title)}</h2>
        <ul class="items">${itemsHtml}</ul>
      </section>`;
    })
    .join("");

  const sheet = `<article class="sheet">
    <header class="sheet-header">
      <div class="sheet-heading">
        <p class="sheet-kicker">Service Flow</p>
        <h1 class="sheet-title">
          <span class="sheet-title-primary">${escapeHtml(primary)}</span>${secondary ? `<span class="sheet-title-secondary">${escapeHtml(secondary)}</span>` : ""}
        </h1>
        <p class="sheet-date">${escapeHtml(formattedDate)}</p>
      </div>
      <div class="sheet-total">
        <p class="sheet-total-label">Total</p>
        <p class="sheet-total-value">${escapeHtml(service.totalTime)}</p>
      </div>
    </header>
    <div class="sheet-body">${sectionsHtml}</div>
  </article>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(service.title)} Service Flow</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Nunito+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: letter landscape;
      margin: 0;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: ${BRAND.ink};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: "Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
      padding: 0.2in;
      /* Exactly one landscape-letter page; anything taller is scaled down to fit. */
      height: 8.5in;
      overflow: hidden;
    }

    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.22in;
      align-items: stretch;
      height: 100%;
    }

    .sheet {
      border: 1px solid ${BRAND.line};
      border-radius: 10px;
      overflow: hidden;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .sheet-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.16in;
      padding: 0.2in 0.2in 0.18in;
      background: linear-gradient(135deg, ${BRAND.sectionBg} 0%, #fff 100%);
      border-bottom: 2px solid ${BRAND.blueDark};
    }

    .sheet-kicker {
      margin: 0 0 5px;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: ${BRAND.blue};
    }

    .sheet-title {
      margin: 0;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 0;
      line-height: 1.08;
    }

    .sheet-title-primary {
      display: block;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: ${BRAND.blueDark};
    }

    .sheet-title-secondary {
      display: block;
      margin-top: 4px;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: ${BRAND.teal};
    }

    .sheet-date {
      margin: 8px 0 0;
      font-size: 14px;
      font-weight: 600;
      color: ${BRAND.muted};
    }

    .sheet-total {
      flex-shrink: 0;
      text-align: right;
      padding-top: 4px;
    }

    .sheet-total-label {
      margin: 0;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${BRAND.muted};
    }

    .sheet-total-value {
      margin: 5px 0 0;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 22px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: ${BRAND.ink};
    }

    .sheet-body {
      flex: 1 1 auto;
      padding: 0.16in 0.18in 0.2in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.16in;
      min-height: 0;
    }

    .section {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .section-title {
      margin: 0 0 0.08in;
      padding: 0.06in 0.1in;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: ${BRAND.blueDark};
      background: ${BRAND.sectionBg};
      border-left: 4px solid ${BRAND.blue};
      border-radius: 0 4px 4px 0;
    }

    .items {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
    }

    .item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.12in;
      padding: 0.09in 0;
      border-bottom: 1px solid ${BRAND.line};
    }

    .item:last-child {
      border-bottom: none;
    }

    .item-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.04in;
    }

    .item-title {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.25;
      color: ${BRAND.ink};
    }

    .item-meta {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.35;
      color: ${BRAND.muted};
    }

    .item-duration {
      flex-shrink: 0;
      min-width: 0.54in;
      padding: 0.04in 0.07in;
      border: 1px solid ${BRAND.line};
      border-radius: 999px;
      background: #fff;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 12px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-align: center;
      color: ${BRAND.ink};
    }
  </style>
</head>
<body>
  <div class="pair">
    ${sheet}
    ${sheet}
  </div>
</body>
</html>`;
}

/**
 * Print a service flow without touching the Calendar React tree.
 * Uses a detached iframe so we never run window.print() against the live app document
 * (which can freeze Electron / Cursor when the Calendar DOM is huge).
 */
export function printServiceFlowDocument(service: Service) {
  const html = buildPrintHtml(service);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Service Flow Print");
  iframe.setAttribute("aria-hidden", "true");
  // Match the printed page size (letter landscape at 96dpi) so on-screen layout
  // measurements agree with the print layout. Kept invisible and inert.
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:11in;height:8.5in;border:0;opacity:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    throw new Error("Couldn't open print frame.");
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    frameWindow.removeEventListener("afterprint", cleanup);
    iframe.remove();
  };

  frameWindow.addEventListener("afterprint", cleanup);

  // If the sheets are taller than one page, shrink them uniformly so the whole
  // flow always prints on a single landscape-letter page. `zoom` (unlike
  // transform) affects layout, so the second page disappears entirely; the
  // width is compensated so both columns still span the full page.
  const fitSheetsToOnePage = () => {
    const pair = frameDocument.querySelector<HTMLElement>(".pair");
    if (!pair) return;
    const bodyStyle = frameWindow.getComputedStyle(frameDocument.body);
    const available =
      frameDocument.body.clientHeight -
      parseFloat(bodyStyle.paddingTop) -
      parseFloat(bodyStyle.paddingBottom);

    // The sheets clip their own overflow, so the natural content height is only
    // measurable with the page-height constraint released.
    pair.style.height = "auto";
    const needed = pair.scrollHeight;

    if (needed <= available || available <= 0) {
      pair.style.height = "";
      return;
    }

    const scale = (available / needed) * 0.995;
    pair.style.width = `${(100 / scale).toFixed(4)}%`;
    pair.style.setProperty("zoom", scale.toFixed(4));
  };

  // Wait for the web fonts so the fit measurement (and the printout) use the
  // final glyph metrics; cap the wait so printing never hangs on a slow font.
  const fontsReady: Promise<unknown> = frameDocument.fonts
    ? Promise.race([
        frameDocument.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ])
    : Promise.resolve();

  fontsReady.then(() => {
    // One frame to lay out with the loaded fonts, another to apply the fit.
    frameWindow.requestAnimationFrame(() => {
      fitSheetsToOnePage();
      frameWindow.requestAnimationFrame(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } finally {
          // Fallback if afterprint never fires (some WebViews).
          window.setTimeout(cleanup, 2000);
        }
      });
    });
  });
}
