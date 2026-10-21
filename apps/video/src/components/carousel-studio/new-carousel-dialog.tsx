import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { LoadingRow } from "@/components/ui/loading-row"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createCarousel,
  createFromTemplate,
  getCarouselErrorMessage,
  listCarouselTemplates,
  writeCarouselWithAi,
  type CarouselFormat,
  type CarouselItem,
  type CarouselSource,
} from "@/lib/api/video/carousels"
import { listProjects } from "@/lib/api/video/projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { CAROUSEL_FORMATS } from "@/lib/video/carousel-schema"
import {
  CAROUSEL_SLIDE_COUNT,
  type CarouselSourceKind,
} from "@/lib/video/carousel-writing"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

type Start = "blank" | "template" | "ai"

const SOURCES: { id: CarouselSourceKind; label: string }[] = [
  { id: "topic", label: "A topic" },
  { id: "notes", label: "Notes" },
  { id: "project", label: "A project" },
  { id: "link", label: "A web link" },
]

/**
 * New carousel: blank, copied from one of your templates, or written by AI
 * from a topic, notes, a project's script or a web page
 * (workspace/docs/carousel-templates.md, workspace/docs/carousel-writing.md).
 * Tyler, 20 Oct 2026: templates are offered here and nowhere else.
 */
export function NewCarouselDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (carousel: CarouselItem) => void
}) {
  // Mounted only while open, so every opening starts from a clean form.
  return open ? <NewCarouselForm onClose={onClose} onCreated={onCreated} /> : null
}

function NewCarouselForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (carousel: CarouselItem) => void
}) {
  const [start, setStart] = React.useState<Start>("blank")
  const [name, setName] = React.useState("")
  const [templates, setTemplates] = React.useState<CarouselItem[] | null>(null)
  const [templateId, setTemplateId] = React.useState<string | null>(null)
  const [source, setSource] = React.useState<CarouselSourceKind>("topic")
  const [words, setWords] = React.useState("")
  const [link, setLink] = React.useState("")
  const [projects, setProjects] = React.useState<
    { id: string; name: string }[] | null
  >(null)
  const [projectId, setProjectId] = React.useState<string | null>(null)
  const [slideCount, setSlideCount] = React.useState<number>(
    CAROUSEL_SLIDE_COUNT.start
  )
  const [format, setFormat] = React.useState<CarouselFormat>("4:5")
  const [saving, setSaving] = React.useState(false)
  const nameRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let active = true
    listCarouselTemplates()
      .then((loaded) => {
        if (active) setTemplates(loaded)
      })
      .catch((error) => {
        if (!active) return
        setTemplates([])
        showErrorToast(getCarouselErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (start !== "ai" || source !== "project" || projects) return
    let active = true
    listProjects({ pageSize: 100 })
      .then((loaded) => {
        if (active) {
          setProjects(
            loaded.projects.map((project) => ({ id: project.id, name: project.name }))
          )
        }
      })
      .catch((error) => {
        if (active) {
          setProjects([])
          showErrorToast(getCarouselErrorMessage(error))
        }
      })
    return () => {
      active = false
    }
  }, [projects, source, start])

  function aiSource(): CarouselSource | null {
    if (source === "project") return projectId ? { kind: "project", projectId } : null
    if (source === "link") return link.trim() ? { kind: "link", url: link.trim() } : null
    return words.trim() ? { kind: source, text: words.trim() } : null
  }

  async function handleCreate() {
    if (start !== "ai" && !name.trim()) {
      showErrorToast("A carousel needs a name.")
      nameRef.current?.focus()
      return
    }
    if (start === "template" && !templateId) {
      showErrorToast("Pick a template to start from.")
      return
    }
    const fromAi = start === "ai" ? aiSource() : null
    if (start === "ai" && !fromAi) {
      showErrorToast(
        source === "project"
          ? "Pick the project whose script to work from."
          : source === "link"
            ? "Paste the address of the page to work from."
            : "Write what the carousel is about first."
      )
      return
    }
    setSaving(true)
    try {
      const created =
        start === "template" && templateId
          ? await createFromTemplate(templateId, name)
          : fromAi
            ? await writeCarouselWithAi(fromAi, slideCount, format)
            : await createCarousel(name)
      dismissErrorToast()
      onCreated(created)
      onClose()
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const hasTemplates = Boolean(templates?.length)
  const dirty = Boolean(name.trim() || words.trim() || link.trim() || projectId)

  return (
    <FormDialog open dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            nameRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>New carousel</DialogTitle>
            <DialogDescription>
              Start blank, from one of your templates, or have AI write the slides.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreate()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Start from</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Tabs value={start} onValueChange={(value) => setStart(value as Start)}>
                    <TabsList>
                      <TabsTrigger value="blank">Blank</TabsTrigger>
                      {hasTemplates ? (
                        <TabsTrigger value="template">A template</TabsTrigger>
                      ) : null}
                      <TabsTrigger value="ai">Write it with AI</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {start !== "ai" ? (
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="new-carousel-name">Carousel name</FieldLabel>
                      <Input
                        id="new-carousel-name"
                        ref={nameRef}
                        value={name}
                        maxLength={200}
                        placeholder="Five ways to improve your hook"
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                  ) : null}

                  {start === "template" ? (
                    templates === null ? (
                      <LoadingRow label="Loading templates" />
                    ) : (
                      <div role="radiogroup" aria-label="Template" className="grid gap-2">
                        {templates.map((template) => {
                          const on = templateId === template.id
                          return (
                            <button
                              key={template.id}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => setTemplateId(template.id)}
                              className={cn(
                                "flex items-center gap-3 rounded-md border p-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                on && "border-primary bg-muted"
                              )}
                            >
                              <span className="grid size-9 flex-none place-items-center overflow-hidden rounded bg-muted">
                                {template.thumbnail_url ? (
                                  <img
                                    src={template.thumbnail_url}
                                    alt=""
                                    className="size-full object-cover"
                                  />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {template.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {template.slide_count} {plural(template.slide_count, "slide")} ·{" "}
                                {template.format}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  ) : null}
                </CardContent>
              </Card>

              {start === "ai" ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>What to write from</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <Tabs
                      value={source}
                      onValueChange={(value) => setSource(value as CarouselSourceKind)}
                    >
                      <TabsList>
                        {SOURCES.map((option) => (
                          <TabsTrigger key={option.id} value={option.id}>
                            {option.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    {source === "topic" ? (
                      <div className="grid gap-2">
                        <FieldLabel htmlFor="new-carousel-topic">Topic</FieldLabel>
                        <Input
                          id="new-carousel-topic"
                          value={words}
                          maxLength={300}
                          placeholder="5 mistakes new runners make"
                          onChange={(event) => setWords(event.target.value)}
                        />
                      </div>
                    ) : source === "notes" ? (
                      <div className="grid gap-2">
                        <FieldLabel htmlFor="new-carousel-notes">Notes</FieldLabel>
                        <Textarea
                          id="new-carousel-notes"
                          value={words}
                          rows={1}
                          maxLength={20_000}
                          placeholder="Paste a paragraph or your notes"
                          onChange={(event) => setWords(event.target.value)}
                        />
                      </div>
                    ) : source === "project" ? (
                      <div className="grid gap-2">
                        <FieldLabel
                          htmlFor="new-carousel-project"
                          hint="The words of its voiceovers, or the words on its timeline when it has none. The carousel belongs to that project."
                        >
                          Project
                        </FieldLabel>
                        {projects === null ? (
                          <LoadingRow label="Loading projects" />
                        ) : (
                          <Select
                            value={projectId ?? undefined}
                            onValueChange={setProjectId}
                          >
                            <SelectTrigger id="new-carousel-project">
                              <SelectValue placeholder="Pick a project" />
                            </SelectTrigger>
                            <SelectContent>
                              {projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <FieldLabel
                          htmlFor="new-carousel-link"
                          hint="A public https page, such as an article. Its words are read once to write the slides."
                        >
                          Web link
                        </FieldLabel>
                        <Input
                          id="new-carousel-link"
                          type="url"
                          value={link}
                          maxLength={2_048}
                          placeholder="https://"
                          onChange={(event) => setLink(event.target.value)}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {start === "ai" ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Slides</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <NumberField
                      id="new-carousel-slides"
                      label="How many slides"
                      value={slideCount}
                      min={CAROUSEL_SLIDE_COUNT.min}
                      max={CAROUSEL_SLIDE_COUNT.max}
                      onChange={setSlideCount}
                    />
                    <div className="grid gap-2">
                      <FieldLabel>Shape</FieldLabel>
                      <Tabs
                        value={format}
                        onValueChange={(value) => setFormat(value as CarouselFormat)}
                      >
                        <TabsList>
                          {CAROUSEL_FORMATS.map((option) => (
                            <TabsTrigger key={option} value={option}>
                              {option}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2Icon className="animate-spin" />
                ) : start === "ai" ? (
                  <SparklesIcon />
                ) : null}
                {start === "ai"
                  ? saving
                    ? "Writing"
                    : "Write carousel"
                  : "Create carousel"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
