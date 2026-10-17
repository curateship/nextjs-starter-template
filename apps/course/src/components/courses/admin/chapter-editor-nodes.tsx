import * as React from "react"
import { mergeAttributes, Node } from "@tiptap/core"
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ChevronRightIcon,
  GripVerticalIcon,
  LightbulbIcon,
  PlusIcon,
  TriangleAlertIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type {
  CalloutTone,
  ChecklistItem,
  QuizQuestion,
} from "@/lib/courses/chapter-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The course blocks as the chapter editor knows them: one Tiptap node each,
 * with the same names and attributes `lib/courses/chapter-body.ts` keeps, so
 * the editor's document is already the shape the server stores.
 *
 * The blocks with fields of their own (a video, a table, a checklist, a quiz)
 * are "atoms": the editor treats each as one solid thing, and its fields are
 * ordinary inputs drawn by a React panel inside it. The Tip box and the
 * fold-out hold ordinary paragraphs, which are edited like the rest of the
 * text.
 */

/** A short id for a checklist item or a quiz part. */
export function newItemId() {
  return Math.random().toString(36).slice(2, 10)
}

/** An attribute held as JSON on the element, so copy and paste keeps it. */
function jsonAttribute<T>(name: string, fallback: T) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => {
      try {
        return JSON.parse(element.getAttribute(`data-${name}`) ?? "") as T
      } catch {
        return fallback
      }
    },
    renderHTML: (attributes: Record<string, unknown>) => ({
      [`data-${name}`]: JSON.stringify(attributes[name]),
    }),
  }
}

function textAttribute(name: string, fallback: string) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`) ?? fallback,
    renderHTML: (attributes: Record<string, unknown>) => ({
      [`data-${name}`]: String(attributes[name] ?? fallback),
    }),
  }
}

/** The frame every course block is drawn in while editing, with a remove button. */
function BlockFrame({
  label,
  selected,
  onRemove,
  children,
  className,
}: {
  label: React.ReactNode
  selected: boolean
  onRemove: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "my-3 grid gap-3 rounded-lg border bg-muted/40 p-3",
        selected && "ring-2 ring-ring",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2" contentEditable={false}>
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove this block"
          onClick={onRemove}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      {children}
    </div>
  )
}

/**
 * A list whose rows drag into a new order by the grip on their left, the
 * same handle and the same drag rules as the shell's menu editor. Used for
 * checklist steps, quiz questions and each question's answers.
 */
function SortableRows<Item extends { id: string }>({
  items,
  onReorder,
  handleLabel,
  gap = "gap-2",
  children,
}: {
  items: Item[]
  onReorder: (next: Item[]) => void
  handleLabel: (item: Item, index: number) => string
  gap?: string
  children: (item: Item, index: number, handle: React.ReactNode) => React.ReactNode
}) {
  const sensors = useNavSensors()
  const contextId = React.useId()
  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event: DragEndEvent) => {
        if (!event.over || event.active.id === event.over.id) return
        const from = items.findIndex((item) => item.id === event.active.id)
        const to = items.findIndex((item) => item.id === event.over?.id)
        if (from === -1 || to === -1) return
        onReorder(arrayMove(items, from, to))
      }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("grid", gap)}>
          {items.map((item, index) => (
            <SortableRow key={item.id} id={item.id} label={handleLabel(item, index)}>
              {(handle) => children(item, index, handle)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)
  return (
    <div ref={setNodeRef} style={style}>
      {children(
        <button
          type="button"
          className={cn(DRAG_HANDLE_CLASS, "h-8 w-6 shrink-0")}
          aria-label={label}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Video

function VideoView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const source = node.attrs.source as "file" | "youtube"
  const src = node.attrs.src as string
  return (
    <NodeViewWrapper data-drag-handle="">
      <BlockFrame label="Video" selected={selected} onRemove={deleteNode}>
        <div contentEditable={false}>
          {source === "youtube" ? (
            <div className="aspect-video w-full overflow-hidden rounded-md border bg-background">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${src}`}
                title="Video preview"
                className="size-full"
                allow="encrypted-media; picture-in-picture; fullscreen"
              />
            </div>
          ) : (
            <video src={src} controls preload="metadata" className="w-full rounded-md border" />
          )}
        </div>
      </BlockFrame>
    </NodeViewWrapper>
  )
}

