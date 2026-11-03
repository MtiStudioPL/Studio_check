// Lokalny podgląd statycznego dema tak, jak serwuje je GitHub Pages (adresy bez .html, 404.html, podstawa /studio_check).
//   npm run build:demo && npm run serve:demo      → http://localhost:4173/studio_check/
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".demo", "out");
const base = (process.env.DEMO_BASE_PATH ?? "/studio_check").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (base && rel !== base && !rel.startsWith(base + "/")) {
    res.writeHead(302, { Location: `${base}/` }).end();
    return;
  }
  rel = rel.slice(base.length) || "/";
  const candidates = [rel, rel + ".html", path.join(rel, "index.html")].map((c) => path.join(out, c));
  const file = candidates.find((c) => c.startsWith(out) && isFile(c));
  if (!file) {
    res.writeHead(404, { "Content-Type": types[".html"] }).end(readFileSync(path.join(out, "404.html")));
    return;
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
}).listen(port, () => console.log(`Demo: http://localhost:${port}${base}/`));
