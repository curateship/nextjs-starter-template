import { describe, expect, it } from "vitest"

import type { PageDescriptor } from "@/lib/pages/page-descriptor"
import {
  createDefaultPublicBreadcrumbs,
  normalizePublicBreadcrumbs,
  publicBreadcrumbKind,
  publicBreadcrumbTrail,
} from "@/lib/pages/public-breadcrumbs"

function page(partial: Partial<PageDescriptor> & { path: string }): PageDescriptor {
  return {
    name: partial.name ?? "Page",
    summary: "",
    canSwitchOff: true,
    layout: "card",
    source: "shell",
    ...partial,
  }
}

const allOn = { written: true, search: true, pricing: true }

describe("public breadcrumb settings", () => {
  it("starts with every kind switched off", () => {
    expect(createDefaultPublicBreadcrumbs()).toEqual({
      written: false,
      search: false,
      pricing: false,
    })
    expect(normalizePublicBreadcrumbs(undefined)).toEqual(
      createDefaultPublicBreadcrumbs()
    )
    expect(normalizePublicBreadcrumbs("on")).toEqual(
      createDefaultPublicBreadcrumbs()
    )
  })

  it("keeps saved switches and drops values that are not true or false", () => {
    expect(
      normalizePublicBreadcrumbs({ written: true, search: "yes", extra: true })
    ).toEqual({ written: true, search: false, pricing: false })
  })
})

describe("which kind a page is", () => {
  it("names search and pricing, and calls an unlisted address a written page", () => {
    expect(publicBreadcrumbKind("/search", page({ path: "/search" }))).toBe(
      "search"
    )
    expect(publicBreadcrumbKind("/pricing", page({ path: "/pricing" }))).toBe(
      "pricing"
    )
    expect(publicBreadcrumbKind("/about", null)).toBe("written")
  })

  it("gives the front page and the sign-in pages no kind at all", () => {
    expect(publicBreadcrumbKind("/", page({ path: "/" }))).toBeNull()
    expect(publicBreadcrumbKind("/login", page({ path: "/login" }))).toBeNull()
  })
})

describe("the trail itself", () => {
  it("draws nothing while the kind is switched off", () => {
    expect(
      publicBreadcrumbTrail({
        path: "/pricing",
        page: page({ path: "/pricing", name: "Pricing" }),
        breadcrumbs: createDefaultPublicBreadcrumbs(),
      })
    ).toEqual([])
  })

  it("switches one kind on without touching the others", () => {
    const breadcrumbs = { written: true, search: false, pricing: false }

    expect(
      publicBreadcrumbTrail({
        path: "/about",
        page: null,
        writtenPageTitle: "About us",
        breadcrumbs,
      })
    ).toEqual([{ label: "Home", href: "/" }, { label: "About us" }])
    expect(
      publicBreadcrumbTrail({
        path: "/search",
        page: page({ path: "/search", name: "Search" }),
        breadcrumbs,
      })
    ).toEqual([])
  })

  it("uses the front page's own name when it has been renamed", () => {
    expect(
      publicBreadcrumbTrail({
        path: "/pricing",
        page: page({ path: "/pricing", name: "Pricing" }),
        homeLabel: "Start here",
        breadcrumbs: allOn,
      })
    ).toEqual([{ label: "Start here", href: "/" }, { label: "Pricing" }])
  })

  it("draws nothing for an address whose page has no title", () => {
    expect(
      publicBreadcrumbTrail({
        path: "/gone",
        page: null,
        writtenPageTitle: "   ",
        breadcrumbs: allOn,
      })
    ).toEqual([])
  })

  it("tidies a title saved with stray spacing", () => {
    expect(
      publicBreadcrumbTrail({
        path: "/about",
        page: null,
        writtenPageTitle: "  About\n  us  ",
        breadcrumbs: allOn,
      })
    ).toEqual([{ label: "Home", href: "/" }, { label: "About us" }])
  })
})
