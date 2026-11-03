import "server-only";

const list = (v: string | undefined) =>
  (v ?? "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

export const config = {
  get tenantId() {
    return process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? "";
  },
  get domain() {
    return (process.env.ALLOWED_EMAIL_DOMAIN ?? "mti.edu.pl").toLowerCase();
  },
  /** Konta z rolą administratora niezależnie od roli Studio.Admin w Entra (awaryjnie / na start). */
  get adminEmails() {
    return list(process.env.ADMIN_EMAILS);
  },
  /** Gdzie idą maile administracyjne (raport 15:30, ostrzeżenia). */
  get adminNotify() {
    const l = list(process.env.ADMIN_NOTIFY_EMAILS);
    return l.length ? l : list(process.env.ADMIN_EMAILS);
  },
  get mailbox() {
    return process.env.STUDIO_MAILBOX ?? "";
  },
  get appUrl() {
    return (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get doorSecret() {
    const s = process.env.DOOR_SECRET;
    if (!s || s.length < 32) throw new Error("DOOR_SECRET musi mieć co najmniej 32 znaki");
    return s;
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get ipSalt() {
    return process.env.IP_HASH_SALT ?? process.env.AUTH_SECRET ?? "";
  },
  /** Wysyłka maili wyłączona (np. podczas pilotażu równoległego z Power Automate). */
  get mailDisabled() {
    return process.env.MAIL_DISABLED === "1";
  },
  get retentionMonths() {
    return Number(process.env.ATTENDANCE_RETENTION_MONTHS ?? 12);
  },
};
