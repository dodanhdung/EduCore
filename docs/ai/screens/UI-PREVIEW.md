# UI Preview Mode — screen review contract

Status: `PROPOSED` · UI-only development aid

## Scope and screen mapping

Preview only the approved canonical UI IDs `AU02`, `AU05`, and `GL01`, using the existing screen components and small local fixtures. Canonical business routes remain unchanged: AU02 `/select-tenant`, AU05 `/app/:tenantId/me`, and GL01 `/app/:tenantId/notifications`.

Development URLs are `/__ui-preview/AU02`, `/__ui-preview/AU05`, and `/__ui-preview/GL01`. The preview is selected in the Vite entry point only when `import.meta.env.DEV` is true. It is not registered in `routes.ts`; all other paths load the normal application and retain its authentication and tenant guards.

## Data and behavior

- AU02: two local sample tenants. Choosing one updates only preview-local selection.
- AU05: sample principal/session and selected tenant. Logout is inert in preview; no session is created or revoked.
- GL01: two unread and one read sample notification; the existing all/unread filter works locally.
- Persistent mutations, permission evidence, and API operations are not simulated.
- Every preview screen displays `Dữ liệu mẫu — UI Preview` and explains that no API or login session is used.

## State and responsive coverage

This preview is for visual inspection of populated fixture states on desktop and mobile. Existing components continue to render their ordinary empty and no-tenant states when given empty data; those are not separate preview routes. Keyboard focus remains visible through the shared global focus styles. Review the preview banner and existing screen layout at narrow widths.

## Security and production boundary

The preview branch is guarded at the app entry point by Vite's development constant, and the normal app is dynamically loaded otherwise. Verify a production build excludes preview URLs and the preview module. Do not use the fixture session or tokens as authentication evidence.
