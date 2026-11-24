import { SignJWT, jwtVerify } from "jose";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";

export const cookies = {
  site: "cramly_site",
  admin: "cramly_admin",
  pro: "cramly_pro",
};
const issuer = "cramly";
const attempts = new Map();
const encoder = new TextEncoder();

export function configuration(env = process.env) {
  const missing = [];
  if (!env.CRAMLY_SITE_PASSWORD || env.CRAMLY_SITE_PASSWORD.length < 12)
    missing.push("CRAMLY_SITE_PASSWORD (at least 12 characters)");
  if (!env.CRAMLY_ADMIN_PASSWORD || env.CRAMLY_ADMIN_PASSWORD.length < 12)
    missing.push("CRAMLY_ADMIN_PASSWORD (at least 12 characters)");
  if (!env.CRAMLY_SESSION_SECRET || env.CRAMLY_SESSION_SECRET.length < 32)
    missing.push("CRAMLY_SESSION_SECRET (at least 32 characters)");
  if (
    env.CRAMLY_SITE_PASSWORD &&
    env.CRAMLY_SITE_PASSWORD === env.CRAMLY_ADMIN_PASSWORD
  )
    missing.push("distinct site and admin passwords");
  return { ready: missing.length === 0, missing };
}

function key(kind, env) {
  // Password rotation invalidates sessions of that role without invalidating Pro codes.
  return createHash("sha256")
    .update(
      env.CRAMLY_SESSION_SECRET +
        ":" +
        kind +
        ":" +
        (kind === "site"
          ? env.CRAMLY_SITE_PASSWORD
          : kind === "admin"
            ? env.CRAMLY_ADMIN_PASSWORD
            : ""),
    )
    .digest();
}

export function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const hash = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(left), hash(right));
}

export async function signToken(kind, payload, expiresAt, env = process.env) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(kind)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(key(kind, env));
}

