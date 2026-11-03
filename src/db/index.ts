import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // Jedna pula połączeń na instancję funkcji (i na hot reload w dev).
  var __studioSql: ReturnType<typeof postgres> | undefined;
}

function client() {
  // Bez DATABASE_URL (np. podczas `next build`) klient powstaje, ale nie łączy się, dopóki nie padnie zapytanie.
  const url = process.env.DATABASE_URL ?? "postgres://brak:brak@localhost:5432/brak";
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    ssl: url.includes("localhost") ? false : "require",
    // Pooler w trybie transakcyjnym (Supabase/Neon) nie obsługuje prepared statements.
    prepare: false,
  });
}

export const sqlClient = globalThis.__studioSql ?? (globalThis.__studioSql = client());
export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
