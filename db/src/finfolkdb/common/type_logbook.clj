(ns finfolkdb.common.type-logbook
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.sessions
(deftype.pg ^{:finfolk/constraints ["FOREIGN KEY (beach_id) REFERENCES finfolk.beaches(id)" "NOT NULL created_at" "NOT NULL data" "NOT NULL id" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL owner_id" "PRIMARY KEY (id)" "NOT NULL updated_at"]}
  sessions
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :owner-id {:type :text :required true}
   :beach-id {:type :text}
   :data {:type :jsonb :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])
