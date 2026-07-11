import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

const WEEKEND_MINISTRY_ALIASES = ["weekend", "weekend_team", "sunday_am"];

type SyncRequest = {
  campusId?: string;
  ministryType?: string;
  sheetUrl?: string;
  sheetId?: string;
  sheetTab?: string | null;
  sheetRange?: string;
};

type ParsedRow = {
  weekend_date: string;
  campus_id?: string | null;
  campus_name?: string | null;
  book: string | null;
  chapter: number | null;
  chapter_reference: string | null;
  teacher_name: string | null;
  themes_manual: string[];
  psa_highlight: string | null;
  announcer_name: string | null;
};

type CampusRef = {
  id: string;
  name: string;
};

function jsonResponse(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function extractSheetId(input?: string | null): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed) && !trimmed.includes("/")) {
    return trimmed;
  }
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || null;
}

function getTeachingMinistryAliases(ministryType?: string | null): string[] {
  if (!ministryType) return [];
  if (WEEKEND_MINISTRY_ALIASES.includes(ministryType)) return WEEKEND_MINISTRY_ALIASES;
  return [ministryType];
}

function getWeekendKey(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay();
  if (day === 0) {
    date.setDate(date.getDate() - 1);
  } else if (day !== 6) {
    date.setDate(date.getDate() + (6 - day));
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeTeachingWeekDate(weekendDate: string, ministryType: string): string {
  return WEEKEND_MINISTRY_ALIASES.includes(ministryType) ? getWeekendKey(weekendDate) : weekendDate;
}

function formatDateParts(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeCsvYearToken(value: string | undefined, fallbackYear: number): number {
  if (!value?.trim()) return fallbackYear;
  const numericYear = Number.parseInt(value.trim(), 10);
  if (Number.isNaN(numericYear)) return fallbackYear;
  if (value.trim().length === 2) {
    return numericYear >= 70 ? 1900 + numericYear : 2000 + numericYear;
  }
  return numericYear;
}

function parseMonthToken(value: string): number | null {
  const normalized = value.trim().toLowerCase().slice(0, 3);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthIndex = months.indexOf(normalized);
  return monthIndex === -1 ? null : monthIndex + 1;
}

function normalizeCampusKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cell(row: string[] | undefined, index: number): string {
  return String(row?.[index] || "").trim();
}

function isYearMarkerRow(row: string[]): number | null {
  const first = cell(row, 0);
  if (!/^\d{4}$/.test(first)) return null;
  const year = Number.parseInt(first, 10);
  if (year < 2000 || year > 2100) return null;
  const otherContent = row.slice(1).some((value) => String(value || "").trim());
  return otherContent ? null : year;
}

function scoreCampusColumnMatch(header: string, campusName: string): number {
  const headerKey = normalizeCampusKey(header);
  const campusKey = normalizeCampusKey(campusName);
  if (!headerKey || !campusKey) return 0;
  if (headerKey === campusKey) return 100;

  const isNorthCampus = /north/.test(campusKey);
  const isCentralCampus = /central/.test(campusKey) || (/murfreesboro/.test(campusKey) && !isNorthCampus);
  const isCannonCampus = /cannon/.test(campusKey);
  const isShelbyvilleCampus = /shelbyville/.test(campusKey);
  const isTullahomaCampus = /tullahoma/.test(campusKey);
  const isMcMinnvilleCampus = /mcminnville/.test(campusKey);

  if (isNorthCampus) {
    if (/boronorth|murfreesboronorth/.test(headerKey)) return 95;
    if (headerKey === "north") return 80;
    // Plain "Murfreesboro" belongs to Central, not North.
    if (headerKey === "murfreesboro") return 0;
  }

  if (isCentralCampus) {
    if (headerKey === "murfreesboro" || headerKey === "central" || headerKey === "boro") return 95;
    if (/north/.test(headerKey)) return 0;
  }

  if (isCannonCampus && /cannon/.test(headerKey)) return 95;
  if (isShelbyvilleCampus && /shelbyville/.test(headerKey)) return 95;
  if (isTullahomaCampus && /tullahoma/.test(headerKey)) return 95;
  if (isMcMinnvilleCampus && /mcminnville/.test(headerKey)) return 95;

  if (campusKey.includes(headerKey) || headerKey.includes(campusKey)) return 70;
  return 0;
}

function findCampusColumnIndex(headerRow: string[], campusName: string): number {
  let bestIndex = -1;
  let bestScore = 0;
  headerRow.forEach((header, index) => {
    const score = scoreCampusColumnMatch(header, campusName);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 70 ? bestIndex : -1;
}

function isEccOverviewHeaderRow(row: string[]): boolean {
  const normalized = row.map((value) => normalizeHeader(String(value || "")));
  const hasWeekendDates = normalized.some((value) => value.includes("weekend_date") || value === "weekend_dates");
  const hasTeachingTopic = normalized.some((value) => value.includes("teaching_topic") || value === "topic");
  const hasCampus = row.some((value) =>
    /murfreesboro|cannon|shelbyville|tullahoma|boro\s*north|mcminnville/i.test(String(value || "")),
  );
  return hasWeekendDates && (hasTeachingTopic || hasCampus);
}

function parseScriptureReference(value: string): { book: string | null; chapter: number | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { book: null, chapter: null };
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.includes("resurrection") || normalized.includes("ressurection") || normalized.includes("easter")) {
    return { book: "Resurrection", chapter: 1 };
  }

  if (normalized.includes("baptism")) {
    return { book: "Baptism", chapter: 1 };
  }

  if (normalized === "vision" || normalized.includes("vision sunday") || normalized.includes("vision weekend")) {
    return { book: "Vision", chapter: 1 };
  }

  if (normalized.includes("child dedication") || normalized === "dedication") {
    return { book: "Child Dedication", chapter: 1 };
  }

  // Supports "1John 4", "1 John 4", "Acts 1:1-14", "John 3"
  const match = trimmed.match(/^((?:[1-3]\s*)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+)(?::\d+(?:\s*-\s*\d+)?)?/);
  if (!match) {
    return { book: null, chapter: null };
  }

  const rawBook = (match[1] || "").replace(/^([1-3])\s*/, "$1 ").replace(/\s+/g, " ").trim();
  const chapter = Number.parseInt(match[2] || "", 10);
  return {
    book: rawBook || null,
    chapter: Number.isNaN(chapter) || chapter < 1 ? null : chapter,
  };
}

function parseTopicToTeaching(topic: string): {
  book: string | null;
  chapter: number | null;
  chapter_reference: string | null;
  themes_manual: string[];
} {
  const trimmed = topic.trim();
  if (!trimmed) {
    return { book: null, chapter: null, chapter_reference: null, themes_manual: [] };
  }

  const parsed = parseScriptureReference(trimmed);
  if (parsed.book && parsed.chapter) {
    return {
      book: parsed.book,
      chapter: parsed.chapter,
      chapter_reference: trimmed,
      themes_manual: [],
    };
  }

  // Non-scripture weekend labels still become teaching weeks.
  return {
    book: trimmed,
    chapter: 1,
    chapter_reference: trimmed,
    themes_manual: [trimmed],
  };
}

function findCampusColumnMappings(
  headerRow: string[],
  campuses: CampusRef[],
): Array<{ columnIndex: number; campus: CampusRef; header: string }> {
  const reserved = new Set(
    headerRow
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => /weekend\s*dates?|^dates?$|teaching\s*topic|^topic$|passage|scripture/i.test(header))
      .map(({ index }) => index),
  );

  const mappings: Array<{ columnIndex: number; campus: CampusRef; header: string; score: number }> = [];
  const usedCampusIds = new Set<string>();

  headerRow.forEach((header, columnIndex) => {
    if (reserved.has(columnIndex) || !header.trim()) return;

    let bestCampus: CampusRef | null = null;
    let bestScore = 0;
    for (const campus of campuses) {
      // Network Wide is the sheet owner, not a teacher column.
      if (/network/.test(normalizeCampusKey(campus.name))) continue;
      const score = scoreCampusColumnMatch(header, campus.name);
      if (score > bestScore) {
        bestScore = score;
        bestCampus = campus;
      }
    }

    if (bestCampus && bestScore >= 70 && !usedCampusIds.has(bestCampus.id)) {
      usedCampusIds.add(bestCampus.id);
      mappings.push({ columnIndex, campus: bestCampus, header, score: bestScore });
    }
  });

  return mappings.sort((a, b) => a.columnIndex - b.columnIndex);
}

function parseEccOverviewRows(values: string[][], campuses: CampusRef[]): ParsedRow[] {
  const headerIndex = values.findIndex((row) => isEccOverviewHeaderRow(row));
  if (headerIndex === -1) {
    throw new Error("Could not find the ECC Overview header row (Weekend Dates / Teaching Topic / campuses).");
  }

  const headerRow = values[headerIndex].map((value) => String(value || "").trim());
  const campusMappings = findCampusColumnMappings(headerRow, campuses);
  if (campusMappings.length === 0) {
    throw new Error(
      "Could not map any campus columns. Expected headers like Murfreesboro, Cannon County, Shelbyville, Tullahoma, or Boro North.",
    );
  }

  const dateColumnIndex = headerRow.findIndex((value) => /weekend\s*dates?|dates?/i.test(value));
  const topicColumnIndex = headerRow.findIndex((value) => /teaching\s*topic|topic|passage|scripture/i.test(value));
  if (dateColumnIndex < 0) {
    throw new Error("Could not find the Weekend Dates column in the ECC Overview sheet.");
  }

  const rowMap = new Map<string, ParsedRow>();
  let currentYear: number | null = null;

  for (const rawRow of values.slice(headerIndex + 1)) {
    const yearMarker = isYearMarkerRow(rawRow);
    if (yearMarker) {
      currentYear = yearMarker;
      continue;
    }

    const dateValue = cell(rawRow, dateColumnIndex);
    if (!dateValue) continue;
    if (!currentYear) {
      // Never guess an older/current year for undated blocks — wait for an explicit year marker.
      continue;
    }

    const parsedDate = parseWeekendDateRange(dateValue, currentYear) || normalizeDateInput(dateValue, currentYear);
    if (!parsedDate) continue;

    // Guard against accidental year bleed if a date somehow resolves outside the active year block.
    const parsedYear = Number.parseInt(parsedDate.slice(0, 4), 10);
    if (parsedYear !== currentYear) continue;

    const topic = topicColumnIndex >= 0 ? cell(rawRow, topicColumnIndex) : "";
    const teaching = parseTopicToTeaching(topic);
    const weekendDate = getWeekendKey(parsedDate);

    for (const mapping of campusMappings) {
      const teacherName = cell(rawRow, mapping.columnIndex);
      if (!topic && !teacherName) continue;

      const key = `${mapping.campus.id}:${weekendDate}`;
      const existing = rowMap.get(key);

      rowMap.set(key, {
        weekend_date: weekendDate,
        campus_id: mapping.campus.id,
        campus_name: mapping.campus.name,
        book: teaching.book || existing?.book || null,
        chapter: teaching.chapter || existing?.chapter || null,
        chapter_reference: teaching.chapter_reference || existing?.chapter_reference || null,
        teacher_name: teacherName || existing?.teacher_name || null,
        themes_manual: Array.from(
          new Set([...(existing?.themes_manual || []), ...(teaching.themes_manual || [])]),
        ),
        psa_highlight: existing?.psa_highlight || null,
        announcer_name: existing?.announcer_name || null,
      });
    }
  }

  if (rowMap.size === 0) {
    throw new Error(
      "No dated teaching rows found. Confirm the sheet has year markers (like 2026) above each year's weekends.",
    );
  }

  return Array.from(rowMap.values()).sort((a, b) => {
    const campusDiff = (a.campus_name || "").localeCompare(b.campus_name || "");
    if (campusDiff !== 0) return campusDiff;
    return a.weekend_date.localeCompare(b.weekend_date);
  });
}

function parseFlatSheetRows(values: string[][]): ParsedRow[] {
  const dateHeaderAliases = [
    "weekend_date",
    "date",
    "service_date",
    "weekend",
    "teaching_date",
    "week_of",
    "weekend_of",
  ];

  const headerIndex = values.findIndex((row) => {
    const normalizedCells = row.map((cellValue) => normalizeHeader(String(cellValue || "")));
    return normalizedCells.some((cellValue) => {
      if (dateHeaderAliases.includes(cellValue)) return true;
      return (
        cellValue.includes("date") ||
        cellValue.includes("week_of") ||
        cellValue.includes("weekend_of") ||
        cellValue.includes("weekend")
      );
    });
  });

  if (headerIndex === -1) {
    throw new Error(
      "Could not find a header row with a date column. Expected the ECC Overview layout or headers like Date, Teacher, Book.",
    );
  }

  const headerRow = values[headerIndex].map((cellValue) => normalizeHeader(String(cellValue || "")));
  const dataRows = values.slice(headerIndex + 1);
  const baseYear = new Date().getFullYear();
  let lastResolvedDate: string | null = null;
  const rowMap = new Map<string, ParsedRow>();

  for (const rawValues of dataRows) {
    if (!rawValues.some((cellValue) => String(cellValue || "").trim())) continue;

    const row = Object.fromEntries(
      headerRow.map((key, columnIndex) => [key, String(rawValues[columnIndex] || "").trim()]),
    );

    const dateValue =
      row.weekend_date ||
      row.date ||
      row.service_date ||
      row.weekend ||
      row.teaching_date ||
      row.week_of ||
      row.weekend_of ||
      "";
    const parsedDate = parseWeekendDateRange(dateValue, baseYear) || normalizeDateInput(dateValue);
    const normalizedDate = parsedDate || lastResolvedDate;
    if (!normalizedDate) continue;
    lastResolvedDate = normalizedDate;

    const referenceValue =
      row.book_and_chapter ||
      row.reference ||
      row.passage ||
      row.scripture ||
      row.chapter_reference ||
      row.teaching_topic ||
      "";
    const teaching = parseTopicToTeaching(referenceValue);
    const chapterValue = row.chapter || row.ch || "";
    const book = row.book || teaching.book || null;
    const parsedChapter = chapterValue
      ? Number.parseInt(chapterValue.replace(/[^\d]/g, ""), 10)
      : teaching.chapter;

    const teacherName =
      row.teacher ||
      row.teacher_name ||
      row.speaker ||
      row.speaker_name ||
      row.preacher ||
      row.pastor ||
      null;

    const themes = (row.themes || row.theme || row.manual_themes || "")
      .split(",")
      .map((theme) => theme.trim())
      .filter(Boolean);

    const psaHighlight =
      row.psa_nonprofit_highlight ||
      row.psa_non_profit_highlight ||
      row.psa_highlight ||
      row.nonprofit_highlight ||
      row.non_profit_highlight ||
      row.psa ||
      null;

    const announcerName =
      row.announcer ||
      row.announcer_name ||
      row.announcement ||
      row.announcement_name ||
      row.announcements ||
      row.host ||
      null;

    const hasTeachingData = Boolean(book && parsedChapter && !Number.isNaN(parsedChapter) && parsedChapter > 0);
    const hasTeacher = Boolean(teacherName?.trim());
    const hasAnnouncementData = Boolean(psaHighlight?.trim() || announcerName?.trim());
    if (!hasTeachingData && !hasTeacher && !hasAnnouncementData) continue;

    const weekendDate = getWeekendKey(normalizedDate);
    const existing = rowMap.get(weekendDate);

    rowMap.set(weekendDate, {
      weekend_date: weekendDate,
      book: hasTeachingData ? (book as string) : existing?.book || null,
      chapter: hasTeachingData ? (parsedChapter as number) : existing?.chapter || null,
      chapter_reference: hasTeachingData
        ? referenceValue.trim() || `${book} ${parsedChapter}`
        : existing?.chapter_reference || null,
      teacher_name: teacherName?.trim() || existing?.teacher_name || null,
      themes_manual: Array.from(new Set([...(existing?.themes_manual || []), ...themes, ...teaching.themes_manual])),
      psa_highlight: psaHighlight?.trim() || existing?.psa_highlight || null,
      announcer_name: announcerName?.trim() || existing?.announcer_name || null,
    });
  }

  return Array.from(rowMap.values());
}

function parseSheetRows(values: string[][], campuses: CampusRef[], selectedCampus: CampusRef): ParsedRow[] {
  const looksLikeEccOverview = values.some((row) => isEccOverviewHeaderRow(row));
  if (looksLikeEccOverview) {
    // ECC Overview is network-wide: apply every campus column to its matching campus.
    return parseEccOverviewRows(values, campuses);
  }

  const flatRows = parseFlatSheetRows(values);
  return flatRows.map((row) => ({
    ...row,
    campus_id: selectedCampus.id,
    campus_name: selectedCampus.name,
  }));
}

function normalizeDateInput(value: string, fallbackYear?: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  const numericDateMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (numericDateMatch) {
    const month = Number.parseInt(numericDateMatch[1] || "", 10);
    const day = Number.parseInt(numericDateMatch[2] || "", 10);
    const year = normalizeCsvYearToken(numericDateMatch[3], fallbackYear ?? new Date().getFullYear());
    return formatDateParts(year, month, day);
  }

  const monthNameDateMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/);
  if (monthNameDateMatch) {
    const month = parseMonthToken(monthNameDateMatch[1] || "");
    const day = Number.parseInt(monthNameDateMatch[2] || "", 10);
    const year = normalizeCsvYearToken(monthNameDateMatch[3], fallbackYear ?? new Date().getFullYear());
    return month ? formatDateParts(year, month, day) : null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime()) || !/\d{4}/.test(trimmed)) return null;

  return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function parseWeekendDateRange(value: string, baseYear: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withYear = normalizeDateInput(trimmed, baseYear);
  if (withYear) return withYear;

  const numericRangeMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*-\s*(?:(\d{1,2})\/)?(\d{1,2})(?:\/(\d{2,4}))?$/,
  );
  if (numericRangeMatch) {
    const startMonth = Number.parseInt(numericRangeMatch[1] || "", 10);
    const startDay = Number.parseInt(numericRangeMatch[2] || "", 10);
    const resolvedYear = normalizeCsvYearToken(numericRangeMatch[3], baseYear);
    return formatDateParts(resolvedYear, startMonth, startDay);
  }

  const rangeMatch = trimmed.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{2,4}))?\s*-\s*([A-Za-z]+)?\s*(\d{1,2})(?:,?\s*(\d{2,4}))?$/,
  );
  if (!rangeMatch) return null;

  const startMonth = parseMonthToken(rangeMatch[1] || "");
  const startDay = Number.parseInt(rangeMatch[2] || "", 10);
  if (!startMonth || Number.isNaN(startDay)) return null;
  return formatDateParts(normalizeCsvYearToken(rangeMatch[3], baseYear), startMonth, startDay);
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        "Failed to refresh Google access token. Reconnect Google in Settings.",
    );
  }
  return tokenData.access_token as string;
}

