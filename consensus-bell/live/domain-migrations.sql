CREATE TABLE IF NOT EXISTS echo_connections (
  id TEXT PRIMARY KEY,
  requester TEXT NOT NULL,
  recipient TEXT NOT NULL,
  pair_a TEXT NOT NULL,
  pair_b TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','blocked')),
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  CHECK(requester <> recipient),
  CHECK(pair_a < pair_b)
);
CREATE UNIQUE INDEX IF NOT EXISTS echo_active_pair
  ON echo_connections(pair_a,pair_b) WHERE status IN ('pending','accepted');
CREATE INDEX IF NOT EXISTS echo_requester ON echo_connections(requester,created_at);
CREATE INDEX IF NOT EXISTS echo_recipient ON echo_connections(recipient,created_at);
CREATE TABLE IF NOT EXISTS connection_blocks (
  owner TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner,target),
  CHECK(owner <> target)
);
CREATE TABLE IF NOT EXISTS consent_grants (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS consent_resource
  ON consent_grants(owner,scope,resource_id,expires_at);
CREATE TABLE IF NOT EXISTS agent_jobs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  skill TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  consent_id TEXT NOT NULL REFERENCES consent_grants(id),
  status TEXT NOT NULL CHECK(status='completed'),
  output TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_jobs_owner ON agent_jobs(owner,created_at);