export async function verifyToken(kind, token, env = process.env) {
  if (
    !configuration(env).ready ||
    typeof token !== "string" ||
    token.length > 4096
  )
    return null;
  try {
    const { payload } = await jwtVerify(token, key(kind, env), {
      issuer,
      audience: kind,
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(request, name) {
  const entry = (request.headers.get("cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="));
  return entry ? entry.slice(name.length + 1) : "";
}

export async function sessions(request, env = process.env) {
  const [site, admin, pro] = await Promise.all(
    Object.entries(cookies).map(([kind, name]) =>
      verifyToken(kind, readCookie(request, name), env),
    ),
  );
  return {
    site: !!site || !!admin,
    admin: !!admin,
    adminExpiresAt: admin ? admin.exp * 1000 : null,
    pro:
      pro && typeof pro.days === "number"
        ? { expiresAt: pro.exp * 1000, remote: true }
        : null,
  };
}

export function cookie(request, kind, token, maxAge) {
  return (
    cookies[kind] +
    "=" +
    token +
    "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
    maxAge +
    (new URL(request.url).protocol === "https:" ? "; Secure" : "")
  );
}

export function privateHeaders(extra = {}) {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...extra,
  };
}

function json(value, status = 200, extra = {}) {
  return Response.json(value, { status, headers: privateHeaders(extra) });
}

function throttle(request) {
  const ip =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "local";
  const now = Date.now();
  for (const [id, value] of attempts)
    if (value.until <= now) attempts.delete(id);
  if (attempts.size > 10000) return false;
  const previous = attempts.get(ip) || { count: 0, until: now + 10 * 60000 };
  previous.count++;
  attempts.set(ip, previous);
  return previous.count <= 10;
}

export async function handleSecurity(request, env = process.env) {
  const setup = configuration(env);
  if (!setup.ready)
    return json(
      {
        error:
          "Website protection is not configured. The owner must set the three server-only Cramly secrets in Vercel.",
        configured: false,
      },
      503,
    );
  const auth = await sessions(request, env);
  if (request.method === "GET")
    return json({
      configured: true,
      site: auth.site,
      admin: auth.admin,
      ...(auth.admin ? { adminExpiresAt: auth.adminExpiresAt } : {}),
      access: auth.site ? auth.pro : null,
      ...(auth.admin
        ? {
            security: {
              siteHours: 12,
              adminMinutes: 30,
              codeMode: "Shareable, expiring activation codes",
              storage: "Study data stays in each student’s browser",
              version: 1,
            },
          }
        : {}),
    });
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return json({ error: "Use this website’s own form to make changes." }, 403);
  if (
    !(request.headers.get("content-type") || "").startsWith("application/json")
  )
    return json({ error: "JSON required." }, 415);
  let body;
  try {
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > 8192)
      return json({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const { action } = body;
  if (action === "site-login" || action === "admin-login") {
    if (!throttle(request))
      return json(
        { error: "Too many sign-in attempts. Try again in 10 minutes." },
        429,
        { "Retry-After": "600" },
      );
    const kind = action === "admin-login" ? "admin" : "site";
    if (
      !sameSecret(
        body.password,
        kind === "admin" ? env.CRAMLY_ADMIN_PASSWORD : env.CRAMLY_SITE_PASSWORD,
      )
    )
      return json({ error: "That password is not correct." }, 401);
    const maxAge = kind === "admin" ? 1800 : 43200;
    const token = await signToken(
      kind,
      { sid: randomUUID() },
      Date.now() + maxAge * 1000,
      env,
    );
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie(request, kind, token, maxAge),
    });
  }
  if (action === "logout" || action === "admin-logout") {
    const response = json({ ok: true });
    for (const kind of action === "logout" ? ["site", "admin"] : ["admin"])
      response.headers.append("Set-Cookie", cookie(request, kind, "", 0));
    return response;
  }
  if (action === "generate") {
    if (!auth.admin) return json({ error: "Admin sign-in required." }, 403);
    const { count, days, redeemDays, label = "" } = body;
    if (
      ![count, days, redeemDays].every(Number.isInteger) ||
      count < 1 ||
      count > 20 ||
      days < 1 ||
      days > 365 ||
      redeemDays < 1 ||
      redeemDays > 90 ||
      typeof label !== "string" ||
      label.length > 80
    )
      return json(
        {
          error:
            "Choose 1–20 codes, 1–365 Pro days and a 1–90 day activation window.",
        },
        400,
      );
    const expiresAt = Date.now() + redeemDays * 86400000;
    const codes = await Promise.all(
      Array.from({ length: count }, async () => ({
        code:
          "CRAMLY-PRO-" +
          (await signToken(
            "code",
            { id: randomUUID(), days, label: label.trim() },
            expiresAt,
            env,
          )),
        days,
        expiresAt,
        label: label.trim(),
      })),
    );
    return json({ codes });
  }
  if (action === "redeem") {
    if (!auth.site)
      return json({ error: "Enter the website password first." }, 401);
    if (auth.pro)
      return json(
        { error: "Pro is already active. Keep your code for renewal." },
        409,
      );
    if (typeof body.code !== "string" || !body.code.startsWith("CRAMLY-PRO-"))
      return json({ error: "That code is invalid or expired." }, 400);
    const payload = await verifyToken("code", body.code.trim().slice(11), env);
    if (
      !payload ||
      !Number.isInteger(payload.days) ||
      payload.days < 1 ||
      payload.days > 365 ||
      typeof payload.id !== "string"
    )
      return json({ error: "That code is invalid or expired." }, 400);
    const expiresAt = Date.now() + payload.days * 86400000;
    const token = await signToken(
      "pro",
      { days: payload.days, code: payload.id },
      expiresAt,
      env,
    );
    return json(
      { access: { expiresAt, remote: true }, days: payload.days },
      200,
      { "Set-Cookie": cookie(request, "pro", token, payload.days * 86400) },
    );
  }
  return json({ error: "Unknown action." }, 400);
}
