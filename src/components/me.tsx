"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client";

export type Visit = { id: number; imie: string; wejscie: string; wyjscie: string | null; auto: boolean; sprzetPrzyWyjsciu: number[] };
export type Me = { email: string; imie: string; rola: "admin" | "uzytkownik"; wizyta: Visit | null; inwentaryzacjaTylkoAdmin: boolean };

const Ctx = createContext<{ me: Me | null; reload: () => Promise<void> }>({ me: null, reload: async () => {} });
export const useMe = () => useContext(Ctx);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      /* 401 przekierowuje na logowanie */
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return <Ctx.Provider value={{ me, reload }}>{children}</Ctx.Provider>;
}
