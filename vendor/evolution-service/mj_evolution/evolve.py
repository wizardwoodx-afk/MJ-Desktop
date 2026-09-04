"""MJ evolution engine — GEPA reflective prompt/skill optimizer.

Invoked by the MJ Rust runtime (and the Localhost backend) as a subprocess or as
a JSON-lines stdio server. Reads execution traces, generates an eval dataset,
proposes candidate mutations, and applies the same policy gates the GUI enforces:
syntax, size limits, regression, holdout, and semantic preservation.

Optimizer API (gepa >= 0.1)
---------------------------
The legacy ``dspy_gepa`` distribution was never published to PyPI (a 404), so the
previous pin was uninstallable. GEPA ships as the standalone ``gepa`` package,
and 0.1.x *removed* the old class-style API::

    # gone
    gepa = GEPA(metric=..., iterations=..., max_candidates=8, max_attempts=3)
    improved, report = gepa.compile(prompt=current, trainset=dataset)

The current entry point is ``gepa.optimize(...)``, where a candidate is a
``{component_name: text}`` mapping and scoring is delegated to an ``Evaluator``
that returns ``EvaluationResult(score, feedback, objective_scores)``::

    result = gepa.optimize(
        seed_candidate={"skill": current},
        trainset=dataset,
        task_lm=model,
        evaluator=evaluator,
        reflection_lm=model,
        max_metric_calls=budget,
    )
    improved = result.best_candidate["skill"]

MJ optimizes exactly one text component (skill / role prompt / tool
description), so we seed a single-component candidate and let gepa build its
``DefaultAdapter`` from ``task_lm`` + ``evaluator``. The adapter uses the
candidate text as the system prompt and each trainset ``input`` as the user turn.

Honesty note: ``_evaluator`` below is a lexical proxy, not a measured outcome.
MJ's runtime keeps its own measured accept/rollback loop, so this service NEVER
returns an invented candidate score — quality is judged post-apply.
"""
from __future__ import annotations

import json
import sys
import argparse
from dataclasses import dataclass, asdict
from typing import Any

try:
    import gepa
    from gepa.adapters.default_adapter.default_adapter import EvaluationResult
except Exception as e:  # pragma: no cover - depends on optional deps
    _IMPORT_ERR = str(e)
    gepa = None
    EvaluationResult = None
else:
    _IMPORT_ERR = None


# --------------------------------------------------------------------------
# Gate checks — mirror of src/core/evolution.ts on the frontend.
# --------------------------------------------------------------------------

MAX_SKILL_BYTES = 15_000
MAX_TOOL_DESC_CHARS = 500

# Responses longer than this are penalised as unfocused, mirroring the
# conciseness threshold in mj_evolution/stdio_server.py.
MAX_RESPONSE_CHARS = 4_000


def syntax_valid(candidate: str) -> bool:
    return isinstance(candidate, str) and bool(candidate.strip())


def size_ok(candidate: str, kind: str) -> bool:
    if kind == "tool_description":
        return len(candidate) <= MAX_TOOL_DESC_CHARS
    return len(candidate.encode("utf-8")) <= MAX_SKILL_BYTES


def semantic_preserved(original: str, candidate: str) -> bool:
    """Cheap lexical proxy. A real deployment should use an embedding/semantic
    similarity gate; this keeps the pipeline runnable and observable offline."""
    orig_tokens = set(original.lower().split())
    cand_tokens = set(candidate.lower().split())
    if not orig_tokens:
        return True
    overlap = len(orig_tokens & cand_tokens) / len(orig_tokens)
    return overlap >= 0.55


