---
name: ui-premium-craft
description: How to make MJ's interface feel premium, natural and professional — visual-system discipline (whitespace, type hierarchy, restraint, color-as-state, warmth on black) to apply whenever restyling MJ's UI, reviewing its design, or adding screens.
---

# UI Premium Craft — the MJ design doctrine

MJ's premium feel comes from *frame*, not paint: whitespace, type hierarchy,
restraint and motion rhythm. Research consistently ranks whitespace and type
as the largest perceived-value signals; color and decoration are last.
Rule of thumb for every change: remove 30% of what you think is needed, then
check the hierarchy still speaks.

## Operating rules

1. **Whitespace is strategy, not emptiness.** Give cards, sections and rows
   real air. If a layout feels cramped, fix spacing before adding anything.
   Page gutters ≥ 32px, card padding ≥ 20px, stacked cards separated by
   ≥ 12px, controls in rows spaced ≥ 10px.
2. **Type carries hierarchy.** Body copy is a real text face (Inter) at
   ≥ 12.5px with comfortable line-height (≥ 1.55). Monospace is reserved for
   *data and identifiers*, never paragraphs. Labels may be small but must
   stay legible and never shout in ALL CAPS except true instrument chrome.
   Two families max; weight contrast over size contrast.
3. **Restraint over decoration.** No gradients in chrome, no glow-stacks, no
   borders around everything — separate surfaces with background tone, keep
   borders as hairlines. One accent at a time, used like a seal: selection,
   primary action, live signal.
4. **Color means state.** The signal color says "look here now": running,
   selected, connected, primary CTA. Idle UI is neutral. Error and success
   are their own hues and never compete with the signal.
5. **Warmth on black.** The dark ground is black but the ink is warm
   (parchment/ivory), never pure white — that is what keeps stark minimalism
   from feeling clinical. Textures: soft technical radii (8–14px), hairline
   separation, ink-mix elevation. Nothing glossy, nothing glowing.
6. **Deep, calm surfaces.** Elevation is subtle: inset highlight + soft
   diffuse shadow, not harsh drop shadows. Hover moves 1–2px and deepens the
   shadow; it never jumps.
7. **Consistency is the product.** One token set, one component voice per
   pattern (buttons, cards, chips, tables, the rail). If a pattern exists,
   extend it; do not invent a sibling.

## Do / don't

- DO lead every redesign with spacing and type; DO use serif/display only
  for hero moments; DO keep focus rings visible; DO prefer `color-mix`
  derived tones so palettes cannot drift.
- DON'T add AI-default colors (violet, electric cyan, neon gradients),
  DON'T animate width/height/top/left, DON'T animate beyond 300ms for
  feedback, DON'T ship motion that ignores `prefers-reduced-motion`.

## When this skill applies

Any request containing: "make it premium", "UI redesign", "looks cheap /
not production", "better visual", "restyle", or design review of MJ screens.
