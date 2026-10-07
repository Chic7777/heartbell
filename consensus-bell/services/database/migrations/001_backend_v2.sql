BEGIN;
CREATE SCHEMA bell;
REVOKE ALL ON SCHEMA bell FROM PUBLIC;
SET LOCAL search_path = bell, pg_catalog;

CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE DOMAIN eth_address AS varchar(42) CHECK (VALUE ~ '^0x[0-9a-f]{40}$');
CREATE DOMAIN eth_hash AS varchar(66) CHECK (VALUE ~ '^0x[0-9a-f]{64}$');
CREATE DOMAIN uint256 AS numeric(78,0) CHECK (VALUE >= 0 AND VALUE <= 115792089237316195423570985008687907853269984665640564039457584007913129639935);

CREATE FUNCTION request_user_id() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE identity text := current_setting('app.user_id', true);
BEGIN
  IF identity IS NULL OR identity = '' THEN RETURN NULL; END IF;
  RETURN identity::uuid;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  provider varchar(32) NOT NULL CHECK (provider IN ('EMAIL','PASSKEY')),
  subject varchar(512) NOT NULL CHECK (length(subject) > 0),
  credential_public_key bytea,
  sign_count bigint NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, subject)
);
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  token_hash eth_hash NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE RESTRICT,
  nickname varchar(80) NOT NULL CHECK (length(nickname) > 0),
  avatar_ref varchar(1024),
  interests jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(interests) = 'array'),
  preferences jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(preferences) = 'object'),
  discoverable boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wallet_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  provider varchar(64) NOT NULL,
  provider_key_ref varchar(512) NOT NULL CHECK (length(provider_key_ref) > 0),
  owner_address eth_address NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','ROTATED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, user_id), UNIQUE(provider, provider_key_ref)
);
CREATE TABLE smart_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  signer_id uuid NOT NULL,
  chain_id bigint NOT NULL DEFAULT 677 CHECK (chain_id > 0),
  account_address eth_address NOT NULL,
  factory_address eth_address NOT NULL,
  salt uint256 NOT NULL DEFAULT 0,
  deployment_status text NOT NULL DEFAULT 'COUNTERFACTUAL' CHECK (deployment_status IN ('COUNTERFACTUAL','DEPLOYED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(signer_id, user_id) REFERENCES wallet_signers(id, user_id) ON DELETE RESTRICT,
  UNIQUE(user_id, chain_id), UNIQUE(chain_id, account_address), UNIQUE(id, chain_id), UNIQUE(id,chain_id,account_address)
);
CREATE TABLE radar_preferences (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE RESTRICT,
  radius integer NOT NULL DEFAULT 50 CHECK (radius BETWEEN 1 AND 20000),
  intent varchar(32) NOT NULL CHECK (intent IN ('FRIENDSHIP','ROMANTIC','BOTH')),
  filters jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(filters) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE radar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  query jsonb NOT NULL CHECK (jsonb_typeof(query) = 'object'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (expires_at > created_at)
);
CREATE TABLE echo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  recipient_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','BLOCKED')),
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(requester_id <> recipient_id)
);
CREATE UNIQUE INDEX echo_pair ON echo_connections(least(requester_id,recipient_id), greatest(requester_id,recipient_id));
CREATE TABLE chain_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  contract_address eth_address NOT NULL,
  tx_hash eth_hash NOT NULL, log_index integer NOT NULL CHECK (log_index >= 0),
  block_number bigint NOT NULL CHECK (block_number >= 0), block_hash eth_hash NOT NULL,
  event_name varchar(128) NOT NULL CHECK (length(event_name) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  canonical boolean NOT NULL DEFAULT true,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id,tx_hash,log_index), UNIQUE(id,chain_id)
);
CREATE TABLE ring_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chain_id bigint NOT NULL DEFAULT 677 CHECK (chain_id > 0),
  onchain_invite_id uint256 NOT NULL,
  from_account uuid NOT NULL, to_account uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED')),
  source_event_id bigint NOT NULL,
  expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(from_account,chain_id) REFERENCES smart_accounts(id,chain_id) ON DELETE RESTRICT,
  FOREIGN KEY(to_account,chain_id) REFERENCES smart_accounts(id,chain_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_event_id,chain_id) REFERENCES chain_events(id,chain_id) ON DELETE RESTRICT,
  CHECK(from_account <> to_account), UNIQUE(chain_id,onchain_invite_id)
);
CREATE TABLE relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chain_id bigint NOT NULL DEFAULT 677 CHECK (chain_id > 0),
  onchain_relation_id uint256 NOT NULL, participant_a uuid NOT NULL, participant_b uuid NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN ('ROMANTIC','FRIENDSHIP')),
  status text NOT NULL CHECK (status IN ('ACTIVE','ENDED')),
  started_at timestamptz NOT NULL, ended_at timestamptz,
  source_event_id bigint NOT NULL,
  FOREIGN KEY(participant_a,chain_id) REFERENCES smart_accounts(id,chain_id) ON DELETE RESTRICT,
  FOREIGN KEY(participant_b,chain_id) REFERENCES smart_accounts(id,chain_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_event_id,chain_id) REFERENCES chain_events(id,chain_id) ON DELETE RESTRICT,
  CHECK(participant_a <> participant_b), CHECK(ended_at IS NULL OR ended_at >= started_at),
  UNIQUE(chain_id,onchain_relation_id), UNIQUE(id,chain_id)
);
CREATE FUNCTION owns_account(account uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM bell.smart_accounts WHERE id = account AND user_id = bell.request_user_id())
$$;
CREATE FUNCTION is_relation_member(relation uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM bell.relationships WHERE id = relation AND
    (bell.owns_account(participant_a) OR bell.owns_account(participant_b)))
