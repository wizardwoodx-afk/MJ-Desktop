# MJ version channels: external releases vs internal builds

> Why the public tag list skips numbers. Short version: only tagged versions
> are releases. Everything else was an internal iteration build.

## The two channels

- **External release** — a published GitHub tag (`v11.12.0`, `v11.12.1`,
  `v11.12.3`, `v11.13.0`, …). Full audit gates, release notes, offline
  verification pack. This is what reviewers, users and investors should
  look at.
- **Internal build** — an iteration between externals: verification runs,
  review fixes, withdrawn cuts. Produced as a zip, exercised through the
  gates, but **never tagged and never published**. Internal builds consume
  version numbers without leaving a public tag, which is why the numbers skip.

## Known internal builds (11.12.x line)

| Version | Status | Evidence |
|---|---|---|
| 11.12.2 | Cut, superseded by 11.12.3 — never tagged | zip on record, no tag |
| 11.12.4 | Intentionally skipped upstream | stated in 11.13.0 `verify/BUILD-INFO.txt` ("11.12.4 was intentionally skipped (11.12.5 followed 11.12.3)") |
| 11.12.5 | Cut, superseded by 11.13.0 — never tagged | zip on record, no tag |
| 11.14.0 | Cut, superseded by 11.14.1 — never tagged | 11.14.1 `verify/BUILD-INFO.txt` certifies "what changed over 11.14.0" with counts 67 -> 68; no tag |
| 11.14.4 | Intentionally skipped upstream | stated in 11.14.5 `verify/BUILD-INFO.txt` ("11.14.4 was intentionally skipped — 11.14.5 ships directly after 11.14.3") |
| 11.14.6 | Intentionally skipped upstream | stated in 11.14.7 `verify/BUILD-INFO.txt` ("11.14.6 was intentionally skipped — 11.14.7 ships directly after 11.14.5") |
| 11.14.9 | Intentionally skipped upstream | stated in 11.14.10 `verify/BUILD-INFO.txt` ("11.14.9 was intentionally skipped — 11.14.10 ships directly after 11.14.8") |
| 12.0.2 | Internal iteration, superseded — never tagged | in-tree pointer `docs/history/MJ-12.0.2-POINTER.md` ships with the release; no tag |
| 12.0.3 | Internal iteration, superseded — never tagged | in-tree pointer `docs/history/MJ-12.0.3-POINTER.md` ships with the release; no tag |
| 12.1.0 | Internal iteration, superseded — never tagged | zip on record + in-tree pointer `docs/history/MJ-12.1.0-POINTER.md`; no tag |
| 12.1.1 | Internal iteration, superseded by 12.2.0 — never tagged | zip on record + in-tree pointer `docs/history/MJ-12.1.1-POINTER.md`; 12.2.0 `verify/BUILD-INFO.txt` certifies "what changed over 12.1.1"; no tag |
| 13.0.0 | Internal iteration, superseded by 13.0.1 — never tagged | zip on record + in-tree pointer `docs/history/MJ-13.0.0-POINTER.md`; 13.0.1 `verify/BUILD-INFO.txt` certifies "what changed over 13.0.0"; no tag |
| 13.5.0 | Internal iteration, superseded by 13.5.1 — never tagged | zip on record + in-tree pointer `docs/history/MJ-13.5.0-POINTER.md`; 13.5.1 `verify/BUILD-INFO.txt` certifies "what changed over 13.5.0"; no tag |
| 14.0.0 | Internal iteration, superseded — never tagged | zip on record (`MJ-14.0.0-source.zip`); no tag |
| 14.0.1 | Internal iteration, superseded — never tagged | zip on record (`MJ-14.0.1-source.zip`); no tag |
| 14.1.0 | Internal iteration, superseded by 14.1.1 — never tagged | zip on record (`MJ-14.1.0-source.zip`); 14.1.1 line documents the trust-anchor + economics work; no tag |

## Rule going forward

Patch numbers may be consumed by internal iteration without a public tag.
A missing number in the tag list means "internal build, superseded or
withdrawn" — not "missing release." Only `v*` tags are releases.
