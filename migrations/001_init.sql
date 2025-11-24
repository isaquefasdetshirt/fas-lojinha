-- same migration, assuming already applied
-- Payment allocations and views
DROP VIEW IF EXISTS public.v_app_users;
CREATE OR REPLACE VIEW public.v_app_users AS
SELECT
  u.id,
  u.email,
  u.raw_user_meta_data ->> 'full_name' AS full_name,
  (u.raw_user_meta_data ->> 'is_approved')::boolean AS is_approved,
  u.raw_user_meta_data ->> 'role' AS role,
  u.created_at
FROM auth.users u;

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  sale_id BIGINT NULL,
  amount_allocated NUMERIC(12,2) NOT NULL CHECK (amount_allocated >= 0),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_sale ON public.payment_allocations(sale_id);

CREATE OR REPLACE VIEW public.v_sale_balances AS
SELECT
  s.sale_id,
  s.customer_id,
  s.date,
  s.total_amount,
  COALESCE(SUM(pa.amount_allocated) FILTER (WHERE pa.sale_id = s.sale_id), 0::NUMERIC) AS allocated_amount,
  (s.total_amount - COALESCE(SUM(pa.amount_allocated) FILTER (WHERE pa.sale_id = s.sale_id), 0::NUMERIC)) AS outstanding_amount
FROM public.sales s
LEFT JOIN public.payment_allocations pa ON pa.sale_id = s.sale_id
GROUP BY s.sale_id, s.customer_id, s.date, s.total_amount;

CREATE OR REPLACE VIEW public.v_customer_credit AS
SELECT
  p.customer_id,
  COALESCE(SUM(pa.amount_allocated),0::NUMERIC) AS credit_amount
FROM public.payment_allocations pa
JOIN public.payments p ON pa.payment_id = p.payment_id
WHERE pa.sale_id IS NULL
GROUP BY p.customer_id;
