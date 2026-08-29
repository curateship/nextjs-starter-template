import { defineNitroConfig } from "nitro/config"

export default defineNitroConfig({
  // The signer loads Go's WebAssembly bytes itself. Nitro's native WASM
  // plugin turns a `.wasm` import into a JavaScript module, which is the wrong
  // value for server storage to hand to `WebAssembly.instantiate`.
  wasm: false,
  serverAssets: [
    {
      baseName: "lighter-signer",
      dir: "src/server/protocols/lighter/signer/assets",
      pattern: "lighter-signer.wasm",
    },
  ],
})
