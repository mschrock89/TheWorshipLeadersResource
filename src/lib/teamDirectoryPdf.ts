import { jsPDF } from "jspdf";
import { format } from "date-fns";

export interface TeamDirectoryPdfMinistry {
  label: string;
  positions: string[];
}

export interface TeamDirectoryPdfMember {
  name: string;
  email: string;
  phone: string;
  campuses: string[];
  ministries: TeamDirectoryPdfMinistry[];
}

export interface TeamDirectoryPdfOptions {
  members: TeamDirectoryPdfMember[];
  countLabel: string;
  filters: string[];
  logoDataUrl?: string | null;
  generatedAt?: Date;
}

type RGB = readonly [number, number, number];

// ECC brand blue #35B0E5, with the brand yellow rule #FFB838.
const COLOR = {
  page: [255, 255, 255] as RGB,
  header: [53, 176, 229] as RGB,
  headerInk: [255, 255, 255] as RGB,
  headerMuted: [255, 255, 255] as RGB,
  yellow: [255, 184, 56] as RGB,
  blue: [53, 176, 229] as RGB,
  ink: [23, 42, 58] as RGB,
  muted: [70, 90, 104] as RGB,
  line: [214, 232, 240] as RGB,
  zebra: [232, 246, 252] as RGB,
  columns: [53, 176, 229] as RGB,
};

const MARGIN_X = 28;
const HEADER_H = 52;
const FOOTER_H = 28;
const ROW_H = 16;
const HEAD_H = 18;

const COLUMNS = [
  { key: "name", label: "Name", width: 148 },
  { key: "campus", label: "Campus", width: 118 },
  { key: "phone", label: "Phone", width: 92 },
  { key: "email", label: "Email", width: 188 },
  { key: "positions", label: "Positions", width: 190 },
] as const;

