# MJ documentation

`docs/` ships the verification and history for MJ. Live documents:

- `VERIFICATION.md` — the two-tier verification gate (offline + full toolchain)
- `PLATFORM-LIMITS.md` — what the product doesn't do, stated plainly
- `MOSAIC-OMEGA-COMPAT.md` — compatibility audit of MJ against an external
  framework spec; documents the 11.12.0 alignment extract
- `VARKHA-COMPAT.md` — compatibility audit of MJ against a second external
  framework spec; documents the 11.12.1 governance extracts
- `history/` — per-version release notes and prior CI reports
- `history/VERSION-CHANNELS.md` — external releases vs internal builds
  (why the public tag list skips numbers)
- `history/MJ-14.1.1-WINDOWS-FIX.md` — what the Windows fix + cleanup changed
  relative to the shipped 14.1.1 zip (every difference listed)
- `history/VH-16.9.0-POINTER.md` — discoverable pointer for this release
- `history/VH-16.9.0-WINDOWS-FIX.md` — what the Windows fix changed
  relative to the shipped 16.9.0 zip (every difference listed)

Older reports that read like live docs are kept in `history/`.

Note (11.12.3): the investor memo, pitch deck and product brief were removed
upstream — this tree is the build, not the pitch. The memo survives in git
history at tags `v11.12.1` and earlier.
