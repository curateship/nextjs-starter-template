# What the trading worker image carries

The trading worker image carries the three programs Node runs and the two
Lighter signer files. It does not carry JavaScript source maps.

Local worker builds still write external maps beside the programs. Those maps
keep file names and bundled line mappings for local debugging, but esbuild
leaves out `sourcesContent`, so the map does not contain a readable copy of the
server source. A deployed crash therefore points at a bundled line number. The
image does not have the map needed to turn that line back into the original
TypeScript location.

The Dockerfile enforces the boundary at the copy into the final stage. It
copies `worker.mjs`, `health.mjs` and `trade.mjs` through the `*.mjs` pattern,
then copies the signer files separately. Adding another file to `worker/dist`
does not put that file in the running image by accident.

Before this rule, a Docker build from the previous commit put 9,685,084 bytes
of maps in `worker/dist`. The image measured 301,435,614 bytes. The two large
maps each contained about 3.5 million source characters.

The changed image measured 298,958,985 bytes, which is 2,476,629 bytes smaller
after Docker compression. The three programs copied into that image totalled
3,732,442 bytes, and an inspection inside the image found no `.map` file. Local
maps remain in the build folder and total 2,341,824 bytes, but all three omit
`sourcesContent` and Docker does not copy them into the running image.
