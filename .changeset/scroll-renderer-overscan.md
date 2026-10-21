---
'wtc-gl': patch
---

Fix `ScrollRenderer`'s absolute layout making the page longer. The canvas is drawn taller than the viewport, so near the end of the page it reached past the content, and every scroll to the bottom added to the page's scroll height. It now stops at the end of the content (or the viewport's bottom on a page shorter than the viewport): near the end it moves up instead, giving up only the part of the lower overscan band that can't be scrolled to, and scenes are offset to match. The end of the content is measured with `document.body.scrollHeight`, so `<body>` must not be positioned.
