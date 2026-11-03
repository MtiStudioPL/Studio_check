import { redirect } from "next/navigation";
import { auth, loadUser } from "@/lib/auth";
import { AdminNav } from "./nav";

export const metadata = { title: "Panel · Studio wideo" };

/** Panel tylko dla roli Studio.Admin — sprawdzane na serwerze (każdy endpoint /api/admin/* sprawdza to jeszcze raz). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.oid) redirect("/login?next=/admin");
  const u = await loadUser(session.user.oid);
  if (!u || u.zablokowany) redirect("/odmowa?powod=blokada");
  if (!u.zaakceptowany) redirect("/oczekuje");
  if (u.rola !== "admin") redirect("/");

  return (
    <div className="min-h-dvh lg:flex">
      <AdminNav name={u.imie} />
      <main className="min-w-0 flex-1 px-4 pb-16 pt-4 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
