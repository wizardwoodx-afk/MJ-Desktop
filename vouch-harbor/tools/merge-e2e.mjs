import fs from "node:fs";
import path from "node:path";
const CORE = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "mj-core.js");
import { installLocalStorageShim } from "./issuer-store.mjs";
installLocalStorageShim();
(0, eval)(fs.readFileSync(CORE,"utf8") + "\n;globalThis.MJ = MJ;");
const MJ = globalThis.MJ;
const r = await MJ.buildProofReceipt({
  mission:"vouchcycle:domain-renewal", teamId:"flamo-core",
  startedAt:new Date(Date.now()-9000).toISOString(), finishedAt:new Date().toISOString(),
  mjVersion:"14.1.3", edition:"vouch-harbor",
  report:{ status:"completed", reviewedBySnapshot:true, gateStatus:"PASS",
    seats:[{seatId:"flamo.money",role:"actor",outcome:"renewal paid, observed",verified:true,harness:"llm"}] },
});
console.log("format      :", r.format);
console.log("top-level   :", Object.keys(r).join(", "));
console.log("issuer      :", r.issuer ? r.issuer.keyId + " / " + r.issuer.publicKeyHex.slice(0,16) + "…" : "none");
console.log("signature   :", r.signature ? r.signature.slice(0,24) + "… (" + r.signature.length + " hex)" : "none");
console.log("verify      :", JSON.stringify(await MJ.verifyProofReceipt(r)));
const ok = await MJ.verifyIssuerSignature(r.events.at(-1).hash, r.signature, r.issuer.publicKeyHex);
console.log("verifyIssuerSignature (auditor path, no MJ state):", ok);
fs.writeFileSync(path.join(path.dirname(CORE), "receipt.jsonl"), MJ.receiptToJsonl(r));
fs.writeFileSync(path.join(path.dirname(CORE), "issuer-key.txt"), r.issuer.publicKeyHex);
console.log("wrote receipt.jsonl + issuer-key.txt next to the app");
