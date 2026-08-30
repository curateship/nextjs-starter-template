# App-owned automation run results

Each app may give an automation node its own result view inside the shared Runs
panel. This lets Trade show a backtest report while CMS and Video show results
that fit their own products, without any app changing the shell's run-panel
code.

## Ownership

The shell owns:

- The bottom Runs panel and run history.
- Run and step status.
- Retries and failure messages.
- The required plain-language step summary.

The app node owns only the extra result view drawn inside its completed step.

## Result contract

The node descriptor points at its view with a lazy import:

```ts
runResult: () => import("./backtest-run-result")
```

Its executor returns a small JSON `output` beside the required summary. The
shell saves that output on the step and gives the result view:

- `runId`
- `stepId`
- `nodeId`
- `output`

The result file loads only when React draws that view. The automation engine
can therefore read the node descriptor without loading browser-only app code.

## Keep reports in the app

Run output is a small view model or a pointer, not the full report. The engine
refuses output over 50,000 characters.

A large report belongs in the app's own table. Return its id in the step output:

```ts
return {
  type: "complete",
  summary: "Backtest completed.",
  output: { backtestId: result.id },
}
```

The result component may use that id to load and draw the app-owned report.

## Trade backtest example

The Trade backtest executor should save its report in Trade's own data and
return the `backtestId`. Its node registers a Trade-owned result component that
can draw the metrics, chart and actions inside the shared run row.

The shell remains responsible for showing whether that backtest completed,
failed or is retrying. Trade does not need to edit the run panel.

## How to test

1. Merge the shell change into the app and apply the step-output migration.
2. Register a temporary or real `runResult` component on one app node.
3. Return a small output object from its executor and run the flow.
4. Open Runs and expand the step. Confirm the summary and app-owned view both
   appear.
5. Reload the page and confirm the result remains.
6. Make the executor fail and confirm the shell still shows its normal retry
   and error UI.
7. Return oversized output in an automated test and confirm the engine refuses
   it.
8. Check light and dark themes, narrow and wide layouts, and the browser console.

This path was verified in Custom Shell with a temporary app-owned result card.
The summary and custom view appeared together, survived a reload, and produced
no page errors. The temporary node and flow were removed after the check.
