# EduCore — Vibecoding Kit v1.0: START HERE

**Version:** 1.0 · **Date:** 17/10/2026 · **Status:** APPROVED_KIT_BASELINE (local-only; Git/Figma writes not authorized)

This guide merges the **tool-neutral detailed Stitch screen inventory** with the previous Codex workflow and approved Group A technical design. **No Stitch subscription or Stitch project is needed.** All 71 screen units are **approved as an inventory**, not 71 separately approved implementations; only open the one you are designing.

## 1. Where to start (task-based, not read-everything)

| Your goal | Read ONLY this content in addition to AGENTS.md |
|---|---|
| Review differences vs Stitch | `STITCH_REUSE_REVIEW.md` |
| Pick a screen | `SCREEN_MAP.md` row for ID, then that one card in `SCREEN_SPECIFICATIONS.md` |
| Review visual identity | `DESIGN_TOKENS.md` + relevant `UI_GUIDELINES.md` section |
| Draft a Figma / screen proposal | `UI_PROMPTS.md` prompt 1 + one card + relevant Fxx in `SCREEN_FLOWS.md` + `SCREEN_REVIEW_TEMPLATE.md` |
| Implement a React screen | Approved screen review + `educore-ui-slice` skill + relevant API contract |
| Implement DB/API and UI together | Approved `FEATURE_SPEC_TEMPLATE.md` copy + `educore-feature-slice` skill |
| Build review checklist | `REVIEW_CHECKLIST.md` + `DECISION_REGISTER.md` |

**Canonical Screen IDs:** use `AU01`, `G01`, `AC01`, `SC03`, `BL07`, etc. from former Stitch (`SCREEN_MAP.md`). Old `AUTH-01`, `FIN-01` etc. from v0.9 are only **aliases**. New Group A screen `AU06` is account activation. **59 P0 + 12 P1 concept units = 71 design units**, not 71 required React pages or Figma frames.

## 2. Approved kit usage — separate review before implementation and Git writes

1. **Verify current repo ref:** v5/group-A docs were previously prepared in PR #1; this local package does not assume that PR is merged. Requirements v5 + UC v1.3 + approved group A remain the intended source; inspect the actual checked-out versions.
2. **Kit-wide review is complete.** Canonical IDs, visual tokens, tenant-scoped UI navigation pattern and approved screen inventory are the starting baseline. Still do **not** copy to GitHub, write Figma or change application code without separate explicit authorization. Each screen/feature needs its own implementation sign-off.
3. **One design unit:** pick screen ID, trace its FR/UC/Q, permission and object scope. Fill `SCREEN_REVIEW_TEMPLATE.md`; attach any Figma frame if one already exists/was explicitly approved. Figma is optional.
4. **One vertical slice:** pick feature with its API/DB contract, prepare feature spec; implement only after feature and screen spec approval. Without backend, a prototype must visibly say `Dữ liệu mẫu`.
5. **Evidence and signoff:** Codex reports actual edited files, tests run, screenshots when available, conflicts and pending decisions. Review local diff **before** any Git action.

**Recommended first UI references (one at a time):** `G01` (shell and 3 KPI), `AC01` (DataTable), `SC03`+embedded `SC04` (form/conflict), `AT02` or `AS07` (mobile). This order is for *design references*; implementation should still follow approved vertical-slice dependencies, beginning with Tenant/IAM onboarding.

**Authority & scope:** Requirements v5 → UC v1.3 → Accepted Architecture → Database v1.1 / Detailed Design / API (only versions verified on checked-out ref) → screen specs/tokens. Canonical frontend route pattern and token palette are approved UI defaults; each route/action still needs per-screen review and must not be mistaken for a live endpoint. Backend applies tenant+permission+scope. `EX01`–`EX12` are P1 concepts only and never mounted in P0.

## 3. Model selection: quality vs efficiency (as verified 17/10/2026)

