(ns finfolkdb.main.scaffold-000-dev (:require [lang.core :as l]))
(l/script :postgres {:require [[finfolkdb.fn.member.member-profile :as profile]] :static {:application ["finfolk"] :all {:schema ["finfolk_rpc"]}}})
