"use client"

import { useEffect, useState } from "react"
import { mergeAttributes, Node as TiptapNode } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { Button } from "@/components/ui/button"
import { SponsorPickerDialog } from "@/components/admin/sponsors/SponsorPickerDialog"
import { SponsorCard } from "@/components/admin/sponsors/SponsorCard"
import { getActiveSponsorsByIdsAction, type SponsorPublic } from "@/lib/actions/sponsors/sponsor-actions"

function SponsorEmbedNodeView(props: any) {
  const sponsorId = props.node?.attrs?.sponsorId as string | null
  const siteId = props.extension?.options?.siteId as string | undefined
  const [sponsor, setSponsor] = useState<SponsorPublic | null>(null)
  const [loading, setLoading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleDelete = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    props.deleteNode?.()
  }

  const handleOpenPicker = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setPickerOpen(true)
  }

  const handleSponsorSelect = (nextSponsor: SponsorPublic) => {
    props.updateAttributes?.({ sponsorId: nextSponsor.id })
    setSponsor(nextSponsor)
    setPickerOpen(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadSponsor() {
      if (!siteId || !sponsorId) {
        setSponsor(null)
        return
      }

      setLoading(true)
      const sponsorsById = await getActiveSponsorsByIdsAction(siteId, [sponsorId])

      if (!cancelled) {
        setSponsor(sponsorsById[sponsorId] || null)
        setLoading(false)
      }
    }

    loadSponsor()

    return () => {
      cancelled = true
    }
  }, [siteId, sponsorId])

  return (
    <NodeViewWrapper className="not-prose group relative my-5" contentEditable={false}>
      <div onClick={(event) => event.preventDefault()}>
        {sponsor ? (
          <SponsorCard sponsor={sponsor} tracking={false} className="pointer-events-none my-0" />
        ) : (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {loading ? "Loading sponsor..." : "Sponsor unavailable"}
          </div>
        )}
        <>
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
            {siteId && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-8 rounded-full shadow-lg"
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={handleOpenPicker}
                title="Change sponsor"
              >
                <Settings className="h-4 w-4" />
                <span className="sr-only">Change sponsor</span>
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="size-8 rounded-full shadow-lg"
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={handleDelete}
              title="Delete sponsor"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete sponsor</span>
            </Button>
          </div>
          {siteId && (
            <SponsorPickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              siteId={siteId}
              onSelectSponsor={handleSponsorSelect}
            />
          )}
        </>
      </div>
    </NodeViewWrapper>
  )
}

export const SponsorEmbed = TiptapNode.create({
  name: "sponsor",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      siteId: "",
    }
  },

  addAttributes() {
    return {
      sponsorId: {
        default: null,
        parseHTML: element => element.getAttribute("data-sponsor-id"),
        renderHTML: attributes => ({
          "data-sponsor-id": attributes.sponsorId,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "hub-sponsor[data-sponsor-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "hub-sponsor",
      mergeAttributes(HTMLAttributes, {
        class:
          "not-prose my-5 flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground",
      }),
      ["span", { class: "flex h-8 w-8 items-center justify-center rounded-md border bg-background" }, "Sponsor"],
      ["span", { class: "font-medium text-foreground" }, "Sponsor embed"],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SponsorEmbedNodeView)
  },
})
