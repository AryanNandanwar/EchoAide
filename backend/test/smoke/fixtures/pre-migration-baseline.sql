-- Baseline schema before incremental TypeORM migrations.
-- Mirrors a legacy patients table without weight and without refresh_tokens.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  gender text,
  age text,
  contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  doctor_id uuid
);