$$;
CREATE TABLE encrypted_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  object_key varchar(1024) NOT NULL UNIQUE CHECK (length(object_key) > 0),
  ciphertext_sha256 eth_hash NOT NULL,
  encryption_version integer NOT NULL DEFAULT 1 CHECK (encryption_version > 0),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vault_key_envelopes (
  asset_id uuid NOT NULL REFERENCES encrypted_assets ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  wrapped_key bytea NOT NULL CHECK (octet_length(wrapped_key) BETWEEN 16 AND 16384),
  wrapping_algorithm varchar(64) NOT NULL,
  key_version integer NOT NULL CHECK (key_version > 0), revoked_at timestamptz,
  PRIMARY KEY(asset_id,recipient_user_id,key_version)
);
CREATE TABLE stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), relationship_id uuid REFERENCES relationships ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  encrypted_asset_id uuid NOT NULL REFERENCES encrypted_assets ON DELETE RESTRICT,
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','SHARED')),
  onchain_commitment eth_hash, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (visibility <> 'SHARED' OR relationship_id IS NOT NULL)
);
CREATE TABLE vows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), relationship_id uuid NOT NULL REFERENCES relationships ON DELETE RESTRICT,
  chain_vow_index uint256 NOT NULL,
  proposer_account uuid NOT NULL REFERENCES smart_accounts ON DELETE RESTRICT,
  confirmer_account uuid REFERENCES smart_accounts ON DELETE RESTRICT,
  encrypted_asset_id uuid REFERENCES encrypted_assets ON DELETE RESTRICT,
  content_commitment eth_hash NOT NULL,
  status text NOT NULL CHECK(status IN ('PROPOSED','CONFIRMED','REJECTED','CANCELLED')),
  proposed_at timestamptz NOT NULL, confirmed_at timestamptz,
  source_event_id bigint NOT NULL REFERENCES chain_events ON DELETE RESTRICT,
  UNIQUE(relationship_id,chain_vow_index),
  CHECK(confirmer_account IS NULL OR confirmer_account <> proposer_account),
  CHECK(status <> 'CONFIRMED' OR (confirmer_account IS NOT NULL AND confirmed_at IS NOT NULL))
);
CREATE TABLE bond_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), relationship_id uuid NOT NULL REFERENCES relationships ON DELETE RESTRICT,
  onchain_goal_id uint256 NOT NULL, target_wei uint256 NOT NULL CHECK(target_wei > 0),
  status text NOT NULL CHECK(status IN ('ACTIVE','COMPLETED','CLOSED')),
  source_event_id bigint NOT NULL REFERENCES chain_events ON DELETE RESTRICT,
  UNIQUE(relationship_id,onchain_goal_id)
);
CREATE TABLE bond_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), goal_id uuid NOT NULL REFERENCES bond_goals ON DELETE RESTRICT,
  contributor_account uuid NOT NULL REFERENCES smart_accounts ON DELETE RESTRICT,
  amount_wei uint256 NOT NULL CHECK(amount_wei > 0), tx_hash eth_hash NOT NULL,
  source_event_id bigint NOT NULL UNIQUE REFERENCES chain_events ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE witness_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), relationship_id uuid NOT NULL,
  chain_id bigint NOT NULL DEFAULT 677 CHECK(chain_id > 0),
  contract_address eth_address NOT NULL, token_id uint256 NOT NULL, design_hash eth_hash NOT NULL,
  mint_status text NOT NULL CHECK(mint_status IN ('MINTED','BURNED')),
  source_event_id bigint NOT NULL,
  FOREIGN KEY(relationship_id,chain_id) REFERENCES relationships(id,chain_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_event_id,chain_id) REFERENCES chain_events(id,chain_id) ON DELETE RESTRICT,
  UNIQUE(chain_id,contract_address,token_id)
);
CREATE TABLE user_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, chain_id bigint NOT NULL CHECK(chain_id > 0),
  action varchar(64) NOT NULL CHECK(action IN ('DEPLOY_ACCOUNT','INVITE_RING','ACCEPT_RING','END_RING','PROPOSE_VOW','CONFIRM_VOW','DEPOSIT_BOND','WITHDRAW_BOND','MINT_WITNESS')),
  userop_hash eth_hash, tx_hash eth_hash,
  status text NOT NULL DEFAULT 'PREPARING' CHECK(status IN ('PREPARING','AWAITING_SIGNATURE','SUBMITTED','INCLUDED','CONFIRMED','FAILED')),
  success boolean, receipt jsonb, failure_code varchar(128),
  nonce uint256, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(account_id,chain_id) REFERENCES smart_accounts(id,chain_id) ON DELETE RESTRICT,
  UNIQUE(chain_id,userop_hash),
  CHECK(status NOT IN ('SUBMITTED','INCLUDED','CONFIRMED') OR userop_hash IS NOT NULL),
  CHECK(status NOT IN ('INCLUDED','CONFIRMED') OR (tx_hash IS NOT NULL AND success IS NOT NULL)),
  CHECK(status <> 'CONFIRMED' OR success IS TRUE)
);
CREATE TABLE indexer_checkpoints (
  chain_id bigint NOT NULL CHECK(chain_id > 0), stream varchar(128) NOT NULL,
  last_block bigint NOT NULL CHECK(last_block >= 0), last_block_hash eth_hash NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(chain_id,stream)
);
CREATE TABLE sponsorship_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, chain_id bigint NOT NULL CHECK(chain_id > 0),
  sender eth_address NOT NULL, target_contract eth_address NOT NULL,
  function_selector varchar(10) NOT NULL CHECK(function_selector ~ '^0x[0-9a-f]{8}$'),
  calldata_hash eth_hash NOT NULL, action varchar(64) NOT NULL,
  max_gas_cost uint256 NOT NULL, nonce uint256 NOT NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(account_id,chain_id) REFERENCES smart_accounts(id,chain_id) ON DELETE RESTRICT,
  FOREIGN KEY(account_id,chain_id,sender) REFERENCES smart_accounts(id,chain_id,account_address) ON DELETE RESTRICT,
  UNIQUE(chain_id,sender,nonce), CHECK(expires_at > created_at)
);
CREATE TABLE consent_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  scope varchar(64) NOT NULL CHECK(scope IN ('RADAR_PROFILE','MEMORY_READ','CLOUD_MODEL','VOW_DRAFT','WITNESS_DESIGN')),
  resource_id uuid REFERENCES encrypted_assets ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at > created_at), UNIQUE(id,user_id)
);
CREATE TABLE agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  consent_id uuid NOT NULL, skill varchar(32) NOT NULL CHECK(skill IN ('RESONANCE','MEMORY','VOW','WITNESS','BOND')),
  input_ref varchar(1024) NOT NULL, output_ref varchar(1024),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(consent_id,user_id) REFERENCES consent_grants(id,user_id) ON DELETE RESTRICT
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE RESTRICT,
  type varchar(64) NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload) = 'object'),
  dedupe_key varchar(256) NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,dedupe_key)
);