async function getDriveFileMetadata(accessToken: string, fileId: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  if (!res.ok) {
    return null;
  }
  return data as { id: string; name?: string; mimeType?: string };
}

function isOfficeMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return (
    mimeType.includes("officedocument") ||
    mimeType.includes("ms-excel") ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

async function convertOfficeFileToGoogleSheet(
  accessToken: string,
  fileId: string,
  fileName?: string,
): Promise<{ id: string; webViewLink?: string } | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${(fileName || "Teaching Schedule").replace(/\.(xlsx|xls|csv)$/i, "")} (Google Sheet)`,
        mimeType: "application/vnd.google-apps.spreadsheet",
      }),
    },
  );

  const data = await res.json();
  if (!res.ok || !data?.id) {
    console.error("office_convert_failed", { status: res.status, data });
    return null;
  }

  return { id: data.id as string, webViewLink: data.webViewLink as string | undefined };
}

async function readSheetValues(
  accessToken: string,
  sheetId: string,
  valuesRange: string,
): Promise<{ ok: true; values: string[][] } | { ok: false; status: number; message: string; statusText?: string }> {
  const sheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(valuesRange)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  const sheetData = await sheetRes.json();
  if (!sheetRes.ok) {
    return {
      ok: false,
      status: sheetRes.status,
      message: String(sheetData?.error?.message || "Unable to read the Google Sheet."),
      statusText: String(sheetData?.error?.status || ""),
    };
  }

  return { ok: true, values: (sheetData.values || []) as string[][] };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !googleClientId || !googleClientSecret) {
      return jsonResponse(origin, { error: "Missing Google or Supabase configuration" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(origin, { error: "Missing authorization" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse(origin, { error: userError?.message || "Unauthorized" }, 401);
    }

    const body = (await req.json()) as SyncRequest;
    const campusId = body.campusId?.trim();
    const ministryType = body.ministryType?.trim() || "weekend";
    if (!campusId) {
      return jsonResponse(origin, { error: "campusId is required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: campusRow, error: campusError } = await adminClient
      .from("campuses")
      .select("id, name")
      .eq("id", campusId)
      .maybeSingle();
    if (campusError) throw campusError;
    if (!campusRow?.name) {
      return jsonResponse(origin, { error: "Campus not found." }, 400);
    }
    const selectedCampus = campusRow as CampusRef;

    const { data: allCampusesData, error: allCampusesError } = await adminClient
      .from("campuses")
      .select("id, name")
      .order("name");
    if (allCampusesError) throw allCampusesError;
    const allCampuses = (allCampusesData || []) as CampusRef[];
    const networkWideCampus =
      allCampuses.find((campus) => /network\s*wide/i.test(campus.name)) || null;
    const sheetSourceCampusId = networkWideCampus?.id || selectedCampus.id;

    const { data: existingSource } = await adminClient
      .from("teaching_schedule_sheet_sources")
      .select("*")
      .eq("campus_id", sheetSourceCampusId)
      .eq("ministry_type", ministryType)
      .maybeSingle();

    const sheetId =
      extractSheetId(body.sheetId) ||
      extractSheetId(body.sheetUrl) ||
      existingSource?.google_sheet_id ||
      null;

    if (!sheetId) {
      return jsonResponse(
        origin,
        { error: "Provide a Google Sheet URL or ID to sync the teaching schedule." },
        400,
      );
    }

    const sheetUrl =
      body.sheetUrl?.trim() ||
      existingSource?.google_sheet_url ||
      `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

    // ECC Weekend Service Rundown uses the "ECC Overview" tab by default.
    const requestedSheetTab =
      body.sheetTab?.trim() ||
      existingSource?.sheet_tab ||
      "ECC Overview";
    const sheetRange = body.sheetRange?.trim() || existingSource?.sheet_range || "A:Z";

    const buildValuesRange = (tab: string | null) =>
      tab ? `'${tab.replace(/'/g, "''")}'!${sheetRange}` : sheetRange;

    const { data: integration, error: integrationError } = await adminClient
      .from("google_integrations")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (integrationError) throw integrationError;
    if (!integration?.refresh_token) {
      return jsonResponse(
        origin,
        {
          error:
            "Google is not connected for your account. Connect Google in Settings → Planning Center, then sync again.",
          code: "google_not_connected",
        },
        400,
      );
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken(integration.refresh_token);
    } catch (tokenError) {
      const message =
        tokenError instanceof Error
          ? tokenError.message
          : "Failed to refresh Google access token.";
      return jsonResponse(
        origin,
        {
          error: `${message} Reconnect Google in Settings → Planning Center.`,
          code: "google_token_refresh_failed",
        },
        400,
      );
    }

    let effectiveSheetId = sheetId;
    let effectiveSheetUrl = sheetUrl;
    let sheetTab: string | null = requestedSheetTab;
    const fileMeta = await getDriveFileMetadata(accessToken, sheetId);
    if (fileMeta && isOfficeMimeType(fileMeta.mimeType)) {
      const converted = await convertOfficeFileToGoogleSheet(
        accessToken,
        sheetId,
        fileMeta.name,
      );
      if (!converted?.id) {
        return jsonResponse(
          origin,
          {
            error:
              "That link is an Excel/Office file in Drive, not a native Google Sheet. Open it in Google Drive → File → Save as Google Sheets, then paste the new Sheets URL here.",
            code: "office_file_needs_conversion",
          },
          400,
        );
      }
      effectiveSheetId = converted.id;
      effectiveSheetUrl =
        converted.webViewLink ||
        `https://docs.google.com/spreadsheets/d/${converted.id}/edit`;
    }

    const tabCandidates = Array.from(
      new Set(
        [requestedSheetTab, "ECC Overview", "Sheet1", null].filter(
          (tab, index, all) => all.indexOf(tab) === index,
        ),
      ),
    ) as Array<string | null>;

    let sheetRead: Awaited<ReturnType<typeof readSheetValues>> | null = null;
    for (const tab of tabCandidates) {
      const candidate = await readSheetValues(accessToken, effectiveSheetId, buildValuesRange(tab));
      if (candidate.ok) {
        sheetRead = candidate;
        sheetTab = tab;
        break;
      }

      // Some Drive links look like Sheets URLs but are still Office binaries.
      if (/must not be an Office file|not supported for this document/i.test(candidate.message)) {
        const converted = await convertOfficeFileToGoogleSheet(
          accessToken,
          effectiveSheetId,
          fileMeta?.name,
        );
        if (!converted?.id) {
          return jsonResponse(
            origin,
            {
              error:
                "That link is an Excel/Office file in Drive, not a native Google Sheet. Open it in Google Drive → File → Save as Google Sheets, then paste the new Sheets URL here.",
              code: "office_file_needs_conversion",
            },
            400,
          );
        }
        effectiveSheetId = converted.id;
        effectiveSheetUrl =
          converted.webViewLink ||
          `https://docs.google.com/spreadsheets/d/${converted.id}/edit`;
        continue;
      }

      sheetRead = candidate;
      // Keep trying alternate tabs for missing-range style failures.
      if (!/Unable to parse range|Unable to parse|not found|400/i.test(candidate.message)) {
        break;
      }
    }

    if (!sheetRead || !sheetRead.ok) {
      const googleMessage = sheetRead?.message || "Unable to read the Google Sheet.";
      const googleStatus = sheetRead?.statusText || "";
      const needsReconnect =
        sheetRead?.status === 403 ||
        /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient|permission|forbidden/i.test(
          `${googleMessage} ${googleStatus}`,
        );

      const message = needsReconnect
        ? "Google Sheets access is missing on your connected account. Reconnect Google in Settings → Planning Center and approve Sheets access, then try again."
        : googleMessage ||
          "Unable to read the Google Sheet. Confirm the sheet URL is correct and shared with your Google account.";

      console.error("sheets_read_failed", {
        status: sheetRead?.status,
        googleMessage,
        googleStatus,
        sheetId: effectiveSheetId,
        triedTabs: tabCandidates,
      });

      return jsonResponse(
        origin,
        {
          error: message,
          code: needsReconnect ? "sheets_permission_denied" : "sheets_read_failed",
        },
        needsReconnect ? 403 : 400,
      );
    }

    const values = sheetRead.values;
    if (values.length === 0) {
      return jsonResponse(origin, { error: "The Google Sheet returned no rows." }, 400);
    }

    let parsedRows: ParsedRow[];
    try {
      parsedRows = parseSheetRows(values, allCampuses, selectedCampus);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : "Failed to parse teaching schedule sheet.";
      return jsonResponse(origin, { error: message, code: "sheet_parse_failed" }, 400);
    }

    if (parsedRows.length === 0) {
      return jsonResponse(
        origin,
        {
          error:
            "No usable rows found. Expected the ECC Overview layout with year markers, Weekend Dates, Teaching Topic, and campus columns.",
        },
        400,
      );
    }

    const ministryAliases = getTeachingMinistryAliases(ministryType);
    const teachingPayload = parsedRows
      .filter((row) => row.campus_id && row.book && row.chapter)
      .map((row) => ({
        campus_id: row.campus_id as string,
        ministry_type: ministryType,
        weekend_date: normalizeTeachingWeekDate(row.weekend_date, ministryType),
        book: row.book as string,
        chapter: row.chapter as number,
        translation: "ESV",
        chapter_reference: row.chapter_reference,
        themes_manual: row.themes_manual,
        teacher_name: row.teacher_name,
        updated_by: user.id,
      }));

    const teacherOnlyUpdates = parsedRows.filter(
      (row) => row.campus_id && row.teacher_name && !(row.book && row.chapter),
    );

    const announcementPayload = parsedRows
      .filter((row) => row.campus_id && (row.announcer_name || row.psa_highlight))
      .map((row) => ({
        campus_id: row.campus_id as string,
        ministry_type: ministryType,
        weekend_date: normalizeTeachingWeekDate(row.weekend_date, ministryType),
        announcer_name: row.announcer_name,
        psa_highlight: row.psa_highlight,
        created_by: user.id,
        updated_by: user.id,
      }));

    const campusesTouched = Array.from(
      new Set(teachingPayload.map((row) => row.campus_id).filter(Boolean)),
    );
    const importedTeachingDates = Array.from(new Set(teachingPayload.map((row) => row.weekend_date)));
    if (importedTeachingDates.length > 0 && campusesTouched.length > 0) {
      const { error: deleteError } = await adminClient
        .from("teaching_weeks")
        .delete()
        .in("campus_id", campusesTouched)
        .in("ministry_type", ministryAliases)
        .in("weekend_date", importedTeachingDates);
      if (deleteError) throw deleteError;

      const { error: insertError } = await adminClient.from("teaching_weeks").insert(teachingPayload);
      if (insertError) throw insertError;
    }

    for (const row of teacherOnlyUpdates) {
      const weekendDate = normalizeTeachingWeekDate(row.weekend_date, ministryType);
      await adminClient
        .from("teaching_weeks")
        .update({ teacher_name: row.teacher_name, updated_by: user.id })
        .eq("campus_id", row.campus_id as string)
        .in("ministry_type", ministryAliases)
        .eq("weekend_date", weekendDate);
    }

    const importedAnnouncementDates = Array.from(
      new Set(announcementPayload.map((row) => row.weekend_date)),
    );
    const announcementCampuses = Array.from(
      new Set(announcementPayload.map((row) => row.campus_id).filter(Boolean)),
    );
    if (importedAnnouncementDates.length > 0 && announcementCampuses.length > 0) {
      const { error: deleteAnnouncementsError } = await adminClient
        .from("teaching_week_announcements")
        .delete()
        .in("campus_id", announcementCampuses)
        .in("ministry_type", ministryAliases)
        .in("weekend_date", importedAnnouncementDates);
      if (deleteAnnouncementsError) throw deleteAnnouncementsError;

      const { error: announcementError } = await adminClient
        .from("teaching_week_announcements")
        .insert(announcementPayload);
      if (announcementError) throw announcementError;
    }

    const { error: sourceError } = await adminClient.from("teaching_schedule_sheet_sources").upsert(
      {
        campus_id: sheetSourceCampusId,
        ministry_type: ministryType,
        google_sheet_id: effectiveSheetId,
        google_sheet_url: effectiveSheetUrl,
        sheet_tab: sheetTab,
        sheet_range: sheetRange,
        last_synced_at: new Date().toISOString(),
        last_synced_by: user.id,
        last_sync_row_count: parsedRows.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campus_id,ministry_type" },
    );
    if (sourceError) throw sourceError;

    const campusSummary = Array.from(
      parsedRows.reduce((map, row) => {
        if (!row.campus_name) return map;
        map.set(row.campus_name, (map.get(row.campus_name) || 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .map(([name, count]) => `${name}: ${count}`)
      .join(", ");

    return jsonResponse(origin, {
      success: true,
      rowCount: parsedRows.length,
      teachingWeeks: teachingPayload.length,
      announcements: announcementPayload.length,
      campusName: networkWideCampus?.name || selectedCampus.name,
      campusesUpdated: campusesTouched.length,
      campusSummary,
      sheetTab,
      sheetId: effectiveSheetId,
      sheetUrl: effectiveSheetUrl,
      rangeStart: parsedRows[0]?.weekend_date,
      rangeEnd: parsedRows[parsedRows.length - 1]?.weekend_date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected teaching schedule sync error";
    return jsonResponse(origin, { error: message }, 500);
  }
});