export const VideoNodeExtension = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      source: textAttribute("source", "file"),
      src: textAttribute("src", ""),
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="video"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "video" })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoView)
  },
})

// ---------------------------------------------------------------------------
// Tip and Watch out

function CalloutView({ node, selected, deleteNode, updateAttributes }: ReactNodeViewProps) {
  const tone = node.attrs.tone as CalloutTone
  return (
    <NodeViewWrapper>
      <BlockFrame
        selected={selected}
        onRemove={deleteNode}
        className={tone === "warning" ? "border-destructive/40" : "border-primary/40"}
        label={
          <span contentEditable={false} className="flex items-center gap-2">
            {tone === "warning" ? (
              <TriangleAlertIcon className="size-4 text-destructive" />
            ) : (
              <LightbulbIcon className="size-4 text-primary" />
            )}
            <button
              type="button"
              className="rounded-sm underline-offset-2 hover:underline"
              onClick={() => updateAttributes({ tone: tone === "warning" ? "tip" : "warning" })}
            >
              {tone === "warning" ? "Watch out" : "Tip"} (change)
            </button>
          </span>
        }
      >
        <NodeViewContent className="callout-content rounded-md bg-background px-3 py-2" />
      </BlockFrame>
    </NodeViewWrapper>
  )
}

export const CalloutNodeExtension = Node.create({
  name: "callout",
  group: "block",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  addAttributes() {
    return { tone: textAttribute("tone", "tip") }
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})

// ---------------------------------------------------------------------------
// Fold-out

function FoldoutView({ node, selected, deleteNode, updateAttributes }: ReactNodeViewProps) {
  const id = React.useId()
  return (
    <NodeViewWrapper>
      <BlockFrame
        selected={selected}
        onRemove={deleteNode}
        label={
          <>
            <ChevronRightIcon className="size-4" /> Fold-out
          </>
        }
      >
        <div className="grid gap-2" contentEditable={false}>
          <Label htmlFor={id} className="text-xs">
            The line readers press to open it
          </Label>
          <Input
            id={id}
            value={node.attrs.summary as string}
            maxLength={200}
            placeholder="Show the answer"
            onChange={(event) => updateAttributes({ summary: event.target.value })}
          />
        </div>
        <div className="rounded-md border bg-background px-3 py-2">
          <NodeViewContent className="foldout-content" />
        </div>
      </BlockFrame>
    </NodeViewWrapper>
  )
}

export const FoldoutNodeExtension = Node.create({
  name: "foldout",
  group: "block",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  addAttributes() {
    return { summary: textAttribute("summary", "") }
  },
  parseHTML() {
    return [{ tag: 'details[data-type="foldout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes, { "data-type": "foldout" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FoldoutView)
  },
})

// ---------------------------------------------------------------------------
// Table

function TableView({ node, selected, deleteNode, updateAttributes }: ReactNodeViewProps) {
  const rows = node.attrs.rows as string[][]
  const header = node.attrs.header as boolean
  const width = rows[0]?.length ?? 0
  const switchId = React.useId()

  const set = (next: string[][]) => updateAttributes({ rows: next })
  const setCell = (row: number, column: number, value: string) =>
    set(rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells)))

  return (
    <NodeViewWrapper data-drag-handle="">
      <BlockFrame label="Table" selected={selected} onRemove={deleteNode}>
        <div className="grid gap-3" contentEditable={false}>
          <div className="flex items-center gap-2">
            <Switch
              id={switchId}
              checked={header}
              onCheckedChange={(checked) => updateAttributes({ header: checked })}
            />
            <Label htmlFor={switchId} className="text-sm">
              First row is the heading row
            </Label>
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${width}, minmax(6rem, 1fr)) auto` }}>
            {rows.map((cells, r) => (
              <React.Fragment key={r}>
                {cells.map((cell, c) => (
                  <Input
                    key={c}
                    value={cell}
                    maxLength={500}
                    aria-label={`Row ${r + 1}, column ${c + 1}`}
                    className={cn(header && r === 0 && "font-semibold")}
                    onChange={(event) => setCell(r, c, event.target.value)}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove row ${r + 1}`}
                  onClick={() =>
                    rows.length > 1
                      ? set(rows.filter((_, index) => index !== r))
                      : showErrorToast("A table keeps at least one row. Remove the whole table with the bin.")
                  }
                >
                  <XIcon className="size-4" />
                </Button>
              </React.Fragment>
            ))}
            {Array.from({ length: width }, (_, c) => (
              <Button
                key={c}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  width > 1
                    ? set(rows.map((cells) => cells.filter((_, index) => index !== c)))
                    : showErrorToast("A table keeps at least one column. Remove the whole table with the bin.")
                }
              >
                Remove column
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                rows.length < 100
                  ? set([...rows, Array.from({ length: width }, () => "")])
                  : showErrorToast("A table holds at most 100 rows.")
              }
            >
              <PlusIcon className="size-4" />
              Add row
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                width < 12
                  ? set(rows.map((cells) => [...cells, ""]))
                  : showErrorToast("A table holds at most 12 columns.")
              }
            >
              <PlusIcon className="size-4" />
              Add column
            </Button>
          </div>
        </div>
      </BlockFrame>
    </NodeViewWrapper>
  )
}

