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

## The Solution

### Fix #1: Force Elements Re-initialization on Payment Intent Updates

**File**: `src/lib/actions/stripe/checkout-actions.ts`

Added `clientSecret` to the response from `updatePaymentIntent`:

```typescript
// Update payment intent
const paymentIntent = await stripe.paymentIntents.update(data.paymentIntentId, {
  amount: totalAmount,
  metadata: {
    orderBumps: JSON.stringify(data.selectedBumps.map(b => ({
      id: b.id,
      title: b.title,
      priceId: b.stripePriceId,
    }))),
  },
})

return {
  success: true,
  clientSecret: paymentIntent.client_secret,  // ✅ Return updated client secret
  paymentIntent: {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
  },
}
```

**File**: `src/components/frontend/checkout/PaymentElementWrapper.tsx`

Updated the client secret when payment intent changes:

```typescript
// Update payment intent with new amount
const result = await updatePaymentIntent({
  paymentIntentId,
  mainPriceId: selectedTier.stripePriceId,
  selectedBumps: selectedOrderBumps,
})

if (result.success && result.clientSecret) {
  setClientSecret(result.clientSecret)  // ✅ Update client secret
  console.log('Updated client secret for Elements re-initialization')
}
```

Added `key` prop to force Elements remount:

```typescript
<Elements
  key={clientSecret}  // ✅ Force remount when client secret changes
  stripe={stripePromise}
  options={{
    clientSecret,
    appearance,
  }}
>
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

### Why Elements Component Needs to Remount

Stripe's Elements component maintains internal state tied to the payment intent. When the payment intent amount changes server-side, the Elements component doesn't automatically refresh. By changing the `key` prop (via `clientSecret`), we force React to:

1. Unmount the old Elements instance
2. Mount a new Elements instance with the updated payment intent
3. Ensure the payment form reflects the correct amount

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
4. **Add logging** to payment intent creation/updates for debugging
5. **Use React DevTools Profiler** to catch unnecessary re-renders early

## References

- [Stripe Payment Element Docs](https://stripe.com/docs/payments/payment-element)
- [React useMemo Hook](https://react.dev/reference/react/useMemo)
- [Stripe Payment Intents API](https://stripe.com/docs/api/payment_intents)
