import { WrittenPageBody } from "@/components/pages/written-page-body"
import {
  CalloutBlock,
  ChecklistBlock,
  FoldoutBlock,
  ImageBlock,
  PromptBlock,
  QuizBlock,
  TableBlock,
  VideoBlock,
  type ChapterAnswers,
} from "@/components/courses/public/chapter-blocks"
import { usePublicHeader } from "@/lib/branding"
import {
  chapterHeadings,
  type CalloutNode,
  type ChapterBlock,
  type ChapterBody as ChapterBodyValue,
  type ChecklistNode,
  type FoldoutNode,
  type ImageNode,
  type PromptNode,
  type QuizNode,
  type TableNode,
  type VideoNode,
} from "@/lib/courses/chapter-body"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"

/**
 * A chapter's words, drawn for a reader.
 *
 * Runs of ordinary text go to the shell's own written-page renderer, so a
 * paragraph in a chapter looks exactly like a paragraph on any page of the
 * site. Each course block is drawn by its own piece, and a heading the "On
 * this page" list points at is given the id that list links to.
 */
export function ChapterBody({
  body,
  answers,
}: {
  body: ChapterBodyValue
  answers: ChapterAnswers
}) {
  // A heading jumped to from the list stops below a header that stays on
  // screen, rather than behind it.
  const headingStop = usePublicHeader().sticky ? "scroll-mt-24" : "scroll-mt-4"
  const anchorByIndex = new Map(
    chapterHeadings(body).map((heading) => [heading.index, heading.id])
  )

  const pieces: Array<
    | { kind: "words"; blocks: WrittenPageNode[] }
    | { kind: "heading"; block: WrittenPageNode; id: string }
    | { kind: "block"; block: ChapterBlock }
  > = []
  for (const [index, block] of (body.content ?? []).entries()) {
    const anchor = anchorByIndex.get(index)
    if (anchor) {
      pieces.push({ kind: "heading", block: block as WrittenPageNode, id: anchor })
      continue
    }
    if (isCourseBlock(block)) {
      pieces.push({ kind: "block", block })
      continue
    }
    const last = pieces.at(-1)
    if (last?.kind === "words") last.blocks.push(block as WrittenPageNode)
    else pieces.push({ kind: "words", blocks: [block as WrittenPageNode] })
  }

  return (
    // A guide is read for minutes at a time, so its words are drawn a size up
    // from the shell's page text, which is sized for short pages.
    <div className="grid gap-5 [&_li]:text-base [&_ol]:text-base [&_p]:text-base [&_p]:leading-7 [&_ul]:text-base">
      {pieces.map((piece, index) => {
        if (piece.kind === "heading") {
          return (
            <div key={index} id={piece.id} className={headingStop}>
              <WrittenPageBody body={{ type: "doc", content: [piece.block] }} />
            </div>
          )
        }
        if (piece.kind === "words") {
          return (
            <WrittenPageBody key={index} body={{ type: "doc", content: piece.blocks }} />
          )
        }
        return <CourseBlock key={index} block={piece.block} answers={answers} />
      })}
    </div>
  )
}

const COURSE_BLOCKS = new Set([
  "image",
  "video",
  "callout",
  "codeBlock",
  "foldout",
  "simpleTable",
  "checklist",
  "quiz",
])

function isCourseBlock(block: ChapterBlock) {
  return COURSE_BLOCKS.has(block.type)
}

function CourseBlock({
  block,
  answers,
}: {
  block: ChapterBlock
  answers: ChapterAnswers
}) {
  switch (block.type) {
    case "image":
      return <ImageBlock node={block as ImageNode} />
    case "video":
      return <VideoBlock node={block as VideoNode} />
    case "callout":
      return <CalloutBlock node={block as CalloutNode} />
    case "codeBlock":
      return <PromptBlock node={block as PromptNode} />
    case "foldout":
      return <FoldoutBlock node={block as FoldoutNode} />
    case "simpleTable":
      return <TableBlock node={block as TableNode} />
    case "checklist":
      return <ChecklistBlock node={block as ChecklistNode} answers={answers} />
    case "quiz":
      return <QuizBlock node={block as QuizNode} answers={answers} />
    default:
      return null
  }
}
