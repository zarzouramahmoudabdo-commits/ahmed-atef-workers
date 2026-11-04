import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

test('كل الشاشات تُرسم بلا أخطاء (عميل Supabase وهمي)', async () => {
  const out = await build({ entryPoints: ['src/app.js'], bundle: true, write: false, format: 'iife', alias: { '@supabase/supabase-js': './tests/smoke/mock-supabase.js' },
    define: { __SUPABASE_URL__: '"https://x.supabase.co"', __SUPABASE_ANON_KEY__: '"k"', __APP_VERSION__: '"1.0.0"', __REPO__: '"o/r"', __OTA_PUBKEY__: '""' } });
  const dom = new JSDOM(readFileSync('src/index.html', 'utf8').replace('<script src="app.js"></script>', ''), { runScripts: 'outside-only', url: 'https://localhost/' });
  const w = dom.window; w.crypto.randomUUID ??= () => 'id-' + Math.random(); w.alert = () => {}; w.scrollTo = () => {}; w.confirm = () => true; w.prompt = () => 'x';
  const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
  w.eval(out.outputFiles[0].text);
  const wait = () => new Promise((r) => setTimeout(r, 60));
  await wait();
  const text = () => w.document.getElementById('app').textContent;
  assert.match(text(), /لوحة التحكم/); assert.match(text(), /العمال النشطون/);
  const click = async (sel) => { const el = w.document.querySelector(sel); assert.ok(el, 'غير موجود: ' + sel); el.click(); await wait(); };
  for (const [go, expect] of [['workers', 'محمد'], ['attendance', 'سهرة'], ['advances', 'ظروف'], ['deductions', 'سبب الخصم'], ['payments', 'طريقة الدفع'], ['report', 'الإجمالي'], ['backup', 'استعادة'], ['settings', 'الإصدار الحالي']]) {
    await click('[data-act="home"]').catch(() => {}); await click(`[data-go="${go}"]`);
    assert.match(text(), new RegExp(expect), go); assert.ok(!/خطأ/.test(w.document.querySelector('h1').textContent), 'شاشة خطأ في ' + go);
  }
  await click('[data-act="home"]'); await click('[data-go="workers"]'); await click('[data-go="workerDetail"]');
  assert.match(text(), /الرصيد المتبقي للدفع/); assert.ok(!/تحذير: اختلاف/.test(text()), 'عدم تطابق الحساب');
  await click('[data-act="wa"]'); assert.match(text(), /كشف حساب شهر/); assert.match(text(), /\+201012345678/);
  // البحث: الحقل لا يُعاد بناؤه أثناء الكتابة (وإلا تُغلق لوحة المفاتيح)
  await click('[data-act="home"]'); await click('[data-go="workers"]');
  const q = w.document.getElementById('wq'); q.value = 'مح'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait();
  assert.equal(w.document.getElementById('wq'), q, 'الحقل أُعيد بناؤه');
  assert.match(w.document.getElementById('wlist').textContent, /محمد/);
  q.value = 'زززز'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait();
  assert.match(w.document.getElementById('wlist').textContent, /لا يوجد عمال/); assert.equal(w.document.getElementById('wq'), q);
  // بحث الحضور: يُخفي البطاقات دون إعادة بناء الحقل
  await click('[data-act="home"]'); await click('[data-go="attendance"]');
  const aq = w.document.getElementById('aq'); assert.ok(aq, 'حقل بحث الحضور غير موجود');
  const card = () => w.document.querySelector('#alist [data-name]');
  assert.notEqual(card().style.display, 'none');
  aq.value = 'محمد'; aq.dispatchEvent(new w.Event('input', { bubbles: true })); await wait();
  assert.equal(w.document.getElementById('aq'), aq, 'الحقل أُعيد بناؤه'); assert.notEqual(card().style.display, 'none');
  aq.value = 'زززز'; aq.dispatchEvent(new w.Event('input', { bubbles: true })); await wait();
  assert.equal(card().style.display, 'none'); assert.notEqual(w.document.getElementById('anone').style.display, 'none');
  aq.value = ''; aq.dispatchEvent(new w.Event('input', { bubbles: true })); await wait();
  assert.notEqual(card().style.display, 'none');
  // الحضور يفتح على اليوم، والتاريخ السابق مقفول حتى يُفتح صراحة، والقادم ممنوع
  await click('[data-act="home"]'); await click('[data-go="attendance"]');
  assert.match(text(), /✓ اليوم/); assert.ok(w.document.querySelector('[data-act="att"]'), 'أزرار اليوم غير ظاهرة');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  let past = [...w.document.querySelectorAll('[data-act="pick"]')].find((b) => b.dataset.d < today);
  if (!past) { await click('[data-act="mprev"]'); past = w.document.querySelector('[data-act="pick"]'); }
  past.click(); await wait();
  assert.match(text(), /تاريخًا سابقًا/); assert.equal(w.document.querySelector('[data-act="att"]'), null, 'التاريخ السابق يجب أن يكون مقفولًا');
  await click('[data-act="unlock"]'); assert.ok(w.document.querySelector('[data-act="att"]'), 'لم يُفتح التعديل بعد التأكيد');
  await click('[data-act="today"]'); await click('[data-act="mnext"]');
  w.document.querySelector('[data-act="pick"]').click(); await wait();
  assert.match(text(), /تاريخ قادم/); assert.equal(w.document.querySelector('[data-act="att"]'), null, 'التاريخ القادم يجب أن يكون ممنوعًا');
  // حذف العامل: زر موجود، ويطلب تأكيدًا ثم يعود لقائمة العمال دون أخطاء
  await click('[data-act="home"]'); await click('[data-go="workers"]'); await click('[data-go="workerDetail"]'); await click('[data-go="workerForm"]');
  assert.ok(w.document.querySelector('[data-act="deleteWorker"]'), 'زر الحذف غير موجود');
  const asked = []; w.confirm = (m) => { asked.push(m); return true; }; w.prompt = () => 'محمد';
  await click('[data-act="deleteWorker"]'); await wait();
  assert.ok(asked.some((m) => m.includes('2 يوم حضور') && m.includes('1 سلفة') && m.includes('1 دفعة')), 'رسالة التأكيد لا تعرض ما سيُحذف');
  assert.match(text(), /إضافة عامل/, 'لم يعد لقائمة العمال');
  w.confirm = () => true; w.prompt = () => 'x';
  // الرئيسية بلا اختيار تاريخ
  await click('[data-act="home"]');
  assert.equal(w.document.getElementById('dsel'), null); assert.ok(w.document.querySelector('[data-act="refresh"]'), 'زر 🔄 غير موجود');
  assert.deepEqual(errors, []);
});
