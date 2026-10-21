// Fresh local D1 for every E2E run, migrated exactly like production.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(".wrangler/e2e", { recursive: true, force: true });
for (const file of ["0001_create_shares.sql", "0002_multi_file_and_edit_codes.sql"]) {
  execSync(`npx wrangler d1 execute md-share-db --local --persist-to .wrangler/e2e --file=migrations/${file}`, { stdio: "ignore" });
}
