import { randomBytes } from "node:crypto";
import { configuration, privateHeaders, sessions } from "./security.js";

export function loginPage(admin = false) {
  const nonce = randomBytes(18).toString("base64");
  const heading = admin
    ? "Your workspace, behind the scenes."
    : "A little focus. A private space.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3eee3"><title>${admin ? "Admin sign-in" : "Welcome"} · Cramly</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f3eee3;color:#312e28;font:16px/1.6 system-ui,sans-serif;min-height:100svh;display:grid;place-items:center;padding:24px}.card{width:100%;max-width:440px;background:#fffcf5;border:1px solid #ded8cc;border-radius:22px;padding:38px;box-shadow:0 18px 70px #594b2710}a{color:#a65035}.brand{font-size:25px;font-weight:750;text-decoration:none}.eyebrow{font-size:11px;letter-spacing:2px;color:#897b66;margin-top:32px}h1{font:34px/1.2 Georgia,serif;margin:12px 0}p{color:#746d60}label{display:block;font-size:14px}input,button{font:inherit;width:100%;border:1px solid #d8d1c3;border-radius:10px;padding:12px;margin-top:8px}input{background:#fffdf8}button{background:#a65035;color:white;cursor:pointer;border-color:#a65035;margin-top:20px}button:disabled{opacity:.6}#error{min-height:24px;color:#a23928;font-size:14px}.foot{font-size:12px;margin-top:24px}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #a65035;outline-offset:3px}@media(max-width:440px){.card{padding:28px}}</style></head><body><main class="card"><a class="brand" href="/">Cramly.</a><div class="eyebrow">${admin ? "OWNER ACCESS" : "YOUR STUDY SPACE"}</div><h1>${heading}</h1><p>${admin ? "Sign in to generate Pro codes and manage access." : "Enter the website password shared with you to continue."}</p><form><label for="password">${admin ? "Admin" : "Website"} password</label><input id="password" type="password" name="password" autocomplete="current-password" required autofocus><button type="submit">${admin ? "Open admin dashboard" : "Enter Cramly"}</button><div id="error" role="status" aria-live="polite"></div></form><div class="foot">${admin ? '<a href="/">Back to studying</a>' : 'Looking after this space? <a href="/admin">Admin sign-in</a>'}</div></main><script nonce="${nonce}">const form=document.querySelector('form'),button=form.querySelector('button'),error=document.querySelector('#error');form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;error.textContent='';try{const response=await fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'${admin ? "admin-login" : "site-login"}',password:form.password.value})});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not sign in.');form.password.value='';location.reload()}catch(e){error.textContent=e.message}finally{button.disabled=false}})</script></body></html>`;
  return new Response(html, {
    headers: privateHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    }),
  });
}

export async function protect(request, env = process.env) {
  const url = new URL(request.url);
  // The endpoint authenticates and authorizes every action itself.
  if (url.pathname === "/api/security") return null;
  if (!configuration(env).ready)
    return new Response(
      "Cramly is locked while the owner finishes website protection setup. Please check back shortly.",
      {
        status: 503,
        headers: privateHeaders({
          "Content-Type": "text/plain; charset=utf-8",
        }),
      },
    );
  const auth = await sessions(request, env);
  const adminPath =
    url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  if (adminPath && !auth.admin) return loginPage(true);
  if (!auth.site) {
    if (
      url.pathname === "/" ||
      url.pathname === "/index.html" ||
      url.pathname.endsWith(".html") ||
      ["/workspace", "/workspace/"].includes(url.pathname) ||
      adminPath
    )
      return loginPage();
    return new Response("Website sign-in required.", {
      status: 401,
      headers: privateHeaders(),
    });
  }
  return null;
}
