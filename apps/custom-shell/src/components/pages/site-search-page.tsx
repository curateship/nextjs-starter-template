import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { SiteSearchForm } from "@/components/shared/site-search-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { getSiteSearchErrorMessage } from "@/lib/api/content/search"
import { focusRing } from "@/lib/layout/focus-ring"
import { plural } from "@/lib/format/plural"
import { toLinkProps } from "@/lib/nav/nav-href"
import type { SiteSearchResult } from "@/lib/pages/site-search"

export function SiteSearchPage({ query, results }: { query: string; results: SiteSearchResult[] }) {
  return (
    <SiteSearchFrame>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Search</h1>
        <p className="text-sm text-muted-foreground">
          Find pages and everything else published on this site.
        </p>
      </header>

      <SiteSearchForm className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <FieldLabel htmlFor="site-search-query">
            Search this site
          </FieldLabel>
          <Input
            key={query}
            id="site-search-query"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Enter a word or phrase"
            maxLength={120}
          />
        </div>
        <Button type="submit" className="self-end">
          Search
        </Button>
      </SiteSearchForm>

      <SearchResults query={query} results={results} />
    </SiteSearchFrame>
  )
}

function SearchResults({ query, results }: { query: string; results: SiteSearchResult[] }) {
  if (!query || results.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {query
              ? "Nothing matches that. Try a different word or phrase."
              : "Enter a word or phrase to search this site."}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-2 md:gap-3">
      <p className="text-sm text-muted-foreground">
        {results.length} {plural(results.length, "result")}
      </p>
      <ul className="grid gap-2 md:gap-3">
        {results.map((result) => (
          <li key={`${result.type}:${result.path}`}>
            <Card size="sm" className="transition-colors hover:bg-accent/40">
              <CardContent className="grid gap-1">
                <p className="text-xs font-medium text-muted-foreground">{result.type}</p>
                <h2 className="text-base font-medium">
                  <Link {...toLinkProps(result.path)} preload="intent" className={focusRing}>
                    {result.title}
                  </Link>
                </h2>
                {result.snippet ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">{result.snippet}</p>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteSearchRouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <SiteSearchFrame>
      <Card>
        <CardContent className="grid justify-items-start gap-2">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">{getSiteSearchErrorMessage(error)}</p>
          <Button type="button" onClick={() => void router.invalidate()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </SiteSearchFrame>
  )
}

function SiteSearchFrame({ children }: { children: React.ReactNode }) {
  return (
    <PublicPageFrame>
      <div className="flex w-full flex-col gap-2 md:gap-3">{children}</div>
    </PublicPageFrame>
  )
}
