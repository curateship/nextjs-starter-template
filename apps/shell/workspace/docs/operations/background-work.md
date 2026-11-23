# Background work

One background pass runs four kinds of work:

- Advance automation runs.
- Start due newsletters.
- Retry pending system emails.
- Call every worker an app registered.

Each job runs in isolation. One failure is logged and counted but does not stop
the other jobs in the pass.

Development and production call the same pass. The existing development server
uses a request-started timer. Production uses the separate worker program, so a
scheduled message still runs when nobody has visited the website since a
deployment.

## Production worker

The production worker runs a pass at startup and waits 15 seconds after a pass
finishes before starting the next one. Waiting after completion prevents slow
work from stacking another pass on top of itself.

Jobs claim database work before processing it. Two worker containers may overlap
during a deployment without both processing the same claimed item. Any app job
that truly needs one exclusive process must take its own lock.

The worker health rules are:

- Write a heartbeat file after each pass.
- Allow 120 seconds before treating the heartbeat as stale.
- Keep the heartbeat moving when one job fails because the loop is still
  running.
- Write the failed job's error to the worker log.

On SIGTERM or SIGINT, the worker stops scheduling new passes and gives the
current pass time to finish. The repo deployment docs are the authority for
building and starting the web and worker containers.
