import type { TeamScheduleExportDocument } from "./buildTeamScheduleExport";

const BRAND = {
  blue: "#35B0E5",
  blueDark: "#27749D",
  teal: "#008DB3",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  sectionBg: "#f1f5f9",
  empty: "#94a3b8",
} as const;

const MAX_TEAMS_PER_TABLE = 4;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chunkTeams<T>(items: T[], size: number) {
  if (items.length <= size) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function renderCell(cell: TeamScheduleExportDocument["sections"][number]["rows"][number]["cells"][number]) {
  if (cell.notUsed) {
    return `<span class="empty">—</span>`;
  }

  const overridesHtml = cell.overrides
    .map(
      (override) =>
        `<div class="override">${escapeHtml(override.dateLabel)} · ${escapeHtml(override.memberName)}</div>`,
    )
    .join("");

  if (cell.isBlank && cell.overrides.length === 0) {
    return `<span class="empty">Open</span>`;
  }

  if (cell.isEmpty && cell.overrides.length === 0) {
    return `<span class="empty">—</span>`;
  }

  const baseName = cell.memberName
    ? `<div class="name">${escapeHtml(cell.memberName)}</div>`
    : cell.isBlank
      ? `<div class="name empty">Open</div>`
      : "";

  return `${baseName}${overridesHtml}`;
}

function renderTable(
  documentData: TeamScheduleExportDocument,
  teamIndexes: number[],
) {
  const teams = teamIndexes.map((index) => documentData.teams[index]);
  const columnCount = teams.length + 1;

  const headCells = teams
    .map((team) => {
      const dates = team.scheduleDates.length
        ? `<p class="team-dates">${escapeHtml(team.scheduleDates.join(" · "))}</p>`
        : "";

      return `<th class="team-col">
        <div class="team-swatch" style="background:${escapeHtml(team.color)}"></div>
        <p class="team-name">${escapeHtml(team.name)}</p>
        ${dates}
      </th>`;
    })
    .join("");

  const body = documentData.sections
    .map((section) => {
      const sectionRow = `<tr class="section-row">
        <th colspan="${columnCount}">${escapeHtml(section.title)}</th>
      </tr>`;

      const slotRows = section.rows
        .map((row) => {
          const cells = teamIndexes
            .map((teamIndex) => `<td>${renderCell(row.cells[teamIndex])}</td>`)
            .join("");

          return `<tr>
            <th class="slot-label">${escapeHtml(row.label)}</th>
            ${cells}
          </tr>`;
        })
        .join("");

      return `${sectionRow}${slotRows}`;
    })
    .join("");

  return `<table>
    <thead>
      <tr>
        <th class="slot-label">Position</th>
        ${headCells}
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

export function buildTeamSchedulePrintHtml(documentData: TeamScheduleExportDocument) {
  const periodMeta = [documentData.periodName, documentData.periodRange].filter(Boolean).join("  ·  ");
  const teamChunks = chunkTeams(
    documentData.teams.map((_, index) => index),
    documentData.teams.length <= 5 ? documentData.teams.length : MAX_TEAMS_PER_TABLE,
  );
  const tablesHtml = teamChunks.map((indexes) => renderTable(documentData, indexes)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentData.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Nunito+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: letter landscape;
      margin: 0.42in 0.4in 0.38in;
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
      font-size: 12px;
      line-height: 1.35;
    }

    .sheet-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 2px solid ${BRAND.blueDark};
    }

    .kicker {
      margin: 0 0 4px;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: ${BRAND.blue};
    }

    h1 {
      margin: 0;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: ${BRAND.blueDark};
    }

    .meta {
      margin: 4px 0 0;
      font-size: 13px;
      font-weight: 600;
      color: ${BRAND.muted};
    }

    .generated {
      flex-shrink: 0;
      text-align: right;
      font-size: 11px;
      font-weight: 600;
      color: ${BRAND.muted};
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 18px;
      page-break-inside: auto;
    }

    thead {
      display: table-header-group;
    }

    th, td {
      vertical-align: top;
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid ${BRAND.line};
    }

    .slot-label {
      width: 1.35in;
      font-size: 11px;
      font-weight: 700;
      color: ${BRAND.muted};
    }

    .team-col {
      background: ${BRAND.sectionBg};
      border-bottom: 2px solid ${BRAND.blueDark};
    }

    .team-swatch {
      width: 100%;
      height: 4px;
      border-radius: 999px;
      margin-bottom: 6px;
    }

    .team-name {
      margin: 0;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 13px;
      font-weight: 800;
      color: ${BRAND.ink};
    }

    .team-dates {
      margin: 4px 0 0;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.35;
      color: ${BRAND.muted};
    }

    .section-row th {
      padding: 8px;
      font-family: "Montserrat", "Nunito Sans", sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: ${BRAND.blueDark};
      background: ${BRAND.sectionBg};
      border-left: 4px solid ${BRAND.blue};
      border-bottom: 1px solid ${BRAND.line};
    }

    tbody tr {
      page-break-inside: avoid;
    }

    .name {
      font-size: 12px;
      font-weight: 700;
      color: ${BRAND.ink};
    }

    .empty {
      color: ${BRAND.empty};
      font-weight: 600;
    }

    .override {
      margin-top: 2px;
      font-size: 10px;
      font-weight: 600;
      color: ${BRAND.teal};
    }
  </style>
</head>
<body>
  <header class="sheet-header">
    <div>
      <p class="kicker">Team Schedule</p>
      <h1>${escapeHtml(documentData.campusName)} · ${escapeHtml(documentData.ministryLabel)}</h1>
      <p class="meta">${escapeHtml(periodMeta)}</p>
    </div>
    <p class="generated">Exported ${escapeHtml(documentData.generatedLabel)}</p>
  </header>
  ${tablesHtml}
</body>
</html>`;
}

/**
 * Print a Team Builder roster without touching the live app document.
 * Uses a detached iframe so window.print() never runs against the React tree.
 */
export function printTeamScheduleDocument(documentData: TeamScheduleExportDocument) {
  const html = buildTeamSchedulePrintHtml(documentData);
  const iframe = window.document.createElement("iframe");
  iframe.setAttribute("title", "Team Schedule Print");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:11in;height:8.5in;border:0;opacity:0;visibility:hidden;pointer-events:none;";
  window.document.body.appendChild(iframe);

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

  const fontsReady: Promise<unknown> = frameDocument.fonts
    ? Promise.race([
        frameDocument.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ])
    : Promise.resolve();

  fontsReady.then(() => {
    frameWindow.requestAnimationFrame(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } finally {
        window.setTimeout(cleanup, 2000);
      }
    });
  });
}
