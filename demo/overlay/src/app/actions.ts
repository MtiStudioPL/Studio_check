/** Wersja demo: „wylogowanie” po prostu wraca na ekran startowy demo (bez serwera). */
export async function logoutAction() {
  location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/login`;
}
