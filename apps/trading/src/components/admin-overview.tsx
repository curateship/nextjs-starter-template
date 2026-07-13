import { Link } from "@tanstack/react-router"

import { useShellRuntime } from "@/components/shell-layout"
import { renderShellIcon, type ShellItem } from "@/lib/custom-shell"

/**
 * Default landing for `/admin` when no route is configured: an overview that
 * links into every visible workspace section, grouped as in the sidebar.
 */
export function AdminOverview() {
  const { config } = useShellRuntime()

  const sections = config.sections
    .map((section) => ({
      id: section.id,
      title: section.title,
      items: section.entries.filter(
        (entry): entry is ShellItem =>
          entry.type === "item" &&
          entry.visible &&
          // Internal absolute paths only — never render a javascript:/external href.
          entry.href.startsWith("/") &&
          !entry.href.startsWith("//")
      ),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <div className="space-y-2 md:space-y-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {config.workspaceName || "Overview"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Jump into any area of the workspace.
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.id} className="space-y-2 md:space-y-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {section.title}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
            {section.items.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className="group flex items-center gap-3 rounded-xl border border-foreground/5 bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  {renderShellIcon(item.icon, "size-4")}
                </span>
                <span className="truncate text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
