// Uruchamia kolejne pliki drizzle/*.sql, każdy raz. Wymaga DATABASE_URL_ADMIN (konto właściciela).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL_ADMIN;
if (!url) {
  console.error("Brak DATABASE_URL_ADMIN");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = path.resolve("drizzle");

await sql`create table if not exists _migracje (plik text primary key, kiedy timestamptz not null default now())`;
const done = new Set((await sql<{ plik: string }[]>`select plik from _migracje`).map((r) => r.plik));

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const body = readFileSync(path.join(dir, file), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into _migracje (plik) values (${file})`;
  });
  console.log("✓", file);
}
await sql.end();
console.log("Migracje gotowe.");
