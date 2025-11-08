# Authentication Architecture

## Overview

Role-based shared login system using Supabase Auth with two primary user roles: `end_user` (regular users) and `super_admin` (platform administrators).

## Decision: Role-Based vs. Separate Login Systems

**Decision**: Implement role-based shared login with Supabase Auth

**Reasons**:
- Already built this way - codebase uses single Supabase Auth for all users
- Lower refactor risk - builds on existing foundation
- Business logic alignment - lead magnet users can transition seamlessly
- Shared data model already in place (`product_orders` links both user types)
- Simpler codebase and session management

## Current State (Critical Security Gaps)

### What Works
- Supabase Auth configured and operational
- Login/signup flows at `/auth/login` and `/auth/signup`
- Auto-account creation for lead magnet downloads
- Basic user dashboard at `/user-dashboard`

### Security Issues (MUST FIX)
1. ❌ **No admin role enforcement** - anyone can access `/admin` routes
2. ❌ **Client-side auth only** - admin layout uses client-side redirect (can be bypassed)
3. ❌ **Empty middleware** - no route protection at middleware level
4. ❌ **Inconsistent RLS policies** - some use `raw_app_meta_data`, some use `user_metadata`

## Role Structure (Simplified)

Two roles stored in `auth.users.raw_app_meta_data.role`:

### end_user (Default)
- **Access**: `/user-dashboard/*` only
- **Who**: Lead magnet downloaders, product purchasers, regular site users
- **Default role** for all new signups

### super_admin
- **Access**: `/admin/*` (platform administration)
- **Who**: Platform administrators only
- **Manually assigned** via SQL or admin API

### Future: site_owner (Shelved for Now)
- Will access `/tenant/*` routes
- For multi-tenant SaaS when ready
- Not part of current implementation

## Authentication Flow

### Regular Users (end_user)
1. User signs up at `/auth/signup` → auto-assigned `end_user` role
2. Or auto-created via lead magnet download → `end_user` role
3. Login redirects to `/user-dashboard`
4. Access denied to `/admin` routes → redirect to `/user-dashboard`

### Super Admins (super_admin)
1. Manually created via SQL with `super_admin` role
2. Login redirects to `/admin`
3. Full access to platform administration

## Route Protection

### Middleware Protection (`/src/middleware.ts`)
- Protect `/admin/*` routes - require `super_admin` role
- Allow `/user-dashboard/*` for all authenticated users
- Redirect based on role if accessing wrong area

### Layout-Level Guards
- Server-side role validation in layouts
- No client-side only protection
- Proper error handling and redirects

## Role Assignment

### Default Signup
- All new signups → `end_user` role automatically
- No public admin registration

### Lead Magnet Auto-Creation
- Auto-created accounts → `end_user` role
- Metadata: `created_from: 'lead_magnet'`

### Super Admin Creation
- Manual SQL execution or Supabase admin API
- Very limited - only for platform administrators

## RLS Policy Standardization

All policies must use consistent role checking:

```sql
-- Standard pattern (use raw_app_meta_data consistently)
USING (auth.uid() = user_id OR
       (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin')
```

**NOT**: Mixed use of `raw_app_meta_data` vs `user_metadata`

## Implementation Priority

### Phase 1: Security Hardening (CRITICAL - Must Do First)

1. **Middleware Route Protection**
   - Protect `/admin/*` routes
   - Role-based redirects
   - Server-side validation only

2. **Admin Layout Server-Side Validation**
   - Remove client-side auth check
   - Add server-side role validation
   - Proper 403 handling

3. **Create Initial Super Admin**
   - SQL script to create first super_admin
   - Document process for adding more

4. **Standardize RLS Policies**
   - Audit all policies
   - Consistent role field usage
   - Test policy enforcement

5. **Default Role Assignment**
   - Auto-assign `end_user` on signup
   - Update lead magnet auto-creation
   - Update signup flow

### Phase 2: User Dashboard Builder

Only start after Phase 1 is complete and security gaps are closed.

## Database Schema

No new tables needed for basic auth - uses Supabase `auth.users`:

```
auth.users
├── id (uuid)
├── email (string)
├── raw_app_meta_data (jsonb)
│   └── role: 'end_user' | 'super_admin'
├── user_metadata (jsonb)
│   └── created_from: 'lead_magnet' (optional)
└── timestamps
```

## Redirect Logic

### After Login
- `super_admin` → `/admin`
- `end_user` → `/user-dashboard`

### When Accessing Wrong Routes
- `end_user` tries `/admin` → redirect to `/user-dashboard`
- Unauthenticated tries `/admin` or `/user-dashboard` → redirect to `/auth/login`

## Future Enhancements (Not Now)

- `site_owner` role for multi-tenant SaaS
- Role upgrade flows
- Self-service role management
- Team/organization roles
- Granular permissions beyond roles

## Migration Path

### Current Platform Admins
- Need manual migration to `super_admin` role
- Script to update existing admin users
- Communicate change to current users

### Existing End Users
- Already have `end_user` role (or will be auto-assigned)
- No migration needed
- Existing lead magnet users continue working

## Security Best Practices

1. **Server-side validation only** - never trust client
2. **RLS policies enforced** - database-level security
3. **Role checks in middleware** - before request reaches handler
4. **HTTP-only cookies** - session tokens not accessible to JS
5. **Minimal privilege** - users only get access they need

## Testing Checklist

- [ ] Super admin can access `/admin` routes
- [ ] End user cannot access `/admin` routes
- [ ] End user can access `/user-dashboard` routes
- [ ] Unauthenticated user redirected to login
- [ ] Role-based redirects work after login
- [ ] RLS policies prevent unauthorized data access
- [ ] Cannot bypass auth with client-side manipulation

## User Management Dashboard

### Current State
- User management UI skeleton exists at `/admin/users`
- Mock data only - no real user fetching
- User settings page functional (for logged-in user)

### Required Features (Part of Phase 1)
- Replace mock data with real auth.users queries
- User list with pagination
- Basic user display (email, role, created date, last sign-in)
- Simple role display and status

### Future Enhancements
- User detail pages
- Search and filter
- User analytics/metrics
- Edit user capabilities
- Bulk operations

## Timeline Estimate

**Phase 1 (Security Hardening + User Management)**: 4-5 days
- Authentication security (3-4 days)
- Basic user management (1 day)
- Critical path before dashboard builder
- Must be completed and tested first
