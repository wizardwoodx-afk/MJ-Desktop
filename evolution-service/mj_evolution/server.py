"""MJ evolution service — HTTP JSON-RPC endpoint.

The MJ Rust runtime (and Localhost backend) POST candidate-generation jobs here.
Run with:  mj-evolve-server --port 5179
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from mj_evolution.evolve import MJEvolver

app = FastAPI(title="MJ Evolution Service", version="0.4.0")

_evolver: MJEvolver | None = None


class ProposeRequest(BaseModel):
    current: str
    kind: str = "skill"
    trigger: str = "repeated validation failures"
    traces: list[dict[str, Any]] = []
    iterations: int = 6
    baseline_score: float = 7.0
    model: str = "gpt-4o"


@app.post("/propose")
def propose(req: ProposeRequest):
    global _evolver
    if _evolver is None:
        _evolver = MJEvolver(model=req.model)
    try:
        candidate = _evolver.propose(
            current=req.current, kind=req.kind, trigger=req.trigger,
            traces=req.traces, iterations=req.iterations, baseline_score=req.baseline_score,
        )
        return json.loads(json.dumps(candidate.__dict__))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/health")
def health():
    return {"status": "ok", "engine": "dspy+gepa", "ready": _evolver is not None}


def main(argv: list[str] | None = None) -> None:
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5179)


if __name__ == "__main__":
    main()
