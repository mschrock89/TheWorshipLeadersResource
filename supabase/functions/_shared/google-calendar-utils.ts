import { createClient } from "npm:@supabase/supabase-js@2";

const ENCRYPTION_KEY_ENV = "GOOGLE_TOKEN_ENCRYPTION_KEY";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyValue = Deno.env.get(ENCRYPTION_KEY_ENV);
  if (!keyValue) {
    throw new Error(`${ENCRYPTION_KEY_ENV} not configured`);
  }

  let keyMaterial: Uint8Array;
  if (keyValue.length >= 64 && /^[0-9a-fA-F]+$/.test(keyValue)) {
    keyMaterial = hexToBytes(keyValue.slice(0, 64));
  } else {
    const encoded = new TextEncoder().encode(keyValue);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    keyMaterial = new Uint8Array(digest);
  }

  return await crypto.subtle.importKey(
    "raw",
    keyMaterial.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToHex(combined);
}

export async function decryptToken(encryptedHex: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = hexToBytes(encryptedHex);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

interface GoogleConnectionRecord {
  id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
}

interface TokenRefreshResult {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function refreshGoogleToken(connection: GoogleConnectionRecord): Promise<TokenRefreshResult> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google Calendar client credentials are not configured");
  }

  const refreshToken = await decryptToken(connection.refresh_token_encrypted);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Google token refresh failed: ${tokenResponse.status} ${body}`);
  }

  return (await tokenResponse.json()) as TokenRefreshResult;
}

export async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: GoogleConnectionRecord,
): Promise<string> {
  const now = Date.now();
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const refreshWindowMs = 2 * 60 * 1000;

  if (expiresAt - now > refreshWindowMs) {
    return await decryptToken(connection.access_token_encrypted);
  }

  const refreshed = await refreshGoogleToken(connection);
  const accessTokenEncrypted = await encryptToken(refreshed.access_token);
  const refreshTokenEncrypted = refreshed.refresh_token
    ? await encryptToken(refreshed.refresh_token)
    : connection.refresh_token_encrypted;
  const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  const { error } = await supabase
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expires_at: tokenExpiresAt,
    })
    .eq("id", connection.id);

  if (error) {
    throw new Error(`Failed to store refreshed Google token: ${error.message}`);
  }

  return refreshed.access_token;
}
