// يولّد حزمة التحديث الموقّعة: ota-bundle.json + ota-bundle.sig + ملفات الواجهة.
// المتغيرات: APP_VERSION, APK_NAME, APK_SHA, NOTES, OTA_PRIVATE_KEY (PEM)
import { createHash, sign } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const need = (k) => { if (!process.env[k]) { console.error('ناقص: ' + k); process.exit(1); } return process.env[k]; };
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const out = 'ota-out'; mkdirSync(out, { recursive: true });
const files = ['index.html', 'app.js', 'style.css'].map((name) => {
  const buf = readFileSync('www/' + name); writeFileSync(`${out}/ota-${name}`, buf);
  return { name, sha256: createHash('sha256').update(buf).digest('hex') };
});
const manifest = {
  version: need('APP_VERSION'), minApk: pkg.minApk, notes: process.env.NOTES || '', files,
  apk: { name: need('APK_NAME'), sha256: need('APK_SHA') },
};
const json = JSON.stringify(manifest, null, 2);
writeFileSync(`${out}/ota-bundle.json`, json);
const sig = sign('sha256', Buffer.from(json), { key: need('OTA_PRIVATE_KEY'), dsaEncoding: 'ieee-p1363' });
writeFileSync(`${out}/ota-bundle.sig`, sig.toString('base64'));
console.log('تم توليد الحزمة الموقّعة للإصدار', manifest.version);
