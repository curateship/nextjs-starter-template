// How a link an admin typed becomes something the header can navigate with.
// Both header rows — the left shortcuts and the top-right menu — use these, so
// an address is read the same way on both sides.

export function isExternalHref(href?: string) {
  if (!href) {
    return false
  }

  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")
  )
}

/**
 * The router's `Link` takes a path, a query and a hash separately, while a
 * saved link is one string an admin typed — so split it here. Without this a
 * link like `/admin/media?tab=images` would be asked for as a page whose name
 * literally contains a question mark, which is not the page.
 */
export function toLinkProps(href: string) {
  const [beforeHash, hash] = href.split("#")
  const [pathname, query] = beforeHash.split("?")

  return {
    to: pathname,
    search: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    hash: hash || undefined,
  }
}
