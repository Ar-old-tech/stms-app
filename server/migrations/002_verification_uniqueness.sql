-- A keyed fingerprint permits Appendix A's CNIC uniqueness constraint while
-- keeping the actual identifier encrypted with randomized AES-GCM nonces.
ALTER TABLE driver_verifications ADD COLUMN cnic_fingerprint BYTEA;
CREATE UNIQUE INDEX driver_cnic_unique ON driver_verifications(cnic_fingerprint) WHERE cnic_fingerprint IS NOT NULL;
ALTER TABLE driver_verifications ADD CONSTRAINT driver_license_unique UNIQUE(license_number);
