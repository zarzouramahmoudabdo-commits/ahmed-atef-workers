import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

test('كل الشاشات تُرسم بلا أخطاء (عميل Supabase وهمي)', async () => {
  const out = await build({ entryPoints: ['src/app.js'], bundle: true, write: false, format: 'iife', alias: { '@supabase/supabase-js': './tests/smoke/mock-supabase.js' },
    define: { __SUPABASE_URL__: '"https://x.supabase.co"', __SUPABASE_ANON_KEY__: '"k"', __APP_VERSION__: '"1.0.0"', __REPO__: '"o/r"' } });
  const dom = new JSDOM(readFileSync('src/index.html', 'utf8').replace('<script src="app.js"></script>', ''), { runScripts: 'outside-only', url: 'https://localhost/' });
  const w = dom.window; w.crypto.randomUUID ??= () => 'id-' + Math.random(); w.alert = () => {}; w.confirm = () => true; w.prompt = () => 'x';
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
  assert.deepEqual(errors, []);
});
