import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ToastProvider } from "@/components/ui";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";


export const metadata: Metadata = {
  title: "Studio wideo",
  description: "Wypożyczenia sprzętu i obecność w szkolnym studiu wideo",
  manifest: "/manifest.webmanifest",
  applicationName: "Studio wideo",
  appleWebApp: { capable: true, title: "Studio", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0E1013",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Odczyt nagłówka wymusza renderowanie dynamiczne, dzięki czemu Next wstawia nonce z CSP do swoich skryptów.
  await headers();
  return (
    <html lang="pl">
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
        <SwRegister />
      </body>
    </html>
  );
}