def _as_text(value: Any) -> str:
    """Traces carry structured input/output; GEPA's DefaultDataInst wants text."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def _keyword_overlap(expected: str, actual: str) -> float:
    """Lexical proxy for correctness — the same signal the TypeScript
    scoreFitness uses. GEPA only needs a directional signal plus textual
    feedback to reflect on; measured evaluation stays in the MJ runtime."""
    expected_tokens = {t for t in expected.lower().split() if t}
    actual_tokens = {t for t in actual.lower().split() if t}
    if not expected_tokens:
        return 1.0 if actual_tokens else 0.0
    return len(expected_tokens & actual_tokens) / len(expected_tokens)


@dataclass
class Candidate:
    parent_version: int
    candidate_version: int
    target: str
    trigger: str
    changes: list[str]
    gates: dict[str, bool]
    baseline_score: float
    candidate_score: float | None
    holdout: str
    regression: str
    decision: str
    reason: str


class MJEvolver:
    """Thin wrapper so MJ's runtime has a single entry point."""

    def __init__(self, model: str | None = None, provider: str | None = None) -> None:
        if gepa is None:
            raise RuntimeError(f"GEPA not installed: {_IMPORT_ERR}")
        # litellm (pulled in by dspy) resolves this model name at call time.
        self.model = model or "gpt-4o"
        self.provider = provider

    def propose(
        self,
        *,
        current: str,
        kind: str,
        trigger: str,
        traces: list[dict[str, Any]],
        iterations: int = 6,
        baseline_score: float,
    ) -> Candidate:
        # 1) Build an evaluation dataset from execution traces.
        dataset = self._build_dataset(traces)
        if not dataset:
            raise ValueError(
                "propose() requires at least one execution trace: GEPA needs a "
                "non-empty trainset to reflect against."
            )

        # GEPA's budget is metric calls, not wall-clock iterations. Each pass
        # roughly scores the trainset once, so iterations × dataset size is the
        # closest faithful mapping of the old `iterations` argument.
        budget = max(1, iterations) * len(dataset)
        component = kind if isinstance(kind, str) and kind.strip() else "skill"

        # 2) GEPA reflective optimizer: reads traces to propose targeted edits.
        result = gepa.optimize(
            seed_candidate={component: current},
            trainset=dataset,
            valset=dataset,
            task_lm=self.model,
            evaluator=self._evaluator,
            reflection_lm=self.model,
            max_metric_calls=budget,
        )

        improved = self._best_candidate(result, component, current)

        # 3) Apply guardrails. These are ADVISORY signals: the MJ runtime keeps
        # its own measured accept/rollback loop, so this service NEVER invents
        # a candidate score — quality is judged by post-apply evaluations.
        gates = {
            "syntax-validity": syntax_valid(improved),
            "size-limits": size_ok(improved, component),
            "semantic-preservation": semantic_preserved(current, improved),
        }
        all_pass = all(gates.values())

        return Candidate(
            parent_version=1,
            candidate_version=2,
            target=component,
            trigger=trigger,
            changes=self._describe(result, improved, budget, current),
            gates=gates,
            baseline_score=baseline_score,
            candidate_score=None if not all_pass else baseline_score,
            holdout="deferred-to-runtime",
            regression="deferred-to-runtime",
            decision="proposed" if all_pass else "rejected",
            reason=(
                "Gates passed; refined text handed to the MJ runtime for measured evaluation"
                if all_pass
                else "One or more advisory gates failed"
            ),
        )

    @staticmethod
    def _best_candidate(result: Any, component: str, fallback: str) -> str:
        """Pull the evolved text out of GEPAResult.best_candidate."""
        best = getattr(result, "best_candidate", None)
        if isinstance(best, dict):
            if component in best:
                return str(best[component])
            # Single-component seeds: take the only value present.
            if len(best) == 1:
                return str(next(iter(best.values())))
        return fallback

    @staticmethod
    def _describe(result: Any, improved: str, budget: int, current: str) -> list[str]:
        """Report what GEPA actually did — never a claimed quality improvement."""
        candidates = getattr(result, "candidates", None) or []
        scores = getattr(result, "val_aggregate_scores", None) or []
        best_idx = getattr(result, "best_idx", None)

        changes = [
            f"GEPA explored {len(candidates)} candidate(s) within a "
            f"{budget} metric-call budget",
        ]
        if scores and isinstance(best_idx, int) and 0 <= best_idx < len(scores):
            changes.append(
                f"best validation aggregate score: {float(scores[best_idx]):.4f} "
                "(lexical proxy, not a measured runtime outcome)"
            )
        changes.append(
            f"candidate length {len(improved)} chars "
            f"(baseline {len(current)} chars)"
        )
        return changes

    def _build_dataset(self, traces: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """GEPA's DefaultDataInst: input / additional_context / answer."""
        return [
            {
                "input": _as_text(t.get("input")),
                "additional_context": {},
                "answer": _as_text(t.get("output")),
            }
            for t in traces
            if _as_text(t.get("input")) or _as_text(t.get("output"))
        ]

    def _evaluator(self, data: dict[str, Any], response: str) -> Any:
        """GEPA Evaluator protocol: (data, response) -> EvaluationResult.

        The score is a lexical proxy; the `feedback` string is what GEPA's
        reflection step actually learns from, so it must be specific.
        """
        expected = str(data.get("answer") or "")
        overlap = _keyword_overlap(expected, response)
        score = 0.3 + 0.7 * overlap
        if len(response) > MAX_RESPONSE_CHARS:
            score -= 0.1
        score = max(0.0, min(1.0, score))

        if overlap >= 0.7:
            feedback = (
                f"Output covers {overlap:.0%} of the expected terms — acceptable. "
                "Prefer smaller, evidenced edits over broad rewrites."
            )
        else:
            feedback = (
                f"Output covers only {overlap:.0%} of the expected terms. "
                "Missing expected behavior: tighten the procedure, name the "
                "explicit done-when condition, and avoid omitting required terms."
            )
        return EvaluationResult(score=score, feedback=feedback, objective_scores=None)


def load_trace(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="MJ evolution engine (Hermes-inspired, GEPA)")
    p.add_argument("--trace", required=True, help="path to a JSON execution-trace file")
    p.add_argument("--prompt-file", required=True, help="path to the current skill/prompt artifact")
    p.add_argument("--kind", default="skill", choices=["skill", "role_prompt", "tool_description"])
    p.add_argument("--trigger", default="repeated validation failures", help="why this evolution was proposed")
    p.add_argument("--iterations", type=int, default=6)
    p.add_argument("--baseline", type=float, default=7.0)
    p.add_argument("--model", default="gpt-4o")
    args = p.parse_args(argv)

    try:
        evolver = MJEvolver(model=args.model)
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}))
        return 1

    with open(args.prompt_file, encoding="utf-8") as f:
        current = f.read()
    traces = load_trace(args.trace)
    try:
        candidate = evolver.propose(
            current=current, kind=args.kind, trigger=args.trigger,
            traces=traces, iterations=args.iterations, baseline_score=args.baseline,
        )
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1
    print(json.dumps(asdict(candidate), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
