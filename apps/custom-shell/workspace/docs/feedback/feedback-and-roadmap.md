# Feedback and roadmap

Signed-in people can use the feedback window to:

- Send a suggestion, bug report, question, or praise.
- Add text and a screenshot from the media library.
- Vote and comment.
- Edit or delete their own comments.
- Follow later activity through notifications.

The public feedback list can be filtered by type, tag, and status, then sorted
by recent activity, votes, or comments. The current filter and open item live in
the address, so reload and browser navigation keep the same view.
An empty filter result, an empty feedback board, and an empty comment thread use
the same centred empty-state spacing. The board keeps its fixed height when no
feedback matches, so changing a filter does not resize the window.

## Admin work

The Feedback dashboard lets an admin:

- Search, filter, sort, and page through workspace feedback.
- Change status and edit tags.
- Write the official message or add a comment.
- Merge duplicates.
- Delete selected records.

Merging keeps one item as the record people open and moves the useful activity
from the duplicate. Deletion is different. Deletion removes the record and its
dependent votes and comments, so the dashboard asks for confirmation.

Feedback changes increase the shell's feedback refresh value. Open feedback
views use that value to reload instead of maintaining a separate hidden copy of
the list. New comments, status changes, and merges can also create notifications
for the people involved.

The feedback system is the product's roadmap conversation. It does not publish
a release. Published product changes belong in the changelog.
