// تحديث حزمة الواجهة من داخل التطبيق (OTA) مع توقيع رقمي ورجوع تلقائي عند الفشل.
import { Capacitor, CapacitorHttp, WebView } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { sha256Hex, b64ToBytes, cmpVersion } from './ui.js';

export const bytesToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const pemToDer = (pem) => b64ToBytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));

/** يتحقق من توقيع ECDSA P-256 (صيغة r||s الخام) على بيانات المانيفست. */
export async function verifySignature(pubPem, dataBytes, sigBytes) {
  const key = await crypto.subtle.importKey('spki', pemToDer(pubPem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, dataBytes);
}

export async function fetchBytes(url) {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: 'blob' });
    if (r.status >= 400) throw new Error('تعذر تنزيل الملف (HTTP ' + r.status + ')');
    return { bytes: b64ToBytes(r.data), b64: r.data };
  }
  const r = await fetch(url); if (!r.ok) throw new Error('تعذر تنزيل الملف (HTTP ' + r.status + ')');
  const bytes = new Uint8Array(await r.arrayBuffer()); return { bytes, b64: bytesToB64(bytes) };
}

const STATE = 'ota/state.json';
export async function readState() {
  try { return JSON.parse((await Filesystem.readFile({ path: STATE, directory: Directory.Data, encoding: Encoding.UTF8 })).data); }
  catch { return { current: null, pending: null, bad: [] }; }
}
const writeState = (st) => Filesystem.writeFile({ path: STATE, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true, data: JSON.stringify(st) });

/** يقرأ المانيفست الموقّع. يرمي خطأ إن لم يكن التوقيع صحيحًا. */
export async function checkOta({ repo, pubKey, version }) {
  if (!pubKey) throw new Error('التحديث من داخل التطبيق غير مفعّل في هذا الإصدار (لا يوجد مفتاح تحقق).');
  const base = `https://github.com/${repo}/releases/latest/download/`;
  const [m, s] = await Promise.all([fetchBytes(base + 'ota-bundle.json'), fetchBytes(base + 'ota-bundle.sig')]);
  const sig = b64ToBytes(new TextDecoder().decode(s.bytes).trim());
  if (!(await verifySignature(pubKey, m.bytes, sig))) throw new Error('توقيع التحديث غير صحيح. تم رفضه.');
  const manifest = JSON.parse(new TextDecoder().decode(m.bytes));
  const st = Capacitor.isNativePlatform() ? await readState() : { bad: [] };
  return { manifest, base, newer: cmpVersion(manifest.version, version) > 0, bad: (st.bad || []).includes(manifest.version) };
}

/** ينزّل ملفات الحزمة ويتحقق من SHA-256 لكل ملف ثم يحوّل التطبيق إليها (غير دائم حتى تقلع بنجاح). */
export async function applyOta({ manifest, base }) {
  if (!Capacitor.isNativePlatform()) throw new Error('التحديث من داخل التطبيق يعمل على Android فقط.');
  const dir = `ota/${manifest.version}`;
  for (const f of manifest.files) {
    const { bytes, b64 } = await fetchBytes(base + 'ota-' + f.name);
    if ((await sha256Hex(bytes)) !== f.sha256) throw new Error('فشل التحقق من الملف ' + f.name + '. لم يُثبَّت شيء.');
    await Filesystem.writeFile({ path: `${dir}/${f.name}`, directory: Directory.Data, data: b64, recursive: true });
  }
  const st = await readState(); st.pending = manifest.version; await writeState(st);
  const { uri } = await Filesystem.getUri({ path: dir, directory: Directory.Data });
  await WebView.setServerBasePath({ path: uri.replace(/^file:\/\//, '') });  // يعيد تحميل الواجهة بالحزمة الجديدة
}

/** يُستدعى بعد أن تُرسم الشاشة بنجاح: يثبّت الحزمة الجديدة، أو يسجّل فشل حزمة معلّقة ويعود للسابقة. */
export async function otaBoot(version) {
  if (!Capacitor.isNativePlatform()) return;
  const st = await readState();
  if (st.pending && st.pending === version) {
    await WebView.persistServerBasePath();
    st.current = version; st.pending = null; await writeState(st);
    try { // تنظيف الحزم القديمة
      const { files } = await Filesystem.readdir({ path: 'ota', directory: Directory.Data });
      for (const f of files) if (f.type === 'directory' && f.name !== version) await Filesystem.rmdir({ path: `ota/${f.name}`, directory: Directory.Data, recursive: true });
    } catch { /* لا يهم */ }
  } else if (st.pending) {
    st.bad = [...(st.bad || []), st.pending]; st.pending = null; await writeState(st);
  }
}

/** العودة للنسخة المدمجة في APK: يحذف حزم التحديث، ثم يلزم إغلاق التطبيق وفتحه. */
export async function resetOta() {
  await Filesystem.rmdir({ path: 'ota', directory: Directory.Data, recursive: true }).catch(() => {});
}
