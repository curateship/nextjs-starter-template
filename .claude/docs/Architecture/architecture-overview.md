## Architecture Overview

This is a **multi-tenant platform** for managing multiple sites with theme-based customization, built on Next.js 15.3.4 with App Router.

### Folder Structure & Component Organization

**Application Routes:**
- `/app/(main)/` - Main application routes with navbar/footer layout
- `/app/admin/` - Admin dashboard for platform management
- `/app/themes/` - Theme preview and demo pages

**Component Structure (MANDATORY ORGANIZATION):**
```
/src/components/
├── ui/                          # Reusable UI components (buttons, cards, inputs, etc.)
│   ├── button.tsx              # ShadCN and generic UI components
│   ├── card.tsx                # Follow kebab-case naming convention
│   ├── post-block.tsx          # Static UI blocks (posts, newsletters, etc.)
│   └── product-*-block.tsx     # Product-related UI components
│
├── admin/                       # Admin-specific components
│   └── layout/                  # Admin layout and builder components
│       ├── page-builder/        # Page builder components (Navigation, Footer, Hero)
│       ├── product-builder/     # Product builder components
│       └── image-library/       # Image management components
│
└── frontend/                    # Frontend-facing components
    └── layout/                  # Frontend layout components
        ├── pages/               # Page-specific components
        ├── products/            # Product display components
        └── shared/              # Shared frontend components (FAQ, Rich Text, etc.)
```

**Component Placement Rules:**
- **UI Components** (`/components/ui/`): Generic, reusable UI elements and static blocks
- **Admin Components** (`/components/admin/`): Admin dashboard and builder interfaces
- **Frontend Components** (`/components/frontend/`): User-facing display components
- **Shared Components** (`/components/frontend/layout/shared/`): Components used across multiple frontend contexts

**File Naming Conventions:**
- Components in `/components/ui/`: Use kebab-case (e.g., `product-hero-block.tsx`)
- Components in `/components/admin/` and `/components/frontend/`: Use PascalCase (e.g., `ProductHeroBlock.tsx`)
- Always use `.tsx` extension for React components

### Organization Principles

**Component Extraction Standards:**
- **Component Extraction**: Break large components into focused, single-purpose parts
- **Hierarchy**: Main component → direct dependencies → supporting components  
- **Clean Code**: Eliminate deep nesting and "ugly closing brackets"
- **Strategic Commenting**: Explain "why" not "what", avoid over-commenting

**Example Structure:**
```typescript
// Main component (clean, focused)
const NavBlock = () => (
  <nav>
    <MobileMenuButton />
    <DesktopNav />
    <MobileMenuPanel />
  </nav>
)

// Supporting components (extracted for clarity)
const DesktopNav = ({ menuItems, ...props }) => (...)
const MobileNav = ({ menuItems }) => (...)
```