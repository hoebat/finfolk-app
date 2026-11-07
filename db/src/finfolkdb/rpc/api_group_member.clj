(ns finfolkdb.rpc.api-group-member
  "Stable operation publication; implementations belong in fn.member."
  (:require [lang.core :as l]))
(l/script :postgres
 {:require [[finfolkdb.fn.member.member-profile :as member]]
  :static {:application ["finfolk"] :all {:schema ["finfolk_rpc"]}}})
(def OPERATIONS
 {:member-profile {:function 'finfolkdb.fn.member.member-profile/member-profile
                   :input [] :return :jsonb}
  :profile-save {:function 'finfolkdb.fn.member.member-profile/profile-save
                 :input [:jsonb] :return :jsonb}
  :checkin-record {:function 'finfolkdb.fn.member.member-profile/checkin-record
                   :input [:text] :return :jsonb}})
