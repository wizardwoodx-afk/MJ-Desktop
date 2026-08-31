import type { ReactNode } from "react";

const s = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function iconFor(name?: string): ReactNode {
  switch (name) {
    case "map":
      return <svg {...s}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>;
    case "search":
      return <svg {...s}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
    case "globe":
      return <svg {...s}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
    case "code":
      return <svg {...s}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>;
    case "bug":
      return <svg {...s}><rect x="8" y="6" width="8" height="12" rx="4" /><line x1="8" y1="10" x2="4" y2="8" /><line x1="16" y1="10" x2="20" y2="8" /><line x1="12" y1="6" x2="12" y2="3" /></svg>;
    case "flask":
      return <svg {...s}><path d="M9 3h6M10 3v6L5 20h14L14 9V3" /></svg>;
    case "scale":
      return <svg {...s}><line x1="12" y1="3" x2="12" y2="21" /><path d="M5 7h14M5 7l-3 6h6L5 7zm14 0l-3 6h6l-3-6z" /></svg>;
    case "eye":
      return <svg {...s}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "check":
      return <svg {...s}><polyline points="20 6 9 17 4 12" /></svg>;
    case "book":
      return <svg {...s}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case "shield":
      return <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "layers":
      return <svg {...s}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
    case "crown":
      return <svg {...s}><path d="M3 18h18l-2-10-5 4-4-6-4 6-5-4z" /></svg>;
    case "gitbranch":
      return <svg {...s}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M6 8v2a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8" /><line x1="12" y1="16" x2="12" y2="14" /></svg>;
    case "gavel":
      return <svg {...s}><rect x="3" y="16" width="18" height="4" /><path d="M8 16V6l6-3 3 3-6 3" /></svg>;
    case "refresh":
      return <svg {...s}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15A9 9 0 1 1 21 8" /></svg>;
    case "dna":
      return <svg {...s}><path d="M4 4c6 4 10 12 16 16M20 4C14 8 10 16 4 20" /><line x1="7" y1="7" x2="17" y2="7" /><line x1="7" y1="17" x2="17" y2="17" /></svg>;
    case "hex":
      return <svg {...s}><polygon points="12 2 20 7 20 17 12 22 4 17 4 7" /></svg>;
    case "cpu":
      return <svg {...s}><rect x="7" y="7" width="10" height="10" /><path d="M7 3v4M17 3v4M7 17v4M17 17v4M3 7h4M3 17h4M17 7h4M17 17h4" /></svg>;
    case "play":
      return <svg {...s}><polygon points="6 4 20 12 6 20 6 4" /></svg>;
    case "stop":
      return <svg {...s}><rect x="6" y="6" width="12" height="12" /></svg>;
    case "split":
      return <svg {...s}><path d="M12 3v6M12 9l-7 10M12 9l7 10" /></svg>;
    case "switch":
      return <svg {...s}><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>;
    case "parallel":
      return <svg {...s}><line x1="6" y1="4" x2="6" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="18" y1="4" x2="18" y2="20" /></svg>;
    case "list":
      return <svg {...s}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
    case "merge":
      return <svg {...s}><path d="M8 3v6a4 4 0 0 0 4 4 4 4 0 0 0 4-4V3" /><line x1="12" y1="13" x2="12" y2="21" /></svg>;
    case "clock":
      return <svg {...s}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "hand":
      return <svg {...s}><path d="M8 13V6a1 1 0 0 1 2 0v5M10 12V5a1 1 0 0 1 2 0v6M12 12V6a1 1 0 0 1 2 0v6M14 12V8a1 1 0 0 1 2 0v8a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-3" /></svg>;
    case "wand":
      return <svg {...s}><line x1="4" y1="20" x2="15" y2="9" /><path d="M15 9l3-3M18 4v2M17 5h2M9 4l1 2M4 9l2 1" /></svg>;
    case "folder":
      return <svg {...s}><path d="M3 7h6l2 2h10v10H3z" /></svg>;
    case "terminal":
      return <svg {...s}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
    case "braces":
      return <svg {...s}><path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" /></svg>;
    case "zap":
      return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case "spark":
      return <svg {...s}><path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z" /></svg>;
    case "plug":
      return <svg {...s}><path d="M9 7v4M15 7v4M8 11h8v3a4 4 0 0 1-8 0zM12 18v3" /></svg>;
    case "history":
      return <svg {...s}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>;
    case "tool":
      return <svg {...s}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3z" /></svg>;
    case "users":
      return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "heart":
      return <svg {...s}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
    case "home":
      return <svg {...s}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case "activity":
      return <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
    case "settings":
      return <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.6 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    default:
      return <svg {...s}><circle cx="12" cy="12" r="4" /></svg>;
  }
}
