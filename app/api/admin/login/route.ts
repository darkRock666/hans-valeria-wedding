import { createSession, sessionCookie, verifyPassword } from "@/lib/admin-session";
import { readBoundedJson, sameOrigin } from "@/lib/rsvp-validation";
import { allowBurst, PRIVATE_HEADERS } from "@/lib/server-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Solicitud no permitida." }, { status: 403, headers: PRIVATE_HEADERS });
  if (!allowBurst(request, "login")) return Response.json({ error: "Demasiados intentos. Vuelve a intentarlo en 15 minutos." }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "900" } });
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 24) return Response.json({ error: "El acceso privado aún no está configurado." }, { status: 503, headers: PRIVATE_HEADERS });
  let input: unknown;
  try { input = await readBoundedJson(request); }
  catch { return Response.json({ error: "Revisa tu clave de acceso." }, { status: 400, headers: PRIVATE_HEADERS }); }
  const password = input && typeof input === "object" && "password" in input ? (input as { password: unknown }).password : null;
  if (typeof password !== "string" || !await verifyPassword(password, secret)) return Response.json({ error: "La clave de acceso no es correcta." }, { status: 401, headers: PRIVATE_HEADERS });
  const token = await createSession(secret);
  return Response.json({ ok: true }, { headers: { ...PRIVATE_HEADERS, "Set-Cookie": sessionCookie(token, new URL(request.url).protocol === "https:" || process.env.VERCEL === "1") } });
}
