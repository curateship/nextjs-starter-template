# Security Audit Report
**Date**: November 8, 2025
**Auditor**: Claude Code
**Scope**: Authentication, Authorization, API Security

---

## 🚨 CRITICAL VULNERABILITIES (MUST FIX IMMEDIATELY)

### 1. **CRITICAL: Unprotected Role Assignment API Endpoint**
**File**: `/src/app/api/auth/assign-role/route.ts`
**Severity**: 🔴 CRITICAL
**CVSS Score**: 9.8 (Critical)

**Issue**:
The `/api/auth/assign-role` endpoint is completely unprotected. ANY user (even unauthenticated) can call this endpoint to assign roles to any user ID.

**Attack Vector**:
```javascript
// Attacker can do this from browser console:
fetch('/api/auth/assign-role', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: '<any-user-id>' })
})
// This assigns end_user role, but code could be modified to assign super_admin
```

**Impact**:
- Attackers can manipulate any user's role
- Privilege escalation attack vector
- Complete bypass of authorization

**Fix Required**:
❌ **DELETE THIS ENDPOINT** - It's dangerous and unnecessary. Role assignment should only happen:
1. During signup (server-side only)
2. Via database migrations/SQL
3. Never via public API

---

### 2. **CRITICAL: Unprotected User Management Server Actions**
**File**: `/src/lib/actions/users/user-management-actions.ts`
**Severity**: 🔴 CRITICAL
**CVSS Score**: 8.2 (High)

**Issue**:
- `listUsers()` - NO authorization check
- `getUserById()` - NO authorization check

Any authenticated user can call these and access:
- All user emails
- User IDs
- Personal information
- Account metadata

**Attack Vector**:
```javascript
// Any logged-in user can see all users:
import { listUsers } from '@/lib/actions/users/user-management-actions'
const users = await listUsers() // Returns ALL users
```

**Impact**:
- Privacy violation (GDPR/CCPA)
- Data exposure
- User enumeration
- Information disclosure

**Fix Required**:
Add super_admin role check to ALL user management actions.

---

### 3. **HIGH: Debug Logging in Production**
**File**: `/src/middleware.ts` (lines 45-50, 54, 58)
**Severity**: 🟡 MEDIUM

**Issue**:
Console.log statements logging sensitive data:
- User emails
- Role information
- App metadata

**Impact**:
- Information leakage in production logs
- Potential GDPR violation

**Fix Required**:
Remove or wrap in `if (process.env.NODE_ENV !== 'production')`

---

### 4. **CRITICAL: Service Role Key Exposed in Git History**
**File**: `/.cursor/mcp.json`
**Severity**: 🔴 CRITICAL
**CVSS Score**: 10.0 (Critical)

**Issue**:
The Supabase service role key is hardcoded in `.cursor/mcp.json` and **WAS COMMITTED TO GIT**.

**Git History Evidence**:
```
890514f feat: add Supabase MCP configuration and enhance ProductFeaturesBlock layout
bb6dae0 Initial commit
```

**Impact**:
- ⚠️ **SERVICE ROLE KEY IS EXPOSED IN GIT HISTORY**
- Service role bypasses ALL RLS policies
- Attacker with access to Git repo can read/write/delete ANY data in database
- Complete database compromise
- Even if file is removed, key remains in Git history

**IMMEDIATE ACTION REQUIRED**:
1. **ROTATE service role key in Supabase dashboard RIGHT NOW**
2. Add `.cursor/` directory to `.gitignore`
3. Remove `.cursor/mcp.json` from Git tracking
4. Update local MCP config with new key
5. Consider rewriting Git history if repo is not public (dangerous operation)
6. If repo was ever public, assume database is compromised

**Long-term Fix**:
- Never hardcode secrets in configuration files
- Use environment variables for all sensitive credentials
- Add secret scanning to CI/CD pipeline

---

### 5. **HIGH: Cache Clear Endpoint Unprotected**
**File**: `/src/app/api/cache/clear/route.ts`
**Severity**: 🟠 HIGH
**CVSS Score**: 7.5 (High)

