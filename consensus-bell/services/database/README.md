# PostgreSQL backend v2 schema

`migrations/001_backend_v2.sql` is a transactional PostgreSQL migration for the architecture v2 entities. It creates the isolated `bell` schema and records `001_backend_v2` in `bell.schema_migrations`. Apply once to an empty schema using a migration owner:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f services/database/migrations/001_backend_v2.sql
```

This migration is not connected to the current `live` SQLite runtime. Switching storage requires a PostgreSQL repository adapter and a separate validated data migration. Do not run this against existing production data without that deployment work. A repeated invocation fails at `CREATE SCHEMA`, rolls back, and leaves the first installation intact; use the migration ledger to skip applied versions rather than hiding drift with `IF NOT EXISTS`.

## Data boundaries

App identity, provider signer references and smart accounts are separate. No private signing key or plaintext memory key column exists. Address domains require canonical lowercase `0x` addresses; normalize and validate input before insertion. Chain hashes and ciphertext SHA-256 digests use canonical `0x` hex. Ethereum integers, including all Wei amounts, use a bounded `NUMERIC(78,0)` domain. Serialise these values as decimal strings at the API boundary.

Ring invitations, relationships, vows, goals, deposits and minted witnesses are chain mirrors. They require a source event. Composite foreign keys and triggers enforce account/relationship/event chain consistency and valid participants. Draft Ring/Vow preparation belongs in `user_operations` or encrypted Agent output, not in confirmed chain tables. An active Romantic Ring's exclusivity remains a Registry contract invariant, including when the same account appears on either side of a relation. Echo connections remain off-chain and allow multiple distinct pairs.

`chain_events` is unique on `(chain_id, tx_hash, log_index)` for idempotent receipt replay. Workers must validate configured emitter, decoded arguments and UserOperation receipt `success`, then atomically upsert the event and apply its mirrors. A reorg must mark orphan events noncanonical, roll back their projections, and rebuild from canonical events before advancing `indexer_checkpoints`. The schema alone does not validate RPC evidence or implement that worker. BOT public RPC historical logs cannot be assumed available; receipt tracking and a separately configured log-capable provider are required.

## Roles and row access

Provision roles outside this migration. Keep the schema owner credential restricted to migrations. The API login must be a non-owner with `NOSUPERUSER NOBYPASSRLS`; never grant it membership in the owner or worker role. RLS is enabled on all business tables. API transactions must set authenticated identity via parameterised `SELECT set_config('app.user_id', $1, true)` and reset naturally at transaction end. Missing, empty or invalid identity resolves to NULL and denies owner/member access. A database connection or SQL execution capability must never be given to a client; custom settings are a trusted server context, not cryptographic authentication.

Grant the API role schema USAGE, EXECUTE on `request_user_id`, `owns_account`, `is_relation_member`, and SELECT only on its required business tables. Grant INSERT/UPDATE/DELETE only on `profiles`, `radar_preferences`, `radar_sessions`, `encrypted_assets`, and `stories` as appropriate. Their write policies enforce ownership; stories require the author's encrypted asset and relationship membership. Do not grant direct API DML on chain mirrors, smart-account deployment status, sponsorship grants, auth identity bindings, Agent jobs, notifications or UserOperation outcome fields. Those tables intentionally have read policies only. Radar candidate discovery needs a scoped server service that applies both users' discoverability/intent/filters; granting broad profile SELECT is insufficient because owner RLS deliberately hides other profiles.

Use a separately authenticated indexer/worker connection and narrowly grant DML only on its assigned tables. Define worker-only RLS policies with `TO <actual_worker_role>` during environment provisioning. The worker is not an API role, and must validate verified receipts and consent before writes. Auth provisioning, wallet initialization, Echo requests/responses, consent grants and key-envelope sharing likewise need scoped trusted service policies or narrow checked functions; this migration grants no unrestricted public writes. No runtime role or superuser is created automatically.

Encrypted assets are readable by their owner or an unrevoked envelope recipient. Envelopes are readable only by their recipient. Story metadata is readable by its author or, for SHARED stories, relationship members; each recipient still needs their own encrypted key envelope to decrypt. Removing an envelope prevents future retrieval, but cannot retract already downloaded ciphertext or keys. The service must enforce sharing intent, participant eligibility and independent encryption-key recovery.

Agent jobs require a same-user consent reference. Workers must also check scope, resource, expiry and revocation at execution time, including immediately before each cloud-model disclosure. Relationship membership alone does not authorize AI memory access. Agent outputs are proposals; they confer no signing or asset-transfer privileges.

## Verification

The migration was executed with PGlite's embedded PostgreSQL engine: 26 tables and the version ledger were created. Fifteen checks passed, covering lowercase address enforcement, duplicate events, nonparticipant Vow rejection, negative Wei rejection, mismatched sponsor sender rejection, missing/invalid identity, both relationship members, outsider isolation, denied mirror updates/inserts, and repeated-migration rollback. This validates SQL execution and RLS behavior in embedded PostgreSQL; a separately provisioned PostgreSQL server and production role grants still need deployment verification.

Apply the SQL to a disposable PostgreSQL instance, verify all tables and the migration ledger, then exercise it under a non-owner API role. Check invalid addresses, duplicate event replay, cross-chain references, nonparticipant Vows/deposits, missing identity, owner/member visibility and denied API mirror writes. Check `pg_policies` and actual grants after provisioning. Successful schema execution does not establish mainnet deployment, provider availability, contract security or migration of the existing SQLite data.
