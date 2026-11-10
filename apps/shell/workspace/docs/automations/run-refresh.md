# Automation run refresh

Run history follows two refresh rules:

- An open run is read again every 3 seconds while its status can still
  change. Completed, failed, rejected, and canceled runs load once and stop.
  A run waiting on a decision is not read again until somebody decides. The
  run record and each delivery history use the same final-status list.
- When the open run's status changes, the list beside it is read again, so
  its row and the Dashboards block's counts follow. In an automation email's
  Runs tab, rows refresh only while that tab shows. Delivery history paging
  remains available after automatic refresh stops.

The run record is `src/components/automations/run-record.tsx`; the dashboard
it sits on is described in [The Automations dashboard](dashboard.md).
