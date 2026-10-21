# Carousels in projects

A carousel can belong to one of your video projects. The project lists its
carousels, and deleting the project asks what happens to them.

## How a carousel joins a project

- **Make a carousel** from a project's first frames (the AI clip panel) makes
  a carousel that belongs to that project.
- **Writing one with AI** from a project's script does the same (see
  [carousel-writing.md](carousel-writing.md)).
- **Copies** stay in the same project: a duplicate, a copy in another shape
  and a translated copy.
- **A carousel started blank or from a template** belongs to none.
- **Saved as** `project_id` on `video_carousels` (`drizzle/0138`).

## Where the project shows them

The video editor's AI clip panel has a Carousels card under "Made in this
project", listing each carousel with its first picture and slide count. A
click opens it in the carousel editor.

## Deleting the project

Tyler, 20 Oct 2026: asked each time.

- **The delete window** says how many carousels the projects have, and offers
  "Keep the carousels, with no project" or "Delete the carousels too".
- **Nothing is picked to start.** Pressing Delete before choosing says to
  choose first.
- **Keep** leaves each carousel on the Carousels list with no project.
- **Delete** removes them with the project. Their kept exports stay, as they
  do when a carousel is deleted from its list (see
  [carousel-exports.md](carousel-exports.md)).
- **A project with no carousels** gets the old window, with no question.
