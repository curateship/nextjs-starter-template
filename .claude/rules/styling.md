# Styling Rules

## Admin Pages
- Always wrap admin page content in `AdminLayout`
- Always use the `Card` component from `@/components/ui/card` for content sections
- NEVER add extra padding (`px-*`, `py-*`, `space-y-*`, `gap-*`) around or between Cards — `AdminLayout` provides `px-5 pt-[15px]` and `Card` has built-in `mb-7 mx-4` margins
- Match existing admin page patterns (analytics, dashboard) for grid layouts — use `grid md:grid-cols-2 lg:grid-cols-4` with Cards directly inside, no gap utilities
