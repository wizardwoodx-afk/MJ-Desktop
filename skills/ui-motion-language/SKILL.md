---
name: ui-motion-language
description: The MJ motion vocabulary — purposeful, natural-feeling animation rules (timing, easing, reduced-motion, what may animate and what may not) to use whenever adding or tuning animations in MJ's interface.
---

# UI Motion Language — natural, purposeful, quiet

Motion in MJ is communication, not performance. Natural motion follows
acceleration and deceleration: it starts, eases into place, and settles.
Linear motion feels robotic; springs feel gimmicky when overused. Calm
products animate less but better.

## The vocabulary

1. **Timing.** Feedback 120–180ms. Entrances and state changes 200–320ms.
   Anything over 400ms is a progress narrative, not an interaction.
2. **Easing.** Default: a deceleration curve (`cubic-bezier(0.22, 1, 0.36,
   1)`) for things arriving. Exit/feedback may use a faster
   `cubic-bezier(0.2, 0, 0, 1)`. A *restrained* spring (small overshoot)
   is allowed only for emphasis: port connect, toast, selected ring.
3. **Layout motion uses only `transform` and `opacity`** — never width,
   height, top, left, margin; layout animation is jank, and transform keeps
   the GPU path. **Visual-state transitions may also animate paint
   properties** — box-shadow, border-color, background, color, stroke and
   fill — because they do not trigger layout; keep them short (≤ 200ms)
   and use them for state, not entrance. Prefer `will-change` only
   briefly, never as a persistent style.
4. **Micro-interactions that earn their place:**
   - hover: lift 1–2px + deeper shadow + border/ink shift (140–180ms);
   - press: 0.5–1px settle (60–120ms);
   - focus: visible ring, 120ms;
   - entrance: fade + 6–9px rise, staggered 30–50ms between siblings
     (max 4 steps);
   - state: selection ring, connection fill, lamp breathing, wire draw —
     the working view should *read* at a glance.
5. **Live signals breathe, not blink.** Running = a slow lamp/spine pulse
   (1.6–2.4s). Error = steady hue, no flashing.
6. **Reduced motion is law.** Every animation is wrapped or killed by
   `prefers-reduced-motion: reduce` — durations collapse, pulses stop,
   entrances become opacity-only or instant. Probes pin this.
7. **Consistency.** Reuse the shared keyframes and tokens (`--t-fast`,
   `--t-med`, `--rd-ease`, `--rd-spring`, `rd-rise`, `rd-pop`,
   `rd-port-pulse`, `mj-lamp`). New effects get named keyframes and are
   added to the reduced-motion kill-list.

## Do / don't

- DO animate on hover/focus/state change; DO stagger lists subtly; DO let
  connected ports and running nodes carry the accent.
- DON'T animate whole pages on a loop, DON'T bounce, DON'T spin
  indefinitely (except honest busy indicators), DON'T ship parallax or
  scroll-jacking in chrome.

## When this skill applies

Any request containing: "more animations", "smooth transitions", "make it
feel alive", "better motion", or tuning of MJ entrance/hover/state effects.
