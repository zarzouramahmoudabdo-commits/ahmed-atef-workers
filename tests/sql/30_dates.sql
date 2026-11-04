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
select pg_temp.expect_fail($$select public.set_attendance('11111111-1111-1111-1111-111111111111','2099-01-01','present')$$, 'FUTURE_DATE');
select pg_temp.expect_fail($$select public.mark_all_present('2099-01-01')$$, 'FUTURE_DATE');
select pg_temp.expect_fail($$select public.copy_attendance_from('2026-07-05','2099-01-01')$$, 'FUTURE_DATE');
select pg_temp.expect_fail($$insert into public.advances(worker_id, amount, adv_date) values ('11111111-1111-1111-1111-111111111111', 10, '2099-01-01')$$, 'FUTURE_DATE');
select pg_temp.expect_fail($$insert into public.deductions(worker_id, amount, ded_date, reason) values ('11111111-1111-1111-1111-111111111111', 10, '2099-01-01', 'x')$$, 'FUTURE_DATE');
select pg_temp.expect_fail($$insert into public.payments(worker_id, amount, pay_date) values ('11111111-1111-1111-1111-111111111111', 10, '2099-01-01')$$, 'FUTURE_DATE');
select pg_temp.eq((select count(*) from public.attendance where work_date > public.app_today()), 0, 'D1 لا سجلات حضور بتاريخ قادم');
-- اليوم (بتوقيت مصر) مسموح
select public.set_attendance('11111111-1111-1111-1111-111111111111', public.app_today(), 'present');
select pg_temp.eq((select count(*) from public.attendance where work_date = public.app_today() and worker_id='11111111-1111-1111-1111-111111111111'), 1, 'D2 تسجيل اليوم مسموح');
insert into public.advances(worker_id, amount, adv_date) values ('11111111-1111-1111-1111-111111111111', 10, public.app_today());
select pg_temp.eq((select count(*) from public.advances where adv_date = public.app_today()), 1, 'D3 سلفة اليوم مسموحة');
\echo DATE_TESTS_PASSED
