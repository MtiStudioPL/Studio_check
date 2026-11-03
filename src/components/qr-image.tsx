"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Kod QR jako obraz SVG (data URI) — generowany w przeglądarce, bez zewnętrznych usług. */
export function QrImage({ text, size = 160, label }: { text: string; size?: number; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((svg) => setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => setSrc(""));
  }, [text]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt={label} className="rounded-lg bg-white" />
  ) : (
    <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-chip" />
  );
}
