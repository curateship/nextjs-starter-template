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
