import { getCookie, SESSION_COOKIE, verifySession } from "./admin-session";

export async function isAdminRequest(request: Request): Promise<boolean> {
  return verifySession(getCookie(request, SESSION_COOKIE), process.env.ADMIN_PASSWORD);
}

// Isolate-local burst guard; this is not a globally coordinated rate limit.
const bursts = new Map<string, { count: number; until: number }>();
export function allowBurst(request: Request, purpose: "rsvp" | "login"): boolean {
  const now = Date.now();
  if (bursts.size > 500) {
    for (const [key, entry] of bursts) if (entry.until < now) bursts.delete(key);
    if (bursts.size > 500) return false;
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 128) || "local";
  const key = `${purpose}:${address}`;
  const duration = purpose === "login" ? 15 * 60_000 : 60_000;
  const limit = purpose === "login" ? 8 : 30;
  const entry = bursts.get(key);
  if (!entry || entry.until <= now) { bursts.set(key, { count: 1, until: now + duration }); return true; }
  entry.count++;
  return entry.count <= limit;
}

export const PRIVATE_HEADERS = { "Cache-Control": "no-store, private", "Vary": "Cookie" };
