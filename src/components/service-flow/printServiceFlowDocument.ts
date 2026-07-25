import type { Service } from "./ServiceFlow";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintHtml(service: Service) {
  const sectionsHtml = service.sections
    .map((section) => {
      const itemsHtml = section.items
        .map((item) => {
          const meta = [item.key ? `Key ${escapeHtml(item.key)}` : "", item.leader ? escapeHtml(item.leader) : ""]
            .filter(Boolean)
            .join(" · ");
          return `<tr>
            <td class="title">${escapeHtml(item.title)}${meta ? `<div class="meta">${meta}</div>` : ""}</td>
            <td class="duration">${escapeHtml(item.duration || "")}</td>
          </tr>`;
        })
        .join("");

      return `<section class="section">
        <h2>${escapeHtml(section.title)}</h2>
        <table>
          <tbody>${itemsHtml}</tbody>
        </table>
      </section>`;
    })
    .join("");

  // Dual half-sheet copies for fold-over printing, self-contained (no app CSS).
  const sheet = `<article class="sheet">
    <header>
      <h1>${escapeHtml(service.title)}</h1>
      <p>${escapeHtml(service.date)} · Total ${escapeHtml(service.totalTime)}</p>
    </header>
    ${sectionsHtml}
  </article>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(service.title)} Service Flow</title>
  <style>
    @page { size: letter landscape; margin: 0.35in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 11px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111;
      background: #fff;
    }
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.25in;
      align-items: start;
    }
    .sheet {
      border: 1.5px solid #222;
      padding: 0.12in 0.14in;
      min-height: 7.5in;
    }
    header { margin-bottom: 0.08in; padding-bottom: 0.06in; border-bottom: 1px solid #333; }
    h1 { margin: 0; font-size: 16px; }
    header p { margin: 2px 0 0; font-size: 11px; color: #333; }
    .section { margin-top: 0.08in; }
    .section h2 {
      margin: 0 0 0.04in;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 1px solid #999;
      padding-bottom: 2px;
    }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 3px 2px; vertical-align: top; border-bottom: 1px solid #ddd; }
    td.title { width: 100%; }
    td.duration { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; padding-left: 8px; }
    .meta { font-size: 10px; color: #555; margin-top: 1px; }
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
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
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

  // Wait one frame so the iframe document paints before the print dialog.
  frameWindow.requestAnimationFrame(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      // Fallback if afterprint never fires (some WebViews).
      window.setTimeout(cleanup, 2000);
    }
  });
}
