// A stylesheet in the engine's bundle stops the engine from starting.
//
// The worker build leaves every dependency as a plain import for Node to load
// (`packages: "external"` in build-worker.mjs). Node can load JavaScript and
// nothing else, so an `import "some-package/thing.css"` left standing is
// `ERR_UNKNOWN_FILE_EXTENSION` on the first line and a container that never
// boots. That is what happened on 26 Sep 2026: the engine reaches the app's
// options list, the options list reaches the public-profile dialog, the dialog
// reaches the image cropper, and the cropper imports `ReactCrop.css`. The
// engine was down for ten hours and the deploy rolled back every time.
//
// Server code legitimately reaches UI files, because the automations palette is
// built from the same components a person clicks, so the answer is not to
// forbid the reach. The engine draws nothing, has no browser and no screen, so
// every stylesheet it imports was already doing nothing. This turns each one
// into an empty module at build time, which keeps a stylesheet from ever being
// the reason the engine will not start.
//
// A query on the end is matched too, so `./x.css?raw` is emptied like the rest.
// That takes nothing away: esbuild already answers a stylesheet import with an
// empty object and writes the stylesheet out as its own file beside the bundle,
// so no worker code could ever have been reading one as text.

const STYLESHEET = /\.(css|scss|sass|less)(\?.*)?$/

export function workerDropCss() {
  return {
    name: "worker-drop-css",
    setup(builder) {
      builder.onResolve({ filter: STYLESHEET }, (args) => ({
        path: args.path,
        namespace: "worker-drop-css",
      }))
      builder.onLoad({ filter: /.*/, namespace: "worker-drop-css" }, () => ({
        contents: "",
        loader: "js",
      }))
    },
  }
}
