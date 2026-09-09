// Direct APNs (Apple Push Notification service) delivery for the native iOS
// app. Auth uses a provider token: an ES256 JWT signed with a .p8 key from the
// Apple Developer portal.

export interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  useSandbox: boolean;
}

export interface ApnsSendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  /** Token is gone or malformed; the subscription row should be deleted. */
  shouldRemove: boolean;
}

export function getApnsConfig(): ApnsConfig | null {
  const keyP8 = Deno.env.get("APNS_KEY_P8");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");

  if (!keyP8 || !keyId || !teamId || !bundleId) {
    return null;
  }

  return {
    keyP8,
    keyId,
    teamId,
    bundleId,
    useSandbox: Deno.env.get("APNS_USE_SANDBOX") === "true",
  };
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8Bytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// APNs rejects provider tokens older than an hour; Apple also asks that they
// not be refreshed more than once every 20 minutes, so cache per isolate.
let cachedJwt: { token: string; issuedAt: number; keyId: string } | null = null;
const JWT_MAX_AGE_MS = 45 * 60 * 1000;

async function getProviderJwt(config: ApnsConfig): Promise<string> {
  const now = Date.now();
  if (cachedJwt && cachedJwt.keyId === config.keyId && now - cachedJwt.issuedAt < JWT_MAX_AGE_MS) {
    return cachedJwt.token;
  }

  const keyBytes = pemToPkcs8Bytes(config.keyP8);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = { alg: "ES256", kid: config.keyId };
  const payload = { iss: config.teamId, iat: Math.floor(now / 1000) };
  const unsigned = `${base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))}.${
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  }`;

  // Web Crypto ECDSA signatures are already in the raw r||s form JWTs expect.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );

  const token = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
  cachedJwt = { token, issuedAt: now, keyId: config.keyId };
  return token;
}

export async function sendApnsNotification(
  deviceToken: string,
  notification: { title: string; body: string; url?: string; tag?: string },
  config: ApnsConfig,
  timeoutMs = 10000,
): Promise<ApnsSendResult> {
  try {
    const jwt = await getProviderJwt(config);
    const host = config.useSandbox
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

    const body = {
      aps: {
        alert: {
          title: notification.title,
          body: notification.body,
        },
        sound: "default",
        ...(notification.tag ? { "thread-id": notification.tag } : {}),
      },
      // Custom payload read by the app's notification tap handler.
      url: notification.url || "/dashboard",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("APNs delivery timed out"), timeoutMs);

    try {
      const response = await fetch(`${host}/3/device/${deviceToken}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": config.bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) {
        return { success: true, statusCode: response.status, shouldRemove: false };
      }

      let reason = "";
      try {
        const json = await response.json();
        reason = typeof json?.reason === "string" ? json.reason : "";
      } catch {
        // Non-JSON error body; status code is enough.
      }

      const shouldRemove =
        response.status === 410 ||
        reason === "BadDeviceToken" ||
        reason === "Unregistered" ||
        reason === "DeviceTokenNotForTopic";

      return {
        success: false,
        statusCode: response.status,
        error: reason || `APNs HTTP ${response.status}`,
        shouldRemove,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown APNs error",
      shouldRemove: false,
    };
  }
}
