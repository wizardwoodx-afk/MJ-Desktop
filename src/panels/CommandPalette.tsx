/**
 * §COMMAND PALETTE — the 11.9.5 Raycast-grade recut.
 *
 * Researched grounding: Raycast's DESIGN.md — "keyboard-first changes the layout: compact uniform
 * rows, crisp dark surfaces, restrained radii, monospace where it belongs"; Linear/VS Code/Notion
 * all converge on fuzzy subsequence search + grouped results + kbd hints. The old MJ palette was a
 * substring filter over actions only. This one ranks with a real fuzzy scorer (app/fuzzy.ts),
 * groups by kind, jumps to nodes, remembers your recent picks, and never needs the mouse.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { paletteScore } from "../app/fuzzy";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  run: () => void;
}

const RECENTS_KEY = "mj.palette.recents.v1";
const MAX_RECENTS = 5;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const p = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

export function CommandPalette({ actions, onClose }: { actions: PaletteAction[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hot, setHot] = useState(0);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * 11.9.6 review fix: ranking keys on the VISIBLE LABEL only; the group name participates
   * merely as a damped fallback (paletteScore), so typing "canvas" can still surface canvas
   * commands but a label hit always out-ranks a category hit. The old version concatenated
   * group+label, letting a query match category text it could not see.
   */
  const ranked = useMemo(() => {
    if (!q.trim()) return actions.map((item) => ({ item, score: 0 }));
    return actions
      .map((item) => ({ item, score: paletteScore(q, item.label, item.group) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [actions, q]);
  const list = useMemo(() => ranked.slice(0, 48).map((r) => r.item), [ranked]);

  /** With no query, recent commands float to the top under a "Recent" group. */
  const visible = useMemo(() => {
    if (q.trim()) return list;
    const recentItems = recents
      .map((id) => actions.find((a) => a.id === id))
      .filter((a): a is PaletteAction => Boolean(a))
      .map((a) => ({ ...a, group: "Recent" }));
    const recentIds = new Set(recentItems.map((a) => a.id));
    return [...recentItems, ...list.filter((a) => !recentIds.has(a.id))];
  }, [list, q, recents, actions]);

  const execute = (a: PaletteAction) => {
    setRecents((r) => {
      const next = [a.id, ...r.filter((x) => x !== a.id)].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* recents are a nicety, not state */
      }
      return next;
    });
    a.run();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHot((h) => Math.min(visible.length - 1, h + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHot((h) => Math.max(0, h - 1));
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setHot((h) => (e.shiftKey ? Math.max(0, h - 1) : Math.min(visible.length - 1, h + 1)));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const a = visible[hot];
        if (a) execute(a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hot, visible, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(".result.hot");
    el?.scrollIntoView({ block: "nearest" });
  }, [hot]);

  let lastGroup: string | undefined;
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <span className="palette-glyph" aria-hidden="true">⌘</span>
          <input autoFocus placeholder="Search commands, nodes, templates…" value={q} onChange={(e) => { setQ(e.target.value); setHot(0); }} />
          <span className="kbd">esc</span>
        </div>
        <div className="results" ref={listRef}>
          {visible.map((a, i) => {
            const header = a.group !== lastGroup ? a.group : null;
            lastGroup = a.group;
            return (
              <div key={a.id}>
                {header && <div className="palette-group">{header}</div>}
                <div className={`result ${i === hot ? "hot" : ""}`} onMouseEnter={() => setHot(i)} onClick={() => execute(a)}>
                  <span className="result-label">{a.label}</span>
                  {a.hint && <span className="kbd">{a.hint}</span>}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <div className="result empty">No matches — the palette only offers what exists.</div>}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑↓</span> navigate</span>
          <span><span className="kbd">↵</span> run</span>
          <span className="push">{actions.length} commands</span>
        </div>
      </div>
    </div>
  );
}
