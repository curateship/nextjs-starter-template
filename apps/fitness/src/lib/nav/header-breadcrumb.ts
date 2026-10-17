import {
  isActiveShellHref,
  type ShellChildItem,
  type ShellItem,
} from "@/lib/custom-shell"

/** One step of the header's trail. The last step never carries an address. */
export type HeaderBreadcrumbStep = {
  label: string
  href?: string
  icon?: ShellItem["icon"]
}

/**
 * Where you are, read off the sidebar: the sidebar link you are under, then
 * its child link, then the page's own name when you are deeper than either
 * (a record's name, such as one automation). A page outside the sidebar is its
 * own name alone.
 *
 * `items` are the sidebar links this person can see. `pageTitle` is the record
 * name its loader returned, or the route's known name, or nothing. Whatever is
 * the last step loses its address, because it is the page you are on.
 */
export function buildHeaderBreadcrumb({
  items,
  currentPath,
  pageTitle,
}: {
  items: ShellItem[]
  currentPath: string
  pageTitle?: string
}): HeaderBreadcrumbStep[] {
  // Most specific match wins, so /admin/automations/templates sits under a
  // Templates child link when there is one, not only under Automations.
  let best: { item: ShellItem; child?: ShellChildItem; href: string } | null =
    null
  for (const item of items) {
    const candidates = [
      { item, href: item.href },
      ...(item.children ?? []).map((child) => ({
        item,
        child,
        href: child.href,
      })),
    ]
    for (const candidate of candidates) {
      if (!isActiveShellHref(candidate.href, currentPath)) continue
      if (!best || candidate.href.trim().length > best.href.trim().length) {
        best = candidate
      }
    }
  }

  const steps: HeaderBreadcrumbStep[] = []
  if (best) {
    steps.push({
      label: best.item.label.trim(),
      href: best.item.href,
      icon: best.item.icon,
    })
    // A child link that points where its parent does adds nothing new.
    if (best.child && best.child.href.trim() !== best.item.href.trim()) {
      steps.push({
        label: best.child.label.trim(),
        href: best.child.href,
        icon: best.child.icon,
      })
    }
  }

  const title = pageTitle?.trim()
  const deeper = !best || best.href.trim() !== currentPath
  if (title && deeper && title !== steps.at(-1)?.label) {
    steps.push({ label: title })
  }

  const last = steps.at(-1)
  if (last) steps[steps.length - 1] = { ...last, href: undefined }
  return steps
}
