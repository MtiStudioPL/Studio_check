import { NextResponse } from "next/server";
import { parseKod } from "@/lib/qr";

/** Naklejka QR: https://<domena>/q?kod=12 → ekran Skanera z wybranym sprzętem (sesję sprawdza proxy). */
export function GET(req: Request) {
  const url = new URL(req.url);
  const kod = parseKod(url.searchParams.get("kod"));
  const dest = new URL(kod ? `/skaner?kod=${kod}` : "/skaner", url);
  return NextResponse.redirect(dest, 303);
}
