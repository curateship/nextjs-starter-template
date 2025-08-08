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

**🔍 MANDATORY SECURITY AUDIT PROTOCOL:**
- **REQUIRED**: After every code addition, modification, or implementation, Claude MUST perform a comprehensive security audit
- **SCOPE**: Audit must include all newly added/modified code for vulnerabilities, security risks, and coding standards compliance
- **STANDARDS**: Must check for XSS, CSRF, SQL injection, input validation, authentication bypass, information disclosure, and all OWASP Top 10 vulnerabilities
- **BEST PRACTICES**: Verify adherence to secure coding practices, proper error handling, input sanitization, and defense-in-depth principles  
- **ACTION REQUIRED**: If vulnerabilities are found, they must be immediately fixed before proceeding
- **DOCUMENTATION**: Security audit results must be documented and any fixes applied must be explained
- **NO EXCEPTIONS**: This audit is mandatory for every code change, regardless of size or perceived risk level