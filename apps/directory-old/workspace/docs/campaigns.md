# Campaigns

Campaigns are site-scoped announcement bars and popups managed at `/admin/campaigns`.

## Delivery

- The root server layout loads active campaigns whose schedule currently permits delivery.
- A small client gate checks schedule bounds and the current pathname before loading the campaign runtime.
- The gate applies include/exclude path targeting and selects the newest eligible popup. Multiple announcement bars may render together.
- Announcement bars set `--campaign-bar-height`; public navigation and page layout use it so fixed chrome never covers the bar.
- Popup frequency outcomes use `campaign:<id>:dismissed` and `campaign:<id>:submitted` in local or session storage.

## Newsletter capture and counters

Email popups submit to the site-wide newsletter audience. Intake rejects bodies over 4 KB, then validates the active campaign, schedule, origin, email, and request rate. Rate-limit storage is only touched after the campaign and origin are verified. Existing contact status is preserved, so unsubscribed or suppressed contacts are not reactivated.

Views, dismissals, and submissions are queued in the browser and drained through the analytics beacon endpoint in batches of 20. Campaign ownership is verified before counters are incremented.

## Admin contract

Campaign saves reject invalid or over-limit values rather than truncating, clamping, or replacing them. All-pages targeting stores an empty path list, announcement bars use the immediate trigger, and email popups do not store link CTA fields.

Campaigns is part of the canonical default admin sidebar. Existing custom saved sidebar layouts are not modified automatically; reset a custom sidebar to defaults to include Campaigns.

## Database

Run `migrations/180_create_campaigns.sql` in each deployed environment before release.
