function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textNodes(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g, "");
  const parts: string[] = [];
  const pattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutPhonetic))) {
    parts.push(decodeXml(match[1]));
  }
  return parts.join("");
}

export function sharedStringsFromXml(xml: string): string[] {
  const strings: string[] = [];
  const pattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    strings.push(textNodes(match[1]));
  }
  return strings;
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1] || "";
}

export function cellTextsFromSheetXml(sheetXml: string, sharedStrings: string[]): Map<string, string> {
  const cells = new Map<string, string>();
  const pattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sheetXml))) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const ref = attribute(attrs, "r");
    if (!ref) continue;
    const kind = attribute(attrs, "t");
    let text = "";
    if (kind === "s") {
      const index = Number.parseInt((inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "").trim(), 10);
      text = Number.isNaN(index) ? "" : sharedStrings[index] || "";
    } else if (kind === "inlineStr") {
      text = textNodes(inner);
    } else if (kind === "str") {
      text = decodeXml(inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "");
    }
    if (text) cells.set(ref, text);
  }
  return cells;
}
