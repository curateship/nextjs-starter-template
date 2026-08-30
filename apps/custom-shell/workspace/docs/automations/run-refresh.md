# Automation run refresh

Run history follows two refresh rules:

- An expanded run refreshes while its status can still change. Completed,
  failed, rejected, and canceled runs load once and stop. The run row and each
  delivery history use the same final-status list.
- Dragging the Runs panel shut stops both refresh timers even though the editor
  keeps the panel mounted. Reopening a live run starts the timers again.
  Delivery history paging remains available after automatic refresh stops.