**Issue**:
The `/api/cache/clear` endpoint has NO authentication check. Anyone can clear the application cache.

**Attack Vector**:
```javascript
// Attacker can clear cache repeatedly
fetch('/api/cache/clear', { method: 'POST' })
```

**Impact**:
- Denial of Service (DoS) attack vector
- Performance degradation
- Increased server load

**Fix Required**:
Add super_admin role check before allowing cache clear.

---

### 6. **HIGH: Media Upload Endpoint May Lack Authorization**
**File**: `/src/app/api/media/upload/route.ts`
**Severity**: 🟠 HIGH

**Issue**:
File upload endpoint validates file type and size but authorization check happens in the `uploadMediaAction` server action. Need to verify super_admin or site ownership is properly checked.

**Potential Impact**:
- Unauthorized media uploads
- Storage abuse
- Malicious file uploads

**Fix Required**:
Verify uploadMediaAction properly validates user authorization.

---

### 7. **MEDIUM: Using getSession() Instead of getUser()**
**File**: `/src/middleware.ts`
**Severity**: 🟡 MEDIUM

**Issue**:
Supabase warns:
```
Using the user object from getSession() could be insecure!
This value comes from cookies and may not be authentic.
Use supabase.auth.getUser() instead.
```

**Impact**:
- Potential session spoofing
- Insecure authentication validation

**Fix Required**:
Replace `supabase.auth.getSession()` with `supabase.auth.getUser()` in middleware and critical checks.

---

## ✅ SECURITY STRENGTHS

### What's Working Well:

1. **✅ No Hardcoded Secrets**
   - All secrets in environment variables
   - Service role key never exposed to client

2. **✅ Service Role Key Usage**
   - Properly restricted to server-side only
   - Never sent to client

3. **✅ Middleware Protection**
   - `/admin` routes protected (super_admin only)
   - `/user-dashboard` routes require authentication
   - Proper redirect handling

4. **✅ Input Validation on Signup**
   - Email validation
   - Password confirmation
   - Length checks

5. **✅ RLS Policies Exist**
   - Database-level security
   - User data isolation

---

## ⚠️ MEDIUM/LOW ISSUES

### 8. **RLS Role Field Inconsistency**
**Severity**: 🟡 MEDIUM

**Issue**:
Most RLS policies check for 'admin' role, but the application now uses 'super_admin' role.

**Files Affected**:
- `/supabase/migrations/004_setup_relationships_and_policies.sql` - checks for 'admin'
- `/supabase/migrations/020_add_pages_rls_policies.sql` - checks for 'admin'
- `/supabase/migrations/021_add_products_rls_policies.sql` - checks for 'admin'
- `/supabase/migrations/068_add_product_orders_rls.sql` - checks for 'admin' in user_metadata
- `/supabase/migrations/081_standardize_role_checks.sql` - standardizes to 'super_admin' in app_metadata

**Impact**:
- Super_admin users may not have access to some resources
- Migration 081 only updates product_orders, not other tables

**Fix Required**:
Create new migration to update ALL RLS policies to use 'super_admin' instead of 'admin'.

---

### 9. **Migration 081 Not Fully Applied**
**Severity**: 🟡 MEDIUM

**Issue**:
Migration 081 only updates product_orders RLS policies but doesn't update other tables (sites, pages, products, etc.).

**Impact**:
- Inconsistent role checking across database
- Some tables check 'admin', others check 'super_admin'

**Fix Required**:
1. Apply migration 081: `npx supabase db push`
2. Create comprehensive migration to standardize ALL tables to 'super_admin'

---

### 10. **No Rate Limiting**
**Severity**: 🟡 MEDIUM

**Issue**:
No rate limiting on:
- Login attempts
- Signup attempts
- API endpoints
- Role assignment endpoint
- Cache clear endpoint

**Impact**:
- Brute force attacks possible
- Account enumeration
- DDoS vulnerability

