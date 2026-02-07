// Shared encryption utilities for PCO tokens
// Uses AES-GCM encryption with a server-side key

const ENCRYPTION_KEY_ENV = 'PCO_TOKEN_ENCRYPTION_KEY';

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get or derive the encryption key
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get(ENCRYPTION_KEY_ENV);
  
  if (!keyHex) {
    throw new Error('PCO_TOKEN_ENCRYPTION_KEY not configured');
  }
  
  // If key is less than 64 hex chars (32 bytes), derive a proper key using SHA-256
  let keyMaterial: Uint8Array;
  
  if (keyHex.length >= 64 && /^[0-9a-fA-F]+$/.test(keyHex)) {
    // Key is already in hex format with proper length
    keyMaterial = hexToBytes(keyHex.slice(0, 64));
  } else {
    // Derive a key from the provided secret using SHA-256
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(keyHex));
    keyMaterial = new Uint8Array(hashBuffer);
  }
  
  return crypto.subtle.importKey(
    'raw',
    keyMaterial.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a token using AES-GCM
 * Returns: iv (12 bytes) + ciphertext as hex string
 */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  
  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return bytesToHex(combined);
}

/**
 * Decrypt a token encrypted with encryptToken
 * Expects: iv (12 bytes) + ciphertext as hex string
 */
export async function decryptToken(encryptedHex: string): Promise<string> {
  const key = await getEncryptionKey();
  const decoder = new TextDecoder();
  
  const combined = hexToBytes(encryptedHex);
  
  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return decoder.decode(plaintext);
}

/**
 * Get decrypted tokens from a connection record
 * Uses only encrypted token columns (plaintext columns removed)
 */
export async function getDecryptedTokens(connection: {
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
}): Promise<{ accessToken: string; refreshToken: string }> {
  if (!connection.access_token_encrypted) {
    throw new Error('No encrypted access token found');
  }
  
  if (!connection.refresh_token_encrypted) {
    throw new Error('No encrypted refresh token found');
  }
  
  const accessToken = await decryptToken(connection.access_token_encrypted);
  const refreshToken = await decryptToken(connection.refresh_token_encrypted);
  
  return { accessToken, refreshToken };
}

/**
 * Store encrypted tokens in the database
 */
export async function storeEncryptedTokens(
  supabase: any,
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  tokenExpiresAt: string
): Promise<void> {
  const accessTokenEncrypted = await encryptToken(accessToken);
  const refreshTokenEncrypted = await encryptToken(refreshToken);
  
  const { error } = await supabase
    .from('pco_connections')
    .update({
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expires_at: tokenExpiresAt,
    })
    .eq('id', connectionId);
  
  if (error) {
    throw new Error(`Failed to store encrypted tokens: ${error.message}`);
  }
}

/**
 * Refresh token if needed, storing encrypted
 */
export async function refreshTokenIfNeededEncrypted(
  supabase: any,
  connection: any
): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(connection.token_expires_at);
  
  // Get current tokens (encrypted or legacy)
  const { accessToken, refreshToken } = await getDecryptedTokens(connection);
  
  // If token is not expiring soon, return current access token
  if (expiresAt.getTime() - now.getTime() >= 5 * 60 * 1000) {
    return accessToken;
  }
  
  console.log('Token expiring soon, refreshing...');
  
  const PCO_CLIENT_ID = Deno.env.get('PCO_CLIENT_ID');
  const PCO_CLIENT_SECRET = Deno.env.get('PCO_CLIENT_SECRET');
  
  const response = await fetch('https://api.planningcenteronline.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: PCO_CLIENT_ID,
      client_secret: PCO_CLIENT_SECRET,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }
  
  const tokens = await response.json();
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
  
  // Store new tokens encrypted
  await storeEncryptedTokens(
    supabase,
    connection.id,
    tokens.access_token,
    tokens.refresh_token,
    newExpiresAt.toISOString()
  );
  
  return tokens.access_token;
}
