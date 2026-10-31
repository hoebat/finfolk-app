CREATE TABLE finfolk.trips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES finfolk.members(user_id) ON DELETE CASCADE,
 draft jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, active_import uuid,
 published jsonb, pending jsonb, published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trips_owner ON finfolk.trips(owner_id,updated_at DESC);
CREATE INDEX trips_public_beach ON finfolk.trips((published->>'beachId'),published_at DESC,id DESC) WHERE published IS NOT NULL;
CREATE TABLE finfolk.trip_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES finfolk.trips(id) ON DELETE CASCADE,
 expected_rows integer NOT NULL CHECK(expected_rows BETWEEN 1 AND 10000), state text NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','complete')),
 fingerprint text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE finfolk.trips ADD CONSTRAINT trip_active_import_fk FOREIGN KEY(active_import) REFERENCES finfolk.trip_imports(id) ON DELETE SET NULL;
CREATE INDEX trip_import_trip ON finfolk.trip_imports(trip_id);
CREATE TABLE finfolk.trip_import_batches (
 import_id uuid NOT NULL REFERENCES finfolk.trip_imports(id) ON DELETE CASCADE,
 batch_index integer NOT NULL CHECK(batch_index BETWEEN 0 AND 9999), rows jsonb NOT NULL,
 PRIMARY KEY(import_id,batch_index)
);
CREATE TABLE finfolk.trip_dives (
 import_id uuid NOT NULL REFERENCES finfolk.trip_imports(id) ON DELETE CASCADE,
 ordinal integer NOT NULL, day date NOT NULL, data jsonb NOT NULL, PRIMARY KEY(import_id,ordinal)
);
CREATE INDEX trip_dives_day ON finfolk.trip_dives(import_id,day);
CREATE TABLE finfolk.trip_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, trip_id uuid NOT NULL REFERENCES finfolk.trips(id) ON DELETE CASCADE,
 actor text NOT NULL, decision text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON finfolk.trips,finfolk.trip_imports,finfolk.trip_import_batches,finfolk.trip_dives,finfolk.trip_reviews FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='finfolk_api') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON finfolk.trips,finfolk.trip_imports,finfolk.trip_import_batches,finfolk.trip_dives,finfolk.trip_reviews TO finfolk_api;
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA finfolk TO finfolk_api;
END IF; END $$;
