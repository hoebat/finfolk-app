(ns finfolkdb.common.type-rewards
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.invitation_joins
(deftype.pg ^{:finfolk/constraints ["CHECK ((invitee_id <> inviter_id))" "NOT NULL created_at" "FOREIGN KEY (invitee_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL invitee_id" "FOREIGN KEY (inviter_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL inviter_id" "PRIMARY KEY (invitee_id)" "UNIQUE (verified_sender_id)"]}
  invitation_joins
  [:invitee-id {:type :text :required true :primary true}
   :inviter-id {:type :text :required true}
   :verified-sender-id {:type :text}
   :rewarded-at {:type :timestamptz}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.invitations
(deftype.pg ^{:finfolk/constraints ["NOT NULL code" "NOT NULL created_at" "FOREIGN KEY (inviter_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "UNIQUE (inviter_id)" "NOT NULL inviter_id" "PRIMARY KEY (code)"]}
  invitations
  [:code {:type :text :required true :primary true}
   :inviter-id {:type :text :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.points_ledger
(deftype.pg ^{:finfolk/constraints ["FOREIGN KEY (action_id) REFERENCES finfolk.instagram_actions(id)" "UNIQUE (action_id)" "NOT NULL action_id" "NOT NULL created_at" "NOT NULL day" "NOT NULL id" "PRIMARY KEY (id)" "CHECK ((points = 1))" "NOT NULL points" "NOT NULL reversed" "UNIQUE (user_id day)" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id"]}
  points_ledger
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :user-id {:type :text :required true}
   :action-id {:type :uuid :required true}
   :day {:type :date :required true}
   :points {:type :integer :required true :finfolk/default-sql "1"}
   :reversed {:type :boolean :required true :finfolk/default-sql "false"}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])
