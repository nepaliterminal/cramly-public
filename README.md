# Cramly

A mobile-first study workspace for Safari and desktop browsers. It includes optional Google sign-in and a grounded study-set generator. The classic interface remains at `/index.html`; `/` opens the new workspace after deployment.

## Development

Use Node.js 22+:

```sh
npm ci
npm start -- --port 5173
npm run check
npm test
npm run build
npm run preview -- --port 4173
```

Development and production preview serve the app at `/workspace/`. Vite builds into `docs/workspace/` without overwriting the classic `docs/` files. Vercel serves `docs/` and rewrites `/` to the new workspace. Opening a PR does not change a production deployment.

## Website password and owner dashboard

The hosted site is now password protected **on the server**, including classic pages and static assets. `/admin` requires a separate owner password. Missing or invalid server configuration fails closed with HTTP 503; there are no default deployment passwords. Plain `npm start` / `npm run preview` are unprotected development tools, not the protected deployment server.

Set these server-only variables in Vercel for each environment you deploy; never prefix them with `VITE_`, commit them, or paste them into chat:

| Variable | Purpose |
| --- | --- |
| `CRAMLY_SITE_PASSWORD` | Visitor password, at least 12 characters |
| `CRAMLY_ADMIN_PASSWORD` | Different owner password, at least 12 characters |
| `CRAMLY_SESSION_SECRET` | Stable random signing secret, at least 32 characters |

After setting or changing variables, redeploy. For a protected local build, bind the same variables securely into the shell, run `npm run build`, then `PORT=4186 npm run serve`. Open `/` for the visitor gate and `/admin` for owner sign-in. Vercel uses `proxy.js` on every path and the `/api/security` function; the local server uses the same gate and API handlers. Do not serve `docs/` directly as a substitute for the protected server.

Sessions use signed, HttpOnly, SameSite=Strict cookies, Secure over HTTPS. Visitor sessions last 12 hours; owner sessions last 30 minutes. Password changes invalidate the corresponding role’s sessions; the signing secret invalidates all sessions, issued codes and Pro grants. Requests are same-origin checked, with a basic per-process sign-in cooldown. This cooldown is not a durable, distributed rate limiter; use hosting firewall/rate-limit rules before broad public exposure.

The owner dashboard generates batches of 1–20 signed Pro codes, with 1–365 days of access and a 1–90 day activation window. Copy individual/all codes, reveal/hide them, or download a private CSV. Codes are **shareable, not single-use**, and cannot be individually revoked or counted in this stateless version. Generated batches stay in that tab’s memory only; copy/download before leaving. New codes redeem through the server and create a verified Pro cookie. There is no bundled code registry; new activations require a code from this deployment’s admin dashboard. Previously activated browser-local access and study data are retained. This is not subscription billing or a server-enforced paid feature backend.

The dashboard also shows access settings, links to hosting password configuration, opens the study/classic apps, and signs out or locks this browser. It does not expose student notes, grades or activity, which remain browser-local. The password gate controls access to the website; it does not encrypt local study data or downloaded backups. Vercel’s existing preview sign-in, if enabled, remains an additional outer gate.

There are no pre-commit hooks. CI runs TypeScript, existing auth/generator tests, learning-policy tests and a production build. Generated output is not committed.

## Free and Pro

For a protected local server using `.env.local`, build first, then run `node --env-file=.env.local server/serve.mjs`. `npm run serve` reads variables already set in the process environment. Both work on Node 22.0 and later.

| Area | Free | Pro · $5.99/month offer |
| --- | --- | --- |
| Workspace | Overview, notes, 5 subjects | Unlimited subjects |
| Flashcards | 100 cards, daily review | Unlimited cards, rating-based spaced repetition, CSV export |
| Quizzes | Manual creation, scored practice, 5 cloud study sets/day | 100 cloud generations/day fair use, adaptive practice, timed exams |
| Tutor | 10 messages/day | 300 messages/day and weak-topic context |
| AI writing | — | Guides, summaries, essay feedback (100 requests/tool/day) |
| Files | Text and Markdown | Text-based PDF/textbooks, up to 10 MB and 200 pages |
| Organization | Goals, streaks, Pomodoro, calendar and assignments | Custom sessions and automatic revision scheduling |
| Progress | Study overview, weighted grade calculator | Topic mastery, knowledge maps, attempt history and grade scenarios |
| Portability | Full JSON backup/restore | Markdown note/guide and card CSV exports |
| Appearance | Responsive light/dark themes, iPhone home-screen icons | Same |

