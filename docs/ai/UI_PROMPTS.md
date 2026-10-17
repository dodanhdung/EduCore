# EduCore — One-screen UI design / Figma / Codex prompts

**Version:** 1.0 · **Status:** APPROVED reusable prompt templates; not permission to write in Figma or Git. Individual screen specs still require review.

## Model/tool usage

- No Figma connection is assumed. If connected and user explicitly authorizes editing a named Figma file, follow the relevant Figma tool workflow. Otherwise create a local reviewable screen proposal/spec or implement React only after approved slice.
- For visual prototyping, use `DESIGN_TOKENS.md` + matching `SCREEN_SPECIFICATIONS.md` card + `SCREEN_FLOWS.md` relevant Fxx + `SCREEN_REVIEW_TEMPLATE.md`. Do NOT paste all 71 cards.
- For React implementation, use `.agents/skills/educore-ui-slice/SKILL.md`, approved feature spec, and only necessary API definitions. A frame or screenshot does not define backend behavior.

## 1. Design ONE screen (no code)

```text
Task: Draft a design for [SCREEN_ID — Vietnamese title] only. Status PROPOSED.
Review: docs/vibecoding/SCREEN_MAP.md row [SCREEN_ID], the matching single card
in SCREEN_SPECIFICATIONS.md, DESIGN_TOKENS.md, relevant Fxx from SCREEN_FLOWS.md,
and UC-XX/Q-XX (only needed sections).
Frame: [desktop 1440x900 / mobile 390x844]; actor and object scope: [...].
Pattern reference: [G01 / AC01 / SC03 / AT02].
Preserve: Vietnamese fields/labels, exact P0 business rules, allowed actions, loading,
empty, invalid, conflict, denied, success and responsive states.
Do not invent API or build P1 control. Mock data labeled Dữ liệu mẫu.
Deliver: a reviewable wireframe/spec plus screen-to-UC/API/state mapping, open decisions.
No Figma write, no code, no Git operation without separate explicit authorization.
```

## 2. Implement ONE approved React screen

```text
Use educore-ui-slice skill. Target [SCREEN_ID] with approved screen review [path]
and approved feature spec [path]. Allowed source paths: [...].
Inspect installed apps/web packages before choosing shadcn/Tailwind/Router/Query.
Implement responsive, accessible React/TypeScript component with states [...],
using only approved REST operations. No implicit success for mutation; preserve form
on 409/422; hide action by scope for UX but rely on backend 403/404.
Do not implement P1, alter backend or create business mock services as live.
Return changed files, tests actually run, screenshot evidence if available,
errors and pending owner review. No commit/push/PR/Figma write.
```

## 3. Visual consistency review (cheap focused task)

```text
Review ONLY [SCREEN_ID] visual diff against approved token/style reference.
Do not change data fields, permission meaning, API calls or screen states.
Check sidebar/topbar, spacing, Vietnamese copy, focus/contrast, desktop/mobile,
and sample-data labeling. Report issues with paths; no unrelated refactors or Git.
```

## 4. Recommended first FOUR design references (review separately)

1. G01 (desktop) — only three P0 business KPIs, permission-aware tenant shell.
2. AC01 (desktop) — canonical scoped DataTable/filter/empty states.
3. SC03 + embedded SC04 (desktop) — complex form, preview, conflict, confirmation.
4. AT02 or AS07 (mobile) — touch-friendly vertical workflow, role-scoped data.

Use these as reference patterns, **not authorization to write four new screens at once**.
