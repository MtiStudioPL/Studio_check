import { NextResponse, type NextRequest } from "next/server";

/**
 * Działa przed każdą stroną i każdym /api:
 *  - CSP z nonce (bez inline script),
 *  - szybkie 401 na /api bez ciasteczka sesji,
 *  - przekierowanie na /login dla stron aplikacji bez sesji.
 * Pełna weryfikacja sesji (podpis, blokada, rola) jest w każdym endpoincie (lib/guard.ts).
 */
const SESSION_COOKIES = ["__Host-studio.session", "studio.session"];
const PUBLIC_API = ["/api/auth/", "/api/cron/"];
const PROTECTED_PAGES = ["/", "/skaner", "/wypozyczone", "/inwentaryzacja", "/obecnosc", "/wyjscie", "/zajmij", "/q", "/c", "/admin", "/kiosk"];

function isProtectedPage(path: string) {
  return PROTECTED_PAGES.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")));
}

function csp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // style-src: skaner QR i paski postępu ustawiają style inline; skrypty pozostają zablokowane.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://login.microsoftonline.com",
    "frame-ancestors 'none'",
    dev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hasSession = SESSION_COOKIES.some((n) => req.cookies.has(n));

  if (path.startsWith("/api/")) {
    if (!PUBLIC_API.some((p) => path.startsWith(p)) && !hasSession) {
      return NextResponse.json({ error: "brak_sesji", message: "Zaloguj się kontem szkolnym." }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isProtectedPage(path) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", policy);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
