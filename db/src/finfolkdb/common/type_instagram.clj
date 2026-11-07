(ns finfolkdb.common.type-instagram
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.instagram_actions
(deftype.pg ^{:finfolk/constraints ["NOT NULL created_at" "NOT NULL data" "NOT NULL id" "CHECK ((kind = ANY (ARRAY['reply'::text 'stats'::text 'dive'::text 'points'::text])))" "NOT NULL kind" "NOT NULL member_confirmed" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "PRIMARY KEY (id)" "UNIQUE (source_id kind)" "NOT NULL source_id" "NOT NULL state" "NOT NULL updated_at"]}
  instagram_actions
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :source-id {:type :text :required true}
   :owner-id {:type :text}
   :sender-id {:type :text}
   :kind {:type :text :required true}
   :state {:type :text :required true :finfolk/default-sql "'review'::text"}
   :data {:type :jsonb :required true :finfolk/default-sql "'{}'::jsonb"}
   :member-confirmed {:type :boolean :required true :finfolk/default-sql "false"}
   :session-id {:type :uuid}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.instagram_audit
(deftype.pg ^{:finfolk/constraints ["FOREIGN KEY (action_id) REFERENCES finfolk.instagram_actions(id) ON DELETE CASCADE" "NOT NULL actor" "NOT NULL created_at" "NOT NULL event" "NOT NULL id" "PRIMARY KEY (id)"]}
  instagram_audit
  [:id {:type :bigint :required true :primary true}
   :action-id {:type :uuid}
   :actor {:type :text :required true}
   :event {:type :text :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.instagram_claims
(deftype.pg ^{:finfolk/constraints ["UNIQUE (claim_id)" "NOT NULL claim_id" "UNIQUE (code_hash)" "NOT NULL created_at" "NOT NULL error" "NOT NULL expires_at" "PRIMARY KEY (user_id)" "NOT NULL provider_scope" "CHECK ((state = ANY (ARRAY['waiting'::text 'checking'::text 'follow_required'::text 'failed'::text 'review_requested'::text 'claimed'::text 'cancelled'::text])))" "NOT NULL state" "NOT NULL updated_at" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id"]}
  instagram_claims
  [:user-id {:type :text :required true :primary true}
   :code-hash {:type :text}
   :state {:type :text :required true :finfolk/default-sql "'waiting'::text"}
   :sender-id {:type :text}
   :handle {:type :text}
   :error {:type :text :required true :finfolk/default-sql "''::text"}
   :expires-at {:type :timestamptz :required true}
   :follow-checked-at {:type :timestamptz}
   :review-requested-at {:type :timestamptz}
   :verified-by {:type :text}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :claim-id {:type :uuid :required true :finfolk/default-sql "gen_random_uuid()"}
   :provider-scope {:type :text :required true :finfolk/default-sql "'facebook-login:legacy'::text"}])

;; Physical table: finfolk.instagram_commands
(deftype.pg ^{:finfolk/constraints ["NOT NULL actor_id" "NOT NULL args" "FOREIGN KEY (beach_id) REFERENCES finfolk.beaches(id)" "NOT NULL command" "CHECK ((context = ANY (ARRAY['mention'::text 'owned'::text])))" "NOT NULL context" "NOT NULL id" "NOT NULL namespace" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "PRIMARY KEY (id)" "NOT NULL received_at" "CHECK ((send_state = ANY (ARRAY['pending'::text 'sending'::text 'sent'::text 'uncertain'::text 'skipped'::text])))" "NOT NULL send_state" "CHECK ((state = ANY (ARRAY['new'::text 'confirmation'::text 'done'::text 'cancelled'::text 'limited'::text])))" "NOT NULL state" "NOT NULL updated_at"]}
  instagram_commands
  [:id {:type :text :required true :primary true}
   :context {:type :text :required true}
   :actor-id {:type :text :required true}
   :namespace {:type :text :required true}
   :media-id {:type :text}
   :owner-id {:type :text}
   :command {:type :text :required true}
   :args {:type :jsonb :required true :finfolk/default-sql "'{}'::jsonb"}
   :source-url {:type :text}
   :comment-at {:type :timestamptz}
   :received-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :state {:type :text :required true :finfolk/default-sql "'new'::text"}
   :result {:type :text}
   :beach-id {:type :text}
   :visit-day {:type :date}
   :reply {:type :text}
   :send-state {:type :text :required true :finfolk/default-sql "'pending'::text"}
   :reply-id {:type :text}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :send-started-at {:type :timestamptz}])

;; Physical table: finfolk.instagram_comment_identities
(deftype.pg ^{:finfolk/constraints ["UNIQUE (challenge_hash)" "NOT NULL connection_scope" "NOT NULL handle" "UNIQUE (namespace actor_id)" "NOT NULL namespace" "PRIMARY KEY (user_id)" "NOT NULL sender_id" "NOT NULL updated_at" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id"]}
  instagram_comment_identities
  [:user-id {:type :text :required true :primary true}
   :namespace {:type :text :required true}
   :actor-id {:type :text}
   :sender-id {:type :text :required true}
   :handle {:type :text :required true}
   :challenge-hash {:type :text}
   :expires-at {:type :timestamptz}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :connection-scope {:type :text :required true :finfolk/default-sql "'facebook-login:legacy'::text"}
   :connection-version {:type :uuid}])

;; Physical table: finfolk.instagram_connect_codes
(deftype.pg ^{:finfolk/constraints ["UNIQUE (code_hash)" "NOT NULL code_hash" "FOREIGN KEY (consumed_by) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL created_at" "FOREIGN KEY (event_id) REFERENCES finfolk.instagram_dm_events(id) ON DELETE CASCADE" "UNIQUE (event_id)" "NOT NULL event_id" "NOT NULL expires_at" "NOT NULL generation" "NOT NULL handle" "NOT NULL id" "NOT NULL invalidated" "PRIMARY KEY (id)" "NOT NULL provider_scope" "NOT NULL sender_id"]}
  instagram_connect_codes
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :code-hash {:type :text :required true}
   :sender-id {:type :text :required true}
   :handle {:type :text :required true}
   :provider-scope {:type :text :required true}
   :generation {:type :integer :required true}
   :event-id {:type :text :required true}
   :expires-at {:type :timestamptz :required true :finfolk/default-sql "(now() + '00:10:00'::interval)"}
   :invalidated {:type :boolean :required true :finfolk/default-sql "false"}
   :consumed-by {:type :text}
   :consumed-version {:type :uuid}
   :consumed-at {:type :timestamptz}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.instagram_connect_limits
(deftype.pg ^{:finfolk/constraints ["NOT NULL bucket" "NOT NULL count" "PRIMARY KEY (bucket)" "NOT NULL resets_at"]}
  instagram_connect_limits
  [:bucket {:type :text :required true :primary true}
   :count {:type :integer :required true}
   :resets-at {:type :timestamptz :required true}])

;; Physical table: finfolk.instagram_connections
(deftype.pg ^{:finfolk/constraints ["NOT NULL handle" "NOT NULL identity_version" "PRIMARY KEY (user_id)" "NOT NULL provider_scope" "NOT NULL public_points" "NOT NULL share_posts" "NOT NULL status" "NOT NULL updated_at" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id"]}
  instagram_connections
  [:user-id {:type :text :required true :primary true}
   :handle {:type :text :required true}
   :sender-id {:type :text}
   :status {:type :text :required true :finfolk/default-sql "'pending'::text"}
   :challenge-hash {:type :text}
   :expires-at {:type :timestamptz}
   :public-points {:type :boolean :required true :finfolk/default-sql "false"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :share-posts {:type :boolean :required true :finfolk/default-sql "false"}
   :media-owner-id {:type :text}
   :provider-scope {:type :text :required true :finfolk/default-sql "'facebook-login:legacy'::text"}
   :identity-version {:type :uuid :required true :finfolk/default-sql "gen_random_uuid()"}])

;; Physical table: finfolk.instagram_discoveries
(deftype.pg ^{:finfolk/constraints ["NOT NULL automatic" "FOREIGN KEY (beach_id) REFERENCES finfolk.beaches(id)" "NOT NULL candidates" "NOT NULL caption" "NOT NULL created_at" "NOT NULL id" "CHECK (((media_id IS NULL) OR (media_id ~ '^[0-9]{1,40}$'::text)))" "UNIQUE (media_id)" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE SET NULL" "PRIMARY KEY (id)" "NOT NULL sources" "CHECK ((state = ANY (ARRAY['pending'::text 'published'::text 'hidden'::text 'rejected'::text 'unavailable'::text])))" "NOT NULL state" "NOT NULL updated_at" "UNIQUE (url)" "NOT NULL url"]}
  instagram_discoveries
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :media-id {:type :text}
   :url {:type :text :required true}
   :owner-id {:type :text}
   :author-id {:type :text}
   :author {:type :text}
   :beach-id {:type :text}
   :candidates {:type :jsonb :required true :finfolk/default-sql "'[]'::jsonb"}
   :caption {:type :text :required true :finfolk/default-sql "''::text"}
   :posted-at {:type :timestamptz}
   :state {:type :text :required true :finfolk/default-sql "'pending'::text"}
   :automatic {:type :boolean :required true :finfolk/default-sql "false"}
   :sources {:type :jsonb :required true :finfolk/default-sql "'[]'::jsonb"}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :checked-at {:type :timestamptz}])

;; Physical table: finfolk.instagram_discovery_audit
(deftype.pg ^{:finfolk/constraints ["NOT NULL actor" "NOT NULL created_at" "FOREIGN KEY (discovery_id) REFERENCES finfolk.instagram_discoveries(id) ON DELETE CASCADE" "NOT NULL event" "NOT NULL id" "PRIMARY KEY (id)"]}
  instagram_discovery_audit
  [:id {:type :bigint :required true :primary true}
   :discovery-id {:type :uuid}
   :actor {:type :text :required true}
   :event {:type :text :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.instagram_dm_events
(deftype.pg ^{:finfolk/constraints ["NOT NULL args" "NOT NULL attempts" "NOT NULL command" "NOT NULL correlation_id" "NOT NULL created_at" "NOT NULL error" "UNIQUE (event_id)" "NOT NULL event_id" "NOT NULL generation" "NOT NULL id" "NOT NULL message_at" "NOT NULL next_attempt_at" "FOREIGN KEY (owner_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "PRIMARY KEY (id)" "CHECK ((processing_state = ANY (ARRAY['received'::text 'queued'::text 'processing'::text 'completed'::text 'ignored'::text 'blocked'::text 'paused'::text 'failed'::text])))" "NOT NULL processing_state" "NOT NULL provider_scope" "NOT NULL recipient_id" "CHECK ((send_state = ANY (ARRAY['pending'::text 'sending'::text 'sent'::text 'uncertain'::text 'skipped'::text])))" "NOT NULL send_state" "NOT NULL sender_id" "CHECK ((status = ANY (ARRAY['queued'::text 'processing'::text 'done'::text 'error'::text])))" "NOT NULL status" "NOT NULL updated_at"]}
  instagram_dm_events
  [:id {:type :text :required true :primary true}
   :sender-id {:type :text :required true}
   :recipient-id {:type :text :required true}
   :command {:type :text :required true}
   :args {:type :text :required true :finfolk/default-sql "''::text"}
   :challenge-hash {:type :text}
   :message-at {:type :timestamptz :required true}
   :status {:type :text :required true :finfolk/default-sql "'queued'::text"}
   :attempts {:type :integer :required true :finfolk/default-sql "0"}
   :lease {:type :uuid}
   :reply {:type :text}
   :send-state {:type :text :required true :finfolk/default-sql "'pending'::text"}
   :error {:type :text :required true :finfolk/default-sql "''::text"}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :owner-id {:type :text}
   :event-id {:type :uuid :required true :finfolk/default-sql "gen_random_uuid()"}
   :provider-scope {:type :text :required true :finfolk/default-sql "'facebook-login:legacy'::text"}
   :correlation-id {:type :uuid :required true :finfolk/default-sql "gen_random_uuid()"}
   :processing-state {:type :text :required true :finfolk/default-sql "'ignored'::text"}
   :generation {:type :integer :required true :finfolk/default-sql "0"}
   :next-attempt-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :follow-checked-at {:type :timestamptz}
   :sender-handle {:type :text}
   :rate-limit-key {:type :text}])

;; Physical table: finfolk.instagram_dm_limits
(deftype.pg ^{:finfolk/constraints ["NOT NULL count" "NOT NULL minute" "PRIMARY KEY (sender_id)" "NOT NULL sender_id"]}
  instagram_dm_limits
  [:sender-id {:type :text :required true :primary true}
   :minute {:type :timestamptz :required true :finfolk/default-sql "date_trunc('minute'::text, now())"}
   :count {:type :integer :required true :finfolk/default-sql "0"}
   :prompted-at {:type :timestamptz}])

;; Physical table: finfolk.instagram_events
(deftype.pg ^{:finfolk/constraints ["NOT NULL attempts" "NOT NULL created_at" "NOT NULL id" "NOT NULL payload" "PRIMARY KEY (id)" "NOT NULL status" "NOT NULL updated_at"]}
  instagram_events
  [:id {:type :text :required true :primary true}
   :payload {:type :jsonb :required true}
   :status {:type :text :required true :finfolk/default-sql "'queued'::text"}
   :attempts {:type :integer :required true :finfolk/default-sql "0"}
   :error {:type :text}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.instagram_post_reports
(deftype.pg ^{:finfolk/constraints ["NOT NULL created_at" "NOT NULL day" "FOREIGN KEY (discovery_id) REFERENCES finfolk.instagram_discoveries(id) ON DELETE CASCADE" "NOT NULL discovery_id" "UNIQUE (discovery_id reason day)" "NOT NULL id" "PRIMARY KEY (id)" "CHECK ((reason = ANY (ARRAY['wrong_location'::text 'inappropriate'::text 'removed'::text 'other'::text])))" "NOT NULL reason"]}
  instagram_post_reports
  [:id {:type :bigint :required true :primary true}
   :discovery-id {:type :uuid :required true}
   :reason {:type :text :required true}
   :day {:type :date :required true :finfolk/default-sql "CURRENT_DATE"}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.instagram_sources
(deftype.pg ^{:finfolk/constraints ["NOT NULL data" "NOT NULL failures" "NOT NULL key" "CHECK ((kind = ANY (ARRAY['tags'::text 'hashtag'::text 'recheck'::text])))" "NOT NULL kind" "NOT NULL next_at" "PRIMARY KEY (key)" "NOT NULL status"]}
  instagram_sources
  [:key {:type :text :required true :primary true}
   :kind {:type :text :required true}
   :data {:type :jsonb :required true :finfolk/default-sql "'{}'::jsonb"}
   :checkpoint {:type :text}
   :last-success {:type :timestamptz}
   :next-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :lease-until {:type :timestamptz}
   :failures {:type :integer :required true :finfolk/default-sql "0"}
   :status {:type :text :required true :finfolk/default-sql "'ready'::text"}])

;; Physical table: finfolk.instagram_suppressed_sources
(deftype.pg ^{:finfolk/constraints ["NOT NULL author_id" "NOT NULL created_at" "PRIMARY KEY (author_id)"]}
  instagram_suppressed_sources
  [:author-id {:type :text :required true :primary true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])
