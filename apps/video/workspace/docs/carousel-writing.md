# Writing carousels with AI

Four tools write words for carousels: a whole carousel, three stronger lines
for the first slide, the post caption, and copies in other languages. Each
uses the writer chosen in Settings, and each is charged on the AI meter under
its own name. None of them changes a carousel behind your back: a draft and a
translation are new carousels, and the lines and the caption go in as an
ordinary edit that Undo takes back out.

## A whole carousel

- **Where:** New carousel on the Carousels list, then "Write it with AI".
- **What it works from**, Tyler's choice of 20 Oct 2026:
  - **A topic**, one line such as "5 mistakes new runners make".
  - **Notes**, pasted text up to 20,000 letters.
  - **A project**, whose script is the words its voiceovers say, in the order
    they play, or the words written on its timeline when it has none. The
    carousel belongs to that project (see
    [carousel-projects.md](carousel-projects.md)).
  - **A web link**, a public https page whose words are read once.
- **How many slides:** 3 to 20, 7 to start. The shape is 4:5, square or story.
- **What comes back:** a cover slide that hooks, one slide per point, and a
  last slide asking the reader to save or follow. The cover and last slide are
  dark, the middle ones light.
- **Boxes fit their words.** Each text box is made as tall as its words need.
  Words still too long for the slide are flagged by the "does not fit" check,
  never made smaller.
- **Metered as** `carousel_draft`.

## Reading a web page safely

The page's address is looked up once, and refused when any answer points at
this machine or a private network. The request then goes to the address that
was checked, so a second look-up cannot swap it for another. This is the
guard the shell's webhooks use (`resolvePublicWebhookTarget`). Only https is
read, at most three redirects are followed and each is checked again, and at
most 2MB is read. Scripts, menus, headers and footers are left out of the
words (`src/server/video/link-reader.ts`).

## A stronger first slide

- **Where:** pick a text layer with words on slide 1. The Text card has "A
  stronger first slide".
- **What it gives:** three lines to pick from, one plainer, one more curious,
  one bolder, written from the slides after it so they promise only what the
  carousel delivers. Tyler chose three.
- **Picking one** replaces the words, as one undo step. Bold and highlighted
  letters go, because they pointed at the old words.
- **Metered as** `carousel_first_slide`.

## The post caption

- **Where:** the Export window, "Write it with AI" under Post caption.
- **What it gives:** an opening line, a few short lines that add to the
  slides, and a closing ask, from the slides' own words. No hashtags, Tyler's
  call of 20 Oct 2026. Any the writer adds anyway are taken out.
- **Metered as** `carousel_caption`.

## Copies in other languages

- **Where:** the ⋯ menu at the top of the editor, "Copies in other
  languages".
- **What it makes:** tick up to 10 of the 29 languages the caption translator
  offers. Each becomes a new carousel, such as "Tips (Spanish)", with every
  text box translated and everything else the same. Tyler chose several at
  once.
- **The original** is saved first and never changed.
- **A language that fails** is named, and the others are still made.
- **Bold and highlighted letters** are dropped from the copies, because they
  pointed at the original words.
- **Translated words often run longer**, so more boxes may be flagged as not
  fitting.
- **Metered as** `carousel_translation`.

## Where it lives

`src/server/video/carousel-writer.ts` holds the four tools,
`src/lib/video/carousel-drafts.ts` lays out a draft's slides, and
`src/lib/video/carousel-writing.ts` holds their messages and limits.
