#!/bin/bash
set -e

echo ">>> Initializing SynexTax PostgreSQL 17 Roles and Database Structure..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Create application password for local dev
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'synextax_app') THEN
      CREATE ROLE synextax_app LOGIN PASSWORD 'synextax_app_dev_password';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'synextax_auth') THEN
      CREATE ROLE synextax_auth LOGIN PASSWORD 'synextax_auth_dev_password';
    END IF;
  END
  \$\$;
EOSQL

echo ">>> Executing Migrations in order..."
for file in /docker-entrypoint-initdb.d/migrations/*.sql; do
  if [ -f "$file" ]; then
    echo "Running migration: $file"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
  fi
done

echo ">>> SynexTax Database Initialized Successfully."
