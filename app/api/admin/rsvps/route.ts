import { listRsvps } from "@/lib/sheets-store";
import { csvCell } from "@/lib/rsvp-validation";
import { isAdminRequest, PRIVATE_HEADERS } from "@/lib/server-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!await isAdminRequest(request)) return Response.json({ error: "Acceso privado." }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const { rows, totals, truncated, limit } = await listRsvps();
    if (new URL(request.url).searchParams.get("format") === "csv") {
      if (truncated) return Response.json({ error: "La exportación supera 5000 respuestas. Solicita una exportación completa antes de descargar." }, { status: 409, headers: PRIVATE_HEADERS });
      const data = [
        ["Nombre", "Asistencia", "Mensaje", "Fecha de respuesta (UTC)"],
        ...rows.map((row) => [row.name, row.attendance === "yes" ? "Sí" : "No", row.message, row.createdAt]),
      ].map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new Response(`\uFEFF${data}`, { headers: { ...PRIVATE_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hans-valeria-confirmaciones.csv"', "X-Content-Type-Options": "nosniff" } });
    }
    return Response.json({ rows, totals, truncated, limit }, { headers: PRIVATE_HEADERS });
  } catch {
    return Response.json({ error: "No pudimos cargar las confirmaciones. Vuelve a intentarlo en unos instantes." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
