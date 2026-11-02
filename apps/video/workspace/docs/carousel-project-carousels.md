# A carousel project holds many carousels

A carousel project holds as many carousels as you like, the way a video
project holds videos ([project-videos.md](project-videos.md)). What a series
shares is set once on the project. Videos and carousels are never in the same
project or list.

## Tyler's rules

- "carousels and videos need to have the same pattern and it has to follow
  coding standards"
- "why would we combine them both in projects when they're completely
  different things". Carousel projects hold carousels; video projects hold
  videos.
- His picks, 1 Nov 2026: the picture shelf, the look, the caption footer and
  the templates are set once per carousel project. All of a person's existing
  carousels go into one carousel project. Making a carousel from a video
  project asks each time which carousel project to use.

## What belongs to the project, and what to each carousel

- **Set once on the project:** its name, its folder, its picture shelf, the
  look a new carousel starts with, and the caption footer.
- **Set on each carousel:** its slides, shape, caption, name, status (Draft,
  Ready or Posted), pin, archive, history, exports and the template mark.
- **Where it is stored:** the project is a row of `video_carousel_projects`.
  Each carousel's `carousel_project_id` names it. A carousel's `project_id`
  still means "made from this video project"
  ([carousel-projects.md](carousel-projects.md)); the two never mix.

## The Carousels page

- **A table of carousel projects**, built like the video projects table: a
  picture, the name, how many carousels, their slides added up, their shapes
  and the last change. Pinned projects sit on top.
- **On whole projects:** Pin, Duplicate (every carousel and the shelf come
  too), Archive, Settings, Delete, folders, and ticking several for Move to
  folder, Archive and Delete.
- **New project** makes a project with one carousel named after it, and
  opens it.
- **"Changed"** moves when one of its carousels is saved, restored, made,
  moved or deleted, the same rule as video projects.
- **Delete** says how many carousels go. Their kept exports stay on the
  Exports page, and the pictures stay in the media library.

## Opening a project

- **Which carousel opens:** the one you had open last in that project. The
  first time, the first in the Carousels tab, which is the last edited.
  Remembered per person on the server, in
  `video_carousel_project_last_carousels`.
- **The address:** `/admin/video-carousels/<project>?carousel=<carousel>`.
- **Old addresses** from before carousel projects named the carousel itself
  (`/admin/video-carousels/<carousel>`). They are sent on to the carousel's
  project with `?carousel=`, so every old link still opens it.
- **A project with no carousels left** shows "has no carousels" with a New
  carousel button. Opening it never makes a carousel.

## The Carousels tab

- **First on the carousel editor's rail**, ahead of Slides, and picked when
  the project opens.
- **The same panel as the Videos tab** (`PiecesPanel` in
  `src/components/video-assets/pieces-panel.tsx`): search, filter (sort,
  status, archived), + in the header, Select for many, Load more past 200,
  and a row menu with Rename, Duplicate, Move to project, Pin, Archive, the
  statuses and Delete.
- **Its own extra:** "Offer as template" in the row menu
  ([carousel-templates.md](carousel-templates.md)).
- **New carousel (+)** opens the New carousel window, which asks for a name
  and a shape, or a template, or what AI should write from. It never makes a
  carousel by itself.
- **Duplicate** puts the copy in the same project, just under its original.
- **Move to project** lists your other carousel projects. History and exports
  go with the carousel. Its pictures stay on the old project's shelf and keep
  showing on its slides.

## The picture shelf

- **One per project.** A picture uploaded, dropped or kept from Pexels in any
  of the project's carousels is on the shelf in all of them. Pictures already
  on any of its carousels' slides show there too.
- **Stored in** `video_carousel_project_media`.

## The look and the caption footer

Set in the project's settings, from the cog on its row.

- **The look:** font, text colour, largest text size, line height, letter
  spacing, the box behind the text, the outline and the slide background. A
  field left empty keeps the usual starting value.
- **The largest text size** is the size of the biggest words on the new
  carousel; the rest keep their size against it, so an AI draft's headline
  stays bigger than its body. A box may then need resizing; the editor says
  when words run past their box.
- **What uses it:** a blank carousel and one written by AI start with every
  text layer and slide number in the look, and every slide in the background.
- **What does not:** a carousel from a template keeps the template's design,
  and copies (duplicate, another shape, a translation) keep their original's.
  Changing the look never changes a carousel already made.
- **The caption footer**, such as hashtags or a sign-off, goes at the end of
  every new carousel's caption, where it can still be changed. Copies keep
  their original's caption as it was. AI "Write caption" puts the footer back
  under what it writes.

## Making a carousel from a video project

The first-frames window in the AI clip panel asks which carousel project to
put it in, or the name of a new one. Nothing is picked to start. The carousel
still remembers the video project it was made from, so that project's
Carousels card lists it.

## The move to carousel projects

Migration `drizzle/0146_video_carousel_projects.sql` did it.

- **Every person with carousels** got one project, "My carousels", holding
  all of them. Each carousel's shelf was joined into the project's.
- **Left for one release:** the old per-carousel shelf, `video_carousel_media`.
  Nothing reads it.
- **For the deploy window**, while the release before 0146 still runs: a
  carousel it makes goes into that person's last edited carousel project (or
  a new "My carousels"), by the trigger `carousel_project_for_carousel`; a
  picture it uploads is copied onto the project's shelf by
  `carousel_media_to_project`.
- **Owed:** a later release drops `video_carousel_media` and both triggers.
