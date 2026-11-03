# دليل الإعداد (من Termux)

## 1) Supabase
1. أنشئ مشروعًا جديدًا في supabase.com.
2. **Authentication → Providers → Email**: عطّل «Allow new users to sign up» (لا إنشاء حسابات ذاتي).
3. **Authentication → Users → Add user**: أنشئ حساب المدير (بريد + كلمة مرور). انسخ الـ UUID الخاص به.
4. **SQL Editor**: شغّل الملفات بالترتيب: `supabase/migrations/001_schema.sql` ثم `002_rls.sql` ثم `003_functions.sql`.
5. اجعله مديرًا (استبدل الـ UUID):
   ```sql
   insert into public.profiles(id, full_name, role) values ('UUID-هنا', 'المدير', 'admin');
   ```
6. **Project Settings → API**: ستحتاج `Project URL` و `anon public key` فقط. **لا تستخدم service_role في أي مكان.**

## 2) المستودع (Termux)
```bash
cd ~/ahmed-atef-workers
git init -b main && git add -A && git commit -m "الإصدار الأول"
gh repo create ahmed-atef-workers --public --source=. --push
```
المستودع عام (لا يحتوي أسرارًا) ليتمكن التطبيق من قراءة `update.json` من GitHub Releases.

## 3) مفتاح التوقيع والـ Secrets
```bash
keytool -genkeypair -v -keystore aaw-release.jks -alias aaw -keyalg RSA -keysize 2048 -validity 10000
# احتفظ بنسخة من الملف وكلمة المرور في مكان آمن خارج المستودع. ضياعه يعني عدم إمكانية التحديث فوق النسخة المثبتة.
base64 -w0 aaw-release.jks | gh secret set KEYSTORE_B64
gh secret set KEYSTORE_PASSWORD     # يطلب القيمة بشكل مخفي
gh secret set KEY_ALIAS             # aaw
gh secret set KEY_PASSWORD
gh secret set SUPABASE_URL
gh secret set SUPABASE_ANON_KEY
```
## 4) البناء والإصدار
- أي push على main: يشغل الاختبارات ثم يبني APK (Artifact).
- إصدار رسمي: `git tag v1.0.0 && git push origin v1.0.0` ← يبني APK موقّعًا وينشر Release مع `update.json`.
- الإصدار الجديد = tag أكبر (v1.0.1) بنفس مفتاح التوقيع، والتطبيق يكتشفه من الإعدادات.
- الروابط الفعلية: `https://github.com/<حسابك>/ahmed-atef-workers/actions` وصفحة الـ Releases (تظهر بعد أول بناء ناجح فقط).

## 5) مستوى الحماية (بدقة)
1. **أثناء النقل**: HTTPS مع Supabase وGitHub.
2. **تشفير التخزين**: توفره Supabase على مستوى الخدمة/القرص؛ لا نتحكم فيه ولا نضيف عليه.
3. **صلاحيات الوصول**: RLS على كل الجداول؛ الكتابة المالية والحضور عبر دوال تتحقق من أن المستخدم مدير في جدول `profiles` (لا من قيمة يرسلها التطبيق).
4. **تشفير إضافي للمحتوى**: يُطبَّق فقط على ملفات النسخ الاحتياطي المصدّرة (AES-GCM بمفتاح من كلمة مرور تختارها، PBKDF2). بيانات قاعدة البيانات نفسها غير مشفرة على مستوى المحتوى، ومشرف مشروع Supabase يستطيع الوصول إليها.

## 6) النسخ الاحتياطي
- Supabase تقدم نسخًا احتياطية تلقائية حسب الخطة (راجع خطتك). لا تعتمد عليها وحدها.
- من التطبيق: «النسخ الاحتياطي» ← تصدير (مع كلمة مرور). الاستعادة آمنة للتكرار.
- جرّب الاستعادة مرة على مشروع تجريبي قبل أن تحتاجها.

## 7) حدود معروفة
- التثبيت ليس صامتًا: التطبيق ينزّل APK ويتحقق من SHA-256 ويحفظه في «المستندات»، ثم تفتحه أنت من الملفات وتوافق على التثبيت.
- استعادة كلمة المرور ترسل رابطًا من Supabase؛ إعداد صفحة إعادة التوجيه (Site URL) من لوحة Supabase مطلوب لتكتمل التجربة.
- لم تُجرَّب على جهاز Android فعلي: الحفظ في المستندات، التنزيل داخل التطبيق، فتح WhatsApp، طباعة PDF.
