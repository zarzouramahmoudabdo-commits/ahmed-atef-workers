-- سياسات الأمان (RLS). الكتابة المالية والحضور عبر دوال السيرفر فقط.
alter table public.profiles   enable row level security;
alter table public.workers    enable row level security;
alter table public.attendance enable row level security;
alter table public.advances   enable row level security;
alter table public.deductions enable row level security;
alter table public.payments   enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());

create policy workers_read   on public.workers for select to authenticated using (public.is_staff());
create policy workers_insert on public.workers for insert to authenticated with check (public.is_admin());
create policy workers_update on public.workers for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy attendance_read on public.attendance for select to authenticated using (public.is_staff());

create policy advances_read   on public.advances   for select to authenticated using (public.is_staff());
create policy advances_insert on public.advances   for insert to authenticated with check (public.is_admin() and voided_at is null);
create policy deductions_read   on public.deductions for select to authenticated using (public.is_staff());
create policy deductions_insert on public.deductions for insert to authenticated with check (public.is_admin() and voided_at is null);
create policy payments_read   on public.payments   for select to authenticated using (public.is_staff());
create policy payments_insert on public.payments   for insert to authenticated with check (public.is_admin() and voided_at is null);

create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());

-- لا سياسات تعديل/حذف مباشر للحضور والسلف والخصومات والمدفوعات: التعديل عبر الدوال فقط.
revoke all on public.attendance, public.advances, public.deductions, public.payments, public.audit_logs from anon, authenticated;
grant select on public.attendance, public.audit_logs to authenticated;
grant select, insert on public.advances, public.deductions, public.payments to authenticated;
revoke all on public.workers, public.profiles from anon;
revoke delete on public.workers from authenticated;
