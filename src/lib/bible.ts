export type BibleTranslation = "ESV";

export interface BibleBook {
  name: string;
  chapters: number;
}

export const BIBLE_TRANSLATIONS: Array<{ value: BibleTranslation; label: string; description: string }> = [
  { value: "ESV", label: "ESV", description: "English Standard Version" },
];

export function getBibleReaderTranslation(translation?: string | null): BibleTranslation {
  return "ESV";
}

export const BIBLE_BOOKS: BibleBook[] = [
  { name: "Genesis", chapters: 50 },
  { name: "Exodus", chapters: 40 },
  { name: "Leviticus", chapters: 27 },
  { name: "Numbers", chapters: 36 },
  { name: "Deuteronomy", chapters: 34 },
  { name: "Joshua", chapters: 24 },
  { name: "Judges", chapters: 21 },
  { name: "Ruth", chapters: 4 },
  { name: "1 Samuel", chapters: 31 },
  { name: "2 Samuel", chapters: 24 },
  { name: "1 Kings", chapters: 22 },
  { name: "2 Kings", chapters: 25 },
  { name: "1 Chronicles", chapters: 29 },
  { name: "2 Chronicles", chapters: 36 },
  { name: "Ezra", chapters: 10 },
  { name: "Nehemiah", chapters: 13 },
  { name: "Esther", chapters: 10 },
  { name: "Job", chapters: 42 },
  { name: "Psalms", chapters: 150 },
  { name: "Proverbs", chapters: 31 },
  { name: "Ecclesiastes", chapters: 12 },
  { name: "Song of Solomon", chapters: 8 },
  { name: "Isaiah", chapters: 66 },
  { name: "Jeremiah", chapters: 52 },
  { name: "Lamentations", chapters: 5 },
  { name: "Ezekiel", chapters: 48 },
  { name: "Daniel", chapters: 12 },
  { name: "Hosea", chapters: 14 },
  { name: "Joel", chapters: 3 },
  { name: "Amos", chapters: 9 },
  { name: "Obadiah", chapters: 1 },
  { name: "Jonah", chapters: 4 },
  { name: "Micah", chapters: 7 },
  { name: "Nahum", chapters: 3 },
  { name: "Habakkuk", chapters: 3 },
  { name: "Zephaniah", chapters: 3 },
  { name: "Haggai", chapters: 2 },
  { name: "Zechariah", chapters: 14 },
  { name: "Malachi", chapters: 4 },
  { name: "Matthew", chapters: 28 },
  { name: "Mark", chapters: 16 },
  { name: "Luke", chapters: 24 },
  { name: "John", chapters: 21 },
  { name: "Acts", chapters: 28 },
  { name: "Romans", chapters: 16 },
  { name: "1 Corinthians", chapters: 16 },
  { name: "2 Corinthians", chapters: 13 },
  { name: "Galatians", chapters: 6 },
  { name: "Ephesians", chapters: 6 },
  { name: "Philippians", chapters: 4 },
  { name: "Colossians", chapters: 4 },
  { name: "1 Thessalonians", chapters: 5 },
  { name: "2 Thessalonians", chapters: 3 },
  { name: "1 Timothy", chapters: 6 },
  { name: "2 Timothy", chapters: 4 },
  { name: "Titus", chapters: 3 },
  { name: "Philemon", chapters: 1 },
  { name: "Hebrews", chapters: 13 },
  { name: "James", chapters: 5 },
  { name: "1 Peter", chapters: 5 },
  { name: "2 Peter", chapters: 3 },
  { name: "1 John", chapters: 5 },
  { name: "2 John", chapters: 1 },
  { name: "3 John", chapters: 1 },
  { name: "Jude", chapters: 1 },
  { name: "Revelation", chapters: 22 },
];

export interface ParsedBibleReference {
  book: string | null;
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
}

export function normalizeBibleReference(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseBibleReference(value: string): ParsedBibleReference {
  const trimmed = normalizeBibleReference(value);
  const match = trimmed.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);

  if (!match) {
    return { book: null, chapter: null, verseStart: null, verseEnd: null };
  }

  const book = (match[1] || "").trim();
  const chapter = Number.parseInt(match[2] || "", 10);
  const verseStart = match[3] ? Number.parseInt(match[3], 10) : null;
  const verseEnd = match[4] ? Number.parseInt(match[4], 10) : verseStart;

  return {
    book,
    chapter: Number.isNaN(chapter) ? null : chapter,
    verseStart: verseStart && !Number.isNaN(verseStart) ? verseStart : null,
    verseEnd: verseEnd && !Number.isNaN(verseEnd) ? verseEnd : null,
  };
}

export function buildChapterReference(book: string, chapter: number): string {
  return `${book} ${chapter}`;
}

export function getBookMeta(bookName: string | null | undefined): BibleBook | null {
  if (!bookName) return null;
  return BIBLE_BOOKS.find((book) => book.name === bookName) || null;
}

export function buildBibleHref(reference: string, translation?: string | null): string {
  const params = new URLSearchParams();
  params.set("reference", reference);
  params.set("translation", getBibleReaderTranslation(translation));
  return `/bible?${params.toString()}`;
}
