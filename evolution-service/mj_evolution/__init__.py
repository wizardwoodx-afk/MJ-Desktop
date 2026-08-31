"""MJ self-evolution service.

Implements the Hermes-style reflective evolution pipeline on top of
DSPy + GEPA:

    Execution Trace
      -> Experience Extraction
      -> Evaluation Dataset Generation
      -> Candidate Generation (GEPA)
      -> Constraint Gates
      -> Holdout Evaluation
      -> Regression Testing
      -> Semantic Preservation
      -> Accept / Reject
      -> Versioned Artifact

No "failure -> rewrite -> save". Every accepted candidate must pass gates.
"""

__version__ = "0.4.0"
