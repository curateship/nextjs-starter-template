import { describe, expect, it } from "vitest"

import { cleanNoteBody, keepTaskFiles, noteFileIds, noteForCopy, noteIsEmpty, noteTaskIds } from "@/lib/project/note-blocks"
import {
  readPlainNotes,
  readTaskNotes,
  storedNotesForCopy,
  storedPlainNotes,
  storedTaskNotes,
  taskNotesText,
} from "@/lib/project/notes"
import { readVideoLink, SHORT_TIKTOK_REFUSED, VIDEO_LINK_REFUSED, videoLinkProblem } from "@/lib/project/video-links"

const credit = { name: "Ana", profileUrl: "https://unsplash.com/@ana", photoPageUrl: "https://unsplash.com/photos/abc" }
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] })
const doc = (...content: unknown[]) => ({ type: "doc", content })
const LOOM = "0123456789abcdef0123456789abcdef"

describe("what a Project note keeps", () => {
  it("keeps every block with only its own values", () => {
    const cleaned = cleanNoteBody(
      doc(
        paragraph("Before"),
        { type: "noteImage", attrs: { src: "https://pub.example.r2.dev/a.jpg", alt: "Gate", credit: null, onclick: "x" } },
        { type: "noteImage", attrs: { fileId: "file-1", src: "https://ignored.example/a.jpg", alt: "Mock-up" } },
        { type: "noteVideo", attrs: { url: `https://www.loom.com/share/${LOOM}?sid=1` } },
        { type: "noteTask", attrs: { taskId: "task-1", title: "Old title" } },
        { type: "noteFile", attrs: { fileId: "file-2", name: "x.pdf" } },
        { type: "noteRecord", attrs: { address: "https://video.example/admin/video-editor/1" } },
        { type: "noteWebPage", attrs: { url: "https://docs.google.com/document/d/1", title: "Made up" } },
        { type: "horizontalRule", attrs: { style: "x" } }
      )
    )
    expect(cleaned.content).toEqual([
      paragraph("Before"),
      { type: "noteImage", attrs: { src: "https://pub.example.r2.dev/a.jpg", fileId: null, alt: "Gate", credit: null } },
      { type: "noteImage", attrs: { src: null, fileId: "file-1", alt: "Mock-up", credit: null } },
      { type: "noteVideo", attrs: { url: `https://www.loom.com/share/${LOOM}` } },
      { type: "noteTask", attrs: { taskId: "task-1" } },
      { type: "noteFile", attrs: { fileId: "file-2" } },
      { type: "noteRecord" },
      { type: "noteWebPage", attrs: { url: "https://docs.google.com/document/d/1" } },
      { type: "horizontalRule" },
    ])
  })

  it("drops a block it can't trust", () => {
    const cleaned = cleanNoteBody(
      doc(
        { type: "noteImage", attrs: { src: "javascript:alert(1)" } },
        { type: "noteImage", attrs: { src: "http://example.com/a.jpg" } },
        // An Unsplash photo without its credit breaks Unsplash's rules.
        { type: "noteImage", attrs: { src: "https://images.unsplash.com/photo-1", credit: null } },
        { type: "noteImage", attrs: { fileId: "../../etc" } },
        { type: "noteVideo", attrs: { url: "https://vimeo.com/123" } },
        { type: "noteTask", attrs: {} },
        { type: "noteFile", attrs: { fileId: 7 } },
        { type: "noteWebPage", attrs: { url: "http://example.com" } },
        { type: "noteWebPage", attrs: { url: "https://user:pass@example.com" } },
        { type: "script", attrs: { src: "https://evil.example" } }
      )
    )
    expect(cleaned.content).toEqual([])
  })

  it("keeps an Unsplash photo that has its credit", () => {
    const cleaned = cleanNoteBody(doc({ type: "noteImage", attrs: { src: "https://images.unsplash.com/photo-1", credit } }))
    expect(cleaned.content?.[0].attrs).toEqual({ src: "https://images.unsplash.com/photo-1", fileId: null, alt: "", credit })
  })

  it("keeps a Callout's words and drops any block put inside it", () => {
    const cleaned = cleanNoteBody(
      doc({
        type: "noteCallout",
        attrs: { kind: "shouting" },
        content: [paragraph("Ship Friday"), { type: "noteImage", attrs: { src: "https://a.example/b.png" } }, { type: "heading", attrs: { level: 2 } }],
      })
    )
    expect(cleaned.content).toEqual([{ type: "noteCallout", attrs: { kind: "note" }, content: [paragraph("Ship Friday")] }])
    expect(cleanNoteBody(doc({ type: "noteCallout", attrs: { kind: "decision" } })).content).toEqual([
      { type: "noteCallout", attrs: { kind: "decision" }, content: [{ type: "paragraph" }] },
    ])
  })

  it("keeps a Checklist's ticks and a Fold section's id", () => {
    const cleaned = cleanNoteBody(
      doc(
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [paragraph("Book the room")] },
            { type: "taskItem", attrs: { checked: "yes" }, content: [paragraph("Send the deck")] },
            paragraph("Not a line"),
          ],
        },
        { type: "noteFold", attrs: { id: "fold-1" }, content: [{ type: "text", text: "Details", marks: [{ type: "bold" }] }] },
        { type: "noteFold", attrs: { id: "<bad>" } }
      )
    )
    expect(cleaned.content).toEqual([
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [paragraph("Book the room")] },
          { type: "taskItem", attrs: { checked: false }, content: [paragraph("Send the deck")] },
        ],
      },
      { type: "noteFold", attrs: { id: "fold-1" }, content: [{ type: "text", text: "Details", marks: [{ type: "bold" }] }] },
      { type: "noteFold", attrs: { id: "fold" } },
    ])
  })

  it("still cleans words by the shell's written-page rules, inside lists too", () => {
    const cleaned = cleanNoteBody(
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Tea", marks: [{ type: "link", attrs: { href: "javascript:x" } }] }] },
              { type: "noteTask", attrs: { taskId: "task-1" } },
            ],
          },
        ],
      })
    )
    const item = cleaned.content?.[0].content?.[0]
    expect(item?.content?.[0].content?.[0]).toEqual({ type: "text", text: "Tea" })
    expect(item?.content?.[1]).toEqual({ type: "noteTask", attrs: { taskId: "task-1" } })
  })

  it("saves a note holding only a block, and nothing for an empty one", () => {
    const onlyRule = JSON.stringify(doc({ type: "horizontalRule" }))
    expect(storedTaskNotes(JSON.parse(onlyRule))).toBe(onlyRule)
    expect(storedTaskNotes(doc({ type: "paragraph" }))).toBe("")
    expect(noteIsEmpty(cleanNoteBody(JSON.parse(onlyRule)))).toBe(false)
  })

  it("reads notes written before blocks exactly as they were", () => {
    expect(readTaskNotes("Call Sam\nthen email")).toEqual({ kind: "text", text: "Call Sam\nthen email" })
    const old = JSON.stringify(doc(paragraph("Bold plan"), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("one")] }] }))
    const read = readTaskNotes(old)
    expect(read.kind === "doc" && JSON.stringify(read.body)).toBe(old)
  })

  it("searches the words inside blocks, never a block's addresses", () => {
    const stored = storedTaskNotes(
      doc(
        { type: "noteCallout", attrs: { kind: "warning" }, content: [paragraph("Budget is fixed")] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [paragraph("Ask legal")] }] },
        { type: "noteWebPage", attrs: { url: "https://secret.example/plan" } }
      )
    )
    expect(taskNotesText(stored)).toBe("Budget is fixed\nAsk legal")
  })
})

