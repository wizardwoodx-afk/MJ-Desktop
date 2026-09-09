import { parseCron, nextRun, decideTick, describe } from "../cron.js";
let pass = 0, fail = 0;
const ok = (c, m, extra = "") => { if (c) { pass++; } else { fail++; console.log("  FAIL " + m + (extra ? " — " + extra : "")); } };
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };

console.log("== parsing ==");
const a = parseCron("0 9 * * 1-5");
ok(a.minute.has(0) && a.minute.size === 1, "minute is exactly 0");
ok(a.hour.has(9) && a.hour.size === 1, "hour is exactly 9");
ok(a.dayOfWeek.size === 5 && a.dayOfWeek.has(1) && a.dayOfWeek.has(5) && !a.dayOfWeek.has(0), "dow is Mon-Fri");
ok(parseCron("*/15 * * * *").minute.size === 4, "*/15 yields 4 minutes");
ok(parseCron("5,10 * * * *").minute.size === 2, "list yields 2 minutes");

console.log("== refusal (a routine that silently never fires is the bug) ==");
ok(/expected 5 fields/.test(throws(() => parseCron("* * *")) ?? ""), "too few fields refused", throws(() => parseCron("* * *")));
ok(/not an integer/.test(throws(() => parseCron("x * * * *")) ?? ""), "non-integer refused");
ok(/out of range/.test(throws(() => parseCron("99 * * * *")) ?? ""), "out-of-range refused");
ok(/matches no time within a year/.test(throws(() => nextRun("0 0 30 2 *")) ?? ""), "Feb 30 refused, not looped");
ok(/start 5 > end 1/.test(throws(() => parseCron("5-1 * * * *")) ?? ""), "inverted range refused");

console.log("== nextRun is exact ==");
const from = new Date("2026-09-09T08:59:30Z");
const n = nextRun("0 9 * * *", from);
ok(n.getUTCMinutes() === 0 && n.getUTCHours() === 9, "next 09:00 after 08:59:30", n.toISOString());
ok(nextRun("0 9 * * *", new Date("2026-09-09T09:00:00Z")).getUTCDate() === 10, "exactly 09:00 rolls to tomorrow");

console.log("== skip-if-busy ==");
ok(decideTick({ running: true, expr: "* * * * *" }).fire === false, "running routine never overlaps");
ok(/dropped, not queued/.test(decideTick({ running: true, expr: "* * * * *" }).reason), "and says the tick was dropped");
ok(decideTick({ running: false, lastRunAt: new Date(Date.now() - 120_000), now: new Date(), expr: "* * * * *" }).fire === true, "idle + due fires");
ok(decideTick({ running: false, lastRunAt: new Date(), now: new Date(), expr: "0 9 * * *" }).fire === false, "not due does not fire");

console.log("== describe ==");
ok(/every minute/.test(describe("* * * * *")), "describes every-minute");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
