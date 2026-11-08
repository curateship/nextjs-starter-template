# System emails

System emails are the messages the product sends for fixed events such as:

- Email verification and password reset.
- Account changes.
- Billing and notifications.
- Automation work.

The event decides the message kind. An admin can edit the wording and layout
without changing the server action that sends it.

The System emails dashboard lists every supported kind. Each editor can preview,
save, send a test, and return to the built-in default. Resetting a template
changes future mail only. It does not rewrite earlier send records.

## Delivery records and retries

Each attempt creates a system email send record with the recipient, message
kind, provider id, status, and failure detail. The Recent sends panel reads
those records inside the dashboard's shared panel frame.
The panel uses the shared Load more button for older attempts and keeps one
button width while it loads. A failed attempt keeps its shared inline error
text beside that recipient and time.

A temporary provider failure can create a pending send. The background pass
retries eligible pending mail and stops after the saved retry policy says the
attempt is final. Provider webhooks update later delivery state after the
initial send call has returned.

Since 7 Nov 2026 the app's own emails are a **System emails** tab in the CRM
settings ⋮ on the CRM's left page (Tyler: "a tab in the CRM settings ⋮.
Opening a kind puts its editor in the right panel"). Pressing one opens it on
the right (`SystemEmailRecord`): the same email page as a newsletter, its ⋮
holding the subject, the preview line, the From name, Reset to the built-in
wording, and a Sends tab with who it went to lately; its footer holds Send
myself a test. `/admin/system-emails` and `/admin/system-emails/<kind>`
forward there.

Local development can capture messages in the Dev outbox instead of sending
them to real addresses. Since 7 Nov 2026 the outbox is the Outbox pill under
the CRM's Inbox, and `/admin/dev-outbox` forwards there. The outbox shows:

- Subject and recipient.
- Rendered body.
- Send time.

Email settings hold:

- Sender details.
- The Resend key and webhook secret.
- Link expiry and retry defaults.

Secrets stay on the server and saved provider keys are encrypted at rest.
