export const SESSION_COOKIE = "hv_admin";
export const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function keyFor(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function verifyPassword(candidate: string, expected: string): Promise<boolean> {
  if (!expected || candidate.length > 512) return false;
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSession(secret: string, now = Date.now()): Promise<string> {
  if (secret.length < 24) throw new Error("ADMIN_NOT_CONFIGURED");
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}:${crypto.randomUUID()}`;
  const encoded = base64url(encoder.encode(payload));
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(encoded));
  return `${encoded}.${base64url(new Uint8Array(signature))}`;
}

export async function verifySession(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !secret || secret.length < 24 || token.length > 512) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const valid = await crypto.subtle.verify("HMAC", await keyFor(secret), fromBase64url(parts[1]), encoder.encode(parts[0]));
    if (!valid) return false;
    const [expires] = new TextDecoder().decode(fromBase64url(parts[0])).split(":");
    const timestamp = Number(expires);
    const current = Math.floor(now / 1000);
    return Number.isSafeInteger(timestamp) && timestamp > current && timestamp <= current + SESSION_SECONDS;
  } catch { return false; }
}

export function getCookie(request: Request, name: string): string | undefined {
  const entry = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}
