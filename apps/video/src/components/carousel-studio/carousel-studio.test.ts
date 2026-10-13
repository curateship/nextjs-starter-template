import { describe, expect, it } from "vitest"

import {
  builderReducer,
  type BuilderAction,
  type BuilderState,
} from "@/components/carousel-studio/carousel-studio"
import type {
  CarouselSlide,
  CarouselTextItem,
} from "@/lib/video/carousel-schema"

const text: CarouselTextItem = {
  id: "text-1",
  type: "text",
  text: "Original",
  x: 0.1,
  y: 0.2,
  width: 0.8,
  height: 0.2,
  zIndex: 10,
  fontId: "inter",
  fontSize: 64,
  color: "#ffffff",
  align: "left",
}

const slides: CarouselSlide[] = [
  {
    id: "slide-1",
    title: "One",
    backgroundColor: "#111827",
    items: [text],
  },
  {
    id: "slide-2",
    title: "Two",
    backgroundColor: "#ffffff",
    items: [],
  },
]

function initial(): BuilderState {
  return {
    slides,
    caption: "Caption",
    format: "4:5",
    selectedSlideId: "slide-1",
    selectedItemId: "text-1",
    past: [],
    future: [],
  }
}

function documentOf(state: BuilderState) {
  return {
    slides: state.slides,
    caption: state.caption,
    format: state.format,
  }
}

const edits: { name: string; action: BuilderAction }[] = [
  { name: "caption", action: { type: "UPDATE_CAPTION", caption: "New" } },
  { name: "format", action: { type: "UPDATE_FORMAT", format: "1:1" } },
  {
    name: "slide settings",
    action: {
      type: "UPDATE_SLIDE",
      slideId: "slide-1",
      patch: { backgroundColor: "#ff0000" },
    },
  },
  {
    name: "text, position and style",
    action: {
      type: "UPDATE_ITEM",
      slideId: "slide-1",
      itemId: "text-1",
      patch: { text: "Changed", x: 0.2, fontSize: 80 },
    },
  },
  { name: "adding a slide", action: { type: "ADD_SLIDE" } },
  {
    name: "duplicating a slide",
    action: { type: "DUPLICATE_SLIDE", slideId: "slide-1" },
  },
  {
    name: "deleting a slide",
    action: { type: "DELETE_SLIDE", slideId: "slide-2" },
  },
  {
    name: "adding a layer",
    action: {
      type: "ADD_ITEM",
      slideId: "slide-1",
      item: { ...text, id: "text-2" },
    },
  },
  {
    name: "deleting a layer",
    action: {
      type: "DELETE_ITEM",
      slideId: "slide-1",
      itemId: "text-1",
    },
  },
  {
    name: "layer ordering",
    action: {
      type: "MOVE_LAYER",
      slideId: "slide-1",
      itemId: "text-1",
      direction: 1,
    },
  },
  { name: "resetting a slide", action: { type: "RESET_DEFAULTS" } },
]

describe("carousel studio history", () => {
  it.each(edits)("undoes and redoes $name", ({ action }) => {
    const before = initial()
    const edited = builderReducer(before, action)
    expect(documentOf(edited)).not.toEqual(documentOf(before))

    const undone = builderReducer(edited, { type: "UNDO" })
    expect(documentOf(undone)).toEqual(documentOf(before))

    const redone = builderReducer(undone, { type: "REDO" })
    expect(documentOf(redone)).toEqual(documentOf(edited))
  })

  it("stores a drag as one undo step when it is committed", () => {
    const before = initial()
    const dragged = builderReducer(before, {
      type: "UPDATE_ITEM",
      slideId: "slide-1",
      itemId: "text-1",
      patch: { x: 0.5, y: 0.5 },
      transient: true,
    })
    expect(dragged.past).toHaveLength(0)

    const committed = builderReducer(dragged, {
      type: "COMMIT_HISTORY",
      before: documentOf(before),
    })
    const undone = builderReducer(committed, { type: "UNDO" })
    expect(documentOf(undone)).toEqual(documentOf(before))
  })

  it("keeps only the latest 50 undo steps", () => {
    let state = initial()
    for (let index = 0; index < 55; index += 1) {
      state = builderReducer(state, {
        type: "UPDATE_CAPTION",
        caption: `Caption ${index}`,
      })
    }
    expect(state.past).toHaveLength(50)
  })

  it("refuses slide 21 even when an action is dispatched directly", () => {
    const state = {
      ...initial(),
      slides: Array.from({ length: 20 }, (_, index) => ({
        ...slides[0],
        id: `slide-${index}`,
      })),
    }
    expect(builderReducer(state, { type: "ADD_SLIDE" })).toBe(state)
    expect(
      builderReducer(state, { type: "DUPLICATE_SLIDE", slideId: "slide-0" })
    ).toBe(state)
  })

  it("refuses layer 51 even when an action is dispatched directly", () => {
    const state = {
      ...initial(),
      slides: [
        {
          ...slides[0],
          items: Array.from({ length: 50 }, (_, index) => ({
            ...text,
            id: `text-${index}`,
          })),
        },
      ],
    }

    expect(
      builderReducer(state, {
        type: "ADD_ITEM",
        slideId: "slide-1",
        item: { ...text, id: "text-51" },
      })
    ).toBe(state)
  })
})
