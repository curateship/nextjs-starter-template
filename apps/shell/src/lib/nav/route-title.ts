const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/login": "Sign in",
  "/register": "Create account",
  "/forgot-password": "Forgot password",
  "/reset-password": "Reset password",
  "/sign-in-link": "Sign-in link",
  "/verify-email": "Verify email",
  "/change-email": "Confirm email change",
  "/revoke-email-change": "Revoke email change",
  "/report-unwanted-sign-in": "Report unwanted sign-in",
  "/pricing": "Pricing",
  "/maintenance": "Maintenance",
  "/_authenticated/home": "Home",
  "/_authenticated/account": "Account",
  "/_authenticated/account/billing_/success": "Billing success",
  "/_authenticated/admin/": "Admin",
  "/_authenticated/admin/dashboard": "Admin",
  "/_authenticated/admin/automations": "Automations",
  "/_authenticated/admin/automations/$automationId": "Automation",
  "/_authenticated/admin/automations/templates": "Automation templates",
  "/_authenticated/admin/automations/templates/$templateKey":
    "Automation template",
  "/_authenticated/admin/crm": "CRM",
  "/_authenticated/admin/media": "Media",
  "/_authenticated/admin/membership": "Membership",
  "/_authenticated/admin/pages": "Pages",
  "/_authenticated/admin/settings": "Settings",
  "/_authenticated/admin/settings/$tab": "Settings",
}

/** The route's own name, or undefined when this list does not know it. */
export function knownRoutePageTitle(
  routeId: string | undefined,
  workspacesTitle: string
): string | undefined {
  if (routeId === "/_authenticated/workspaces") return workspacesTitle
  return routeId ? ROUTE_TITLES[routeId] : undefined
}

export function routePageTitle(
  routeId: string | undefined,
  workspacesTitle: string
) {
  return knownRoutePageTitle(routeId, workspacesTitle) ?? "Page"
}
