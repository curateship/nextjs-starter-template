import { BoxesIcon } from "lucide-react"
import { SurfaceCard } from "@/components/surface-card"
import { scraperModules } from "@/modules/registry"

export function Dashboard() {
  return (
    <SurfaceCard
      title="Modules"
      description="Registered scraper modules will appear here."
    >
      {scraperModules.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {scraperModules.map((module) => (
            <a
              key={module.key}
              href={module.href}
              className="block rounded-lg border border-border/70 bg-background/80 p-4 transition-colors hover:bg-muted/40"
            >
              <p className="text-sm font-semibold">{module.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
            </a>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <BoxesIcon className="size-4" />
          <span>No scraper modules registered yet.</span>
        </div>
      )}
    </SurfaceCard>
  )
}
