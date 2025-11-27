# SECURITY_PLAYBOOK

## Sumário rápido
- Estado esperado
- Comandos de verificação (RLS / policies / funções / app_admins)
- Operações administrativas (adicionar/remover admin)
- Rollback rápido (desabilitar RLS)
- Recuperação a partir de backups / “arquivo morto”
- Checks pós-deploy e monitoramento mínimo (72h)
- Debug: erros comuns e como interpretar‑los
- Scripts e automação (opcional)

---

## Estado atual esperado
- Tabelas críticas com RLS habilitado: `profiles`, `customers`, `sales`, `sale_items`, `payments`, `user_counters`.
- Tabela `app_admins` existe e está populada; trigger `sync_app_admins` mantém sincronização com `profiles`.
- Função `is_user_admin(uuid)` consulta `app_admins` (não consulta `profiles`).
- Não há policies que consultem `profiles` (evitar recursão).

---

## Comandos de verificação (execute no SQL Editor)

1) Status RLS nas tabelas sensíveis
```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles','customers','sales','sale_items','payments','user_counters','app_admins')
ORDER BY c.relname;
```

2) Listar policies de uma tabela (ex.: `customers`)
```sql
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename = 'customers';
```

3) Policies que referenciam `profiles` (checagem de regressão)
```sql
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND (qual ILIKE '%profiles%' OR with_check ILIKE '%profiles%');
```

4) Ver definição da função `is_user_admin`
```sql
SELECT proname, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE proname = 'is_user_admin';
```

5) Ver conteúdo de `app_admins`
```sql
SELECT * FROM public.app_admins;
```

6) Checar triggers relevantes (ex.: `sync_app_admins`)
```sql
SELECT event_object_table, trigger_name, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('profiles','app_admins');
```

7) Verificar colunas owner nas tabelas (created_by/user_id)
```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('customers','sales','sale_items','payments','user_counters')
  AND column_name IN ('created_by','user_id');
```

---

## Operações administrativas (adicionar / remover admin)

- Adicionar admin manualmente:
```sql
INSERT INTO public.app_admins(user_id)
VALUES ('<UUID_DO_USUARIO>')
ON CONFLICT DO NOTHING;
```

- Remover admin:
```sql
DELETE FROM public.app_admins WHERE user_id = '<UUID_DO_USUARIO>';
```

- Testar se um usuário é admin:
```sql
SELECT public.is_user_admin('<UUID_DO_USUARIO>');
```

Observação: o trigger `sync_app_admins` normalmente atualiza `app_admins` quando `profiles.role` muda; os comandos acima servem para intervenção manual.

---

## Rollback rápido / emergência

Se algo falhar (ex.: 403 generalizado, listagens indisponíveis):

1) Desabilitar RLS de uma tabela problemática:
```sql
ALTER TABLE public.<nome_da_tabela> DISABLE ROW LEVEL SECURITY;
```

2) Diagnóstico rápido:
- Verifique o console do frontend (Network) e logs Supabase.
- Rode os checks do início deste playbook (policies, colunas owner, is_user_admin).

3) Restaurar a partir de backup (exemplo simples para `customers`):
```sql
-- confirmar backup
SELECT COUNT(*) FROM admin_backup.customers;

-- restaurar (abordagem simplista)
DROP TABLE IF EXISTS public.customers;
CREATE TABLE public.customers AS TABLE admin_backup.customers;
```
Observação: para casos com FK/constraints/triggers, prefira um processo de restauração controlado.

---

## Recuperação: “arquivo morto” e backups
- Para restaurar uma tabela movida para o schema `"arquivo morto"`:
```sql
CREATE TABLE public.payment_allocation AS TABLE "arquivo morto".payment_allocation;
```
- Ou copiar dados:
```sql
INSERT INTO public.some_table (col1, col2, ...)
SELECT col1, col2, ... FROM "arquivo morto".some_table;
```
Sempre recrie índices/constraints/triggers se necessário.

---

## Checks pós-deploy e monitoramento (72h recomendados)

