-- Migration 003 — Rename pricing plans
-- Old plans: free | maker (25€) | pro (50€) | enterprise
-- New plans: free | pro   (25€) | pro_max (50€) | enterprise

BEGIN;

-- 1. Drop old CHECK constraint
ALTER TABLE credits DROP CONSTRAINT IF EXISTS credits_plan_check;

-- 2. Rename existing rows (order matters — rename pro → pro_max first to avoid collision)
UPDATE credits SET plan = 'pro_max' WHERE plan = 'pro';
UPDATE credits SET plan = 'pro'     WHERE plan = 'maker';

-- 3. Add new CHECK constraint
ALTER TABLE credits
  ADD CONSTRAINT credits_plan_check
  CHECK (plan IN ('free','pro','pro_max','enterprise'));

COMMIT;