**Rule:** Start with the **cheapest sufficiently capable model and lowest reasoning effort that passes tests**. Escalate for failures, not by habit. Available models, labels and quota may differ in ChatGPT, Codex, API and account plans. If your Codex model menu lacks a model below, choose the nearest available fast/standard/reasoning option and verify capabilities; do **not** assume API model names are selectable in every Codex UI.

| Task category | Default model (if available) | Reasoning | Escalation trigger |
|---|---|---|---|
| Rename, copy edit, types, simple DTO/form validation, routine refactor with precise file scope | **GPT-6 Luna** (`gpt-6-luna`) | **Low** (None only if trivial) | New ambiguous business rule, 2 failed attempts |
| One screen from approved spec; component/table/form composition; simple API endpoint and tests | **GPT-6 Luna** | **Medium** | Multiple modules, data invariants or unresolved state interactions |
| Full slice (React + NestJS + DB + tests) when contract is fixed; advanced scoped refactor; review of 2–4 related files | **GPT-6.1 Sol** (`gpt-6.1-sol`) | **Medium** | Need to reconcile incompatible designs, concurrent transactions, complex security |
| PostgreSQL exclusion/locking, cross-tenant auth, financial ledger, complex scheduling, diagnosis of intermittent failures | **GPT-6.1 Sol** | **High** | Critical invariant still fails with good tests and isolated evidence |
| Cross-domain architectural decisions, audit of conflicting BR/Q/API/DB, novel multi-step failures, security-critical design review | **GPT-6 Astra** (`gpt-6-astra`) | **High**; use xhigh only with measured gain | Highest-cost option should be used sparingly |
| One-off classification, requirement IDs mapping, writing checklists, updating doc tables | **GPT-6 Luna** | **Low** | Only if input requires deep multi-source reconciliation |
| Visual fidelity review of proposed Figma ↔ React | **Sol Medium** (or Luna Medium on one component) | Medium | Escalate on systemic design inconsistencies |

