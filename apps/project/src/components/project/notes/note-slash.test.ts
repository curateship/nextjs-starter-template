// @vitest-environment jsdom
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"

import { noteSlashExtension, type SlashMatch } from "@/components/project/notes/note-slash"

let editor: Editor | null = null

function open(keys: (event: KeyboardEvent) => boolean = () => false) {
  const seen: (SlashMatch | null)[] = []
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, noteSlashExtension({ onChange: (match) => seen.push(match), onKey: keys })],
    content: "<p></p>",
  })
  return { editor, last: () => seen.at(-1) ?? null }
}

function press(target: Editor, key: string) {
  const event = new KeyboardEvent("keydown", { key })
  return target.view.someProp("handleKeyDown", (handle) => handle(target.view, event)) ?? false
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe("the \"/\" in a note", () => {
  it("opens at the start of a line and narrows as letters are typed", () => {
    const { editor, last } = open()
    editor.commands.insertContent("/")
    expect(last()).toMatchObject({ query: "" })
    editor.commands.insertContent("im")
    expect(last()).toMatchObject({ query: "im", to: last()!.from + 3 })
  })

  it("opens after a space but never inside a web address", () => {
    const { editor, last } = open()
    editor.commands.insertContent("Lunch /")
    expect(last()).toMatchObject({ query: "" })
    editor.commands.setContent("<p></p>")
    editor.commands.insertContent("https://kyoto.example/")
    expect(last()).toBeNull()
  })

  it("closes on Esc and leaves the \"/\" as typed", () => {
    const { editor, last } = open()
    editor.commands.insertContent("/ma")
    expect(press(editor, "Escape")).toBe(true)
    expect(last()).toBeNull()
    expect(editor.getText()).toBe("/ma")
    // Typing on doesn't bring it back for the same "/".
    editor.commands.insertContent("p")
    expect(last()).toBeNull()
  })

  it("hands the arrow keys and Enter to the list only while it's open", () => {
    const keys: string[] = []
    const { editor } = open((event) => {
      keys.push(event.key)
      return true
    })
    expect(press(editor, "ArrowDown")).toBe(false)
    editor.commands.insertContent("/")
    expect(press(editor, "ArrowDown")).toBe(true)
    expect(press(editor, "Enter")).toBe(true)
    expect(keys).toEqual(["ArrowDown", "Enter"])
  })
})
