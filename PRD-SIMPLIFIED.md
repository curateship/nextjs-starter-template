# System Everything - Simplified PRD
**Version:** 1.0 (Post-Authentication Disaster)  
**Date:** January 8, 2025  

## 🎯 **Problem Statement**

We need a **working foundation** for a multi-tenant platform. The previous attempt failed due to over-engineering and unclear requirements. This PRD focuses on **building blocks that actually work** instead of ambitious features.

## 🚫 **What We WON'T Build (Lessons Learned)**

❌ **Complex multi-tenant architecture from day 1**  
❌ **3-tier user role systems**  
❌ **Prisma with complex schemas**  
❌ **Block-based builders**  
❌ **Theme systems**  
❌ **Site management**  
❌ **Multiple authentication methods**  

## ✅ **What We WILL Build (MVP Foundation)**

### **Phase 1: Working Authentication (2-3 days)**
- **Simple login/logout** with email + password
- **Admin vs Regular user** (boolean flag)
- **Dashboard that shows who you are**
- **Protected routes that actually work**

### **Phase 2: Basic CRUD (2-3 days)**  
- **User can create a "site"** (simple name + description)
- **User can list their sites**
- **User can edit/delete sites**
- **Admin can see all sites**

### **Phase 3: Simple Multi-tenancy (2-3 days)**
- **Users are isolated** (can only see their own data)
- **Admins can switch between user contexts**
- **Basic permissions work correctly**

## 🏗️ **Technical Foundation (SIMPLE)**

### **Database Schema (Minimal)**
```sql
-- User profiles (linked to Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Simple sites table  
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### **Tech Stack (Proven)**
- **Next.js 15** (App Router)
- **Supabase** (PostgreSQL + Auth)
- **TypeScript** (Simple types)
- **Tailwind CSS** (Basic styling)
- **Plain SQL** (No ORM complexity)

### **Authentication (Simple)**
- **Supabase Auth** (email/password only)
- **Server Components** for protected routes
- **Simple middleware** (just check if logged in)
- **No complex role resolution**

## 📋 **User Stories (Minimal)**

### **As a User:**
- I can sign up with email/password
- I can log in and see my dashboard
- I can create/edit/delete my sites
- I can log out

### **As an Admin:**
- I can do everything a user can do
- I can see a list of all users
- I can see all sites across all users
- I have an "Admin" badge/indicator

## 🎯 **Success Criteria**

### **Phase 1 Complete When:**
- [ ] User can sign up successfully
- [ ] User can log in and see dashboard
- [ ] Admin sees "Admin" indicator
- [ ] Protected routes redirect to login
- [ ] Logout works and clears session
- [ ] **No console errors**
- [ ] **No authentication bugs**

### **Phase 2 Complete When:**
- [ ] User can create a site
- [ ] User can see list of their sites
- [ ] User can edit site name/description
- [ ] User can delete sites
- [ ] Admin can see all sites
- [ ] **Data isolation works** (users see only their data)

### **Phase 3 Complete When:**
- [ ] Multiple users can exist independently
- [ ] Admin can view any user's sites
- [ ] No data leaks between users
- [ ] Basic permissions are enforced
- [ ] **System is stable and bug-free**

## 🚀 **Implementation Plan**

### **Day 1-2: Authentication Foundation**
1. Set up Supabase project
2. Create `profiles` table
3. Implement simple login/signup
4. Create protected dashboard
5. Test thoroughly

### **Day 3-4: Basic CRUD**
1. Create `sites` table
2. Build site list page
3. Add create/edit/delete forms
4. Test data isolation

### **Day 5-6: Admin Features**
1. Add admin indicators
2. Build admin site list (all users)
3. Add basic admin dashboard
4. Test permissions

### **Day 7: Polish & Testing**
1. Fix any bugs
2. Add basic error handling
3. Improve UI/UX
4. Document what works

## 🔧 **Architecture Principles**

1. **Simple First** - No feature until basics work
2. **Test Everything** - Every feature must work before moving on  
3. **One Thing at a Time** - No parallel complex features
4. **Plain SQL** - Direct queries, no ORM complexity
5. **Minimal Dependencies** - Only add what's essential
6. **User-Centric** - Build for actual user needs, not theoretical features

## 📊 **Scope Comparison**

### **Original PRD:**
- 10+ database tables
- Multi-tenant architecture
- Theme system
- Block builders  
- Complex authentication
- **Result: FAILED**

### **Simplified PRD:**
- 2 database tables
- Basic authentication
- Simple CRUD
- Admin vs User
- **Goal: WORKING FOUNDATION**

## 🎯 **Next Steps After Success**

Only after this foundation is **rock solid and bug-free:**

1. **Add more site fields** (categories, status, etc.)
2. **Improve admin features** (user management)
3. **Add basic theming** (color picker)
4. **Consider multi-site features** (one site per user)
5. **Add more user roles** (if needed)

## 💡 **Key Insight**

**We're building a FOUNDATION, not a feature-complete product.** Every line of code must contribute to having a stable, working authentication and CRUD system that we can build upon.

**Success = Users can sign up, log in, create sites, and admins can see everything. No bugs. No complexity.**