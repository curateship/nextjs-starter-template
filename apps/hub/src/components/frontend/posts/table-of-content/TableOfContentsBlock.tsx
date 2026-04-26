import type { TableOfContentsItem } from "./table-of-contents-utils"

interface TableOfContentsBlockProps {
  content: Record<string, any>
  items: TableOfContentsItem[]
}

export function TableOfContentsBlock({ content, items }: TableOfContentsBlockProps) {
  if (items.length === 0) return null

  const title = typeof content.title === "string" ? content.title : "On this page"

  return (
    <nav
      aria-label={title || "Table of contents"}
      className="rounded-lg border bg-background p-4 text-left"
    >
      {title && (
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {title}
        </h2>
      )}
      <ol className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
