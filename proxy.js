import { next, rewrite } from "@vercel/functions";
import { protect } from "./server/gate.js";
import { privateHeaders } from "./server/security.js";
export default async function proxy(request) {
  const gate = await protect(request);
  if (gate) return gate;

  const url = new URL(request.url);
  if (["/", "/admin", "/admin/"].includes(url.pathname)) {
    // Rewrites in vercel.json run after static files, so docs/index.html
    // otherwise shadows the workspace at /. Keep /index.html classic.
    url.pathname = "/workspace/index.html";
    return rewrite(url, { headers: privateHeaders() });
  }
  return next({ headers: privateHeaders() });
}
