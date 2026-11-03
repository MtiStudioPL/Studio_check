import { describe, expect, it } from "vitest";
import { parseKod } from "@/lib/qr";
import { makeKioskToken, makeStaticToken, verifyDoorToken } from "@/lib/doorToken";
import { fmtDateTime, inQuiet, nextOutsideQuiet, startOfWarsawDay, warsaw } from "@/lib/time";
import { escapeHtml, htmlTable } from "@/lib/html";
import { checkClaims } from "@/lib/claims";
import { toCsv } from "@/lib/csv";
import { quietStart } from "@/lib/cron";

describe("parsowanie QR", () => {
  it.each([
    ["https://forms.office.com/Pages/ResponsePage.aspx?id=abc&r5a1=12", 12],
    ["https://forms.office.com/Pages/ResponsePage.aspx?id=abc&r5a1=12.0", 12],
    ["https://studio.example/q?kod=7", 7],
    ["12", 12],
    ["12.0", 12],
    ["  33 ", 33],
    ["kod=5", 5],
  ])("%s → %s", (raw, kod) => expect(parseKod(raw)).toBe(kod));

  it.each(["", "abc", "0", "-3", "https://example.com/", "https://x.pl/q?kod=abc", "1e5", null])("%s → null", (raw) =>
    expect(parseKod(raw as string)).toBeNull(),
  );
});

describe("kod drzwi (HMAC)", () => {
  const secret = "x".repeat(40);
  it("naklejka: poprawny, zła wersja, podrobiony", () => {
    const t = makeStaticToken(secret, 3);
    expect(verifyDoorToken(t, secret, 3)).toEqual({ ok: true, kind: "naklejka" });
    expect(verifyDoorToken(t, secret, 4)).toEqual({ ok: false, reason: "wersja" });
    expect(verifyDoorToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), secret, 3).ok).toBe(false);
    expect(verifyDoorToken(makeStaticToken("y".repeat(40), 3), secret, 3)).toEqual({ ok: false, reason: "podpis" });
    expect(verifyDoorToken("s.3", secret, 3).ok).toBe(false);
  });
  it("kiosk: ważny ±30 s, potem wygasa", () => {
    const now = 1_800_000_000_000;
    const t = makeKioskToken(secret, 1, now);
    expect(verifyDoorToken(t, secret, 1, now + 25_000).ok).toBe(true);
    expect(verifyDoorToken(t, secret, 1, now + 95_000)).toEqual({ ok: false, reason: "wygasl" });
  });
});

describe("czas warszawski", () => {
  it("format dd.MM.yyyy HH:mm", () => {
    expect(fmtDateTime(new Date("2026-10-30T13:05:00Z"))).toBe("30.10.2026 14:05"); // CET
    expect(fmtDateTime(new Date("2026-07-01T13:05:00Z"))).toBe("01.07.2026 15:05"); // CEST
  });
  it("cisza 21:00–7:00 przez północ i zmianę czasu", () => {
    expect(inQuiet(new Date("2026-10-30T20:30:00Z"))).toBe(true); // 21:30 CET
    expect(inQuiet(new Date("2026-10-30T05:59:00Z"))).toBe(true); // 6:59 CET
    expect(inQuiet(new Date("2026-10-30T06:00:00Z"))).toBe(false); // 7:00 CET
    expect(inQuiet(new Date("2026-07-01T18:59:00Z"))).toBe(false); // 20:59 CEST
  });
  it("przypomnienie wypadające w ciszy idzie o 7:00", () => {
    const t = nextOutsideQuiet(new Date("2026-03-29T00:30:00Z")); // noc zmiany czasu na letni
    const w = warsaw(t);
    expect([w.hour, w.minute, w.dateStr]).toEqual([7, 0, "2026-03-29"]);
    const t2 = nextOutsideQuiet(new Date("2026-10-25T01:30:00Z")); // noc zmiany na zimowy
    expect([warsaw(t2).hour, warsaw(t2).minute]).toEqual([7, 0]);
  });
  it("początek doby i początek ciszy", () => {
    expect(startOfWarsawDay(new Date("2026-10-30T13:00:00Z")).toISOString()).toBe("2026-10-29T23:00:00.000Z");
    expect(startOfWarsawDay(new Date("2026-07-01T13:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(quietStart(new Date("2026-10-30T21:10:00Z"), "21:00").toISOString()).toBe("2026-10-30T20:00:00.000Z");
    expect(quietStart(new Date("2026-10-31T03:00:00Z"), "21:00").toISOString()).toBe("2026-10-30T20:00:00.000Z");
  });
});

describe("HTML w mailach", () => {
  it("escapuje tekst od użytkownika", () => {
    expect(escapeHtml(`<script>alert("x")</script>&'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
    expect(htmlTable(["A"], [["<img src=x onerror=1>"]])).not.toContain("<img");
  });
});

describe("CSV", () => {
  it("średnik, cudzysłowy, ochrona przed formułami", () => {
    const csv = toCsv(["a", "b"], [["=SUM(1)", 'x;"y"']]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=SUM(1)");
    expect(csv).toContain('"x;""y"""');
  });
});

describe("sprawdzenia logowania", () => {
  const T = "cdeca4b5-7ade-4442-8dc2-2be7fd807b23";
  it("przyjmuje konto szkolne", () => {
    expect(checkClaims({ tid: T, oid: "o1", preferred_username: "Jan.K@MTI.edu.pl" }, T, "mti.edu.pl")).toEqual({ ok: true });
  });
  it("odrzuca inny tenant, inną domenę, konto prywatne", () => {
    expect(checkClaims({ tid: "9188040d-6c67-4c5b-b112-36a304b66dad", oid: "o", email: "a@outlook.com" }, T, "mti.edu.pl").ok).toBe(false);
    expect(checkClaims({ tid: T, oid: "o", email: "a@mti.edu.pl.evil.com" }, T, "mti.edu.pl").ok).toBe(false);
    expect(checkClaims({ tid: T, oid: "o", email: "a@gmail.com" }, T, "mti.edu.pl").ok).toBe(false);
    expect(checkClaims({ tid: T, email: "a@mti.edu.pl" }, T, "mti.edu.pl").ok).toBe(false);
    expect(checkClaims({ tid: T, oid: "o", email: "a@mti.edu.pl" }, "", "mti.edu.pl").ok).toBe(false);
  });
});
