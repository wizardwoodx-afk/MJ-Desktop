import { useEffect, useMemo, useState } from "react";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ actions, onClose }: { actions: PaletteAction[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hot, setHot] = useState(0);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return actions.filter((a) => !s || a.label.toLowerCase().includes(s) || a.id.includes(s)).slice(0, 40);
  }, [actions, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setHot((h) => Math.min(list.length - 1, h + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setHot((h) => Math.max(0, h - 1)); }
      if (e.key === "Enter") {
        e.preventDefault();
        list[hot]?.run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hot, list, onClose]);

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Run a command…" value={q} onChange={(e) => { setQ(e.target.value); setHot(0); }} />
        <div className="results">
          {list.map((a, i) => (
            <div key={a.id} className={`result ${i === hot ? "hot" : ""}`} onMouseEnter={() => setHot(i)} onClick={() => { a.run(); onClose(); }}>
              <span style={{ flex: 1 }}>{a.label}</span>
              {a.hint && <span className="kbd">{a.hint}</span>}
            </div>
          ))}
          {list.length === 0 && <div className="result">No matches</div>}
        </div>
      </div>
    </div>
  );
}
