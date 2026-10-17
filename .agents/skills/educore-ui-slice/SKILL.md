---
name: educore-ui-slice
description: Design or implement one approved EduCore Figma/React UI screen or component using one canonical SCREEN_MAP ID and its SCREEN_SPECIFICATIONS card, with a screen-review/feature spec; use for visual layout, responsive states, form behavior and accessibility without changing backend/DB business logic. Do not use for broad full-stack implementation.
---

# EduCore — UI-only screen slice

## Scope control

This skill is for **one screen (SCREEN-ID)** or a small set of explicitly approved components. Input must identify route/screen, intended role, UC/FR/Q references and approved or proposed backend/API contract. Read exactly one `SCREEN_MAP.md` row, the matching single card in `SCREEN_SPECIFICATIONS.md`, relevant Fxx from `SCREEN_FLOWS.md`, applicable sections of `UI_GUIDELINES.md` and `DESIGN_TOKENS.md`, and **only needed UC/API fields**. Do not load all 71 cards or 14 class modules. Canonical IDs are Stitch IDs; v0.9 IDs are aliases.

## Procedure

1. Inspect repo packages/components. React/Vite scaffold may not have Tailwind/shadcn/Router/Query installed: verify before importing. Never invent a Figma connection/file/frame.
2. Create **small screen contract first** using `SCREEN_REVIEW_TEMPLATE.md`: goal, role+data scope, navigation, fields, responsive frames, component hierarchy and UI state matrix (loading, empty, forbidden, invalid, conflict, stale, success). Mark design decisions `PROPOSED` unless approved.
3. Figma is **optional**. If owner has expressly approved editing an editable Figma file and integration exists, use official Figma workflow; otherwise create a **reviewable local UI proposal**. Do not invoke Stitch or assume a design file. Design reference hierarchy: G01 shell, AC01 list, SC03/SC04 form+conflict, AT02/AS07 mobile. Values in `DESIGN_TOKENS.md` are approved kit UI defaults (not official trademark/logo or existing Figma variables); still review visual exceptions on the chosen screen. Do not claim Figma updated without verified write.
4. React task after approval: build semantic accessible components; use React Hook Form + Zod/TanStack Query/shadcn only if installed or adding deps is part of approved scope; no hard-coded authorization rules as a security boundary. Use real approved API client or clearly labeled fixture for prototype.
5. Business-important UI: schedule preview != reserved, confirm all-or-nothing; manual invoice issue not auto; Workflow APPROVED != COMPLETED; grades visible to Student/Parent only when published; Parent linked child only; P0 notification in-app only.
6. Preview/test both desktop and mobile; ensure keyboard operation, labels, contrast and error handling. Include test evidence and screenshot if tool available.
7. Return a concise canonical-screen-to-UC/API mapping, changed files, states covered, visual evidence and pending review. **Never Git push/commit/PR, deploy, or modify Figma without explicit approval; all new files go through review first.**

## Deliverable guardrails

- Do not create P1 menus/screens in P0 just because architecture mentions them.
- No fake live financial figures, permissions or session state. Mark mock data PROTOTYPE.
- Only edit allowed UI paths; new files need owner review. Backend/DB changes require `educore-feature-slice` and a separate approved feature spec.
