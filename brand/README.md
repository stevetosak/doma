# doma brand assets

Source of truth for the doma mark. The mark is a rounded roof line over two
overlapping discs — one ink, one oxblood, the overlap near-black. "One roof,
two people." Every colour is a Ledger Slate token (see `../DESIGN.md`):

| role    | hex       |
| ------- | --------- |
| ink     | `#1d2320` |
| oxblood | `#8c2f24` |
| overlap | `#120806` |
| ground  | `#e9e4d8` |
| card    | `#f6f3ec` |

## Files here

| file                        | what it is                                                     |
| --------------------------- | -------------------------------------------------------------- |
| `doma-mark.svg`             | the mark alone, three-tone, on transparent                     |
| `doma-mark-16.svg`          | small-cut mark (heavier roof, bigger discs) for ~16px          |
| `doma-mark-reversed.svg`    | light mark for dark grounds                                    |
| `doma-mark-mono.svg`        | one-colour mark, inherits `currentColor`                       |
| `doma-icon.svg`             | full-bleed square app icon — the generator source              |
| `doma-lockup.svg`           | mark + "doma" wordmark, **wordmark outlined** (no font needed) |
| `doma-wordmark.svg`         | "doma" alone, outlined from Outfit 600                         |
| `doma-splash-1290x2796.svg` | original splash art (reference only)                           |
| `originals/`                | the untouched exports, C2PA provenance intact                  |

The files outside `originals/` have had their C2PA metadata stripped for the
web. `doma-wordmark.svg` / the lockup were re-cut with the wordmark as vector
paths so they render with no webfont — regenerate them with:

```
python3 - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
# ... see git history for the full script
PY
```

## Shipped assets

The in-app mark is hand-written React — `src/core/ui/AppMark.tsx` — not loaded
from a file. Browser + PWA raster assets live in `../public/` and are built
from `../public/doma-icon.svg` (a copy of `doma-icon.svg` here) by:

```
npm run generate:pwa-assets
```

That produces the favicon, PWA icons, apple-touch-icon and the iOS splash set,
and rewrites `src/core/pwa/apple-splash-links.ts`. It runs
`@vite-pwa/assets-generator` through `npx` — it is **not** a project
dependency (old `sharp`/libvips, open CVEs, only ever needed here by hand);
`pwa-assets.config.mjs` is self-contained so `npx` needs nothing installed.

`../public/favicon.svg`, `../public/doma-mark-mono.svg`, `../public/og.png` and
the three `../public/shortcut-*.png` are committed directly (see git history
for how the last four were cut).
