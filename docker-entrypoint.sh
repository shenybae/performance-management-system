#!/bin/sh
set -e

echo "Entrypoint: checking for seed flag..."
if [ "${SEED:-}" = "true" ] || [ "${RUN_SEED:-}" = "true" ]; then
  echo "SEED flag present — running npm run seed"
  # Run seed script (assumes DB env vars are set)
  npm run seed
else
  echo "No seed requested. Skipping seeding."
fi

# Exec the CMD
exec "$@"
