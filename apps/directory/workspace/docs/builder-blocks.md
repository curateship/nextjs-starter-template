# Hub Builder Blocks

Use this guide when adding or changing a block in a Hub content builder. Treat the current code in the target builder as the source of truth: builders share a lifecycle, but not one fixed file layout.

## Block Lifecycle

A complete block must be:

1. Registered with a stable type, label, icon, description, and default content.
2. Accepted by the builder's parsing or supported-type checks.
3. Editable through the builder's editor selection path.
4. Visible in the builder preview or canvas.
5. Persisted and restored without losing typed content.
6. Rendered in the public or delivery output when that builder has one.

Do not assume every block requires exactly five files. Inspect the closest existing block in the same builder and follow its complete path.

## Current Builder Map

All paths below are relative to `apps/hub/src/`.

| Builder | Registry | Editor selection | Preview | Output renderer |
| --- | --- | --- | --- | --- |
| Product | `components/admin/product-builder/config/product-block-types.tsx` | Product builder and template route files | `components/admin/product-builder/layout/ProductPreview.tsx` | `components/frontend/products/ProductBlockRenderer.tsx` |
| Page | `components/admin/page-builder/config/page-block-types.tsx` | `components/admin/page-builder/layout/PageBlockEditorDialog.tsx` | `components/admin/page-builder/layout/PagePreview.tsx` | `components/frontend/pages/PageBlockRenderer.tsx` |
| Post | `components/admin/post-builder/config/post-block-types.tsx` | `components/admin/post-builder/layout/PostBlockEditor.tsx` | `components/admin/post-builder/layout/PostPreview.tsx` | `components/frontend/posts/PostBlockRenderer.tsx` |
| Category | `components/admin/category-builder/config/category-block-types.tsx` | `components/admin/category-builder/layout/CategoryBlockEditor.tsx` | `components/admin/category-builder/layout/CategoryPreview.tsx` | `components/frontend/categories/CategoryBlockRenderer.tsx` |
| Directory | `components/admin/directory-builder/config/directory-block-types.tsx` | `components/admin/directory-builder/layout/DirectoryBlockEditor.tsx` | `components/admin/directory-builder/layout/DirectoryPreview.tsx` | `components/frontend/directories/DirectoryBlockRenderer.tsx` |
| Event | `components/admin/event-builder/config/event-block-types.tsx` | `components/admin/event-builder/layout/EventBlockEditor.tsx` | `components/admin/event-builder/layout/EventPreview.tsx` | `components/frontend/events/EventBlockRenderer.tsx` |
| Account page | `components/admin/account-page-builder/config/account-page-block-types.tsx` | `components/admin/account-page-builder/layout/AccountPageBlockEditorDialog.tsx` | `components/admin/account-page-builder/layout/BlockPropertiesPanel.tsx`, which reuses `PagePreview` | `components/frontend/pages/PageBlockRenderer.tsx` with account blocks enabled |
| Newsletter | `components/admin/newsletter-builder/config/newsletter-block-types.tsx` | `components/admin/newsletter-builder/layout/NewsletterBlockEditor.tsx` | `components/admin/newsletter-builder/layout/NewsletterPreviewPane.tsx` and `NewsletterCanvas.tsx` | `lib/actions/newsletters/render.ts` |

Product blocks must also remain allowed by product template actions when templates can persist the new type. Post parsing and rendering maintain explicit supported-type lists that must stay aligned with the registry. Check for similar allowlists in the target builder with `rg`.

## Implementation Workflow

1. Read the target registry and one neighboring block with similar behavior.
2. Search the block type from registry through parsing, editor, preview, persistence, and renderer paths.
3. Define one typed content shape and safe defaults. Keep editor and renderer expectations aligned; avoid introducing new `any` casts.
4. Register the block and update supported-type or validation lists that do not derive from the registry.
5. Add the editor using the target builder's shared controls, modal or tab conventions, visibility settings, and media handling.
6. Add preview and output rendering. Reuse existing containers, width rules, and empty-state behavior.
7. Verify adding, editing, saving, reloading, reordering, deleting, previewing, and final rendering as applicable.

## Guardrails

- Preserve existing block type identifiers once content may be persisted.
- Do not copy paths or editor structure from another builder without checking the target builder.
- Keep block content serializable and backward-safe for already stored blocks.
- Add actions, validation, or database changes only when the existing content payload cannot represent the feature.
- Use existing shared UI components and accessibility patterns.
- Update this document when builder architecture or conventions change.

## Verification

Run focused tests, Hub type checks and linting required by repository guidance, then validate the affected builder in a running Hub instance. Confirm both the admin experience and the final rendered or delivered output.
