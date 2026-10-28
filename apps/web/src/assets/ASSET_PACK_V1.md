# EduCore R12 — Asset Pack V1

Status: **PROPOSED · owner review pending**. Shared UI asset slice explicitly requested on 28/10/2026. Canonical anchor: **G01**, with AU01/GL01/OP01 consumers. Base: `test/r10-local-demo-data`, `ed421080323c42abb5bbb4dd4c1c560f62dfd949`.

## Contract

Reuse the six R10 navigation exports byte-for-byte. Add only missing assets with a verified Figma source and an actual consumer. No library/dependency, avatar, portrait, API, DB, RBAC, business-state, Figma or favicon change. The existing dirty R10 frontend is a dependency of this review, not work recreated by R12. The ZIP includes a patch relative to that working-tree baseline.

Sources: `docs/ai/PROJECT_CONTEXT.md`, DESIGN_TOKENS/UI_GUIDELINES v1.0, SCREEN_MAP and the G01/AU01/GL01/OP01 specification cards; UC-01/04/32, FR-02/40, Q-01/12. Current components/controllers remain authoritative for behavior. Figma file `xEdI4S3TJU0mKqQYUSPZhp`, G01 `43:3`, brand `43:424/425`, GL01 empty `37:597`, StatusBadge `84:10`. Complete per-file mapping and classifications live in `asset-inventory.json`.

## React usage and color

```tsx
import { AssetIcon } from './assets/AssetIcon.tsx'
import { BrandLogo } from './assets/BrandLogo.tsx'

<button className="ec-icon-label"><AssetIcon name="refresh" />Thử lại</button>
<AssetIcon name="notifications" label="Thông báo" />
// Proposal/review only until brand approval:
<BrandLogo variant="horizontal" />
```

The SVG paths, native viewBoxes, colors and dimensions remain original Figma exports. `AssetIcon` uses each SVG's alpha mask and `currentColor`, with a **20×20 slot**, 16/24 optional, and native glyph proportions. It does not stretch the fractional Figma exports into squares or use CSS filters. The runtime component has no external request and imports local URLs through Vite. The Figma icons are filled glyphs; the documentation's Lucide-style outline preference does not justify redrawing existing design assets.

Use primary `#2563EB`, primary-hover `#1D4ED8`, text `#0F172A`, secondary `#475569`, muted `#64748B`, success `#15803D`, warning `#B45309`, danger `#B91C1C`, on white or `#F8FAFC`. Consumers inherit existing semantic CSS tokens. Brand candidates use the Figma blue/white/ink palette. They have **not** been approved for dark surfaces; preview shows a white holding plate there. Do not infer a supported product dark theme.

## Accessibility and state semantics

- Icons next to visible labels are decorative (`aria-hidden`); the label names the action. An icon-only control needs its own Vietnamese `aria-label` and 44px touch target. The icon alone is 20px, not a touch target.
- For a meaningful standalone icon, pass `label` for `role="img"`. Do not give both icon and button the same accessible name. SVG files used through `<img>` need consumer `alt`; candidates do not embed duplicated title IDs.
- Keep readable domain labels. APPROVED is an approval decision; COMPLETED is completed execution. A check icon on “Đánh dấu đã đọc” describes that action, not financial success. Color alone never determines status.
- Forced colors retain inherited system text color; no motion is added. Empty inbox `37:597` has **text only**. Reuse `EmptyState`/existing copy; no new illustration or role avatar.

## Candidates and boundaries

`educore-symbol-candidate.svg` is the exported 32px G01 mark. **Compact and favicon candidate alias that same file**; do not create duplicate SVGs. `educore-horizontal-candidate.svg` crops only the empty padding of G01 `43:424` to `viewBox="24 16 108 32"`; the original paths and outlined Be Vietnam Pro wordmark remain intact. Both are proposals. AU01 already has a related open-book glyph at 24/18px; preserve it. `BrandLogo` is available for review but is not mounted in the product. `public/favicon.svg` and `index.html` stay unchanged.

No separate filter SVG: OP01 uses labeled native search/select controls without a filter glyph. No new status SVG family: reuse Badge/StatusBadge and readable labels. No bulk button replacement, screenshot-as-asset, temporary Figma URL, or P1 action.

## Verification and review

Run `node scripts/verify-asset-pack.mjs`, `pnpm.cmd --dir apps/web lint`, `pnpm.cmd --dir apps/web build` and the relevant existing frontend tests. Open `docs/reviews/r12-assets/preview.html` directly, or through Vite at `/@fs/D:/EduCore/docs/reviews/r12-assets/preview.html`. The portable ZIP retains repository-relative asset paths. The contact sheet shows native/16/20/24 sizes, white/slate/primary surfaces, brand at 16/24/32 and horizontal 108×32, typography and no-illustration empty state.

Owner approval remains necessary for logo/favicons and wider rollout. No pixel-perfect or official-brand sign-off is claimed. No Git commit/push/merge/deploy is authorized by this task.
