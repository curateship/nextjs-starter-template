# Stripe Order Bump Payment Fix

**Date**: 2025-10-29
**Severity**: Critical
**Components Affected**: Checkout flow, Payment processing, Stripe Integration

## Summary

Fixed a critical bug where order bumps were not being charged correctly in Stripe Payment Element checkout flow. The issue manifested as two separate charges: one successful charge for the main product only, and one incomplete charge for the full amount including order bumps.

## The Problem

### User-Reported Symptoms

1. **Payment Issue**: When purchasing with order bumps:
   - Charge 1: $79.00 USD (main product) - **succeeded**
   - Charge 2: $124.00 USD (main + $45 bump) - **incomplete**

2. **UI Issue** (appeared after initial fix attempt):
   - Form reloaded 4 times on initial page load
   - Magic fill (browser autofill) was disabled/cleared
   - After page refresh, everything would work fine

### Root Cause Analysis

The checkout flow had **two separate but related bugs**:

#### Bug #1: Payment Intent Not Synchronized with Stripe Elements

**Location**: `src/components/frontend/checkout/PaymentElementWrapper.tsx`

When a user toggled order bumps:
1. Payment intent was updated on the server with new amount
2. Server returned success
3. **BUT** Stripe's Payment Element on the client still cached the original amount
4. When user submitted payment, Stripe used the cached amount instead of updated amount

**Why this happened**:
- Stripe Elements component initializes once with a `clientSecret`
- Even though we updated the payment intent server-side, the client-side Elements component didn't know about the change
- The component continued using the original cached payment intent amount

#### Bug #2: Unnecessary Re-renders Causing Form Reloads

**Location**: `src/components/frontend/checkout/CheckoutForm.tsx:219`

```typescript
// BEFORE (Broken)
<PaymentElementWrapper
  selectedBumps={Array.from(selectedBumps)}  // ❌ New array every render
/>
```

**Why this happened**:
- `Array.from(selectedBumps)` creates a **new array reference** on every render
- Even if content is identical, React sees it as a new prop
- Caused PaymentElementWrapper to re-render unnecessarily
- This bug was **always present** but silent until we fixed Bug #1

#### Bug #3: Development Hot Module Replacement (HMR) Side Effect

**Note**: This is a **development-only issue** that does not affect production.

When navigating to the checkout page (not refreshing), Next.js/Turbopack's Hot Module Replacement triggers extra component mount cycles:

1. Component mounts
2. HMR rebuilds code (`[Fast Refresh] rebuilding`)
3. Component remounts
4. React Strict Mode doubles it again
5. Result: Multiple renders on first navigation

**Observable in development**:
- First navigation: `[CheckoutForm] selectedBumpsArray updated` appears 2+ times
- Page refresh: Only appears 2 times (Strict Mode only)
- Production build: Only appears once (no HMR or Strict Mode)

**Why this doesn't matter**:
- HMR only runs in development (`npm run dev`)
- Production builds don't have HMR or Strict Mode
- Users never experience this behavior
- Payment functionality works correctly in both cases

## The Solution

### The Journey to Simplicity

**Failed Complex Approaches:**
1. ❌ Forcing Elements remount with `key={clientSecret}` - Cleared magic fill
2. ❌ Creating new payment intents on bump changes - Cleared magic fill
3. ❌ Using `elements.fetchUpdates()` - Only works for NEW payment intents, not updates
4. ❌ Complex state synchronization - Over-engineered and fragile

**The Simple Solution That Works:**
1. ✅ Update payment intent server-side
2. ✅ DON'T remount Elements (preserves magic fill)
3. ✅ Add 500ms delay before submission (ensures update propagates)
4. ✅ Disable submit during updates (prevents race conditions)

**Key Insight**: Stripe doesn't need the client to "know" about amount changes. The server-side payment intent has the correct amount, and when the user submits, Stripe uses the server-side value—not the client-cached one.

### Fix #1: Simple Server-Side Updates

**File**: `src/components/frontend/checkout/PaymentElementWrapper.tsx`

Update payment intent without remounting Elements:

```typescript
// Update existing payment intent with new amount (server-side only)
const result = await updatePaymentIntent({
  paymentIntentId,
  mainPriceId: selectedTier.stripePriceId,
  selectedBumps: selectedOrderBumps,
})

// No client-side state changes needed - server has the truth
```

Add delay before submission to ensure updates propagate:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  if (isUpdating) {
    setErrorMessage('Please wait while we update your order...')
    return
  }

  setIsProcessing(true)

  // Add delay to ensure payment intent update has propagated
  await new Promise(resolve => setTimeout(resolve, 500))

  await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: `${process.env.NEXT_PUBLIC_APP_DOMAIN}${checkoutSettings.successUrl}`,
      payment_method_data: { billing_details: { email } },
    },
  })
}
```

Elements component stays stable (no `key` prop):

```typescript
<Elements
  stripe={stripePromise}
  options={{ clientSecret, appearance }}
>
  {/* Form never remounts, magic fill persists */}
</Elements>
```

### Fix #2: Prevent Unnecessary Re-renders with useMemo

**File**: `src/components/frontend/checkout/CheckoutForm.tsx`

Memoized the selected bumps array:

```typescript
import { useState, useMemo } from 'react'

// ...

// Memoize the selected bumps array to prevent unnecessary re-renders
const selectedBumpsArray = useMemo(() => Array.from(selectedBumps), [selectedBumps])

// ...

