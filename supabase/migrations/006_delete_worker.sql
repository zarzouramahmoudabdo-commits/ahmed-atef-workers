-- حذف عامل نهائيًا (للمدير فقط). العامل بلا سجلات يُحذف مباشرة؛ العامل بسجلات يحتاج كتابة اسمه للتأكيد.
-- كل صف محذوف يُسجَّل تلقائيًا في audit_logs (بياناته القديمة كاملة)، فلا يضيع أثره.

create or replace function public.worker_delete_preview(p_worker uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  return jsonb_build_object(
    'attendance', (select count(*) from public.attendance where worker_id = p_worker),
    'advances',   (select count(*) from public.advances   where worker_id = p_worker),
    'deductions', (select count(*) from public.deductions where worker_id = p_worker),
    'payments',   (select count(*) from public.payments   where worker_id = p_worker),
    'paid_total', coalesce((select sum(amount) from public.payments where worker_id = p_worker and voided_at is null), 0));
end $$;

create or replace function public.delete_worker(p_worker uuid, p_name text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.workers; r jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN: غير مصرح'; end if;
  select * into w from public.workers where id = p_worker for update;
  if not found then raise exception 'NO_WORKER: العامل غير موجود'; end if;
  r := public.worker_delete_preview(p_worker);
  if ((r->>'attendance')::int + (r->>'advances')::int + (r->>'deductions')::int + (r->>'payments')::int) > 0
     and btrim(coalesce(p_name, '')) is distinct from btrim(w.full_name) then
    raise exception 'NAME_MISMATCH: اكتب اسم العامل كما هو تمامًا لتأكيد الحذف';
  end if;
  delete from public.attendance where worker_id = p_worker;
  delete from public.advances   where worker_id = p_worker;
  delete from public.deductions where worker_id = p_worker;
  delete from public.payments   where worker_id = p_worker;
  delete from public.workers    where id = p_worker;
  return r;
end $$;

revoke all on function public.worker_delete_preview, public.delete_worker from public, anon;
grant execute on function public.worker_delete_preview, public.delete_worker to authenticated;
