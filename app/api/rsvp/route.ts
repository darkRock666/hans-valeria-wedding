import { appendRsvp, SheetsStoreError } from "@/lib/sheets-store";
import { readBoundedJson, sameOrigin, validateRsvp } from "@/lib/rsvp-validation";
import { allowBurst, PRIVATE_HEADERS } from "@/lib/server-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "No se pudo verificar el envío." }, { status: 403, headers: PRIVATE_HEADERS });
  if (!allowBurst(request, "rsvp")) return Response.json({ error: "Espera un minuto antes de volver a intentar." }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "60" } });
  let payload: unknown;
  try { payload = await readBoundedJson(request); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json({ error: "Revisa los datos e intenta otra vez." }, { status: message === "BODY_SIZE" ? 413 : message === "CONTENT_TYPE" ? 415 : 400, headers: PRIVATE_HEADERS });
  }
  const validation = validateRsvp(payload);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400, headers: PRIVATE_HEADERS });
  if (validation.honeypot) return Response.json({ ok: true }, { headers: PRIVATE_HEADERS });
  try {
    const result = await appendRsvp(validation.value);
    return Response.json(result, { status: result.alreadySaved ? 200 : 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof SheetsStoreError && error.status !== 503) return Response.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS });
    return Response.json({ error: "No pudimos guardar tu respuesta. Tus datos siguen aquí; inténtalo de nuevo en unos instantes." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

export function GET() {
  return Response.json({ error: "Método no permitido." }, { status: 405, headers: { ...PRIVATE_HEADERS, "Allow": "POST" } });
}
