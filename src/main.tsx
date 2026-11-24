import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Sun,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  X,
  Zap,
  NotebookPen,
  Layers,
  Brain,
  ChartNoAxesCombined,
  Download,
  Upload,
  Lock,
  Play,
  Pause,
  RotateCcw,
  LogOut,
} from "lucide-react";
import {
  State,
  Subject,
  Note,
  Card,
  Quiz,
  Question,
  uid,
  today,
  dateIn,
  initialState,
  gradeAverage,
  streak,
  mastery,
} from "./model";
import {
  nextReview,
  remaining,
  requiredFinal,
  revisionSchedule,
} from "./learning.js";
import { AISettings, defaultSettings, priority, studyAI, textAI } from "./ai";
import { FIREBASE_CONFIG } from "../docs/firebase-config.js";
import { isPro, exportCSV } from "../docs/study-data.js";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./styles.css";
import Admin from "./Admin";
import { securityRequest, lockWebsite } from "./security";

type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
};
type FormSpec = {
  title: string;
  fields: Field[];
  save: (data: Record<string, string>) => void;
  description?: string;
};
type Usage = Record<string, Record<string, number>>;
type Context = {
  s: State;
  set: (fn: (s: State) => State) => void;
  pro: boolean;
  preview: boolean;
  setPreview: (v: boolean) => void;
  go: (p: string) => void;
  subject: string;
  notify: (m: string) => void;
  form: (f: FormSpec) => void;
  settings: AISettings;
  setSettings: (s: AISettings) => void;
  usage: Usage;
  runAI: (kind: string, context: string, message: string) => Promise<string>;
  makeSet: (
    context: string,
    subject: string,
    title: string,
    adaptive?: boolean,
  ) => Promise<void>;
};
const Ctx = createContext<Context>(null!);
const useApp = () => useContext(Ctx);
const nav = [
  ["Overview", LayoutDashboard],
  ["Subjects", BookOpen],
  ["Notes", NotebookPen],
  ["Flashcards", Layers],
  ["Quizzes", Brain],
  ["Planner", CalendarDays],
  ["Focus", Timer],
  ["Mistake bank", ListChecks],
  ["Insights", ChartNoAxesCombined],
  ["AI studio", Brain],
] as const;
const colors = ["sage", "lavender", "peach", "blue", "yellow"];
function readJSON(key: string, fallback: any) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function validState(value: any): value is State {
  return (
    !!value &&
    typeof value.name === "string" &&
    [
      "subjects",
      "notes",
      "cards",
      "quizzes",
      "attempts",
      "assignments",
      "grades",
      "mistakes",
      "sessions",
      "plans",
      "guides",
    ].every((k) => Array.isArray(value[k])) &&
    Number.isFinite(value.goal) &&
    value.goal > 0
  );
}
function restore(key: string): State {
  const saved = readJSON(key, null);
  if (validState(saved)) return saved;
  return initialState();
}
function legacy() {
  return readJSON("cramly:v1", {});
}
function saveFile(name: string, body: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadNote(note: Note) {
  saveFile(
    note.title.replace(/[^a-z0-9 -]/gi, "").slice(0, 80) + ".md",
    "# " + note.title + "\n\n" + note.body,
  );
}
function subjectName(s: State, id: string) {
  return s.subjects.find((x) => x.id === id)?.name || "General";
}
function dateLabel(date: string) {
  if (date === today()) return "Today";
  if (date === dateIn(1)) return "Tomorrow";
  return new Date(date + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Tag({
  children,
  color = "sage",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return <span className={"tag " + color}>{children}</span>;
}
function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function ProGate({
  children,
  title = "More study tools with Pro",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { pro, go } = useApp();
  return pro ? (
    <>{children}</>
  ) : (
    <div className="pro-gate">
      <Lock size={26} />
      <h3>{title}</h3>
      <p>
        Cramly Pro includes personalized practice, detailed insights and study
        planning.
      </p>
      <button className="primary" onClick={() => go("Plans")}>
        Compare plans
      </button>
    </div>
  );
}
function App() {
  const [account, setAccount] = useState<{ uid: string; name: string } | null>(
    null,
  );
  const [authStatus, setAuthStatus] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authSDK, setAuthSDK] = useState<any>(null);
  const key = account
    ? "cramly:workspace:" + account.uid
    : "cramly:workspace:guest";
  const workspace = useRef({ key });
  const identity = workspace.current;
  const [s, rawSet] = useState<State>(() => restore("cramly:workspace:guest"));
  const [page, go] = useState("Overview");
  const [subject, setSubject] = useState("all");
  const [mobile, setMobile] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const mainShell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobile) return;
    const panel = drawer.current;
    const content = mainShell.current;
    if (!panel || !content) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    content.inert = true;
    panel.querySelector<HTMLElement>(".nav-item.active")?.focus();
    const narrow = window.matchMedia("(max-width: 800px)");
    const resize = () => {
      if (!narrow.matches) setMobile(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobile(false);
      } else if (event.key === "Tab") {
        const targets = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    narrow.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", keyboard);
      narrow.removeEventListener("change", resize);
      content.inert = false;
      document.body.style.overflow = previousOverflow;
      menuButton.current?.focus();
    };
  }, [mobile]);
  const [toast, notify] = useState("");
  const [spec, form] = useState<FormSpec | null>(null);
  const [settings, setSettings] = useState<AISettings>(() => ({
    ...defaultSettings,
    ...legacy().settings,
    ...readJSON("cramly:ai", {}),
  }));
  const [usage, setUsage] = useState<Usage>(() =>
    readJSON("cramly:ai-usage", {}),
  );
  const reservations = useRef<Record<string, number>>({});
  const [access, setAccess] = useState<any>(() =>
    readJSON("cramly:access", legacy().access),
  );
  const [verifiedRemote, setVerifiedRemote] = useState(false);
  useEffect(() => {
    let live = true;
    async function refreshAccess() {
      try {
        const response = await fetch("/api/security", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json();
        if (!live || !result.configured) return;
        if (!result.site) {
          location.reload();
          return;
        }
        if (result.access) {
          setAccess(result.access);
          setVerifiedRemote(true);
          localStorage.setItem("cramly:access", JSON.stringify(result.access));
        } else setAccess((old: any) => (old?.remote ? null : old));
      } catch {
        /* Plain Vite preview has no protected API. Remote grants stay locked. */
      }
    }
    refreshAccess();
    window.addEventListener("focus", refreshAccess);
    return () => {
      live = false;
      window.removeEventListener("focus", refreshAccess);
    };
  }, []);
  const [preview, setPreview] = useState(
    () =>
      sessionStorage.getItem("cramly:pro-preview") === "true" &&
      import.meta.env.VITE_ENABLE_PRO_PREVIEW === "true",
  );
  const [now, setNow] = useState(Date.now());
  const pro =
    (isPro(access, now) && (!access?.remote || verifiedRemote)) || preview;
  const set = useCallback(
    (fn: (s: State) => State) =>
      rawSet((old) => {
        if (identity !== workspace.current) return old;
        const next = fn(old);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          notify(
            "Storage is full or unavailable. Export a backup in Settings before leaving this page.",
          );
        }
        return next;
      }),
    [key, identity],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
  }, [s.theme]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => notify(""), 7000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    try {
      localStorage.setItem("cramly:ai", JSON.stringify(settings));
    } catch {
      notify("Could not save AI settings.");
    }
  }, [settings]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key && event.newValue) {
        try {
          const next = JSON.parse(event.newValue);
          if (validState(next)) rawSet(next);
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  useEffect(() => {
    let unsub = () => {};
    let live = true;
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
      setAuthStatus(
        "Google sign-in is not configured. You can study as a guest.",
      );
      return;
    }
    (async () => {
      try {
        const [app, auth] = await Promise.all([
          import(
            /* @vite-ignore */ "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js"
          ),
          import(
            /* @vite-ignore */ "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js"
          ),
        ]);
        if (!live) return;
        const instance = auth.getAuth(app.initializeApp(FIREBASE_CONFIG));
        setAuthSDK({ ...auth, instance });
        unsub = auth.onAuthStateChanged(instance, (user: any) => {
          if (!live) return;
          const next = user
            ? { uid: user.uid, name: user.displayName || "friend" }
            : null;
          setAccount(next);
          const nextKey = next
            ? "cramly:workspace:" + next.uid
            : "cramly:workspace:guest";
          if (nextKey === workspace.current.key) return;
          // Invalidate in-flight edits before changing to another private workspace.
          workspace.current = { key: nextKey };
          reservations.current = {};
          rawSet(restore(nextKey));
          setSubject("all");
          form(null);
          go("Overview");
          setMobile(false);
          notify("");
        });
      } catch {
        if (live)
          setAuthStatus(
            "Google sign-in is unavailable here. You can keep studying on this device.",
          );
      }
    })();
    return () => {
      live = false;
      unsub();
    };
  }, []);
  async function signIn() {
    if (!authSDK) {
      notify(
        authStatus || "Google sign-in is still loading. Try again shortly.",
      );
      return;
    }
    setAuthBusy(true);
    try {
      await authSDK.signInWithPopup(
        authSDK.instance,
        new authSDK.GoogleAuthProvider(),
      );
      notify(
        "Signed in. This account’s workspace is stored on this device, not synced.",
      );
    } catch {
      notify(
        "Could not sign in. Allow the Google popup and check this domain is authorized in Firebase.",
      );
    } finally {
      setAuthBusy(false);
    }
  }
  function reserve(kind: string) {
    const left = remaining(usage, kind, pro);
    if (left - (reservations.current[kind] || 0) <= 0)
      throw Error(
        "Daily " +
          kind +
          " limit reached. It resets at midnight on this device.",
      );
    reservations.current[kind] = (reservations.current[kind] || 0) + 1;
  }
  function release(kind: string, consume: boolean) {
    reservations.current[kind] = Math.max(
      0,
      (reservations.current[kind] || 1) - 1,
    );
    if (consume)
      setUsage((old) => {
        const d = today();
        const next = {
          [d]: { ...(old[d] || {}), [kind]: (old[d]?.[kind] || 0) + 1 },
        };
        try {
          localStorage.setItem("cramly:ai-usage", JSON.stringify(next));
        } catch {
          notify("Could not save daily usage.");
        }
        return next;
      });
  }
  async function runAI(kind: string, context: string, message: string) {
    if (!pro && !["tutor"].includes(kind))
      throw Error("This tool requires Cramly Pro.");
    reserve(kind);
    try {
      const result = await priority(pro, () =>
        textAI(kind, context, message, settings),
      );
      if (identity !== workspace.current)
        throw Error(
          "The workspace changed. Run the request again in this workspace.",
        );
      release(kind, true);
      return result;
    } catch (e) {
      if (identity === workspace.current) release(kind, false);
      throw e;
    }
  }
  async function makeSet(
    context: string,
    sub: string,
    title: string,
    adaptive = false,
  ) {
    if (!context.trim()) throw Error("Add study notes first.");
    const cloudRequested = settings.provider !== "offline";
    if (cloudRequested) reserve("quiz");
    try {
      const recent = s.attempts.filter((a) => a.subject === sub).slice(-3);
      const ratio = recent.length
        ? recent.reduce((n, a) => n + a.correct / a.total, 0) / recent.length
        : 0.5;
      const weak = adaptive
        ? mastery(s.attempts.filter((a) => a.subject === sub))
            .filter((t) => t.value < 70)
            .map((t) => t.topic)
        : [];
      const result = await studyAI(
        context,
        settings,
        pro,
        adaptive
          ? ratio < 0.5
            ? "foundational"
            : ratio > 0.8
              ? "advanced"
              : "standard"
          : "standard",
        weak,
      );
      if (identity !== workspace.current) return;
      const cloud = !["offline", "fallback"].includes(result.source);
      if (cloudRequested) release("quiz", cloud);
      const questions: Question[] = result.quiz.map((q: any) => ({
        id: uid(),
        prompt: q.question,
        options: q.choices,
        answer: q.answerIndex,
        explanation: q.explanation,
        topic: adaptive && weak.length ? weak[0] : title,
      }));
      const cards: Card[] = result.flashcards.map((c: any) => ({
        id: uid(),
        subject: sub,
        front: c.front,
        back: c.back,
        due: today(),
        interval: 0,
        reviews: 0,
      }));
      set((old) => ({
        ...old,
        cards: [
          ...old.cards,
          ...(pro
            ? cards
            : cards.slice(0, Math.max(0, 100 - old.cards.length))),
        ],
        quizzes: questions.length
          ? [...old.quizzes, { id: uid(), title, subject: sub, questions }]
          : old.quizzes,
      }));
      notify(
        (cloud
          ? "AI study set saved."
          : "Cloud AI unavailable or Local selected; a local rule-based study set was saved, not AI output.") +
          (!questions.length
            ? " Notes did not provide enough distinct terms for a quiz."
            : ""),
      );
      go(questions.length ? "Quizzes" : "Flashcards");
    } catch (e) {
      if (
        identity === workspace.current &&
        cloudRequested &&
        reservations.current.quiz
      )
        release("quiz", false);
      throw e;
    }
  }
  const selected = s.subjects.find((x) => x.id === subject);
  const displayName = account?.name.split(" ")[0] || s.name.trim() || "friend";
  const ctx = {
    s,
    set,
    pro,
    preview,
    setPreview: (v: boolean) => {
      setPreview(v);
      sessionStorage.setItem("cramly:pro-preview", String(v));
    },
    go,
    subject,
    notify,
    form: (f: FormSpec) => form(f),
    settings,
    setSettings,
    usage,
    runAI,
    makeSet,
  };
  const views: Record<string, React.ReactNode> = {
    Overview: <Overview name={displayName} />,
    Subjects: <Subjects />,
    Notes: <Notes />,
    Flashcards: <Flashcards />,
    Quizzes: <Quizzes />,
    Planner: <Planner />,
    Focus: null,
    "Mistake bank": <Mistakes />,
    Insights: <Insights />,
    "AI studio": <Studio />,
    Plans: (
      <Plans
        access={access}
        setAccess={(value) => {
          setAccess(value);
          setVerifiedRemote(!!value?.remote);
        }}
      />
    ),
    Settings: <Preferences />,
  };
  return (
    <Ctx.Provider key={key} value={ctx}>
      <a className="skip-link" href="#main">
        Skip to study workspace
      </a>
      <div className="app-shell">
        <aside
          ref={drawer}
          id="workspace-navigation"
          className={mobile ? "sidebar open" : "sidebar"}
          role={mobile ? "dialog" : undefined}
          aria-modal={mobile ? true : undefined}
          aria-label="Workspace navigation"
        >
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              go("Overview");
              setMobile(false);
            }}
          >
            <span className="brand-icon">
              <BookOpen size={22} />
            </span>
            Cramly<span className="brand-dot">.</span>
          </a>
          <button className="menu-close" onClick={() => setMobile(false)}>
            <X size={18} /> Close menu
          </button>
          <div className="workspace-label">YOUR WORKSPACE</div>
          <nav aria-label="Study tools">
            {nav.map(([label, Icon]) => (
              <button
                key={label}
                className={page === label ? "nav-item active" : "nav-item"}
                onClick={() => {
                  go(label);
                  setMobile(false);
                }}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="upgrade-card">
              <span className="tiny-caps">Cramly Pro</span>
              <h3>Practice for your next exam.</h3>
              <p>Adaptive quizzes and study plans. $5.99/mo.</p>
              <button
                onClick={() => {
                  go("Plans");
                  setMobile(false);
                }}
              >
                Compare plans
              </button>
            </div>
            <button
              className={"nav-item " + (page === "Settings" ? "active" : "")}
              onClick={() => {
                go("Settings");
                setMobile(false);
              }}
            >
              <Settings size={18} />
              Settings
            </button>
            <div className="profile">
              <div className="avatar">{displayName[0].toUpperCase()}</div>
              <div>
                <strong>{account ? displayName : "Your workspace"}</strong>
                <span>
                  {preview ? "Pro preview" : pro ? "Pro plan" : "Free plan"} ·
                  on this device
                </span>
              </div>
              <button
                className="icon-button"
                aria-label={account ? "Sign out" : "Sign in with Google"}
                disabled={authBusy}
                onClick={
                  account
                    ? async () => {
                        try {
                          await authSDK.signOut(authSDK.instance);
                          notify("Signed out.");
                        } catch {
                          notify("Could not sign out.");
                        }
                      }
                    : signIn
                }
              >
                {account ? <LogOut size={16} /> : <ArrowUpRight size={16} />}
              </button>
            </div>
          </div>
        </aside>
        {mobile && (
          <button
            className="backdrop"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setMobile(false)}
          />
        )}
        <div className="main-shell" ref={mainShell}>
          <header className="topbar">
            <div className="row">
              <button
                className="icon-button menu-button"
                ref={menuButton}
                aria-label="Open menu"
                aria-expanded={mobile}
                aria-controls="workspace-navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={22} />
              </button>
              <span className="crumb">
                My workspace <span>/</span> <strong>{page}</strong>
              </span>
            </div>
            <div className="top-actions">
              <span className="date-top">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <button
                className="icon-button"
                aria-label="Toggle theme"
                onClick={() =>
                  set((old) => ({
                    ...old,
                    theme: old.theme === "dark" ? "light" : "dark",
                  }))
                }
              >
                <Sun size={19} />
              </button>
              <button className="plan-pill" onClick={() => go("Plans")}>
                {preview ? "Pro preview" : pro ? "Pro" : "Free plan"}
              </button>
            </div>
          </header>
          <main id="main" tabIndex={-1}>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {page === "Overview"
                    ? "Today’s study plan"
                    : "Cramly workspace"}
                </p>
                <h1>
                  {page === "Overview" ? (
                    <>
                      Good{" "}
                      {new Date().getHours() < 12
                        ? "morning"
                        : new Date().getHours() < 18
                          ? "afternoon"
                          : "evening"}
                      , {displayName}
                    </>
                  ) : page === "AI studio" ? (
                    "AI studio"
                  ) : (
                    page
                  )}
                </h1>
                <p className="subtitle">
                  {
                    (
                      {
                        Overview:
                          "Your study goal, upcoming work and cards due for review.",
                        Subjects:
                          "Organize your notes, cards and quizzes by subject.",
                        Notes:
                          "Write class notes or turn them into a study set.",
                        Flashcards:
                          "Review the cards due today or build a new deck.",
                        Quizzes:
                          "Find what’s sticking, and what needs another look.",
                        Planner:
                          "Track assignments and plan your next study session.",
                        Focus: "Set a timer and record your study time.",
                        Insights:
                          "Understand how you learn. Decide what comes next.",
                        "AI studio":
                          "Ask a question, review a draft or work from your notes.",
                        "Mistake bank":
                          "Revisit missed questions and check your understanding.",
                        Plans: "Compare Free and Pro study tools.",
                        Settings:
                          "Manage your study preferences, AI provider and data.",
                      } as Record<string, string>
                    )[page]
                  }
                </p>
              </div>
              {[
                "Notes",
                "Flashcards",
                "Quizzes",
                "Planner",
                "Insights",
              ].includes(page) && (
                <label className="subject-filter">
                  <SlidersHorizontal size={15} />
                  <select
                    aria-label="Filter by subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    <option value="all">All subjects</option>
                    {s.subjects.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {preview && (
              <div className="notice">
                You’re trying Pro tools for free in this preview. This is not a
                paid subscription.
              </div>
            )}
            {selected && <p className="filter-note">Showing {selected.name}</p>}
            {(s.notes.some((n) => ["n1", "n2"].includes(n.id)) ||
              s.cards.some((c) => ["c1", "c2", "c3"].includes(c.id)) ||
              s.assignments.some((a) => ["a1", "a2", "a3"].includes(a.id))) && (
              <div className="sample-note">
                <BookOpen size={14} />
                <span>
                  Sample notes, cards and tasks are included to help you
                  explore. Replace them with your own, or clear the workspace in
                  Settings.
                </span>
              </div>
            )}
            {page !== "Focus" && (views[page] || views.Overview)}
            <div hidden={page !== "Focus"}>
              <Focus key={key} />
            </div>
          </main>
          <footer>
            Cramly study workspace.
            <span>Saved on this device</span>
          </footer>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss notification" onClick={() => notify("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {spec && <FormDialog spec={spec} close={() => form(null)} />}
    </Ctx.Provider>
  );
}
function FormDialog({ spec, close }: { spec: FormSpec; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={close}
      aria-labelledby="form-dialog-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          spec.save(
            Object.fromEntries(new FormData(e.currentTarget)) as Record<
              string,
              string
            >,
          );
          close();
        }}
      >
        <div className="section-head">
          <h2 id="form-dialog-title">{spec.title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {spec.description && <p className="muted">{spec.description}</p>}
        {spec.fields.map((f) => (
          <label key={f.name} className="field" htmlFor={"field-" + f.name}>
            {f.label}
            {f.options ? (
              <select
                id={"field-" + f.name}
                name={f.name}
                defaultValue={f.value}
                required={f.required !== false}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                id={"field-" + f.name}
                name={f.name}
                defaultValue={f.value}
                rows={5}
                required={f.required !== false}
              />
            ) : (
              <input
                id={"field-" + f.name}
                name={f.name}
                type={f.type || "text"}
                step={f.type === "number" ? "any" : undefined}
                defaultValue={f.value}
                min={f.min}
                max={f.max}
                required={f.required !== false}
              />
            )}
          </label>
        ))}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
function subjectField(s: State, value?: string): Field {
  return {
    name: "subject",
    label: "Subject",
    value: value || s.subjects[0]?.id,
    options: s.subjects.map((x) => ({ value: x.id, label: x.name })),
  };
}
function Overview({ name }: { name: string }) {
  const { s, set, go, form } = useApp();
  const minutes = s.sessions
    .filter((x) => x.date === today())
    .reduce((n, x) => n + x.minutes, 0);
  const tasks = s.assignments
    .filter((x) => !x.done)
    .sort((a, b) => a.due.localeCompare(b.due));
  const due = s.cards.filter((x) => x.due <= today()).length;
  const progress = Math.min(100, (minutes / s.goal) * 100);
  return (
    <>
      <div className="overview-layout">
        <div className="overview-main">
          <section className="welcome-card">
            <div>
              <span className="tiny-caps">Focus timer</span>
              <h2>
                One subject.
                <br />
                <em>One study session.</em>
              </h2>
              <p>
                Choose what to work on, set your timer and record the time
                toward your daily goal.
              </p>
              <button className="primary" onClick={() => go("Focus")}>
                <Play size={16} />
                Start a focus session
              </button>
            </div>
          </section>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-icon sage">
                <Clock size={18} />
              </span>
              <p>Study time today</p>
              <strong>
                {minutes}
                <small> min</small>
              </strong>
              <span>
                {Math.max(0, s.goal - minutes)} min to your daily goal
              </span>
            </div>
            <div className="stat">
              <span className="stat-icon peach">
                <Flame size={18} />
              </span>
              <p>Current streak</p>
              <strong>
                {streak(s.sessions)}
                <small> days</small>
              </strong>
              <span>Consecutive study days</span>
            </div>
            <div className="stat">
              <span className="stat-icon lavender">
                <Layers size={18} />
              </span>
              <p>Cards to review</p>
              <strong>
                {due}
                <small> cards</small>
              </strong>
              <button className="text-link" onClick={() => go("Flashcards")}>
                Keep them fresh <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
          <Section
            title="Your subjects"
            action={
              <button className="text-link" onClick={() => go("Subjects")}>
                View all <ArrowRight size={14} />
              </button>
            }
          >
            <div className="subject-grid">
              {s.subjects.slice(0, 3).map((x, i) => (
                <button
                  className={"subject-card " + x.color}
                  key={x.id}
                  onClick={() => go("Subjects")}
                >
                  <span className="subject-symbol">
                    {[<BookOpen />, <GraduationCap />, <NotebookPen />][i % 3]}
                  </span>
                  <h3>{x.name}</h3>
                  <p>
                    {s.notes.filter((n) => n.subject === x.id).length} notes ·{" "}
                    {s.cards.filter((c) => c.subject === x.id).length}{" "}
                    flashcards
                  </p>
                  <span className="subject-card-bottom">
                    {x.exam ? "Exam " + dateLabel(x.exam) : "Review your cards"}
                    <ArrowUpRight size={16} />
                  </span>
                </button>
              ))}
            </div>
            {!s.subjects.length && (
              <Empty
                title="Start with a subject"
                description="Give your notes and study sessions a home."
              />
            )}
          </Section>
          <Section
            title="Pick up where you left off"
            action={
              <button className="text-link" onClick={() => go("Notes")}>
                All notes <ArrowRight size={14} />
              </button>
            }
          >
            {s.notes
              .slice(-2)
              .reverse()
              .map((n) => (
                <button
                  className="note-row"
                  key={n.id}
                  onClick={() => go("Notes")}
                >
                  <span className="note-icon">
                    <NotebookPen size={20} />
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    <p>
                      {subjectName(s, n.subject)} <span>·</span> Updated{" "}
                      {dateLabel(n.updated)}
                    </p>
                  </div>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            {!s.notes.length && (
              <p className="muted">
                Add your first note to keep class material here.
              </p>
            )}
          </Section>
        </div>
        <div className="overview-aside">
          <Section title="Daily study goal" action={<Target size={19} />}>
            <div
              className="goal-circle"
              style={{ "--progress": progress + "%" } as React.CSSProperties}
            >
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="51" className="ring-track" />
                <circle
                  cx="60"
                  cy="60"
                  r="51"
                  className="ring-value"
                  strokeDasharray={`${progress * 3.205} 320.5`}
                />
              </svg>
              <div>
                <strong>
                  {Math.round(progress)}
                  <small>%</small>
                </strong>
                <span>of your daily goal</span>
              </div>
            </div>
            <p className="goal-copy">
              {minutes} of {s.goal} minutes completed.
            </p>
            <button
              className="wide"
              onClick={() =>
                form({
                  title: "Set your daily intention",
                  fields: [
                    {
                      name: "goal",
                      label: "Study minutes per day",
                      type: "number",
                      value: s.goal,
                      min: 1,
                      max: 1440,
                    },
                  ],
                  save: (d) => set((old) => ({ ...old, goal: Number(d.goal) })),
                })
              }
            >
              Adjust daily goal <ArrowUpRight size={14} />
            </button>
          </Section>
          <Section
            title="On your list"
            action={
              <button
                className="icon-button"
                aria-label="Open planner"
                onClick={() => go("Planner")}
              >
                <Plus size={18} />
              </button>
            }
          >
            <div className="task-list">
              {tasks.slice(0, 3).map((x) => (
                <div className="task" key={x.id}>
                  <button
                    className="check-box"
                    aria-label={"Complete " + x.title}
                    onClick={() =>
                      set((old) => ({
                        ...old,
                        assignments: old.assignments.map((a) =>
                          a.id === x.id ? { ...a, done: true } : a,
                        ),
                      }))
                    }
                  />
                  <div>
                    <strong>{x.title}</strong>
                    <p>
                      {subjectName(s, x.subject)} ·{" "}
                      <span className={x.due < today() ? "danger" : ""}>
                        {dateLabel(x.due)}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
              {!tasks.length && (
                <p className="muted">All clear. Take a well-earned breath.</p>
              )}
            </div>
            <button className="text-link" onClick={() => go("Planner")}>
              Open your planner <ArrowRight size={14} />
            </button>
          </Section>
          <div className="quote">
            <Star size={20} />
            <p>
              “You don’t have to be great to start. You have to start to be
              great.”
            </p>
            <span>A LITTLE REMINDER FOR TODAY</span>
          </div>
        </div>
      </div>
    </>
  );
}
function Subjects() {
  const { s, set, pro, form, notify } = useApp();
  function edit(sub?: Subject) {
    if (!sub && !pro && s.subjects.length >= 5) {
      notify(
        "Free includes up to 5 subjects. Explore Pro for unlimited subjects.",
      );
      return;
    }
    form({
      title: sub ? "Edit subject" : "A new subject",
      fields: [
        { name: "name", label: "Subject name", value: sub?.name },
        {
          name: "color",
          label: "Color",
          value: sub?.color || colors[s.subjects.length % colors.length],
          options: colors.map((x) => ({ value: x, label: x })),
        },
        {
          name: "exam",
          label: "Exam date (optional)",
          type: "date",
          required: false,
          value: sub?.exam,
        },
      ],
      save: (d) =>
        set((old) => ({
          ...old,
          subjects: sub
            ? old.subjects.map((x) => (x.id === sub.id ? { ...x, ...d } : x))
            : [
                ...old.subjects,
                { id: uid(), name: d.name, color: d.color, exam: d.exam },
              ],
        })),
    });
  }
  return (
    <>
      <div className="toolbar">
        <p className="muted">
          {s.subjects.length}{" "}
          {pro ? "subjects · unlimited with Pro" : "of 5 subjects on Free"}
        </p>
        <button className="primary" onClick={() => edit()}>
          <Plus size={16} />
          New subject
        </button>
      </div>
      <div className="subject-grid large">
        {s.subjects.map((x) => (
          <article className={"subject-card " + x.color} key={x.id}>
            <BookOpen size={24} />
            <h2>{x.name}</h2>
            <p>
              {s.notes.filter((n) => n.subject === x.id).length} notes ·{" "}
              {s.cards.filter((n) => n.subject === x.id).length} cards ·{" "}
              {s.quizzes.filter((n) => n.subject === x.id).length} quizzes
            </p>
            <p>{x.exam ? "Exam: " + dateLabel(x.exam) : "No exam scheduled"}</p>
            <div className="row">
              <button onClick={() => edit(x)}>Edit subject</button>
              <button
                className="icon-button"
                aria-label={"Delete " + x.name}
                onClick={() => {
                  if (
                    confirm(
                      "Delete " +
                        x.name +
                        " and its notes, cards, quizzes, grades, assignments and progress?",
                    )
                  )
                    set((old) => ({
                      ...old,
                      subjects: old.subjects.filter((a) => a.id !== x.id),
                      notes: old.notes.filter((a) => a.subject !== x.id),
                      cards: old.cards.filter((a) => a.subject !== x.id),
                      quizzes: old.quizzes.filter((a) => a.subject !== x.id),
                      attempts: old.attempts.filter((a) => a.subject !== x.id),
                      grades: old.grades.filter((a) => a.subject !== x.id),
                      assignments: old.assignments.filter(
                        (a) => a.subject !== x.id,
                      ),
                      mistakes: old.mistakes.filter((a) => a.subject !== x.id),
                      plans: old.plans.filter((a) => a.subject !== x.id),
                      guides: old.guides.filter((a) => a.subject !== x.id),
                    }));
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!s.subjects.length && (
        <Empty
          title="What are you learning?"
          description="Create your first subject to begin."
        />
      )}
    </>
  );
}
function Notes() {
  const { s, set, subject, form, pro, notify, makeSet, runAI, settings } =
    useApp();
  const [selected, select] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const notes = s.notes.filter(
    (n) =>
      (subject === "all" || n.subject === subject) &&
      [n.title, n.body].join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const note = notes.find((n) => n.id === selected) || notes[0];
  function create() {
    if (!s.subjects.length) {
      notify("Create a subject first.");
      return;
    }
    form({
      title: "A fresh page",
      fields: [
        { name: "title", label: "Note title" },
        subjectField(s, subject === "all" ? undefined : subject),
      ],
      save: (d) => {
        const id = uid();
        set((old) => ({
          ...old,
          notes: [
            ...old.notes,
            {
              id,
              title: d.title,
              subject: d.subject,
              body: "",
              updated: today(),
            },
          ],
        }));
        select(id);
      },
    });
  }
  async function ai(kind: string) {
    if (!note?.body.trim()) {
      notify("Write or upload some notes first.");
      return;
    }
    if (kind !== "quiz" && !pro) {
      notify("This tool is in Pro.");
      return;
    }
    setBusy(kind);
    try {
      if (kind === "quiz") await makeSet(note.body, note.subject, note.title);
      else {
        const result = await runAI(kind, note.body, "");
        const guide = {
          id: uid(),
          subject: note.subject,
          title:
            (kind === "summary" ? "Summary: " : "Study guide: ") + note.title,
          body: result,
          updated: today(),
        };
        set((old) => ({ ...old, guides: [...old.guides, guide] }));
        notify("Saved to Study guides in AI studio.");
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!note) {
      notify("Create a note first.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify("Choose a file under 10 MB.");
      return;
    }
    setBusy("upload");
    try {
      let body = "";
      if (file.name.toLowerCase().endsWith(".pdf")) {
        if (!pro) throw Error("PDF and textbook upload requires Pro.");
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
          .promise;
        if (doc.numPages > 200) throw Error("Choose a PDF of up to 200 pages.");
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          body += content.items.map((x: any) => x.str || "").join(" ") + "\n\n";
        }
        await doc.destroy();
        if (!body.trim())
          throw Error(
            "This PDF has no selectable text. OCR scans are not supported.",
          );
      } else if (/\.(txt|md)$/i.test(file.name)) {
        body = await file.text();
      } else throw Error("Choose a .txt, .md or .pdf file.");
      if (body.length > 150000)
        throw Error(
          "This file is too long. Import a chapter under 150,000 characters.",
        );
      set((old) => ({
        ...old,
        notes: old.notes.map((n) =>
          n.id === note.id
            ? {
                ...n,
                body: n.body + (n.body ? "\n\n" : "") + body,
                updated: today(),
              }
            : n,
        ),
      }));
      notify("File added to your note.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search notes"
            placeholder="Find a thought…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="primary" onClick={create}>
          <Plus size={16} />
          New note
        </button>
      </div>
      <div className="notes-layout">
        <div className="note-list">
          {notes.map((n) => (
            <button
              key={n.id}
              className={
                note?.id === n.id ? "note-list-item selected" : "note-list-item"
              }
              onClick={() => select(n.id)}
            >
              <Tag color={s.subjects.find((x) => x.id === n.subject)?.color}>
                {subjectName(s, n.subject)}
              </Tag>
              <h3>{n.title}</h3>
              <p>
                {n.body.slice(0, 90) ||
                  "A fresh page, ready for your thoughts."}
              </p>
              <small>{dateLabel(n.updated)}</small>
            </button>
          ))}
          {!notes.length && <p className="muted">No notes found.</p>}
        </div>
        {note ? (
          <section className="note-editor panel">
            <div className="section-head">
              <Tag color={s.subjects.find((x) => x.id === note.subject)?.color}>
                {subjectName(s, note.subject)}
              </Tag>
              <span className="muted small">Saved on this device</span>
            </div>
            <input
              className="note-title"
              aria-label="Note title"
              value={note.title}
              onChange={(e) =>
                set((old) => ({
                  ...old,
                  notes: old.notes.map((n) =>
                    n.id === note.id
                      ? { ...n, title: e.target.value, updated: today() }
                      : n,
                  ),
                }))
              }
            />
            <textarea
              className="note-body"
              aria-label="Note content"
              placeholder="Start with what you know. The rest will follow."
              value={note.body}
              onChange={(e) =>
                set((old) => ({
                  ...old,
                  notes: old.notes.map((n) =>
                    n.id === note.id
                      ? { ...n, body: e.target.value, updated: today() }
                      : n,
                  ),
                }))
              }
            />
            <div className="note-tools">
              <label className="button">
                <Upload size={15} />
                {busy === "upload" ? "Reading…" : "Import file"}
                <input
                  type="file"
                  hidden
                  accept=".txt,.md,.pdf"
                  disabled={!!busy}
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button disabled={!!busy} onClick={() => ai("quiz")}>
                <Layers size={15} />
                {busy === "quiz" ? "Creating…" : "Make study set"}
              </button>
              <button disabled={!!busy} onClick={() => ai("summary")}>
                {!pro && <Lock size={13} />}Summarize
              </button>
              <button disabled={!!busy} onClick={() => ai("guide")}>
                {!pro && <Lock size={13} />}Study guide
              </button>
              <button
                className="icon-button"
                aria-label="Export note"
                onClick={() =>
                  pro
                    ? downloadNote(note)
                    : notify("Exporting notes requires Pro.")
                }
              >
                <Download size={16} />
              </button>
              <button
                className="icon-button danger"
                aria-label="Delete note"
                onClick={() => {
                  if (confirm("Delete this note?"))
                    set((old) => ({
                      ...old,
                      notes: old.notes.filter((n) => n.id !== note.id),
                    }));
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <p className="muted small">
              {note.body.length.toLocaleString()} characters · Cloud generation
              sends up to 60,000 characters to {settingsLabel(settings)}. AI can
              make mistakes.
            </p>
          </section>
        ) : (
          <Empty
            title="A space for your ideas"
            description="Create a note or change your search to get started."
            action={<button onClick={create}>New note</button>}
          />
        )}
      </div>
    </>
  );
}
function settingsLabel(settings: AISettings) {
  return settings.provider === "offline"
    ? "the local generator (no upload)"
    : settings.provider === "gemini"
      ? "Google Gemini"
      : "Pollinations";
}
function TypingIndicator({ label = "Cramly is typing" }: { label?: string }) {
  return (
    <div
      className="chat-message assistant typing-indicator"
      role="status"
      aria-label={label}
    >
      <strong aria-hidden="true">Cramly</strong>
      <span className="typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
function Studio() {
  const { s, set, subject, pro, notify, runAI, makeSet, usage, settings } =
    useApp();
  const [tool, setTool] = useState("tutor");
  const [noteId, setNoteId] = useState("");
  const [message, setMessage] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);
  const chatLog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatLog.current)
      chatLog.current.scrollTop = chatLog.current.scrollHeight;
  }, [busy, chat, tool]);
  const notes = s.notes.filter(
    (n) => subject === "all" || n.subject === subject,
  );
  const note = notes.find((n) => n.id === noteId) || notes[0];
  const weak = mastery(s.attempts)
    .filter((t) => t.value < 70)
    .map((t) => t.topic);
  const tools = [
    ["tutor", "AI tutor", MessageCircle],
    ["guide", "Study guides", BookOpen],
    ["summary", "Summarize notes", NotebookPen],
    ["essay", "Essay reviewer", GraduationCap],
    ["practice", "Personalized practice", Brain],
  ] as const;
  async function run() {
    if (busy) return;
    if (!pro && tool !== "tutor") {
      notify("This tool requires Pro.");
      return;
    }
    if (["guide", "summary", "practice"].includes(tool) && !note?.body.trim()) {
      notify("Select a note with study material first.");
      return;
    }
    if (["tutor", "essay"].includes(tool) && !message.trim()) {
      notify(
        tool === "essay"
          ? "Paste your essay to review."
          : "Ask a question to begin.",
      );
      return;
    }
    setBusy(true);
    setOutput("");
    try {
      if (tool === "practice") {
        await makeSet(
          note!.body,
          note!.subject,
          "Personalized: " + note!.title,
          true,
        );
      } else {
        const history =
          tool === "tutor"
            ? chat
                .slice(-8)
                .map((c) => c.role + ": " + c.text)
                .join("\n")
            : "";
        const context =
          (tool === "essay" ? "" : note?.body || "") +
          (pro ? "\nStudent weak topics: " + weak.join(", ") : "") +
          "\nRecent conversation:\n" +
          history;
        const answer = await runAI(tool, context, message);
        if (tool === "tutor") {
          setChat((c) => [
            ...c,
            { role: "You", text: message },
            { role: "Cramly", text: answer },
          ]);
          setMessage("");
        } else {
          setOutput(answer);
          if (tool === "guide" || tool === "summary")
            set((old) => ({
              ...old,
              guides: [
                ...old.guides,
                {
                  id: uid(),
                  subject: note!.subject,
                  title:
                    (tool === "summary" ? "Summary: " : "Study guide: ") +
                    note!.title,
                  body: answer,
                  updated: today(),
                },
              ],
            }));
        }
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="studio-tools">
        {tools.map(([id, label, Icon]) => (
          <button
            key={id}
            className={tool === id ? "selected" : ""}
            onClick={() => {
              setTool(id);
              setOutput("");
            }}
          >
            <Icon size={19} />
            {label}
            {id !== "tutor" && !pro && <Lock size={13} />}
          </button>
        ))}
      </div>
      <div className="studio-layout">
        <Section
          title={tools.find((t) => t[0] === tool)?.[1] || "AI tutor"}
          action={
            <Tag color="lavender">
              {pro ? "Advanced tools" : "10 messages / day"}
            </Tag>
          }
        >
          {tool === "tutor" || pro ? (
            <>
              <label className="field">
                Study context
                <select
                  value={note?.id || ""}
                  onChange={(e) => setNoteId(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a note
                  </option>
                  {notes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">
                {settingsLabel(settings)} receives the notes and text you
                submit. Avoid private information; check AI answers against your
                sources.
              </p>
              {tool === "tutor" && (
                <div className="chat-log" aria-live="polite" ref={chatLog}>
                  {!chat.length && !busy && (
                    <div className="tutor-welcome">
                      <span className="tutor-icon">
                        <MessageCircle size={25} />
                      </span>
                      <h2>What do you want to understand?</h2>
                      <p>
                        Ask for a clearer explanation, a worked example, or a
                        hint to help you get unstuck.
                      </p>
                      <div className="row wrap center">
                        {[
                          "Explain the key ideas simply",
                          "Test my understanding",
                          "Walk me through an example",
                        ].map((t) => (
                          <button key={t} onClick={() => setMessage(t)}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chat.map((c, i) => (
                    <div
                      key={i}
                      className={
                        "chat-message " +
                        (c.role === "You" ? "user" : "assistant")
                      }
                    >
                      <strong>{c.role}</strong>
                      <p>{c.text}</p>
                    </div>
                  ))}
                  {busy && <TypingIndicator />}
                </div>
              )}
              {tool === "practice" && (
                <div className="answer-block">
                  <h3>Practice that meets you where you are.</h3>
                  <p>
                    Your recent scores set foundational, standard or advanced
                    difficulty. Topics under 70% receive extra attention.
                  </p>
                  <p>
                    {weak.length
                      ? "Topics to revisit: " + weak.join(", ")
                      : "Complete a quiz to identify weak topics, or start with standard practice."}
                  </p>
                </div>
              )}
              {(tool === "tutor" || tool === "essay") && (
                <label className="field">
                  {tool === "essay"
                    ? "Your essay"
                    : "What are you working through?"}
                  <textarea
                    rows={tool === "essay" ? 12 : 3}
                    value={message}
                    maxLength={12000}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      tool === "essay"
                        ? "Paste your draft here…"
                        : "Ask about a concept or paste a question…"
                    }
                  />
                </label>
              )}
              <div className="toolbar">
                <span className="muted small">
                  {remaining(usage, tool === "practice" ? "quiz" : tool, pro)}{" "}
                  {tool === "tutor" ? "messages" : "requests"} left today
                </span>
                <button className="primary" disabled={busy} onClick={run}>
                  <MessageCircle size={16} />
                  {tool === "tutor"
                    ? "Send message"
                    : tool === "practice"
                      ? "Create practice"
                      : tool === "essay"
                        ? "Review essay"
                        : tool === "summary"
                          ? "Summarize note"
                          : "Create study guide"}
                </button>
              </div>
              {output && (
                <div className="ai-output" aria-live="polite">
                  {output}
                </div>
              )}
              {busy && tool !== "tutor" && (
                <TypingIndicator label="Cramly is preparing your response" />
              )}
            </>
          ) : (
            <ProGate title="Study guides and review tools with Pro">
              <span />
            </ProGate>
          )}
        </Section>
        <div>
          <Section title="Using AI with your notes">
            <div className="tip">
              <NotebookPen size={20} />
              <p>
                <strong>Start with your own notes.</strong> The best answers
                begin with your class material.
              </p>
            </div>
            <div className="tip">
              <MessageCircle size={20} />
              <p>
                <strong>Ask a follow-up.</strong> Tell your tutor what’s still
                unclear.
              </p>
            </div>
            <div className="tip">
              <Check size={20} />
              <p>
                <strong>Stay curious.</strong> AI can be wrong. Your sources
                come first.
              </p>
            </div>
          </Section>
          <div className="notice small">
            {pro
              ? "Pro fair use: 100 quiz generations, 300 tutor messages and 100 requests per other tool daily. Pro requests go first in this browser’s processing queue."
              : "Free: 5 AI study sets and 10 tutor messages daily. Local generation does not use your AI allowance."}
          </div>
        </div>
      </div>
      <Section
        title="Your study guides"
        action={<Tag color="lavender">Pro</Tag>}
      >
        <ProGate>
          {s.guides
            .filter((g) => subject === "all" || g.subject === subject)
            .map((g) => (
              <details className="guide" key={g.id}>
                <summary>
                  {g.title}
                  <span>
                    {subjectName(s, g.subject)} · {dateLabel(g.updated)}
                  </span>
                </summary>
                <div className="ai-output">{g.body}</div>
                <div className="row">
                  <button onClick={() => downloadNote(g)}>
                    <Download size={15} />
                    Export guide
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Delete " + g.title}
                    onClick={() =>
                      set((old) => ({
                        ...old,
                        guides: old.guides.filter((x) => x.id !== g.id),
                      }))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </details>
            ))}
          {!s.guides.length && (
            <p className="muted">
              Your generated guides and summaries will be saved here.
            </p>
          )}
        </ProGate>
      </Section>
    </>
  );
}
const freeFeatures = [
  "Dashboard and study overview",
  "Up to 5 subjects",
  "Notes editor",
  "Basic flashcards (up to 100)",
  "Manual quiz creation",
  "5 AI quiz generations per day",
  "Basic AI tutor (10 messages/day)",
  "Pomodoro timer",
  "Daily study goals and streaks",
  "Calendar, planner and assignments",
  "Grade calculator and progress tracking",
  "Light and dark themes",
  "Mistake bank",
];
const proFeatures = [
  "Unlimited subjects and flashcards",
  "AI quiz generation (100/day fair use)",
  "Advanced AI tutor (300 messages/day)",
  "PDF and textbook uploads",
  "AI study guides and note summaries",
  "AI essay reviewer",
  "Personalized practice questions",
  "Adaptive quiz difficulty",
  "Advanced spaced repetition",
  "Exam simulator",
  "Detailed learning analytics",
  "Topic mastery and knowledge maps",
  "Grade predictions",
  "Automatic revision scheduling",
  "Custom study plans",
  "Export notes, guides and flashcards",
  "Priority in-browser AI queue",
];
function Plans({
  access,
  setAccess,
}: {
  access: any;
  setAccess: (v: any) => void;
}) {
  const { pro, preview, setPreview, notify } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isPro(access))
        throw Error("Pro is already active. Keep your code for renewal.");
      if (!code.trim().startsWith("CRAMLY-PRO-"))
        throw Error("Use a code generated in the admin dashboard.");
      const result = await securityRequest("redeem", { code: code.trim() });
      setAccess(result.access);
      setCode("");
      try {
        localStorage.setItem("cramly:access", JSON.stringify(result.access));
      } catch {
        /* The server cookie restores this grant on reload. */
      }
      notify("Pro unlocked for " + result.days + " days on this browser.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="pricing-intro">
        <span className="tiny-caps">Free and Pro</span>
        <h2>
          Your study tools,
          <br />
          <em>with or without Pro.</em>
        </h2>
        <p>Keep the essentials free or compare the additional Pro tools.</p>
      </div>
      <div className="pricing-grid">
        <section className="pricing-card">
          <Tag>Free forever</Tag>
          <h2>Free</h2>
          <div className="price">
            $0<span>/ forever</span>
          </div>
          <p>Everything needed to study and stay organized.</p>
          <button className="wide" disabled={!pro}>
            {!pro ? "Your current plan" : "Always here for you"}
          </button>
          <ul>
            {freeFeatures.map((f) => (
              <li key={f}>
                <Check size={15} />
                {f}
              </li>
            ))}
          </ul>
        </section>
        <section className="pricing-card pro-price">
          <Tag color="peach">A more personal way to learn</Tag>
          <h2>Cramly Pro</h2>
          <div className="price">
            $5.99<span>/ month</span>
          </div>
          <p>For students who want a personalized learning experience.</p>
          <button className="primary wide" disabled>
            {pro
              ? preview
                ? "Trying Pro tools"
                : "Pro active"
              : "Subscriptions coming soon"}
          </button>
          <p className="muted small">
            No automatic billing is connected. No charge will be made here.
            Activate Pro with a code from the site owner.
          </p>
          <strong>Everything in Free, plus:</strong>
          <ul>
            {proFeatures.map((f) => (
              <li key={f}>
                <Check size={15} />
                {f}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="grid-two">
        <Section title="Already have an access code?">
          <form onSubmit={unlock}>
            <label className="field">
              Your Cramly code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CRAMLY-…"
                autoComplete="off"
                autoCapitalize="characters"
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Checking…" : "Unlock Pro"}
            </button>
          </form>
          {isPro(access) && (
            <p className="muted">
              Active until {new Date(access.expiresAt).toLocaleDateString()} on
              this browser.
            </p>
          )}
        </Section>
        <Section title="A note about this version">
          <p className="muted">
            Your workspace, daily allowances and access codes are stored on this
            browser. Google sign-in separates workspaces on this device; it does
            not sync them. Browser-local plan limits are not secure subscription
            enforcement.
          </p>
          <p className="muted small">
            New admin-generated codes are verified by the server and saved in an
            HttpOnly browser cookie. They are shareable until their activation
            deadline, not single-use purchase licenses.
          </p>
          {import.meta.env.VITE_ENABLE_PRO_PREVIEW === "true" && (
            <button
              onClick={() => {
                setPreview(!preview);
                notify(
                  preview
                    ? "Back to Free. Extra content is retained."
                    : "Pro preview enabled. No purchase or payment required.",
                );
              }}
            >
              {preview ? "End Pro preview" : "Try Pro tools in this preview"}
              <ArrowRight size={16} />
            </button>
          )}
          <p className="muted small">
            Cloud tools depend on provider availability and their own limits.
            Priority applies to this browser’s queue, not the provider’s
            infrastructure.
          </p>
        </Section>
      </div>
    </>
  );
}
function Preferences() {
  const { s, set, settings, setSettings, form, notify, pro } = useApp();
  const [keyDraft, setKeyDraft] = useState(settings.geminiKey);
  function importLegacy() {
    const old = legacy();
    if (!old.decks?.length) {
      notify("No saved classic decks found on this browser.");
      return;
    }
    if (!s.subjects.length) {
      notify("Create a subject first.");
      return;
    }
    const id = s.subjects[0].id;
    const cards: Card[] = old.decks.flatMap(
      (d: any) =>
        d.flashcards?.map((c: any) => ({
          id: uid(),
          subject: id,
          front: c.front,
          back: c.back,
          due: today(),
          interval: 0,
          reviews: 0,
        })) || [],
    );
    const quizzes: Quiz[] = old.decks
      .filter((d: any) => d.quiz?.length)
      .map((d: any) => ({
        id: uid(),
        subject: id,
        title: d.title || "Imported study set",
        questions: d.quiz.map((q: any) => ({
          id: uid(),
          prompt: q.question,
          options: q.choices,
          answer: q.answerIndex,
          explanation: q.explanation,
          topic: d.title || "Imported",
        })),
      }));
    set((old) => ({
      ...old,
      cards: [
        ...old.cards,
        ...(pro ? cards : cards.slice(0, Math.max(0, 100 - old.cards.length))),
      ],
      quizzes: [...old.quizzes, ...quizzes],
    }));
    notify(
      "Classic decks copied to " +
        s.subjects[0].name +
        ". Originals are unchanged. Import once to avoid duplicates.",
    );
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Choose a backup under 20 MB.");
      const parsed = JSON.parse(await file.text());
      if (!validState(parsed))
        throw Error("This is not a Cramly workspace backup.");
      if (!pro && (parsed.subjects.length > 5 || parsed.cards.length > 100))
        throw Error(
          "This backup exceeds Free limits. Unlock Pro to restore it.",
        );
      if (
        confirm(
          "Replace this account’s workspace on this device with the backup?",
        )
      ) {
        set(() => parsed);
        notify("Backup restored.");
      }
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="settings-layout">
      <Section title="Make yourself at home">
        <div className="row admin-actions">
          <a className="text-link" href="/admin">
            Admin dashboard <ArrowUpRight size={15} />
          </a>
          <button onClick={() => lockWebsite().catch((e) => notify(e.message))}>
            <Lock size={15} />
            Lock website
          </button>
        </div>
        <label className="field">
          What should we call you?
          <input
            value={s.name}
            maxLength={40}
            onChange={(e) => set((old) => ({ ...old, name: e.target.value }))}
          />
        </label>
        <label className="field">
          Your daily study intention (minutes)
          <input
            type="number"
            min="1"
            max="1440"
            value={s.goal}
            onChange={(e) =>
              set((old) => ({
                ...old,
                goal: Math.max(1, Math.min(1440, Number(e.target.value))),
              }))
            }
          />
        </label>
        <div className="field">
          Appearance
          <div className="segmented">
            <button
              className={s.theme === "light" ? "selected" : ""}
              onClick={() => set((old) => ({ ...old, theme: "light" }))}
            >
              Light
            </button>
            <button
              className={s.theme === "dark" ? "selected" : ""}
              onClick={() => set((old) => ({ ...old, theme: "dark" }))}
            >
              Dark
            </button>
          </div>
        </div>
        <p className="muted small">
          The starter workspace includes sample Biology, Mathematics and
          Literature content. Delete or replace it as you make Cramly your own.
        </p>
      </Section>
      <Section title="AI, on your terms">
        <label className="field">
          Generation provider
          <select
            value={settings.provider}
            onChange={(e) =>
              setSettings({
                ...settings,
                provider: e.target.value as AISettings["provider"],
              })
            }
          >
            <option value="pollinations">Pollinations · no key needed</option>
            <option value="gemini">Google Gemini · your own key</option>
            <option value="offline">Local · no cloud, study sets only</option>
          </select>
        </label>
        {settings.provider === "gemini" && (
          <>
            <label className="field">
              Gemini API key
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                setSettings({ ...settings, geminiKey: keyDraft.trim() });
                notify(
                  keyDraft.trim()
                    ? "Key saved in this browser."
                    : "Key removed.",
                );
              }}
            >
              Save key
            </button>
            <p className="muted small">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
              >
                Get a Gemini API key
              </a>
              . It is saved in local storage on this browser. Don’t save one on
              a shared device; clear the field and save to remove it.
            </p>
          </>
        )}
        <p className="muted">
          Cloud tools send your submitted material to your selected provider.
          Choose Local for private, rule-based flashcard and quiz generation
          without AI. Text tutoring and Pro AI tools need a cloud provider.
        </p>
      </Section>
      <Section title="Your work stays yours">
        <p className="muted">
          Workspaces are stored locally, separated by Google account on this
          device. They are not synced or backed up in the cloud. Clearing
          browser data removes your work and Pro access. Export a backup
          regularly.
        </p>
        <div className="row wrap">
          <button
            onClick={() =>
              saveFile(
                "cramly-backup-" + today() + ".json",
                JSON.stringify(s, null, 2),
                "application/json",
              )
            }
          >
            <Download size={15} />
            Backup workspace
          </button>
          <label className="button">
            <Upload size={15} />
            Restore backup
            <input
              hidden
              type="file"
              accept=".json"
              onChange={(e) => {
                importBackup(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={importLegacy}>Import classic decks</button>
        </div>
        <p className="muted small">
          A full data backup is free. Formatted note, guide and card exports are
          Pro tools. Backups do not include API keys or Pro access codes.
        </p>
        <a href="/index.html">Open classic Cramly</a>
      </Section>
      <Section title="Add Cramly to your iPhone">
        <ol className="install-steps">
          <li>Open Cramly in Safari.</li>
          <li>Tap Share, then “Add to Home Screen”.</li>
          <li>Tap Add. Your study space is one tap away.</li>
        </ol>
        <p className="muted small">
          An internet connection is needed to load Cramly and use cloud tools.
          Offline installation is not supported.
        </p>
      </Section>
      <Section title="A fresh start">
        <p className="muted">
          Remove this workspace’s content and start empty. Your account, API
          settings and access code are unchanged.
        </p>
        <button
          className="danger"
          onClick={() => {
            if (
              confirm(
                "Delete all notes, cards, quizzes, grades and progress in this workspace? Export a backup first.",
              )
            ) {
              set(() => ({
                ...initialState(),
                name: s.name,
                theme: s.theme,
                subjects: [],
                notes: [],
                cards: [],
                quizzes: [],
                assignments: [],
                sessions: [],
                grades: [],
                mistakes: [],
                attempts: [],
                plans: [],
                guides: [],
              }));
              notify("A fresh page. Add a subject to begin.");
            }
          }}
        >
          Clear this workspace
        </button>
      </Section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  location.pathname.replace(/\/$/, "") === "/admin" ? <Admin /> : <App />,
);
function Flashcards() {
  const { s, set, subject, pro, form, notify } = useApp();
  const [flipped, flip] = useState(false);
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState(false);
  const cards = s.cards.filter(
    (c) =>
      (subject === "all" || c.subject === subject) && (all || c.due <= today()),
  );
  const card = cards[index % Math.max(1, cards.length)];
  useEffect(() => {
    setIndex(0);
    flip(false);
  }, [subject, all]);
  function create(c?: Card) {
    if (!s.subjects.length) {
      notify("Add a subject first.");
      return;
    }
    if (!c && !pro && s.cards.length >= 100) {
      notify("Free includes up to 100 flashcards.");
      return;
    }
    form({
      title: c ? "Edit flashcard" : "A new flashcard",
      fields: [
        subjectField(
          s,
          c?.subject || (subject === "all" ? undefined : subject),
        ),
        {
          name: "front",
          label: "Question or front",
          type: "textarea",
          value: c?.front,
        },
        {
          name: "back",
          label: "Answer or back",
          type: "textarea",
          value: c?.back,
        },
      ],
      save: (d) =>
        set((old) => ({
          ...old,
          cards: c
            ? old.cards.map((x) => (x.id === c.id ? { ...x, ...d } : x))
            : [
                ...old.cards,
                {
                  id: uid(),
                  subject: d.subject,
                  front: d.front,
                  back: d.back,
                  due: today(),
                  interval: 0,
                  reviews: 0,
                },
              ],
        })),
    });
  }
  function rate(rating: string) {
    if (!card) return;
    const interval = nextReview(card.interval, rating, pro);
    set((old) => ({
      ...old,
      cards: old.cards.map((x) =>
        x.id === card.id
          ? { ...x, interval, due: dateIn(interval), reviews: x.reviews + 1 }
          : x,
      ),
    }));
    if (rating === "again") setIndex((i) => i + 1);
    flip(false);
  }
  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={!all ? "selected" : ""}
            onClick={() => setAll(false)}
          >
            Due now
          </button>
          <button
            className={all ? "selected" : ""}
            onClick={() => setAll(true)}
          >
            All cards
          </button>
        </div>
        <div className="row">
          <button
            onClick={() =>
              pro
                ? saveFile(
                    "cramly-cards.csv",
                    exportCSV(
                      s.cards.filter(
                        (c) => subject === "all" || c.subject === subject,
                      ),
                    ),
                    "text/csv",
                  )
                : notify("CSV export is a Pro feature.")
            }
          >
            <Download size={15} />
            Export
          </button>
          <button className="primary" onClick={() => create()}>
            <Plus size={16} />
            New card
          </button>
        </div>
      </div>
      <div className="study-center">
        <div className="study-top">
          <Tag>
            {cards.length} {all ? "cards" : "due for review"}
          </Tag>
          <span className="muted">
            {pro ? "Advanced spaced repetition" : "Basic daily review"}
          </span>
        </div>
        {card ? (
          <>
            <button
              className={"flashcard " + (flipped ? "flipped" : "")}
              onClick={() => flip(!flipped)}
              aria-label={flipped ? "Show question" : "Reveal answer"}
            >
              <span className="tiny-caps">
                {subjectName(s, card.subject)} ·{" "}
                {flipped ? "THE ANSWER" : "A LITTLE RETRIEVAL PRACTICE"}
              </span>
              <h2>{flipped ? card.back : card.front}</h2>
              <p>
                {flipped
                  ? "How well did you remember?"
                  : "Think it through, then tap to reveal."}
              </p>
              <RotateCcw size={18} />
            </button>
            {flipped ? (
              <div className="rating-row">
                {["again", "hard", "good", "easy"].map((r) => (
                  <button
                    key={r}
                    className={r === "good" ? "primary" : ""}
                    onClick={() => rate(r)}
                  >
                    {r[0].toUpperCase() + r.slice(1)}
                    <small>
                      {nextReview(card.interval, r, pro) === 0
                        ? "Today"
                        : nextReview(card.interval, r, pro) + "d"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <button className="primary wide" onClick={() => flip(true)}>
                Reveal answer
              </button>
            )}
            <div className="toolbar">
              <button
                onClick={() => {
                  setIndex((i) => (i + cards.length - 1) % cards.length);
                  flip(false);
                }}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button onClick={() => create(card)}>Edit card</button>
              <button
                onClick={() => {
                  setIndex((i) => i + 1);
                  flip(false);
                }}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              className="text-link danger"
              onClick={() => {
                if (confirm("Delete this card?"))
                  set((old) => ({
                    ...old,
                    cards: old.cards.filter((x) => x.id !== card.id),
                  }));
              }}
            >
              Delete this card
            </button>
          </>
        ) : (
          <Empty
            title={all ? "Your next lightbulb moment" : "All caught up"}
            description={
              all
                ? "Add a flashcard, or make a study set from your notes."
                : "No cards are due. Come back tomorrow, or review all cards."
            }
            action={
              <button onClick={() => (all ? create() : setAll(true))}>
                {all ? "New card" : "Browse all cards"}
              </button>
            }
          />
        )}
      </div>
    </>
  );
}
function Quizzes() {
  const { s, set, subject, pro, form, notify } = useApp();
  const [active, setActive] = useState<{
    quiz: Quiz;
    exam: boolean;
    minutes: number;
  } | null>(null);
  const [result, setResult] = useState<{ right: number; total: number } | null>(
    null,
  );
  const [adaptive, setAdaptive] = useState(false);
  const quizzes = s.quizzes.filter(
    (x) => subject === "all" || x.subject === subject,
  );
  function questionForm(quiz?: Quiz) {
    if (!s.subjects.length) {
      notify("Create a subject first.");
      return;
    }
    form({
      title: quiz ? "Add a question" : "Create a manual quiz",
      fields: [
        ...(!quiz
          ? [
              { name: "title", label: "Quiz title" },
              subjectField(s, subject === "all" ? undefined : subject),
            ]
          : []),
        { name: "prompt", label: "Question", type: "textarea" },
        ...["a", "b", "c", "d"].map((x, i) => ({
          name: x,
          label: "Option " + (i + 1),
        })),
        {
          name: "answer",
          label: "Correct answer",
          options: [0, 1, 2, 3].map((i) => ({
            value: String(i),
            label: "Option " + (i + 1),
          })),
        },
        { name: "explanation", label: "Explanation", type: "textarea" },
        { name: "topic", label: "Topic" },
      ],
      save: (d) => {
        const q: Question = {
          id: uid(),
          prompt: d.prompt,
          options: [d.a, d.b, d.c, d.d],
          answer: Number(d.answer),
          explanation: d.explanation,
          topic: d.topic,
        };
        set((old) => ({
          ...old,
          quizzes: quiz
            ? old.quizzes.map((x) =>
                x.id === quiz.id ? { ...x, questions: [...x.questions, q] } : x,
              )
            : [
                ...old.quizzes,
                {
                  id: uid(),
                  title: d.title,
                  subject: d.subject,
                  questions: [q],
                },
              ],
        }));
      },
    });
  }
  function start(quiz: Quiz, exam = false, minutes = 10) {
    const rates = mastery(s.attempts);
    const questions =
      adaptive && pro
        ? [...quiz.questions].sort(
            (a, b) =>
              (rates.find((t) => t.topic === a.topic)?.value ?? 50) -
              (rates.find((t) => t.topic === b.topic)?.value ?? 50),
          )
        : quiz.questions;
    setResult(null);
    setActive({ quiz: { ...quiz, questions }, exam, minutes });
  }
  function complete(quiz: Quiz, answers: (number | null)[]) {
    const right = quiz.questions.reduce(
      (n, q, i) => n + Number(q.answer === answers[i]),
      0,
    );
    const wrong = quiz.questions.flatMap((q, i) =>
      q.answer === answers[i]
        ? []
        : [
            {
              id: uid(),
              subject: quiz.subject,
              question: q.prompt,
              answer: q.options[q.answer],
              explanation: q.explanation,
              resolved: false,
            },
          ],
    );
    set((old) => ({
      ...old,
      attempts: [
        ...old.attempts,
        {
          id: uid(),
          quiz: quiz.id,
          subject: quiz.subject,
          date: today(),
          correct: right,
          total: quiz.questions.length,
          topics: quiz.questions.map((q, i) => ({
            topic: q.topic,
            correct: q.answer === answers[i],
          })),
        },
      ],
      mistakes: [
        ...old.mistakes,
        ...wrong.filter(
          (w) =>
            !old.mistakes.some((x) => x.question === w.question && !x.resolved),
        ),
      ],
    }));
    setResult({ right, total: quiz.questions.length });
    setActive(null);
  }
  if (active)
    return (
      <QuizRunner
        key={active.quiz.id + String(active.exam)}
        {...active}
        finish={(answers) => complete(active.quiz, answers)}
        cancel={() => {
          if (confirm("Leave this quiz? Your answers will not be saved."))
            setActive(null);
        }}
      />
    );
  return (
    <>
      <div className="toolbar">
        <div className="row">
          <button
            onClick={() =>
              pro
                ? setAdaptive(!adaptive)
                : notify("Adaptive practice is in Pro.")
            }
          >
            <Zap size={15} />
            {adaptive && pro ? "Weak topics first" : "Adaptive order"}
            {!pro && <Lock size={12} />}
          </button>
          <button
            onClick={() => {
              if (!pro) {
                notify("The exam simulator is a Pro feature.");
                return;
              }
              if (!quizzes.length) {
                notify("Create a quiz first.");
                return;
              }
              form({
                title: "Set up your exam",
                fields: [
                  {
                    name: "quiz",
                    label: "Question bank",
                    options: quizzes.map((q) => ({
                      value: q.id,
                      label:
                        q.title + " · " + q.questions.length + " questions",
                    })),
                  },
                  {
                    name: "minutes",
                    label: "Time limit in minutes",
                    type: "number",
                    value: 10,
                    min: 1,
                    max: 180,
                  },
                ],
                save: (d) =>
                  start(
                    quizzes.find((x) => x.id === d.quiz)!,
                    true,
                    Number(d.minutes),
                  ),
              });
            }}
          >
            <Clock size={15} />
            Exam simulator{!pro && <Lock size={12} />}
          </button>
        </div>
        <button className="primary" onClick={() => questionForm()}>
          <Plus size={16} />
          Create quiz
        </button>
      </div>
      {result && (
        <div className="result-banner">
          <GraduationCap size={30} />
          <div>
            <h2>
              {result.right} / {result.total} ·{" "}
              {Math.round((result.right / result.total) * 100)}%
            </h2>
            <p>
              Progress, not perfection. Missed questions are saved in your
              mistake bank.
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss results"
            onClick={() => setResult(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <div className="grid-two">
        {quizzes.map((q) => (
          <Section
            key={q.id}
            title={q.title}
            action={
              <Tag color={s.subjects.find((x) => x.id === q.subject)?.color}>
                {subjectName(s, q.subject)}
              </Tag>
            }
          >
            <p className="muted">
              {q.questions.length} questions ·{" "}
              {s.attempts.filter((a) => a.quiz === q.id).length} attempts
            </p>
            <div className="quiz-topics">
              {[...new Set(q.questions.map((x) => x.topic))]
                .slice(0, 3)
                .map((t) => (
                  <span key={t}>{t}</span>
                ))}
            </div>
            <div className="row">
              <button className="primary" onClick={() => start(q)}>
                Start practice <ArrowRight size={16} />
              </button>
              <button onClick={() => questionForm(q)}>Add question</button>
              <button
                className="icon-button"
                aria-label={"Delete " + q.title}
                onClick={() => {
                  if (
                    confirm("Delete this quiz? Previous results will remain.")
                  )
                    set((old) => ({
                      ...old,
                      quizzes: old.quizzes.filter((x) => x.id !== q.id),
                    }));
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </Section>
        ))}
      </div>
      {!quizzes.length && (
        <Empty
          title="See what’s sticking"
          description="Create a manual quiz or make a study set from your notes."
        />
      )}
      <p className="muted small">
        Adaptive order brings your lowest-scoring topics first. AI studio
        adjusts generated practice difficulty to your recent scores.
      </p>
    </>
  );
}
function QuizRunner({
  quiz,
  exam,
  minutes,
  finish,
  cancel,
}: {
  quiz: Quiz;
  exam: boolean;
  minutes: number;
  finish: (a: (number | null)[]) => void;
  cancel: () => void;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    quiz.questions.map(() => null),
  );
  const [checked, check] = useState(false);
  const [seconds, setSeconds] = useState(minutes * 60);
  const deadline = useRef(Date.now() + minutes * 60000);
  const done = useRef(false);
  const latest = useRef(answers);
  latest.current = answers;
  const finishRef = useRef(finish);
  finishRef.current = finish;
  function end() {
    if (done.current) return;
    done.current = true;
    finishRef.current(latest.current);
  }
  useEffect(() => {
    if (!exam) return;
    const id = setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setSeconds(left);
      if (left === 0) end();
    }, 250);
    return () => clearInterval(id);
  }, [exam]);
  const q = quiz.questions[i];
  if (!q) return null;
  return (
    <div className="study-center">
      <div className="toolbar">
        <button onClick={cancel}>
          <ChevronLeft size={16} />
          Leave quiz
        </button>
        <Tag>
          {exam ? "Exam · " : ""}
          {i + 1} / {quiz.questions.length}
        </Tag>
        {exam && (
          <strong aria-live="off">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </strong>
        )}
      </div>
      <div className="progress-track">
        <div style={{ width: ((i + 1) / quiz.questions.length) * 100 + "%" }} />
      </div>
      <section className="quiz-run panel">
        <p className="eyebrow">{q.topic}</p>
        <h2>{q.prompt}</h2>
        <div className="choices">
          {q.options.map((o, n) => (
            <button
              key={n}
              className={
                "choice " +
                (answers[i] === n ? "chosen " : "") +
                (checked && n === q.answer
                  ? "correct "
                  : checked && answers[i] === n
                    ? "incorrect"
                    : "")
              }
              disabled={checked}
              aria-pressed={answers[i] === n}
              onClick={() =>
                setAnswers((a) => a.map((v, j) => (j === i ? n : v)))
              }
            >
              <span>{String.fromCharCode(65 + n)}</span>
              {o}
              {checked && n === q.answer && <Check size={18} />}
            </button>
          ))}
        </div>
        {checked && (
          <div className="feedback">
            <strong>
              {answers[i] === q.answer
                ? "That’s it. Nicely done."
                : "A chance to learn something new."}
            </strong>
            <p>
              {q.explanation ||
                "The correct answer is " + q.options[q.answer] + "."}
            </p>
          </div>
        )}
        <button
          className="primary wide"
          disabled={answers[i] === null}
          onClick={() => {
            if (!exam && !checked) {
              check(true);
              return;
            }
            if (i === quiz.questions.length - 1) end();
            else {
              setI(i + 1);
              check(false);
            }
          }}
        >
          {!exam && !checked
            ? "Check answer"
            : i === quiz.questions.length - 1
              ? "Finish quiz"
              : "Next question"}
          <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
function Planner() {
  const { s, set, subject, pro, form, notify } = useApp();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [day, choose] = useState(today());
  const events = s.assignments.filter(
    (a) => subject === "all" || a.subject === subject,
  );
  const plans = s.plans.filter(
    (a) => subject === "all" || a.subject === subject,
  );
  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  function add(plan = false) {
    if (!s.subjects.length) {
      notify("Create a subject first.");
      return;
    }
    form({
      title: plan ? "Plan a study session" : "Add to your planner",
      fields: [
        {
          name: "title",
          label: plan ? "Session intention" : "Assignment or event",
        },
        subjectField(s, subject === "all" ? undefined : subject),
        { name: "date", label: "Date", type: "date", value: day },
        ...(plan
          ? [
              {
                name: "minutes",
                label: "Minutes",
                type: "number",
                value: 25,
                min: 1,
                max: 480,
              },
            ]
          : [
              {
                name: "type",
                label: "Type",
                options: ["Assignment", "Exam", "Revision", "Event"].map(
                  (x) => ({ value: x, label: x }),
                ),
              },
            ]),
      ],
      save: (d) =>
        set((old) =>
          plan
            ? {
                ...old,
                plans: [
                  ...old.plans,
                  {
                    id: uid(),
                    title: d.title,
                    subject: d.subject,
                    date: d.date,
                    minutes: Number(d.minutes),
                    done: false,
                  },
                ],
              }
            : {
                ...old,
                assignments: [
                  ...old.assignments,
                  {
                    id: uid(),
                    title: d.title,
                    subject: d.subject,
                    due: d.date,
                    type: d.type,
                    done: false,
                  },
                ],
              },
        ),
    });
  }
  return (
    <>
      <div className="toolbar">
        <p className="muted">A plan is a kindness to your future self.</p>
        <button className="primary" onClick={() => add()}>
          <Plus size={16} />
          New assignment
        </button>
      </div>
      <div className="planner-layout">
        <Section
          title={month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
          action={
            <div className="row">
              <button
                className="icon-button"
                aria-label="Previous month"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => {
                  setMonth(
                    new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      1,
                    ),
                  );
                  choose(today());
                }}
              >
                Today
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>
          }
        >
          <div className="calendar-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div className="weekday" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <div key={"blank" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = [
                month.getFullYear(),
                String(month.getMonth() + 1).padStart(2, "0"),
                String(i + 1).padStart(2, "0"),
              ].join("-");
              const items = [
                ...events.filter((e) => e.due === date),
                ...plans.filter((e) => e.date === date),
              ];
              return (
                <button
                  key={date}
                  className={
                    "calendar-day " +
                    (date === day ? "selected " : "") +
                    (date === today() ? "today" : "")
                  }
                  onClick={() => choose(date)}
                  aria-label={date + ", " + items.length + " events"}
                >
                  <strong>{i + 1}</strong>
                  <span>
                    {items.slice(0, 2).map((x) => (
                      <i key={x.id}>{x.title}</i>
                    ))}
                    {items.length > 2 && (
                      <small>+{items.length - 2} more</small>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
        <Section
          title={dateLabel(day)}
          action={
            <button
              className="icon-button"
              aria-label="Add event on selected day"
              onClick={() => add()}
            >
              <Plus size={17} />
            </button>
          }
        >
          {events
            .filter((a) => a.due === day)
            .map((a) => (
              <div className={"task " + (a.done ? "completed" : "")} key={a.id}>
                <button
                  className={"check-box " + (a.done ? "checked" : "")}
                  aria-label={(a.done ? "Reopen " : "Complete ") + a.title}
                  onClick={() =>
                    set((old) => ({
                      ...old,
                      assignments: old.assignments.map((x) =>
                        x.id === a.id ? { ...x, done: !x.done } : x,
                      ),
                    }))
                  }
                >
                  {a.done && <Check size={13} />}
                </button>
                <div>
                  <Tag
                    color={s.subjects.find((x) => x.id === a.subject)?.color}
                  >
                    {a.type}
                  </Tag>
                  <strong>{a.title}</strong>
                  <p>{subjectName(s, a.subject)}</p>
                </div>
                <button
                  className="icon-button"
                  aria-label={"Delete " + a.title}
                  onClick={() =>
                    set((old) => ({
                      ...old,
                      assignments: old.assignments.filter((x) => x.id !== a.id),
                    }))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          {plans
            .filter((p) => p.date === day)
            .map((p) => (
              <div className={"task " + (p.done ? "completed" : "")} key={p.id}>
                <button
                  className={"check-box " + (p.done ? "checked" : "")}
                  aria-label={(p.done ? "Reopen " : "Complete ") + p.title}
                  onClick={() =>
                    set((old) => ({
                      ...old,
                      plans: old.plans.map((x) =>
                        x.id === p.id ? { ...x, done: !x.done } : x,
                      ),
                    }))
                  }
                >
                  {p.done && <Check size={13} />}
                </button>
                <div>
                  <strong>{p.title}</strong>
                  <p>
                    {p.minutes} min · {subjectName(s, p.subject)}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label={"Delete " + p.title}
                  onClick={() =>
                    set((old) => ({
                      ...old,
                      plans: old.plans.filter((x) => x.id !== p.id),
                    }))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          {!events.some((a) => a.due === day) &&
            !plans.some((p) => p.date === day) && (
              <p className="muted">Some room to breathe. Nothing scheduled.</p>
            )}
        </Section>
      </div>
      <Section
        title="A study plan that grows with you"
        action={<Tag color="lavender">Pro</Tag>}
      >
        <ProGate title="Plan your revision with Pro">
          <p className="muted">
            Build your own sessions, or schedule spaced revision based on your
            quiz performance and exam dates.
          </p>
          <div className="row wrap">
            <button onClick={() => add(true)}>
              <Plus size={16} />
              Custom study session
            </button>
            <button
              onClick={() => {
                const generated = revisionSchedule(
                  s.subjects.filter(
                    (x) => subject === "all" || x.id === subject,
                  ),
                  s.attempts,
                ).map((p: any) => ({ ...p, id: uid() }));
                set((old) => ({
                  ...old,
                  plans: [
                    ...old.plans,
                    ...generated.filter(
                      (p: any) =>
                        !old.plans.some(
                          (x) =>
                            x.subject === p.subject &&
                            x.date === p.date &&
                            x.title === p.title,
                        ),
                    ),
                  ],
                }));
                notify(
                  "Revision sessions added to your calendar. Weaker subjects receive shorter review intervals.",
                );
              }}
            >
              <CalendarDays size={16} />
              Schedule revision automatically
            </button>
          </div>
          <div className="plan-list">
            {plans
              .filter((p) => !p.done)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 12)
              .map((p) => (
                <div className="plan-row" key={p.id}>
                  <CalendarDays size={17} />
                  <strong>{p.title}</strong>
                  <span>
                    {dateLabel(p.date)} · {p.minutes} min
                  </span>
                </div>
              ))}
          </div>
        </ProGate>
      </Section>
      <Section title="Upcoming assignments">
        <div className="assignment-table">
          {events
            .filter((a) => !a.done)
            .sort((a, b) => a.due.localeCompare(b.due))
            .map((a) => (
              <div key={a.id}>
                <strong>{a.title}</strong>
                <span>{subjectName(s, a.subject)}</span>
                <span className={a.due < today() ? "danger" : ""}>
                  {dateLabel(a.due)}
                </span>
                <button
                  onClick={() =>
                    set((old) => ({
                      ...old,
                      assignments: old.assignments.map((x) =>
                        x.id === a.id ? { ...x, done: true } : x,
                      ),
                    }))
                  }
                >
                  Complete
                </button>
              </div>
            ))}
        </div>
        {!events.some((a) => !a.done) && (
          <p className="muted">You’re all caught up.</p>
        )}
      </Section>
    </>
  );
}
function Focus() {
  const { s, set, notify } = useApp();
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [duration, setDuration] = useState(25);
  const [seconds, setSeconds] = useState(25 * 60);
  const [deadline, setDeadline] = useState<number | null>(null);
  const finished = useRef(false);
  const [sub, setSub] = useState(s.subjects[0]?.id || "");
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0 && !finished.current) {
        finished.current = true;
        setDeadline(null);
        if (mode === "focus") {
          set((old) => ({
            ...old,
            sessions: [...old.sessions, { date: today(), minutes: duration }],
          }));
          notify(
            "Session complete. " +
              duration +
              " minutes of progress, saved. Take a short break.",
          );
        } else notify("Break complete. Ready when you are.");
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline, duration, mode, set, notify]);
  function reset(nextMode: "focus" | "break" = mode, nextDuration = duration) {
    setDeadline(null);
    finished.current = false;
    setMode(nextMode);
    setDuration(nextDuration);
    setSeconds(nextDuration * 60);
  }
  return (
    <div className="focus-layout">
      <section className="focus-card">
        <div className="segmented">
          <button
            className={mode === "focus" ? "selected" : ""}
            onClick={() => reset("focus", 25)}
          >
            Time to focus
          </button>
          <button
            className={mode === "break" ? "selected" : ""}
            onClick={() => reset("break", 5)}
          >
            Take a break
          </button>
        </div>
        <p className="eyebrow">
          {mode === "focus"
            ? "MAKE A LITTLE SPACE FOR ONE THING"
            : "REST IS PART OF THE PROCESS"}
        </p>
        <div className="timer-display" role="timer">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}
          <span>:</span>
          {String(seconds % 60).padStart(2, "0")}
        </div>
        <p className="muted">
          {mode === "focus"
            ? "Just you and the next small step."
            : "Step away. Stretch. Let your mind wander."}
        </p>
        <div className="timer-actions">
          <button
            className="icon-button"
            aria-label="Reset timer"
            onClick={() => reset()}
          >
            <RotateCcw size={20} />
          </button>
          <button
            className="primary"
            onClick={() => {
              if (deadline) {
                setDeadline(null);
              } else {
                finished.current = false;
                setDeadline(Date.now() + (seconds || duration * 60) * 1000);
              }
            }}
          >
            {deadline ? <Pause size={18} /> : <Play size={18} />}{" "}
            {deadline
              ? "Pause"
              : "Start " + (mode === "focus" ? "focusing" : "break")}
          </button>
        </div>
        <div className="row center">
          {(mode === "focus" ? [15, 25, 50] : [5, 10, 15]).map((n) => (
            <button
              key={n}
              className={duration === n ? "selected" : ""}
              onClick={() => reset(mode, n)}
            >
              {n} min
            </button>
          ))}
        </div>
        <label className="field">
          I’m working on
          <select value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">General study</option>
            {s.subjects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Keep this page open for completion to be logged. The countdown uses
          real elapsed time if Safari suspends the tab.
        </p>
      </section>
      <div>
        <Section title="Today, one session at a time">
          <div className="big-number">
            {s.sessions.filter((x) => x.date === today()).length}
            <span>focus sessions completed</span>
          </div>
          <div className="progress-track">
            <div
              style={{
                width:
                  Math.min(
                    100,
                    (s.sessions
                      .filter((x) => x.date === today())
                      .reduce((n, x) => n + x.minutes, 0) /
                      s.goal) *
                      100,
                  ) + "%",
              }}
            />
          </div>
          <p className="muted">Daily intention: {s.goal} minutes</p>
        </Section>
        <div className="quote">
          <BookOpen size={22} />
          <p>
            Put your phone on silent. Get some water. Start before you feel
            ready.
          </p>
          <span>YOU’VE ALREADY TAKEN THE FIRST STEP.</span>
        </div>
      </div>
    </div>
  );
}
function Mistakes() {
  const { s, set, subject, form } = useApp();
  const [resolved, showResolved] = useState(false);
  const mistakes = s.mistakes.filter(
    (m) =>
      (subject === "all" || m.subject === subject) && m.resolved === resolved,
  );
  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={!resolved ? "selected" : ""}
            onClick={() => showResolved(false)}
          >
            To revisit
          </button>
          <button
            className={resolved ? "selected" : ""}
            onClick={() => showResolved(true)}
          >
            Understood
          </button>
        </div>
        <button
          className="primary"
          disabled={!s.subjects.length}
          onClick={() =>
            form({
              title: "Something to revisit",
              fields: [
                subjectField(s),
                {
                  name: "question",
                  label: "Question or concept",
                  type: "textarea",
                },
                { name: "answer", label: "Correct answer", type: "textarea" },
                {
                  name: "explanation",
                  label: "What I learned",
                  type: "textarea",
                  required: false,
                },
              ],
              save: (d) =>
                set((old) => ({
                  ...old,
                  mistakes: [
                    ...old.mistakes,
                    {
                      id: uid(),
                      subject: d.subject,
                      question: d.question,
                      answer: d.answer,
                      explanation: d.explanation,
                      resolved: false,
                    },
                  ],
                })),
            })
          }
        >
          <Plus size={16} />
          Add a learning moment
        </button>
      </div>
      <div className="grid-two">
        {mistakes.map((m) => (
          <Section
            key={m.id}
            title={m.question}
            action={<Tag>{subjectName(s, m.subject)}</Tag>}
          >
            <div className="answer-block">
              <span className="tiny-caps">THE IDEA TO TAKE WITH YOU</span>
              <p>{m.answer}</p>
            </div>
            <p className="muted">{m.explanation}</p>
            <div className="row">
              <button
                onClick={() =>
                  set((old) => ({
                    ...old,
                    mistakes: old.mistakes.map((x) =>
                      x.id === m.id ? { ...x, resolved: !x.resolved } : x,
                    ),
                  }))
                }
              >
                <Check size={16} />
                {resolved ? "Revisit again" : "I understand this now"}
              </button>
              <button
                className="icon-button"
                aria-label="Delete learning moment"
                onClick={() =>
                  set((old) => ({
                    ...old,
                    mistakes: old.mistakes.filter((x) => x.id !== m.id),
                  }))
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          </Section>
        ))}
      </div>
      {!mistakes.length && (
        <Empty
          title={
            resolved
              ? "Understanding takes practice"
              : "A fresh page, not a perfect score"
          }
          description={
            resolved
              ? "Mark a learning moment as understood when you’re ready."
              : "Missed quiz questions land here automatically, or add one yourself."
          }
        />
      )}
    </>
  );
}
function Insights() {
  const { s, set, subject, pro, form } = useApp();
  const [target, setTarget] = useState(85);
  const [finalWeight, setFinalWeight] = useState(30);
  const attempts = s.attempts.filter(
    (a) => subject === "all" || a.subject === subject,
  );
  const grades = s.grades.filter(
    (a) => subject === "all" || a.subject === subject,
  );
  const topics = mastery(attempts);
  const total = attempts.reduce((n, a) => n + a.total, 0);
  const right = attempts.reduce((n, a) => n + a.correct, 0);
  const last7 = Array.from({ length: 7 }, (_, i) => dateIn(i - 6));
  const daily = last7.map((d) =>
    s.sessions.filter((x) => x.date === d).reduce((n, x) => n + x.minutes, 0),
  );
  const max = Math.max(s.goal, ...daily, 1);
  const avg = gradeAverage(grades);
  const required = requiredFinal(grades, target, finalWeight);
  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-icon sage">
            <TrendingUp size={18} />
          </span>
          <p>Quiz accuracy</p>
          <strong>
            {total ? Math.round((right / total) * 100) + "%" : "—"}
          </strong>
          <span>{attempts.length} quizzes completed</span>
        </div>
        <div className="stat">
          <span className="stat-icon lavender">
            <Clock size={18} />
          </span>
          <p>This week’s focus</p>
          <strong>
            {daily.reduce((a, b) => a + b, 0)}
            <small> min</small>
          </strong>
          <span>Across all subjects</span>
        </div>
        <div className="stat">
          <span className="stat-icon peach">
            <Target size={18} />
          </span>
          <p>Grade average</p>
          <strong>{grades.length ? avg.toFixed(1) + "%" : "—"}</strong>
          <span>Weighted across selected grades</span>
        </div>
      </div>
      <Section
        title="Study minutes this week"
        action={<span className="muted small">Last 7 days · all subjects</span>}
      >
        <div
          className="bar-chart"
          role="img"
          aria-label={"Study minutes over last seven days: " + daily.join(", ")}
        >
          {last7.map((d, i) => (
            <div className="bar-column" key={d}>
              <strong>
                {daily[i]}
                <small>m</small>
              </strong>
              <div className="bar-space">
                <div
                  style={{ height: Math.max(2, (daily[i] / max) * 100) + "%" }}
                  className={d === today() ? "today" : ""}
                />
              </div>
              <span>
                {new Date(d + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "short",
                })}
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Grade calculator"
        action={
          <button
            onClick={() =>
              form({
                title: "Add a grade",
                description:
                  "Weights can be percentages or relative weights. For final-grade scenarios, use percentages of the course total.",
                fields: [
                  subjectField(s, subject === "all" ? undefined : subject),
                  { name: "title", label: "Assessment name" },
                  {
                    name: "score",
                    label: "Score (%)",
                    type: "number",
                    min: 0,
                    max: 100,
                  },
                  {
                    name: "weight",
                    label: "Weight (%)",
                    type: "number",
                    min: 0.1,
                    max: 100,
                  },
                ],
                save: (d) =>
                  set((old) => ({
                    ...old,
                    grades: [
                      ...old.grades,
                      {
                        id: uid(),
                        subject: d.subject,
                        title: d.title,
                        score: Number(d.score),
                        weight: Number(d.weight),
                      },
                    ],
                  })),
              })
            }
            disabled={!s.subjects.length}
          >
            <Plus size={15} />
            Add grade
          </button>
        }
      >
        <div className="grade-list">
          {grades.map((g) => (
            <div className="grade-row" key={g.id}>
              <div>
                <strong>{g.title}</strong>
                <p>{subjectName(s, g.subject)}</p>
              </div>
              <span>{g.weight}% weight</span>
              <strong>{g.score}%</strong>
              <button
                className="icon-button"
                aria-label={"Delete " + g.title}
                onClick={() =>
                  set((old) => ({
                    ...old,
                    grades: old.grades.filter((x) => x.id !== g.id),
                  }))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {!grades.length && (
          <p className="muted">
            Add your assessments to calculate a weighted average.
          </p>
        )}
      </Section>
      <div className="grid-two">
        <Section title="Topic mastery" action={<Tag color="lavender">Pro</Tag>}>
          <ProGate title="Find your next lightbulb moment">
            {topics.length ? (
              topics.map((t) => (
                <div className="mastery-row" key={t.topic}>
                  <div>
                    <strong>{t.topic}</strong>
                    <span>
                      {t.value}% · {t.total} answers
                    </span>
                  </div>
                  <div className="progress-track">
                    <div style={{ width: t.value + "%" }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">
                Complete a quiz to discover which topics need a little more
                attention.
              </p>
            )}
          </ProGate>
        </Section>
        <Section
          title="Grade predictions"
          action={<Tag color="lavender">Pro</Tag>}
        >
          <ProGate title="See what’s possible">
            {subject === "all" ? (
              <p className="muted">
                Select one subject above for a meaningful course-grade
                prediction.
              </p>
            ) : (
              <>
                <label className="field">
                  Target course grade: {target}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value))}
                  />
                </label>
                <label className="field">
                  Remaining assessment weight (%)
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={finalWeight}
                    onChange={(e) =>
                      setFinalWeight(
                        Math.min(100, Math.max(1, Number(e.target.value))),
                      )
                    }
                  />
                </label>
                <p className="prediction">
                  {grades.length &&
                  Math.abs(
                    grades.reduce((n, g) => n + g.weight, 0) +
                      finalWeight -
                      100,
                  ) < 0.01 ? (
                    <>
                      You need approximately{" "}
                      <strong>{required.toFixed(1)}%</strong> on remaining work.
                      {required > 100
                        ? " This target is above the possible score range."
                        : required < 0
                          ? " Your entered grades already secure this target."
                          : ""}
                      <br />
                      At your current average, the projected final grade is{" "}
                      <strong>{avg.toFixed(1)}%</strong>.
                    </>
                  ) : (
                    <>
                      Enter completed grades whose weights add up to{" "}
                      {100 - finalWeight}% to see this scenario.
                    </>
                  )}
                </p>
                <p className="muted small">
                  Projection assumes your current average continues. Not an
                  official grade.
                </p>
              </>
            )}
          </ProGate>
        </Section>
      </div>
      <Section
        title="Your knowledge map"
        action={<Tag color="lavender">Pro</Tag>}
      >
        <ProGate title="Connect the dots">
          <div className="knowledge-map">
            {s.subjects
              .filter((x) => subject === "all" || x.id === subject)
              .map((x) => {
                const qs = s.quizzes
                  .filter((q) => q.subject === x.id)
                  .flatMap((q) => q.questions);
                const ts = [...new Set(qs.map((q) => q.topic))];
                return (
                  <div className="knowledge-branch" key={x.id}>
                    <div className={"knowledge-root " + x.color}>
                      <BookOpen size={18} />
                      {x.name}
                    </div>
                    <div className="knowledge-leaves">
                      {ts.length ? (
                        ts.map((t) => (
                          <div key={t}>
                            <span className="map-connector" />
                            <span>{t}</span>
                            <Tag>
                              {topics.find((a) => a.topic === t)?.value ?? "—"}%
                            </Tag>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          Add quiz topics to grow this branch.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </ProGate>
      </Section>
      <Section
        title="Learning history"
        action={<Tag color="lavender">Pro</Tag>}
      >
        <ProGate title="Understand your learning, in detail">
          <div className="grade-list">
            {attempts
              .slice(-15)
              .reverse()
              .map((a) => (
                <div className="grade-row" key={a.id}>
                  <strong>
                    {s.quizzes.find((q) => q.id === a.quiz)?.title ||
                      "Previous quiz"}
                  </strong>
                  <span>
                    {subjectName(s, a.subject)} · {dateLabel(a.date)}
                  </span>
                  <strong>
                    {a.correct}/{a.total} ·{" "}
                    {Math.round((a.correct / a.total) * 100)}%
                  </strong>
                </div>
              ))}
          </div>
          {!attempts.length && (
            <p className="muted">Your quiz results will appear here.</p>
          )}
        </ProGate>
      </Section>
    </>
  );
}
