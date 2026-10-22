// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  writeCaptions: vi.fn(async () => ({
    captions: [
      { startMs: 1000, endMs: 2000, text: "hello there" },
      { startMs: 2000, endMs: 3000, text: "good to see you" },
    ],
    source: { clipId: "talk" },
  })),
  translateCaptionLines: vi.fn(async (language: string, lines: string[]) =>
    lines.map((line) => `${language}: ${line}`)
  ),
  makeLanguageCopyOf: vi.fn(
    async ({
      language,
    }: {
      language: string
      lines: { startMs: number; text: string }[]
    }) => ({
      language,
      project: { id: `copy-${language}`, name: `My Short (${language})` },
      exports: [],
      exportProblem: null,
    })
  ),
  loadVoices: vi.fn(async () => [
    { id: "voice-1", name: "Ana", speaker: "elevenlabs", description: "" },
  ]),
}))
const toasts = vi.hoisted(() => ({
  showErrorToast: vi.fn(),
  dismissErrorToast: vi.fn(),
}))

vi.mock("@/lib/api/video/ai-tools", () => ({
  ...api,
  getAiToolErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "That did not work.",
  loadVoiceDefaults: vi.fn(async () => null),
  loadSavedTranscripts: vi.fn(async () => []),
  rememberAiChoice: vi.fn(async () => undefined),
  speakTranslation: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => toasts)
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

import {
  EditorContext,
  createEditorStore,
  createInitialEditorState,
} from "@/components/video-editor/editor-store"
import { TranslateDialog } from "@/components/video-editor/translate-dialog"
import { PlaybackClock } from "@/lib/video/playback-clock"
import { unreadLanguagesMessage } from "@/lib/video/translate"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(toasts)]) {
    fn.mockClear()
  }
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

async function settle() {
  for (let pass = 0; pass < 5; pass += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function openWindow() {
  const store = createEditorStore(
    createInitialEditorState({
      aspect: "9:16",
      tracks: [
        {
          id: "lane",
          muted: false,
          clips: [
            {
              id: "talk",
              kind: "audio",
              name: "Talking",
              mediaId: "media-1",
              startMs: 1000,
              durationMs: 4000,
              trimStartMs: 0,
            },
          ],
        },
      ],
    }),
    "My Short"
  )
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <EditorContext.Provider
        value={{
          store,
          dispatch: store.dispatch,
          clock: new PlaybackClock(),
          projectId: "project-1",
          saveNow: async () => undefined,
          setProjectName: () => undefined,
        }}
      >
        <TranslateDialog
          open
          onOpenChange={() => undefined}
          available={{
            words: true,
            voice: true,
            openai: true,
            anthropic: false,
            defaults: {},
            transcriber: "whisper",
            writer: "openai",
          }}
        />
      </EditorContext.Provider>
    )
  })
  await settle()
}

function button(name: RegExp) {
  const found = [...document.querySelectorAll("button")].find((element) =>
    name.test(element.textContent ?? "")
  )
  if (!found) throw new Error(`No button matching ${name}`)
  return found
}

async function press(element: HTMLElement) {
  await act(async () => {
    element.click()
  })
  await settle()
}

/**
 * Presses Translate and waits for the first language's lines to be drawn,
 * rather than for a fixed number of rounds, which a slow first run outlasts.
 */
async function translate(name: RegExp) {
  await press(button(name))
  for (
    let pass = 0;
    pass < 50 && !document.getElementById("translate-line-Spanish-0");
    pass += 1
  ) {
    await settle()
  }
}

function tick(language: string) {
  const box = document.getElementById(`translate-language-${language}`)
  if (!box) throw new Error(`No box for ${language}`)
  return press(box)
}

/** Radix tabs switch on the pointer going down, as a real click does. */
async function openTab(language: string) {
  const trigger = [...document.querySelectorAll('[role="tab"]')].find(
    (element) => element.textContent?.startsWith(language)
  ) as HTMLElement | undefined
  if (!trigger) throw new Error(`No tab for ${language}`)
  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    )
  })
  await settle()
}

describe("Another language", () => {
  it("works on this project as before when one language is picked", async () => {
    await openWindow()
    await translate(/^Translate/)
    expect(api.translateCaptionLines).toHaveBeenCalledTimes(1)
    expect(button(/Add captions/)).toBeTruthy()
    expect(button(/Read it aloud/)).toBeTruthy()
    expect(() => button(/Make all/)).toThrow()
    expect(document.querySelector('[role="tab"]')).toBeNull()
  })

  it("translates every language picked, with a tab each", async () => {
    await openWindow()
    await tick("Portuguese")
    await tick("Hindi")
    await translate(/Translate into 3 languages/)
    expect(
      api.translateCaptionLines.mock.calls.map((call) => call[0])
    ).toEqual(["Spanish", "Portuguese", "Hindi"])
    // The talking was written down once, not once per language.
    expect(api.writeCaptions).toHaveBeenCalledTimes(1)
    const tabs = [...document.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent
    )
    expect(tabs).toEqual(["Spanish, read", "Portuguese", "Hindi"])
  })

  it("refuses Make all in words until every tab has been opened", async () => {
    await openWindow()
    await tick("Portuguese")
    await tick("Hindi")
    await translate(/Translate into 3 languages/)

    await press(button(/Make all 3/))
    expect(toasts.showErrorToast).toHaveBeenCalledWith(
      unreadLanguagesMessage(["Portuguese", "Hindi"])
    )
    expect(api.makeLanguageCopyOf).not.toHaveBeenCalled()

    await openTab("Portuguese")
    await openTab("Hindi")
    await press(button(/Make all 3/))
    expect(
      api.makeLanguageCopyOf.mock.calls.map((call) => call[0].language)
    ).toEqual(["Spanish", "Portuguese", "Hindi"])
    expect(document.body.textContent).toContain("My Short (Hindi)")
  })

  it("sends each language's corrected lines, not the first translation", async () => {
    await openWindow()
    await tick("Hindi")
    await translate(/Translate into 2 languages/)
    const field = document.getElementById(
      "translate-line-Spanish-0"
    ) as HTMLInputElement
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!
      setValue.call(field, "hola, corregido")
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await openTab("Hindi")
    await press(button(/Make all 2/))
    const spanish = api.makeLanguageCopyOf.mock.calls.find(
      (call) => call[0].language === "Spanish"
    )
    expect(spanish?.[0].lines[0]).toEqual({
      startMs: 1000,
      text: "hola, corregido",
    })
  })
})
