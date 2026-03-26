# User Dashboard Builder Implementation Plan

## Overview

Build a new specialized User Dashboard Builder following the existing multi-builder architecture pattern (page, product, post, event, directory, taxonomy builders).

## Decision: New Builder vs. Extending Page Builder

**Decision**: Build a new specialized builder

**Reasons**:
- Page builder is site-scoped (one page for all visitors)
- Dashboards are user-scoped (personalized per user)
- No authentication/authorization in current page builder
- Different data models and security requirements
- Follows established pattern of specialized builders in codebase

## Architecture

### Site-Scoped Dashboard

Each site has its own dashboard configuration:

```
Platform
├── Site A (e.g., "Fitness Academy")
│   └── User Dashboard (configured by Site A admin)
│       └── All Site A users see this dashboard with their own data
│
├── Site B (e.g., "Cooking School")
│   └── User Dashboard (configured by Site B admin)
│       └── All Site B users see this dashboard with their own data
```

### Structure

- **One dashboard per site** (not per user)
- **Same structure for all users** of that site
- **Content is contextual** - each user sees their own data
- **Multiple pages** within dashboard (e.g., home, profile, settings)
- **Shared navigation and footer** across all dashboard pages

### Data Model

```
site_dashboard_config
├── id (uuid)
├── site_id (uuid) - scoped to site
├── settings (jsonb) - stores navigation and footer
└── timestamps

site_dashboard_pages
├── id (uuid)
├── site_id (uuid) - scoped to site
├── slug (string) - e.g., 'home', 'profile', 'settings'
├── title (string)
├── content_blocks (jsonb) - page-specific blocks
├── display_order (integer)
├── is_default (boolean) - landing page
└── timestamps
```

## Navigation and Footer Pattern

Following the exact same pattern as the page builder:

### Storage
- Stored in `site_dashboard_config.settings` (not in individual pages)
- One navigation + one footer for entire dashboard
- Shared across all dashboard pages

### Protected Blocks
- Cannot be deleted (same protection system as page builder)
- Navigation always first, footer always last
- Drag handles disabled in admin UI
- Delete button grayed out with tooltip

### Separate Save Actions
- Navigation/footer saved to `site_dashboard_config.settings`
- Regular blocks saved to `site_dashboard_pages.content_blocks`

### Layout-Level Rendering
- `DashboardLayout` component wraps all dashboard pages
- Receives navigation + footer from config.settings
- Renders nav at top, footer at bottom
- Dashboard page blocks render in between

## Admin Workflow

1. Platform admin (super_admin) navigates to `/admin/dashboard-builder/[siteId]`
2. Configures navigation (logo, links, buttons)
3. Creates dashboard pages (home, profile, settings, etc.)
4. Adds blocks to each page
5. Configures footer
6. Saves configuration
7. All end_users of that site see this dashboard structure at `/user-dashboard/*`

**Note**: Currently `/admin` is for platform admins (super_admin role). Future `/tenant` routes will be for site owners.

## User Experience

### Frontend Routes
- `/user-dashboard` - Default dashboard page (end_user access)
- `/user-dashboard/profile` - Profile page
- `/user-dashboard/settings` - Settings page
- `/user-dashboard/[custom-pages]` - Additional pages

### Contextual Rendering

Blocks render user-specific data based on logged-in user:

**Example: User Profile Block**
- Admin configures: "Show avatar, email, join date"
- Frontend renders: Current user's avatar, email, join date
- Each user sees their own data in the same block structure

## Block Types

### Initial Block (Phase 1)
- **User Profile & Settings Block** - Display/edit user info, avatar, preferences

### Future Blocks
- **Membership Status Block** - Current plan, benefits, renewal
- **Content Library Block** - Purchased products, enrolled courses
- **Activity Feed Block** - Recent actions, updates
- **Progress Tracker Block** - Course completion, goals
- **Analytics Dashboard Block** - Personal stats, insights

### Supporting Blocks
- **Hero Block** - Headers with title, subtitle, CTA
- **Rich Text Block** - Flexible content
- **Divider Block** - Visual separators

## Security & Authentication

**Prerequisites**: Must complete authentication security hardening BEFORE building dashboard (see `authentication-architecture.md`)

- Row Level Security (RLS) policies on dashboard tables
- User session awareness in block rendering
- Permission checks at layout level
- Role-based access: end_user can access `/user-dashboard/*`, super_admin cannot (or has read-only access)
- Each site configures their own dashboard, but all end_users see the same structure

## Implementation Phases

### Phase 1: Foundation
- Database schema and migrations
- RLS policies
- Server actions for CRUD operations
- Basic routing structure

### Phase 2: Admin Builder Interface
- Copy and adapt from page builder
- Reuse existing components (BlockSelectionModal, BlockListPanel, etc.)
- Create `useUserDashboardBuilder` hook
- Dashboard block type configuration

### Phase 3: Essential Blocks
- User Profile & Settings Block
- Supporting blocks (hero, rich text, divider)
- Navigation and footer blocks

### Phase 4: Frontend Rendering
- `DashboardLayout` component
- Block renderer with auth protection
- User context provider
- Dashboard page routing

### Phase 5: Polish & Testing
- Error handling and loading states
- Test auth flows and RLS policies
- Multiple dashboard pages support
- Preview functionality

## Code Reusability

Can reuse 70-80% of existing builder components:
- `BlockSelectionModal` - Change block types
- `BlockListPanel` - Identical functionality
- `BlockPropertiesPanel` - Same pattern
- `StickyHeader` - Minor modifications
- Drag-and-drop infrastructure
- UI components (shadcn/ui)
- JSON storage pattern
- Server action pattern

## Timeline Estimate

- Phase 1 (Foundation): 3-5 days
- Phase 2 (Admin Builder): 3-5 days
- Phase 3 (Blocks): 5-10 days
- Phase 4 (Frontend): 2-3 days
- Phase 5 (Polish): 3-5 days

**Total**: 2-3 weeks for full implementation

## Key Differences from Page Builder

| Aspect | Page Builder | Dashboard Builder |
|--------|-------------|------------------|
| Scope | Site-wide public pages | Site-wide user dashboard |
| Data | Static content | Dynamic user-specific data |
| Access | Public | Authenticated users only |
| Rendering | Same for all visitors | Contextual to logged-in user |
| Storage | pages.content_blocks | site_dashboard_pages.content_blocks |
| Nav/Footer | sites.settings | site_dashboard_config.settings |

## Future Enhancements

- Role-based access control (admin, member, free user dashboards)
- User customization (allow users to personalize their own dashboard)
- Dashboard templates (pre-built dashboard structures)
- Additional block types (analytics, notifications, etc.)
- Dashboard theming separate from site theme
