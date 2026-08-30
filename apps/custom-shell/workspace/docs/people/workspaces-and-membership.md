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
