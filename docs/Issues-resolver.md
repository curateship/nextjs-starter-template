# Issues Resolver

This document tracks common issues and their resolutions in the codebase.

## Navigation and Footer Not Appearing in Preview Components

**Issue**: Navigation and footer blocks do not appear in preview components (PostPreview, ProductPreview, etc.) even when they are configured in site settings.

**Root Cause**: Preview components use a generic `createPreviewSite` utility that expects navigation and footer data to be available in `site.settings.navigation` and `site.settings.footer`. However, builder pages often pass site data without the settings property, providing navigation and footer separately as `siteBlocks`.

**Solution**: In the builder component that calls the preview component, ensure the site object includes the navigation and footer in its settings:

```tsx
// Before (broken)
<PostPreview 
  blocks={blocks}
  site={site} // site.settings is undefined or missing navigation/footer
/>

// After (fixed)
<PostPreview 
  blocks={blocks}
  site={site ? {
    ...site,
    settings: {
      navigation: siteBlocks?.navigation,
      footer: siteBlocks?.footer
    }
  } : undefined}
/>
```

**Files Affected**:
- `/src/components/admin/post-builder/BlockPropertiesPanel.tsx` - Fixed in PostPreview call
- Potentially other builder components that use preview components

**How It Works**:
1. The `createPreviewSite` utility in `/src/lib/utils/admin-builder-preview.ts` checks for `site.settings.navigation` and `site.settings.footer`
2. If found, it adds these as navigation and footer blocks to the preview site blocks array
3. The preview renderer (PostBlockRenderer, ProductBlockRenderer, etc.) looks for these blocks in `siteBlocks` and passes them to `SiteLayout`
4. `SiteLayout` renders the navigation and footer if provided

**Prevention**: When creating new preview components or builder pages, always ensure that navigation and footer data from site settings are properly passed through to the preview component via `site.settings`.