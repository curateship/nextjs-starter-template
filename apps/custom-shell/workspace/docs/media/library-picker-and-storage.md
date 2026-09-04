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

The app favicon also starts with an owned image. When Settings saves that
choice, the server reads the original from R2 and writes square PNG copies at
16px, 32px, 180px, and 512px under a versioned favicon folder. A separate dark
choice gets its own set. Generated favicon files stay out of the media picker;
the selected originals remain the editable records. Replacing or clearing a
choice removes the generated files after the settings record saves. The media
orphan tool leaves this managed favicon folder alone, so it cannot erase an
active browser icon merely because the generated file has no media row.

## Admin and cleanup

The Media dashboard can see files across the workspace, their owners, current
storage use, and records that no longer have a valid owner. Admin cleanup can
remove confirmed orphaned files from both the database and object storage.

Deleting a normal file checks ownership and removes its stored object. A screen
that still refers to the deleted id must handle the missing media state rather
than drawing a broken private URL.
