## Favicon not showing in Post preview

**Symptom**: Globe icon shows instead of favicon in Post preview nav/footer.

**Fix (match Pages/Products):**
- Ensure full `site.settings` (with `favicon`) is passed to PostPreview caller.
- Merge settings instead of overwriting when adding nav/footer.
- Safety: normalize `settings.favicon` in preview-site factory.

Minimal edits:
```tsx
// /src/app/admin/posts/builder/[siteId]/page.tsx
site={{ id: siteId, name: site?.name || 'Post Site', subdomain: site?.subdomain || 'preview', settings: site?.settings }}

// /src/components/admin/post-builder/BlockPropertiesPanel.tsx
settings: { ...site.settings, navigation: siteBlocks?.navigation, footer: siteBlocks?.footer, show_featured_image: siteBlocks?.show_featured_image }

// /src/lib/utils/admin-builder-preview.ts
const base = site?.settings || {}
const tlFavicon = (site as any)?.favicon
const settings = base.favicon ? base : (tlFavicon ? { ...base, favicon: tlFavicon } : base)
```