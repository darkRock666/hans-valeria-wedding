import { SESSION_COOKIE } from "@/lib/admin-session";
import { sameOrigin } from "@/lib/rsvp-validation";
import { PRIVATE_HEADERS } from "@/lib/server-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Solicitud no permitida." }, { status: 403, headers: PRIVATE_HEADERS });
  return Response.json({ ok: true }, { headers: { ...PRIVATE_HEADERS, "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${new URL(request.url).protocol === "https:" || process.env.VERCEL === "1" ? "; Secure" : ""}` } });
}
