import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Download,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import { lockWebsite, securityRequest } from "./security";
import { HOSTING_SETTINGS_URL } from "../docs/firebase-config.js";

type UnlockCode = {
  code: string;
  label: string;
  days: number;
  expiresAt: number;
};

export default function Admin() {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<UnlockCode[]>([]);
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(31);
  const [redeemDays, setRedeemDays] = useState(7);

  useEffect(() => {
    if (!status?.adminExpiresAt) return;
    const timer = setTimeout(
      () => {
        setCodes([]);
        location.reload();
      },
      Math.max(0, status.adminExpiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [status?.adminExpiresAt]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/security", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.admin)
          throw Error(
            result.error || "Admin session expired. Reload to sign in again.",
          );
        setStatus(result);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (
      codes.length &&
      !confirm(
        "Create a new batch? Copy or download the current codes first; they will no longer be shown here.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await securityRequest("generate", {
        count,
        days,
        redeemDays,
        label,
      });
      setCodes(result.codes);
      setVisible(false);
      setNotice(
        `${result.codes.length} code${result.codes.length === 1 ? "" : "s"} created. Copy or download this batch before leaving.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied. Share privately with your student.");
    } catch {
      setError(
        "Clipboard is unavailable. Reveal the codes and copy them manually.",
      );
    }
  }

  function download() {
    const field = (value: string) =>
      '"' +
      (/^[=+@\-\t\r]/.test(value) ? "'" : "") +
      value.replaceAll('"', '""') +
      '"';
    const csv = [
      ["Label", "Code", "Pro days", "Activate before"],
      ...codes.map((code) => [
        code.label,
        code.code,
        String(code.days),
        new Date(code.expiresAt).toISOString(),
      ]),
    ]
      .map((row) => row.map(field).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cramly-unlock-codes.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Codes downloaded. Keep the file private.");
  }

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <a className="brand" href="/">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          Cramly<span className="brand-dot">.</span>
        </a>
        <span className="tag sage">
          <ShieldCheck size={14} /> Owner workspace
        </span>
        <div className="row">
          <a className="text-link" href="/">
            Open study app <ArrowUpRight size={15} />
          </a>
          <button
            onClick={() => lockWebsite(true).catch((e) => setError(e.message))}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>
      <main className="admin-main">
        <p className="eyebrow">BEHIND THE LIGHTBULB MOMENTS</p>
        <h1>
          A little control.
          <br />
          <em>A lot of possibility.</em>
        </h1>
        <p className="subtitle">
          Create Pro unlock codes and look after your study space.
        </p>
        {error && (
          <div className="notice admin-error" role="alert">
            {error}{" "}
            <button className="text-link" onClick={() => location.reload()}>
              Reload sign-in
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            <Check size={16} /> {notice}
          </div>
        )}
        <div className="admin-stats">
          <div className="panel">
            <Lock size={20} />
            <strong>Website protected</strong>
            <span>Separate visitor password · 12-hour sessions</span>
          </div>
          <div className="panel">
            <ShieldCheck size={20} />
            <strong>Owner-only actions</strong>
            <span>Separate admin password · 30-minute sessions</span>
          </div>
          <div className="panel">
            <BookOpen size={20} />
            <strong>Student data stays private</strong>
            <span>No student notes or grades are uploaded here</span>
          </div>
        </div>
        <div className="admin-columns">
          <section className="panel">
            <div className="section-head">
              <h2>
                <KeyRound size={19} /> Create unlock codes
              </h2>
              <span className="tag peach">Pro access</span>
            </div>
            <p className="muted">
              Give students a little more room to grow. A code activates the
              selected number of Pro days when redeemed.
            </p>
            <form onSubmit={generate}>
              <label className="field">
                Batch label{" "}
                <span className="muted">
                  (optional, not a student password)
                </span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                  placeholder="Friends · November"
                />
              </label>
              <div className="grid-two">
                <label className="field">
                  Number of codes
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    required
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  Pro days per activation
                  <input
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    required
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="field">
                Activate within (days)
                <input
                  type="number"
                  min={1}
                  max={90}
                  step={1}
                  required
                  value={redeemDays}
                  onChange={(e) => setRedeemDays(Number(e.target.value))}
                />
                <small>
                  Unused codes expire after this window. Activated Pro access
                  keeps its full duration.
                </small>
              </label>
              <button
                className="primary wide"
                disabled={busy || !status?.admin}
              >
                <Sparkles size={16} />
                {busy ? "Creating…" : "Generate unlock codes"}
              </button>
            </form>
            <div className="notice small">
              These are shareable codes, not single-use licenses. Anyone with a
              code can activate it until its deadline. Keep batches private;
              individual code revocation is not available in this version.
            </div>
          </section>
          <section className="panel">
            <div className="section-head">
              <h2>Your new batch</h2>
              <span className="tag lavender">{codes.length} codes</span>
            </div>
            {codes.length ? (
              <>
                <p className="muted">
                  This batch is shown only in this tab. It is not saved to a
                  code database. Copy or download it before leaving or
                  reloading.
                </p>
                <div className="row admin-actions">
                  <button onClick={() => setVisible(!visible)}>
                    {visible ? <EyeOff size={15} /> : <Eye size={15} />}{" "}
                    {visible ? "Hide codes" : "Reveal codes"}
                  </button>
                  <button onClick={download}>
                    <Download size={15} />
                    Download CSV
                  </button>
                  <button
                    onClick={() => copy(codes.map((c) => c.code).join("\n"))}
                  >
                    <Copy size={15} />
                    Copy all
                  </button>
                </div>
                <div className="admin-codes">
                  {codes.map((code, index) => (
                    <article className="admin-code" key={code.code}>
                      <div className="row">
                        <strong>
                          {code.label || "Unlock code"} {index + 1}
                        </strong>
                        <span className="tag sage">{code.days} Pro days</span>
                      </div>
                      <label className="field">
                        Unlock code {index + 1}
                        <input
                          type={visible ? "text" : "password"}
                          value={code.code}
                          readOnly
                          onFocus={(e) => e.target.select()}
                          spellCheck={false}
                        />
                      </label>
                      <div className="row">
                        <small className="muted">
                          Activate before{" "}
                          {new Date(code.expiresAt).toLocaleString()}
                        </small>
                        <button
                          onClick={() => copy(code.code)}
                          aria-label={"Copy code " + (index + 1)}
                        >
                          <Copy size={14} />
                          Copy
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty">
                <KeyRound size={32} />
                <h3>A little extra possibility</h3>
                <p>Your generated unlock codes will appear here.</p>
              </div>
            )}
          </section>
        </div>
        <section className="panel">
          <div className="section-head">
            <h2>Access & website tools</h2>
            <ShieldCheck size={19} />
          </div>
          <div className="admin-columns">
            <div>
              <h3>Passwords stay on the server.</h3>
              <p className="muted">
                Update the website or admin password in the hosting environment,
                then redeploy. Changing a password expires that role’s existing
                sessions. Rotating the signing secret also invalidates every
                outstanding code and Pro grant.
              </p>
              {HOSTING_SETTINGS_URL && (
                <a
                  className="text-link"
                  href={HOSTING_SETTINGS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage server passwords <ArrowUpRight size={15} />
                </a>
              )}
            </div>
            <div>
              <h3>A clear view, without private student data.</h3>
              <p className="muted">
                This dashboard manages access, not students’ local workspaces.
                Billing is not connected. Share the website password, not the
                admin password.
              </p>
              <div className="row admin-actions">
                <a className="text-link" href="/index.html">
                  Open classic Cramly <ArrowUpRight size={15} />
                </a>
                <button
                  onClick={() =>
                    lockWebsite().catch((e) => setError(e.message))
                  }
                >
                  <Lock size={15} />
                  Lock this browser
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer>
        Made for your next lightbulb moment.
        <span>Server-verified access · Cramly owner workspace</span>
      </footer>
    </div>
  );
}
