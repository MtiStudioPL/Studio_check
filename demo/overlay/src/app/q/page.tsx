"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseKod } from "@/lib/qr";

/** Naklejka QR: /q?kod=12 → Skaner z wybranym sprzętem (odpowiednik trasy serwerowej z wersji produkcyjnej). */
export default function Page() {
  return (
    <Suspense>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const router = useRouter();
  const kod = parseKod(useSearchParams().get("kod"));
  useEffect(() => {
    router.replace(kod ? `/skaner?kod=${kod}` : "/skaner");
  }, [router, kod]);
  return null;
}
