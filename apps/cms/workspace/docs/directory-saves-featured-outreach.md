# Directory Saves, Featured Placement, and Outreach

## Completed behavior

- Visitors can save listings into named collections and manage them from the
  Saved Listings page.
- Approved listing owners can buy a featured placement through Stripe.
- Featured listings receive a badge and sort ahead of ordinary listings until
  the paid period expires.
- Admins can manage featured plans, placements, saves, and claim outreach for
  the currently selected site.
- Outreach respects permanent email opt-outs and will not send the same
  listing invitation to the same address twice.
- Navigation uses in-app routing, so moving between pages does not reload the
  whole document.

## Featured checkout deletion safety

- An unresolved Stripe checkout protects its listing from deletion.
- An expired checkout releases the listing so deletion can continue.
- A paid checkout becomes a featured placement before deletion can continue.
- If payment completes while deletion is being attempted, deletion pauses so
  the admin can review the updated no-refund warning.
- The delete dialog explains when a featured checkout is still unresolved and
  warns when an active paid placement would end without a refund.
- The database also prevents deletion if a checkout begins after the initial
  safety check.

## Test road map

1. Open a published listing as its approved owner and start a Featured
   checkout.
2. In Admin → Listings, try to delete that listing. The dialog should mention
   the unresolved checkout, and deletion should be refused while it remains
   open.
3. Expire the Stripe test session and try again. The expired checkout should be
   cleared and the listing should be deletable.
4. Repeat with a checkout marked paid. The placement should activate first,
   and deletion should pause until the dialog is reopened with the active
   placement and no-refund warning.
5. Save and unsave a listing from the directory card, listing page, and Saved
   Listings page. Counts and collection membership should update correctly.
6. Send an outreach invitation, then try sending it again to the same address
   for the same listing. The second send should be refused.
7. Open the unsubscribe link, then try outreach from any site to that address.
   No further message should be sent.
8. Click between sidebar pages. The address and content should update without a
   full-page flash or document reload.

## Automated verification

- All 91 directory tests pass.
- Type checking passes.
- Database migrations apply successfully.
- Lint completes without errors; existing repository warnings remain.
- The production build succeeds.

## Local browser note

The signed-in page rendered in Playwright without console or request errors,
but the already-running development server did not attach browser click
behavior during the final check. Restart the local CMS development process
before following the manual test road map.

The formatter is also currently blocked because its configuration points to a
missing `src/index.css` file.
