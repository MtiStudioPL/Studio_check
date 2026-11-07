// Buduje statyczne demo (GitHub Pages) do .demo/out — aplikacja produkcyjna zostaje nietknięta.
//
// Pełna aplikacja potrzebuje serwera (API, baza Postgres, logowanie Microsoft), a GitHub Pages hostuje tylko pliki.
// Dlatego budujemy kopię: bez tras serwerowych, z atrapą API w przeglądarce (demo/overlay/src/lib/demo-mock.ts).
//
//   npm run build:demo                       # podstawa /studio_check
//   DEMO_BASE_PATH=/inna-nazwa npm run build:demo
//   DEMO_BASE_PATH= npm run build:demo       # hosting w katalogu głównym domeny
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".demo");
const base = (process.env.DEMO_BASE_PATH ?? "/studio_check").replace(/\/$/, "");

const fail = (msg) => {
  console.error(`build-demo: ${msg}`);
  process.exit(1);
};

/** Podmienia tekst w pliku kopii i zatrzymuje budowę, gdy wzorca nie ma (zmiana w źródle nie może przejść bez echa). */
function patch(rel, from, to) {
  const file = path.join(work, rel);
  const src = readFileSync(file, "utf8");
  if (!src.includes(from)) fail(`w ${rel} nie ma fragmentu do podmiany: ${from}`);
  writeFileSync(file, src.split(from).join(to));
}

rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
mkdirSync(work, { recursive: true });
cpSync(path.join(root, "src"), path.join(work, "src"), { recursive: true });
cpSync(path.join(root, "public"), path.join(work, "public"), { recursive: true });
for (const f of ["tsconfig.json", "postcss.config.mjs"]) cpSync(path.join(root, f), path.join(work, f));
writeFileSync(path.join(work, "package.json"), JSON.stringify({ name: "studio-wideo-demo", private: true, type: "module" }, null, 2));

// Trasy serwerowe, proxy (CSP, sesja), BotID i ekrany blokady konta (zależne od sesji) nie istnieją w statycznym eksporcie.
for (const rel of ["src/app/api", "src/app/q", "src/proxy.ts", "src/instrumentation-client.ts", "src/app/actions.ts", "src/app/odmowa", "src/app/oczekuje", "src/app/login/login-form.tsx"]) {
  rmSync(path.join(work, rel), { recursive: true, force: true });
}

// Nadpisania: layout bez headers(), ekran startowy bez logowania, panel bez sesji, atrapa API, pływający przycisk DEMO.
cpSync(path.join(root, "demo", "overlay", "src"), path.join(work, "src"), { recursive: true });

// api() → atrapa w przeglądarce.
patch("src/lib/client.ts", "export async function api<T = unknown>(", "async function realApi<T = unknown>(");
const clientPath = path.join(work, "src/lib/client.ts");
writeFileSync(
  clientPath,
  readFileSync(clientPath, "utf8") +
    `
/** Wersja demo: zamiast fetch do serwera — atrapa API działająca w przeglądarce. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const { handle } = await import("./demo-mock");
  return (await handle(path, opts.method ?? "GET", opts.body as Record<string, unknown> | undefined)) as T;
}
void realApi;
`,
);

// Ścieżki absolutne z pliku CSS i naklejek muszą znać podstawę (GitHub Pages: /nazwa-repo/).
patch("src/app/globals.css", 'url("/fonts/', `url("${base}/fonts/`);
patch("src/app/admin/naklejki/page.tsx", "window.location.origin", 'window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "")');

const manifestPath = path.join(work, "public/manifest.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.name = "Studio wideo (demo)";
manifest.start_url = `${base}/`;
manifest.scope = `${base}/`;
manifest.icons = manifest.icons.map((i) => ({ ...i, src: `${base}${i.src}` }));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

writeFileSync(
  path.join(work, "next.config.mjs"),
  `export default {
  output: "export",
  basePath: ${JSON.stringify(base)},
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: { root: ${JSON.stringify(root)} },
  env: { NEXT_PUBLIC_BASE_PATH: ${JSON.stringify(base)} },
};
`,
);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) fail("brak node_modules — uruchom najpierw `npm ci`.");
const r = spawnSync(process.execPath, [nextBin, "build"], { cwd: work, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
if (r.status !== 0) fail("next build nie powiódł się.");

// Eksport zapisuje dane segmentów jako __next.<segment>/<ścieżka>/__PAGE__.txt, a przeglądarka prosi o płaską nazwę
// __next.<segment>.<ścieżka>.__PAGE__.txt. Serwery z regułą przepisywania to godzą; GitHub Pages nie, więc dokładamy kopie.
function flattenSegments(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) {
      const walk = (d, parts) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(d, e.name), [...parts, e.name]);
          else cpSync(path.join(d, e.name), path.join(dir, [entry.name, ...parts, e.name].join(".")));
        }
      };
      walk(full, []);
    } else {
      flattenSegments(full);
    }
  }
}
flattenSegments(path.join(work, "out"));

writeFileSync(path.join(work, "out", ".nojekyll"), "");
console.log(`\nDemo gotowe: ${path.join(work, "out")} (podstawa: ${base || "/"})`);
