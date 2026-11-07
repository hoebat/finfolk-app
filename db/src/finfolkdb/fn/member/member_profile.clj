(ns finfolkdb.fn.member.member-profile (:require [lang.core :as l]))
(l/script :postgres {:require [[postgres.core :as pg] [finfolkdb.common.fn-system-auth :as auth]] :static {:application ["finfolk"] :all {:schema ["finfolk_rpc"]}}})
(defn.pg ^{:%% :sql :- [:jsonb]} member-profile []
 [:select #{"profile"} :from (. #{"finfolk"} #{"members"})
  :where (and (== #{"user_id"} (auth/actor-id)) (== #{"deleted"} false) (auth/member-permitted false))])
(defn.pg ^{:%% :sql :- [:jsonb]} profile-save [:jsonb value]
 [:update (. #{"finfolk"} #{"members"})
  :set (--- [(== #{"profile"} value) (== #{"updated_at"} (pg/now))])
  :where (and (== #{"user_id"} (auth/actor-id)) (== #{"deleted"} false)
   (== (#{"jsonb_typeof"} value) "object")
   (auth/member-permitted (== (pg/coalesce (:->> value "open") "false") "true")))
  :returning #{"profile"}])
(defn.pg ^{:%% :sql :- [:jsonb]} checkin-record [:text i-beach-id]
 [:with eligible :as
  [:select (--- [#{"id"} #{"timezone"}]) :from (. #{"finfolk"} #{"beaches"})
   :where (and (== #{"id"} i-beach-id)
    [:exists [:select 1 :from (. #{"finfolk"} #{"members"})
     :where (and (== #{"user_id"} (auth/actor-id)) (== #{"deleted"} false) (auth/member-permitted true))]])]
  \, inserted :as
  [:insert-into (. #{"finfolk"} #{"checkins"}) (>-< [#{"user_id"} #{"beach_id"} #{"visit_day"}])
   :select (--- [(auth/actor-id) #{"id"} (:date (#{"timezone"} #{"timezone"} (pg/now)))])
   :from eligible :on-conflict :do-nothing :returning #{"visit_day"}]
  :select (pg/jsonb-build-object "day" (:date (#{"timezone"} #{"timezone"} (pg/now)))
    "selfReported" true)
  :from eligible])
