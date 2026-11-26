import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHmac, randomUUID } from "node:crypto";
import { createSheetsStore, SheetsStoreError } from "../lib/sheets-store.ts";

const source = await readFile(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
const secret = "test-only-sheet-secret-more-than-32-characters";
const url = "https://script.google.com/macros/s/test-deployment/exec";
const sample = () => ({ requestId: randomUUID(), name: "María López", attendance: "yes", guests: 1, message: "Con cariño, nos vemos allí." });

function scriptHarness() {
  const state = { rows: [["ID", "Nombre", "Asistencia", "Mensaje", "Fecha UTC"]], held: false, busy: false, writes: 0, flushes: 0, accesses: 0, properties: { API_SECRET: secret, SPREADSHEET_ID: "private-test-sheet", SHEET_NAME: "Confirmaciones" } };
  const sheet = {
    getLastRow() { assert.equal(state.held, true, "Sheet reads must occur under the script lock."); return state.rows.length; },
    getMaxRows() { return 1000; },
    insertRowsAfter() {},
    getRange(row, column, count, columns) {
      assert.equal(state.held, true, "Sheet ranges must be accessed under the script lock.");
      const range = {
        getValues() { return Array.from({ length: count }, (_, i) => Array.from({ length: columns }, (_, j) => state.rows[row - 1 + i]?.[column - 1 + j] ?? "")); },
        getDisplayValues() { return this.getValues().map((values) => values.map(String)); },
        setNumberFormat(format) { assert.equal(format, "@"); return range; },
        setValues(values) {
          assert.equal(state.held, true);
          for (let i = 0; i < values.length; i++) {
            for (const value of values[i]) assert.equal(String(value).startsWith("="), false, "No written cell may be interpreted as a formula.");
            state.rows[row - 1 + i] = [...values[i]];
          }
          state.writes++;
          return range;
        },
      };
      return range;
    },
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => state.properties[key] }) },
    Utilities: { Charset: { UTF_8: "UTF-8" }, computeHmacSha256Signature(data, key, charset) { assert.equal(charset, "UTF-8"); return Array.from(createHmac("sha256", key).update(data, "utf8").digest(), (byte) => byte > 127 ? byte - 256 : byte); } },
    LockService: { getScriptLock: () => ({ tryLock(timeout) { assert.equal(timeout, 5000); if (state.busy || state.held) return false; state.held = true; return true; }, releaseLock() { assert.equal(state.held, true); state.held = false; } }) },
    SpreadsheetApp: {
      openById(id) { state.accesses++; assert.equal(id, "private-test-sheet"); return { getSheetByName: (name) => name === "Confirmaciones" ? sheet : null }; },
      flush() { assert.equal(state.held, true, "Writes must be flushed before releasing the lock."); state.flushes++; },
    },
    ContentService: { MimeType: { JSON: "application/json" }, createTextOutput(text) { return { text, setMimeType(mime) { assert.equal(mime, "application/json"); return this; } }; } },
  });
  vm.runInContext(source, context);
  function envelope(action, payload, timestamp = Date.now(), key = secret) {
    const data = JSON.stringify({ timestamp, action, payload });
    return { data, signature: createHmac("sha256", key).update(data).digest("hex") };
  }
  function call(body) {
    const contents = JSON.stringify(body);
    return JSON.parse(context.doPost({ contentLength: contents.length, postData: { contents, type: "application/json" } }).text);
  }
  const fetcher = async (_input, options) => {
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "follow", "Google ContentService redirects must be followed.");
    assert.equal(options.cache, "no-store");
    return Response.json(call(JSON.parse(options.body)));
  };
  return { state, context, envelope, call, fetcher };
}

test("Apps Script rejects unsigned, stale, and invalid requests before touching the Sheet", () => {
  const h = scriptHarness();
  const value = sample();
  assert.equal(h.call({ data: "{}", signature: "0".repeat(64) }).status, 401);
  assert.equal(h.call(h.envelope("append", value, Date.now() - 6 * 60_000)).status, 401);
  assert.equal(h.call(h.envelope("append", value, Date.now(), "a-different-test-secret")).status, 401);
  assert.equal(h.call(h.envelope("delete", value)).status, 400);
  assert.equal(h.call(h.envelope("append", { ...value, message: "x".repeat(501) })).status, 400);
  assert.equal(h.state.accesses, 0);
  assert.equal(h.state.rows.length, 1);
  assert.equal(JSON.parse(h.context.doGet().text).status, 405);
});

