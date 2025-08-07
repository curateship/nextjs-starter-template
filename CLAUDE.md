# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start development server:**
```bash
npm run dev
# Uses Next.js with Turbopack for fast development
```

**Build and deployment:**
```bash
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

**Testing:**
No specific test commands configured. Check for testing setup before running tests.

## Architecture Overview

This is a **multi-tenant platform** for managing multiple sites with theme-based customization, built on Next.js 15.3.4 with App Router.

### Core Architecture Patterns

**Multi-Site Structure:**
- `/app/(main)/` - Main application routes with navbar/footer layout
- `/app/admin/` - Admin dashboard for platform management  
- `/app/themes/marketplace/` - Theme-specific layouts and components
- Each route group has its own layout system for proper theme isolation

**Component Organization:**
- `/src/components/admin/` - Admin dashboard components
  - `layout/` - Admin-specific layout components (sidebar, headers)
  - `modules/` - Feature modules (posts, products, sites, themes, users)
- `/src/components/frontend/` - Public-facing theme components
  - `layout/` - Theme layout components (navigation, footer)
  - `modules/` - Content modules (posts, products with theme variants)
- `/src/components/ui/` - Shared UI components (Shadcn/ui based)

**Block-Based Architecture:**
The platform uses a modular block system for content management:
- Layout blocks in `frontend/layout/` for structural components
- Content modules in `frontend/modules/` for specific content types
- Admin modules in `admin/modules/` for management interfaces
- Each block type has theme-specific variants

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

### Critical Development Rules

**🔒 Block Isolation Protocol:**
1. **BLOCK-ONLY CHANGES** - Only modify the specific block being worked on
2. **NO EXTERNAL CHANGES** - Don't modify files outside block scope without approval
3. **USER CONFIRMATION** - Get approval for any changes outside block scope  
4. **ISOLATION FIRST** - Solve problems within the block whenever possible
5. **COMPONENT EXTRACTION** - Break complex blocks into focused components

### Critical Development Rules

**🚨 SECURITY RULES (NEVER VIOLATE):**
1. **NEVER hardcode credentials** in client-side code - EVER
2. **NEVER implement client-side only authentication** - always use server-side validation
3. **NEVER store sensitive data** in localStorage without encryption
4. **ALWAYS validate authentication** on the server side
5. **ALWAYS use secure session management** (httpOnly cookies, JWTs with proper expiration)

**⚡ CODING STANDARDS (MANDATORY):**
1. **NEVER take shortcuts** that compromise security, maintainability, or code quality
2. **ALWAYS follow best practices** - proper error handling, validation, and secure coding patterns
3. **NEVER sacrifice security for speed** - security vulnerabilities are NEVER acceptable trade-offs
4. **ALWAYS implement server-side validation** before client-side convenience features
5. **NEVER use temporary "quick fixes"** that expose security risks - fix the root problem properly
6. **ALWAYS ask for guidance** when stuck instead of implementing dangerous workarounds
7. **NEVER commit code** that you wouldn't be comfortable running in production
8. **ALWAYS consider the security implications** of every code change before implementation
9. **MANDATORY DISCLOSURE**: If Claude cannot find a solution that follows these coding standards, it MUST explicitly state that it might need to break coding standards and that it cannot and will not proceed until it has approval to explore alternative paths

**📋 CODE GENERATION PROTOCOL:**
- **MANDATORY**: Every time code is generated or modified, Claude must state "claude.md followed" to confirm these rules have been read and followed
- This serves as a checkpoint to ensure security and coding standards are never overlooked

### Database Schema (Planned)

**Authentication System:**
- `users_super_admins` - Platform administrators
- `users_tenant_roles` - Site owners  
- `users_site_level` - Future site-level users
- `users_details` - Shared user profile data

**Multi-Site Management:**
- `sites` - Site configurations and ownership
- `site_settings` - Theme customizations per site
- `site_pages` - Page definitions per site
- `page_blocks` - Block configurations per page

## Key Technologies

- **Framework:** Next.js 15.3.4 with App Router and TypeScript
- **Styling:** Tailwind CSS 4 with custom design system
- **UI Components:** Shadcn/ui with Radix UI primitives
- **Fonts:** Urbanist and Geist Mono via next/font
- **Icons:** Lucide React
- **Analytics:** Vercel Analytics and Speed Insights

## Development Patterns

**Theme System:**
- File-based themes in `/app/themes/{theme-name}/`
- Database customization for colors, fonts, logos
- Layout components use theme-specific implementations

**Component Extraction:**
- Break large components into focused, single-purpose parts
- Follow hierarchy: Main component → dependencies → supporting components
- Eliminate deep nesting and maintain clean code structure

**TypeScript Usage:**
- Path aliases configured: `@/*` maps to `./src/*`
- Strict TypeScript configuration enabled
- Component props should be properly typed

## File Structure Context

The project follows a modular architecture designed for multi-tenancy:
- Admin routes are separate from public routes
- Theme isolation through dedicated route groups
- Component organization by function (admin/frontend/ui)
- Block-based content system for flexible page building

When working on this codebase, always consider the multi-tenant nature and maintain proper separation between admin, theme, and content components.