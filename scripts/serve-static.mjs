import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../dist/client");
const base = "/Registro-de-Visitas/";

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript"],
  [".css", "text/css"],
  [".json", "application/json"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
]);

// Match GitHub Pages: nested static pages resolve normally; unknown paths serve 404.html.
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);

    if (!pathname.startsWith(base)) {
      response.writeHead(404).end();

      return;
    }

    let file = resolve(root, pathname.slice(base.length));

    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();

      return;
    }

    let status = 200;

    try {
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
      await stat(file);
    } catch {
      file = resolve(root, "404.html");
      status = 404;
    }

    response.writeHead(status, {
      "Content-Type": types.get(extname(file)) ?? "application/octet-stream",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500).end();
  }
}).listen(4173, "127.0.0.1");
