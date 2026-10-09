// Takes the README screenshots (docs/screenshot.png, and docs/tour.png with a step of the app tour): starts headless Chrome on a fresh profile, fills the draft
// review with made-up example data, opens the Screening stage and saves the page as a PNG.
//   npm run serve   (in another terminal)   then   node scripts/readme-screenshot.js [chrome.exe]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = process.argv[2] ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:8770/web/";
const DOCS = resolve(import.meta.dirname, "..", "docs");
const [W, H, SCALE] = [1440, 900, 2];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// made-up papers: nothing here comes from a real review
const DEMO = async () => {
  const s = backend.session;
  await s.addIdea("How repairable are small household appliances, and which design methods make them easier to repair?");
  await s.saveQuestions({ population: "Small household electrical appliances", concept: "Design for repair and disassembly methods",
    context: "Engineering design research, any year", main: "Which design methods improve the repairability of small household appliances?",
    sub: ["Which repair steps do the methods address?", "How were the methods evaluated?"] });
  await s.saveConcepts([{ name: "Repair", terms: ["repair*", "disassembl*", "maintainab*"] },
    { name: "Appliances", terms: ["appliance*", "household product*", "consumer electronic*"] },
    { name: "Design", terms: ["design method*", "design guideline*", "design for"] }]);
  for (const k of ["idea", "questions", "concepts", "queries", "protocol"]) await s.setStageStatus(k, "done");
  await s.setAiMode("screening", "suggest");                   // shows the AI label in the sidebar, switched on
  await s.lockProtocol("OSF");
  const papers = [
    ["Design for disassembly of small kitchen appliances: a scoring method", "Vermeer, L.; Okafor, C.", 2023, "Journal of Cleaner Production",
      "Small kitchen appliances are rarely repaired because fasteners, adhesives and sealed housings make disassembly slow. We propose a disassembly scoring method that rates each component by tool use, steps and reversibility, and apply it to twelve kettles, toasters and blenders. Designs with snap-fit housings and standard screws scored up to three times better. The method was validated in workshops with repair café volunteers, who found faults 40% faster on high-scoring products."],
    ["Repairability indices for consumer electronics: a comparison", "Moreau, A.; Lindqvist, P.", 2022, "Resources, Conservation and Recycling",
      "Several repairability indices are now used in policy. We compare five of them on twenty consumer electronic products and discuss which product features each index rewards."],
    ["Modular product architecture for maintainable vacuum cleaners", "Haddad, S.; Brink, T.; Osei, K.", 2021, "Design Studies",
      "We present a function-based method to define modules for maintainable vacuum cleaners and test it with a manufacturer."],
    ["Consumer motivations for repairing household products", "Nakamura, Y.", 2020, "Sustainable Production and Consumption",
      "A survey of 1,200 consumers on why they repair or replace household products."],
    ["Disassembly sequence planning with graph models for appliances", "Ruiz, M.; Chen, W.", 2024, "Computers in Industry",
      "Graph-based disassembly sequence planning applied to washing machine control boards and small appliances."],
    ["Repair cafés as a source of design feedback", "Ahmed, F.; de Vries, J.", 2023, "Journal of Industrial Ecology",
      "Repair logs from 30 repair cafés show which product features block repairs most often."],
  ];
  const ris = papers.map(([t, a, y, j, ab]) => `TY  - JOUR\nTI  - ${t}\n${a.split("; ").map(x => "AU  - " + x).join("\n")}\nPY  - ${y}\nJO  - ${j}\nAB  - ${ab}\nER  - `).join("\n") + "\n";
  await s.importSearch({ fileName: "scopus.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "TITLE-ABS-KEY(repair* AND appliance*)" }, { force: true });
  await s.decide("R0002", "ta", "include");
  await s.decide("R0004", "ta", "exclude", { reason: "E1" });
  await s.decide("R0005", "ta", "include");
};

const profile = mkdtempSync(join(tmpdir(), "prisma-shot-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  "--force-dark-mode", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch("http://127.0.0.1:9333/json").then(r => r.json()).then(l => l.find(t => t.type === "page")).catch(() => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
  const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const run = async expr => {
    const m = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? "page error");
    return m.result?.result?.value;
  };

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.navigate", { url: URL });
  for (let i = 0; i < 50 && !(await run("Boolean(window.backend?.session)")); i++) await sleep(200);
  await run(`(${DEMO})()`);
  await send("Page.navigate", { url: "about:blank" });          // a real reload (a "#" change alone does not reload)
  await sleep(300);
  await send("Page.navigate", { url: URL + "#screening" });
  for (let i = 0; i < 50 && !(await run(`document.querySelector("#page .rec") !== null`)); i++) await sleep(200);
  await sleep(800);                                             // the abstract loads after the page
  await run(`document.querySelector("#toasts").replaceChildren(); document.querySelector(".tour-offer")?.remove()`);   // no notes in the picture
  mkdirSync(DOCS, { recursive: true });
  const save = async name => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(DOCS, name), Buffer.from(shot.result.data, "base64"));
    console.log(`saved docs/${name}`);
  };
  await save("screenshot.png");
  // the tour, at its step about the stages
  await run(`document.querySelector("#btnTour").click()`);
  await sleep(300);
  await run(`[...document.querySelectorAll(".tour-card button")].find(b => b.textContent.startsWith("Next")).click()`);
  await sleep(600);                                             // the highlight moves into place
  await save("tour.png");
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
