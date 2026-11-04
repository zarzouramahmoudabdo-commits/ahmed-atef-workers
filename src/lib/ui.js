export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let tt;
export function toast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.style.display = 'block';
  clearTimeout(tt); tt = setTimeout(() => (t.style.display = 'none'), err ? 6000 : 2500);
}
/** يحوّل أخطاء السيرفر/الشبكة لرسالة عربية واضحة. */
export function errMsg(e) {
  const m = String(e?.message || e || '');
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'تعذر الاتصال بالإنترنت. لم يتم الحفظ، حاول مرة أخرى.';
  const known = m.match(/(NOT_ADMIN|NOT_STAFF|BAD_STATUS|NO_WORKER|ARCHIVED|OVERTIME_EXISTS|OVERTIME_REQUIRES_PRESENT|NO_RECORD|NAME_MISMATCH|BAD_DATE|FUTURE_DATE|REASON_REQUIRED|BAD_BACKUP|BAD_TABLE): ?(.*)/);
  if (known) return known[2];
  if (/row-level security|permission denied/i.test(m)) return 'غير مصرح لك بهذه العملية.';
  if (/deductions_reason_check/.test(m)) return 'سبب الخصم مطلوب.';
  if (/check constraint|violates/i.test(m)) return 'القيمة غير صحيحة أو تخالف قواعد الحسابات.';
  if (/Invalid login/i.test(m)) return 'البريد أو كلمة المرور غير صحيحة.';
  return m || 'حدث خطأ غير متوقع';
}
export const errCode = (e) => (String(e?.message || '').match(/^[A-Z_]{4,}(?=:)/) || [''])[0];

// تشفير النسخ الاحتياطية بكلمة مرور (PBKDF2 + AES-GCM). المفتاح لا يُخزَّن في أي مكان.
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyFrom(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptText(text, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), new TextEncoder().encode(text)));
  return JSON.stringify({ format: 'ahmed-atef-workers-encrypted-v1', salt: b64(salt), iv: b64(iv), data: b64(ct) });
}
export async function decryptText(json, pass) {
  const o = JSON.parse(json);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await keyFrom(pass, unb64(o.salt)), unb64(o.data));
  return new TextDecoder().decode(pt);
}
export async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const b64ToBytes = unb64;
export function cmpVersion(a, b) {
  const x = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0), y = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
