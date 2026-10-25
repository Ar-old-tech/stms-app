import { testDatabase } from "../tests/database.js";
import { createApp } from "../src/app.js";
const env = await testDatabase(),
  server = createApp(env.db, env.c);
server.finish();
server.http.listen(3000, "127.0.0.1", () =>
  console.log("Isolated PostgreSQL test service ready on port 3000"),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.runtime.close();
  await env.close();
  process.exit(0);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
