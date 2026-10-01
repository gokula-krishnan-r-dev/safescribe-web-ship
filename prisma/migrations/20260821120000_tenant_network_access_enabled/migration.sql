-- Per-pharmacy network restriction toggle. Existing pharmacies stay restricted
-- when they already have allowed IPs (default true).
ALTER TABLE "Tenant" ADD COLUMN "networkAccessEnabled" BOOLEAN NOT NULL DEFAULT true;
