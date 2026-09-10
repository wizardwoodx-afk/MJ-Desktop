/**
 * MJ 14.0 — Fleet Assurance Score (suite #77).
 *
 * §1 the refusal: no measured runs → unevaluated (simulated runs teach nothing)
 * §2 the ceiling: perfect measured evidence scores 100/A and the factor maxes sum to 100
 * §3 monotonicity: more cross-vendor verification never lowers the score
 * §4 dilution: labeled-simulation runs weaken assurance, never add to it
 * §5 banding + the integrity and feedback factors
 */
import {
  scoreAssurance,
  type AssuranceInput,
} from "../src/mission/assuranceScore";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}\n`);
}

const perfect: AssuranceInput = {
  measuredRuns: 10,
  simulatedRuns: 0,
  crossVendorVerifiedRuns: 10,
  sameVendorVerifiedRuns: 0,
  arenaPassRuns: 10,
  budgetAdherences: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  egressViolations: 0,
  feedbackRatings: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
};

/* ── 1. the refusal ── */
section("1. no evidence, no score");
{
  const s = scoreAssurance({ ...perfect, measuredRuns: 0, simulatedRuns: 7 });
  ok("zero measured runs → unevaluated", s.status === "unevaluated");
  ok("no score and no band are produced", s.score === null && s.band === null);
  ok("the refusal says why", (s.unevaluatedReason ?? "").includes("refuses"));
}

/* ── 2. the ceiling ── */
section("2. perfect evidence → 100 / A, factors sum to 100");
{
  const s = scoreAssurance(perfect);
  ok("status evaluated", s.status === "evaluated");
  ok("score is 100", s.score === 100, String(s.score));
  ok("band A", s.band === "A");
  const maxSum = s.factors.reduce((a, f) => a + f.max, 0);
  ok("factor maxes sum to 100", maxSum === 100, String(maxSum));
  ok("every factor names itself", s.factors.every((f) => f.name.length > 0 && f.note.length > 0));
  ok("full coverage with no simulations", s.evidenceCoverage === 1);
}

/* ── 3. monotonicity ── */
section("3. more verification never lowers the score");
{
  const weak = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 4, sameVendorVerifiedRuns: 6 });
  const strong = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 8, sameVendorVerifiedRuns: 2 });
  ok("cross-vendor share up → score up (or equal)", (strong.score ?? 0) >= (weak.score ?? 0), `${weak.score} -> ${strong.score}`);
  ok("cross-vendor beats same-vendor at equal totals", (strong.score ?? 0) > (weak.score ?? 0));

  const noVerify = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 0, sameVendorVerifiedRuns: 0 });
  ok("unverified work caps the verification factor at 0", (noVerify.factors.find((f) => f.name === "verification")?.points ?? -1) === 0);
}

/* ── 4. dilution ── */
section("4. simulation dilutes assurance");
{
  const clean = scoreAssurance(perfect);
  const diluted = scoreAssurance({ ...perfect, simulatedRuns: 10 });
  ok("equal simulated to measured → half coverage", diluted.evidenceCoverage === 0.5, String(diluted.evidenceCoverage));
  ok("diluted score is lower", (diluted.score ?? 0) < (clean.score ?? 0), `${clean.score} -> ${diluted.score}`);
  ok("simulation never RAISES a score", (diluted.score ?? 0) <= (clean.score ?? 0));
  const allFake = scoreAssurance({ ...perfect, measuredRuns: 1, simulatedRuns: 999 });
  ok("mostly-simulated fleets crater toward zero", (allFake.score ?? 0) <= Math.round((clean.score ?? 0) * (1 / 1000)) + 1, String(allFake.score));
}

/* ── 5. bands + integrity + feedback ── */
section("5. bands, egress integrity, human feedback");
{
  const s = scoreAssurance({ ...perfect, egressViolations: 1, feedbackRatings: [3] });
  const integrity = s.factors.find((f) => f.name === "egress integrity");
  ok("one violation costs 5 of 15", integrity?.points === 10, JSON.stringify(integrity));
  const feedback = s.factors.find((f) => f.name === "human feedback");
  ok("mean rating 3 → 6 of 10", feedback?.points === 6, JSON.stringify(feedback));

  const mid = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 5, sameVendorVerifiedRuns: 5, arenaPassRuns: 5 });
  ok("mid evidence bands B or C", mid.band === "B" || mid.band === "C", `${mid.score} -> ${mid.band}`);
  ok("band thresholds are monotone in the score", (mid.score ?? 0) < 85);

  const budgetBlind = scoreAssurance({ ...perfect, budgetAdherences: [] });
  ok("no measurable budgets → budget factor 0 with an honest note", (budgetBlind.factors.find((f) => f.name === "budget discipline")?.points ?? -1) === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
