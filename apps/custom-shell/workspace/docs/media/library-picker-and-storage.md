# Media library, picker, and storage

The media library stores images, video, and audio for one owner in one workspace.
Files live in R2 object storage. The database keeps:

- Ownership and file type.
- Size and dimensions where available.
- Storage key and display metadata.

The picker and full library use the same records. Both support:

- Search and type filters.
- Paging.
- Upload and deletion.

An image field receives the selected file's current preview and id as soon as
the picker inserts it, so the result is visible before the dialog closes.
When the picker opens inside another editor, it uses the editor's full width.
Escape returns to the editor instead of closing both screens.

## Upload checks

Uploads pass several checks:

- The server checks the declared type, actual content, and size limit.
- The server sanitizes SVG files before storage.
- Suitable raster images can be cropped before use.
- The library creates thumbnails where possible and uses a type fallback when
  it cannot create a preview.

The public font upload uses the same object store but stays out of the image,
video, and audio library. It accepts one WOFF2 file up to 1 MB. The server
checks the WOFF2 header and its declared byte length before writing the file
under the managed public-font folder. Visitors receive the bytes through the
app's versioned `/public-font.woff2` route with a one-year immutable
cache. A replacement or removal clears the old managed object after the
settings record has safely changed.

Account images such as avatars must resolve to an owned image record. A pasted
external address cannot bypass media ownership checks.

Pictures selected for testimonials, logo strips, and screenshots on the public
front page pass the same ownership check before settings save. Existing saved
pictures remain editable by another admin without transferring file ownership.

The app logo also starts with an owned image, and it is the browser tab icon
too. When Settings saves that choice, the server reads the original from R2 and
writes, under one versioned favicon folder: the dark-mode twin of the picture,
square PNG copies of the original at 16px, 32px, 180px and 512px, and the same
four sizes of the twin. What the dark twin is and how it is made is in
`settings/administration-and-personalization.md`.

Every one of those files is generated. They stay out of the media picker, and
the selected original remains the editable record. Replacing or clearing the
logo removes the generated files after the settings record saves, the twin
included, because the sweep matches the whole folder rather than the sizes
alone. The media orphan tool leaves this managed folder alone, so it cannot
erase an active browser icon merely because the generated file has no media
row. The original the admin picked is not in that folder and is never swept.

## Admin and cleanup

The Media dashboard can see files across the workspace, their owners, current
storage use, and records that no longer have a valid owner. Admin cleanup can
remove confirmed orphaned files from both the database and object storage.

Deleting a normal file checks ownership and removes its stored object. A screen
that still refers to the deleted id must handle the missing media state rather
than drawing a broken private URL.
