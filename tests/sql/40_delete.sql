\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(sql text, must_contain text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(must_contain in sqlerrm) = 0 then raise exception 'خطأ مختلف عن المتوقع (%): %', must_contain, sqlerrm; end if;
    return;
  end;
  raise exception 'كان يجب أن تفشل العملية: %', sql;
end $$;
create or replace function pg_temp.eq(a numeric, b numeric, msg text) returns void language plpgsql as $$
begin if a is distinct from b then raise exception 'FAIL % : got % expected %', msg, a, b; end if; raise notice 'PASS %', msg; end $$;

set test.uid = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;
insert into public.workers(id, full_name, daily_rate, overtime_rate) values ('55555555-5555-5555-5555-555555555555','عامل للحذف',100,50), ('66666666-6666-6666-6666-666666666666','بلا سجلات',100,50);
select public.set_attendance('55555555-5555-5555-5555-555555555555','2026-06-10','present');
select public.set_attendance('55555555-5555-5555-5555-555555555555','2026-06-11','absent');
insert into public.advances(worker_id, amount, adv_date) values ('55555555-5555-5555-5555-555555555555', 30, '2026-06-10');
insert into public.payments(worker_id, amount, pay_date) values ('55555555-5555-5555-5555-555555555555', 40, '2026-06-12');

select pg_temp.eq((public.worker_delete_preview('55555555-5555-5555-5555-555555555555')->>'attendance')::numeric, 2, 'X1 المعاينة: عدد الحضور');
select pg_temp.eq((public.worker_delete_preview('55555555-5555-5555-5555-555555555555')->>'paid_total')::numeric, 40, 'X2 المعاينة: المدفوع');
-- بدون الاسم أو باسم خاطئ: يُرفض ولا يُحذف شيء
select pg_temp.expect_fail($$select public.delete_worker('55555555-5555-5555-5555-555555555555')$$, 'NAME_MISMATCH');
select pg_temp.expect_fail($$select public.delete_worker('55555555-5555-5555-5555-555555555555', 'اسم آخر')$$, 'NAME_MISMATCH');
select pg_temp.eq((select count(*) from public.workers where id='55555555-5555-5555-5555-555555555555'), 1, 'X3 العامل لم يُحذف بعد الرفض');
select pg_temp.eq((select count(*) from public.attendance where worker_id='55555555-5555-5555-5555-555555555555'), 2, 'X4 السجلات لم تُحذف بعد الرفض');
-- غير مدير
set test.uid = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect_fail($$select public.delete_worker('55555555-5555-5555-5555-555555555555', 'عامل للحذف')$$, 'NOT_ADMIN');
select pg_temp.expect_fail($$select public.worker_delete_preview('55555555-5555-5555-5555-555555555555')$$, 'NOT_ADMIN');
set test.uid = '00000000-0000-0000-0000-0000000000a1';
-- الاسم الصحيح (مع مسافات زائدة): يُحذف كل شيء
select pg_temp.eq((public.delete_worker('55555555-5555-5555-5555-555555555555', '  عامل للحذف ')->>'payments')::numeric, 1, 'X5 الحذف بالاسم الصحيح');
select pg_temp.eq((select count(*) from public.workers where id='55555555-5555-5555-5555-555555555555'), 0, 'X6 العامل حُذف');
select pg_temp.eq((select count(*) from public.attendance where worker_id='55555555-5555-5555-5555-555555555555')
  + (select count(*) from public.advances where worker_id='55555555-5555-5555-5555-555555555555')
  + (select count(*) from public.payments where worker_id='55555555-5555-5555-5555-555555555555'), 0, 'X7 كل السجلات حُذفت');
select pg_temp.eq((select count(*) from public.month_report(2026,6,true) where worker_id='55555555-5555-5555-5555-555555555555'), 0, 'X8 اختفى من التقرير');
reset role;
select pg_temp.eq((select count(*) from public.audit_logs where table_name='attendance' and action='DELETE' and old_data->>'worker_id'='55555555-5555-5555-5555-555555555555'), 2, 'X9 سجل التدقيق يحفظ الحضور المحذوف');
select pg_temp.eq((select count(*) from public.audit_logs where table_name='payments' and action='DELETE' and (old_data->>'amount')::numeric = 40), 1, 'X10 سجل التدقيق يحفظ الدفعة المحذوفة');
select pg_temp.eq((select count(*) from public.audit_logs where table_name='workers' and action='DELETE' and old_data->>'full_name'='عامل للحذف'), 1, 'X11 سجل التدقيق يحفظ العامل');
set test.uid = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;
-- عامل بلا سجلات: يُحذف بدون اسم
select pg_temp.eq((public.delete_worker('66666666-6666-6666-6666-666666666666')->>'attendance')::numeric, 0, 'X12 حذف عامل بلا سجلات');
select pg_temp.expect_fail($$select public.delete_worker('66666666-6666-6666-6666-666666666666')$$, 'NO_WORKER');
select pg_temp.expect_fail($$delete from public.workers$$, 'permission denied');
\echo DELETE_TESTS_PASSED
