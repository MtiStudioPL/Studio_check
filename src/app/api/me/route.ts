import { route } from "@/lib/guard";
import { openVisit, visitView } from "@/lib/attendance";
import { inventoryAdminOnly } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route({ limits: ["odczyt"] }, async ({ user }) => {
  const o = await openVisit(user.oid);
  return {
    email: user.email,
    imie: user.name,
    rola: user.admin ? "admin" : "uzytkownik",
    wizyta: o ? visitView(o) : null,
    inwentaryzacjaTylkoAdmin: await inventoryAdminOnly(),
  };
});
