import { Database, platform } from "./db.js";
import { config } from "./config.js";
import { generateFees } from "./operations.js";
const db = new Database(config());
try {
  await db.run(platform, async (q) => {
    for (const t of (await q.query("SELECT id FROM tenants")).rows)
      await generateFees(q, t.id);
  });
  console.log("Monthly pending fees generated");
} finally {
  await db.close();
}
