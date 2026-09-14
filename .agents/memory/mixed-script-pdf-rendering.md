---
name: Mixed-script PDF rendering
description: PDFKit rules for reliable mixed-script shaping, baselines, and extraction checks.
---

Render mixed-script font runs at explicit x/y coordinates on one baseline. Zero-width joiners, non-joiners, combining marks, and spaces inside non-Latin phrases must inherit the preceding run's font. Send a complete Arabic phrase through one fontkit layout operation. CJK punctuation must inherit a neighboring CJK font.

**Why:** PDFKit continued-text mode moved font changes onto separate visual lines, and classifying joiners, phrase spaces, or CJK punctuation as Latin broke shaping or produced missing glyphs. PDFKit's default cached layout splits at spaces; for Arabic this shapes individual RTL words but leaves the words in LTR order. Han characters are shared across languages, so Kanji-only Japanese text also needs country/language context instead of character-only detection. PDFKit's ToUnicode maps may reorder complex-script clusters or represent ligatures with control codes even when the rendered text is correct.

**How to apply:** Measure each run with its embedded font, advance x manually, and disable automatic page margins when the export owns page coordinates. Force whole-run OpenType layout for Arabic during both measurement and drawing. Use country/language metadata to choose Japanese versus Chinese Han forms, including surrounding punctuation. Verify stable script-specific words with an independent parser, assert Arabic is one RTL text item, and inspect a rendered page for full shaping, word order, glyph coverage, and baseline alignment.