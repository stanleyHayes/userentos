# Acceptance scripts

`spec-acceptance.sh` drives the Marketplace/Storefront/Moderation/Payments
specification's §18 acceptance matrix against a running API and a real
database — the parts that unit tests with mocked models cannot prove.

```bash
# 1. A Mongo instance (any host/port)
# 2. Boot the API against a throwaway database:
MONGO_URI=mongodb://127.0.0.1:27017/rentos_spec_e2e JWT_SECRET=spec-e2e \
  NODE_ENV=development SEED_DEMO=false PORT=3099 PAYMENTS_PROVIDER_MODE=simulated \
  npx tsx src/index.ts

# 3. Run the matrix
bash scripts/spec-acceptance.sh
```

It registers its own users, promotes one to super_admin directly in the
database (registration cannot self-assign that role, by design), and asserts
25 checks covering moderation, entitlements, tenant isolation, custom domains,
coupons, affiliate gating, sponsorship-vs-moderation and webhook signatures.

The `MONGO` variable at the top assumes a `uf-test-mongo` docker container;
change it to match your local setup.
