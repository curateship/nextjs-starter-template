// A stylesheet in the worker's bundle stops the worker from starting.
//
// The worker build leaves every dependency as a plain import for Node to load
// (`packages: "external"` in build-worker.mjs). Node can load JavaScript and
// nothing else, so an `import "some-package/thing.css"` left standing is
// `ERR_UNKNOWN_FILE_EXTENSION` on the first line and a container that never
// boots. Server code reaches UI files on purpose: the email sender reads the
// app's options, the options name each Settings tab's panel, and a panel
// reaches the shell layout, the account dialog and the image cropper, which
// imports `ReactCrop.css`. Trade's engine was down for ten hours on 26 Sep 2026
// from exactly this, and Video's first worker image died the same way on
// 18 Oct 2026.
//
// The answer is not to forbid the reach. The worker draws nothing, has no
// browser and no screen, so every stylesheet it imports was already doing
// nothing. This turns each one into an empty module at build time, which keeps
// a stylesheet from ever being the reason the worker will not start.
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
