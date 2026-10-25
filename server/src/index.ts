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
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.http.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });
