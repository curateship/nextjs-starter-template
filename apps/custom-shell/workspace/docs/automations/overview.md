# Automations

The automation list lets an admin:

- Create a flow from a blank canvas or template.
- Search, duplicate, rename, and delete flows.
- Test a flow against a member.
- Turn a flow live or take it offline.

The editor has a node palette, a canvas, an inspector, and a resizable Runs
panel. Changes save after 700 milliseconds of quiet time. The editor compiles
and validates the graph before a run can start.

## Nodes and app ownership

The node registry defines how each step appears and which settings it needs.
The matching executor runs on the server. Apps can register their own node
descriptors, executors, and result views without editing the shared editor.

Built-in starts include:

- Member events.
- Billing events.
- Schedules.
- Segment changes.
- Manual starts for flows that allow them.

Templates are ordinary flow definitions that can be copied and then edited.

## Runs

The engine creates a run, advances ready steps, records summaries, and closes
the run when the graph has finished. A step can:

- Complete or fail.
- Wait for an approval.
- Retry.
- Create a delivery record for later work.

The Runs panel shows the saved history and step details.
Runs and delivery histories use the same Load more button and block a repeated
click until the next page returns. A failed load stays in the panel with Try
again. A saved step failure uses the shared inline error text, so it remains
beside the step that produced it without opening a second alert box.

The global pause switch stops automation work without deleting flows or runs.
The system records who paused it and when. Turning the switch back on lets the
background pass continue eligible work.

See [Automation run refresh](run-refresh.md) for live history updates and
[App-owned automation run results](app-owned-run-results.md) for app-specific
reports inside a completed step.
