# Fonts shipped with this app

Both families are served from this folder rather than from Google, so no
request for a font leaves for another company and no visitor is counted by one.
`src/theme.css` holds the `@font-face` rules that name these files.

## Inter

`inter-latin.woff2`, `inter-latin-ext.woff2`. The variable cut, so one file
covers every weight from 100 to 900. Used by the signed-in app, and by a public
site whose Font setting is Inter.

- Source: <https://fonts.google.com/specimen/Inter>
- Licence: SIL Open Font License 1.1, <https://openfontlicense.org>

## Libre Baskerville

`libre-baskerville-latin.woff2` and `libre-baskerville-latin-ext.woff2` are
regular, `libre-baskerville-700-latin.woff2` and
`libre-baskerville-700-latin-ext.woff2` are bold. Static files, not variable,
so the two weights are two downloads. Only a public site whose Heading font
setting is Libre Baskerville loads them, and then only for headings.

- Source: <https://fonts.google.com/specimen/Libre+Baskerville>
- Licence: SIL Open Font License 1.1, <https://openfontlicense.org>

Both licences allow bundling the files with an application and serving them.
They ask that the font names not be changed and that the licence travel with
the files, which is what this file is for.
