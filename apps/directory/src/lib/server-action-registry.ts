// WORKAROUND for an ordering bug in @vitejs/plugin-rsc (present in 0.5.27 and
// 0.5.28). The RSC build writes its server-action registry at the start of the
// "build rsc environment" step, populated from the earlier scan pass. Screens
// are loaded through import.meta.glob in src/lib/page-renderer.tsx, so action
// modules reached only through a screen are transformed after the registry has
// already been written. They are absent from it, and calling one in a
// production build throws "server reference not found '<id>'".
//
// Without this file the first production build of this app registered 1 of 59
// actions, which took the entire admin down while public pages kept working.
//
// Importing the action modules here puts them in the SSR graph, so every one is
// registered before the registry is written. The glob deliberately matches ALL
// modules under actions/ rather than a name pattern: a new action file must not
// depend on being named a particular way to survive the production build.
//
// scripts/verify-server-actions.mjs fails the build if the registry does not
// contain every 'use server' module, so this cannot silently regress.
//
// Remove this file, its import in src/routes/__root.tsx, and the verify script
// once the upstream ordering bug is fixed.
export const serverActionModules = import.meta.env.SSR
  ? import.meta.glob("./actions/**/*.ts")
  : {}
