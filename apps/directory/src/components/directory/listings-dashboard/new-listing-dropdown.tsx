import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { getListingErrorMessage, saveNewListing } from "@/lib/api/directory/listings"
import { slugFromTitle } from "@/lib/directory/slugs"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/**
 * New listing, as a dropdown form under its button, as every New … on the
 * shell's dashboards is (UI standard, "Three-column dashboards"). A name and
 * an address part, nothing else: the new listing, a draft, then opens on the
 * right, where everything else about it is written and saves itself.
 *
 * Two buttons open it: the Listings row's New listing, and the + in the left
 * page's header (`left`), which opens it over the middle.
 */
export function NewListingDropdown({ left = false, onCreated }: { left?: boolean; onCreated?: () => void }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [slugEdited, setSlugEdited] = React.useState(false)
  const [run, saving] = useAsyncAction(getListingErrorMessage)

  const submit = () =>
    void run(async () => {
      if (!title.trim()) throw new Error("Give the listing a name first.")
      const made = await saveNewListing({ title: title.trim(), slug: slugEdited && slug.trim() ? slug.trim() : undefined })
      setTitle("")
      setSlug("")
      setSlugEdited(false)
      setOpen(false)
      onCreated?.()
      await router.invalidate()
      await navigate({ to: "/admin/listings", search: { open: made.id } })
    })

  return (
    <NewRecordDropdown
      label="New listing"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create listing"
      busy={saving}
      onSubmit={submit}
      align={left ? "start" : "end"}
      trigger={
        left ? (
          <Button type="button" variant="ghost" size="icon" aria-label="New listing" className="shrink-0">
            <PlusIcon className="size-4" />
          </Button>
        ) : (
          <DashboardToolbarButton type="button" aria-label="New listing">
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New listing</span>
          </DashboardToolbarButton>
        )
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-listing-title">Name</FieldLabel>
        <Input
          id="new-listing-title"
          autoFocus
          value={title}
          disabled={saving}
          onChange={(event) => {
            setTitle(event.target.value)
            // The address writes itself from the name until it is typed in directly.
            if (!slugEdited) setSlug(slugFromTitle(event.target.value))
          }}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-listing-slug" hint="The public page's address part, like joes-diner. It starts as a draft, so nothing is public yet.">
          Address part
        </FieldLabel>
        <Input
          id="new-listing-slug"
          value={slug}
          placeholder="joes-diner"
          disabled={saving}
          onChange={(event) => {
            setSlug(event.target.value)
            setSlugEdited(true)
          }}
        />
      </div>
    </NewRecordDropdown>
  )
}
