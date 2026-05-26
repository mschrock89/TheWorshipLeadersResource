import Papa from "papaparse";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import JSZip from "jszip";
import type { LifeGroupGender, LifeGroupGrade } from "@/hooks/useLifeGroups";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ParsedLifeGroupDraft {
  name: string;
  gender: LifeGroupGender;
  gradeLevel: LifeGroupGrade;
  meetingLocation: string;
  leaderNames: string[];
  studentNames: string[];
  sourceLabel: string;
}

type DraftAccumulator = ParsedLifeGroupDraft & {
  leaderNameSet: Set<string>;
  studentNameSet: Set<string>;
};

const DEFAULT_LOCATION = "Student Center";

const GROUP_HEADERS = ["group", "groupname", "lifegroup", "lifegroupname", "smallgroup", "smallgroupname"];
const NAME_HEADERS = ["name", "fullname", "person", "personname", "student", "studentname", "member", "membername"];
const STUDENT_HEADERS = ["students", "studentnames", "roster", "members", "membernames"];
const LEADER_HEADERS = ["leaders", "leader", "leadername", "leadernames", "adult", "adults", "adultleaders"];
const ROLE_HEADERS = ["role", "type", "assignment"];
const GRADE_HEADERS = ["grade", "gradelevel", "class"];
const GENDER_HEADERS = ["gender", "sex"];
const LOCATION_HEADERS = ["location", "room", "meetinglocation", "meetingroom", "area"];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanValue(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  names.forEach((name) => {
    const cleaned = cleanName(name);
    const key = normalizeKey(cleaned);
    if (!cleaned || seen.has(key)) return;
    seen.add(key);
    result.push(cleaned);
  });

  return result;
}

function cleanName(value: string) {
  return value
    .replace(/^\d+[).:-]?\s*/, "")
    .replace(/\b(leader|leaders|student|students|roster|members?)\b:?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNames(value: string) {
  const cleaned = value
    .replace(/\band\b/gi, "\n")
    .replace(/[•|;]/g, "\n")
    .replace(/\r/g, "\n");

  const newlineParts = cleaned.split(/\n+/).flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    if (trimmed.includes(",") && !/^[^,]+,\s*[^,]+$/.test(trimmed)) {
      return trimmed.split(",");
    }
    return [trimmed];
  });

  return uniqueNames(newlineParts.filter((name) => /[a-z]/i.test(name)));
}

function parseGender(...values: string[]): LifeGroupGender | null {
  const text = values.join(" ").toLowerCase();
  if (/\b(coed|co-ed|mixed)\b/.test(text)) return "coed";
  if (/\b(girl|girls|female|women|woman)\b/.test(text)) return "female";
  if (/\b(boy|boys|male|men|man)\b/.test(text)) return "male";
  return null;
}

function parseGrade(...values: string[]): LifeGroupGrade | null {
  const text = values.join(" ").toLowerCase();
  const numeric = text.match(/\b(8|9|10|11|12)(?:th|st|nd|rd)?\b/);
  if (numeric) return Number(numeric[1]) as LifeGroupGrade;
  if (/\bfreshm[ae]n\b|\b9th\b/.test(text)) return 9;
  if (/\bsophomore\b|\b10th\b/.test(text)) return 10;
  if (/\bjunior\b|\b11th\b/.test(text)) return 11;
  if (/\bsenior\b|\b12th\b/.test(text)) return 12;
  if (/\b8th\b|\beighth\b/.test(text)) return 8;
  return null;
}

function getField(row: Record<string, string>, headers: string[]) {
  const foundKey = Object.keys(row).find((key) => headers.includes(normalizeHeader(key)));
  return foundKey ? cleanValue(row[foundKey]) : "";
}

function looksLikeKnownHeader(row: string[]) {
  const normalized = row.map(normalizeHeader);
  return normalized.some((header) =>
    [
      ...GROUP_HEADERS,
      ...NAME_HEADERS,
      ...STUDENT_HEADERS,
      ...LEADER_HEADERS,
      ...ROLE_HEADERS,
      ...GRADE_HEADERS,
      ...GENDER_HEADERS,
      ...LOCATION_HEADERS,
    ].includes(header),
  );
}

