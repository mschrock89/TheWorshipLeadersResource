import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  title: string;
  message: string;
  url?: string;
  tag?: string;
  userIds?: string[];
}

// Convert URL-safe base64 to regular base64
function urlBase64ToBase64(urlSafe: string): string {
  return urlSafe.replace(/-/g, '+').replace(/_/g, '/');
}

// Convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(urlBase64ToBase64(base64));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Encode Uint8Array to base64url string
function encodeBase64Url(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Extract X and Y coordinates from uncompressed public key (65 bytes: 0x04 || X || Y)
function extractPublicKeyCoordinates(publicKeyBase64: string): { x: string; y: string } {
  const publicKeyBytes = base64ToUint8Array(publicKeyBase64);
  // Uncompressed format: 0x04 || X (32 bytes) || Y (32 bytes)
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) {
    throw new Error(`Invalid uncompressed public key format. Length: ${publicKeyBytes.length}, first byte: ${publicKeyBytes[0]}`);
  }
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);
  return {
    x: encodeBase64Url(x),
    y: encodeBase64Url(y),
  };
}

// Convert DER signature to raw format (r || s, 64 bytes total)
function derToRaw(der: Uint8Array): Uint8Array {
  // DER format: 0x30 [len] 0x02 [rLen] [r] 0x02 [sLen] [s]
  if (der[0] !== 0x30) {
    // Already raw format
    return der.slice(0, 64);
  }
  
  const rLength = der[3];
  const rStart = 4;
  let r = der.slice(rStart, rStart + rLength);
  
  const sLengthIndex = rStart + rLength + 1;
  const sLength = der[sLengthIndex];
  const sStart = sLengthIndex + 1;
  let s = der.slice(sStart, sStart + sLength);
  
  // Normalize to 32 bytes each (remove leading zeros or pad)
  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  if (r.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(r, 32 - r.length);
    r = padded;
  }
  if (s.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(s, 32 - s.length);
    s = padded;
  }
  
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

// Concatenate multiple Uint8Arrays
function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// HKDF implementation using Web Crypto
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // Import IKM as HKDF key
  const key = await crypto.subtle.importKey(
    "raw",
    ikm.buffer as ArrayBuffer,
    "HKDF",
    false,
    ["deriveBits"]
  );

  // Derive bits
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt.buffer as ArrayBuffer,
      info: info.buffer as ArrayBuffer,
    },
    key,
    length * 8
  );

  return new Uint8Array(bits);
}

// Create info for HKDF (RFC 8291 format)
function createInfo(type: string, _context: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  // "Content-Encoding: " + type + "\0"
  const prefix = new TextEncoder().encode("Content-Encoding: ");
  const separator = new Uint8Array([0]);
  return concatUint8Arrays(prefix, typeBytes, separator);
}

// Encrypt payload using RFC 8291 (aes128gcm)
async function encryptPayload(
  payload: string,
  p256dhBase64: string,
  authBase64: string
): Promise<Uint8Array> {
  const payloadBytes = new TextEncoder().encode(payload);
  
  // Decode subscriber's public key and auth secret
  const subscriberPublicKeyBytes = base64ToUint8Array(p256dhBase64);
  const authSecret = base64ToUint8Array(authBase64);

  // Generate ephemeral key pair for this encryption
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Export ephemeral public key in uncompressed format
  const ephemeralPublicKeyRaw = await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);
  const ephemeralPublicKeyBytes = new Uint8Array(ephemeralPublicKeyRaw);

  // Import subscriber's public key
  const subscriberPublicKey = await crypto.subtle.importKey(
    "raw",
    subscriberPublicKeyBytes.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Perform ECDH to get shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberPublicKey },
    ephemeralKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // Build context for key derivation (RFC 8291)
  // "WebPush: info\0" || subscriber_public || ephemeral_public
  const keyLabel = new TextEncoder().encode("WebPush: info\0");
  const context = concatUint8Arrays(
    keyLabel,
    subscriberPublicKeyBytes,
    ephemeralPublicKeyBytes
  );

  // Generate random salt for this message
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive PRK using HKDF-Extract with auth_secret as salt
  const prk = await hkdf(authSecret, sharedSecret, context, 32);

  // Derive Content Encryption Key (CEK) - 16 bytes for AES-128-GCM
  const cekInfo = createInfo("aes128gcm", new Uint8Array(0));
  const cek = await hkdf(salt, prk, cekInfo, 16);

  // Derive nonce - 12 bytes
  const nonceInfo = createInfo("nonce", new Uint8Array(0));
  const nonce = await hkdf(salt, prk, nonceInfo, 12);

  // Pad the plaintext: add delimiter 0x02
  const paddedPayload = concatUint8Arrays(payloadBytes, new Uint8Array([2]));

  // Import CEK for AES-GCM encryption
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek.buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  // Encrypt the padded payload
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, tagLength: 128 },
    aesKey,
    paddedPayload.buffer as ArrayBuffer
  );
  const ciphertextBytes = new Uint8Array(ciphertext);

  // Build the final aes128gcm payload:
  // salt (16 bytes) || record_size (4 bytes, big-endian) || keyid_len (1 byte) || keyid (ephemeral public key, 65 bytes) || ciphertext
  
  // Record size: 4096 is standard
  const recordSize = 4096;
  const recordSizeBytes = new Uint8Array(4);
  new DataView(recordSizeBytes.buffer).setUint32(0, recordSize, false);

  const keyIdLen = new Uint8Array([65]); // Length of ephemeral public key

  // Assemble final payload
  return concatUint8Arrays(
    salt,
    recordSizeBytes,
    keyIdLen,
    ephemeralPublicKeyBytes,
    ciphertextBytes
  );
}

