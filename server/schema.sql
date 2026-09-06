CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','analyst','viewer')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS producers (
 id text PRIMARY KEY, name text NOT NULL, document text UNIQUE, phone text NOT NULL DEFAULT '',
 municipality text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', created_by text REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS properties (
 id text PRIMARY KEY, producer_id text NOT NULL REFERENCES producers(id), name text NOT NULL,
 municipality text NOT NULL, area_ha numeric NOT NULL CHECK(area_ha > 0), tenure text NOT NULL,
 car text NOT NULL DEFAULT '', registry text NOT NULL DEFAULT '', latitude numeric, longitude numeric,
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS requests (
 id text PRIMARY KEY, producer_id text NOT NULL REFERENCES producers(id), title text NOT NULL,
 property_ids jsonb NOT NULL DEFAULT '[]', data jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'rascunho',
 revision integer NOT NULL DEFAULT 1, created_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
 id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), name text NOT NULL,
 mime text NOT NULL, sha256 text NOT NULL, content bytea NOT NULL,
 status text NOT NULL DEFAULT 'pending', extracted_text text NOT NULL DEFAULT '',
 suggestions jsonb NOT NULL DEFAULT '[]', reviewed_fields jsonb NOT NULL DEFAULT '{}',
 review_note text, reviewed_by text REFERENCES users(id), reviewed_at timestamptz,
 error text, attempts integer NOT NULL DEFAULT 0, lease_at timestamptz,
 created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,sha256)
);
CREATE TABLE IF NOT EXISTS analyses (
 id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), source_revision integer NOT NULL,
 result jsonb NOT NULL, snapshot jsonb NOT NULL, created_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS decisions (
 id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), analysis_id text NOT NULL REFERENCES analyses(id),
 decision text NOT NULL, justification text NOT NULL, created_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit (
 id bigserial PRIMARY KEY, actor text REFERENCES users(id), action text NOT NULL, entity_type text NOT NULL,
 entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_queue ON documents(status,created_at);
CREATE INDEX IF NOT EXISTS requests_producer ON requests(producer_id);
CREATE INDEX IF NOT EXISTS analyses_request ON analyses(request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity_type,entity_id);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS map_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS property_map_versions (
 property_id text NOT NULL REFERENCES properties(id), revision integer NOT NULL CHECK(revision > 0),
 features jsonb NOT NULL, summary jsonb NOT NULL, property_snapshot jsonb NOT NULL,
 created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(property_id,revision)
);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
