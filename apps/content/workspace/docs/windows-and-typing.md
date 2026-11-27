# Windows and typing

How Video's windows treat what is typed into them, the same in the editor,
the Actors dashboard, Templates, Thumbnails and the carousel editor.

## A box turns red only after Save

An empty name or description is marked red only once Save or Create was
pressed with it empty, never as the window opens. Typing a word clears it.
New project, New carousel project, Create actor and Create extra all work
this way.

## Why a box was refused sits under it

When a value is refused, the reason shows in red right under the box, and
the box points at it (`aria-describedby`) so a screen reader reads the two
together. The error message still says it too, as the UI rules ask; the line
under the box is what stays once that message has gone. The piece is
`FieldError` in `src/components/video-assets/field-error.tsx`. Like the red
boxes, it waits: it shows after the button was pressed, or for a box that
saves itself, once the box is left.

- **Make a sound's length:** a length outside 0.5 to 30 seconds, after Make.
- **A project's spend limit:** anything that isn't a dollar figure above $0
  and within the limit's top.
- **A template's spending cap:** anything that isn't a dollar figure above $0,
  once the box is left. The cap saves itself, so a refused one is simply not
  saved until it is fixed.

## A count when the words near the limit

Every long box that stops at a length (scripts, prompts, scene words,
descriptions, captions, notes: 27 of them) shows "4,800 / 5,000" under it
once the words reach 80 out of 100 of the limit, and nothing before that. At
the limit the count turns red. It is not read out on every key, so a screen
reader user typing past 80 out of 100 hears only the box. A box cuts pasted text at its limit without a
word, and this count is what warns first. `LengthCounter` in
`src/components/video-assets/length-counter.tsx`.

## Enter saves

Pressing Enter in a one-line box saves the window, the same as its main
button. Enter in a box of several lines still starts a new line, and Enter in
the actor window's tag box still makes a tag. That holds in New project, New
folder, Create actor, Create extra and Make a voice.

## A greyed control says why

Pointing at a greyed control, or tabbing to it, says why it is greyed and
what lifts it, with the shell's `DisabledReason`:

- **The Transcript's Filler words tab:** finding filler words needs a Gemini
  or OpenAI key, added on Settings, AI.
- **The voice picker** in Read a script with AI and in Another language: the
  voices are still on their way, could not be loaded, or none came back.

## Busy buttons

- **The words end in "…"** while a button works: "Writing…", "Translating…",
  "Exporting…".
- **The button keeps its width.** The words not showing are laid behind the
  ones showing as an invisible shadow, so the button is as wide as the longer
  of the two and nothing beside it moves. `SteadyLabel` in
  `src/components/video-assets/steady-label.tsx`. The carousel editor's
  writing, translating and exporting buttons use it.

## How long a job has been going

Make a teaser, Another language and Make a voice count up while they work,
"0:42 so far", at the left of the window's footer. They count rather than
predict: none of these jobs has a measured time, and a wrong estimate is
worse than none. Make it move and Make it again keep their "It takes a few
minutes" line. `TimeSoFar` in `src/components/video-assets/time-so-far.tsx`;
the Exports page and the Export window count a rendering export the same way
([retrying-an-export.md](retrying-an-export.md)).
