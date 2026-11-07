(ns finfolkdb.build
 (:require [finfolkdb.main.scaffold-000-dev] [lang.core.compile :as compile] [std.make.compile :as make] [std.json :as json] [finfolkdb.rpc.api-group-member :as rpc]))
(defn -main [& args]
 (if (= (first args) "--contracts")
  (print (json/write (into {} (map (fn [[k v]] [(name k) (update v :function str)]) rpc/OPERATIONS))))
 (let [[_ content] (binding [make/*mock-compile* true]
   (compile/compile-module-schema {:lang :postgres :main 'finfolkdb.main.scaffold-000-dev :output "pilot.sql"
    :emit {:code {:label {:line-number? false}}}}))]
  (print content)))
 (shutdown-agents))
