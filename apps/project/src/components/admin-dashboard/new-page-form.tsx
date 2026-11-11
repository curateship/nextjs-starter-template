import * as React from "react"

import { ImageUpload } from "@/components/shared/image-upload"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  getWrittenPageErrorMessage,
  saveNewWrittenPage,
  type WrittenPage,
} from "@/lib/api/content/pages"
import { MAX_WRITTEN_PAGE_DESCRIPTION } from "@/lib/pages/front-page"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/**
 * New page, as a dropdown form under its button, as every + on the Admin
 * dashboard is (Tyler, 9 Nov 2026: "make it a dropdown instead of modal").
 * It was the Pages screen's Add a page window until the Pages list moved into
 * the dashboard the same day.
 *
 * A name, an address, and a picture if the page wants one. **What the page
 * holds is not asked here.** Every page an admin adds is built from blocks,
 * like the front page, so creating one opens the page builder with an empty
 * block of words waiting (Tyler, 4 Oct 2026). The picture belongs to the page
 * rather than to anything on it, and the builder's Page settings can change
 * it later.
 */
export function useNewPageForm(onCreated: (page: WrittenPage) => Promise<void> | void) {
  const [title, setTitle] = React.useState("")
  const [path, setPath] = React.useState("")
  const [image, setImage] = React.useState("")
  const [imageAlt, setImageAlt] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [run, saving] = useAsyncAction(getWrittenPageErrorMessage)

  /** Makes the page; true once it exists. */
  const submit = async (): Promise<boolean> => {
    let created = false
    await run(async () => {
      // The server's refusals are already sentences an admin can act on,
      // "Pricing already answers on /pricing", so they are shown as they are.
      const page = await saveNewWrittenPage({ title, path, image, imageAlt, description })
      setTitle("")
      setPath("")
      setImage("")
      setImageAlt("")
      setDescription("")
      created = true
      await onCreated(page)
    }, "Page created.")
    return created
  }

  const fields = (
    <>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-page-title" hint="What the page is called in the Pages list and in the browser tab.">
          Name
        </FieldLabel>
        <Input
          id="new-page-title"
          autoFocus
          value={title}
          disabled={saving}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="new-page-path"
          hint="Letters, numbers and dashes, like /about-us. It cannot be an address a built-in page already uses."
        >
          Address
        </FieldLabel>
        <Input
          id="new-page-path"
          value={path}
          placeholder="/about"
          disabled={saving}
          onChange={(event) => setPath(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="new-page-description"
          hint="Optional. A line or two about the page, shown under its name on a Pages list block and told to search engines."
        >
          Description
        </FieldLabel>
        <Textarea
          id="new-page-description"
          rows={2}
          value={description}
          maxLength={MAX_WRITTEN_PAGE_DESCRIPTION}
          disabled={saving}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <ImageUpload
        label="Picture"
        hint="Optional. Drawn at the top of the page, above everything on it."
        value={image}
        aspect="square"
        fit="cover"
        emptyLabel="Add picture"
        className="max-w-24"
        disabled={saving}
        onChange={(picked, altText) => {
          setImage(picked)
          // The library's own name for the file is what a screen reader says.
          setImageAlt(altText ?? "")
        }}
      />
    </>
  )

  return { fields, submit, saving }
}
