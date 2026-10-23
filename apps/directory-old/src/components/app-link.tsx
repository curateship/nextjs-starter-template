import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, unknown> }
  children?: ReactNode
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
}

function resolveHref(href: AppLinkProps["href"]) {
  if (typeof href === "string") return href

  const pathname = href.pathname || "/"
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(href.query || {})) {
    if (value !== undefined && value !== null) search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

// Only a path inside this app can be handled by the client router. Anything else
// — another site, mailto:, tel:, a bare "#" — has to stay an ordinary anchor.
function isInAppPath(href: string) {
  return href.startsWith("/") && !href.startsWith("//")
}

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, prefetch, replace, scroll: _scroll, ...props },
  ref
) {
  const resolved = resolveHref(href)

  if (!isInAppPath(resolved)) {
    return <a ref={ref} href={resolved} {...props} />
  }

  return (
    <Link
      ref={ref}
      to={resolved}
      preload={prefetch === false ? false : "intent"}
      replace={replace}
      {...props}
    />
  )
})

export default AppLink
