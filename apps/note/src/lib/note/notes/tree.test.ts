import { describe, expect, it } from "vitest"

import { dropProjection, folderPath, folderRows } from "@/lib/note/notes/tree"

/** The folder tree as rows, and where a dragged folder lands. */

const folders = [
  { id: "books", parentId: null, position: 1, name: "Books" },
  { id: "work", parentId: null, position: 0, name: "Work" },
  { id: "fiction", parentId: "books", position: 0, name: "Fiction" },
  { id: "scifi", parentId: "fiction", position: 0, name: "Sci-fi" },
  { id: "orphan", parentId: "gone", position: 5, name: "Orphan" },
]

describe("folderRows", () => {
  it("puts each folder under its parent, siblings in their order", () => {
    expect(folderRows(folders).map((row) => `${row.depth}:${row.folder.id}`)).toEqual([
      "0:work",
      "0:books",
      "1:fiction",
      "2:scifi",
      "0:orphan",
    ])
  })

  it("leaves out what is inside a shut folder", () => {
    expect(folderRows(folders, new Set(["books"])).map((row) => row.folder.id)).toEqual(["work", "books", "orphan"])
  })

  it("names a folder with the folders it sits in", () => {
    expect(folderPath(folders, "scifi")).toBe("Books / Fiction / Sci-fi")
    expect(folderPath(folders, null)).toBe("")
  })
})

describe("dropProjection", () => {
  const rows = [
    { id: "work", parentId: null, depth: 0 },
    { id: "books", parentId: null, depth: 0 },
    { id: "fiction", parentId: "books", depth: 1 },
    { id: "ideas", parentId: null, depth: 0 },
  ]

  it("reorders at the same level", () => {
    expect(dropProjection(rows, "ideas", "work", 0, 16)).toEqual({
      depth: 0,
      parentId: null,
      orderedIds: ["ideas", "work", "books"],
    })
  })

  it("goes inside the folder above when dragged to the right", () => {
    expect(dropProjection(rows, "ideas", "ideas", 40, 16)).toMatchObject({
      depth: 2,
      parentId: "fiction",
      orderedIds: ["ideas"],
    })
    expect(dropProjection(rows, "ideas", "ideas", 16, 16)).toMatchObject({
      depth: 1,
      parentId: "books",
      orderedIds: ["fiction", "ideas"],
    })
  })

  it("never goes deeper than one below the row above", () => {
    expect(dropProjection(rows, "ideas", "ideas", 200, 16).depth).toBe(2)
  })
})
