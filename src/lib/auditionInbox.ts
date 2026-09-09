export type AuditionInboxStatus = "new" | "reviewed" | "replied" | "scheduled" | "dismissed";

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

export function splitDisplayName(
  name: string | null | undefined,
  email: string,
): { firstName: string; lastName: string } {
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

export function defaultInboxReply(params: {
  firstName: string;
  isStudentApp?: boolean;
  scheduled?: { dateLabel: string; timeLabel: string; stageLabel: string } | null;
}): string {
  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi,";
  if (params.scheduled) {
    return [
      greeting,
      "",
      `Thanks for reaching out. I've got you down for a ${params.scheduled.stageLabel.toLowerCase()} on ${params.scheduled.dateLabel}${params.scheduled.timeLabel ? ` at ${params.scheduled.timeLabel}` : ""}.`,
      "",
      "Reply if you need to change anything — looking forward to it.",
      "",
      "Blessings,",
    ].join("\n");
  }

  return [
    greeting,
    "",
    params.isStudentApp
      ? "Thanks for reaching out about serving. I'd love to get a next step on the calendar."
      : "Thanks for reaching out about the worship team. I'd love to get a pre-audition on the calendar.",
    "",
    "Are you free any of these times?",
    "- ",
    "- ",
    "",
    "Blessings,",
  ].join("\n");
}
