import { createHmac } from "node:crypto";
import type { RsvpInput } from "./rsvp-validation";

export type RsvpRecord = RsvpInput & { createdAt: string };
export type RsvpSnapshot = {
  rows: RsvpRecord[];
  totals: { responses: number; yes: number; no: number };
  truncated: boolean;
  limit: number;
};

export class SheetsStoreError extends Error {
  readonly status: number;
  constructor(message: string, status = 503) { super(message); this.name = "SheetsStoreError"; this.status = status; }
}

type Options = { url: string; secret: string; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNAVAILABLE = "No pudimos completar la operación. Intenta de nuevo en unos instantes.";

function recordFrom(value: unknown): RsvpRecord {
  if (!value || typeof value !== "object") throw new SheetsStoreError(UNAVAILABLE);
  const row = value as Record<string, unknown>;
  if (typeof row.requestId !== "string" || !UUID.test(row.requestId) || typeof row.name !== "string" || row.name.length < 2 || row.name.length > 100 || /[\u0000-\u001f\u007f]/.test(row.name) || (row.attendance !== "yes" && row.attendance !== "no") || typeof row.message !== "string" || row.message.length > 500 || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) {
    throw new SheetsStoreError(UNAVAILABLE);
  }
  return { requestId: row.requestId, name: row.name, attendance: row.attendance, guests: row.attendance === "yes" ? 1 : 0, message: row.message, createdAt: new Date(row.createdAt).toISOString() };
}

function sameReply(a: RsvpRecord, b: RsvpRecord): boolean {
  return a.name === b.name && a.attendance === b.attendance && a.message === b.message;
}

// Only API route handlers import this module. No credential is sent to a browser.
// A factory keeps provider failures and signing contracts independently testable.
export function createSheetsStore(options: Options) {
  let url: URL;
  try { url = new URL(options.url); } catch { throw new SheetsStoreError(UNAVAILABLE); }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.username || url.password || url.search || url.hash || options.secret.length < 32) throw new SheetsStoreError(UNAVAILABLE);
  const fetcher = options.fetcher || fetch;
  const now = options.now || Date.now;

  async function call(action: "append" | "list", payload: unknown): Promise<Record<string, unknown>> {
    const data = JSON.stringify({ timestamp: now(), action, payload });
    const signature = createHmac("sha256", options.secret).update(data, "utf8").digest("hex");
    let response: Response;
    let body: unknown;
    try {
      response = await fetcher(url, {
        method: "POST", cache: "no-store", redirect: "follow",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ data, signature }),
        signal: AbortSignal.timeout(options.timeoutMs || 14_000),
      });
      if (!response.ok) throw new Error("PROVIDER");
      body = await response.json();
    } catch { throw new SheetsStoreError(UNAVAILABLE); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new SheetsStoreError(UNAVAILABLE);
    const result = body as Record<string, unknown>;
    if (result.ok !== true) {
      if (result.status === 409) throw new SheetsStoreError("Esta respuesta ya se envió con otros datos. Actualiza la página para enviar otra.", 409);
      if (result.status === 400) throw new SheetsStoreError("Revisa los datos de tu confirmación.", 400);
      throw new SheetsStoreError(UNAVAILABLE);
    }
    return result;
  }

  return {
    async append(input: RsvpInput): Promise<{ ok: true; alreadySaved?: true }> {
      const result = await call("append", { requestId: input.requestId, name: input.name, attendance: input.attendance, message: input.message });
      return result.alreadySaved === true ? { ok: true, alreadySaved: true } : { ok: true };
    },
    async list(): Promise<RsvpSnapshot> {
      const result = await call("list", {});
      if (!Array.isArray(result.rows) || result.rows.length > 20000) throw new SheetsStoreError(UNAVAILABLE);
      const canonical = new Map<string, RsvpRecord>();
      for (const value of result.rows) {
        const row = recordFrom(value);
        const previous = canonical.get(row.requestId);
        if (previous && !sameReply(previous, row)) throw new SheetsStoreError(UNAVAILABLE);
        if (!previous || row.createdAt < previous.createdAt) canonical.set(row.requestId, row);
      }
      const all = [...canonical.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.requestId.localeCompare(a.requestId));
      const yes = all.filter((row) => row.attendance === "yes").length;
      const limit = 5000;
      return { rows: all.slice(0, limit), totals: { responses: all.length, yes, no: all.length - yes }, truncated: all.length > limit, limit };
    },
  };
}

function configuredStore() {
  return createSheetsStore({ url: process.env.GOOGLE_SHEETS_WEB_APP_URL || "", secret: process.env.GOOGLE_SHEETS_SECRET || "" });
}

export function appendRsvp(input: RsvpInput) { return configuredStore().append(input); }
export function listRsvps() { return configuredStore().list(); }
