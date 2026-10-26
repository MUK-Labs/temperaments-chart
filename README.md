# Temperaments · Historical atlas

An interactive companion to the [Temperament Explorer](https://muk-labs.github.io/temperaments/): follow historical tuning evidence through places and dates, inspect its sources, and open an appropriate listening model in a new tab.

**GitHub Pages target:** <https://muk-labs.github.io/temperaments-chart/>. This address becomes available after Pages is enabled and the deployment workflow succeeds; configuring the repository alone does not establish that the site is live.

## Explore the atlas

- Move the year slider or enter a year between 1500 and 1850. Choose a ±10, ±25 or ±50-year viewing window, or show all dates. The default view is 1722 ±25 years.
- Use the previous/next milestone controls or play through the timeline. Select a milestone, map location or evidence card to read its historical context and references.
- Search by person, place or tuning, and filter by tuning family or kind of evidence. The map and evidence cards respond together; faint map points remain available for geographic orientation.
- Pan or zoom the map. Rome’s two dated source-location records share a geographic point. The 1691 Werckmeister milestone remains in the timeline without a single map point, as in the original dataset.
- Open **People & musical contexts** for the complete register. It follows the text, family and evidence filters independently of the year slider, so undated testimony and open questions remain discoverable.
- Use the labelled listening links to open the companion explorer in a new tab with the selected tuning and harpsichord sound. The atlas remains open. Historical source models, representative reconstructions and modern comparisons are distinguished beside the links.
- Use **Copy view link** to share the current atlas view. Keyboard users can reach the controls, source locations and records with Tab and activate them with Enter.

The layout adapts to narrow screens. The site has no framework, map API, runtime CDN, account requirement or server-side component. Its coastline and historical data are bundled with the application.

## Read the evidence correctly

This is a map and timeline of **selected evidence**, not a survey of how often a temperament was used. A publication date is not a beginning or ending date for its practice. A publication city is not proof that the surrounding region adopted its tuning. A person’s historical position can change between sources, and some sources do not specify a numerical recipe.

The source corpus contains **17 dated milestones, 13 place records at 12 distinct city locations, 26 people/context records and 34 annotated references**. The separate positions by Rameau are preserved. The two Rome records retain their dates and individual evidence even though they share a map marker.

| Evidence label | What it describes |
| --- | --- |
| A | An author’s own position or instruction. Its transmission may still be indirect; read the verification note. |
| B | A report or document about someone else’s practice. |
| C | Bibliographical, instrumental, institutional, repertoire or work context. |
| A+B | A record combining different kinds of evidence. |
| Open | No checked personal tuning instruction in this selected corpus. |

These categories describe claim types, not confidence scores. For example, the atlas does not present 31-EDO as an uncontested reconstruction of Vicentino, assign one definitive temperament to J. S. Bach, or turn an open finding for Mozart or Beethoven into a personal preset.

## Sources and provenance

The historical content adapts Adrián Artacho’s [Preferences research dossier](https://github.com/AdrianArtacho/Tuning/tree/3e563043ce7c12c930dd148c339a4f490e9a5a4a/sandbox/Preferences), at source commit `3e563043ce7c12c930dd148c339a4f490e9a5a4a`. Its original source-check date is **21 October 2026**. The website translates and connects those records; it does not claim to have rechecked every underlying historical document.

- [`data/atlas.json`](data/atlas.json) contains the English interface records, source annotations and navigation relationships.
- [`data/source/`](data/source/) preserves the original German datasets unchanged, including their numerical models.
- [`data/tunings.json`](data/tunings.json) records the listening models, verified destination URLs and the relationship between each model and its historical entry.
- [`data/README.md`](data/README.md) explains the editorial choices, evidence categories and original source-status notes.
- [`docs/EXPLORER.md`](docs/EXPLORER.md) documents the explorer URL contract and numerical checks.

The background uses the dossier’s bundled [Natural Earth 1:110m land data](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/), which is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The map shows generalized modern coastlines with no political borders. City-center coordinates are geographic orientation aids.

The listening integration was checked against explorer commit `779e7f2b64ebd8d841985bbdee42c4e206da9dcd`. Built-in links use `?scale=ID&instrument=harpsichord`. The two-sevenths-comma meantone model uses the explorer’s existing custom Scala support, with encoded scale text in the URL fragment; no explorer modification is needed. The visitor enables sound in the explorer.

## Run and verify locally

Use Node.js 20 or newer. There are no package dependencies to install.

```sh
npm test
npm run build
python3 -m http.server 8000 --directory dist
```

Open <http://localhost:8000/>. Serve the files over HTTP rather than opening `index.html` directly: the application loads local JSON data with `fetch`.

`npm run check` additionally checks JavaScript syntax. `npm run build` recreates `dist/` from an explicit allowlist: the HTML, stylesheet, application modules, map and favicon assets, and public JSON data. Repository history, tests, documentation, build scripts and the source GeoJSON are not included in the published artifact. All runtime paths are relative so the site works at the repository subpath `/temperaments-chart/`.

To regenerate the background from the bundled coastline data:

```sh
python3 scripts/build-map.py
```

This updates `assets/europe.svg` and `assets/map-projection.json`. Their shared spherical-Mercator projection keeps the interactive markers aligned with the background.

## Publish with GitHub Pages

The repository includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml). It tests the atlas, builds `dist/`, uploads that directory as a Pages artifact, and deploys it through the official GitHub Pages actions. Pushes to `main` and manual workflow runs trigger publication. The workflow uses Node.js 24 and requires no personal access token.

For the initial activation:

1. Open [Settings → Pages](https://github.com/MUK-Labs/temperaments-chart/settings/pages).
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. Open **Actions → Publish historical atlas** and run the workflow, or push a new commit to `main`.
4. Wait for both `build` and `deploy` to succeed. The `github-pages` environment and Pages settings then show the confirmed published URL.

GitHub documents that free organization accounts can publish Pages from public repositories; publishing from a private organization repository requires a plan that supports it, such as GitHub Team or Enterprise. Repository visibility and site visibility are separate settings. If the Pages settings report a plan restriction, the repository owner must choose an appropriate hosting/visibility arrangement; this workflow does not change repository visibility. See [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) and [GitHub’s plans](https://docs.github.com/get-started/learning-about-github/githubs-products).

The workflow versions were checked against the official action releases on 26 October 2026: [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0), [configure-pages](https://github.com/actions/configure-pages/releases/tag/v6.0.0), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0), and [deploy-pages](https://github.com/actions/deploy-pages/releases/tag/v5.0.1).

## Credits

Concept, research direction and original dossier: **Adrián Artacho**. Research synthesis and web implementation developed with ChatGPT. Historical claims remain attributed to the sources listed in the atlas. The visual palette follows the existing [MUK-Labs Temperaments](https://github.com/MUK-Labs/temperaments) project.
