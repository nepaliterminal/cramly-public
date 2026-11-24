import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  configuration,
  handleSecurity,
  signToken,
  verifyToken,
} from "../server/security.js";
import { protect } from "../server/gate.js";

// Deliberately public, isolated fixtures: never use these credentials in a deployment.
const env = {
  CRAMLY_SITE_PASSWORD: "test-only-visitor-password",
  CRAMLY_ADMIN_PASSWORD: "test-only-owner-password",
  CRAMLY_SESSION_SECRET: "test-only-signing-key-not-for-deployment-12345",
};

test("Node adapter cannot bypass sign-in cooldown with spoofed platform headers", async () => {
  const child = spawn(process.execPath, ["server/serve.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, ...env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const [output] = await once(child.stdout, "data", {
      signal: AbortSignal.timeout(10000),
    });
    const port = String(output).match(/port (\d+)/)?.[1];
    assert.ok(port, "protected server starts");
    const origin = "http://127.0.0.1:" + port;
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await fetch(origin + "/api/security", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": randomUUID(),
          "x-real-ip": randomUUID(),
        },
        body: JSON.stringify({ action: "admin-login", password: "wrong" }),
      });
      assert.equal(response.status, attempt < 10 ? 401 : 429);
      await response.text();
    }
  } finally {
    child.kill();
    await once(child, "exit");
  }
});
function request(body, cookie = "", extra = {}) {
  return new Request("https://study.example/api/security", {
    method: "POST",
    headers: {
      Origin: "https://study.example",
      "Content-Type": "application/json",
      Cookie: cookie,
      "x-real-ip": randomUUID(),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];
async function login(kind) {
  const response = await handleSecurity(
    request({
      action: kind + "-login",
      password: env["CRAMLY_" + kind.toUpperCase() + "_PASSWORD"],
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.match(response.headers.get("set-cookie"), /Secure/);
  return cookieOf(response);
}

test("unconfigured protection fails closed for pages, assets and the security API", async () => {
  assert.equal(configuration({}).ready, false);
  assert.equal(
    (await protect(new Request("https://study.example/"), {})).status,
    503,
  );
  assert.equal(
    (
      await protect(
        new Request("https://study.example/workspace/assets/app.js"),
        {},
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleSecurity(
        new Request("https://study.example/api/security"),
        {},
      )
    ).status,
    503,
  );
  assert.equal(
    configuration({ ...env, CRAMLY_ADMIN_PASSWORD: env.CRAMLY_SITE_PASSWORD })
      .ready,
    false,
  );
});

test("anonymous visitors cannot fetch workspace assets, classic app or admin actions", async () => {
  const gate = await protect(
    new Request("https://study.example/index.html"),
    env,
  );
  assert.match(await gate.text(), /Website password/);
  assert.match(
    gate.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  for (const path of [
    "/workspace/assets/app.js",
    "/generator.js",
    "/auth.js",
    "/config.js",
  ])
    assert.equal(
      (await protect(new Request("https://study.example" + path), env)).status,
      401,
    );
  assert.match(
    await (
      await protect(new Request("https://study.example/admin"), env)
    ).text(),
    /Admin password/,
  );
  assert.equal(
    (
      await handleSecurity(
        request({ action: "generate", count: 1, days: 31, redeemDays: 7 }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleSecurity(
        request({ action: "site-login", password: "wrong" }),
        env,
      )
    ).status,
    401,
  );
});

test("site and admin roles cannot be exchanged; password rotation invalidates only its role", async () => {
  const site = await login("site");
  const admin = await login("admin");
  assert.equal(
    await protect(
      new Request("https://study.example/workspace/assets/app.js", {
        headers: { cookie: site },
      }),
      env,
    ),
    null,
  );
  assert.notEqual(
    await protect(
      new Request("https://study.example/admin", { headers: { cookie: site } }),
      env,
    ),
    null,
  );
  assert.equal(
    await protect(
      new Request("https://study.example/admin", {
        headers: { cookie: admin },
      }),
      env,
    ),
    null,
  );
  const badRole = site.replace("cramly_site=", "cramly_admin=");
  assert.equal(
    (
      await handleSecurity(
        request(
          { action: "generate", count: 1, days: 31, redeemDays: 7 },
          badRole,
        ),
        env,
      )
    ).status,
    403,
  );
  const token = site.slice(site.indexOf("=") + 1);
  assert.equal(
    await verifyToken("site", token, {
      ...env,
      CRAMLY_SITE_PASSWORD: "changed-visitor-password",
    }),
    null,
  );
  assert.ok(
    await verifyToken("site", token, {
      ...env,
      CRAMLY_ADMIN_PASSWORD: "changed-owner-password",
    }),
  );
});

test("browser-changing actions reject cross-origin, absent origin and malformed requests", async () => {
  const admin = await login("admin");
  const body = { action: "generate", count: 1, days: 31, redeemDays: 7 };
  assert.equal(
    (
      await handleSecurity(
        request(body, admin, { Origin: "https://attacker.example" }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await handleSecurity(request(body, admin, { Origin: "" }), env)).status,
    403,
  );
  assert.equal(
    (
      await handleSecurity(
        request(body, admin, { "Content-Type": "text/plain" }),
        env,
      )
    ).status,
    415,
  );
  assert.equal(
    (await handleSecurity(request({ ...body, count: 21 }, admin), env)).status,
    400,
  );
  assert.equal(
    (await handleSecurity(request({ ...body, days: 0 }, admin), env)).status,
    400,
  );
});

test("admin codes redeem into verified grants; expiry, tampering and wrong audiences fail", async () => {
  const admin = await login("admin");
  const site = await login("site");
  const generated = await handleSecurity(
    request(
      {
        action: "generate",
        count: 2,
        days: 31,
        redeemDays: 7,
        label: "Test batch",
      },
      admin,
    ),
    env,
  );
  const { codes } = await generated.json();
  assert.equal(codes.length, 2);
  assert.notEqual(codes[0].code, codes[1].code);
  const redeem = (code) =>
    handleSecurity(request({ action: "redeem", code }, site), env);
  const response = await redeem(codes[0].code);
  assert.equal(response.status, 200);
  const { access } = await response.json();
  assert.ok(access.remote);
  assert.ok(access.expiresAt > Date.now() + 30 * 86400000);
  const pro = cookieOf(response);
  const status = await (
    await handleSecurity(
      new Request("https://study.example/api/security", {
        headers: { Cookie: site + "; " + pro },
      }),
      env,
    )
  ).json();
  assert.ok(status.access.expiresAt > Date.now());
  assert.equal(status.admin, false);
  assert.equal(
    (
      await handleSecurity(
        request({ action: "redeem", code: codes[0].code }, site + "; " + pro),
        env,
      )
    ).status,
    409,
  );
  assert.equal(
    (await redeem(codes[0].code.slice(0, -10) + "invalidsig")).status,
    400,
  );
  const expired =
    "CRAMLY-PRO-" +
    (await signToken(
      "code",
      { id: randomUUID(), days: 31 },
      Date.now() - 60000,
      env,
    ));
  assert.equal((await redeem(expired)).status, 400);
  const wrongAudience =
    "CRAMLY-PRO-" +
    (await signToken(
      "admin",
      { id: randomUUID(), days: 31 },
      Date.now() + 60000,
      env,
    ));
  assert.equal((await redeem(wrongAudience)).status, 400);
  const rotated = {
    ...env,
    CRAMLY_SESSION_SECRET: "new-signing-key-not-for-deployment-123456",
  };
  assert.equal(
    await verifyToken("code", codes[0].code.slice(11), rotated),
    null,
  );
  // Codes intentionally support sharing, not single-use claims.
  assert.equal((await redeem(codes[0].code)).status, 200);
});

test("logout expires both auth cookies and sign-in attempts receive a bounded cooldown", async () => {
  const admin = await login("admin");
  const logout = await handleSecurity(
    request({ action: "logout" }, admin),
    env,
  );
  assert.equal(logout.headers.getSetCookie().length, 2);
  assert.ok(
    logout.headers.getSetCookie().every((value) => value.includes("Max-Age=0")),
  );
  const ip = randomUUID();
  for (let n = 0; n < 10; n++)
    assert.equal(
      (
        await handleSecurity(
          request({ action: "admin-login", password: "wrong" }, "", {
            "x-real-ip": ip,
          }),
          env,
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await handleSecurity(
        request(
          { action: "admin-login", password: env.CRAMLY_ADMIN_PASSWORD },
          "",
          { "x-real-ip": ip },
        ),
        env,
      )
    ).status,
    429,
  );
});
