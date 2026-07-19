// The RSC build discovers server actions by walking the SSR module graph, then
// writes the action registry at the start of the RSC build — before the screens
// that src/lib/page-renderer.tsx loads through import.meta.glob are transformed.
// Actions that only reach the graph through those screens are therefore absent
// from the registry, and calling one in a production build throws
// "server reference not found '<id>'". Every admin action hit this, because the
// admin is reached exclusively through that glob.
//
// Importing the action modules here puts them in the SSR graph, so they are all
// registered before the registry is written. The reference is exported to keep
// the glob from being treated as dead code, and the whole thing is behind
// import.meta.env.SSR so the client build drops it and ships no extra chunks.
export const serverActionModules = import.meta.env.SSR
  ? import.meta.glob("./actions/**/*-actions.ts")
  : {}
