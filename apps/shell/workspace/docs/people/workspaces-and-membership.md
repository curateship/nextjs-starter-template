# Workspaces and membership

A workspace is one site and its data boundary. The active workspace owns:

- Settings, media, and feedback.
- Contacts, content, and newsletters.
- Automations and traffic.
- Most admin lists.

A guarded query receives or derives that workspace and must not return another
workspace's records.

A user has one current workspace and may belong to more than one. The Workspaces
screen can:

- Create and copy workspaces.
- Switch the current workspace.
- Manage the workspaces available to that person.

A workspace can be active, draft, or inactive. Its public site can use a
subdomain or custom domain.

## Which site a request is about

`currentWorkspaceId` answers with the id alone, through
`findCurrentWorkspaceId`: the workspace the person points at, or else the oldest
one they own. It throws "No workspace" when there is none. Most admin endpoints
call it once per request just to scope a query, so it no longer loads and parses
the whole settings row. Callers that need the row use `requireCurrentWorkspace`.

## A saved left menu is brought up to date once

Each site saves its own copy of the left menu, so an admin's changes stick. When
the shell's default menu changes, a numbered step edits menus saved before the
change, and the site's `navVersion` records how far it has come. The steps run
when the whole workspace row is read, at sign-in and when the shell settings
load, and each runs once.

Steps 1 to 12 were deleted on 3 Nov 2026. That day every live site was at 12 or
later, and the oldest was a Trade site at 12. Steps 13 to 21 stay, because Trade
had sites at 12 and 18 and Fitness one at 20. A local database with a menu older
than 12 skips straight to step 13, so it can be missing links such as Traffic
or AI usage until they are added by hand in Admin → Navigations.

Step 25 (8 Nov 2026) takes the Templates link out from under Automations,
because templates are a tab in the automation editor now. Step 18, which added
that link, was deleted on 9 Nov 2026, so a menu older than 18 never gets it.

## Ownership and membership

The user who creates a workspace is its creator, but the workspace does not
depend on that account forever. Other membership and administrator rules decide
who can keep managing it. Removing a person must not orphan shared workspace
content.

Membership connects an account to a workspace and the role it has there. The
Home and Membership views summarize the current person's access. Admin tools can
see workspace members and manage the records allowed by their role.

Copying a workspace copies the supported configuration into a new boundary. It
does not make two workspaces share future edits. Switching workspaces changes
the context used by routes, navigation, settings, and server reads.

Custom domains affect which workspace signed-out public routes load. A domain
that cannot resolve to a public workspace must not fall back to another
customer's site.

## The site switcher in the sidebar

The block at the top of the sidebar names the active workspace and, under it,
the address that workspace answers on. Pressing the chevron opens a list of
every workspace the person belongs to. A row carries the workspace's picture,
its name, its address, a tick when it is the active one, and a button that
opens its public site in a new tab.

- **The whole row lights up under the pointer.** The shading is on the row, not
  on the name, so the Open button at the far right is part of the same row
  rather than an unshaded square beside a highlighted one.
- **Open goes to the local address from a developer's machine.** A workspace
  with a custom domain still prints that domain in the row, because that is the
  site's address whoever is reading it. The button, though, goes to
  `joes.localhost:3002` whenever the browser is already on a `localhost` name.
  It went to the live `joes.com` before, which showed the live site to somebody
  who had opened the switcher to look at the edits on their own machine.
- **From a deployment it goes to the custom domain**, and to
  `<subdomain>.<base domain>` on the same protocol and port when there is no
  custom domain. A deployment with no base domain at all serves one site, so
  the button goes to `/`.
