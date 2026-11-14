#!/bin/bash
# Chạy tự động lần đầu khởi tạo database (sau các file .sql 00..17).
# Nạp dữ liệu demo nếu SEED_DEMO=true trong file .env.
set -e
if [ "${SEED_DEMO:-true}" = "true" ]; then
  echo ">>> Nạp dữ liệu demo (SEED_DEMO=true)..."
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /seed/99_demo_seed.sql
else
  echo ">>> Bỏ qua dữ liệu demo (SEED_DEMO=false)."
fi