test("signed Node-to-Apps-Script contract saves exactly once and detects conflicting retries", async () => {
  const h = scriptHarness();
  const store = createSheetsStore({ url, secret, fetcher: h.fetcher });
  const value = sample();
  assert.deepEqual(await store.append(value), { ok: true });
  assert.deepEqual(await store.append(value), { ok: true, alreadySaved: true });
  await assert.rejects(store.append({ ...value, message: "Otro mensaje" }), (error) => error instanceof SheetsStoreError && error.status === 409);
  assert.equal(h.state.rows.length, 2);
  assert.equal(h.state.writes, 1);
  assert.equal(h.state.flushes, 1);
  assert.equal(h.state.held, false);
  const snapshot = await store.list();
  assert.deepEqual(snapshot.totals, { responses: 1, yes: 1, no: 0 });
  assert.equal(snapshot.rows[0].guests, 1);
  assert.equal(snapshot.rows[0].message, value.message);
});

test("concurrent callers reuse one request ID without adding duplicate rows through the locked writer", async () => {
  const h = scriptHarness();
  const store = createSheetsStore({ url, secret, fetcher: h.fetcher });
  const value = sample();
  const results = await Promise.all(Array.from({ length: 12 }, () => store.append(value)));
  assert.equal(results.filter((result) => result.alreadySaved).length, 11);
  assert.equal(h.state.writes, 1);
  assert.equal(h.state.rows.length, 2);
});

test("dangerous formulas, apostrophes, Unicode and the encoding marker round-trip without interpretation", async () => {
  const h = scriptHarness();
  const store = createSheetsStore({ url, secret, fetcher: h.fetcher });
  for (const name of ['=HYPERLINK("x")', "+Ana", "-Ana", "@Ana", "'Ana", '~hv1:"María"', "María Ñáñez"]) {
    const value = { ...sample(), name, message: "=SUM(1,2)\nCon cariño, María" };
    await store.append(value);
    const raw = h.state.rows.at(-1);
    if (name !== "María Ñáñez") assert.ok(raw[1].startsWith("~hv1:"));
    assert.ok(raw[3].startsWith("~hv1:"));
    const result = (await store.list()).rows.find((row) => row.requestId === value.requestId);
    assert.equal(result.name, name);
    assert.equal(result.message, value.message);
  }
});

test("a busy lock, missing configuration, or incorrect headers cannot write or expose provider details", async () => {
  const h = scriptHarness();
  const store = createSheetsStore({ url, secret, fetcher: h.fetcher });
  h.state.busy = true;
  await assert.rejects(store.append(sample()), (error) => error.status === 503);
  assert.equal(h.state.writes, 0);
  h.state.busy = false;
  h.state.rows[0][0] = "Wrong header";
  await assert.rejects(store.append(sample()), (error) => error.status === 503 && !error.message.includes("private-test-sheet"));
  assert.equal(h.state.held, false);
  assert.equal(h.state.writes, 0);
  h.state.properties.API_SECRET = "";
  assert.equal(h.call(h.envelope("list", {})).status, 503);
});

test("the adapter rejects unsafe endpoints, unconfirmed saves, Google HTML and network failures", async () => {
  for (const endpoint of ["http://script.google.com/macros/s/id/exec", "https://example.com/macros/s/id/exec", "https://script.google.com/macros/s/id/dev", `${url}?secret=forbidden`]) {
    assert.throws(() => createSheetsStore({ url: endpoint, secret }), SheetsStoreError);
  }
  for (const fetcher of [
    async () => new Response("<html>Google sign-in</html>"),
    async () => Response.json({ ok: false, status: 401, error: "private provider detail" }),
    async () => Response.json({}),
    async () => new Response("failed", { status: 500 }),
    async () => { throw new Error("secret provider error"); },
  ]) {
    const store = createSheetsStore({ url, secret, fetcher });
    await assert.rejects(store.append(sample()), (error) => error instanceof SheetsStoreError && error.status === 503 && !error.message.includes("secret") && !error.message.includes("private"));
  }
});

test("private list derives personal attendance, deduplicates retries and rejects conflicting data", async () => {
  const yes = { ...sample(), createdAt: "2026-11-24T12:00:00.000Z" };
  const no = { ...sample(), attendance: "no", createdAt: "2026-11-24T13:00:00.000Z" };
  const store = createSheetsStore({ url, secret, fetcher: async () => Response.json({ ok: true, rows: [yes, yes, no] }) });
  const result = await store.list();
  assert.deepEqual(result.totals, { responses: 2, yes: 1, no: 1 });
  assert.equal(result.rows[0].requestId, no.requestId);
  assert.equal(result.rows[0].guests, 0);
  const conflicting = createSheetsStore({ url, secret, fetcher: async () => Response.json({ ok: true, rows: [yes, { ...yes, name: "Otra persona" }] }) });
  await assert.rejects(conflicting.list(), (error) => error.status === 503);
});
