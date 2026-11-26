import test from "node:test";
import assert from "node:assert/strict";
import { validateRsvp, sameOrigin, readBoundedJson, csvCell } from "../lib/rsvp-validation.ts";
import { createSession, verifySession, verifyPassword, SESSION_SECONDS, sessionCookie, getCookie } from "../lib/admin-session.ts";

const sample = { name: " María   López ", attendance: "yes", guests: 1, requestId: "7410563d-0acb-4772-9d48-3e49fdce8328", website: "" };

test("normalizes a real name and confirms exactly one personal invitation", () => {
  const result = validateRsvp(sample);
  assert.equal(result.ok, true);
  assert.equal(result.honeypot, false);
  assert.equal(result.value.name, "María López");
  assert.equal(result.value.guests, 1);
  assert.equal(result.value.message, "");
});

test("optional private messages are trimmed, bounded, and kept as plain text", () => {
  const text = '<script>alert("x")</script>\nCon cariño, María';
  const result = validateRsvp({ ...sample, message: `  ${text}  ` });
  assert.equal(result.ok, true);
  assert.equal(result.value.message, text);
  assert.equal(validateRsvp({ ...sample, message: "x".repeat(501) }).ok, false);
  assert.equal(validateRsvp({ ...sample, message: 42 }).ok, false);
  assert.equal(validateRsvp({ ...sample, message: "hello\u0000world" }).ok, false);
  assert.equal(validateRsvp({ ...sample, message: "" }).ok, true);
});

test("rejects incomplete, invalid, excessive, and inconsistent responses", () => {
  for (const input of [null, [], { ...sample, name: " " }, { ...sample, name: "x".repeat(101) }, { ...sample, name: "Ana\nMaría" }, { ...sample, attendance: "maybe" }, { ...sample, guests: 0 }, { ...sample, guests: 2 }, { ...sample, guests: 21 }, { ...sample, guests: 1.5 }, { ...sample, guests: "1" }, { ...sample, requestId: "bad" }, { ...sample, attendance: "no", guests: 1 }]) {
    assert.equal(validateRsvp(input).ok, false, JSON.stringify(input));
  }
  assert.equal(validateRsvp({ ...sample, attendance: "no", guests: 0 }).ok, true);
});

test("honeypot takes a non-persisting success path", () => {
  assert.deepEqual(validateRsvp({ website: "https://bot.test" }), { ok: true, honeypot: true });
});

test("cross-origin form writes are rejected, same-origin JSON writes are allowed", () => {
  assert.equal(sameOrigin(new Request("https://invite.test/api/rsvp", { headers: { origin: "https://evil.test" } })), false);
  assert.equal(sameOrigin(new Request("https://invite.test/api/rsvp", { headers: { origin: "https://invite.test" } })), true);
  assert.equal(sameOrigin(new Request("https://invite.test/api/rsvp", { headers: { "sec-fetch-site": "cross-site" } })), false);
  assert.equal(sameOrigin(new Request("https://invite.test/api/rsvp")), true);
});

test("body reader limits bytes and requires JSON content type", async () => {
  const request = (body, headers = {}) => new Request("https://invite.test/api/rsvp", { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } });
  assert.deepEqual(await readBoundedJson(request(JSON.stringify(sample))), sample);
  await assert.rejects(readBoundedJson(request("x".repeat(4097))), /BODY_SIZE/);
  await assert.rejects(readBoundedJson(request("\"" + "é".repeat(2100) + "\"")), /BODY_SIZE/);
  await assert.rejects(readBoundedJson(request("{}", { "Content-Type": "text/plain" })), /CONTENT_TYPE/);
  await assert.rejects(readBoundedJson(request("{bad")));
});

test("CSV fields quote values and neutralize spreadsheet formulas", () => {
  assert.equal(csvCell('María "López"'), '"María ""López"""');
  for (const value of ["=1+1", "+SUM(A1)", "-3", "@SUM(1)", "  =NOW()", "\t=1"]) {
    assert.equal(csvCell(value).startsWith('"\''), true);
  }
  assert.equal(csvCell("Ana, María"), '"Ana, María"');
});

test("admin sessions reject tampering, expiration, and another secret", async () => {
  const secret = "example-only-test-secret-32-characters";
  const now = Date.UTC(2026, 10, 24, 12);
  const token = await createSession(secret, now);
  assert.equal(await verifySession(token, secret, now), true);
  assert.equal(await verifySession(token, secret, now + (SESSION_SECONDS - 1) * 1000), true);
  assert.equal(await verifySession(token, secret, now + SESSION_SECONDS * 1000), false);
  assert.equal(await verifySession(token, `${secret}-wrong`, now), false);
  assert.equal(await verifySession(`${token.slice(0, -2)}aa`, secret, now), false);
  assert.equal(await verifySession(token, undefined, now), false);
  assert.equal(await verifySession("bad.token.extra", secret, now), false);
});

test("admin password checks and cookie attributes", async () => {
  assert.equal(await verifyPassword("right", "right"), true);
  assert.equal(await verifyPassword("wrong", "right"), false);
  assert.equal(await verifyPassword("", ""), false);
  assert.match(sessionCookie("signed", true), /HttpOnly; SameSite=Strict; Max-Age=43200; Secure/);
  assert.equal(getCookie(new Request("https://invite.test", { headers: { Cookie: "other=abc; hv_admin=signed" } }), "hv_admin"), "signed");
});
