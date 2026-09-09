export type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
};

type GmailPayload = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
};

export function headerValue(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers || [];
  const match = headers.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return (match?.value || "").trim();
}

export function decodeBase64Url(data: string | null | undefined): string {
  if (!data) return "";
  const padded = data.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((data.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    try {
      return atob(padded);
    } catch {
      return "";
    }
  }
}

function collectBodies(payload: GmailPayload | undefined, collected: { text: string[]; html: string[] }) {
  if (!payload) return;

  const mime = (payload.mimeType || "").toLowerCase();
  const decoded = decodeBase64Url(payload.body?.data);

  if (decoded) {
    if (mime === "text/plain") collected.text.push(decoded);
    else if (mime === "text/html") collected.html.push(decoded);
    else if (!payload.parts && mime.startsWith("text/")) collected.text.push(decoded);
  }

  for (const part of payload.parts || []) {
    collectBodies(part, collected);
  }
}

export function extractMessageBodies(message: GmailMessage): { text: string; html: string } {
  const collected = { text: [] as string[], html: [] as string[] };
  collectBodies(message.payload, collected);
  return {
    text: collected.text.join("\n\n").trim(),
    html: collected.html.join("\n\n").trim(),
  };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function refreshGoogleAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error(
      `google_refresh_token_failed:${tokenPayload?.error_description || tokenPayload?.error || "unknown"}`,
    );
  }

  return tokenPayload.access_token as string;
}

export function encodeRfc2822(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function gmailFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || response.statusText;
    const error = new Error(`gmail_api_${response.status}:${message}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload as T;
}