describe("meeting notes take no blocks", () => {
  it("drops every block when a meeting's notes are saved or read", () => {
    const sent = doc(paragraph("Agreed the launch"), { type: "noteTask", attrs: { taskId: "task-1" } }, { type: "horizontalRule" })
    expect(storedPlainNotes(sent)).toBe(JSON.stringify(doc(paragraph("Agreed the launch"))))
    const read = readPlainNotes(JSON.stringify(sent))
    expect(read.kind === "doc" && read.body.content).toEqual([paragraph("Agreed the launch")])
  })
})

describe("blocks that point at a task's files", () => {
  const note = cleanNoteBody(
    doc(
      { type: "noteFile", attrs: { fileId: "mine" } },
      { type: "noteImage", attrs: { fileId: "theirs" } },
      { type: "noteCallout", content: [paragraph("Keep")] },
      { type: "noteTask", attrs: { taskId: "old-1" } },
      { type: "noteRecord" }
    )
  )

  it("lists them, and keeps only the files on the task being saved", () => {
    expect(noteFileIds(note)).toEqual(["mine", "theirs"])
    expect(noteTaskIds(note)).toEqual(["old-1"])
    expect(noteFileIds(keepTaskFiles(note, new Set(["mine"])))).toEqual(["mine"])
  })

  it("leaves files behind on a copy, and points Copy project's Task cards at the copies", () => {
    expect(noteForCopy(note, { taskIds: new Map([["old-1", "new-1"]]) }).content).toEqual([
      { type: "noteCallout", attrs: { kind: "note" }, content: [paragraph("Keep")] },
      { type: "noteTask", attrs: { taskId: "new-1" } },
      { type: "noteRecord" },
    ])
    // A page with no task gets no Video or Promo card either.
    expect(noteForCopy(note, { noTask: true }).content?.map((node) => node.type)).toEqual(["noteCallout", "noteTask"])
    expect(storedNotesForCopy(JSON.stringify(doc({ type: "noteFile", attrs: { fileId: "mine" } })))).toBe("")
    expect(storedNotesForCopy("Plain words")).toBe("Plain words")
  })
})

