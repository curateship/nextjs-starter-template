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
  waits for Custom Shell — and it matters more since 27 Sep 2026, because a
  site's home page is built in that window now.
- **The Feedback window is not in that list.** Its body is short, so its picker
  does open in view, with a tall empty dashed box above it. Untidy, not
  broken.

## On a page rather than in a window

An image field on an ordinary settings page opens the library in place of
itself, which is right there: the page scrolls and the library appears where
the field was.

## What a screen reader hears for a public photo

A photo's alt text is the record's own title. Nobody writes a description per
picture. Tyler decided on 17 Oct 2026 that nobody will write one by hand for
every image.

- **The title:** the photo on a listing, category, event, post or deal card,
  wherever those cards appear, and the main photo on a listing's, event's,
  post's or deal's page and in a category page's band.
- **A deal with no photo of its own** is drawn with its listing's photo, so it
  takes the listing's title.
- **"Title photo 2":** each photo in a listing's gallery, so a row of twelve
  is not the same name twelve times.
- **Empty on purpose:** the "Also nearby" thumbnails at the foot of a listing
  page, because the name is printed right beside each one. Guide covers, the
  listing badge on a business's own website, and the small previews in admin
  windows stay empty too.
- **The Media library's own alt text is not used here.** The picker and the
  Media library keep alt text on each uploaded file, and the shell's front
  page and written pages copy it in when a picture is picked. The CMS listing,
  category, event, post and deal windows store only the picture's address.
