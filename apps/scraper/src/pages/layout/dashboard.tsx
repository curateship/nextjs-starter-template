import { Link } from "@tanstack/react-router"
import { SurfaceCard } from "@/components/surface-card"

export function Dashboard() {
  return (
    <SurfaceCard
      title="Scrapers"
      description="Select a scraper module to view its dashboard, runs, and schedules."
      actions={
        <Link to="/google-maps" className="scraper-link text-sm font-medium">
          Open Google Maps
        </Link>
      }
    >
      <Link
        to="/google-maps"
        className="block rounded-2xl border border-border/70 bg-background/80 p-5 transition-colors hover:bg-muted/40"
      >
        <p className="text-sm font-semibold">Google Maps</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Search-based lead scraping with fixed browser isolation, proxy sessions, runs, and schedules.
        </p>
      </Link>
    </SurfaceCard>
  )
}
