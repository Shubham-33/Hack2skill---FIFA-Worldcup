# GateReady

[![CI](https://github.com/Shubham-33/Hack2skill---FIFA-Worldcup/actions/workflows/ci.yml/badge.svg)](https://github.com/Shubham-33/Hack2skill---FIFA-Worldcup/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/Shubham-33/Hack2skill---FIFA-Worldcup/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-128-blue)](web/tests)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![lighthouse](https://img.shields.io/badge/lighthouse-a11y%20100%20%C2%B7%20perf%2098-brightgreen)](https://hack2skill-fifa-worldcup.vercel.app)

### ▶ Live: **[hack2skill-fifa-worldcup.vercel.app](https://hack2skill-fifa-worldcup.vercel.app)**  ·  [Organiser view](https://hack2skill-fifa-worldcup.vercel.app/ops)

**Know before you go. Don't miss kickoff.**

A multilingual, photo-based gate-readiness answer engine for the FIFA World Cup 2026.
Ask in any language what you can bring into the stadium, get accessible-route guidance,
give volunteers a script to read aloud — and give organisers operational intelligence
built from questions real fans actually asked.

---

## The problem

The biggest cause of delay at a stadium gate isn't security screening — it's fans
arriving with something that was never going to get in. A power bank, a backpack that
breaks the clear-bag policy, a flag with a rigid pole, an insulin pen nobody warned them
to declare.

It's high-frequency, it's high-stakes, and unlike most things you could point an LLM at,
**it has a correct answer.** That makes it groundable, and grounding is what separates a
useful tool from a confident guess.

With 48 nations arriving across 16 host cities in three countries, the same question
arrives in forty languages at once — and the volunteer being asked has had a morning of
training and no way to look it up.

## What it does

| Mode | User | Input | Output |
|---|---|---|---|
| **Fan** | Ticket holder | Photo of a bag, or a question in any language | Per-item verdict, the reason, and the fix |
| **Accessibility** | Disabled fan | Profile (wheelchair, sensory, medical device, service animal) | Correct gate, step-free route, companion seating, quiet room |
| **Volunteer** | Venue staff | The same photo | A read-aloud script in the fan's language and where to redirect |
| **Operations** | Organiser | *(derived)* | Live aggregation of real questions, with suggested actions |

## Three design decisions worth explaining

### 1. Three states, not two

Every verdict is **Allowed**, **Not allowed**, or **Check with staff** — and the third one
is the point. When no policy rule clearly covers an item, the system says so instead of
guessing. A wrong "yes" on someone's insulin is a headline, not a bug report.

### 2. Every answer cites its source, and the citation is verified

Answers are grounded in policy rows, not model memory, and each verdict carries the
`ruleId` it came from.

That guarantee is enforced rather than requested. During testing the model returned
*"smartphone → allowed"* citing the **professional camera** rule — whose actual verdict is
`not_allowed` — because that rule's fix text happened to mention phones. A plausible
answer with a citation that contradicted itself.

[`enforceCitationIntegrity`](src/lib/llm.ts) now validates every citation against the real
rule. A fabricated rule id, or one whose verdict disagrees, is dropped and the item is
downgraded to `check_with_staff`. Ungrounded answers cannot reach a fan regardless of what
the model returns.

### 3. Operational intelligence as a byproduct, never a simulation

We have no turnstile telemetry, so we don't pretend to. The Operations view is built
entirely from questions fans actually asked this tool — which is exactly why an operator
can act on it.

Questions aggregate on the **canonical rule**, not the localised label, so `backpack`,
`mochila`, `sac à dos` and `Rucksack` collapse into one signal instead of four fragments
that never cross the threshold to matter.

## Resilience: three tiers

The live URL has to work on stage. It answers through the first tier that succeeds:

| Tier | Provider | Role |
|---|---|---|
| 1 | **Gemini 2.5 Flash** | Multimodal primary. Free tier, no billing card. |
| 2 | **NVIDIA NIM** `llama-3.2-90b-vision-instruct` | Covers Gemini's ~15 RPM free-tier ceiling under concurrent load. Also multimodal, so photos survive failover. |
| 3 | **Deterministic rule lookup** | No API key at all. The demo cannot die, and the test suite runs without credentials. |

Which tier answered is always shown in the UI. Degradation is visible, never silent.

> Every call is time-boxed. `meta/llama-3.3-70b-instruct` was observed accepting
> connections and never responding — `GET /v1/models` returned 200 in 58ms while
> `POST /chat/completions` hung indefinitely. A hanging upstream must never become a
> hanging request.

## Google services

All free, none requiring a billing account:

- **Gemini API** (AI Studio) — vision, text, structured output
- **Google Sheets** — policy database schema
- **Google Calendar** — URL-spec dispatch, zero auth; the fan's personalised checklist lands in their calendar
- **Google Maps** — URL-spec directions links, zero auth
- **Google Fonts** — self-hosted at build time via `next/font`

> Calendar and Maps use URL-spec endpoints rather than OAuth. Identical result for the
> user, no consent screen, no token storage, no refresh logic. Maps Platform's JS SDK
> requires a billing card; the directions URL does not.

## Privacy and security

Privacy here is structural, not procedural:

- **Raw questions are never stored.** Aggregation happens on the matched canonical item.
- **Photos are never persisted.** Processed in memory for the request, then discarded.
- **No accounts, no cookies, no sessions, no IP retention, no analytics.**
- The Operations view holds counts only, so no individual can be surfaced from it.

Plus: strict CSP and security headers ([`src/proxy.ts`](src/proxy.ts)), request size caps,
enum coercion on all untrusted input, and secrets kept in environment variables that are
gitignored at every path.

## Running it

```bash
cd web
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (and optionally NVIDIA_API_KEY)
npm run dev
```

It runs **without any API key** — you'll be served by the deterministic tier, which is
the point of having one.

```bash
npm run test:cov   # 128 tests, 100% coverage gate
npx tsc --noEmit   # types
npx eslint .       # lint
npm run build      # production build
```

## Architecture

```
web/src/
├── lib/
│   ├── types.ts           Domain types
│   ├── policies.ts        Seed policy data + venue facts + translations
│   ├── deterministic.ts   Tier 3 — pure functions, no network, no key
│   ├── llm.ts             Tiers 1–2 + failover + citation integrity
│   └── oplog.ts           Privacy-preserving aggregation
├── app/
│   ├── api/check/         POST — the single endpoint behind every mode
│   ├── api/ops/           GET  — aggregated operational data
│   ├── page.tsx           Fan / Accessibility / Volunteer
│   └── ops/page.tsx       Organiser view
├── components/            GateReady, VerdictCard, OpsBoard
└── proxy.ts               Security headers (Next 16 renamed `middleware` → `proxy`)
```

## Non-goals

Declared up front and deliberately not built: no accounts, no payments, no live queue
telemetry, no AR, no native app, no external database. The Sheet is the database.

## Disclaimer

Policy data here is demonstration data modelled on real venue policies. It is **not**
official FIFA guidance. Always confirm with your venue before travelling.

## Verified, not assumed

Measured against the deployed URL, not a local build:

| Check | Result |
|---|---|
| Lighthouse Accessibility | **100** |
| Lighthouse Best Practices | **100** |
| Lighthouse SEO | **100** |
| Lighthouse Performance | **98** |
| Console errors | **0** |
| Hydration | verified by clicking through the flow in headless Chrome |
| Tests | 128 passing, 100% coverage gate, no API key required |

> One bug this caught: an earlier `script-src 'self'` CSP blocked Next.js's own inline
> bootstrap scripts. The page returned 200, the API answered `curl` correctly, and
> Lighthouse still scored Accessibility 100 — while every button on the live site was
> dead. No build, test, lint, or typecheck could see it. Driving the deployed URL in a
> real browser is the only thing that did.

---

Built for **PromptWars** · Next.js 16 · Gemini 2.5 Flash
