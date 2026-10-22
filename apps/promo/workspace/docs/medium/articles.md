# Articles on Medium

An article is written in Promo and published on Medium when a person presses
Publish. Parts 26 to 34 and 40 of `workspace/tasks/Medium/01-medium-features.md`.

## Tyler's answers, 21 Oct 2026

- **"800 to 1,200 words"**, about a 4 to 5 minute read.
- **Publish "goes live on Medium"**, in the account's waking hours, tried once.
- **"Never label them".** No AI label is added. Medium's rules ask that
  AI-written stories say so, and Medium can limit a story or an account it
  decides is AI-written and unlabelled.
- **"No limit"** on articles per account beyond the 7-day warm-up and the young
  account's pace, which counts articles with responses.
- **"Any Medium account, always"** may publish.

## Writing one

**New article** opens as a dropdown: what it is about, who publishes it (or
pick later), and whether it grows from a Reddit comment of yours that did well
(part 30), then Create article. It is a draft in Promo, saved 700ms after the
last change and at once when a field is left, with Saving…, Saved or Not saved
in its header. A save that fails says "Not saved" and keeps the change, which
goes with the next save, and Publish and Make a cover stop rather than going
ahead with what was saved before.

- **Outline first** (part 27). Outline asks the AI for three titles and the
  sections, so the angle is picked before 1,200 words get written. A title is
  picked, the sections can be changed, and Write the article writes it from
  them.
- **The article** is told what it is about, the picked title and sections, the
  project's description (mentioned at most once, where it really helps), the
  account's voice, Medium's rules, the publication's rules when it is going
  into one (part 33), and up to three of the account's earlier published
  articles whose titles share words with this one, to link (part 29).
- **From a Reddit comment** (part 30): the comment's words and its post's title
  are the start, and the outline and the article grow from them.
- **The cover** (part 28) is a media library picture, picked with the shell's
  picture field, or made by Make a cover with AI from the title. A made cover is
  Google's Gemini picture model at about 4 cents, saved to the media library.
- **Tags**: up to five, separated by commas, stored the way Medium writes them.
- **Publication**: the account's own page, or one from the Publications tab.
- **Check** runs the rules check on the article, with the publication's rules.
- **Article ideas** (part 31) reads the titles of the project's newest Medium
  stories and Reddit posts, many of them questions, and suggests articles that
  answer them. Start it opens one as a draft.

## Publish, and what holds it back

Publish is refused, with why, when no account is picked, the account is
warming, paused or at its young pace, the words are too close to another
account's (the [too-similar check](responses.md#post-and-what-holds-it-back)),
or the publication is one Medium never said the account writes for. On a phone
account it is refused too: the Medium app there sends responses only. Outside
waking hours it waits for the morning, with Take it back.

Pressing Publish twice moves the article to waiting once; the second press is
told it is already on its way.

The browser program first reads the account's own public feed for a story with
the same title, so a second try after a first that published without saying
so never publishes it twice; when the feed will not load, nothing is written.
Then it publishes it in the account's own browser: the title typed,
the body pasted the way a person pastes from a document (typing 1,200 words at
a person's pace takes longer than a visit allows), Publish, the topics, the
publication, Publish now. Then it reads the article's real address from Medium.

## A published article

- **Its numbers** (part 40): views and reads, which Medium shows only to the
  writer, from the account's own browser; claps and responses from the reader.
  Read once a day, with Check to read now. One reading a day is kept
  (`promo_medium_article_readings`), and the article draws them week by week
  once it has two days.
- **Responses under it** each have an answer box, the same as under a response
  ([Answering](responses.md#the-responses-tab)).
- **Edit** and **Delete** change it on Medium from the account that wrote it.
- **The bell** rings "Gone from Medium:" when it no longer shows, "Pulled from a
  publication:" when Medium no longer shows it in its publication, and "New
  response to you on Medium" for each new response under it.

## A public Medium list

The bookmark on a story or on a published article puts it on the account's
public Medium list, named after the project (part 34). A list is writing on
Medium, so it waits out the warm-up and the pace like a response. The browser
finds the list by its whole name and leaves a story already on it alone, since
pressing a ticked list takes the story off. The Articles tab lists
what is on the lists and says how many of each list are the account's own,
with a line when more than half are: a list made mostly of your own articles
reads as an advert.

## Publications

The Publications tab is the group blogs, run by editors, that suit the project
(part 32). Each is added by its address. Which accounts write there is read from
Medium, never typed: Check asks each Medium account on a browser profile, in its
own browser, what Medium lets it do there (`canPublish` or `canSubmit` in the
publication's own data). An editor has to add an account as a writer, on Medium,
before it can publish there.

Its rules for the AI (part 33) are read from the story the publication's menu
links as its submission guidelines, or pasted by hand; pasted rules are never
written over by a read.

## Where the code is

`articles.ts`, `cover.ts`, `publications.ts`, `lists.ts` and `drafts.ts` in
`src/server/social/medium/`, and `medium-articles.tsx` and
`medium-publications.tsx` in `src/components/social/medium/`.
