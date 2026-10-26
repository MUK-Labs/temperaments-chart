# Temperament explorer integration

Listening links target [MUK-Labs Temperaments](https://muk-labs.github.io/temperaments/) in a new tab. The integration was checked against explorer source commit [`779e7f2b64ebd8d841985bbdee42c4e206da9dcd`](https://github.com/MUK-Labs/temperaments/tree/779e7f2b64ebd8d841985bbdee42c4e206da9dcd). The catalogue and audited links are stored in [`data/tunings.json`](../data/tunings.json).

## URL contract

For built-in models the link is `https://muk-labs.github.io/temperaments/?scale=ID&instrument=harpsichord`. Verified IDs used here are `meantone`, `meantone-third`, `werckmeister-iii`, `kirnberger-iii`, `vallotti`, `12edo` and `31edo`.

The missing two-sevenths-comma model uses the explorer's existing custom-scale support: `?scale=custom&instrument=harpsichord#scl=…`. The fragment is ordinary `URLSearchParams` encoding of a plaintext Scala file, not base64. Its values come from the dossier's `mt_2_7` model, ordered by the supplied chromatic keyboard and rounded to twelve decimal places, with an exact `2/1` octave. No change to the explorer is required.

The explorer initializes from the URL and does not consult local storage. These links start in fixed temperament mode with root MIDI 60 (C4), A4 reference 440 Hz, chromatic keyboard mapping and volume 55. Omitting `mode` avoids starting in the equal-tempered A/B reference; omitting `dynamic` hides and disables the optional dynamic mode. The root is a pitch anchor, not a historical pitch-standard or key-signature claim. The application starts silently; the visitor chooses **Enable sound**.

The source contract is in [`src/app.js`](https://github.com/MUK-Labs/temperaments/blob/779e7f2b64ebd8d841985bbdee42c4e206da9dcd/src/app.js), with Scala parsing in [`src/tuning.js`](https://github.com/MUK-Labs/temperaments/blob/779e7f2b64ebd8d841985bbdee42c4e206da9dcd/src/tuning.js) and preset identity/provenance in [`scales/catalog.json`](https://github.com/MUK-Labs/temperaments/blob/779e7f2b64ebd8d841985bbdee42c4e206da9dcd/scales/catalog.json) and [`docs/SCALE-SOURCES.md`](https://github.com/MUK-Labs/temperaments/blob/779e7f2b64ebd8d841985bbdee42c4e206da9dcd/docs/SCALE-SOURCES.md).

## Historical relationship

The eight models are listening tools. Every attached link has a separate relationship label:

| Status | Meaning |
| --- | --- |
| `source-model` | Matches a mathematical method or ideal discussed in the supplied research. It does not certify an instrument's actual tuning. |
| `representative` | A modern listening reconstruction of a reported or inferred tuning family whose exact numbers are not established. |
| `comparison` | A deliberately labelled comparison, not a historical attribution. |

The 31-EDO link is only a modern comparison for Vicentino. The 12-EDO comparison for Galilei does not reproduce the 18:17 fret-placement rule. Regular quarter-comma meantone is only a baseline for Rameau's modified 1726 proposal. Vallotti is a named listening comparison for Bach and C. P. E. Bach, not their documented personal tuning. The catalogue's Robert Rich just-intonation preset is not assigned to Renaissance practice, and its Young preset is not used as a generic historical tuning: it represents an 1807 archive variant.

No preset is assigned to an open personal-tuning finding for Mozart or Beethoven. No substitute French recipe is assigned to Louis Couperin, and the retracted Werckmeister III attribution to Buxtehude is not restored. All original person and event IDs are covered by mappings, including explicitly empty arrays with explanations where the evidence does not support a useful assignment.

## Verification

All seven built-in IDs were checked against the current catalogue. The custom link was decoded and passed to the actual explorer Scala parser, producing twelve ascending intervals with a 1200-cent period. Its maximum difference from the dossier model is below `5e-13` cents. The supplied quarter-comma and Werckmeister III presets match the dossier's respective ideal layouts within `0.000005` cents (source-file rounding); 12-EDO matches exactly. These checks establish URL and numerical compatibility, not a historical performance claim.

The shared palette is warm off-white `#faf9f6`, ink `#292625`, muted text `#77716d`, rules `#ddd9d3`, red `#a01414` and pale red `#f9eeeb`, with Arial/Helvetica interface text and Georgia italic accents. These are the companion application's existing design choices, not a newly asserted institutional brand standard.
