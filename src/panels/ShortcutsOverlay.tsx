export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ["Ctrl+N", "New workflow"],
    ["Ctrl+O", "Open (palette)"],
    ["Ctrl+S", "Save"],
    ["Ctrl+Z", "Undo"],
    ["Ctrl+Shift+Z", "Redo"],
    ["Ctrl+Enter", "Run workflow"],
    ["Delete", "Delete selection"],
    ["Ctrl+D", "Duplicate"],
    ["Ctrl+C / V", "Copy / Paste nodes"],
    ["Space", "Pan canvas"],
    ["Ctrl+0", "Fit view"],
    ["Ctrl + / −", "Zoom"],
    ["Ctrl+K", "Command palette"],
    ["Ctrl+,", "Settings"],
    ["Ctrl+B", "Toggle sidebar"],
    ["Ctrl+`", "Toggle console"],
    ["F11", "Fullscreen"],
    ["Esc", "Close overlays"],
  ];
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <h3>Keyboard · Windows</h3>
        <div className="muted" style={{ marginBottom: 12 }}>Primary chords are Ctrl. ⌘ is accepted on macOS hosts.</div>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
          {rows.map(([k, v]) => (
            <><span className="kbd" key={k}>{k}</span><span className="muted" key={v}>{v}</span></>
          ))}
        </div>
        <div className="actions"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