CREATE INDEX relationship_a ON relationships(participant_a,status);
CREATE INDEX relationship_b ON relationships(participant_b,status);
CREATE INDEX signer_user ON wallet_signers(user_id);
CREATE INDEX identity_user ON auth_identities(user_id);
CREATE INDEX auth_session_user ON auth_sessions(user_id,expires_at);
CREATE INDEX radar_user ON radar_sessions(user_id,created_at DESC);
CREATE INDEX echo_recipient ON echo_connections(recipient_id,status);
CREATE INDEX invite_recipient ON ring_invitations(to_account,status);
CREATE INDEX events_block ON chain_events(chain_id,block_number);
CREATE INDEX story_relation ON stories(relationship_id,created_at DESC);
CREATE INDEX envelope_recipient ON vault_key_envelopes(recipient_user_id,asset_id);
CREATE INDEX userop_account_status ON user_operations(account_id,status);
CREATE INDEX consent_user ON consent_grants(user_id,expires_at);
CREATE INDEX agent_queue ON agent_jobs(status,created_at);
CREATE INDEX notification_unread ON notifications(user_id,created_at DESC) WHERE read_at IS NULL;

CREATE FUNCTION validate_participants() RETURNS trigger LANGUAGE plpgsql SET search_path = bell, pg_catalog AS $$
DECLARE relation relationships; event_chain bigint;
BEGIN
  SELECT * INTO STRICT relation FROM relationships WHERE id = NEW.relationship_id;
  IF TG_TABLE_NAME = 'vows' THEN
    IF NEW.proposer_account NOT IN (relation.participant_a,relation.participant_b) OR
      (NEW.confirmer_account IS NOT NULL AND NEW.confirmer_account NOT IN (relation.participant_a,relation.participant_b)) THEN
      RAISE EXCEPTION 'vow accounts must be relationship participants';
    END IF;
  ELSIF TG_TABLE_NAME = 'stories' THEN
    IF NOT EXISTS(SELECT 1 FROM smart_accounts WHERE id IN (relation.participant_a,relation.participant_b) AND user_id = NEW.author_id) THEN
      RAISE EXCEPTION 'story author must be a relationship participant';
    END IF;
    RETURN NEW;
  END IF;
  SELECT chain_id INTO STRICT event_chain FROM chain_events WHERE id = NEW.source_event_id;
  IF event_chain <> relation.chain_id THEN RAISE EXCEPTION 'source event chain does not match relationship'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vows_participants BEFORE INSERT OR UPDATE ON vows FOR EACH ROW EXECUTE FUNCTION validate_participants();
