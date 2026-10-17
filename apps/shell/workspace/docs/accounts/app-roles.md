# App roles

An app can add its own kinds of account beside the shell's admin and member,
such as `employee` in Project or `venue_owner` in CMS. Everyone still signs in
on the one `/login`. An app role sees only the parts of the shell its app gives
it, and starts with none of them.

Tyler, 16 Oct 2026: "I think this needs to be a shell change. We'd have admin,
pro, free and other types of users such as employee or for example in cms, we'd
need to add another user type for venues owners that claimed their listing." He
chose shell accounts with a type over each app keeping its own accounts table.
Free and Pro stay plans a member pays for, not roles. The existing `role` column
is the type, and it only grows: `admin` and `member` mean exactly what they
meant before.

## Declaring a role

An app lists its roles in `roles` in its `src/app/options.ts`. Each one has:

- **`id`.** What `users.role` stores. Lower-case letters, numbers and
  underscores, starting with a letter, at most 50 characters.
- **`label`.** What the screen calls it, such as "Employee".
- **`landing`.** Where the role goes after sign-in, such as `/dashboard`. A
  page inside `/admin` is refused, because the role could never open it.
- **`features`.** The parts of the shell it gets. Unset gets none.
- **`menu`.** The left menu a fresh install gives it.

`admin` and `member` cannot be declared again, and two roles with one id are
refused. Both are said out loud the first time the list is read, in
`appRoles` (`src/lib/app-options.ts`). Custom Shell itself declares none, so
in this app every account is still an admin or a member.

## What an app role gets

Admins and members get every part of the shell, as they always did. An app role
gets only the parts its `features` list names (`src/lib/role-id.ts`):

| Feature | Without it |
| --- | --- |
| `billing` | No Upgrade, no Billing in the person menu, no Billing tab, no plan badge or Manage billing on Profile. `/pricing` sends them to their landing page. |
| `aiUsage` | No AI usage card on the Billing tab. |
| `feedback` | No Feedback button in the header and no feedback window. |
| `changelog` | The changelog's list is refused. It is not in their menu unless an admin adds it. |
| `workspaces` | No workspace of their own and no switcher, even when the app gives members one. |
| `security` | Security keeps only the password and the devices card. No passkeys, no Delete my account. |
| `emailChange` | Profile has no email card, so they cannot change their sign-in email. |

The Security answer is Tyler's, 16 Oct 2026: an app role gets "change password
and sign out other devices". The site admin removes app-role people; they do
not delete themselves.

**The server refuses the same things.** Every billing, AI usage, feedback,
changelog and member-home endpoint uses `featureGet` or `featurePost`
(`src/server/guards.ts`) instead of the plain member guard. Adding a passkey,
deleting your own account and changing your email check the same list. A
refused call answers `FORBIDDEN`. `src/server/role-features.test.ts` reads
every one of those endpoints and calls the guards as an app role.

**A role the app stops declaring gets nothing.** Its accounts keep their stored
role, sign in, land on the member home's error and see an empty menu. The
admin moves them to another role on Admin → Users, where the picker keeps
their old role listed until they are moved.

## The left menu and the header

- **Each app role has its own left menu.** It never falls back to the members'
  menu, which holds Changelog and the member home. Until an admin edits it, the
  role gets the `menu` its app declared.
- **Settings → Navigation edits it.** The Platform settings card lists each
  app role under its own name, between Members and Public, with a Navigation
  row. It is the same editor as the members' sidebar, and saves itself the
  same way. Reset puts the app's starting menu back. The menus are saved
  app-wide in `roleSections`, keyed by role id.
- **The header uses the members' top-right menu**, without the Feedback button
  unless the role has `feedback`.
- **An app's own header controls, quick settings and left header content**
  are for admins and members when they name no roles. An app role sees one
  only when the app names it in that control's `roles`.

## Making an account with an app role

There are two ways, and nobody signs themselves up into an app role.
`/register` and Google keep making members only.

- **The app's own invite** calls `inviteAccount` (`src/server/people/invite.ts`)
  with an email, a name and the role, after its own checks. It refuses an
  email that already has an account, and only invites into an app role.
- **Admin → Users.** Add account and the account window's Role picker list
  the app's roles beside Admin and Member. Tyler said yes to this on
  16 Oct 2026.

Either way the account starts with no password and the person gets the "Set
your password" email. The link is the same one-time link a password reset
sends: it works once and runs out on the same clock.

**Opening the link signs them in.** Setting the first password on an account
that never had one confirms the address, starts a session, and goes to `/home`,
which sends an app role to its landing page. This is true of any account an
admin made too. A reset of a password that already existed still ends signed
out, as before.

## Where each role lands

`/home` forwards everybody after sign-in (`src/routes/_authenticated/home.tsx`):

- An admin goes to the admin route set in Settings, or the Overview.
- An app role goes to its `landing`.
- A member gets their own home page, or the member home route when one is set.

## Code that names the roles it means

Places that used to treat "not an admin" as "a member" now say which role they
mean:

- **Contacts.** An account's contact is tagged with its own role, `employee`
  included, and the sync owns one tag per role the app has.
- **Membership.** Members are counted by name, and people in app roles are
  left out of the free plan's head count.
- **Traffic.** Only visitors and members are counted. Admins and app roles are
  not.
- **Member automations.** The member test picker and member emails reach
  members only, never an app role.
- **Users.** The list shows each role's name and filters by every role.
- **View as** works for an app role, so the admin can see what an employee
  sees.

## Tests

- `src/lib/roles.test.ts`: declaring roles and what each one may see.
- `src/server/people/app-roles.test.ts`: saving, refusing, the invite and its
  link, each role's menu, contacts and Membership. It uses the test-only roles
  in `src/lib/test-app-roles.ts`.
- `src/server/role-features.test.ts`: the server refuses an app role.
- `src/lib/nav/role-landing.test.ts`: where each role lands.
