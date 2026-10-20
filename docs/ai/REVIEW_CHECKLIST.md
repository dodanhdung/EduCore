# EduCore — Vibecoding Kit Review Checklist

**APPROVED KIT BASELINE v1.0 · 2026-10-17** — checklist below applies to each feature/screen and before any Git transfer.

## 1. Documentation quality / consistency

- [ ] Root `AGENTS.md` is short and only contains durable rules (no full FR/UC copy).
- [ ] Requirements v5.1 (v5 + O-12 + Wallet amendments) và UC v1.3 với amendments được đối chiếu với remote `main`/checkout thực tế.
- [ ] Accepted business/architecture vs user-approved group A vs UI proposals are visibly differentiated.
- [ ] Every core screen row has traceable UC and role/object scope; no fabricated implemented UI/API/Figma.
- [ ] All 71 design units represented once (59 P0, 12 P1); AU06 group-A activation included.
- [ ] Legacy 44 v0.9 IDs migrated through aliases, no duplicate screens/routes generated.
- [ ] Former Stitch routes use the approved UI navigation convention; verify each precise route/embedded component during screen review.
- [ ] Exact visual palette in DESIGN_TOKENS.md matches approved UI baseline (this does not assert an official logo/brand mark).
- [ ] Screens and skills do not introduce P1 functionality into P0.
- [ ] Paths are relative to repo root and correct for pnpm monorepo `apps/api` and `apps/web`.
- [ ] `.agents/skills/*/SKILL.md` contain YAML front matter with `name`/`description` and narrow trigger criteria.
- [ ] New-file review agreement appears in AGENTS, both skills and README; no automatic Git/Figma authorization implied.

## 2. Business rules critical for EduCore

- [ ] Role != position; user can have several roles but no permission outside selected tenant/scope.
- [ ] Student self, Parent verified link, Teacher assigned class, Accountant financial permission; deny by default, last Manager guard.
- [ ] Tenant bootstrap via CLI, OTP email, no temporary password; reset and activation OTP are separate purposes.
- [ ] P0-only external business exception OTP email; no Calendar/Gmail OAuth/payment/bank/notification email.
- [ ] Schedule confirmation all-or-nothing, six months, teacher/room/student conflicts, half-open time windows, recheck on commit.
- [ ] Attendance finalized to bill, locks at 48h/invoice issue, corrections audited.
- [ ] Invoice draft được tạo nhưng không tự ISSUE; giao dịch mới dùng TOP_UP CASH/BANK_TRANSFER đã xác minh rồi staff chủ động trả invoice ISSUED bằng WALLET; sibling 10%, VND bigint string.
- [ ] New pure-Wallet: approved adjustment/cancel chỉ credit net excess sau successful authorized execution; `APPROVED` riêng `COMPLETED`. Legacy/mixed/excess cũ giữ history và chặn affected mutation khi thiếu policy; không tự convert/RESOLVED.
- [ ] Submission versions preserved, published grades only shared with Student/Parent; private upload limits; resubmission cutoff reviewed before implementation.
- [ ] Workflow APPROVED different from COMPLETED; job/outbox retries idempotent; audit retention 24 months.

## 3. Security and UI review

- [ ] `SCREEN_MAP` `/app/:tenantId` treated as approved navigation convention, not an access grant; non-tenant P1 platform concepts not mounted.
- [ ] 401/403/404/409/422/429 states do not leak cross-tenant resource identifiers.
- [ ] Scheduling preview clearly “not a reservation”; confirmation cannot partially succeed.
- [ ] Parent/student financial summaries do not expose internal ledger beyond permitted child info.
- [ ] No `localStorage` access token; refresh cookie SameSite/Origin/CSRF guidance acknowledged as deployment-dependent.
- [ ] Visuals include accessible labels, errors, focus, keyboard, responsive and data-loading states.
- [ ] Figma integration is treated as optional/verified, never assumed to have an editable file.

## 4. Model/token efficiency review

- [ ] Luna/Sol/Astra names and effort thresholds reflect official sources at date, not immutable availability claims.
- [ ] README explains API token pricing differs from Codex subscriptions and model menus.
- [ ] Avoid cheap-model rework trap: escalate on real failing tests / complexity.
- [ ] Each prompt scopes source IDs, file paths and expected output; no “read the entire codebase” instruction.
- [ ] `AGENTS.md` avoids long repeated guidelines; dynamic skills carry task-specific work.
- [ ] Review checkpoints happen before wide edits and before any Git or Figma write.

## 5. Slice implementation readiness (apply separately per feature)

- [ ] Selected use case/FR/Q/BR and P0/P1 boundaries named.
- [ ] Feature spec reviewed with actor, backend permission, object scope and privacy.
- [ ] Request-response API schema and DB constraints/transactions tested (or clearly pending).
- [ ] UI states cover empty/loading/error/forbidden/conflict/success and mobile.
- [ ] Tests include at least happy, boundary, wrong tenant, wrong scope, duplicate and conflict.
- [ ] Test commands listed were **actually run**, with failures and missing deps disclosed.
- [ ] Reviewer approved exact new/changed files before any commit/push/PR.

## 6. Release result

**Per-slice or transfer status:** `DRAFT / CHANGES_REQUESTED / APPROVED_FOR_IMPLEMENTATION / APPROVED_FOR_REPO_COPY`  
**Reviewed by:** `________`  
**Date:** `________`  
**Approved paths (if any):** `________`  
**Open issues:** `________`  
**Git operations permitted?** `No, unless separately and explicitly authorized.`

## 7. Stitch reuse v1.0 signoff

- [ ] `STITCH_REUSE_REVIEW.md` reviewed (keep/change/remove rationale).
- [ ] `DESIGN_TOKENS.md` palette, dimensions, typography approved or changed.
- [ ] Canonical UI ID policy and route proposal approved or changed.
- [ ] `SCREEN_SPECIFICATIONS.md` checked for AU06 and BL07–BL11 Wallet/legacy corrections.
- [ ] `SCREEN_FLOWS.md` F01 activation and F05 TOP_UP → WALLET payment → approved execution/legacy paths reviewed.
- [ ] One-screen workflow demonstrated with G01 or AU06 before any large-scale design.