- O que monitorar:
  - Picos de 4xx/5xx no frontend (especialmente 403).
  - Logs do Supabase para erros de policy/trigger.
  - Fluxos críticos: registro → confirm e-mail → login; criar customer; criar sale + itens; efetuar payment.

- Recomendo:
  - Rodar o script de checagem automático diariamente (ex.: GitHub Actions).
  - Checar `app_admins` e políticas diariamente nas primeiras 72 horas.
  - Ter um canal de alerta (Slack/email) para notificações.

---

## Debug: erros comuns e soluções rápidas

- 403 / "permission denied"
  - Causa: policy RLS bloqueando.
  - Ações:
    - Verificar `pg_policies` para a tabela.
    - Confirmar se `created_by`/`user_id` está sendo preenchido pelo frontend.
    - Testar via SQL com a sessão que usa `auth.uid()` (via supabase client ou jwt).

- 400 / "column does not exist"
  - Causa: query espera coluna que não existe.
  - Ações:
    - Ajustar frontend ou criar coluna/view compatível.
    - Exemplo: adicionar `added_at`:
      ```sql
      ALTER TABLE public.app_admins ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now();
      ```

- Função/trigger falhando após RLS
  - Causa: função não tem privilégios para operar sob RLS.
  - Solução: marcar como `SECURITY DEFINER` (e garantir owner seguro):
    ```sql
    CREATE OR REPLACE FUNCTION public.sync_app_admins() ... SECURITY DEFINER;
    ```

- Recursão ao habilitar RLS em `profiles`
  - Causa: policy que lê `profiles` enquanto RLS está on.
  - Solução: policies devem usar `app_admins`/`is_user_admin` sem acessar `profiles`.

---

## Scripts e automação (opcional)
- Script de checagem (ex.: `db_checks.js`) para rodar em CI/GitHub Actions e alertar se RLS desligado ou se policies referenciam `profiles`.
- GitHub Actions: agendamento diário para executar o script e notificar se algo falhar.

---

## Comandos úteis de referência
- Habilitar RLS:
```sql
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
```
- Desabilitar RLS:
```sql
ALTER TABLE public.sales DISABLE ROW LEVEL SECURITY;
```
- Listar todas policies:
```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
```
- Adicionar admin:
```sql
INSERT INTO public.app_admins(user_id) VALUES ('<UUID>') ON CONFLICT DO NOTHING;
```
- Remover admin:
```sql
DELETE FROM public.app_admins WHERE user_id = '<UUID>';
```

---

## Contatos e responsabilidades
- Mantenha registro de quem pode:
  - rodar rollback;
  - adicionar/remover admins;
  - rotacionar `service_role`.
- Tenha pelo menos 1–2 pessoas que saibam o procedimento de emergência.


---

## Apêndice — SQL útil: reatribuir pagamentos (exemplo seguro)
```sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS admin_backup;
CREATE SCHEMA IF NOT EXISTS admin_actions;

CREATE TABLE IF NOT EXISTS admin_actions.payment_reassign_log (
  id serial PRIMARY KEY,
  payment_id uuid,
  old_creator uuid,
  new_creator uuid,
  performed_by uuid,
  note text,
  changed_at timestamptz DEFAULT now()
);

-- backup
CREATE TABLE admin_backup.payments_reassign_backup_20251127 AS
SELECT * FROM public.payments WHERE created_by = 'fad2a503-8efb-4f6b-b048-6070cc4e30e8';

-- update + audit
WITH moved AS (
  UPDATE public.payments
  SET created_by = '4baa80d4-8257-4780-959f-21eb243a9d23'
  WHERE created_by = 'fad2a503-8efb-4f6b-b048-6070cc4e30e8'
  RETURNING id
)
INSERT INTO admin_actions.payment_reassign_log(payment_id, old_creator, new_creator, performed_by, note)
SELECT id, 'fad2a503-8efb-4f6b-b048-6070cc4e30e8'::uuid, '4baa80d4-8257-4780-959f-21eb243a9d23'::uuid, NULL, 'mass reassign' FROM moved;

COMMIT;
```

---

End of SECURITY_PLAYBOOK
