-- منع تسجيل أي عملية بتاريخ قادم (بتوقيت مصر) على مستوى قاعدة البيانات.
create or replace function public.app_today() returns date language sql stable as
$$ select (now() at time zone 'Africa/Cairo')::date $$;

create or replace function public.reject_future_date() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) ->> tg_argv[0])::date > public.app_today() then
    raise exception 'FUTURE_DATE: لا يمكن تسجيل عملية بتاريخ قادم';
  end if;
  return new;
end $$;

create trigger attendance_no_future before insert or update on public.attendance for each row execute function public.reject_future_date('work_date');
create trigger advances_no_future   before insert or update on public.advances   for each row execute function public.reject_future_date('adv_date');
create trigger deductions_no_future before insert or update on public.deductions for each row execute function public.reject_future_date('ded_date');
create trigger payments_no_future   before insert or update on public.payments   for each row execute function public.reject_future_date('pay_date');