describe("a team's page", () => {
  const teamBlocks = ["noteTeamCheckins", "noteTeamWorkload", "noteTeamAttention", "noteTeamWeek", "noteTeamMembers"]

  it("keeps the team blocks, holding nothing, only on a team's page", () => {
    const body = doc(paragraph("Standup 9:30"), ...teamBlocks.map((type) => ({ type, attrs: { teamId: "x" } })))
    expect(cleanNoteBody(body, { team: true }).content?.map((node) => node)).toEqual([
      paragraph("Standup 9:30"),
      ...teamBlocks.map((type) => ({ type })),
    ])
    // Every other note drops them, the site admin's own page too.
    expect(cleanNoteBody(body).content).toEqual([paragraph("Standup 9:30")])
    expect(cleanNoteBody(body, { dashboard: true }).content).toEqual([paragraph("Standup 9:30")])
  })

  it("drops the dashboard blocks from a team's page", () => {
    const body = doc({ type: "noteHabit" }, { type: "noteTeamCheckins" })
    expect(cleanNoteBody(body, { team: true }).content).toEqual([{ type: "noteTeamCheckins" }])
  })

  it("keeps the team blocks on a copy made for a team's page", () => {
    const stored = JSON.stringify(doc({ type: "noteTeamWeek" }, { type: "noteComments" }))
    expect(JSON.parse(storedNotesForCopy(stored, { noTask: true, team: true }))).toEqual(doc({ type: "noteTeamWeek" }))
  })
})

describe("video links", () => {
  it("reads each site's links into one plain address and player", () => {
    expect(readVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")?.playerUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1"
    )
    expect(readVideoLink("https://youtube.com/shorts/dQw4w9WgXcQ")?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(readVideoLink("https://www.tiktok.com/@team/video/7301234567890123456?lang=en")).toMatchObject({
      site: "tiktok",
      url: "https://www.tiktok.com/@team/video/7301234567890123456",
    })
    expect(readVideoLink("https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x")?.playerUrl).toBe(
      "https://www.instagram.com/reel/C1a2B3c4D5e/embed"
    )
  })

  it("reads Loom's share and player links, with or without the video's name in front", () => {
    expect(readVideoLink(`https://www.loom.com/share/${LOOM}`)).toMatchObject({
      site: "loom",
      url: `https://www.loom.com/share/${LOOM}`,
      playerUrl: `https://www.loom.com/embed/${LOOM}?autoplay=1`,
    })
    expect(readVideoLink(`https://loom.com/share/sprint-demo-${LOOM}?sid=abc`)?.id).toBe(LOOM)
    expect(readVideoLink(`https://www.loom.com/embed/${LOOM}`)?.url).toBe(`https://www.loom.com/share/${LOOM}`)
  })

  it("refuses anything else, saying what to paste", () => {
    expect(readVideoLink("https://vimeo.com/123")).toBeNull()
    expect(readVideoLink("https://www.loom.com/share/short")).toBeNull()
    expect(readVideoLink("https://www.loom.com/looms/videos")).toBeNull()
    expect(readVideoLink("https://loom.com.evil.example/share/" + LOOM)).toBeNull()
    expect(videoLinkProblem("https://vimeo.com/123")).toBe(VIDEO_LINK_REFUSED)
    expect(VIDEO_LINK_REFUSED).toBe("Paste a YouTube, TikTok, Instagram or Loom link.")
    expect(videoLinkProblem("https://vm.tiktok.com/ZMabc/")).toBe(SHORT_TIKTOK_REFUSED)
  })
})