export const TableNodeExtension = Node.create({
  name: "simpleTable",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      header: {
        default: true,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-header") !== "false",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-header": String(attributes.header),
        }),
      },
      rows: jsonAttribute<string[][]>("rows", [
        ["", ""],
        ["", ""],
      ]),
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="simple-table"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "simple-table" })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableView)
  },
})

// ---------------------------------------------------------------------------
// Checklist

function ChecklistView({ node, selected, deleteNode, updateAttributes }: ReactNodeViewProps) {
  const items = node.attrs.items as ChecklistItem[]
  const set = (next: ChecklistItem[]) => updateAttributes({ items: next })
  return (
    <NodeViewWrapper>
      <BlockFrame label="Checklist" selected={selected} onRemove={deleteNode}>
        <div className="grid gap-2" contentEditable={false}>
          <SortableRows
            items={items}
            onReorder={set}
            handleLabel={(_, index) => `Drag step ${index + 1}`}
          >
            {(item, index, handle) => (
              <div className="flex items-center gap-2">
                {handle}
                <Input
                  value={item.text}
                  maxLength={500}
                  aria-label={`Step ${index + 1}`}
                  placeholder="A step to tick off"
                  onChange={(event) =>
                    set(items.map((one) => (one.id === item.id ? { ...one, text: event.target.value } : one)))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    items.length > 1
                      ? set(items.filter((one) => one.id !== item.id))
                      : showErrorToast("A checklist keeps at least one step. Remove the whole checklist with the bin.")
                  }
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            )}
          </SortableRows>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                items.length < 50
                  ? set([...items, { id: newItemId(), text: "" }])
                  : showErrorToast("A checklist holds at most 50 steps.")
              }
            >
              <PlusIcon className="size-4" />
              Add step
            </Button>
          </div>
        </div>
      </BlockFrame>
    </NodeViewWrapper>
  )
}

export const ChecklistNodeExtension = Node.create({
  name: "checklist",
  group: "block",
  atom: true,
  addAttributes() {
    return { items: jsonAttribute<ChecklistItem[]>("items", []) }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="checklist"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "checklist" })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChecklistView)
  },
})

// ---------------------------------------------------------------------------
// Quiz

export function newQuizQuestion(): QuizQuestion {
  const first = newItemId()
  return {
    id: newItemId(),
    prompt: "",
    choices: [
      { id: first, text: "" },
      { id: newItemId(), text: "" },
    ],
    answerId: first,
  }
}

