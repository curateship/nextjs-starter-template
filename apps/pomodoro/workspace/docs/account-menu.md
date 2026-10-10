# The account menu

When you are signed in, the right end of the product header is your photo.
Clicking it opens a menu. A visitor who is not signed in sees Log in and
Register in that spot, or only an orange Log in on a phone.

## What the menu holds

- **Your name, your email and your plan** sit at the top. The plan line reads
  "Pro plan" or "Free plan". An admin reads as Pro, the same way
  [Pro perks](pro-perks.md) treats admins everywhere else.
- **Dashboard** opens `/timer`, the page the left menu also calls Dashboard.
- **Settings** opens the product's own `/settings`.
- **Your profile** opens `/u/<handle>`. It is there only while that page
  really opens: you have a handle, the page is switched on, and an operator has
  not hidden it. Any other time the address answers the same 404 a stranger
  gets, so a row leading there would look broken.
- **Upgrade to Pro** opens `/plans`, and only Free accounts see it.
- **Admin** opens `/admin`, and only admins see it. The `/admin` route checks
  the role again, so hiding the row is not the only guard.
- **Dark mode** is a row with a tick, just above Log out. Tyler, 10 Oct 2026:
  "Move the theme switcher into the user dropdown. Hide it on anon users." It
  switches between light and dark and leaves the menu open, so you see the
  page change under it. The tick follows what is on screen, so "System" on a
  dark-mode computer shows ticked. It is left off when an admin fixed the
  site to always light or always dark. A guest has no menu and is always
  dark; see "Light and dark" in [the product shell](product-shell.md).
- **Log out** signs out and lands on `/login`. Your light or dark choice is
  kept aside while you are signed out and comes back when you sign in.

## Where the plan and the profile come from

The shell's user record carries the name, email, role and photo. It does not
carry the plan or the handle, so the product layout (`src/routes/_pomodoro.tsx`)
asks for them once, when a page is first loaded. The front page at `/` does the
same in its own loader. Moving between pages does not ask again, because
TanStack keeps the layout's answer.

If that read fails, the plan line, Your profile and Upgrade to Pro are left
off, and the rest of the menu works. Showing "Free plan" on a guess would tell a
paying member something untrue.

Saving the photo, or saving Your public page on Settings, reloads the layout's
answer. The menu then changes without a page reload. That matters most for Your
profile, which appears the moment the page is switched on.

## The photo

The photo is the shell's own account photo. You pick it on Settings → Profile,
in the first field of the Your profile card. It saves as soon as a picture is
picked or removed, unlike the fields under it, because choosing from the media
window is already the deliberate step. The shell's `updateProfile` refuses a
picture this account did not upload. With no photo, the coloured initials from
`initials-avatar.tsx` are drawn instead.

## Why it is the app's own menu

The shell's public header has the same menu, in `public-navigation.tsx`. That
file belongs to the shell and does not export it, and an edited shell file
conflicts on every future merge. So the product builds its own in
`src/components/pomodoro/account-menu.tsx` from the shared dropdown parts.

## Size and colours

The photo is 32px, the height of every other control in the header row. At
36px, each wrapped line of the header grew by 4px. With the photo at 32px, the
header is the same height as it was with the old Admin and Log out pair at
every width from 320px to 1440px, and one line shorter at 1280px.

The menu needs no colour class of its own. The Pomoder colours sit on the whole
page while a product screen is open, so a menu drawn outside the header still
takes them, in dark and in light.
