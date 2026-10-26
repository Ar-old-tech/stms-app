import { config } from "./config.js";
import { Database } from "./db.js";
import { createApp } from "./app.js";
const c = config(),
  db = new Database(c),
  server = createApp(db, c);
server.finish();
server.http.listen(c.PORT, "0.0.0.0", () =>
  console.log(`STMS listening on port ${c.PORT}`),
);
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void server.runtime
      .close()
      .then(() => server.notifier.settled())
      .then(() => db.close())
      .then(() => process.exit(0));
  });
