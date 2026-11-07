(ns finfolkdb.common.type-member
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.members
(deftype.pg ^{:finfolk/constraints ["NOT NULL deleted" "NOT NULL invite_eligible" "NOT NULL joined_at" "PRIMARY KEY (user_id)" "NOT NULL profile" "NOT NULL updated_at" "NOT NULL user_id"]}
  members
  [:user-id {:type :text :required true :primary true}
   :profile {:type :jsonb :required true :finfolk/default-sql "'{}'::jsonb"}
   :deleted {:type :boolean :required true :finfolk/default-sql "false"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :invite-eligible {:type :boolean :required true :finfolk/default-sql "false"}
   :joined-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.request_limits
(deftype.pg ^{:finfolk/constraints ["NOT NULL count" "NOT NULL minute" "PRIMARY KEY (user_id)" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id"]}
  request_limits
  [:user-id {:type :text :required true :primary true}
   :minute {:type :timestamptz :required true}
   :count {:type :integer :required true}])
