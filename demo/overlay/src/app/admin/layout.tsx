import { AdminNav, AdminTransition } from "@/app/admin/nav";

export const metadata = { title: "Panel · Studio wideo (demo)" };

/** Wersja demo: bez sprawdzania sesji i roli — wszystko działa na danych przykładowych. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <AdminNav name="Demo Użytkownik" />
      <main className="min-w-0 flex-1 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl">
          <AdminTransition>{children}</AdminTransition>
        </div>
      </main>
    </div>
  );
}
