/**
 * The one place MJ's release version is written.
 *
 * This exists because the version was previously duplicated across `package.json`,
 * `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, the README title, and —
 * worst of all — hardcoded strings inside `SettingsPage.tsx` and `ipc/client.ts`. Those drifted to
 * 4.0.0 / 6.0.0 / 7.0.0 in the same tree, so the app displayed a version no manifest agreed with and
 * nothing failed. A drift like that is invisible until someone diffs the files by hand.
 *
 * So: TypeScript imports `MJ_VERSION`, and `probe/versionDrift.test.ts` asserts that every manifest
 * says the same thing. Renaming a release is then one edit plus a check that fails loudly if any
 * manifest was missed.
 */
export const MJ_VERSION = "11.9.4";

/** Short form for compact UI labels ("MJ 9.0"). */
export const MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");

/** Display line used by the shell's header and the settings page. */
export const MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;
