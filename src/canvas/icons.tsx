import type { ReactNode } from "react";

/**
 * §V11.5 MERIDIAN ICON SET — redrew every glyph on the Meridian grammar:
 * a single 1.6-weight stroke, round caps, and a 1.7-radius ink dot at the
 * visual junction of each glyph (dot() = currentColor, no stroke), so icons
 * feel hand-set rather than clipped from a stock set. Same names as ever —
 * only the ink changed.
 */

const s = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** The Meridian ink dot: a tiny filled circle placed at the glyph's junction. */
const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="1.7" fill="currentColor" stroke="none" />;

export function iconFor(name?: string): ReactNode {
  switch (name) {
    case "map":
      return <svg {...s}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" />{dot(8, 10)}<line x1="16" y1="6" x2="16" y2="22" />{dot(16, 14)}</svg>;
    case "search":
      return <svg {...s}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />{dot(11, 11)}</svg>;
    case "globe":
      return <svg {...s}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />{dot(12, 12)}<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
    case "code":
      return <svg {...s}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />{dot(12, 12)}</svg>;
    case "bug":
      return <svg {...s}><rect x="8" y="6" width="8" height="12" rx="4" /><line x1="8" y1="10" x2="4" y2="8" /><line x1="16" y1="10" x2="20" y2="8" /><line x1="12" y1="6" x2="12" y2="3" />{dot(12, 12)}</svg>;
    case "flask":
      return <svg {...s}><path d="M9 3h6M10 3v6L5 20h14L14 9V3" />{dot(12, 16)}</svg>;
    case "scale":
      return <svg {...s}><line x1="12" y1="3" x2="12" y2="21" /><path d="M5 7h14M5 7l-3 6h6L5 7zm14 0l-3 6h6l-3-6z" />{dot(12, 7)}</svg>;
    case "eye":
      return <svg {...s}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{dot(12, 12)}</svg>;
    case "check":
      return <svg {...s}><polyline points="20 6 9 17 4 12" />{dot(9, 17)}</svg>;
    case "book":
      return <svg {...s}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />{dot(6.5, 17)}</svg>;
    case "shield":
      return <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />{dot(12, 9)}</svg>;
    case "layers":
      return <svg {...s}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />{dot(12, 7)}{dot(12, 12)}</svg>;
    case "crown":
      return <svg {...s}><path d="M3 18h18l-2-10-5 4-4-6-4 6-5-4z" />{dot(12, 14)}</svg>;
    case "gitbranch":
      return <svg {...s}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M6 8v2a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8" />{dot(12, 14)}</svg>;
    case "gavel":
      return <svg {...s}><rect x="3" y="16" width="18" height="4" /><path d="M8 16V6l6-3 3 3-6 3" />{dot(11, 6)}</svg>;
    case "refresh":
      return <svg {...s}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15A9 9 0 1 1 21 8" />{dot(23, 10)}</svg>;
    case "dna":
      return <svg {...s}><path d="M4 4c6 4 10 12 16 16M20 4C14 8 10 16 4 20" /><line x1="7" y1="7" x2="17" y2="7" /><line x1="7" y1="17" x2="17" y2="17" />{dot(12, 12)}</svg>;
    case "hex":
      return <svg {...s}><polygon points="12 2 20.66 7 20.66 17 12 22 3.34 17 3.34 7 12 2" />{dot(12, 12)}</svg>;
    case "cpu":
      return <svg {...s}><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" />{dot(12, 12)}<line x1="9" y1="2" x2="9" y2="5" /><line x1="15" y1="2" x2="15" y2="5" /><line x1="9" y1="19" x2="9" y2="22" /><line x1="15" y1="19" x2="15" y2="22" /></svg>;
    case "play":
      return <svg {...s}><polygon points="6 3 20 12 6 21 6 3" />{dot(8, 12)}</svg>;
    case "stop":
      return <svg {...s}><rect x="5" y="5" width="14" height="14" rx="2" />{dot(12, 12)}</svg>;
    case "split":
      return <svg {...s}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><line x1="12" y1="4" x2="12" y2="14" /><path d="M6 8c2 4 6 6 6 6M18 8c-2 4-6 6-6 6" />{dot(12, 12)}</svg>;
    case "switch":
      return <svg {...s}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M6 8v2a4 4 0 0 0 4 4h8" /><path d="M18 16v-2a4 4 0 0 0-4-4H6" />{dot(11, 12)}</svg>;
    case "parallel":
      return <svg {...s}><line x1="7" y1="3" x2="7" y2="21" /><line x1="17" y1="3" x2="17" y2="21" /><line x1="2" y1="12" x2="7" y2="12" /><line x1="17" y1="12" x2="22" y2="12" />{dot(7, 12)}{dot(17, 12)}</svg>;
    case "list":
      return <svg {...s}><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />{dot(4, 6)}{dot(4, 12)}{dot(4, 18)}</svg>;
    case "merge":
      return <svg {...s}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="12" cy="6" r="2" /><path d="M12 8v3M6 16c1-3 6-5 6-5s5 2 6 5" />{dot(12, 12)}</svg>;
    case "clock":
      return <svg {...s}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />{dot(12, 12)}</svg>;
    case "hand":
      return <svg {...s}><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34L3.4 15.4a2 2 0 0 1 2.83-2.82L8 15" />{dot(16, 8)}</svg>;
    case "wand":
      return <svg {...s}><line x1="3" y1="21" x2="15" y2="9" /><polygon points="15 4 16.5 7.5 20 9 16.5 10.5 15 14 13.5 10.5 10 9 13.5 7.5 15 4" />{dot(15, 9)}</svg>;
    case "folder":
      return <svg {...s}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />{dot(12, 12)}</svg>;
    case "terminal":
      return <svg {...s}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />{dot(12, 19)}</svg>;
    case "braces":
      return <svg {...s}><path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4c0 1.1.9 2 2 2h1" /><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />{dot(12, 12)}</svg>;
    case "zap":
      return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />{dot(12, 14)}</svg>;
    case "spark":
      return <svg {...s}><polygon points="12 2 14.4 9.6 22 12 14.4 14.4 12 22 9.6 14.4 2 12 9.6 9.6 12 2" />{dot(12, 12)}</svg>;
    case "plug":
      return <svg {...s}><path d="M9 2v6M15 2v6" /><path d="M6 8h12v4a6 6 0 0 1-12 0V8z" /><line x1="12" y1="18" x2="12" y2="22" />{dot(12, 12)}</svg>;
    case "history":
      return <svg {...s}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /><polyline points="12 7 12 12 15 14" />{dot(12, 12)}</svg>;
    case "tool":
      return <svg {...s}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4L15 10l-2-2 1.7-1.7z" />{dot(15, 9)}</svg>;
    case "users":
      return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><line x1="21" y1="15" x2="21" y2="21" /><line x1="18" y1="15" x2="22" y2="15" />{dot(10, 11)}</svg>;
    case "heart":
      return <svg {...s}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />{dot(12, 12)}</svg>;
    case "home":
      return <svg {...s}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><polyline points="9 21 9 13 15 13 15 21" />{dot(12, 13)}</svg>;
    case "activity":
      return <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />{dot(12, 12)}</svg>;
    case "settings":
      return <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />{dot(12, 12)}</svg>;
    default:
      return <svg {...s}><circle cx="12" cy="12" r="9" />{dot(12, 12)}</svg>;
  }
}

export type IconName =
  | "map" | "search" | "globe" | "code" | "bug" | "flask" | "scale" | "eye" | "check" | "book"
  | "shield" | "layers" | "crown" | "gitbranch" | "gavel" | "refresh" | "dna" | "hex" | "cpu" | "play"
  | "stop" | "split" | "switch" | "parallel" | "list" | "merge" | "clock" | "hand" | "wand" | "folder"
  | "terminal" | "braces" | "zap" | "spark" | "plug" | "history" | "tool" | "users" | "heart" | "home"
  | "activity" | "settings";
