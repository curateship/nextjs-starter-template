import * as React from "react"
import { Link } from "@tanstack/react-router"

import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  filterFreeToolsByName,
  groupFreeTools,
  type FreeTool,
} from "@/lib/free-tools/registry"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The `/tools` page body: a search box, then one section per group of cards,
 * then a sign-up link for a visitor who is not signed in. Searching filters
 * the list the page already has, so typing asks the server nothing.
 */
export function ToolsPage({
  tools,
  signedIn,
}: {
  tools: readonly FreeTool[]
  signedIn: boolean
}) {
  const [query, setQuery] = React.useState("")
  const groups = groupFreeTools(filterFreeToolsByName(tools, query))

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-2 text-left md:gap-3">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Free tools</h1>
          <p className="text-sm text-muted-foreground">
            Calculators, live market pages, wallet tools and alerts. No account
            needed.
          </p>
        </div>
        {tools.length > 0 ? (
          <DashboardToolbarSearch
            name="tool-search"
            aria-label="Search free tools"
            placeholder="Search tools…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}
      </header>

      {tools.length === 0 ? (
        <EmptyCard>No free tools are open yet. Check back soon.</EmptyCard>
      ) : groups.length === 0 ? (
        <EmptyCard>{`No tool has "${query.trim()}" in its name.`}</EmptyCard>
      ) : (
        groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`tools-${group.id}`}
            className="flex flex-col gap-2"
          >
            <h2 id={`tools-${group.id}`} className="text-base font-medium">
              {group.label}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3">
              {group.tools.map((tool) => (
                <li key={tool.id} className="min-w-0">
                  <ToolCard tool={tool} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {signedIn ? null : (
        <Card size="sm">
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Want to trade on these numbers? Connect your exchanges in one
              account.
            </p>
            <Button asChild className="w-fit">
              <Link to="/register">Create account</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * The whole card is the link. An unshipped tool only reaches here through the
 * dev preview, and it is drawn without a link because its page does not exist.
 */
function ToolCard({ tool }: { tool: FreeTool }) {
  const card = (
    <Card
      size="sm"
      className={cn(
        "h-full",
        tool.shipped && "transition-colors hover:bg-muted/50"
      )}
    >
      <CardHeader>
        <CardTitle as="h3">{tool.name}</CardTitle>
        <CardDescription>
          {tool.summary}
          {tool.shipped ? null : " Not built yet."}
        </CardDescription>
      </CardHeader>
    </Card>
  )
  if (!tool.shipped) return card
  return (
    <Link to={tool.path} className={cn("block h-full rounded-xl", focusRing)}>
      {card}
    </Link>
  )
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent>
        <p role="status" className="text-sm text-muted-foreground">
          {children}
        </p>
      </CardContent>
    </Card>
  )
}