CREATE TRIGGER goals_chain BEFORE INSERT OR UPDATE ON bond_goals FOR EACH ROW EXECUTE FUNCTION validate_participants();
CREATE TRIGGER witness_chain BEFORE INSERT OR UPDATE ON witness_assets FOR EACH ROW EXECUTE FUNCTION validate_participants();
CREATE TRIGGER stories_participants BEFORE INSERT OR UPDATE ON stories FOR EACH ROW WHEN (NEW.relationship_id IS NOT NULL) EXECUTE FUNCTION validate_participants();
CREATE FUNCTION validate_deposit() RETURNS trigger LANGUAGE plpgsql SET search_path = bell, pg_catalog AS $$
DECLARE relation relationships; event chain_events;
BEGIN
  SELECT r.* INTO STRICT relation FROM relationships r JOIN bond_goals g ON g.relationship_id = r.id WHERE g.id = NEW.goal_id;
  SELECT * INTO STRICT event FROM chain_events WHERE id = NEW.source_event_id;
  IF NEW.contributor_account NOT IN (relation.participant_a,relation.participant_b) OR event.chain_id <> relation.chain_id OR event.tx_hash <> NEW.tx_hash THEN
    RAISE EXCEPTION 'deposit must match participant, chain and event transaction';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deposit_participants BEFORE INSERT OR UPDATE ON bond_deposits FOR EACH ROW EXECUTE FUNCTION validate_deposit();

