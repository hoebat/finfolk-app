(ns finfolkdb.common.type-content
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.community_referrals
(deftype.pg ^{:finfolk/constraints ["NOT NULL clicks" "NOT NULL day" "PRIMARY KEY (day platform)" "CHECK ((platform = ANY (ARRAY['instagram'::text 'tiktok'::text])))" "NOT NULL platform"]}
  community_referrals
  [:day {:type :date :required true :primary "default" :finfolk/default-sql "((now() AT TIME ZONE 'Australia/Sydney'::text))::date"}
   :platform {:type :text :required true :primary "default"}
   :clicks {:type :bigint :required true :finfolk/default-sql "0"}])

;; Physical table: finfolk.post_reports
(deftype.pg ^{:finfolk/constraints ["NOT NULL created_at" "NOT NULL id" "PRIMARY KEY (id)" "FOREIGN KEY (post_id) REFERENCES finfolk.posts(id) ON DELETE CASCADE" "NOT NULL post_id" "UNIQUE (post_id reporter_id)" "CHECK (((length(reason) >= 1) AND (length(reason) <= 1000)))" "NOT NULL reason" "FOREIGN KEY (reporter_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL reporter_id" "CHECK ((status = ANY (ARRAY['open'::text 'resolved'::text])))" "NOT NULL status"]}
  post_reports
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :post-id {:type :uuid :required true}
   :reporter-id {:type :text :required true}
   :reason {:type :text :required true}
   :status {:type :text :required true :finfolk/default-sql "'open'::text"}
   :resolved-by {:type :text}
   :resolved-at {:type :timestamptz}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.post_reviews
(deftype.pg ^{:finfolk/constraints ["NOT NULL actor" "NOT NULL created_at" "NOT NULL decision" "NOT NULL id" "PRIMARY KEY (id)" "FOREIGN KEY (post_id) REFERENCES finfolk.posts(id) ON DELETE CASCADE" "NOT NULL post_id" "NOT NULL reason"]}
  post_reviews
  [:id {:type :bigint :required true :primary true}
   :post-id {:type :uuid :required true}
   :actor {:type :text :required true}
   :decision {:type :text :required true}
   :reason {:type :text :required true :finfolk/default-sql "''::text"}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.posts
(deftype.pg ^{:finfolk/constraints ["FOREIGN KEY (beach_id) REFERENCES finfolk.beaches(id)" "NOT NULL beach_id" "NOT NULL created_at" "NOT NULL creator_handle" "NOT NULL id" "UNIQUE (owner_id beach_id url)" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL owner_id" "PRIMARY KEY (id)" "NOT NULL platform" "NOT NULL public_consent" "NOT NULL rejection_reason" "CHECK ((status = ANY (ARRAY['pending'::text 'approved'::text 'rejected'::text 'removed'::text])))" "NOT NULL status" "NOT NULL updated_at" "NOT NULL url"]}
  posts
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :owner-id {:type :text :required true}
   :beach-id {:type :text :required true}
   :url {:type :text :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :status {:type :text :required true :finfolk/default-sql "'pending'::text"}
   :public-consent {:type :boolean :required true :finfolk/default-sql "false"}
   :creator-handle {:type :text :required true :finfolk/default-sql "''::text"}
   :platform {:type :text :required true :finfolk/default-sql "''::text"}
   :rejection-reason {:type :text :required true :finfolk/default-sql "''::text"}
   :reviewed-by {:type :text}
   :reviewed-at {:type :timestamptz}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])
