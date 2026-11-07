(ns finfolkdb.common.type-messaging
  (:require [lang.core :as l]))

(l/script :postgres
 {:require [[postgres.core :as pg]]
  :static {:application ["finfolk"] :all {:schema ["finfolk"]}}})

;; Physical table: finfolk.messaging_accounts
(deftype.pg ^{:finfolk/constraints ["NOT NULL checks" "NOT NULL enabled_commands" "NOT NULL generation" "CHECK ((id = 'instagram'::text))" "NOT NULL id" "CHECK ((mode = ANY (ARRAY['disabled'::text 'pilot'::text 'live'::text])))" "NOT NULL mode" "NOT NULL pilot_sender_ids" "PRIMARY KEY (id)" "NOT NULL updated_at"]}
  messaging_accounts
  [:id {:type :text :required true :primary true}
   :account-id {:type :text}
   :username {:type :text}
   :credential-ciphertext {:type :text}
   :token-expires-at {:type :timestamptz}
   :mode {:type :text :required true :finfolk/default-sql "'disabled'::text"}
   :enabled-commands {:type :jsonb :required true :finfolk/default-sql "'[\"ping\", \"help\"]'::jsonb"}
   :pilot-sender-ids {:type :jsonb :required true :finfolk/default-sql "'[]'::jsonb"}
   :generation {:type :integer :required true :finfolk/default-sql "1"}
   :checks {:type :jsonb :required true :finfolk/default-sql "'{}'::jsonb"}
   :last-webhook-at {:type :timestamptz}
   :last-command-at {:type :timestamptz}
   :last-reply-at {:type :timestamptz}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :backoff-until {:type :timestamptz}
   :provider-scope {:type :text}])

;; Physical table: finfolk.messaging_audit
(deftype.pg ^{:finfolk/constraints ["NOT NULL actor" "NOT NULL correlation_id" "NOT NULL created_at" "NOT NULL event" "NOT NULL id" "PRIMARY KEY (id)"]}
  messaging_audit
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :actor {:type :text :required true}
   :event {:type :text :required true}
   :correlation-id {:type :uuid :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.messaging_idempotency
(deftype.pg ^{:finfolk/constraints ["NOT NULL created_at" "NOT NULL expires_at" "NOT NULL key_hash" "PRIMARY KEY (user_id key_hash)" "NOT NULL request_hash" "NOT NULL response_status" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id"]}
  messaging_idempotency
  [:user-id {:type :text :required true :primary "default"}
   :key-hash {:type :text :required true :primary "default"}
   :request-hash {:type :text :required true}
   :response-ciphertext {:type :text}
   :response-status {:type :integer :required true}
   :expires-at {:type :timestamptz :required true}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}])

;; Physical table: finfolk.messaging_oauth_states
(deftype.pg ^{:finfolk/constraints ["NOT NULL created_at" "NOT NULL expires_at" "PRIMARY KEY (state_hash)" "NOT NULL state_hash" "FOREIGN KEY (user_id) REFERENCES finfolk.members(user_id) ON DELETE CASCADE" "NOT NULL user_id"]}
  messaging_oauth_states
  [:state-hash {:type :text :required true :primary true}
   :user-id {:type :text :required true}
   :expires-at {:type :timestamptz :required true}
   :consumed-at {:type :timestamptz}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :flow-key {:type :text}])

;; Physical table: finfolk.messaging_outbox
(deftype.pg ^{:finfolk/constraints ["NOT NULL attempts" "CHECK ((length(body) <= 2000))" "NOT NULL body" "FOREIGN KEY (connect_code_id) REFERENCES finfolk.instagram_connect_codes(id) ON DELETE SET NULL" "NOT NULL correlation_id" "NOT NULL created_at" "NOT NULL deadline" "FOREIGN KEY (event_id) REFERENCES finfolk.instagram_dm_events(id) ON DELETE CASCADE" "UNIQUE (event_id)" "NOT NULL event_id" "NOT NULL id" "NOT NULL next_attempt_at" "PRIMARY KEY (id)" "CHECK ((reply_kind = ANY (ARRAY['text'::text 'connect_code'::text 'connect_guidance'::text])))" "NOT NULL reply_kind" "CHECK ((state = ANY (ARRAY['pending'::text 'sending'::text 'provider_accepted'::text 'failed'::text 'uncertain'::text 'cancelled'::text 'expired'::text])))" "NOT NULL state" "NOT NULL updated_at"]}
  messaging_outbox
  [:id {:type :uuid :required true :primary true :finfolk/default-sql "gen_random_uuid()"}
   :event-id {:type :text :required true}
   :body {:type :text :required true}
   :correlation-id {:type :uuid :required true}
   :state {:type :text :required true :finfolk/default-sql "'pending'::text"}
   :attempts {:type :integer :required true :finfolk/default-sql "0"}
   :lease {:type :uuid}
   :next-attempt-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :deadline {:type :timestamptz :required true}
   :provider-message-id {:type :text}
   :error-code {:type :text}
   :created-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :updated-at {:type :timestamptz :required true :finfolk/default-sql "now()"}
   :body-ciphertext {:type :text}
   :reply-kind {:type :text :required true :finfolk/default-sql "'text'::text"}
   :connect-code-id {:type :uuid}])
