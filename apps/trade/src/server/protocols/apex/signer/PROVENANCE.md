# Where these two files came from

Both files in `assets/` are copied, not built here, and neither is edited.
Replacing them means repeating the steps below and re-running
`signer.test.ts`, which must still reproduce every signature in
`connector-signatures.fixture.json`.

## The source

- Repository: `https://github.com/ApeX-Protocol/apexomni-connector-node`,
  ApeX's own Node connector (package `apexomni-connector-node`, version
  `0.3.2-alpha.2`).
- Commit: `ca1d7e545239409ad27d6d52a2c9b87621dbcf9a`, committed 4 Mar 2026.
- Folder: `src/packages/node-dist/`. Downloaded 24 Sep 2026.

## The files

- `zklink-sdk-node_bg.wasm`, 3,272,764 bytes,
  `sha256 6df380524ac06c386956c25bbdce38750a545e1e8108b17ee800d1a28d45f662`.
  zkLink's signer, compiled by ApeX.
- `zklink-sdk-node.js`, 142,316 bytes,
  `sha256 592a57562b53c14fc792005fff6ef5863e9f55eb33d72165870e4ddf573e6abb`.
  The glue wasm-bindgen generated for it.

The glue is CommonJS that reads the `.wasm` from its own folder when it
loads. `index.ts` runs it unedited inside Node's own CommonJS wrapper and
hands it the bytes, which is how it survives being bundled. The website
reads both files as Nitro server assets (`nitro.config.ts`); the trading
engine's build copies both beside its bundle (`scripts/build-worker.mjs` and
`worker/Dockerfile`). Neither lands in the website's public folder.

## The fixture

`connector-signatures.fixture.json` was made by running the connector's own
`getCreateOrderSignature` and `getZKContractSignatureObj` from
`src/omni/PrivateApi.ts` at the commit above, copied verbatim, with its own
`bignumber.js` 9 and `viem` 2, against a made-up omni key and account id.
The connector's own tests hit ApeX's servers and carry no fixed signature,
so this is the nearest thing to one. `signer.test.ts` rebuilds the same three
orders through `index.ts`, which uses none of those libraries, and must match
every signature byte for byte.

## What was measured on 24 Sep 2026

- It loads and runs under Node 24.1.0.
- A signer is used up by one signature: signing twice with the same one
  answered "null pointer passed to rust". The connector makes a new one
  before every order, and so does `index.ts`.
- One signature, key derivation included, took about 124 milliseconds.
- The omni key is 65 bytes, 130 hex characters; the signer took it with or
  without `0x` and refused any other length with "Signature length
  mismatch".
