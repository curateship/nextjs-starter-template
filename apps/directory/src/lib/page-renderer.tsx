import {
  cloneElement,
  createElement,
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react"
import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { renderServerComponent } from "@tanstack/react-start/rsc"
import type { Metadata } from "@/lib/metadata"
import { metadataToHead } from "@/lib/metadata-head"

type SearchValue = string | string[] | undefined
type PageProps = {
  params: Promise<Record<string, string | string[]>>
  searchParams: Promise<Record<string, SearchValue>>
}
type PageModule = {
  default: ComponentType<PageProps>
  generateMetadata?: (props: PageProps) => Metadata | Promise<Metadata>
  metadata?: Metadata
}
type PageLoader = () => Promise<PageModule>
type RenderableComponent<Props> = ComponentType<Props> & { $$typeof?: symbol }

type PageRoute = {
  keys: Array<{ name: string; catchAll: boolean }>
  load: PageLoader
  pattern: RegExp
  score: number
}

const pageModules = import.meta.glob<PageModule>("../screens/**/page.tsx")
const adminLayout = () => import("@/screens/admin/layout")
const marketplaceLayout = () => import("@/screens/themes/marketplace/layout")
const appLayout = () => import("@/screens/layout")

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildPageRoute(modulePath: string, load: PageLoader): PageRoute {
  const relativePath = modulePath
    .replace(/^\.\.\/screens\//, "")
    .replace(/\/page\.tsx$/, "")
  const segments = relativePath === "page.tsx" || relativePath === "" ? [] : relativePath.split("/")
  const keys: PageRoute["keys"] = []
  let score = segments.length

  const pattern = segments
    .map((segment) => {
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/)
      if (catchAll) {
        keys.push({ name: catchAll[1], catchAll: true })
        return "(.+)"
      }

      const dynamic = segment.match(/^\[(.+)\]$/)
      if (dynamic) {
        keys.push({ name: dynamic[1], catchAll: false })
        score += 10
        return "([^/]+)"
      }

      score += 100
      return escapePattern(segment)
    })
    .join("/")

  return {
    keys,
    load,
    pattern: new RegExp(`^/${pattern}${segments.length ? "" : "?"}$`),
    score,
  }
}

const pageRoutes = Object.entries(pageModules)
  .map(([path, load]) => buildPageRoute(path, load))
  .sort((left, right) => right.score - left.score)

function parseSearch(search: string) {
  const values: Record<string, SearchValue> = {}
  const params = new URLSearchParams(search)

  for (const key of new Set(params.keys())) {
    const all = params.getAll(key)
    values[key] = all.length > 1 ? all : all[0]
  }

  return values
}

function resolvePage(pathname: string) {
  for (const route of pageRoutes) {
    const match = pathname.match(route.pattern)
    if (!match) continue

    const params: Record<string, string | string[]> = {}
    try {
      route.keys.forEach((key, index) => {
        const value = decodeURIComponent(match[index + 1] || "")
        params[key.name] = key.catchAll ? value.split("/") : value
      })
    } catch {
      throw notFound()
    }

    return { route, params }
  }

  throw notFound()
}

async function renderComponent<Props extends object>(
  Component: RenderableComponent<Props>,
  props: Props
): Promise<ReactNode> {
  if (Component.$$typeof === Symbol.for("react.client.reference")) {
    return createElement(Component, props)
  }

  return await (Component as (props: Props) => ReactNode | Promise<ReactNode>)(props)
}

const renderPage = createServerFn({ method: "GET" })
  .inputValidator((input: { pathname: string; search: string }) => input)
  .handler(async ({ data }) => {
    const { route, params } = resolvePage(data.pathname)
    const pageModule = await route.load()
    const props: PageProps = {
      params: Promise.resolve(params),
      searchParams: Promise.resolve(parseSearch(data.search)),
    }
    let adminShell: ReactNode = null
    const isAdminRoute = data.pathname === "/admin" || data.pathname.startsWith("/admin/")
    if (isAdminRoute) {
      const { default: AdminLayout } = await adminLayout()
      adminShell = await renderComponent(AdminLayout, { children: null })
    }

    let content = await renderComponent(pageModule.default, props)

    if (adminShell && isValidElement(adminShell)) {
      content = cloneElement(adminShell, undefined, content)
    } else if (
      data.pathname === "/themes/marketplace" ||
      data.pathname.startsWith("/themes/marketplace/")
    ) {
      const { default: MarketplaceLayout } = await marketplaceLayout()
      content = await renderComponent(MarketplaceLayout, { children: content })
    }

    const appLayoutModule = await appLayout()
    content = await renderComponent(appLayoutModule.default, { children: content })

    const [layoutMetadata, pageMetadata] = await Promise.all([
      appLayoutModule.generateMetadata?.() || {},
      pageModule.generateMetadata?.(props) || pageModule.metadata || {},
    ])
    const head = metadataToHead({ ...layoutMetadata, ...pageMetadata })

    return { Renderable: await renderServerComponent(content), head }
  })

export async function loadRenderedPage(pathname: string, search: string) {
  return renderPage({ data: { pathname, search } })
}
