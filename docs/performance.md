# Performance Baseline and Results

Measured on 2026-08-12 with Node.js 22.16.0 on Windows. Run the maintained
benchmark with:

```bash
npm run benchmark
```

## Page vocabulary matching

The benchmark scans a synthetic 4,000-token page containing 80 matches against
750 saved vocabulary records. This represents a long article and a mature local
word collection.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Mean scan time | 6,083.04 ms | 4.1784 ms | 99.93% lower |
| Throughput | 0.1644 ops/s | 239.33 ops/s | 1,455.8x higher |

The original path tokenized the remaining text and compared it with every saved
record again after each match. The optimized path compiles word forms once into
an index, tokenizes each text node once, returns all non-overlapping matches in
one pass, and reuses the compiled matcher for the whole page.

The content script still yields to the main thread every 120 text nodes, so long
pages remain responsive while highlighting is applied.

## Extension bundle size

The original general-purpose lemmatizer shipped a large linguistic model in both
the content script and service worker. LexiTrace now uses a conservative,
tested word-form module with common inflection rules and common irregular forms.

| Build artifact | Before | After | Change |
| --- | ---: | ---: | ---: |
| `content.js` | 1,772.74 kB | 49.35 kB | 97.21% smaller |
| `content.js` gzip | 622.71 kB | 16.64 kB | 97.33% smaller |
| `background.js` | 3,477.80 kB | 1,182.94 kB | 65.99% smaller |
| `background.js` gzip | 1,148.02 kB | 515.60 kB | 55.09% smaller |

Build sizes are reported by Vite from `npm run build`. Source maps are not
included in the figures above. `npm run build:release` also omits source-map
files from `dist/`, reducing the Chrome Web Store upload and download package.

## Regression gates

- Matching tests cover boundaries, inflections, overlapping phrases, all-match
  scans, and compiled matcher reuse.
- Word-form tests cover regular and irregular forms and guard against false
  reductions such as `news` to `new`.
- `npm run typecheck`, `npm test`, `npm run benchmark`, and `npm run build` are
  the performance-related release gates.
