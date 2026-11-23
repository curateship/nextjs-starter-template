# Readable failures and focused trade forms

Trade data surfaces keep their frame when a read fails. The failed message and
the shared "Try again" button stay inside the table or panel, and the error
toast still appears. Empty copy only appears after a successful empty read.

Folder creation uses the same small form in the panel and the Manage window.
Each form owns its input. The Create folder button stays available while the
name is empty, and pressing it reports the missing name through the error
toast. A successful save clears that form only.

Wallet empty copy points to the Add wallet button in the tab header. Trade
fields use examples instead of repeating their visible labels. Positions use
"At target / stop" and "Making / losing" for the two money columns.
