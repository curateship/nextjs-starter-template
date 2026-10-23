"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils/tailwind"
import type { TableOfContentsItem } from "./table-of-contents-utils"

interface TableOfContentsBlockProps {
  content: Record<string, any>
  items: TableOfContentsItem[]
}

export function TableOfContentsBlock({ content, items }: TableOfContentsBlockProps) {
  const [activeId, setActiveId] = useState(items[0]?.id || "")

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[]

    if (headings.length === 0) return

    const updateActiveHeading = () => {
      const offset = 120
      const scrollBottom = window.scrollY + window.innerHeight
      const pageBottom = document.documentElement.scrollHeight

      if (scrollBottom >= pageBottom - 4) {
        setActiveId(headings[headings.length - 1].id)
        return
      }

      const activeHeading = [...headings]
        .reverse()
        .find((heading) => heading.getBoundingClientRect().top <= offset)

      setActiveId(activeHeading?.id || headings[0].id)
    }

    updateActiveHeading()
    window.addEventListener("scroll", updateActiveHeading, { passive: true })
    window.addEventListener("resize", updateActiveHeading)

    return () => {
      window.removeEventListener("scroll", updateActiveHeading)
      window.removeEventListener("resize", updateActiveHeading)
    }
  }, [items])

  if (items.length === 0) return null

  const title = typeof content.title === "string" ? content.title : "On this page"

  return (
    <nav
      aria-label={title || "Table of contents"}
      className="rounded-lg border bg-background p-4 text-left"
    >
      {title && (
        <h2 className="mb-5 text-base font-semibold text-foreground">
          {title}
        </h2>
      )}
      <ol className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn(
                "block border-l-2 border-transparent pl-3 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground",
                activeId === item.id && "border-primary text-foreground font-medium"
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