DO $$ DECLARE table_name text; BEGIN
  FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'bell' AND tablename <> 'schema_migrations' LOOP
    EXECUTE format('ALTER TABLE bell.%I ENABLE ROW LEVEL SECURITY',table_name);
  END LOOP;
END $$;
CREATE POLICY users_owner ON users FOR SELECT USING(id = request_user_id());
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['auth_identities','auth_sessions','profiles','wallet_signers','smart_accounts','radar_preferences','radar_sessions','consent_grants','agent_jobs','notifications'] LOOP
    EXECUTE format('CREATE POLICY owner_read ON bell.%I FOR SELECT USING(user_id = bell.request_user_id())',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['profiles','radar_preferences','radar_sessions'] LOOP
    EXECUTE format('CREATE POLICY owner_write ON bell.%I FOR ALL USING(user_id = bell.request_user_id()) WITH CHECK(user_id = bell.request_user_id())',table_name);
  END LOOP;
END $$;
CREATE POLICY echo_member_read ON echo_connections FOR SELECT USING(request_user_id() IN (requester_id,recipient_id));
CREATE POLICY invite_member_read ON ring_invitations FOR SELECT USING(owns_account(from_account) OR owns_account(to_account));
CREATE POLICY relation_member_read ON relationships FOR SELECT USING(owns_account(participant_a) OR owns_account(participant_b));
CREATE POLICY asset_read ON encrypted_assets FOR SELECT USING(owner_user_id = request_user_id() OR EXISTS(SELECT 1 FROM vault_key_envelopes e WHERE e.asset_id = encrypted_assets.id AND e.recipient_user_id = request_user_id() AND e.revoked_at IS NULL));
CREATE POLICY asset_owner_write ON encrypted_assets FOR ALL USING(owner_user_id = request_user_id()) WITH CHECK(owner_user_id = request_user_id());
CREATE POLICY envelope_read ON vault_key_envelopes FOR SELECT USING(recipient_user_id = request_user_id() AND revoked_at IS NULL);
CREATE POLICY story_read ON stories FOR SELECT USING(author_id = request_user_id() OR (visibility = 'SHARED' AND is_relation_member(relationship_id)));
CREATE POLICY story_owner_write ON stories FOR ALL USING(author_id = request_user_id()) WITH CHECK(author_id = request_user_id() AND EXISTS(SELECT 1 FROM encrypted_assets a WHERE a.id = encrypted_asset_id AND a.owner_user_id = request_user_id()));
CREATE POLICY vow_member_read ON vows FOR SELECT USING(is_relation_member(relationship_id));
CREATE POLICY goal_member_read ON bond_goals FOR SELECT USING(is_relation_member(relationship_id));
CREATE POLICY deposit_member_read ON bond_deposits FOR SELECT USING(EXISTS(SELECT 1 FROM bond_goals g WHERE g.id = goal_id AND is_relation_member(g.relationship_id)));
CREATE POLICY witness_member_read ON witness_assets FOR SELECT USING(is_relation_member(relationship_id));
CREATE POLICY userop_owner_read ON user_operations FOR SELECT USING(owns_account(account_id));
CREATE POLICY sponsor_owner_read ON sponsorship_grants FOR SELECT USING(owns_account(account_id));
REVOKE ALL ON ALL TABLES IN SCHEMA bell FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA bell FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bell FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES ('001_backend_v2');
COMMIT;
