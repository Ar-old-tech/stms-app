import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const file = new URL("../.env", import.meta.url);
let content = await readFile(file, "utf8");
let generated = 0;
for (const [key, size] of [
  ["JWT_SECRET", 48],
  ["WEBHOOK_SECRET", 48],
  ["DOCUMENT_KEY", 32],
]) {
  const pattern = new RegExp(`^${key}=(.*)$`, "m");
  const value = content.match(pattern)?.[1]?.trim();
  if (!value || value.startsWith("replace-with-")) {
    const line = `${key}=${randomBytes(size).toString("hex")}`;
    content = pattern.test(content)
      ? content.replace(pattern, line)
      : `${content}\n${line}\n`;
    generated++;
  }
}
await writeFile(file, content, { mode: 0o600 });
console.log(
  `Local environment prepared: ${generated} secret values generated; existing values preserved. Set DATABASE_URL in .env.`,
);
