import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";

export async function getSetting<T>(klucz: string, fallback: T, tx?: Tx): Promise<T> {
  const [r] = await (tx ?? db).select().from(schema.ustawienia).where(eq(schema.ustawienia.klucz, klucz));
  return r ? (r.wartosc as T) : fallback;
}

export async function setSetting(klucz: string, wartosc: unknown, tx?: Tx) {
  await (tx ?? db)
    .insert(schema.ustawienia)
    .values({ klucz, wartosc })
    .onConflictDoUpdate({ target: schema.ustawienia.klucz, set: { wartosc: sql`excluded.wartosc` } });
}

/**
 * Ustawia klucz tylko, jeśli miał inną wartość. Zwraca true, gdy to wywołanie „wygrało”.
 * Chroni zadania crona (raport, retencja) przed podwójnym uruchomieniem przy ponowieniu ticka.
 */
export async function claimOnce(klucz: string, wartosc: string): Promise<boolean> {
  const rows = await db.execute(sql`
    insert into ustawienia (klucz, wartosc) values (${klucz}, to_jsonb(${wartosc}::text))
    on conflict (klucz) do update set wartosc = excluded.wartosc
      where ustawienia.wartosc is distinct from excluded.wartosc
    returning klucz`);
  return rows.length > 0;
}

export type Cisza = { od: string; do: string };
export const getCisza = () => getSetting<Cisza>("cisza", { od: "21:00", do: "07:00" });
export const getDoorVersion = async () => Number(await getSetting<number>("kod_drzwi_wersja", 1));
export const inventoryAdminOnly = async () => Boolean(await getSetting<boolean>("inwentaryzacja_tylko_admin", true));
export const checkinInQuiet = () => getSetting<"odrzucaj" | "pozwalaj">("checkin_w_ciszy", "odrzucaj");
