import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { readSearchText } from "@/lib/nav/list-search"

/** A search form that updates the route without reloading the document. */
export function SiteSearchForm({
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action" | "method" | "onSubmit">) {
  const navigate = useNavigate()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = readSearchText(new FormData(event.currentTarget).get("q"))
    void navigate({ to: "/search", search: { q: query } })
  }

  return (
    <form {...props} role="search" onSubmit={submit}>
      {children}
    </form>
  )
}
