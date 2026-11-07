(ns finfolkdb.common.type-trip
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.trip_dives
(deftype.pg ^{:finfolk/constraints ["NOT NULL data" "NOT NULL day" "FOREIGN KEY (import_id) REFERENCES finfolk.trip_imports(id) ON DELETE CASCADE" "NOT NULL import_id" "NOT NULL ordinal" "PRIMARY KEY (import_id ordinal)"]}
  trip_dives
  [:import-id {:type :uuid :required true :primary "default"}
   :ordinal {:type :integer :required true :primary "default"}
   :day {:type :date :required true}
   :data {:type :jsonb :required true}])

;; Physical table: finfolk.trip_import_batches
(deftype.pg ^{:finfolk/constraints ["CHECK (((batch_index >= 0) AND (batch_index <= 9999)))" "NOT NULL batch_index" "FOREIGN KEY (import_id) REFERENCES finfolk.trip_imports(id) ON DELETE CASCADE" "NOT NULL import_id" "PRIMARY KEY (import_id batch_index)" "NOT NULL rows"]}
  trip_import_batches
  [:import-id {:type :uuid :required true :primary "default"}
   :batch-index {:type :integer :required true :primary "default"}
   :rows {:type :jsonb :required true}])

;; Physical table: finfolk.trip_imports
(deftype.pg ^{:finfolk/constraints ["NOT NULL created_at" "CHECK (((expected_rows >= 1) AND (expected_rows <= 10000)))" "NOT NULL expected_rows" "NOT NULL id" "PRIMARY KEY (id)" "CHECK ((state = ANY (ARRAY['uploading'::text 'complete'::text])))" "NOT NULL state" "FOREIGN KEY (trip_id) REFERENCES finfolk.trips(id) ON DELETE CASCADE" "NOT NULL trip_id"]}
  trip_imports
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :trip-id {:type :uuid :required true}
   :expected-rows {:type :integer :required true}
   :state {:type :text :required true :finfolk/default-sql "'uploading'::text"}
   :fingerprint {:type :text}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.trip_reviews
(deftype.pg ^{:finfolk/constraints ["NOT NULL actor" "NOT NULL created_at" "NOT NULL decision" "NOT NULL id" "PRIMARY KEY (id)" "FOREIGN KEY (trip_id) REFERENCES finfolk.trips(id) ON DELETE CASCADE" "NOT NULL trip_id"]}
  trip_reviews
  [:id {:type :bigint :required true :primary true}
   :trip-id {:type :uuid :required true}
   :actor {:type :text :required true}
   :decision {:type :text :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.trips
(deftype.pg ^{:finfolk/constraints ["FOREIGN KEY (active_import) REFERENCES finfolk.trip_imports(id) ON DELETE SET NULL" "NOT NULL created_at" "NOT NULL draft" "NOT NULL id" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL owner_id" "PRIMARY KEY (id)" "NOT NULL revision" "NOT NULL updated_at"]}
  trips
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :owner-id {:type :text :required true}
   :draft {:type :jsonb :required true}
   :revision {:type :integer :required true :finfolk/default-sql "1"}
   :active-import {:type :uuid}
   :published {:type :jsonb}
   :pending {:type :jsonb}
   :published-at {:type :timestamptz}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])
