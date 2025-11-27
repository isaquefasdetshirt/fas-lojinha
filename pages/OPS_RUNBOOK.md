# OPS_RUNBOOK (resumido)

Emergency contacts: [nome1 <email>, nome2 <email>]

Quick rollback (desabilitar RLS numa tabela problemática):
```sql
ALTER TABLE public.<nome_da_tabela> DISABLE ROW LEVEL SECURITY;
```

Reatribuir pagamentos (procedimento rápido):
1) Backup:
```sql
CREATE TABLE admin_backup.payments_reassign_backup_20251127 AS
SELECT * FROM public.payments WHERE created_by = '<OLD_UUID>';
```
2) Update:
```sql
UPDATE public.payments SET created_by = '<NEW_UUID>' WHERE created_by = '<OLD_UUID>';
```
3) Log manual (opcional):
```sql
INSERT INTO admin_actions.payment_reassign_log(payment_id, old_creator, new_creator, performed_by, note)
SELECT id, '<OLD_UUID>'::uuid, '<NEW_UUID>'::uuid, '<PERFORMED_BY>'::uuid, 'emergency manual reassign' FROM public.payments WHERE created_by = '<NEW_UUID>';
```

Quick checks:
- RLS status:
```sql
SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND relname IN ('profiles','customers','sales','sale_items','payments','user_counters');
```
- Policies referencing `profiles`:
```sql
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND (qual ILIKE '%profiles%' OR with_check ILIKE '%profiles%');
```

If critical function/trigger fails: check definition and SECURITY DEFINER:
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'sync_app_admins';
```

If DB corrupted/major failure: restore from `admin_backup` schema or from Postgres dump.

End of OPS_RUNBOOK