**Recommendation**:
Implement rate limiting middleware for sensitive endpoints.

---

### 11. **No CSRF Protection on API Routes**
**Severity**: 🟢 LOW

**Status**:
Next.js Server Actions have built-in CSRF protection, but API routes do not.

**Recommendation**:
If adding more API routes, implement CSRF tokens.

---

## 🔧 REQUIRED FIXES

### Priority 0 (EMERGENCY - Fix RIGHT NOW):

1. **🚨 ROTATE SERVICE ROLE KEY IN SUPABASE DASHBOARD 🚨**
   - `.cursor/mcp.json` with service role key WAS COMMITTED TO GIT
   - Key is in commits 890514f and bb6dae0
   - Go to Supabase Dashboard → Project Settings → API → Service Role Key → Rotate
   - Update `.env` files with new key
   - Add `.cursor/` to `.gitignore`
   - Remove file from Git tracking: `git rm --cached .cursor/mcp.json`
   - **IF REPO WAS EVER PUBLIC**: Assume database is compromised

### Priority 1 (CRITICAL - Fix Immediately):

2. **DELETE `/api/auth/assign-role` endpoint**
   - Move role assignment to server-side only (already in signup-form.tsx as fallback)
   - Delete the entire API route file
   - This endpoint is unnecessary and dangerous

3. **Add Authorization to User Management**
   - Check super_admin role in all user-management-actions
   - Add check at start of `listUsers()` and `getUserById()`
   - Return `{ error: 'Unauthorized' }` for non-super_admin users

4. **Remove Debug Logging in Middleware**
   - Clean up console.log statements (lines 45-50, 54, 58 in middleware.ts)
   - Or wrap in `if (process.env.NODE_ENV !== 'production')` checks

### Priority 2 (HIGH - Fix This Week):

5. **Protect Cache Clear Endpoint**
   - Add super_admin role check to `/api/cache/clear/route.ts`
   - Return 403 Forbidden for non-admin users

6. **Verify Media Upload Authorization**
   - Review `uploadMediaAction` in `/src/lib/actions/media/media-actions.ts`
   - Ensure it properly checks site ownership or super_admin role

7. **Replace getSession() with getUser()**
   - Update middleware.ts line 31
   - Replace `await supabase.auth.getSession()` with `await supabase.auth.getUser()`
   - Update any other critical auth checks

8. **Standardize RLS Policies to super_admin**
   - Create new migration to update ALL RLS policies
   - Change 'admin' to 'super_admin' in all policy checks
   - Update sites, pages, products, posts, events, directories, taxonomies tables

### Priority 3 (MEDIUM - Fix Soon):

9. **Apply and Verify Migration 081**
   - Run `npx supabase db push` to apply migration
   - Verify product_orders policies are updated
   - Test that super_admin can access orders

10. **Add Rate Limiting**
    - Login: 5 attempts per 15 minutes
    - Signup: 3 attempts per hour
    - API endpoints: 100 requests per minute
    - Cache clear: 10 requests per minute

11. **Input Validation Library**
    - Use Zod or similar for consistent validation
    - Apply across all forms and API endpoints

---

## 🛡️ SECURITY RECOMMENDATIONS

### Authentication Best Practices:

1. **Multi-Factor Authentication (MFA)**
   - Add MFA support for super_admin accounts
   - Optional MFA for end_users

2. **Password Strength**
   - Current: 6 chars (signup) vs 12 chars (change)
   - Recommendation: 12 chars minimum everywhere
   - Add password strength meter

3. **Session Management**
   - Implement session timeout
   - Add "remember me" option
   - Session revocation capability

### Authorization Best Practices:

4. **Principle of Least Privilege**
   - Users only get minimum required access
   - Currently well-implemented

5. **Regular Security Audits**
   - Monthly code reviews
   - Automated security scanning
   - Dependency updates

### Monitoring & Logging:

6. **Security Event Logging**
   - Log failed login attempts
   - Log role changes
   - Log suspicious activity

