-- Session-scoped professional-use acknowledgement: keep an append-only audit
-- trail of every login acknowledgement instead of one row per user + version.
DROP INDEX "ProfessionalUseAcknowledgement_userId_acknowledgementVersion_key";
