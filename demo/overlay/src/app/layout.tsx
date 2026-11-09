import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui";
import { DemoBar } from "@/components/demo-bar";
import { CookieNotice } from "@/components/cookie-notice";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Studio wideo (demo)",
  description: "Demo: wypożyczenia sprzętu i obecność w szkolnym studiu wideo",
  manifest: `${BASE}/manifest.webmanifest`,
  applicationName: "Studio wideo",
  icons: { icon: `${BASE}/icons/icon.svg`, apple: `${BASE}/icons/icon-192.png` },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0E1013",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: klawiatura zmniejsza układ, więc dolne panele same wjeżdżają nad nią (iOS obsługuje --kb).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="antialiased">
        <ToastProvider>
          {children}
          <DemoBar />
          <CookieNotice />
        </ToastProvider>
      </body>
    </html>
  );
}
