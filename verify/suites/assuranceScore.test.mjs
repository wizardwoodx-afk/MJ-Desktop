import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/assuranceScore.ts
var round2 = (n) => Math.round(n * 100) / 100;
var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function scoreAssurance(i) {
  if (!Number.isFinite(i.measuredRuns) || i.measuredRuns <= 0) {
    return {
      status: "unevaluated",
      score: null,
      band: null,
      evidenceCoverage: null,
      factors: [],
      unevaluatedReason: "No measured runs \u2014 the score refuses to exist without evidence (simulated runs teach nothing)."
    };
  }
  const measured = i.measuredRuns;
  const factors = [];
  const cvRatio = clamp(i.crossVendorVerifiedRuns / measured, 0, 1);
  const svRatio = clamp(i.sameVendorVerifiedRuns / measured, 0, 1);
  const verificationPoints = cvRatio === 1 ? 35 : round2(25 * cvRatio + Math.min(10, 10 * svRatio));
  factors.push({
    name: "verification",
    points: verificationPoints,
    max: 35,
    note: cvRatio === 1 ? "100% cross-vendor verified \u2014 the full factor" : `${Math.round(cvRatio * 100)}% cross-vendor verified (25 pts), ${Math.round(svRatio * 100)}% same-vendor (capped 10)`
  });
  const arenaRatio = clamp(i.arenaPassRuns / measured, 0, 1);
  factors.push({
    name: "governance arena",
    points: round2(20 * arenaRatio),
    max: 20,
    note: `${Math.round(arenaRatio * 100)}% of measured runs passed the arena preflight`
  });
  const measurable = i.budgetAdherences.filter((a) => a !== null);
  const budgetCoverage = clamp(measurable.length / measured, 0, 1);
  const meanAdherence = measurable.length > 0 ? measurable.reduce((a, b) => a + b, 0) / measurable.length : 0;
  factors.push({
    name: "budget discipline",
    points: round2(20 * meanAdherence * budgetCoverage),
    max: 20,
    note: measurable.length === 0 ? "no mission reported measured spend against a cap" : `mean adherence ${round2(meanAdherence)} over ${measurable.length}/${measured} measurable missions`
  });
  const integrityPoints = round2(clamp(15 - 5 * i.egressViolations, 0, 15));
  factors.push({
    name: "egress integrity",
    points: integrityPoints,
    max: 15,
    note: i.egressViolations === 0 ? "no egress-gate violations on record" : `${i.egressViolations} violation(s) on record`
  });
  const feedbackMean = i.feedbackRatings.length > 0 ? i.feedbackRatings.reduce((a, b) => a + b, 0) / i.feedbackRatings.length : 0;
  factors.push({
    name: "human feedback",
    points: round2(clamp(2 * feedbackMean, 0, 10)),
    max: 10,
    note: i.feedbackRatings.length === 0 ? "no human ratings yet" : `mean rating ${round2(feedbackMean)} over ${i.feedbackRatings.length} cycle(s)`
  });
  const raw = round2(factors.reduce((a, f) => a + f.points, 0));
  const coverage = clamp(measured / (measured + Math.max(0, i.simulatedRuns)), 0, 1);
  const score = Math.round(clamp(raw * coverage, 0, 100));
  const band = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  return { status: "evaluated", score, band, evidenceCoverage: round2(coverage), factors };
}

// probe/assuranceScore.test.ts
var pass = 0;
var fail = 0;
function ok(label, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}
`);
}
var perfect = {
  measuredRuns: 10,
  simulatedRuns: 0,
  crossVendorVerifiedRuns: 10,
  sameVendorVerifiedRuns: 0,
  arenaPassRuns: 10,
  budgetAdherences: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  egressViolations: 0,
  feedbackRatings: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
};
section("1. no evidence, no score");
{
  const s = scoreAssurance({ ...perfect, measuredRuns: 0, simulatedRuns: 7 });
  ok("zero measured runs \u2192 unevaluated", s.status === "unevaluated");
  ok("no score and no band are produced", s.score === null && s.band === null);
  ok("the refusal says why", (s.unevaluatedReason ?? "").includes("refuses"));
}
section("2. perfect evidence \u2192 100 / A, factors sum to 100");
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
section("3. more verification never lowers the score");
{
  const weak = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 4, sameVendorVerifiedRuns: 6 });
  const strong = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 8, sameVendorVerifiedRuns: 2 });
  ok("cross-vendor share up \u2192 score up (or equal)", (strong.score ?? 0) >= (weak.score ?? 0), `${weak.score} -> ${strong.score}`);
  ok("cross-vendor beats same-vendor at equal totals", (strong.score ?? 0) > (weak.score ?? 0));
  const noVerify = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 0, sameVendorVerifiedRuns: 0 });
  ok("unverified work caps the verification factor at 0", (noVerify.factors.find((f) => f.name === "verification")?.points ?? -1) === 0);
}
section("4. simulation dilutes assurance");
{
  const clean = scoreAssurance(perfect);
  const diluted = scoreAssurance({ ...perfect, simulatedRuns: 10 });
  ok("equal simulated to measured \u2192 half coverage", diluted.evidenceCoverage === 0.5, String(diluted.evidenceCoverage));
  ok("diluted score is lower", (diluted.score ?? 0) < (clean.score ?? 0), `${clean.score} -> ${diluted.score}`);
  ok("simulation never RAISES a score", (diluted.score ?? 0) <= (clean.score ?? 0));
  const allFake = scoreAssurance({ ...perfect, measuredRuns: 1, simulatedRuns: 999 });
  ok("mostly-simulated fleets crater toward zero", (allFake.score ?? 0) <= Math.round((clean.score ?? 0) * (1 / 1e3)) + 1, String(allFake.score));
}
section("5. bands, egress integrity, human feedback");
{
  const s = scoreAssurance({ ...perfect, egressViolations: 1, feedbackRatings: [3] });
  const integrity = s.factors.find((f) => f.name === "egress integrity");
  ok("one violation costs 5 of 15", integrity?.points === 10, JSON.stringify(integrity));
  const feedback = s.factors.find((f) => f.name === "human feedback");
  ok("mean rating 3 \u2192 6 of 10", feedback?.points === 6, JSON.stringify(feedback));
  const mid = scoreAssurance({ ...perfect, crossVendorVerifiedRuns: 5, sameVendorVerifiedRuns: 5, arenaPassRuns: 5 });
  ok("mid evidence bands B or C", mid.band === "B" || mid.band === "C", `${mid.score} -> ${mid.band}`);
  ok("band thresholds are monotone in the score", (mid.score ?? 0) < 85);
  const budgetBlind = scoreAssurance({ ...perfect, budgetAdherences: [] });
  ok("no measurable budgets \u2192 budget factor 0 with an honest note", (budgetBlind.factors.find((f) => f.name === "budget discipline")?.points ?? -1) === 0);
}
console.log(`
${pass} passed, ${fail} failed
`);
if (fail > 0) process.exit(1);
