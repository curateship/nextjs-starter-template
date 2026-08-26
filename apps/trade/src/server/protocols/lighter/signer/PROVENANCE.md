# Where these two files came from

Both are vendored, not built here, and neither is edited. Replacing them means
repeating the steps below and re-running `signer.test.ts`.

## lighter-signer.wasm

- Source: `web-wasm/main.wasm` in `https://github.com/elliottech/lighter-go`,
  the signing library Lighter's own API docs point at.
- Pinned commit: `17f2d60e4cf5ef2198da77ed1c0ce92f6fc97efd`, committed
  6 Aug 2026.
- Downloaded 26 Aug 2026, 7,731,685 bytes.
- `sha256 d09f6ff4b4a39f9463f2c7f786f4a8d6829275925394e4dfc4960f1fa526ee7e`

Lighter ships this file already built, which is why it is used rather than the
`wasm/` folder beside it. That folder holds the source of a second, plain
build with synchronous functions, and Lighter's own Node example uses it — but
no binary for it is committed, so building it needs a Go toolchain this machine
does not have. The prebuilt browser build runs under Node perfectly well; its
functions are just promise-shaped and prefixed with an underscore.

## wasm_exec.js

- Source: `misc/wasm/wasm_exec.js` from the Go distribution at tag `go1.23.1`.
- `sha256 45ce9dfe7211247544ab6f4268eb8cb5b6f3d5ae602dc3b51447b7eada99c229`

This is Go's own glue, and its version has to match the Go that built the
`.wasm`. `lighter-go`'s `go.mod` names `go 1.23.0` with `toolchain go1.23.1`,
so that is the tag taken. A mismatch shows up as a failure to instantiate,
which `signer.test.ts` would catch on the first run.

Lighter does not commit `wasm_exec.js` anywhere in its repo, so it cannot be
taken from the same place as the `.wasm`.

## What was measured on 26 Aug 2026

- It instantiates and runs under Node 24.1.0 and registers 23 functions.
- An auth token signs in about 2.5 milliseconds.
- A private key must be exactly 40 bytes. Lighter's own message for anything
  else is "invalid private key length. expected: 40 got: N".
