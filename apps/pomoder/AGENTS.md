# AGENTS.md

Guidance for agents working in Pomoder.

## App Context

This app was generated from the Custom Shell scaffold. Use local code and docs as the source of truth.

## Working Rules

- Pomoder's only port is the value under its key in `local-apps.json`. Never duplicate the number or use a substitute port; every consumer must derive it from that registry.
- Keep changes small and direct.
- Do not commit secrets.
- Run the narrowest relevant checks before summarizing work.
