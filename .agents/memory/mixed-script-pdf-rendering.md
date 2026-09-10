---
name: Mixed-script PDF rendering
description: PDFKit rules for reliable mixed Latin, Sinhala, and Korean export text.
---

Render mixed-script font runs at explicit x/y coordinates on one baseline. Zero-width joiners, non-joiners, and combining marks must inherit the preceding run's font.

**Why:** PDFKit continued-text mode moved font changes onto separate visual lines, and classifying Sinhala joiners as Latin broke shaping. Explicitly positioned content can also trigger surprise pages when automatic margins remain enabled.

**How to apply:** Measure each run with its embedded font, advance x manually, and disable automatic page margins when the export owns page coordinates. Verify with both text extraction and a rendered-page image.