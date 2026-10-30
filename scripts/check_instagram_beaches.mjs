import { readFileSync, writeFileSync } from "node:fs";
const catalog = JSON.parse(
  readFileSync(new URL("../web/beaches.json", import.meta.url), "utf8"),
).beaches.map(({ id, name }) => ({ id, name }));
const target = new URL("../functions/instagram-beaches.json", import.meta.url);
if (process.argv.includes("--write"))
  writeFileSync(target, JSON.stringify(catalog, null, 2) + "\n");
else if (
  JSON.stringify(catalog) !==
  JSON.stringify(JSON.parse(readFileSync(target, "utf8")))
)
  throw Error(
    "Instagram beach catalog is stale. Run node scripts/check_instagram_beaches.mjs --write.",
  );
