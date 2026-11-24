import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleSecurity, privateHeaders } from "./security.js";
import { protect } from "./gate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../docs");
const port = Number(process.env.PORT || 4186);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin =
      (incoming.headers["x-forwarded-proto"] || "http") +
      "://" +
      (incoming.headers["x-forwarded-host"] || incoming.headers.host);
    const url = new URL(incoming.url, origin);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers))
      if (value)
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    // Vercel adds this header only on its own platform. On the Node adapter it
    // is attacker-controlled, so never let it override the socket address.
    headers.delete("x-vercel-forwarded-for");
    headers.set("x-real-ip", incoming.socket.remoteAddress || "local");
    let body = "",
      bytes = 0;
    for await (const chunk of incoming) {
      bytes += chunk.length;
      if (bytes > 8192) {
        outgoing.writeHead(413, privateHeaders());
        outgoing.end("Request too large.");
        return;
      }
      body += chunk;
    }
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(["GET", "HEAD"].includes(incoming.method) ? {} : { body }),
    });
    let response = await protect(request);
    if (!response && url.pathname === "/api/security")
      response = await handleSecurity(request);
    if (!response) {
      let pathname = decodeURIComponent(url.pathname);
      if (["/", "/admin", "/admin/"].includes(pathname))
        pathname = "/workspace/index.html";
      if (pathname.endsWith("/")) pathname += "index.html";
      const file = resolve(root, "." + pathname);
      if (relative(root, file).startsWith(".."))
        response = new Response("Not found.", { status: 404 });
      else {
        try {
          if (!(await stat(file)).isFile()) throw Error();
          response = new Response(await readFile(file), {
            headers: privateHeaders({
              "Content-Type":
                types[extname(file)] || "application/octet-stream",
            }),
          });
        } catch {
          response = new Response("Not found.", { status: 404 });
        }
      }
    }
    const resultHeaders = Object.fromEntries(response.headers);
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length) resultHeaders["set-cookie"] = setCookies;
    outgoing.writeHead(response.status, resultHeaders);
    outgoing.end(
      incoming.method === "HEAD"
        ? undefined
        : Buffer.from(await response.arrayBuffer()),
    );
  } catch {
    outgoing.writeHead(500, privateHeaders());
    outgoing.end("Something went wrong. Please try again.");
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log("Protected Cramly server ready on port " + server.address().port),
);
