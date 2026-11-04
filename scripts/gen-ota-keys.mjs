// يولّد زوج مفاتيح توقيع التحديثات (مرة واحدة). المفتاح الخاص يُحفظ في GitHub Secret فقط ولا يُرفع للمستودع.
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
if (existsSync('ota-public.pem') || existsSync('ota-private.pem')) { console.error('المفاتيح موجودة بالفعل. لن أستبدلها (استبدالها يعطّل التحديثات للنسخ المثبتة).'); process.exit(1); }
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
writeFileSync('ota-public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
writeFileSync('ota-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
console.log('تم: ota-public.pem (يُرفع للمستودع) و ota-private.pem (سري: يُضاف كـ Secret ثم يُحذف من الجهاز بعد حفظ نسخة خاصة).');
