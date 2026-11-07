(ns finfolkdb.common.type-community
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.beaches
(deftype.pg ^{:finfolk/constraints ["NOT NULL area_name" "NOT NULL id" "NOT NULL name" "PRIMARY KEY (id)" "NOT NULL state" "NOT NULL timezone"]}
  beaches
  [:id {:type :text :required true :primary true}
   :name {:type :text :required true}
   :timezone {:type :text :required true}
   :area-name {:type :text :required true :finfolk/default-sql "''::text"}
   :state {:type :text :required true :finfolk/default-sql "''::text"}])

;; Physical table: finfolk.blocks
(deftype.pg ^{:finfolk/constraints ["CHECK ((owner_id <> target_id))" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL owner_id" "PRIMARY KEY (owner_id target_id)" "FOREIGN KEY (target_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL target_id"]}
  blocks
  [:owner-id {:type :text :required true :primary "default"}
   :target-id {:type :text :required true :primary "default"}])

;; Physical table: finfolk.checkins
(deftype.pg ^{:finfolk/constraints ["FOREIGN KEY (beach_id) REFERENCES finfolk.beaches(id)" "NOT NULL beach_id" "NOT NULL created_at" "PRIMARY KEY (user_id beach_id visit_day)" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id" "NOT NULL visit_day"]}
  checkins
  [:user-id {:type :text :required true :primary "default"}
   :beach-id {:type :text :required true :primary "default"}
   :visit-day {:type :date :required true :primary "default"}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.connections
(deftype.pg ^{:finfolk/constraints ["FOREIGN KEY (a) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL a" "FOREIGN KEY (b) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL b" "CHECK ((a < b))" "CHECK (((requested_by = a) OR (requested_by = b)))" "PRIMARY KEY (a b)" "NOT NULL requested_by" "CHECK ((status = ANY (ARRAY['pending'::text 'accepted'::text 'declined'::text 'removed'::text])))" "NOT NULL status" "NOT NULL updated_at"]}
  connections
  [:a {:type :text :required true :primary "default"}
   :b {:type :text :required true :primary "default"}
   :requested-by {:type :text :required true}
   :status {:type :text :required true}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.reports
(deftype.pg ^{:finfolk/constraints ["NOT NULL created_at" "NOT NULL id" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL owner_id" "PRIMARY KEY (id)" "NOT NULL reason" "NOT NULL target_id"]}
  reports
  [:id {:type :bigint :required true :primary true}
   :owner-id {:type :text :required true}
   :target-id {:type :text :required true}
   :reason {:type :text :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])
