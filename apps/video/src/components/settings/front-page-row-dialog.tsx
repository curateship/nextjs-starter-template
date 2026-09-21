import * as React from "react"

import { FrontPageRowContentEditor } from "@/components/settings/front-page-row-content-editor"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  FRONT_PAGE_ROW_HEADING_MESSAGE,
  FRONT_PAGE_ROW_KIND_HINTS,
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_KINDS,
  FRONT_PAGE_ROW_LAYOUT_HINTS,
  FRONT_PAGE_ROW_LAYOUT_LABELS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_FRONT_PAGE_ROW_HEADING_LENGTH,
  MAX_FRONT_PAGE_ROW_INTRO_LENGTH,
  type FrontPageRow,
  type FrontPageRowDraft,
  type FrontPageFaqItem,
  type FrontPageLogo,
  type FrontPageRowKind,
  type FrontPageRowLayout,
  type FrontPageScreenshot,
  type FrontPageTestimonial,
} from "@/lib/pages/front-page"
import {
  dismissErrorToast,
  showErrorToast,
} from "@/lib/toast/error-toast"

export function FrontPageRowDialog({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean
  row: FrontPageRow | null
  onClose: () => void
  onSaved: (row: FrontPageRowDraft) => void
}) {
  const [heading, setHeading] = React.useState("")
  const [intro, setIntro] = React.useState("")
  const [kind, setKind] = React.useState<FrontPageRowKind>("text")
  const [layout, setLayout] = React.useState<FrontPageRowLayout>("wide")
  const [testimonials, setTestimonials] = React.useState<
    FrontPageTestimonial[]
  >([])
  const [faqItems, setFaqItems] = React.useState<FrontPageFaqItem[]>([])
  const [logos, setLogos] = React.useState<FrontPageLogo[]>([])
  const [screenshots, setScreenshots] = React.useState<FrontPageScreenshot[]>(
    []
  )
  const [headingTouched, setHeadingTouched] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null)
  const key = open ? (row?.id ?? "new") : null

  if (loadedFor !== key) {
    setLoadedFor(key)
    setHeading(row?.heading ?? "")
    setIntro(row?.intro ?? "")
    setKind(row?.kind ?? "text")
    setLayout(row?.layout ?? "wide")
    setTestimonials(row?.kind === "testimonials" ? row.items : [])
    setFaqItems(row?.kind === "faq" ? row.items : [])
    setLogos(row?.kind === "logos" ? row.items : [])
    setScreenshots(row?.kind === "screenshots" ? row.items : [])
    setHeadingTouched(false)
    setSubmitted(false)
  }

  const currentItems = itemsForKind(
    kind,
    testimonials,
    faqItems,
    logos,
    screenshots
  )
  const savedItems = row && row.kind === kind && "items" in row ? row.items : []
  const dirty =
    heading !== (row?.heading ?? "") ||
    intro !== (row?.intro ?? "") ||
    kind !== (row?.kind ?? "text") ||
    layout !== (row?.layout ?? "wide") ||
    JSON.stringify(currentItems) !== JSON.stringify(savedItems)
  const headingInvalid =
    !heading.trim() && (headingTouched || submitted)

  const save = () => {
    setSubmitted(true)
    if (!heading.trim()) {
      showErrorToast(FRONT_PAGE_ROW_HEADING_MESSAGE)
      return
    }

    const contentProblem = getContentProblem(
      kind,
      testimonials,
      faqItems,
      logos,
      screenshots
    )
    if (contentProblem) {
      showErrorToast(contentProblem)
      return
    }

    dismissErrorToast()
    onSaved(
      buildDraft(
        heading.trim(),
        intro.trim(),
        kind,
        layout,
        testimonials,
        faqItems,
        logos,
        screenshots
      )
    )
  }

  return (
    <FormDialog open={open} dirty={dirty} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {row ? heading.trim() || "Untitled row" : "New front page row"}
            </DialogTitle>
            <DialogDescription>
              Choose what this row shows and how wide it sits on the public
              front page.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Row content</CardTitle>
                <CardDescription>
                  Every row uses a fixed shape, so the front page stays
                  consistent on phones and larger screens.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-kind"
                    hint={FRONT_PAGE_ROW_KIND_HINTS[kind]}
                  >
                    Row type
                  </FieldLabel>
                  <Select
                    value={kind}
                    onValueChange={(value) =>
                      setKind(value as FrontPageRowKind)
                    }
                  >
                    <SelectTrigger
                      id="front-page-row-kind"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FRONT_PAGE_ROW_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {FRONT_PAGE_ROW_KIND_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <FieldLabel htmlFor="front-page-row-heading">
                    Heading
                  </FieldLabel>
                  <Input
                    id="front-page-row-heading"
                    value={heading}
                    maxLength={MAX_FRONT_PAGE_ROW_HEADING_LENGTH}
                    placeholder="Welcome to our site"
                    aria-invalid={headingInvalid || undefined}
                    onBlur={() => setHeadingTouched(true)}
                    onChange={(event) => setHeading(event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-intro"
                    hint="One short line beneath the heading. Leave it empty to show no introduction."
                  >
                    Introduction
                  </FieldLabel>
                  <Textarea
                    id="front-page-row-intro"
                    rows={1}
                    value={intro}
                    maxLength={MAX_FRONT_PAGE_ROW_INTRO_LENGTH}
                    onChange={(event) => setIntro(event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-layout"
                    hint={FRONT_PAGE_ROW_LAYOUT_HINTS[layout]}
                  >
                    Layout
                  </FieldLabel>
                  <Select
                    value={layout}
                    onValueChange={(value) =>
                      setLayout(value as FrontPageRowLayout)
                    }
                  >
                    <SelectTrigger
                      id="front-page-row-layout"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FRONT_PAGE_ROW_LAYOUTS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {FRONT_PAGE_ROW_LAYOUT_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <FrontPageRowContentEditor
              kind={kind}
              testimonials={testimonials}
              faqItems={faqItems}
              logos={logos}
              screenshots={screenshots}
              submitted={submitted}
              onTestimonialsChange={setTestimonials}
              onFaqItemsChange={setFaqItems}
              onLogosChange={setLogos}
              onScreenshotsChange={setScreenshots}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              {row ? "Save changes" : "Create row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function itemsForKind(
  kind: FrontPageRowKind,
  testimonials: FrontPageTestimonial[],
  faqItems: FrontPageFaqItem[],
  logos: FrontPageLogo[],
  screenshots: FrontPageScreenshot[]
) {
  if (kind === "testimonials") return testimonials
  if (kind === "faq") return faqItems
  if (kind === "logos") return logos
  if (kind === "screenshots") return screenshots
  return []
}

function getContentProblem(
  kind: FrontPageRowKind,
  testimonials: FrontPageTestimonial[],
  faqItems: FrontPageFaqItem[],
  logos: FrontPageLogo[],
  screenshots: FrontPageScreenshot[]
) {
  if (kind === "testimonials") {
    if (!testimonials.length) return "Add at least one testimonial."
    if (testimonials.some((item) => !item.name.trim() || !item.quote.trim())) {
      return "Give every testimonial a name and quote."
    }
  }
  if (kind === "faq") {
    if (!faqItems.length) return "Add at least one FAQ entry."
    if (faqItems.some((item) => !item.question.trim() || !item.answer.trim())) {
      return "Give every FAQ entry a question and answer."
    }
  }
  if (kind === "logos") {
    if (!logos.length) return "Add at least one logo."
    if (logos.some((item) => !item.image || !item.alt.trim())) {
      return "Choose every logo image and give it a name."
    }
  }
  if (kind === "screenshots") {
    if (!screenshots.length) return "Add at least one screenshot."
    if (screenshots.some((item) => !item.image || !item.caption.trim())) {
      return "Choose every screenshot image and give it a caption."
    }
  }
  return null
}

function buildDraft(
  heading: string,
  intro: string,
  kind: FrontPageRowKind,
  layout: FrontPageRowLayout,
  testimonials: FrontPageTestimonial[],
  faqItems: FrontPageFaqItem[],
  logos: FrontPageLogo[],
  screenshots: FrontPageScreenshot[]
): FrontPageRowDraft {
  const base = { heading, intro, layout }
  if (kind === "testimonials") return { ...base, kind, items: testimonials }
  if (kind === "faq") return { ...base, kind, items: faqItems }
  if (kind === "logos") return { ...base, kind, items: logos }
  if (kind === "screenshots") return { ...base, kind, items: screenshots }
  return { ...base, kind }
}
