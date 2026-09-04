"""MJ evolution service — JSON-lines **stdio** server.

This is the canonical transport. MJ's stated architecture is "no HTTP sidecar on
127.0.0.1"; `server.py` (FastAPI) is retained only as an optional convenience for
running the optimiser outside the desktop app and is not used by MJ.

The Rust host (`src-tauri/src/hermes.rs`) spawns this module, writes one JSON object
per line, and reads one JSON object per line back.

Protocol
--------
Request  ``{"cmd": "ping"}``
Response ``{"ok": true, "transport": "stdio", "engine": "dspy+gepa", "available": bool,
             "reason": str | null}``

Request  ``{"cmd": "score_fitness", "task_input": str, "expected_behavior": str,
             "agent_output": str, "skill_text": str}``
Response ``{"ok": true, "composite": float, "correctness": float,
             "procedureFollowing": float, "conciseness": float, "lengthPenalty": float,
             "source": "python" | "fallback", "feedback": str}``

Request  ``{"cmd": "propose", "current": str, "kind": str, "trigger": str,
             "traces": [...], "iterations": int, "baseline_score": float, "model": str}``
Response ``{"ok": true, "candidate": {...}}`` or ``{"ok": false, "error": str}``

`score_fitness` deliberately degrades to a pure-Python mirror of the TypeScript
`scoreFitness` in `src/domain/evolutionEngine.ts` when the optional optimiser is not
installed, so the gate arithmetic stays identical whether or not the optimiser is
present. It never invents a candidate score for the caller to trust as measured.
"""

from __future__ import annotations

import json
import sys
from typing import Any

MAX_SKILL_SIZE = 15_000

# Must match EVOLUTION_CONFIG in src/domain/evolutionEngine.ts.
_TBLITE_REGRESSION_THRESHOLD = 0.02
_HOLDOUT_THRESHOLD = 0.45


def _clamp01(n: float) -> float:
    return max(0.0, min(1.0, n))


def _skill_fitness_metric(expected_behavior: str, agent_output: str) -> float:
    if not agent_output.strip():
        return 0.0
    expected = set(expected_behavior.lower().split())
    output = set(agent_output.lower().split())
    if not expected:
        return 0.5
    overlap = sum(1 for w in expected if w in output)
    return _clamp01(0.3 + 0.7 * (overlap / len(expected)))


def _length_penalty(size: int, max_size: int) -> float:
    ratio = size / max(1, max_size)
    if ratio <= 0.9:
        return 0.0
    return min(0.3, (ratio - 0.9) * 3.0)


def score_fitness(msg: dict[str, Any]) -> dict[str, Any]:
    """Mirror of the TypeScript composite: 0.5c + 0.3p + 0.2conc - lengthPenalty."""
    expected = str(msg.get("expected_behavior") or "")
    output = str(msg.get("agent_output") or "")
    skill = str(msg.get("skill_text") or "")

    correctness = _skill_fitness_metric(expected, output)
    procedure = _skill_fitness_metric(expected, output) if not skill else _skill_fitness_metric(
        expected, output
    )
    if len(output) > 4000:
        conciseness = 0.4
    elif len(output) < 40:
        conciseness = 0.5
    else:
        conciseness = 0.8
    penalty = _length_penalty(len(skill), MAX_SKILL_SIZE)
    composite = max(0.0, 0.5 * correctness + 0.3 * procedure + 0.2 * conciseness - penalty)

    return {
        "ok": True,
        "composite": round(composite, 6),
        "correctness": round(correctness, 6),
        "procedureFollowing": round(procedure, 6),
        "conciseness": round(conciseness, 6),
        "lengthPenalty": round(penalty, 6),
        "holdoutThreshold": _HOLDOUT_THRESHOLD,
        "regressionThreshold": _TBLITE_REGRESSION_THRESHOLD,
        "source": "python",
        "feedback": (
            "Low keyword overlap with expected behavior. Tighten the procedure and name the done-when."
            if correctness < 0.5
            else "Procedure coverage is acceptable. Prefer smaller, evidenced edits."
        ),
    }


def handle(msg: dict[str, Any]) -> dict[str, Any]:
    cmd = msg.get("cmd")
    if cmd == "ping":
        from . import __version__

        try:
            from .evolve import MJEvolver  # noqa: F401
            import gepa  # noqa: F401
            import litellm  # noqa: F401  # LLM backend gepa uses to run the task/reflection LMs

            if not callable(getattr(gepa, "optimize", None)):
                raise ImportError("gepa.optimize() is unavailable (unsupported gepa version)")
            available, reason = True, None
        except Exception as exc:  # pragma: no cover - depends on optional deps
            available, reason = False, str(exc)
        return {
            "ok": True,
            "transport": "stdio",
            "engine": "dspy+gepa",
            "version": __version__,
            "available": available,
            "reason": reason,
        }
    if cmd == "score_fitness":
        return score_fitness(msg)
    if cmd == "propose":
        from .evolve import MJEvolver

        try:
            evolver = MJEvolver(model=msg.get("model") or "gpt-4o")
            candidate = evolver.propose(
                current=str(msg.get("current") or ""),
                kind=str(msg.get("kind") or "skill"),
                trigger=str(msg.get("trigger") or "runtime proposal"),
                traces=list(msg.get("traces") or []),
                iterations=int(msg.get("iterations") or 6),
                baseline_score=float(msg.get("baseline_score") or 7.0),
            )
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        from dataclasses import asdict

        return {"ok": True, "candidate": asdict(candidate)}
    return {"ok": False, "error": f"unknown cmd: {cmd!r}"}


def main() -> int:
    """Read JSON lines from stdin until EOF, one JSON line out per line in."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(json.dumps({"ok": False, "error": f"bad json: {exc}"}) + "\n")
            sys.stdout.flush()
            continue
        try:
            out = handle(msg)
        except Exception as exc:  # pragma: no cover
            out = {"ok": False, "error": str(exc)}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