7. **Alerting**
   - Alert on multiple failed logins
   - Alert on role escalation attempts
   - Alert on unusual API usage

---

## 📋 SECURITY CHECKLIST

### Before Production Deployment:

**EMERGENCY (Must Fix NOW):**
- [ ] 🚨 **ROTATE Supabase service role key** - Key was committed to Git in commits 890514f and bb6dae0
- [ ] Add `.cursor/` to `.gitignore`
- [ ] Remove `.cursor/mcp.json` from Git tracking
- [ ] Update local environment with new service role key

**CRITICAL (Must Fix Today):**
- [ ] Delete `/api/auth/assign-role` endpoint
- [ ] Add super_admin check to `listUsers()` and `getUserById()`
- [ ] Remove or protect debug logging in middleware

**HIGH PRIORITY:**
- [ ] Add super_admin check to `/api/cache/clear` endpoint
- [ ] Verify `uploadMediaAction` validates authorization
- [ ] Replace `getSession()` with `getUser()` in middleware
- [ ] Create migration to standardize ALL RLS policies to 'super_admin'
- [ ] Apply RLS migration 081

**MEDIUM PRIORITY:**
- [ ] Add rate limiting to auth endpoints (login, signup)
- [ ] Add rate limiting to API endpoints (cache clear, media upload)
- [ ] Implement input validation library (Zod)
- [ ] Implement session timeout
- [ ] Enable Supabase email rate limiting

**SECURITY BEST PRACTICES:**
- [ ] Configure CSP headers properly
- [ ] Set up security monitoring and alerting
- [ ] Test all auth flows thoroughly
- [ ] Penetration testing for auth bypass
- [ ] Review all server actions for auth checks
- [ ] Audit all API routes for authorization
- [ ] Enable Supabase MFA for admin accounts
- [ ] Set up automated security scanning
- [ ] Review and update dependencies regularly

---

## 🔍 TESTING RECOMMENDATIONS

### Security Testing:

1. **Authentication Tests**:
   - Test login with wrong credentials
   - Test signup with weak passwords
   - Test email confirmation bypass
   - Test session hijacking

2. **Authorization Tests**:
   - Test end_user accessing /admin
   - Test unauthenticated accessing protected routes
   - Test role escalation attempts
   - Test horizontal privilege escalation

3. **API Security Tests**:
   - Test rate limiting
   - Test input validation
   - Test SQL injection (low risk with Supabase)
   - Test XSS in user inputs

---

## 📊 RISK SUMMARY

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 Critical | 3 | Unprotected role assignment API, Unprotected user management actions, Hardcoded service role key |
| 🟠 High | 3 | Unprotected cache clear endpoint, Media upload authorization unclear, Debug logging in production |
| 🟡 Medium | 4 | getSession() vs getUser(), RLS role inconsistency, Migration not applied, No rate limiting |
| 🟢 Low | 1 | No CSRF protection on API routes |

**Overall Risk Level**: 🔴 **CRITICAL**

**Critical Vulnerabilities:**
1. 🚨 **SERVICE ROLE KEY EXPOSED IN GIT** - `.cursor/mcp.json` was committed in commits 890514f and bb6dae0
2. `/api/auth/assign-role` - Anyone can assign roles to any user
3. `listUsers()` and `getUserById()` - Any authenticated user can view all user data

**EMERGENCY ACTIONS REQUIRED**:
1. 🚨 **ROTATE SERVICE ROLE KEY IN SUPABASE DASHBOARD IMMEDIATELY** 🚨
2. Add `.cursor/` to `.gitignore`
3. Remove `.cursor/mcp.json` from Git tracking
4. Delete `/api/auth/assign-role` endpoint
5. Add super_admin checks to user management actions

**DO NOT DEPLOY TO PRODUCTION OR ALLOW NEW SIGNUPS UNTIL THESE ARE FIXED**

---

## 📝 NOTES

- The authentication architecture is fundamentally sound
- Main issues are missing authorization checks
- Once critical fixes applied, security posture will be strong
- Regular security audits recommended monthly

