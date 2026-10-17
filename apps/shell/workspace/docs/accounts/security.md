# Account security

The Security tab follows these rules:

- The tab waits to load until somebody opens it. Switching tabs unmounts the
  Security view, but the account window keeps the three password fields until
  the person comes back.
- Any text in those fields counts as unsaved work. Escape, the close button,
  the backdrop, and Done ask before discarding it.
- A confirmed close or successful password change clears every password field.
- "Sign out all other devices" asks before ending any sessions. The question
  names the number of other devices and explains that the current device stays
  signed in.
- The confirmation window cannot close while the request runs.

An app role sees only the password card and the devices card, unless its app
gives it `security`. Passkeys and Delete my account are left out, and the
server refuses both. Tyler chose this on 16 Oct 2026: the site admin removes
app-role people, they don't delete themselves. See [App roles](app-roles.md).
