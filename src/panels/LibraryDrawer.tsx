import { useMemo, useState } from "react";
import { CATEGORY_LABEL, NODE_DEFINITIONS } from "../domain/nodeLibrary";
import { iconFor } from "../canvas/icons";

export function LibraryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = NODE_DEFINITIONS.filter((d) => {
      if (!query) return true;
      return `${d.title} ${d.id} ${d.description} ${d.group ?? ""}`.toLowerCase().includes(query);
    });
    const agents = list.filter((d) => d.category === "agent");
    const byIndustry = new Map<string, typeof agents>();
    for (const d of agents) {
      const g = d.group && d.group !== "v3" && d.group !== "presets" ? d.group : "core";
      const arr = byIndustry.get(g) ?? [];
      arr.push(d);
      byIndustry.set(g, arr);
    }
    const industryOrder = ["core", "presets", ...Array.from(byIndustry.keys()).filter((k) => k !== "core" && k !== "presets").sort()];
    return {
      industries: industryOrder.filter((k) => byIndustry.has(k)).map((k) => ({ cat: k, items: byIndustry.get(k)! })),
      control: list.filter((d) => d.category === "control"),
      capability: list.filter((d) => d.category === "capability"),
    };
  }, [q]);

  return (
    <aside className={`library-drawer ${open ? "open" : ""}`}>
      <div className="drawer-head">
        Hermes agents
        <button className="ghost" onClick={onClose}>Esc</button>
      </div>
      <div className="lib-search">
        <input className="lib-search-input" placeholder="Search identities, industries…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={open} />
      </div>
      <div className="lib-list">
        {groups.industries.map((g) => (
          <div key={g.cat}>
            <div className="lib-cat">Agents · {g.cat} · {g.items.length}</div>
            {g.items.map((d) => (
              <LibItem key={d.id} d={d} />
            ))}
          </div>
        ))}
        {groups.control.length > 0 && (
          <div>
            <div className="lib-cat">{CATEGORY_LABEL.control} · {groups.control.length}</div>
            {groups.control.map((d) => <LibItem key={d.id} d={d} />)}
          </div>
        )}
        {groups.capability.length > 0 && (
          <div>
            <div className="lib-cat">{CATEGORY_LABEL.capability} · {groups.capability.length}</div>
            {groups.capability.map((d) => <LibItem key={d.id} d={d} />)}
          </div>
        )}
        {groups.industries.length === 0 && groups.control.length === 0 && <div className="lib-empty muted">No nodes match.</div>}
      </div>
    </aside>
  );
}

function LibItem({ d }: { d: (typeof NODE_DEFINITIONS)[number] }) {
  return (
    <div
      className={`lib-item ${d.category}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/mj-node", d.id);
        e.dataTransfer.setData("text/plain", d.id);
      }}
      onClick={() => {
        window.dispatchEvent(new CustomEvent("mj:add-node", { detail: d.id }));
      }}
    >
      <span className="icon">{iconFor(d.icon)}</span>
      <div>
        <div className="name">{d.title}</div>
        <div className="desc">{d.description}</div>
      </div>
    </div>
  );
}
