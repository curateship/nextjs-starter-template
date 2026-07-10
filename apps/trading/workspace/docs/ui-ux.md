# UI-UX Design Guide

Rules that keep every Trading screen visually consistent. Read this before building or changing any page layout.

## Spacing: one gap everywhere (THE rule)

The app has exactly one layout gap, and every page must use it.

**Where the gap is defined:** the shared page wrapper `DashboardContent` (`src/components/ui/dashboard-content.tsx`):

```
p-3 space-y-4 sm:p-4 sm:space-y-6 md:p-6
```

That means the gutter around a page's content is **24px on desktop** (Tailwind spacing `6`), shrinking on smaller screens. This gutter — the space between the sidebar and the first card — is the site gap. Everything else must match it.

**The rule:** every layout-level gap inside a page must equal the site gap:

- gap between side-by-side columns → `gap-4 sm:gap-6`
- gap between stacked cards/sections → `gap-4 sm:gap-6` or `space-y-4 sm:space-y-6`

**Never:**

- invent a different layout gap (`gap-3`, `gap-5`, `gap-8`, ad-hoc `mb-*`/`mt-*` between cards)
- add your own padding wrapper around a page — `DashboardContent` already provides the gutter; extra wrappers create a double gap
- mix gap sizes on the same page so cards sit closer/farther from each other than they sit from the sidebar

Small gaps *inside* a card (e.g. `gap-1`/`gap-2` between a label and a value) are fine — this rule is about the gaps between cards, columns, and sections.

### Reference screenshots

- **Wrong** — card gaps wider than the site gutter, page looks inconsistent:
  ![wrong gap](assets/pasted-image-1783710798036774000.png)
- **Right** — this is the site gap every layout gap must match (sidebar-to-card gutter):
  ![site gap](assets/pasted-image-1783710819371950000.png)

## Other standing design rules

- Use the existing shadcn components in `src/components/ui/` — don't hand-roll parallel versions.
- Reuse the shared chart/table/card patterns already on other dashboards instead of building page-specific variants.
