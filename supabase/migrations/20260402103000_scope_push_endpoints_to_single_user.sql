WITH ranked_subscriptions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY endpoint
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_num
  FROM public.push_subscriptions
)
DELETE FROM public.push_subscriptions
WHERE id IN (
  SELECT id
  FROM ranked_subscriptions
  WHERE row_num > 1
);

ALTER TABLE public.push_subscriptions
DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

ALTER TABLE public.push_subscriptions
ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
