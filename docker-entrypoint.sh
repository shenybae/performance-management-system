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

echo "Entrypoint: checking for approval signer provisioning flag..."
if [ "${RUN_APPROVAL_SIGNERS:-}" = "true" ]; then
  echo "RUN_APPROVAL_SIGNERS=true — running npm run seed:approval-signers"
  # Idempotent script: creates or updates signer accounts per department.
  npm run seed:approval-signers
else
  echo "RUN_APPROVAL_SIGNERS is not true. Skipping signer provisioning."
fi

# Exec the CMD
exec "$@"
