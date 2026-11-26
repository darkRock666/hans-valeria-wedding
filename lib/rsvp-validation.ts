export type RsvpInput = {
  name: string;
  attendance: "yes" | "no";
  guests: number;
  requestId: string;
  message: string;
};

type ValidationResult =
  | { ok: true; value: RsvpInput; honeypot: false }
  | { ok: true; honeypot: true }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateRsvp(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Revisa los datos de tu confirmación." };
  }
  const input = payload as Record<string, unknown>;
  if (typeof input.website === "string" && input.website.trim()) {
    return { ok: true, honeypot: true };
  }
  if (typeof input.name !== "string" || /[\u0000-\u001f\u007f]/.test(input.name)) {
    return { ok: false, error: "Escribe tu nombre completo." };
  }
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: "Escribe un nombre de entre 2 y 100 caracteres." };
  }
  if (input.attendance !== "yes" && input.attendance !== "no") {
    return { ok: false, error: "Indica si podrás acompañarnos." };
  }
  if (typeof input.guests !== "number" || !Number.isInteger(input.guests)) {
    return { ok: false, error: "Revisa la cantidad de personas." };
  }
  if (input.attendance === "yes" && input.guests !== 1) {
    return { ok: false, error: "Cada invitación es personal. Confirma únicamente tu asistencia." };
  }
  if (input.attendance === "no" && input.guests !== 0) {
    return { ok: false, error: "La cantidad debe ser cero si no podrás asistir." };
  }
  if (typeof input.requestId !== "string" || !UUID.test(input.requestId)) {
    return { ok: false, error: "Actualiza la página e intenta enviar tu respuesta otra vez." };
  }
  if (input.message !== undefined && typeof input.message !== "string") {
    return { ok: false, error: "Revisa tu mensaje antes de enviarlo." };
  }
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
    return { ok: false, error: "Tu mensaje puede tener hasta 500 caracteres." };
  }
  return {
    ok: true,
    honeypot: false,
    value: { name, attendance: input.attendance, guests: input.guests, requestId: input.requestId, message },
  };
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin === new URL(request.url).origin; }
    catch { return false; }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("CONTENT_TYPE");
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 4096) throw new Error("BODY_SIZE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("JSON");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error("BODY_SIZE"); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
