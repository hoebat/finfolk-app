(defproject finfolk/database "0.1.0"
  :description "FinFolk PostgreSQL declarations and publication"
  :dependencies [[org.clojure/clojure "1.11.1"] [xyz.zcaudate/postgres "4.1.8"]]
  :source-paths ["src"] :main finfolkdb.build)
