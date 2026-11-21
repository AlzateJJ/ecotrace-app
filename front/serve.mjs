import http from "node:http";
import https from "node:https";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The front is its own service. Only /api is proxied to the private back service.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "dist");
const upstream = new URL(process.env.BACKEND_URL || "http://127.0.0.1:3001");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) {
    const transport = upstream.protocol === "https:" ? https : http;
    const headers = { ...req.headers, host: upstream.host };
    headers["x-forwarded-for"] =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const proxy = transport.request(
      new URL(req.url, upstream),
      { method: req.method, headers, timeout: 30000 },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      },
    );
    proxy.on("timeout", () => proxy.destroy());
    proxy.on("error", () => {
      if (!res.headersSent)
        res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "La API no está disponible. Intenta de nuevo.",
        }),
      );
    });
    req.pipe(proxy);
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (extname(pathname)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      file = resolve(root, "index.html");
    }
    const size = (await stat(file)).size;
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Content-Length": size,
      "Cache-Control": file.includes(sep + "assets" + sep)
        ? "public,max-age=31536000,immutable"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500);
    res.end("Unable to serve application");
  }
});
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(`EcoTrace front: http://localhost:${process.env.PORT || 3000}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
