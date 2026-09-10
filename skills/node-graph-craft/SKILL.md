---
name: node-graph-craft
description: How to design and evaluate MJ's canvas — node cards, ports and wires as a clear, premium connection language — for any request touching the workflow canvas, node appearance, or wiring UX.
---

# Node Graph Craft — the connection language

A node editor is premium when the *graph* reads instantly: what runs, what
is connected, where the wire lands. Nodes are instruments, not boxes.

## Node card anatomy

1. **Quiet plate, live frame.** Rest: neutral surface, hairline border,
   subtle elevation. State lives on the frame: running/error/done tint the
   border and the icon tile; the category spine (left edge) is the identity
   mark — signal color for agents/controls, quiet ink otherwise.
2. **Icon tile.** The glyph sits in a soft tile that wakes with state
   (accent-dim fill while running). Icons: uniform stroke, no fills, no
   decorative chips.
3. **Readable content.** Title ≥ 13px semibold; purpose clamps to two lines
   and reads in real type; stream preview is visually framed; meta is one
   quiet dot-separated line — never chip clutter.
4. **Ports are the affordance.** Type-colored rings that SIT ON the card
   edge (half-straddling) so every wire visibly lands on its anchor.
   Connected = filled with the signal + soft ring. Empty = ring with the
   port type. Hover/valid target = fills, scales 1.1–1.2, pulses gently.
   Port rows ≥ 20px tall with roomy labels; the label lights on row hover.

## Wires

5. **Legible paths.** Data-type hue at rest; status widths: active/streaming
   are slightly thicker with a slow directional flow, error is alert hue,
   completed brightens. Hover thickens and adds a soft glow (a single
   `<filter>`), never a neon tube.
6. **The join is explicit.** Endpoints meet the anchor's reach stub at the
   card edge. Ghost wire snaps to valid targets within a real radius and
   shows the ring; invalid targets dim — never offer a wire the graph would
   refuse.
7. **Feedback on connect.** Port fills, ring flashes, mid-dot appears —
   one 200–300ms confirmation, then quiet.

## Evaluation checklist

Cover the canvas with sample nodes + wires: can you tell connected vs open,
running vs failed, source vs target — without reading a single label? If
not, the craft failed. Then toggle `prefers-reduced-motion`: all pulses and
flows must stop; state must remain readable in hue alone.

## When this skill applies

Requests touching the canvas, nodes, ports, wires, minimap, or "the nodes
don't look designed".
