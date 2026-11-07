(ns finfolkdb.common.fn-system-auth (:require [lang.core :as l]))
(l/script :postgres {:require [[postgres.core :as pg]] :static {:application ["finfolk"] :all {:schema ["finfolk_rpc"]}}})
(defn.pg ^{:%% :sql :- [:text]} actor-id []
 (pg/coalesce (pg/current-setting "finfolk.actor_id" true) ""))

(defn.pg ^{:%% :sql :- [:boolean] :props [:security :definer]} member-permitted [:boolean verified-required]
 [:select [:exists [:select 1 :from (. #{"neon_auth"} #{"user"})
   :where (and (== (:text #{"id"}) (-/actor-id))
    (== (pg/coalesce #{"banned"} false) false)
    (or (== verified-required false) (== #{"emailVerified"} true)))]]])
(defn.pg ^{:%% :sql :- [:jsonb] :props [:security :definer]} auth-identity [:text i-user-id]
 [:select (pg/jsonb-build-object "id" (:text #{"id"}) "name" #{"name"} "verified" #{"emailVerified"})
  :from (. #{"neon_auth"} #{"user"})
  :where (and (== (:text #{"id"}) i-user-id) (== (pg/coalesce #{"banned"} false) false))])
