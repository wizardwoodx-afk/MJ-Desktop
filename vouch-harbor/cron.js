/* Vouch Harbor — the scheduler MJ does not have.
 *
 * MJ's `cap.cron` is a declaration: since 14.1.3 it refuses rather than silently
 * pretending to fire. This is the implementation that makes a Routine real.
 *
 * Contract, and the reasons for it:
 *   - 5-field cron (minute hour dom month dow). No seconds, no @reboot, no "L" or
 *     "W" — a parser that half-supports a syntax is worse than one that refuses it.
 *   - Anything unparseable throws with the offending field named. A routine that
 *     silently never fires is the failure this module exists to prevent.
 *   - nextRun() is pure and testable: same inputs, same answer, no clock reads
 *     except the `from` you pass.
 *   - Skip-if-busy is explicit: a run still in flight is never overlapped and
 *     never queued. Overlapping runs are how an agent double-spends.
 */

const FIELDS = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
const RANGES = { minute: [0, 59], hour: [0, 23], dayOfMonth: [1, 31], month: [1, 12], dayOfWeek: [0, 6] };

export function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron: expected 5 fields, got ${parts.length} in "${expr}"`);
  }
  const out = {};
  for (let i = 0; i < 5; i++) {
    const [name] = FIELDS.slice(i);
    const [lo, hi] = RANGES[name];
    out[name] = parseField(parts[i], lo, hi, name, expr);
  }
  return out;
}

function parseField(text, lo, hi, name, expr) {
  const values = new Set();
  for (const chunk of text.split(",")) {
    if (!chunk) throw new Error(`cron: empty list item in ${name} field of "${expr}"`);
    let [rangePart, stepPart] = chunk.split("/");
    let step = 1;
    if (stepPart !== undefined) {
      step = Number(stepPart);
      if (!Number.isInteger(step) || step < 1) {
        throw new Error(`cron: step must be a positive integer in ${name} field ("${chunk}") of "${expr}"`);
      }
    }
    let from = lo, to = hi;
    if (rangePart === "*") { /* whole range */ }
    else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      from = num(a, name, expr); to = num(b, name, expr);
      if (from > to) throw new Error(`cron: range start ${from} > end ${to} in ${name} field of "${expr}"`);
    } else {
      from = to = num(rangePart, name, expr);
    }
    if (from < lo || to > hi) {
      throw new Error(`cron: ${name} value out of range ${lo}-${hi} in "${chunk}" of "${expr}"`);
    }
    for (let v = from; v <= to; v += step) values.add(v);
  }
  if (!values.size) throw new Error(`cron: ${name} field of "${expr}" matches nothing`);
  return values;
}

function num(s, name, expr) {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`cron: "${s}" is not an integer in the ${name} field of "${expr}"`);
  return n;
}

/**
 * The next instant strictly after `from` that the expression matches.
 * Bounded search: a year of minutes. An expression that matches nothing in a
 * year (Feb 30, and similar) throws rather than looping forever.
 */
export function nextRun(expr, from = new Date()) {
  const spec = typeof expr === "string" ? parseCron(expr) : expr;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (spec.month.has(d.getMonth() + 1) &&
        spec.dayOfMonth.has(d.getDate()) &&
        spec.dayOfWeek.has(d.getDay()) &&
        spec.hour.has(d.getHours()) &&
        spec.minute.has(d.getMinutes())) {
      return d;
    }
    d.setMinutes(d.getMinutes() + 1);
  }
  throw new Error("cron: expression matches no time within a year — refusing to schedule it");
}

/**
 * Skip-if-busy. A routine that is still running is not overlapped and not
 * queued: the tick is dropped and the reason is recorded, because a silent
 * double-run is how an agent pays twice.
 */
export function decideTick({ running, lastRunAt, now = new Date(), expr }) {
  if (running) return { fire: false, reason: "previous run still in flight — tick dropped, not queued" };
  const due = nextRun(expr, lastRunAt ?? new Date(now.getTime() - 86_400_000));
  if (due.getTime() > now.getTime()) return { fire: false, reason: `not due — next at ${due.toISOString()}` };
  return { fire: true, reason: "due", due };
}

export function describe(expr) {
  const s = parseCron(expr);
  const all = (set, lo, hi) => set.size === hi - lo + 1;
  const bits = [];
  bits.push(all(s.minute, 0, 59) ? "every minute" : `minute ${[...s.minute].slice(0, 4).join("/")}`);
  bits.push(all(s.hour, 0, 23) ? "every hour" : `hour ${[...s.hour].slice(0, 4).join("/")}`);
  return bits.join(", ");
}
