# WCAG data.

`wcag-2.2.json` is the W3C's published JSON serialization of WCAG 2.2, copied without changes from <https://www.w3.org/WAI/WCAG22/wcag.json>. `wcag-2.2.source.json` records where and when it was downloaded, and the SHA-256 of the file. A test fails if the file and that hash disagree.

automatica11y reads criterion numbers, names, levels, and versions from this file. It doesn't edit or extend the data. The links it builds from each criterion's `id` are added by automatica11y and aren't part of the W3C data.

## Attribution.

Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. The JSON is published under the [terms in the W3C WCAG repository](https://github.com/w3c/wcag/blob/main/11ty/json/README.md): attribute the original source with a link, and don't change the content. See also the [W3C Document License](https://www.w3.org/copyright/document-license/) and [W3C Intellectual Rights](https://www.w3.org/copyright/intellectual-rights/).

Copyright © World Wide Web Consortium. W3C® liability, trademark and permissive document license rules apply.

## Updating.

```bash
npm run update-wcag
```

The W3C publishes new versions monthly. The script downloads the file, checks that it has principles and terms, and writes it unchanged.
