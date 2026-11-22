import { getDb } from "../lib/db";
import { INDEXES } from "../lib/indexes";

async function main() {
  const db = await getDb();
  for (const def of INDEXES) {
    const name = await db.collection(def.collection).createIndex(def.key, def.options);
    console.log(`${def.collection}: ${name}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
