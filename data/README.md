# Historical data and provenance

The atlas is an English adaptation of Adrián Artacho's research dossier [Who tuned how?](https://github.com/AdrianArtacho/Tuning/tree/3e563043ce7c12c930dd148c339a4f490e9a5a4a/sandbox/Preferences), whose source-check date is **21 October 2026**. The original German JSON files are preserved unchanged in `source/`. `atlas.json` provides the translated interface content and explicit relationships between those records.

Source repository commit: `3e563043ce7c12c930dd148c339a4f490e9a5a4a`.

## What is shown

- 17 selected dated milestones, with their original dates and approximate-date flags.
- 13 evidence-place records, representing 12 distinct city locations (Rome has two separately dated records).
- 26 entries in the people register, including two separate positions by Rameau.
- 34 annotated source and dataset references.

The slider filters **dated evidence**, never the duration of a tuning's use. A publication place does not establish regional adoption, and an absent marker does not establish absence of a practice. City-centre coordinates and modern coastlines are only orientation aids. Werckmeister's 1691 publication names Frankfurt and Leipzig; the original timeline deliberately has no single map location for this item.

Evidence categories identify the **kind of claim**, not a confidence score: A = the author's own statement or instruction; B = testimony about someone else's practice; C = instrument, institution, repertoire or bibliographical context; A+B = mixed evidence; open = no checked personal tuning evidence in this selected corpus. A can describe a primary instruction accessible only through later scholarship, so the verification notes remain part of the record. Present-day listening suggestions are separate from historical findings.

`atlas.json` translates the existing synthesis; it does not claim that the underlying sources have all been re-read for this website. The original source-status notes—including inaccessible full texts and indirect transmission—are retained in English. Original titles and bibliographical citations remain in their original languages.

## Map and numerical models

`../assets/land.geojson` is the same bundled Natural Earth `ne_110m_land` dataset used by the dossier. It is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). It depicts modern generalized coastlines, without political borders.

The original `source/modelle.json` defines four ideal numerical models. Their numbers illustrate structures; they are not automatic attributions of personal composer preferences. The separate `tunings.json` documents the exact or illustrative relationship between a historical entry and the linked explorer preset.

## Editorial relationships

Event IDs and person IDs are preserved from the originals. `placeIds`, `personIds`, `eventIds`, and the five broad `families` tags are interface relationships added for navigation. The family labels are deliberately broad; they do not supply a missing historical numerical recipe. People without a checked dated milestone remain available in the complete register. No arbitrary lifespan or period-of-adoption dates have been added.

Research, synthesis and original dossier: created with ChatGPT for Adrián Artacho. Historical claims are attributed to their listed sources.