function createDraft(
  drafts: Map<string, DraftAccumulator>,
  name: string,
  sourceLabel: string,
  grade?: LifeGroupGrade | null,
  gender?: LifeGroupGender | null,
  location?: string,
) {
  const cleanedName = cleanValue(name) || "Imported Life Group";
  const key = normalizeKey(cleanedName);
  const existing = drafts.get(key);

  if (existing) {
    if (grade) existing.gradeLevel = grade;
    if (gender) existing.gender = gender;
    if (location) existing.meetingLocation = location;
    return existing;
  }

  const draft: DraftAccumulator = {
    name: cleanedName,
    gender: gender || parseGender(cleanedName) || "coed",
    gradeLevel: grade || parseGrade(cleanedName) || 9,
    meetingLocation: location || DEFAULT_LOCATION,
    leaderNames: [],
    studentNames: [],
    sourceLabel,
    leaderNameSet: new Set<string>(),
    studentNameSet: new Set<string>(),
  };

  drafts.set(key, draft);
  return draft;
}

function addNames(draft: DraftAccumulator, role: "leader" | "student", names: string[]) {
  names.forEach((name) => {
    const key = normalizeKey(name);
    if (!key) return;

    if (role === "leader") {
      draft.studentNameSet.delete(key);
      draft.studentNames = draft.studentNames.filter((studentName) => normalizeKey(studentName) !== key);
      if (!draft.leaderNameSet.has(key)) {
        draft.leaderNameSet.add(key);
        draft.leaderNames.push(name);
      }
      return;
    }

    if (draft.leaderNameSet.has(key) || draft.studentNameSet.has(key)) return;
    draft.studentNameSet.add(key);
    draft.studentNames.push(name);
  });
}

function finalizeDrafts(drafts: Map<string, DraftAccumulator>) {
  return Array.from(drafts.values()).map(({ leaderNameSet, studentNameSet, ...draft }) => draft);
}

function rowsToRecords(rows: string[][]) {
  const firstUsefulRow = rows.findIndex((row) => row.some((cell) => cleanValue(cell)));
  if (firstUsefulRow < 0) return [];

  const firstRow = rows[firstUsefulRow].map(cleanValue);
  if (!looksLikeKnownHeader(firstRow)) return [];

  const headers = firstRow.map((header, index) => header || `Column ${index + 1}`);
  return rows.slice(firstUsefulRow + 1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cleanValue(row[index]);
    });
    return record;
  });
}

function parseTableRows(rows: string[][], sourceLabel: string) {
  const records = rowsToRecords(rows);
  if (records.length === 0) return [];

  const drafts = new Map<string, DraftAccumulator>();

  records.forEach((row) => {
    const groupName = getField(row, GROUP_HEADERS);
    const name = getField(row, NAME_HEADERS);
    const role = getField(row, ROLE_HEADERS).toLowerCase();
    const grade = parseGrade(getField(row, GRADE_HEADERS), groupName, name);
    const gender = parseGender(getField(row, GENDER_HEADERS), groupName, name);
    const location = getField(row, LOCATION_HEADERS);
    const leaderNames = splitNames(getField(row, LEADER_HEADERS));
    const studentNames = splitNames(getField(row, STUDENT_HEADERS));

    if (!groupName && leaderNames.length === 0 && studentNames.length === 0) return;

    const draft = createDraft(drafts, groupName || name || "Imported Life Group", sourceLabel, grade, gender, location);

    if (leaderNames.length > 0) addNames(draft, "leader", leaderNames);
    if (studentNames.length > 0) addNames(draft, "student", studentNames);

    if (name && !leaderNames.includes(name) && !studentNames.includes(name)) {
      addNames(draft, role.includes("leader") || role.includes("adult") ? "leader" : "student", [name]);
    }
  });

  return finalizeDrafts(drafts);
}

function parseDelimitedText(text: string, sourceLabel: string) {
  const delimiter = text.includes("\t") ? "\t" : undefined;
  const result = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(result.errors[0]?.message || "Unable to parse the uploaded file.");
  }

  return parseTableRows(result.data, sourceLabel);
}

function looksLikeGroupHeading(line: string) {
  if (line.length > 90) return false;
  if (/^\d+[).]\s+/.test(line)) return false;
  if (/\b(group|life group|small group)\b/i.test(line)) return true;
  return Boolean(parseGrade(line) && parseGender(line));
}