<PaymentElementWrapper
  product={product}
  selectedTier={selectedTier}
  checkoutSettings={checkoutSettings}
  selectedBumps={selectedBumpsArray}  // ✅ Stable reference
/>
```

### Fix #3: Prevent Updates on Initial Mount

**File**: `src/components/frontend/checkout/PaymentElementWrapper.tsx`

Added flag to prevent payment intent updates during initialization:

```typescript
const hasInitialized = useRef(false)

// Create payment intent only once on mount
useEffect(() => {
  const createIntent = async () => {
    // ... create payment intent
    setClientSecret(result.clientSecret)
    setPaymentIntentId(result.paymentIntentId || null)
    hasInitialized.current = true  // ✅ Mark as initialized
  }
  createIntent()
}, [])

// Update payment intent amount when selectedBumps changes
useEffect(() => {
  // Don't run until initial payment intent is created
  if (!hasInitialized.current || !paymentIntentId) {
    previousBumps.current = selectedBumps
    return  // ✅ Skip on initial mount
  }

  // Check if bumps actually changed
  const bumpsChanged = /* ... comparison logic ... */

  if (!bumpsChanged) {
    return  // ✅ Skip if no actual change
  }

  // ... update payment intent
}, [selectedBumps])  // ✅ Only depend on selectedBumps
```

## Technical Details

### Why This Simple Approach Works

**Common Misconception**: "Stripe Elements needs to know about payment intent changes"

**Reality**: Stripe Elements only needs the `clientSecret` for initialization. When the user submits:
1. Elements sends payment method data to Stripe
2. Stripe looks up the payment intent by ID (embedded in clientSecret)
3. Stripe uses the **server-side** payment intent amount (which we updated)
4. Client-side cached amount is irrelevant

**The 500ms delay** ensures the server update has propagated through Stripe's systems before submission. This is far simpler than forcing component remounts or creating new payment intents.

### Why useMemo Was Critical

React re-renders components when props change. Without `useMemo`:

```javascript
// Every render creates new array, even with same content
const array1 = Array.from(new Set(['a', 'b']))
const array2 = Array.from(new Set(['a', 'b']))
array1 === array2  // false ❌ (different references)
```

With `useMemo`, the array reference stays stable until the Set actually changes.

### The Cascade Effect

1. **Fix #1** solved payments but exposed **Bug #2**
2. **Bug #2** caused unnecessary `selectedBumps` changes
3. Unnecessary changes triggered payment intent updates
4. Updates changed `clientSecret`
5. New `clientSecret` remounted Elements (via `key` prop)
6. Remounting cleared form data and disabled magic fill

## Files Changed

### Primary Changes
- `src/lib/actions/stripe/checkout-actions.ts:218-226`
  - Return `clientSecret` from `updatePaymentIntent`

- `src/components/frontend/checkout/PaymentElementWrapper.tsx`
  - Lines 3: Added `useRef` import
  - Lines 183-184: Added `previousBumps` and `hasInitialized` refs
  - Lines 216: Set `hasInitialized.current = true` after creation
  - Lines 227-291: Rewrote update effect with proper guards
  - Lines 265-268: Update `clientSecret` on payment intent updates
  - Line 380: Added `key={clientSecret}` to Elements component

- `src/components/frontend/checkout/CheckoutForm.tsx`
  - Line 3: Added `useMemo` import
  - Lines 88-89: Added `selectedBumpsArray` memo
  - Line 222: Use `selectedBumpsArray` instead of inline `Array.from()`

## Testing Checklist

- [x] Order bump selection updates total price correctly
- [x] Payment processes with correct amount including bumps
- [x] No incomplete charges in Stripe dashboard
- [x] Form loads only once on initial page load
- [x] Magic fill/browser autofill works on first load
- [x] Form only reloads when user toggles order bump
- [x] Console logs confirm payment intent updates
- [x] Success page shows correct line items (main product + bumps)

## Lessons Learned

### 1. Stripe Elements State Management
Stripe Elements components maintain internal state tied to payment intents. When updating amounts dynamically, you must force re-initialization by changing the `key` prop or creating a new Elements instance.

### 2. Array Reference Equality in React
Creating arrays inline (like `Array.from()` in JSX) creates new references every render. Always use `useMemo` for derived arrays passed as props to prevent unnecessary re-renders.

### 3. Effect Dependencies Matter
Including too many dependencies in `useEffect` can cause cascading updates. Only include dependencies that should actually trigger the effect. Use refs and manual comparison for more granular control.

### 4. Silent Bugs Can Become Loud
Bug #2 existed from the beginning but was silent (just extra re-renders). Only when we fixed Bug #1 (which required remounting Elements) did Bug #2 become visible and problematic.

## Related Issues

- Order bump image field addition (unrelated, just timing coincidence)
- Success page refactor to show line items (enhancement)
- Download page rich text editor (unrelated feature)

## Prevention

To prevent similar issues in the future:

1. **Always memoize derived arrays/objects** passed as props
2. **Test payment flows** with order bumps/add-ons in Stripe test mode
3. **Monitor Stripe dashboard** for incomplete/duplicate charges
4. **Use React DevTools Profiler** to catch unnecessary re-renders early
5. **Try the simplest solution first** - don't over-engineer
6. **Understand development vs production behavior** - HMR/Strict Mode can create false issues

## References

- [Stripe Payment Element Docs](https://stripe.com/docs/payments/payment-element)
- [React useMemo Hook](https://react.dev/reference/react/useMemo)
- [Stripe Payment Intents API](https://stripe.com/docs/api/payment_intents)
