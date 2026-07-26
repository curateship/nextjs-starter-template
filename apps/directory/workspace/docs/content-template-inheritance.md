# Content Template Inheritance

Posts, directory listings, categories, and events use template inheritance.

- Template tables own block structure, order, layout, visibility, and reusable display settings.
- Content rows store a required `template_id` plus only content-specific values in `content_blocks`.
- Builders load merged template + row blocks for editing and preview.
- Row saves must prune incoming blocks against the active template before writing.
- Template saves must sanitize out row-owned values before writing.

For posts, article body fields (`body`, `text`, `format`) are row-owned. Core style/config, related-posts settings, table-of-contents settings, visibility, layout, and block order are template-owned.

For events, the row-owned values on the `event-content` block are the body (`body`, `format`), the schedule (`eventDate`, `eventTime`), the venue (`venueName`, `venueAddress`), the external RSVP link (`externalCtaUrl`), and the registration settings (`registrationMode`, `capacity`, `ticketPriceId`, `ticketPriceLabel`). These are declared in `EVENT_VALUE_KEYS`, and `transformEventValue` normalizes each one on the way in — a capacity typed as text becomes a number, an invalid Stripe price id is dropped, and turning sign-ups off drops `registrationMode` while leaving the other values in place so flipping it back restores them. The server reads these values back to enforce capacity and to charge a ticket, so anything that cannot be trusted is dropped at save time rather than at read time.