function parseStructuredText(text: string, sourceLabel: string) {
  const drafts = new Map<string, DraftAccumulator>();
  const lines = text
    .split(/\n+/)
    .map((line) => cleanValue(line))
    .filter(Boolean);

  let currentDraft: DraftAccumulator | null = null;
  let currentRole: "leader" | "student" = "student";

  lines.forEach((line) => {
    const locationMatch = line.match(/^(location|room|meets(?: at)?):\s*(.+)$/i);
    if (locationMatch && currentDraft) {
      currentDraft.meetingLocation = locationMatch[2].trim();
      return;
    }

    const leaderMatch = line.match(/^(leaders?|adult leaders?):\s*(.*)$/i);
    if (leaderMatch) {
      currentRole = "leader";
      if (currentDraft && leaderMatch[2]) addNames(currentDraft, "leader", splitNames(leaderMatch[2]));
      return;
    }

    const studentMatch = line.match(/^(students?|roster|members?):\s*(.*)$/i);
    if (studentMatch) {
      currentRole = "student";
      if (currentDraft && studentMatch[2]) addNames(currentDraft, "student", splitNames(studentMatch[2]));
      return;
    }

    if (looksLikeGroupHeading(line)) {
      const groupName = line.replace(/^(life\s+group|small\s+group|group):\s*/i, "");
      currentDraft = createDraft(
        drafts,
        groupName,
        sourceLabel,
        parseGrade(groupName),
        parseGender(groupName),
      );
      currentRole = "student";
      return;
    }

    if (!currentDraft) return;
    if (!/[a-z]/i.test(line) || /@|https?:\/\//i.test(line)) return;

    const names = splitNames(line);
    if (names.length > 0) addNames(currentDraft, currentRole, names);
  });

  return finalizeDrafts(drafts);
}

async function readPdfText(file: File) {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pageLines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lineMap = new Map<number, Array<{ x: number; text: string }>>();

    content.items.forEach((item) => {
      if (!("str" in item) || !item.str.trim()) return;
      const transform = "transform" in item ? item.transform : [0, 0, 0, 0, 0, 0];
      const y = Math.round(Number(transform[5]) / 4) * 4;
      const x = Number(transform[4]) || 0;
      const line = lineMap.get(y) || [];
      line.push({ x, text: item.str });
      lineMap.set(y, line);
    });

    Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => {
        pageLines.push(items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
      });
  }

  return pageLines.join("\n");
}

function xmlText(node: Element | null) {
  return node?.textContent || "";
}

function getColumnIndex(cellRef: string) {
  const letters = cellRef.match(/[A-Z]+/i)?.[0] || "A";
  return letters.split("").reduce((total, letter) => total * 26 + letter.toUpperCase().charCodeAt(0) - 64, 0) - 1;
}

async function readXlsxRows(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parser = new DOMParser();
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings: string[] = [];

  if (sharedStringsFile) {
    const xml = parser.parseFromString(await sharedStringsFile.async("text"), "application/xml");
    Array.from(xml.getElementsByTagName("si")).forEach((item) => {
      sharedStrings.push(Array.from(item.getElementsByTagName("t")).map((node) => node.textContent || "").join(""));
    });
  }

  const workbookFile = zip.file("xl/workbook.xml");
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  let sheetPath = "xl/worksheets/sheet1.xml";

  if (workbookFile && relsFile) {
    const workbook = parser.parseFromString(await workbookFile.async("text"), "application/xml");
    const rels = parser.parseFromString(await relsFile.async("text"), "application/xml");
    const firstSheet = workbook.getElementsByTagName("sheet")[0];
    const relationshipId = firstSheet?.getAttribute("r:id");
    const relationship = Array.from(rels.getElementsByTagName("Relationship")).find(
      (item) => item.getAttribute("Id") === relationshipId,
    );
    const target = relationship?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\.\//, "")}`;
  }

  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error("Couldn't find the first worksheet in this Excel file.");

  const sheet = parser.parseFromString(await sheetFile.async("text"), "application/xml");
  return Array.from(sheet.getElementsByTagName("row")).map((row) => {
    const cells: string[] = [];
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const index = getColumnIndex(cell.getAttribute("r") || "");
      const type = cell.getAttribute("t");
      const inline = cell.getElementsByTagName("is")[0];
      const rawValue = inline ? xmlText(inline) : xmlText(cell.getElementsByTagName("v")[0]);
      cells[index] = type === "s" ? sharedStrings[Number(rawValue)] || "" : rawValue;
    });
    return cells.map(cleanValue);
  });
}

async function parseTextFile(file: File) {
  const text = await file.text();
  const tableDrafts = parseDelimitedText(text, file.name);
  return tableDrafts.length > 0 ? tableDrafts : parseStructuredText(text, file.name);
}

export async function parseLifeGroupImportFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    return parseTextFile(file);
  }

  if (extension === "pdf" || file.type === "application/pdf") {
    const text = await readPdfText(file);
    const tableDrafts = parseDelimitedText(text, file.name);
    return tableDrafts.length > 0 ? tableDrafts : parseStructuredText(text, file.name);
  }

  if (extension === "xlsx") {
    return parseTableRows(await readXlsxRows(file), file.name);
  }

  throw new Error("Upload a CSV, TSV, TXT, PDF, or XLSX file.");
}
