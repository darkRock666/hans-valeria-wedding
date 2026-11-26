/**
 * Hans & Valeria — private Google Sheets RSVP bridge.
 * Script Properties: API_SECRET, SPREADSHEET_ID; optional SHEET_NAME.
 * Deploy as a Web app, execute as the owner. The Sheet stays private.
 * Every operation, including reads, requires a server-generated HMAC.
 */
var HV_HEADERS = ['ID', 'Nombre', 'Asistencia', 'Mensaje', 'Fecha UTC'];
var HV_ENCODED_PREFIX = '~hv1:';
var HV_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function doGet() {
  return hvJson_({ ok: false, status: 405, error: 'Método no permitido.' });
}

function doPost(e) {
  try {
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty('API_SECRET');
    if (!secret || secret.length < 32) return hvJson_({ ok: false, status: 503, error: 'Servicio no disponible.' });
    if (!e || !e.postData || typeof e.postData.contents !== 'string' || e.postData.contents.length > 16000 || Number(e.contentLength || 0) > 16000) {
      return hvJson_({ ok: false, status: 400, error: 'Solicitud no válida.' });
    }
    var envelope;
    try { envelope = JSON.parse(e.postData.contents); }
    catch (_) { return hvJson_({ ok: false, status: 400, error: 'Solicitud no válida.' }); }
    if (!envelope || typeof envelope.data !== 'string' || envelope.data.length > 12000 || typeof envelope.signature !== 'string' || !/^[0-9a-f]{64}$/.test(envelope.signature)) {
      return hvJson_({ ok: false, status: 401, error: 'Solicitud no autorizada.' });
    }
    var bytes = Utilities.computeHmacSha256Signature(envelope.data, secret, Utilities.Charset.UTF_8);
    var expected = bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
    if (!hvEqual_(expected, envelope.signature)) return hvJson_({ ok: false, status: 401, error: 'Solicitud no autorizada.' });
    var data;
    try { data = JSON.parse(envelope.data); }
    catch (_) { return hvJson_({ ok: false, status: 400, error: 'Solicitud no válida.' }); }
    if (!data || typeof data.timestamp !== 'number' || !Number.isSafeInteger(data.timestamp) || Math.abs(Date.now() - data.timestamp) > 5 * 60 * 1000) {
      return hvJson_({ ok: false, status: 401, error: 'La solicitud ha caducado.' });
    }
    if (data.action !== 'append' && data.action !== 'list') return hvJson_({ ok: false, status: 400, error: 'Acción no válida.' });
    var input = null;
    if (data.action === 'append') {
      input = hvValidate_(data.payload);
      if (!input) return hvJson_({ ok: false, status: 400, error: 'Datos de confirmación no válidos.' });
    }
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return hvJson_({ ok: false, status: 503, error: 'El servicio está ocupado. Intenta otra vez.' });
    try {
      var sheet = hvSheet_(properties);
      var records = hvRecords_(sheet);
      if (data.action === 'list') return hvJson_({ ok: true, rows: records });
      var existing = records.filter(function (row) { return row.requestId === input.requestId; });
      if (existing.length) {
        var same = existing.every(function (row) { return row.name === input.name && row.attendance === input.attendance && row.message === input.message; });
        return hvJson_(same ? { ok: true, alreadySaved: true } : { ok: false, status: 409, error: 'El identificador ya corresponde a otra respuesta.' });
      }
      var nextRow = sheet.getLastRow() + 1;
      if (nextRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, nextRow - sheet.getMaxRows()));
      sheet.getRange(nextRow, 1, 1, 5).setNumberFormat('@').setValues([[
        input.requestId,
        hvEncode_(input.name),
        input.attendance,
        hvEncode_(input.message),
        new Date().toISOString()
      ]]);
      SpreadsheetApp.flush();
      return hvJson_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (_) {
    // Never return Google errors, tokens, properties, or row contents publicly.
    return hvJson_({ ok: false, status: 503, error: 'No se pudo completar la operación. Intenta otra vez.' });
  }
}

function hvJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function hvEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function hvSheet_(properties) {
  var id = properties.getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('CONFIG');
  var spreadsheet = SpreadsheetApp.openById(id);
  var sheet = spreadsheet.getSheetByName(properties.getProperty('SHEET_NAME') || 'Confirmaciones');
  if (!sheet) throw new Error('SHEET');
  var headers = sheet.getRange(1, 1, 1, 5).getDisplayValues()[0];
  if (!HV_HEADERS.every(function (header, index) { return header === headers[index]; })) throw new Error('HEADERS');
  return sheet;
}

function hvRecords_(sheet) {
  var count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  if (count > 20000) throw new Error('LIMIT');
  return sheet.getRange(2, 1, count, 5).getValues().filter(function (row) { return String(row[0]).trim() !== ''; }).map(function (row) {
    var id = String(row[0]);
    var attendance = String(row[2]);
    var date = row[4] instanceof Date ? row[4].toISOString() : String(row[4]);
    if (!HV_UUID.test(id) || (attendance !== 'yes' && attendance !== 'no') || !date || !Number.isFinite(new Date(date).getTime())) throw new Error('ROW');
    return { requestId: id, name: hvDecode_(row[1]), attendance: attendance, message: hvDecode_(row[3]), createdAt: new Date(date).toISOString() };
  });
}

function hvValidate_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.name !== 'string' || /[\u0000-\u001f\u007f]/.test(payload.name)) return null;
  var name = payload.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100 || (payload.attendance !== 'yes' && payload.attendance !== 'no') || typeof payload.requestId !== 'string' || !HV_UUID.test(payload.requestId)) return null;
  if (payload.message !== undefined && typeof payload.message !== 'string') return null;
  var message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (message.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) return null;
  return { requestId: payload.requestId, name: name, attendance: payload.attendance, message: message };
}

function hvEncode_(text) {
  // Reversible, non-formula storage. Normal names/messages remain readable.
  if (/^\s*[=+\-@']/.test(text) || text.indexOf(HV_ENCODED_PREFIX) === 0) return HV_ENCODED_PREFIX + JSON.stringify(text);
  return text;
}

function hvDecode_(value) {
  var text = String(value == null ? '' : value);
  if (text.indexOf(HV_ENCODED_PREFIX) !== 0) return text;
  try {
    var decoded = JSON.parse(text.slice(HV_ENCODED_PREFIX.length));
    return typeof decoded === 'string' ? decoded : text;
  } catch (_) { return text; }
}