// Generate VAPID JWT token using JWK import
async function generateVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64: string,
  publicKeyBase64: string
): Promise<string> {
  // Extract x, y coordinates from the public key
  const { x, y } = extractPublicKeyCoordinates(publicKeyBase64);
  
  // Build JWK with both private key 'd' and public key coordinates
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: x,
    y: y,
    d: privateKeyBase64, // Raw 'd' parameter (32 bytes base64url encoded)
    ext: true,
  };

  // Import as JWK
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Create JWT header and payload
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const encodedHeader = encodeBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw format
  const rawSignature = derToRaw(new Uint8Array(signature));
  
  return `${unsignedToken}.${encodeBase64Url(rawSignature)}`;
}

// Send a single push notification with encrypted payload
async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const endpoint = new URL(subscription.endpoint);
    const audience = `${endpoint.protocol}//${endpoint.host}`;

    // Encrypt the payload using subscriber's keys
    const encryptedPayload = await encryptPayload(
      payload,
      subscription.p256dh,
      subscription.auth
    );

    const jwt = await generateVapidJwt(audience, vapidSubject, vapidPrivateKey, vapidPublicKey);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": encryptedPayload.length.toString(),
        "TTL": "86400",
        "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
        "Urgency": "normal",
      },
      body: encryptedPayload.buffer as ArrayBuffer,
    });

    // Read response body for debugging
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`Push failed: status ${response.status}, body: ${responseText}`);
    }

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : responseText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("VAPID keys not configured");
      return new Response(
        JSON.stringify({ error: "Push notifications not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: PushPayload = await req.json();

    console.log("Push request received:", {
      title: payload.title,
      message: payload.message,
      userIds: payload.userIds?.length || "all",
    });

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get subscriptions from database
    let query = supabase.from("push_subscriptions").select("*");
    
    if (payload.userIds && payload.userIds.length > 0) {
      query = query.in("user_id", payload.userIds);
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error("Error fetching subscriptions:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No subscriptions found");
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${subscriptions.length} subscription(s)`);

    // Build notification payload
    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.message,
      icon: "/em-logo-white.png",
      badge: "/em-badge.png",
      tag: payload.tag || "default",
      data: {
        url: payload.url || "/dashboard",
      },
    });

    // Send to all subscriptions
    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];
    const vapidSubject = "mailto:support@worshipleadersresource.lovable.app";

    for (const sub of subscriptions) {
      try {
        const result = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          notificationPayload,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject
        );

        if (result.success) {
          sent++;
          console.log(`Sent to user ${sub.user_id} (status: ${result.statusCode})`);
        } else {
          failed++;
          console.error(`Failed to send to ${sub.user_id}: status ${result.statusCode}, error: ${result.error}`);
          
          // If subscription is expired/invalid, mark for deletion
          if (result.statusCode === 400 || result.statusCode === 404 || result.statusCode === 410) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      } catch (error: unknown) {
        failed++;
        console.error(`Exception sending to ${sub.user_id}:`, error);
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      console.log(`Cleaning up ${expiredEndpoints.length} expired subscription(s)`);
      const { error: deleteError } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
      
      if (deleteError) {
        console.error("Error cleaning up expired subscriptions:", deleteError);
      }
    }

    console.log(`Push complete: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        total: subscriptions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