function fill(doc: jsPDF, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function ink(doc: jsPDF, color: RGB) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function stroke(doc: jsPDF, color: RGB) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function printable(value: string, fallback = ""): string {
  const cleaned = value
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\u0020-\u007E\u00A1-\u00FF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function truncate(doc: jsPDF, text: string, width: number, size: number, style: "normal" | "bold" = "normal"): string {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  if (doc.getTextWidth(text) <= width) return text;

  let trimmed = text;
  while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}...`) > width) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

function positionSummary(member: TeamDirectoryPdfMember): string {
  const seen = new Set<string>();
  const labels: string[] = [];

  member.ministries.forEach((ministry) => {
    ministry.positions.forEach((position) => {
      const label = printable(position);
      if (!label || seen.has(label.toLowerCase())) return;
      seen.add(label.toLowerCase());
      labels.push(label);
    });
  });

  return labels.join(", ");
}

function memberCells(member: TeamDirectoryPdfMember) {
  const campuses = member.campuses.map((campus) => printable(campus)).filter(Boolean);

  return {
    name: printable(member.name, "Unnamed"),
    campus: campuses.join(", "),
    phone: printable(member.phone),
    email: printable(member.email),
    positions: positionSummary(member),
  };
}

function drawHeader(
  doc: jsPDF,
  pageWidth: number,
  countLabel: string,
  filterSummary: string,
  generatedAt: Date,
  logoDataUrl?: string | null,
) {
  fill(doc, COLOR.header);
  doc.rect(0, 0, pageWidth, HEADER_H, "F");
  fill(doc, COLOR.yellow);
  doc.rect(0, HEADER_H, pageWidth, 3, "F");

  const logoSize = 28;
  const logoY = 12;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", MARGIN_X, logoY, logoSize, logoSize);
  } else {
    fill(doc, COLOR.blue);
    doc.roundedRect(MARGIN_X, logoY, logoSize, logoSize, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    ink(doc, COLOR.headerInk);
    doc.text("EM", MARGIN_X + logoSize / 2, logoY + 18, { align: "center" });
  }

  const titleX = MARGIN_X + logoSize + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  ink(doc, COLOR.headerInk);
  doc.text("Team Directory", titleX, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, COLOR.headerMuted);
  doc.text("Experience Community Church", titleX, 40);

  const right = pageWidth - MARGIN_X;
  doc.setFontSize(8);
  doc.text(format(generatedAt, "MMMM d, yyyy"), right, 22, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  ink(doc, COLOR.headerInk);
  doc.text(countLabel, right, 36, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, COLOR.headerMuted);
  doc.text(truncate(doc, filterSummary, 260, 8), right, 48, { align: "right" });
}

function drawColumnHeader(doc: jsPDF, y: number) {
  fill(doc, COLOR.columns);
  doc.rect(MARGIN_X, y, COLUMNS.reduce((sum, column) => sum + column.width, 0), HEAD_H, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  ink(doc, COLOR.headerInk);

  let x = MARGIN_X;
  COLUMNS.forEach((column) => {
    doc.text(column.label.toUpperCase(), x + 6, y + 12);
    x += column.width;
  });
}

function drawRow(
  doc: jsPDF,
  cells: ReturnType<typeof memberCells>,
  y: number,
  shaded: boolean,
) {
  const tableWidth = COLUMNS.reduce((sum, column) => sum + column.width, 0);
  if (shaded) {
    fill(doc, COLOR.zebra);
    doc.rect(MARGIN_X, y, tableWidth, ROW_H, "F");
  }

  stroke(doc, COLOR.line);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y + ROW_H, MARGIN_X + tableWidth, y + ROW_H);

  let x = MARGIN_X;
  COLUMNS.forEach((column) => {
    const value = cells[column.key];
    const style = column.key === "name" ? "bold" : "normal";
    const size = 8;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    ink(doc, column.key === "name" ? COLOR.ink : COLOR.muted);
    if (value) {
      doc.text(truncate(doc, value, column.width - 12, size, style), x + 6, y + 11);
    }
    x += column.width;
  });
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, page: number, total: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, COLOR.muted);
  doc.text("Worship team directory", MARGIN_X, pageHeight - 12);
  doc.text(`Page ${page} of ${total}`, pageWidth - MARGIN_X, pageHeight - 12, { align: "right" });
}

export function buildTeamDirectoryPdf(options: TeamDirectoryPdfOptions): jsPDF {
  const generatedAt = options.generatedAt ?? new Date();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentBottom = pageHeight - FOOTER_H;
  const filterSummary = options.filters.length > 0 ? options.filters.join("  ·  ") : "All team members";
  const rows = options.members.map(memberCells);

  doc.setProperties({
    title: "Team Directory",
    subject: "Experience Community Church team directory",
    creator: "Worship Leaders Resource",
  });

  const paintPage = () => {
    fill(doc, COLOR.page);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    drawHeader(doc, pageWidth, options.countLabel, filterSummary, generatedAt, options.logoDataUrl);
  };

  paintPage();
  let cursorY = HEADER_H + 12;
  drawColumnHeader(doc, cursorY);
  cursorY += HEAD_H;

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    ink(doc, COLOR.muted);
    doc.text("No team members to show.", MARGIN_X, cursorY + 22);
  }

  rows.forEach((row, index) => {
    if (cursorY + ROW_H > contentBottom) {
      doc.addPage();
      paintPage();
      cursorY = HEADER_H + 12;
      drawColumnHeader(doc, cursorY);
      cursorY += HEAD_H;
    }

    drawRow(doc, row, cursorY, index % 2 === 1);
    cursorY += ROW_H;
  });

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    drawFooter(doc, pageWidth, pageHeight, page, total);
  }

  return doc;
}

export function downloadTeamDirectoryPdf(options: TeamDirectoryPdfOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  const doc = buildTeamDirectoryPdf({ ...options, generatedAt });
  doc.save(`team-directory-${format(generatedAt, "yyyy-MM-dd")}.pdf`);
}

export async function loadTeamDirectoryLogo(src: string): Promise<string | null> {
  if (typeof document === "undefined") return null;

  try {
    const image = new Image();
    image.src = src;
    await image.decode();

    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) return null;

    sourceContext.drawImage(image, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    let minX = source.width;
    let minY = source.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const alpha = pixels[(y * source.width + x) * 4 + 3];
        if (alpha < 20) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) return null;

    const pad = 8;
    const cropX = Math.max(minX - pad, 0);
    const cropY = Math.max(minY - pad, 0);
    const cropWidth = Math.min(maxX - minX + 1 + pad * 2, source.width - cropX);
    const cropHeight = Math.min(maxY - minY + 1 + pad * 2, source.height - cropY);
    const output = document.createElement("canvas");
    output.width = cropWidth;
    output.height = cropHeight;
    const outputContext = output.getContext("2d");
    if (!outputContext) return null;

    outputContext.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return output.toDataURL("image/png");
  } catch {
    return null;
  }
}