function QuizView({ node, selected, deleteNode, updateAttributes }: ReactNodeViewProps) {
  const questions = node.attrs.questions as QuizQuestion[]
  const set = (next: QuizQuestion[]) => updateAttributes({ questions: next })
  const change = (id: string, patch: Partial<QuizQuestion>) =>
    set(questions.map((question) => (question.id === id ? { ...question, ...patch } : question)))

  return (
    <NodeViewWrapper>
      <BlockFrame label="Quiz" selected={selected} onRemove={deleteNode}>
        <div className="grid gap-4" contentEditable={false}>
          <SortableRows
            items={questions}
            onReorder={set}
            gap="gap-4"
            handleLabel={(_, index) => `Drag question ${index + 1}`}
          >
            {(question, index, handle) => (
              <fieldset className="grid gap-2 rounded-md border bg-background p-3">
                <legend className="sr-only">Question {index + 1}</legend>
                <div className="flex items-center gap-2">
                  {handle}
                  <Input
                    value={question.prompt}
                    maxLength={500}
                    aria-label={`Question ${index + 1}`}
                    placeholder={`Question ${index + 1}`}
                    onChange={(event) => change(question.id, { prompt: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove question ${index + 1}`}
                    onClick={() =>
                      questions.length > 1
                        ? set(questions.filter((one) => one.id !== question.id))
                        : showErrorToast("A quiz keeps at least one question. Remove the whole quiz with the bin.")
                    }
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
                <p className="pl-8 text-xs text-muted-foreground">
                  Pick the right answer with the circle. Drag the handles to change the order.
                </p>
                <SortableRows
                  items={question.choices}
                  onReorder={(choices) => change(question.id, { choices })}
                  handleLabel={(_, choiceIndex) => `Drag answer ${choiceIndex + 1}`}
                >
                  {(choice, choiceIndex, choiceHandle) => (
                    <div className="flex items-center gap-2">
                      {choiceHandle}
                      <input
                        type="radio"
                        name={`answer-${question.id}`}
                        checked={question.answerId === choice.id}
                        aria-label={`Answer ${choiceIndex + 1} is the right one`}
                        className="size-4 shrink-0 accent-primary"
                        onChange={() => change(question.id, { answerId: choice.id })}
                      />
                      <Input
                        value={choice.text}
                        maxLength={500}
                        aria-label={`Answer ${choiceIndex + 1}`}
                        placeholder={`Answer ${choiceIndex + 1}`}
                        onChange={(event) =>
                          change(question.id, {
                            choices: question.choices.map((one) =>
                              one.id === choice.id ? { ...one, text: event.target.value } : one
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove answer ${choiceIndex + 1}`}
                        onClick={() => {
                          if (question.choices.length <= 2) {
                            showErrorToast("A question needs at least two answers to pick from.")
                            return
                          }
                          const choices = question.choices.filter((one) => one.id !== choice.id)
                          change(question.id, {
                            choices,
                            answerId:
                              question.answerId === choice.id ? choices[0].id : question.answerId,
                          })
                        }}
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  )}
                </SortableRows>
                <div className="pl-8">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      question.choices.length < 8
                        ? change(question.id, {
                            choices: [...question.choices, { id: newItemId(), text: "" }],
                          })
                        : showErrorToast("A question holds at most 8 answers.")
                    }
                  >
                    <PlusIcon className="size-4" />
                    Add answer
                  </Button>
                </div>
              </fieldset>
            )}
          </SortableRows>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                questions.length < 20
                  ? set([...questions, newQuizQuestion()])
                  : showErrorToast("A quiz holds at most 20 questions.")
              }
            >
              <PlusIcon className="size-4" />
              Add question
            </Button>
          </div>
        </div>
      </BlockFrame>
    </NodeViewWrapper>
  )
}

export const QuizNodeExtension = Node.create({
  name: "quiz",
  group: "block",
  atom: true,
  addAttributes() {
    return { questions: jsonAttribute<QuizQuestion[]>("questions", []) }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="quiz"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "quiz" })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(QuizView)
  },
})

export const COURSE_NODE_EXTENSIONS = [
  VideoNodeExtension,
  CalloutNodeExtension,
  FoldoutNodeExtension,
  TableNodeExtension,
  ChecklistNodeExtension,
  QuizNodeExtension,
]