Missed quiz questions enter the mistake bank automatically; entries can also be added manually. Adaptive generation requests foundational, standard or advanced questions according to the last three subject scores, emphasizing topics below 70%. Adaptive ordering separately brings weaker topics first. Generated questions are attributed to their study-set topic rather than individually classified by AI.

Automatic revision uses more frequent 30-minute sessions for subjects below 60% average accuracy; otherwise it schedules 20-minute reviews at wider intervals, never after the exam date. Grade projection is a transparent scenario based on entered weights and current average, not a trained forecast or official grade. Analytics use actual answers and completed focus sessions; new workspaces start empty, ready for your own subjects, notes, cards, quizzes and assignments.

## AI and privacy

Pollinations remains the default provider; Gemini 2.5 Flash is optional with a personal browser-saved key. The existing grounded-answer validation and local fallback are retained. Local mode creates rule-based flashcards and questions from definitions; it is **not AI**. Cloud generation failures save explicitly labeled local output without consuming the cloud allowance. Tutor, guides, summaries and essay review never fabricate fallback answers: provider failures show an error and do not use allowance.

Cloud requests send selected material to the provider: up to 60,000 note characters and 12,000 characters per tutor/essay message. A Gemini key is stored only in that browser’s local storage; clear its field and save to remove it. Don’t save one on a shared device. PDF extraction happens locally with PDF.js. Scanned/OCR and encrypted textbooks are unsupported.

Pro requests take precedence over queued Free requests in the **same browser’s** two-request queue, not in the provider’s infrastructure. Provider availability, CORS, quotas and model support are outside Cramly’s control.

## Public-source configuration

Copy `.env.example` to `.env.local` for local development, or set the same variables in your hosting project before building. Set the three `CRAMLY_*` values only on the server; never prefix passwords or the signing secret with `VITE_`. Local environment variants, generated runtime configuration, Vercel metadata, private key files and Cramly exports are ignored. Personal payment destinations are unset while checkout is disabled.

Google sign-in uses your own `VITE_FIREBASE_*` settings. Build/start generates public runtime configuration for both interfaces from an explicit allowlist; server credentials are never included. Firebase web values are visible to browsers by design, not admin credentials. Never use a service-account key. Without them the React workspace supports guest study, while the classic Google-sign-in-only interface stays locked. `VITE_CRAMLY_HOSTING_SETTINGS_URL` optionally adds your own HTTPS hosting-settings link in the admin dashboard. Rebuild after changing public configuration.

## Accounts and local data

This remains a static MVP. Data is saved on every edit in local storage, namespaced by Firebase UID or a separate guest workspace. Optional Google sign-in does not sync across devices. Configure your own Firebase Authentication project and authorize your deployment domains and localhost. Sign-in failures are explicit and do not prevent local study.

Classic `cramly:v1` data is never removed. Settings can copy saved classic decks into the first subject; originals remain. Existing access expiry and redeemed-code tracking are retained. Access codes and AI settings remain browser-level, not account-level licenses. Backups contain study data, **not keys or access credentials**. Clearing browser data removes work and local Pro access. There is no server-enforced entitlement, cloud backup or cross-device subscription. Technical users can reset client limits; they are not secure billing enforcement.

Focus timing uses a wall-clock deadline so a suspended Safari tab catches up. Keep the workspace open until completion is logged; closing/reloading ends the timer. iPhone: open in Safari → Share → Add to Home Screen. No service worker is registered; an internet connection is required to load the app.

## Billing and preview

The offer is **$5.99/month**, but checkout is deliberately disabled in both interfaces until verified billing and a subscription backend are connected. This PR does not charge anyone. Only codes generated by your admin dashboard activate new Pro access; no fixed codes or code hashes ship with the app.

For preview only, set `VITE_ENABLE_PRO_PREVIEW=true` when building/serving. Plans then offers an explicit free Pro preview, clearly distinguished from a paid subscription. Ordinary production builds disable it. Monetization still needs a payment provider, authenticated server-side entitlements, verified webhooks and server-enforced quotas.