**Verified source:** the official OpenAI model catalog/model-selection guide (https://developers.openai.com/api/docs/models and https://developers.openai.com/api/docs/guides/model-selection) lists Luna, Sol and Astra, with task/effort tradeoffs. **Not** a promise these choices appear in your Codex menu.

**Why these names?** OpenAI model guide (Oct 2026) positions Luna as efficient, Sol as balance, Astra as highest capability; recent API catalog lists `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra`. Older `gpt-5.3-codex` is **deprecated (Oct 1, 2026) and scheduled for removal from API April 1, 2027**, so avoid making it a new baseline. It might still appear in some Codex products; do not assume retirement timing is identical across products.

Official references (verify before updating this matrix):
- https://developers.openai.com/api/docs/guides/model-selection
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/guides/deployment-checklist

### 3.1. Example API price comparison (NOT Codex subscription billing)

At publication, model catalog lists these *illustrative standard API* token rates per 1 million input/output tokens. Always check official pricing for region, long context, cached input and current model; **Codex subscription rate limits/credits do not necessarily map directly to these dollars**.

| Model | Input USD/1M | Output USD/1M | Typical role |
|---|---:|---:|---|
| GPT-6 Luna | 0.10 | 0.50 | cheapest routine work |
| GPT-6.1 Sol | 2.00 | 10.00 | quality/cost balanced |
| GPT-6 Astra | 10.00 | 50.00 | expensive difficult cases |

**Illustration, not prediction:** a non-cached call with 10k input + 2k output is about **$0.002 Luna**, **$0.04 Sol** or **$0.20 Astra**, excluding tool calls/other charges. Real use also includes hidden reasoning/tool tokens; use the product's actual usage/price surface when available. Savings come as much from **avoiding wrong code and retries** as from per-token price.

### 3.2. Simple escalation ladder

1. **Luna Low**: one well-specified atomic edit. 
2. **Luna Medium**: one well-specified UI view or service with tests.
3. **Sol Medium**: integrated feature across modules, or 1–2 Luna attempts failing due to complexity.
4. **Sol High**: concurrency, money, security, multi-step debugging.
5. **Astra High**: fundamental design conflict, difficult uncertain diagnosis. Keep ask bounded; return reviewed plan first.

Do not use xhigh/max by default; only use them if an evaluation on EduCore tasks demonstrates improvement. Don't pay Astra to regenerate boilerplate after Astra has already resolved a design: delegate approved implementation chunks to Luna/Sol.

## 4. Token-saving workflow (one screen/one feature)

### Stage 0 — Verify source/ref, no code

Prompt: “Inspect only repo tree, package files and relevant UC/FR/Q design sections for **[slice]**. Report source versions and missing dependencies. No files modified.” Run Luna Low/Medium.

### Stage 1 — Define **one** feature contract

Copy `FEATURE_SPEC_TEMPLATE.md`, fill source refs, actor/permission, request-response, states/errors, security, audit, tests, UI, acceptance, blocked decisions. Run Sol Medium for cross-layer features. Review **before** code.

### Stage 2 — UI only or backend only, bounded

- UI task: feed canonical `SCREEN_MAP.md` row + the **single** card in `SCREEN_SPECIFICATIONS.md` + `DESIGN_TOKENS.md` if layout needed + approved screen review + necessary components. Activate `educore-ui-slice` only. If no Figma is verified, build a **proposal** first rather than asserting it's implemented.
- Backend task: feed UC relevant section + API endpoint + schema tables + test requirements. Activate `educore-feature-slice`. Do not reread all 14 class modules.
- Keep requests within **one vertical slice**, not “build EduCore”. Change at most a few related files where possible.

### Stage 3 — Verify in two passes

First run deterministic tools: lint/typecheck/unit/integration. Then ask Luna Low to review diff/obvious omissions; upgrade to Sol High for unsafe transactions/auth/ledger.

### Stage 4 — Human review checkpoint

Codex returns list of changed files and actual verification. **Wait for explicit approval before any Git/Figma write** (also applies to new documentation).

## 5. Standard prompts (copy/edit)

### A — Context discovery (cheap)

```text
Use AGENTS.md and docs/ai/PROJECT_CONTEXT.md.
Task: inspect UC-XX / FR-XX for [one feature]. Read only relevant Q/BR, the module class design,
database tables and the API section. Read current code in touched directories.
Return: scope P0/P1; existing vs absent source code; exact files needed;
AC and open questions. Do not edit, commit, push, create a PR, or touch Figma.
```

### B — UI proposal (cheap/medium)

```text
Use the educore-ui-slice skill.
Implement/propose only [AU06/AC01/SC03/etc.] according to approved feature spec [path].
Keep all business conditions from UC-XX/Q-XX; do not invent new APIs.
Show states: loading, empty, validation, forbidden, conflict, success.
Only change [whitelisted files]. If source not implemented, use clearly labeled fixture
or proposal, no fake live backend. No Git/Figma writes. Return screenshot/preview if supported
and a review checklist.
```

### C — Backend slice (Sol Medium)

```text
Use the educore-feature-slice skill, feature [slug], UC-XX, FR-XX, Q-XX.
Constraints: [approved acceptance criteria], [API route], [tables].
Allowed paths: [paths]. No unrelated refactor, no P1, no external business API.
First present contract and transaction/permission plan. Implement only after spec approval.
Write tests for valid, forbidden, cross-tenant, duplicate, conflict, retry.
Report checks ACTUALLY run; do not commit/push/create PR.
```

### D — Debug/concurrency (Sol High → Astra if necessary)

```text
Diagnose [repro] in [component/service]. You may inspect only [paths], logs and test output.
Provide root-cause hypothesis and deterministic failing test before changing implementation.
Keep policy/BR/Q unchanged. Implement minimal fix; rerun test; report evidence.
No Git changes beyond local files; no migration on shared/prod DB.
```

### E — Review-only (Luna Low → Sol High if sensitive)

```text
Review the uncommitted diff only. Focus on UC-XX acceptance, scope, auth, P0/P1,
API contract, unsafe DB writes and missing tests. Sort findings by severity with file paths.
Do not modify files and do not open PR.
```

## 6. Stop conditions — ask a human, not another expensive loop

Stop the affected work when: a BR/Q conflict emerges; a P1 requirement is needed in P0; invoice/ledger/account access is ambiguous; API response differs from approved contract; baseline repo lacks approved v5/group A documents; Figma write permission/design source is unclear; database migration or data change touches production; only external integration can meet a proposed behavior.

For minor styling, copy or spacing choose a documented UI default, mark `PROPOSED` and continue.

## 7. Common failure patterns that waste tokens

| Anti-pattern | Replacement |
|---|---|
| “Read all project files then code everything” | UC + Q/BR + 1 module + relevant DB/API paragraphs |
| Huge `AGENTS.md` repeating requirements | ~80-line always-loaded guide; on-demand skills |
| “Make login UI and backend” with no approved contracts | Two tasks: auth contract first, then UI/full slice |
| Retry same prompt with expensive model and no repro | Add test + logs, narrow hypothesis |
| Generate 30 screens to look complete | One representative approved route + component system, validate pattern |
| Invent empty API data and claim success | Fixture/demo clearly labeled; no fake API success |
| Auto-commit to save progress | Produce local diff and review checklist first |
| Force deep thinking for labels or CSS tweaks | Luna Low/Medium and scope by component |

## 8. Codex/Figma integration notes

Codex reads `AGENTS.md` from applicable repository directories. Skill manifests in `.agents/skills/` describe workflows; full instructions are intended to be read only for relevant tasks. Figma integration availability/edit permission is **not guaranteed** by having a plan; verify connected tool capability and target file first, and never write designs without explicit authorization.

Official workflow references:
- https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex
- https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra
- https://developers.openai.com/blog/skills-agents-sdk

## 9. Pre-implementation and Git-transfer checks

1. Use the now-approved `SCREEN_MAP.md` IDs and default routes; review each screen’s exact behaviors, scope, and states before implementation.
2. Confirm package version and group-A source branch merged or plan to merge it separately.
3. Confirm authentication UI/session/CSRF strategy tested for production domain arrangement.
4. Confirm permission catalog mapping and seed details against approved architecture before IAM migration.
5. Review `DECISION_REGISTER.md` and `REVIEW_CHECKLIST.md`.
6. The kit content is now approved; copy into the repo and perform any Git changes **only with a separate explicit authorization**.

**Next suggested first implementation:** Tenant bootstrap and Identity & Access (after group A docs are present in checked-out branch); use one feature spec covering activation, account state, OTP and permission checks, not the entire IAM module.

## 10. Migration from old Stitch and v0.9 (important)

- Never paste 740 lines of `design.md` into every Codex turn. Pick ONE card by canonical ID. `DESIGN_TOKENS.md` holds the reusable visual rules; `UI_GUIDELINES.md` the interaction behavior.
- `STITCH_START_HERE.md` and Stitch batch prompts no longer serve as run instructions. `UI_PROMPTS.md` gives shorter review-first design/React prompts.
- Never treat `SCREEN_MAP` as an API specification. Detailed request/response lives in `docs/design/api_spec.md` when verified in current branch.
- Group A adjustments already reflected: `AU06` account activation, `AU04` atomic OTP reset, `BL07/BL09/BL10` pending excess reconciliation, one invoice per student/month, fixed P0 permission catalog.
- Follow `STITCH_REUSE_REVIEW.md` for the **approved kit-wide UI defaults**; review exceptions in a specific screen or feature slice before mass design production.
