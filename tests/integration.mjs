import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Run against the local Next.js preview after configuring the Apps Script URL.
// Requests write two __QA__ replies to the configured private Google Sheet;
// the owner removes those test rows afterwards. No deletion endpoint exists.
// This script never prints the admin password, response data, or session cookie.
const project = path.resolve(import.meta.dirname, "..");
const base = new URL(process.env.QA_BASE_URL || "http://localhost:3000");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Integration tests are restricted to loopback.");
assert.equal(base.protocol, "http:", "Use the local HTTP preview.");
const vars = await readFile(path.join(project, ".env.local"), "utf8");
const secretLine = vars.split(/\r?\n/).find((line) => /^\s*ADMIN_PASSWORD\s*=/.test(line));
assert.ok(secretLine, "ADMIN_PASSWORD must be configured in the local .env.local file.");
let password = secretLine.slice(secretLine.indexOf("=") + 1).trim();
if (password.startsWith('"')) password = JSON.parse(password);
else if (password.startsWith("'")) password = password.slice(1, -1);
assert.ok(password.length >= 24, "Use a long test admin password.");

const marker = randomUUID();
const yes = { name: `__QA__ Integración Sí ${marker}`, attendance: "yes", guests: 1, requestId: randomUUID(), website: "", message: "__QA__ Mensaje privado <b>sin HTML</b>" };
const no = { name: `__QA__ Integración No ${marker}`, attendance: "no", guests: 0, requestId: randomUUID(), website: "" };
const qaDirectory = path.join(project, ".sites-runtime");
await mkdir(qaDirectory, { recursive: true });
await writeFile(path.join(qaDirectory, "qa-record-ids.json"), JSON.stringify({ localOnly: true, base: base.origin, requestIds: [yes.requestId, no.requestId], namePrefix: "__QA__", createdAt: new Date().toISOString() }, null, 2));

let passed = 0;
function pass(name) { passed++; console.log(`PASS ${name}`); }
async function request(endpoint, options = {}) {
  return fetch(new URL(endpoint, base), { redirect: "manual", ...options });
}
async function post(endpoint, body, extraHeaders = {}) {
  return request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Origin: base.origin, ...extraHeaders }, body: JSON.stringify(body) });
}

try {
  let response = await request("/api/admin/rsvps");
  assert.equal(response.status, 401, "Anonymous admin request must be rejected.");
  pass("admin records are private");

  response = await post("/api/rsvp", yes);
  assert.equal(response.status, 201, "A valid RSVP must be persisted.");
  assert.equal((await response.json()).ok, true);
  pass("attending RSVP is saved");

  response = await post("/api/rsvp", yes);
  assert.equal(response.status, 200, "An exact retry must be idempotent.");
  const retry = await response.json();
  assert.equal(retry.ok, true);
  assert.equal(retry.alreadySaved, true);
  pass("retry preserves one record");

  response = await post("/api/rsvp", { ...yes, name: `${yes.name} modificada` });
  assert.equal(response.status, 409, "A reused id with changed data must not overwrite a saved reply.");
  pass("conflicting retry is rejected");

  response = await post("/api/rsvp", no);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ok, true);
  pass("declined RSVP saves zero guests");

  for (const invalid of [{ ...yes, requestId: randomUUID(), name: " " }, { ...yes, requestId: randomUUID(), guests: 0 }, { ...yes, requestId: randomUUID(), guests: 2 }, { ...yes, requestId: randomUUID(), attendance: "no", guests: 1 }, { ...yes, requestId: randomUUID(), message: "x".repeat(501) }]) {
    response = await post("/api/rsvp", invalid);
    assert.equal(response.status, 400, "Invalid RSVPs must not be saved.");
  }
  pass("server validation rejects invalid answers");

  response = await post("/api/rsvp", { ...yes, requestId: randomUUID() }, { Origin: "https://unrelated.example" });
  assert.equal(response.status, 403, "Cross-origin writes must be rejected.");
  pass("cross-origin write is blocked");

  response = await post("/api/admin/login", { password });
  assert.equal(response.status, 200, "The local admin must be able to sign in.");
  const setCookie = response.headers.get("set-cookie") || "";
  assert.ok(setCookie.includes("HttpOnly"), "Admin session must use HttpOnly.");
  assert.ok(setCookie.includes("SameSite=Strict"), "Admin session must use SameSite Strict.");
  const cookie = setCookie.split(";")[0];
  assert.ok(cookie.startsWith("hv_admin="), "The signed admin session cookie must be present.");
  pass("admin sign-in creates a protected session");

  response = await request("/api/admin/rsvps", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const data = await response.json();
  const saved = data.rows.filter((row) => row.requestId === yes.requestId || row.requestId === no.requestId);
  assert.equal(saved.length, 2, "Only two QA records must exist after the retry and invalid attempts.");
  assert.equal(saved.filter((row) => row.requestId === yes.requestId).length, 1);
  assert.equal(saved.find((row) => row.requestId === yes.requestId)?.guests, 1);
  assert.equal(saved.find((row) => row.requestId === yes.requestId)?.message, yes.message);
  assert.equal(saved.find((row) => row.requestId === no.requestId)?.guests, 0);
  assert.equal(saved.find((row) => row.requestId === no.requestId)?.message, "", "Old clients omitting the optional message must remain compatible.");
  assert.ok(data.totals.responses >= 2 && data.totals.yes >= 1 && data.totals.no >= 1, "Totals must include persisted QA replies.");
  pass("private dashboard returns persisted replies and totals");

  response = await request("/api/admin/rsvps?format=csv", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type")?.includes("text/csv"));
  assert.ok(response.headers.get("content-disposition")?.includes("attachment"));
  const csv = await response.text();
  assert.ok(csv.includes(yes.name) && csv.includes(no.name), "CSV must include persisted QA replies.");
  assert.equal(csv.replace(/^\uFEFF/, "").split("\r\n")[0], '"Nombre","Asistencia","Mensaje","Fecha de respuesta (UTC)"', "Personal invitation exports include a private message but no party-size column.");
  assert.ok(csv.includes(yes.message), "Private CSV export must include the saved private message.");
  pass("private CSV export includes saved replies");

  response = await request("/api/admin/logout", { method: "POST", headers: { Cookie: cookie, Origin: base.origin } });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("set-cookie")?.includes("Max-Age=0"), "Logout must clear the browser session.");
  response = await request("/api/admin/rsvps");
  assert.equal(response.status, 401);
  pass("logout clears the session and anonymous access stays blocked");

  console.log(`Integration checks passed: ${passed}. QA record identifiers were saved to .sites-runtime/qa-record-ids.json for local cleanup.`);
} catch (error) {
  console.error(`Integration check failed: ${error instanceof Error ? error.message : "unexpected response"}`);
  process.exitCode = 1;
}
