# Picking an image

Every image field in CMS is the shell's `ImageUpload`: a dashed box showing the
current picture, with a remove cross in its corner. Clicking the box picks a
new one.

## Inside a window, the picker is its own window

Clicking an image field inside an editing window opens a "Select image" window
on top of it, with the search box, the Upload button, the media library and its
paging. Choosing a picture closes that window and puts the picture on the field
behind it. Nothing is saved until the editing window itself is saved.

- **Where:** the event window, the listing window and its photo gallery, the
  post window and the deal window.
- **Why it is not drawn inside the field.** The shell's field can also open the
  library in place of itself, which is what these five did until 25 Sep 2026.
  Inside a window that scrolls, the library opens below the fold and nothing
  scrolls down to it, so the field grows into a tall empty box and the click
  looks like it did nothing. Tyler reported it that day on the event window.
  Measured at 1440 by 950: the library landed 1,022 pixels down a 950-pixel
  screen.
- **One window still has the fault and belongs to Custom Shell:** the front page
  row window in Settings → Public pages. Its picker opens 568 pixels below the
  bottom of a 950-pixel screen, so its Picture, Logo image and Screenshot image
  fields still grow into an empty box. An app never edits a shell file, so this
  waits for Custom Shell.
- **The Feedback window is not in that list.** Its body is short, so its picker
  does open in view, with a tall empty dashed box above it. Untidy, not
  broken.

## On a page rather than in a window

An image field on an ordinary settings page opens the library in place of
itself, which is right there: the page scrolls and the library appears where
the field was.
