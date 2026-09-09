export type InboxMatch = {
  matched: boolean;
  keywords: string[];
  reason: string;
};

const AUTOMATED_SENDER =
  /(?:^|@)(?:no-?reply|mailer-daemon|notifications|donotreply|do-not-reply|bounce)\b/i;

const HIGH_PATTERNS: Array<{ keyword: string; pattern: RegExp }> = [
  { keyword: "audition", pattern: /\bauditions?\b/i },
  { keyword: "pre-audition", pattern: /\bpre[-\s]?auditions?\b/i },
  { keyword: "tryout", pattern: /\btry[-\s]?outs?\b/i },
  { keyword: "worship team", pattern: /\bworship\s+team\b/i },
  { keyword: "worship ministry", pattern: /\bworship\s+ministry\b/i },
  { keyword: "worship band", pattern: /\bworship\s+band\b/i },
  { keyword: "join the team", pattern: /\bjoin(?:ing)?\s+(?:the\s+)?(?:worship\s+)?(?:team|band|ministry)\b/i },
  { keyword: "interested in serving", pattern: /\binterested\s+in\s+(?:serving|joining|worship|auditioning|the\s+team)/i },
  { keyword: "want to serve", pattern: /\b(?:want|would\s+like|hoping|looking)\s+to\s+(?:serve|audition|join|volunteer)\b/i },
  { keyword: "serve on team", pattern: /\bserv(?:e|ing)\s+on\s+(?:the\s+)?(?:worship\s+)?(?:team|band|ministry)\b/i },
  { keyword: "student ministry", pattern: /\bstudent(?:s)?\s+(?:ministry|worship|team)\b/i },
  { keyword: "onboarding", pattern: /\bon[-\s]?boarding\b/i },
];

const SERVING_PATTERN = /\b(?:serve|serving|volunteer(?:ing)?)\b/i;
const TEAM_CONTEXT_PATTERN = /\b(?:worship|team|ministry|church|band|choir|audition)\b/i;

export function classifyAuditionInterestEmail(input: {
  fromEmail?: string | null;
  fromName?: string | null;
  subject?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  connectedEmail?: string | null;
}): InboxMatch {
  const fromEmail = (input.fromEmail || "").trim().toLowerCase();
  const connectedEmail = (input.connectedEmail || "").trim().toLowerCase();

  if (fromEmail && connectedEmail && fromEmail === connectedEmail) {
    return { matched: false, keywords: [], reason: "sent_by_connected_account" };
  }

  if (fromEmail && AUTOMATED_SENDER.test(fromEmail)) {
    return { matched: false, keywords: [], reason: "automated_sender" };
  }

  const haystack = [input.fromName, input.subject, input.snippet, input.bodyText]
    .filter(Boolean)
    .join("\n");

  if (!haystack.trim()) {
    return { matched: false, keywords: [], reason: "empty" };
  }

  const keywords: string[] = [];
  for (const item of HIGH_PATTERNS) {
    if (item.pattern.test(haystack)) keywords.push(item.keyword);
  }

  const hasServing = SERVING_PATTERN.test(haystack);
  const hasTeamContext = TEAM_CONTEXT_PATTERN.test(haystack);
  if (hasServing && hasTeamContext && !keywords.includes("interested in serving") && !keywords.includes("want to serve") && !keywords.includes("serve on team")) {
    keywords.push("serving");
  }

  if (keywords.length === 0) {
    return { matched: false, keywords: [], reason: "no_interest_language" };
  }

  return {
    matched: true,
    keywords: Array.from(new Set(keywords)),
    reason: keywords.slice(0, 3).join(", "),
  };
}

export const GMAIL_INTEREST_QUERY = [
  "in:inbox",
  "-from:me",
  "(",
  [
    "audition",
    '"pre-audition"',
    "tryout",
    '"try out"',
    '"worship team"',
    '"worship ministry"',
    '"worship band"',
    '"join the team"',
    '"interested in serving"',
    '"want to serve"',
    '"serve on"',
    '"serving on"',
    '"interested in worship"',
    "onboarding",
    '"student ministry"',
    "volunteer worship",
  ].join(" OR "),
  ")",
].join(" ");

export function parseEmailAddress(raw: string | null | undefined): { name: string | null; email: string } {
  const value = (raw || "").trim();
  if (!value) return { name: null, email: "" };

  const angled = value.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+@[^>]+)>$/);
  if (angled) {
    return {
      name: angled[1]?.trim() || null,
      email: angled[2].trim().toLowerCase(),
    };
  }

  if (value.includes("@")) {
    return { name: null, email: value.toLowerCase() };
  }

  return { name: value, email: "" };
}

export function splitDisplayName(name: string | null | undefined, email: string): { firstName: string; lastName: string } {
  const cleaned = (name || "").replace(/["<>]/g, " ").trim();
  if (cleaned) {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
    };
  }

  const local = email.split("@")[0] || "";
  const token = local.split(/[._-]/).filter(Boolean)[0] || "New";
  const firstName = token.charAt(0).toUpperCase() + token.slice(1);
  return { firstName, lastName: "" };
}
