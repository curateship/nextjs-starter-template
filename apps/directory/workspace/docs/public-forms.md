# The public forms

Six forms take something from a visitor or an owner: Add your listing, Suggest
an event, the claim window ("Is this your business?"), Message the owner,
Report a problem, and an owner's event form on My listings. They behave alike.

- **Send shows it is working.** While a form is sending, its button shows the
  spinning circle and cannot be pressed twice, the same as the deal buttons.
  Until 24 Nov 2026 six of them only greyed out.
- **A box is checked when it is left, and again on Send.** A box with a
  problem is outlined red and says what is wrong under itself, and Send
  stays pressable: pressing it with something missing marks every box and
  says the first problem in the error message, without asking the server.
- **The message under a box never moves the boxes below it.** It is drawn in
  the 16px gap between two boxes (`FieldProblem` in
  `src/components/directory/public/field-problem.tsx`). When it pushed the
  boxes down, a press that began on the next box landed somewhere else.
- **Every capped box says how much is left**, and stops at the same length
  the server allows, so a long paste is cut at the box rather than refused
  after Send. The claim window's caps: email 255, name 200, role 120, phone
  60, link 2000, message 1000. Boxes that may be left empty say "(optional)".
- **A window starts empty each time it opens.** The claim, message and report
  windows forget what was typed when they are cancelled.
- **No message pops up when a form works**, by the app's rule
  (`no-success-toasts.md`). The form changes instead. After "Send it again"
  on Add your listing, a line under the button reads "Sent again to x@y."
- **The claim window's title is "Claim this business"**, with the listing's
  name in the line under it. A long name in the title ran under the close
  button on a phone, which is why the message and report windows moved theirs
  out too.

## Checking it

On `http://eat-drink-toronto.localhost:3015/add-listing`, press in Business
name, then in Contact email: "This one is needed." shows and Contact email
does not move. On a listing page, sign in on that address and press "Is this
your business?": the window is titled "Claim this business", and pressing
Send my request with nothing filled marks Business email and Your name.
