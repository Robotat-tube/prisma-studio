// The Review Studio page. It talks to `window.backend` (src/ui/backend.js), which runs the review engine in
// the browser on the folder the user opened.
const backend = window.backend;
/* Review Studio — the page. Plain JavaScript, no build step. */
"use strict";

// ================================================================ basics
const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  // clickable non-controls (sidebar steps, queue rows…) are reachable by keyboard: Tab, then Enter or Space
  if (props?.onclick && !["button", "a", "input", "select", "textarea", "label", "summary"].includes(tag) && !el.hasAttribute("tabindex")) {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); el.click(); } });
  }
  return el;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = x => x == null ? "–" : Math.round(x * 100) + " %";
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let S = null;            // server snapshot
let H = null;            // help texts
let REVIEW = store.get("review", "Project 2 review");
let CUR = location.hash.slice(1) || store.get("stage", "idea");
const D = {};            // unsaved drafts per stage

// ================================================================ server calls
async function getJSON(url) {
  return backend.get(url);
}

async function api(action, args = {}, opts = {}) {
  const r = await backend.action(action, args);
  const j = r.body;
  if (r.status === 409 && j.amendment) {
    const reason = await promptText("Protocol is locked",
      `The protocol was registered on ${S.state.protocol.locked}. Changing the ${j.amendment} is a protocol amendment and will be listed in the timeline. Why is this change needed?`,
      "e.g. pilot showed that 'EEE' is a common synonym", true);
    if (!reason) throw new Error("cancelled");
    return api(action, { ...args, amendment: reason }, opts);
  }
  if (!r.ok) {
    if (!opts.quietError) toast(j.error || "Something went wrong", "err");
    throw new Error(j.error || "error");
  }
  if (j.state) { S = j.state; opts.render === false ? renderChrome() : render(); }
  if (j.message && !opts.silent) toast(j.message, "ok");
  return j;
}

async function upload(file) {
  return backend.upload(file);
}
const download = p => backend.download(p).catch(e => toast(e.message, "err"));

async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ${old}`;
  try { return await fn(); } catch (e) { /* toast already shown */ } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ================================================================ toasts & modals
function toast(text, kind = "") {
  const t = h("div", { class: "toast " + kind }, text);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3200);
}

function modal({ title, body, buttons = [{ label: "Close", value: null }], wide = false }) {
  return new Promise(resolve => {
    const close = v => { scrim.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    const box = h("div", { class: "modal" + (wide ? " wide" : "") },
      h("div", { class: "mh" }, title), h("div", { class: "mb" }, body),
      h("div", { class: "mf" }, buttons.map(b => h("button", {
        class: "btn " + (b.primary ? "primary" : b.danger ? "danger" : ""),
        onclick: () => close(typeof b.value === "function" ? b.value() : b.value),
      }, b.label))));
    const scrim = h("div", { class: "scrim", onclick: e => { if (e.target === scrim) close(null); } }, box);
    document.addEventListener("keydown", onKey, true);
    document.body.append(scrim);
    setTimeout(() => (box.querySelector("textarea, input") || box.querySelector(".btn.primary"))?.focus(), 30);
  });
}

function promptText(title, message, placeholder = "", multiline = false, initial = "") {
  const input = multiline ? h("textarea", { placeholder, rows: 3 }) : h("input", { type: "text", placeholder });
  input.value = initial;
  return modal({
    title, body: h("div", { class: "stack" }, h("p", { class: "muted", style: "margin:0" }, message), input),
    buttons: [{ label: "Cancel", value: null }, { label: "OK", primary: true, value: () => input.value.trim() || null }],
  });
}
const confirmBox = (title, message, ok = "Continue", danger = false) => modal({
  title, body: h("p", { class: "muted" }, message),
  buttons: [{ label: "Cancel", value: false }, { label: ok, primary: !danger, danger, value: true }],
});

// ================================================================ small components
const pill = (text, kind = "") => h("span", { class: "pill " + kind }, text);
const field = (label, input, hint) => h("label", { class: "field" }, h("span", {}, label), input, hint ? h("div", { class: "small muted", style: "margin-top:3px" }, hint) : null);
const card = (title, sub, ...kids) => h("div", { class: "card" }, title ? h("h3", {}, title) : null, sub ? h("p", { class: "sub" }, sub) : null, ...kids);
const btn = (label, onclick, cls = "") => h("button", { class: "btn " + cls, onclick }, label);
const iconBtn = (icon, label, onclick) => h("button", { class: "btn ghost icon", onclick, title: label, "aria-label": label }, icon);
const bar = frac => h("div", { class: "bar" }, h("i", { style: `width:${Math.round((frac || 0) * 100)}%` }));
const statusKind = s => ({ done: "ok", "in-progress": "accent", skipped: "", "not-started": "" }[s]);
const decKind = d => ({ include: "ok", exclude: "bad", unsure: "warn", pending: "", "": "" }[d] ?? "");

function segmented(options, value, onchange) {
  return h("div", { class: "seg" }, options.map(([v, label]) =>
    h("button", { class: v === value ? "on" : "", onclick: () => onchange(v) }, label)));
}

function dropzone(label, accept, onFile) {
  const input = h("input", { type: "file", accept, style: "display:none", onchange: () => input.files[0] && take(input.files[0]) });
  const z = h("div", {
    class: "drop", onclick: () => input.click(),
    ondragover: e => { e.preventDefault(); z.classList.add("over"); },
    ondragleave: () => z.classList.remove("over"),
    ondrop: e => { e.preventDefault(); z.classList.remove("over"); e.dataTransfer.files[0] && take(e.dataTransfer.files[0]); },
  }, h("div", { html: `⬆︎ <b>Drop a file here</b> or click to choose` }), h("div", { class: "small" }, label), input);
  async function take(file) {
    z.classList.add("has");
    z.firstChild.innerHTML = `<span class="spin" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span> Uploading <b>${esc(file.name)}</b>…`;
    try {
      const path = await upload(file);
      z.firstChild.innerHTML = `✓ <b>${esc(file.name)}</b> ready`;
      onFile(path, file);
    } catch (e) { toast(e.message, "err"); z.classList.remove("has"); }
  }
  return z;
}

function chipsInput(terms, onchange, placeholder = "type a term, press Enter") {
  const wrap = h("div", { class: "chips" });
  const draw = () => {
    wrap.replaceChildren(
      ...terms.map((t, i) => h("span", { class: "chip" }, t,
        h("button", { title: "Remove", onclick: () => { terms.splice(i, 1); onchange(terms); draw(); } }, "×"))),
      input);
  };
  const input = h("input", {
    type: "text", placeholder,
    onkeydown: e => {
      if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
        e.preventDefault();
        input.value.split(/[;,\n]/).map(s => s.trim()).filter(Boolean).forEach(s => terms.includes(s) || terms.push(s));
        input.value = ""; onchange(terms); draw(); input.focus();
      } else if (e.key === "Backspace" && !input.value && terms.length) { terms.pop(); onchange(terms); draw(); input.focus(); }
    },
    onpaste: e => {
      const t = e.clipboardData.getData("text");
      if (/[;\n,]/.test(t)) {
        e.preventDefault();
        t.split(/[;,\n]/).map(s => s.trim()).filter(Boolean).forEach(s => terms.includes(s) || terms.push(s));
        onchange(terms); draw(); input.focus();
      }
    },
  });
  draw();
  return wrap;
}

function autosize(t) { const f = () => { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 520) + "px"; }; t.addEventListener("input", f); setTimeout(f); return t; }

function hlQuery(q) {
  const re = /("[^"]*")|\b(AND NOT|AND|OR|NOT)\b|(TITLE-ABS-KEY|TS=|"All Metadata")|(\*)/g;
  let out = "", last = 0, m;
  while ((m = re.exec(q))) {
    out += esc(q.slice(last, m.index));
    if (m[1]) out += m[1].startsWith('"All Metadata') ? `<span class="fld">${esc(m[1])}</span>` : `<span class="str">${esc(m[1]).replace(/\*/g, '<span class="wc">*</span>')}</span>`;
    else if (m[2]) out += `<span class="op">${m[2]}</span>`;
    else if (m[3]) out += `<span class="fld">${esc(m[3])}</span>`;
    else out += `<span class="wc">*</span>`;
    last = re.lastIndex;
  }
  return out + esc(q.slice(last));
}

function termRegex() {
  const terms = (S.state.concepts || []).flatMap(c => c.role === "NOT" ? [] : c.terms);
  const parts = terms.map(t => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "\\w*").replace(/\s+/g, "\\s+")).filter(Boolean);
  return parts.length ? new RegExp(`\\b(${parts.join("|")})`, "gi") : null;
}
const highlight = text => { const re = termRegex(); return re ? esc(text).replace(re, "<mark>$1</mark>") : esc(text); };

function copy(text) { navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard", "ok")); }

function openNote(note) { api("open_note", { note }, { silent: true }).catch(() => {}); }

// ================================================================ charts (SVG)
function svg(w, hgt, inner) { return h("div", { html: `<svg viewBox="0 0 ${w} ${hgt}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">${inner}</svg>` }); }

function gauge(k) {
  const v = k == null ? 0 : Math.max(-0.2, Math.min(1, k));
  const ang = Math.PI * (1 - (v + 0.2) / 1.2);
  const x = 90 + 70 * Math.cos(ang), y = 90 - 70 * Math.sin(ang);
  const color = k == null ? "var(--faint)" : k >= 0.6 ? "var(--ok)" : k >= 0.4 ? "var(--warn)" : "var(--bad)";
  const big = (v + 0.2) / 1.2 > 0.5 ? 1 : 0;
  return svg(180, 110, `
    <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--surface-2)" stroke-width="14" stroke-linecap="round"/>
    ${k == null ? "" : `<path d="M20 90 A70 70 0 ${big > 1 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>`}
    <text x="90" y="84" text-anchor="middle" font-size="26" font-weight="700" fill="var(--text)">${k == null ? "–" : k.toFixed(2)}</text>
    <text x="90" y="104" text-anchor="middle" font-size="11" fill="var(--muted)">Cohen's κ</text>`);
}

function flowDiagram(f) {
  const W = 760, bw = 330, gap = 60, x1 = 20, x2 = x1 + bw + gap;
  let y = 14, out = "";
  const box = (x, y, w, hh, lines, strong) => {
    out += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="10" fill="${strong ? "var(--accent-2)" : "var(--surface)"}" stroke="${strong ? "var(--accent)" : "var(--border)"}" stroke-width="1.5"/>`;
    lines.forEach((l, i) => out += `<text x="${x + w / 2}" y="${y + 22 + i * 17}" text-anchor="middle" font-size="${i ? 12 : 13}" ${i ? 'fill="var(--muted)"' : 'font-weight="600" fill="var(--text)"'}>${esc(l)}</text>`);
  };
  const arrow = (xa, ya, xb, yb) => out += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="var(--faint)" stroke-width="1.6" marker-end="url(#ah)"/>`;
  out += `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--faint)"/></marker></defs>`;
  const dbl = f.db.map(d => `${d.name}: ${d.n}`).slice(0, 3), otl = f.other.map(d => `${d.name.replace(/ \(.*\)/, "")}: ${d.n}`).slice(0, 3);
  const hTop = 34 + Math.max(dbl.length, otl.length, 1) * 17;
  box(x1, y, bw, hTop, [`Identified — databases (n = ${f.n_db})`, ...dbl]);
  box(x2, y, bw, hTop, [`Identified — other sources (n = ${f.n_other})`, ...otl]);
  y += hTop + 26; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2); arrow(x2 + bw / 2, y - 26, x1 + bw / 2 + 40, y - 2);
  box(x1, y, bw, 50, [`Screened — title/abstract (n = ${f.unique})`, `${f.duplicates} duplicates removed · ${f.ta_pending} still open`], true);
  box(x2, y, bw, 50, [`Excluded (n = ${f.ta_excluded})`, Object.entries(f.ta_reasons).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 52)]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  box(x1, y, bw, 50, [`Sought for retrieval (n = ${f.sought})`, `include ${f.ta_include} · unsure ${f.ta_unsure}`]);
  box(x2, y, bw, 50, [`Not retrieved (n = ${f.not_retrieved})`, ""]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  box(x1, y, bw, 50, [`Assessed — full text (n = ${f.assessed})`, `${f.ft_pending} still open`], true);
  box(x2, y, bw, 50, [`Excluded (n = ${f.ft_excluded})`, Object.entries(f.ft_reasons).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 52)]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  out += `<rect x="${x1}" y="${y}" width="${bw}" height="50" rx="10" fill="var(--ok-bg)" stroke="var(--ok)" stroke-width="1.5"/><text x="${x1 + bw / 2}" y="${y + 30}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ok)">Included (n = ${f.included})</text>`;
  return h("div", { class: "flow" }, svg(W, y + 62, out));
}

function pilotChart(pilots) {
  const rows = pilots.slice(-8);
  if (!rows.length) return h("div", { class: "empty" }, h("div", { class: "big" }, "🧪"), "No pilots yet. Run one above.");
  const W = 760, rh = 34, H0 = rows.length * rh + 30;
  let out = `<text x="250" y="14" font-size="11" fill="var(--muted)">test-set recall</text><text x="${W - 4}" y="14" text-anchor="end" font-size="11" fill="var(--muted)">hits</text>`;
  rows.forEach((p, i) => {
    const y = 24 + i * rh, rec = p.test_set ? p.retrieved / p.test_set : null;
    const label = `${p.when.slice(5, 16)} · ${p.note || p.database}`.slice(0, 34);
    out += `<text x="0" y="${y + 15}" font-size="12" fill="var(--text)">${esc(label)}</text>`;
    out += `<rect x="250" y="${y + 4}" width="400" height="14" rx="7" fill="var(--surface-2)"/>`;
    if (rec != null) out += `<rect x="250" y="${y + 4}" width="${Math.max(4, 400 * rec)}" height="14" rx="7" fill="${rec >= .8 ? "var(--ok)" : rec >= .5 ? "var(--warn)" : "var(--bad)"}"/><text x="${256 + 400 * rec}" y="${y + 15}" font-size="11" font-weight="700" fill="var(--text)">${p.retrieved}/${p.test_set}</text>`;
    else out += `<text x="258" y="${y + 15}" font-size="11" fill="var(--muted)">not checked</text>`;
    out += `<text x="${W - 4}" y="${y + 15}" text-anchor="end" font-size="12" font-weight="600" fill="var(--text)">${Number(p.hits).toLocaleString()}</text>`;
  });
  return svg(W, H0, out);
}

// ================================================================ chrome: sidebar, topbar, metrics
const PHASES = [["Planning", 0, 6], ["Conducting", 7, 13], ["Reporting", 14, 14]];
const stage = k => S.stages.find(s => s.key === k);

/** "AI" next to a stage where AI can help: grey while off, in the accent colour when the review switched it on. */
function aiMark(key) {
  if (!S.ai?.steps[key]) return null;
  const on = (S.ai.modes[key] || "off") !== "off";
  return h("span", { class: "ai-mark" + (on ? " on" : ""), title: on ? "AI assistance is on for this stage" : "AI can help here (off; switch it on in the stage's AI assistance card)" }, "AI");
}

function renderSidebar() {
  const sel = $("#reviewSel");
  const label = r => /[\\/]/.test(r) ? "📂 " + r.split(/[\\/]/).pop().replace(/ records$/, "") : r;
  sel.title = /[\\/]/.test(REVIEW) ? REVIEW : "Review";
  sel.replaceChildren(...S.reviews.map(r => h("option", { value: r, selected: r === REVIEW }, label(r))),
    h("option", { value: "__open__" }, "📂 Open folder…"));
  const nav = $("#stepper");
  nav.replaceChildren();
  PHASES.forEach(([name, a, b]) => {
    nav.append(h("div", { class: "phase" }, name));
    S.stages.slice(a, b + 1).forEach((s, i) => nav.append(h("div", {
      class: `step ${s.status} ${s.key === CUR ? "active" : ""}`, onclick: () => go(s.key), title: s.desc,
    }, h("span", { class: "dot" }, s.status === "done" ? "✓" : s.status === "skipped" ? "–" : ""),
      s.title.replace(/^\d+ · /, ""), s.optional ? h("span", { class: "opt" }, "optional") : null, aiMark(s.key))));
  });
  nav.querySelector(".step.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });   // narrow layout: keep the current step in view
}

function renderTop() {
  const s = stage(CUR), n = S.stages.indexOf(s);
  const phase = PHASES.find(([, a, b]) => n >= a && n <= b)[0];
  const locked = S.state.protocol.locked;
  $("#topbar").replaceChildren(
    h("div", { class: "crumbs" }, `${REVIEW} · ${phase} · stage ${n} of ${S.stages.length - 1}`),
    h("div", { class: "titlerow" },
      h("h1", {}, s.title.replace(/^\d+ · /, "")),
      pill(s.status.replace("-", " "), statusKind(s.status)),
      s.optional ? pill("optional", "info") : null,
      S.dev_mode ? pill("🛠 developer mode — locks off", "bad")
        : locked && ["questions", "concepts", "queries", "protocol", "charting"].includes(CUR) ? pill("🔒 protocol locked — changes are amendments", "warn") : null,
      h("span", { class: "spacer" }),
      btn("? Help", () => openHelp(CUR), "ghost"),
      s.optional && !["skipped", "done"].includes(s.status) ? btn("Skip…", skipStage, "ghost") : null,
      s.status === "done" || s.status === "skipped" ? btn("Reopen", () => api("stage_status", { stage: CUR, status: "in-progress" }), "") : btn("✓ Mark done", () => api("stage_status", { stage: CUR, status: "done" }), "primary")),
    h("p", { class: "desc" }, s.desc, s.reason ? h("span", { class: "muted" }, ` — skipped: ${s.reason}`) : null),
    savedIn(CUR), aiCard(CUR) || "");
}

// AI assistance for this step: the mode chosen for this review, the skill that does the work, what to check
function aiCard(key) {
  const step = S.ai?.steps[key];
  if (!step) return null;
  const mode = S.ai.modes[key] || "off", cur = step.modes.find(m => m.key === mode);
  // folded to one line by default; the details (what the mode does, the skill, what you check) open on request
  const open = store.get("ai_open", "") === "1";
  const toggle = () => { store.set("ai_open", open ? "" : "1"); render(); };
  return h("div", { class: "aicard" + (mode === "off" ? "" : " on") + (open ? " open" : "") },
    h("div", { class: "row" },
      h("b", {}, "🤖 AI assistance"),
      segmented(step.modes.map(m => [m.key, m.label]), mode, v => api("ai_mode", { stage: key, mode: v })),
      mode === "off" ? null : btn("📋 Copy prompt", () => copy(step.prompt), "sm primary"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn sm ghost ai-toggle", "aria-expanded": String(open), onclick: toggle }, open ? "Hide details ▴" : "Details ▾")),
    open ? h("div", { class: "aibody" },
      h("div", { class: "small muted" }, cur.desc),
      mode === "off" ? null : h("div", { class: "small muted" }, step.skills.length > 1 ? "Skills: " : "Skill: ",
        step.skills.map((n, i) => [i ? ", " : "", h("code", {}, `.claude/skills/${n}/SKILL.md`)])),
      mode === "off" ? null : h("div", { class: "small" }, h("b", {}, "You check: "),
        h("ul", {}, step.checks.map(c => h("li", {}, c))))) : null);
}

// Where each stage writes its data (paths relative to the review folder; @library = 98 - Publications)
const STORAGE = {
  idea: [["review_state.json", "data"], ["00 - Review timeline.md", "readable: idea log"]],
  questions: [["review_state.json", "data, with every version"], ["03 - Search strategy.md", "readable"]],
  concepts: [["review_state.json", "data"], ["03 - Search strategy.md", "readable: concept table"]],
  queries: [["review_state.json", "data, incl. hand edits"], ["03 - Search strategy.md", "readable: strings"]],
  pilot: [["review_state.json", "data"], ["03 - Search strategy.md", "readable: pilot runs"]],
  protocol: [["review_state.json", "method sections"], ["08 - Screening guide.md", "exclusion reasons"], ["05 - Protocol.md", "generated note"]],
  registration: [["review_state.json", "lock, amendments"], ["00 - Review timeline.md", "readable: amendments"]],
  searches: [["07 - Searches.csv", "one row per search"], ["07 - Exports", "copies of the export files"], ["08 - Records", "one note per paper"]],
  screening: [["08 - Records", "ta_ / ft_decision in each paper's note"], ["08 - Screening.base", "the same as an Obsidian table"]],
  reviewer: [["09 - Second reviewer", "blind CSV sheets"], ["08 - Records", "sample_ / r2_ properties"]],
  snowballing: [["07 - Searches.csv", "one row per round"], ["08 - Records", "new papers"]],
  retrieval: [["08 - Records", "pdf_status, oa_url"], ["10 - Full texts", "attached PDFs"]],
  charting: [["08 - Records", "chart_ properties"], ["12 - Charting.base", "the same as an Obsidian table"], ["review_state.json", "the form"]],
  appraisal: [["08 - Records", "appraisal properties"], ["12 - Charting.base", "Appraisal view"]],
  report: [["14 - PRISMA flow.md", "flow diagram"], ["14 - PRISMA-ScR checklist.md", "checklist"], ["07 - Exports", "BibTeX, CSV"], ["@library", "included_in on publication notes"]],
};

function savedIn(key) {
  const icon = p => p === "@library" ? "📚" : /\.(md)$/.test(p) ? "📝" : /\.base$/.test(p) ? "▦" : /\.(csv|json)$/.test(p) ? "🗎" : "📁";
  return h("div", { class: "savedin" }, h("span", { class: "small muted" }, "Saved in"),
    (STORAGE[key] || []).map(([p, what]) => h("button", { class: "file", title: `${S.folder}/${p === "@library" ? "../98 - Publications" : p} — click to open`, onclick: () => openNote(p) },
      icon(p), " ", p === "@library" ? "98 - Publications" : p, h("span", { class: "muted" }, " · " + what))));
}

function renderMetrics() {
  const f = S.flow, k = S.agreement.ta.kappa, t = S.test_set;
  const last = [...S.state.pilots].reverse().find(p => p.test_set !== "");
  const m = (v, l, to, cls = "") => h("div", { class: "metric " + cls, onclick: () => go(to) }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
  const inc = S.records.filter(r => r.ft_decision === "include");
  const pdfs = inc.filter(r => r.pdf_status === "found").length;
  const [cdone, ctotal] = S.charting_progress;
  const checked = inc.filter(r => String(r.chart?.checked_by || "").toLowerCase() === "reviewer").length;
  const tiles = {                                    // only the numbers that matter for the stage on screen
    unique: () => m(f.unique, "unique records", "searches"),
    ta: () => m(f.ta_pending, "to screen (title/abstract)", "screening", f.ta_pending ? "" : "good"),
    ft: () => m(f.ft_pending, "to screen (full text)", "screening", f.ft_pending ? "" : "good"),
    included: () => m(f.included, "included", "report", f.included ? "good" : ""),
    kappa: () => m(k == null ? "–" : k.toFixed(2), "κ title/abstract", "reviewer", k == null ? "" : k >= 0.6 ? "good" : "bad"),
    test: () => m(last ? `${last.retrieved}/${last.test_set}` : `–/${t.size}`, "test set (last pilot)", "pilot"),
    problems: () => m(S.problems.length, "problems", "screening", S.problems.length ? "bad" : "good"),
    pdfs: () => m(`${pdfs}/${inc.length}`, "included with PDF", "retrieval", inc.length && pdfs === inc.length ? "good" : ""),
    charted: () => m(`${cdone}/${ctotal}`, "charted (AI or you)", "charting"),
    checked: () => m(`${checked}/${ctotal}`, "checked by you", "charting", ctotal && checked === ctotal ? "good" : ""),
  };
  const PER_STAGE = {
    queries: ["test"], pilot: ["test"], searches: ["unique", "problems"],
    screening: ["unique", "ta", "ft", "included", "problems"], reviewer: ["kappa"],
    snowballing: ["unique", "included"], retrieval: ["included", "pdfs"],
    charting: ["included", "pdfs", "charted", "checked"], appraisal: ["included", "checked"],
    report: ["unique", "included", "pdfs", "checked", "problems"],
  };
  const keys = (PER_STAGE[CUR] || []).filter(x => x !== "kappa" || stage("reviewer").status !== "skipped");
  $("#metrics").replaceChildren(...keys.map(x => tiles[x]()));
  $("#metrics").style.display = keys.length ? "" : "none";
}

function renderDevButton() {
  const b = $("#btnDev");
  b.textContent = S.dev_mode ? "🛠 Developer mode: on — switch off" : "🛠 Developer mode…";
  b.classList.toggle("dev-on", !!S.dev_mode);
  const sb = $("#btnSettings");                       // the state stays visible while the menu is closed
  sb.textContent = S.dev_mode ? "⚙ Settings · dev mode on" : "⚙ Settings";
  sb.classList.toggle("dev-on", !!S.dev_mode);
  b.title = S.dev_mode ? "Developer mode is on: locked parts (protocol, criteria, charting form) can be edited without amendments; edits are still noted in the timeline. Click to switch off."
    : "Developer mode: lift the protocol locks while you develop the review. Edits are still noted in the timeline.";
}

function renderChrome() { renderSidebar(); renderTop(); renderMetrics(); renderDevButton(); }

function render() {
  renderChrome();
  renderDraftBar();
  const page = $("#page");
  page.replaceChildren(PAGES[CUR]());
  nameFields(page);
}

function nameFields(root) {
  for (const el of root.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")) {
    if (el.closest("label") || el.getAttribute("aria-label") || el.id && root.querySelector(`label[for="${el.id}"]`)) continue;
    let n = el, text = "";
    const td = el.closest("td"), tr = td?.closest("table")?.querySelector("tr");
    if (td && tr) text = [tr.children[td.cellIndex]?.innerText, td.parentElement.cells[0]?.innerText].filter(Boolean).join(" — ").trim();
    else if (el.parentElement?.children.length > 1)                    // a row of fields: name / description…
      text = el.placeholder || "";
    while (n && n !== root && !/\w/.test(text)) {           // nearest text before the field: hint, heading, label-like span
      let sib = n.previousElementSibling;
      while (sib && !/\w/.test(text)) { text = sib.innerText?.trim().split("\n")[0] || ""; sib = sib.previousElementSibling; }
      n = n.parentElement;
    }
    const name = (text || el.placeholder || "").slice(0, 120);
    if (name) el.setAttribute("aria-label", name);
  }
}

function go(key) { CUR = key; store.set("stage", key); history.replaceState(null, "", "#" + key); render(); $("#main").scrollTo({ top: 0 }); const dr = $("#drawer"); if (dr.classList.contains("open")) (dr.querySelector("h2").textContent.startsWith("Example") ? openExample : openHelp)(key); }

async function skipStage() {
  const r = await promptText("Skip this stage", "Skipping is fine for optional stages, but the reason is reported in the timeline and the PRISMA-ScR checklist.", "e.g. optional in scoping reviews; not planned in the protocol", true);
  if (r) api("stage_status", { stage: CUR, status: "skipped", reason: r });
}

// ================================================================ help drawer, glossary, timeline
function refList(numbering) {
  return h("ol", { class: "refs" }, Object.entries(numbering).sort((a, b) => a[1] - b[1]).map(([k]) => {
    const r = H.refs[k];
    return h("li", {}, r.text, " ", r.doi ? h("a", { href: `https://doi.org/${r.doi}`, target: "_blank", rel: "noopener" }, `doi:${r.doi}`) : null);
  }));
}
function refMarks(refs, numbering) {
  refs.forEach(r => numbering[r] ??= Object.keys(numbering).length + 1);
  return refs.length ? h("span", { class: "refn", title: refs.map(r => H.refs[r].text).join("\n\n") }, ` [${refs.map(r => numbering[r]).join(", ")}]`) : null;
}
const lvl = key => h("span", { class: "lvl", style: `background:${H.levels[key].color}`, title: H.levels[key].explain }, H.levels[key].label);

function drawer(title, ...body) {
  const dr = $("#drawer");
  dr.replaceChildren(h("div", { class: "dh" }, h("h2", {}, title), iconBtn("✕", "Close", closeHelp)), h("div", { class: "db" }, ...body));
  dr.classList.add("open");
}

function openHelp(key) {
  const x = H.stages[key], s = stage(key), num = {};
  const rules = x.rules.map(([text, level, refs]) => h("div", { class: "rule" }, lvl(level), h("div", {}, withScr(text), refMarks(refs, num))));
  const terms = x.terms.map(t => h("div", { class: "term" }, h("b", {}, t), H.terms[t].definition, refMarks(H.terms[t].refs, num)));
  drawer("Help · " + s.title.replace(/^\d+ · /, ""),
    h("p", { class: "lead" }, x.what),
    h("ol", { class: "steps" }, x.how.map(l => h("li", {}, l))),
    h("h4", {}, "Rule or choice?"), rules,
    h("div", { class: "row", style: "margin-top:14px" }, btn("💡 Show example", () => openExample(key), "sm")),
    h("details", { class: "fold" }, h("summary", {}, `Terms (${terms.length})`), terms),
    h("details", { class: "fold" }, h("summary", {}, "What the labels mean"),
      Object.keys(H.levels).map(k => h("div", { class: "rule" }, lvl(k), h("div", { class: "small muted" }, H.levels[k].explain)))),
    h("details", { class: "fold" }, h("summary", {}, `References (${Object.keys(num).length})`), refList(num)));
}

function openExample(key) {
  const ex = H.examples[key] || {}, s = stage(key);
  drawer("Example · " + s.title.replace(/^\d+ · /, ""),
    h("div", { class: "callout", style: "margin:8px 0 14px" }, h("b", {}, "Worked example: "), H.example_topic),
    ex.items ? h("table", { class: "tbl" }, ex.items.map(([k, v]) => h("tr", {}, h("td", { style: "width:34%;color:var(--muted);font-weight:600" }, k), h("td", {}, v)))) : null,
    ex.code ? h("div", { class: "code", style: "margin-top:10px", html: hlQuery(ex.code) }) : null,
    ex.lesson ? h("div", { class: "callout ok", style: "margin-top:14px" }, h("b", {}, "Lesson: "), ex.lesson) : null,
    h("p", { class: "small muted", style: "margin-top:16px" }, "Real values from a run of this tool on 6 Oct 2026; screening decisions were illustrative."),
    h("div", { class: "row" }, btn("? Back to help", () => openHelp(key), "sm")));
}

function closeHelp() { $("#drawer").classList.remove("open"); }

// "Working with Claude": how to use an AI assistant with this review. The per-step part comes from the same
// settings as the AI assistance cards (review_stages.AI_STEPS), so it stays in step with the tool.
function openClaudeGuide() {
  const sec = (title, ...body) => h("section", { style: "margin:0 0 18px" }, h("h3", { style: "margin:0 0 6px" }, title), ...body);
  const ol = items => h("ol", { style: "margin:4px 0 0;padding-left:20px;line-height:1.6" }, items.map(i => h("li", {}, i)));
  const ul = items => h("ul", { style: "margin:4px 0 0;padding-left:20px;line-height:1.6" }, items.map(i => h("li", {}, i)));
  const goStage = key => { document.querySelector(".scrim")?.remove(); go(key); };
  const steps = Object.entries(S.ai.steps).map(([key, step]) => {
    const stg = stage(key), mode = S.ai.modes[key] || "off";
    return h("div", { class: "card", style: "padding:12px 16px;margin:0 0 10px" },
      h("div", { class: "row", style: "margin-bottom:6px" },
        h("b", {}, stg.title), pill(mode === "off" ? "off for this review" : "on: " + step.modes.find(m => m.key === mode).label, mode === "off" ? "" : "ok"),
        h("span", { style: "flex:1" }), btn("Open stage", () => goStage(key), "sm ghost"),
        mode === "off" ? null : btn("📋 Copy prompt", () => copy(step.prompt), "sm")),
      h("div", { class: "small" }, ul(step.modes.filter(m => m.key !== "off").map(m => [h("b", {}, m.label + ": "), m.desc]))),
      h("div", { class: "small", style: "margin-top:6px" }, h("b", {}, "You check: "), ul(step.checks)),
      h("div", { class: "small muted", style: "margin-top:6px" }, "Skill: ", step.skills.map((n, i) => [i ? ", " : "", h("code", {}, `.claude/skills/${n}/SKILL.md`)])));
  });
  modal({ title: "Working with Claude", wide: true, body: h("div", {},
    h("p", { class: "callout", style: "margin:0 0 16px" },
      "Claude can do the slow, repetitive parts of a review: pre-screening, finding PDFs, a blind second screening, filling the charting form. ",
      "It only ever suggests. You confirm every decision in Review Studio, every AI action is logged with the model and date, and the protocol reports it."),
    sec("1 · Set up once", ol([
      "Install Claude Code: the Claude desktop app (Code tab) or the claude command in a terminal.",
      ["Open the PRISMA Studio folder (the one that contains ", h("code", {}, ".claude/skills"), ") as the project in Claude Code. The review skills come with the app; Node.js, which the app already needs, runs them."],
      "Keep Review Studio open next to it: Claude writes, Review Studio is where you check and confirm.",
      "For paywalled papers: let Claude use a browser where you are signed in to your library (for example Claude in Chrome), only if you agree to that."])),
    sec("2 · How one step works", ol([
      "Open the stage and choose a mode on its 🤖 AI assistance card. The choice is part of your method: after the protocol is locked it is an amendment.",
      "Press 📋 Copy prompt and paste it into Claude Code.",
      ["Claude follows the skill: it reads what it needs and writes its suggestions through ", h("code", {}, "bin/ai-assist.js"), ", which refuses when the mode is off and never sets a final decision. If two folders share the review's name (a review and its test copy), Claude asks you which one."],
      "Back in Review Studio, review the suggestions (Suggested queue, blind-sheet agreement, 'checked by AI' papers) and confirm or change each one.",
      "Work through the 'You check' list for that step."])),
    sec("3 · Steps Claude can help with", ...steps),
    sec("4 · Other things to ask Claude", ul([
      "Draft protocol sections from your decisions (marked 'Claude draft' until you approve them).",
      "Suggest synonyms and spellings for a concept block before you pilot the search.",
      "Summarise or compare included papers, or draft parts of the report from the charting table. Check every claim against the paper."])),
    sec("5 · Rules that keep the review sound", ul([
      "The reviewer decides. AI suggestions are never final decisions, and a confirmed batch is recorded as yours with a note per record.",
      "Report AI use in the methods (PRISMA 2020 item 8): which steps, which model, how its output was checked. The protocol's 'Use of AI assistance' section is written for you.",
      "An AI second reviewer is not a second person. Say so; if you can, use a human for the second-reviewer sample.",
      "Never let AI solve CAPTCHAs, use shadow libraries or share logins when fetching PDFs."])),
    sec("6 · Other AI assistants", h("p", { style: "margin:0" },
      ["The skills are plain Markdown files in ", h("code", {}, ".claude/skills/"), ". Any assistant that can read files and run Node.js commands can follow them; the prompt on each card works the same way."])))
  });
}

function openGlossary() {
  const num = {}, list = h("div", {});
  const search = h("input", { type: "text", placeholder: "Search terms…", oninput: () => draw() });
  const draw = () => {
    const q = search.value.toLowerCase();
    list.replaceChildren(...Object.keys(H.terms).sort((a, b) => a.localeCompare(b))
      .filter(t => !q || (t + H.terms[t].definition).toLowerCase().includes(q))
      .map(t => h("div", { class: "term", style: "border-bottom:1px solid var(--border);padding:9px 0" }, h("b", {}, t), H.terms[t].definition, refMarks(H.terms[t].refs, num))));
  };
  draw();
  modal({ title: "Glossary", wide: true, body: h("div", { class: "stack" }, search, list, h("details", {}, h("summary", {}, "References"), refList(num))) });
}

function openTimeline() {
  const am = S.state.amendments;
  modal({
    title: "Timeline", wide: true, body: h("div", {},
      am.length ? h("div", { class: "callout warn", style: "margin-bottom:12px" }, h("b", {}, `${am.length} amendment(s) after locking`), h("ul", {}, am.map(a => h("li", {}, `${a.when} — ${a.what}: ${a.reason}`)))) : null,
      S.events.length ? h("div", { class: "tl" }, S.events.map(e => h("div", { class: "ev" }, h("div", { class: "when" }, `${e.when} · ${(stage(e.stage) || { title: e.stage }).title}`), e.text)))
        : h("div", { class: "empty" }, "Nothing recorded yet.")),
    buttons: [{ label: "Open timeline note in Obsidian", value: () => openNote("00 - Review timeline.md") }, { label: "Close", primary: true, value: null }],
  });
}

function openKeys() {
  const rows = [["?", "help for this stage"], ["X", "example for this stage"], ["G", "glossary"], ["T", "timeline"], ["Alt+↑ / Alt+↓", "previous / next stage"],
    ["I / U / E", "include / unsure / exclude (screening)"], ["1–9", "exclusion reason (screening)"], ["← / →", "previous / next record"], ["Esc", "close panel"]];
  modal({ title: "Keyboard shortcuts", body: h("table", { class: "tbl" }, rows.map(([k, d]) => h("tr", {}, h("td", {}, h("kbd", {}, k)), h("td", {}, d)))) });
}


// ---------- PRISMA-ScR item references: "PRISMA-ScR 3" → clickable chip, plus the full checklist
const SCR_PARTS = [["Title & abstract", 1, 2], ["Introduction", 3, 4], ["Methods — in the protocol", 5, 13], ["Results", 14, 18], ["Discussion", 19, 21], ["Funding", 22, 22]];

function scrChip(n) {
  const it = S.checklist_items.find(x => x.n === n);
  return h("button", { class: "scr", title: it ? `PRISMA-ScR item ${n}: ${it.item} — ${it.desc}` : `PRISMA-ScR item ${n}`,
    onclick: e => { e.preventDefault(); e.stopPropagation(); openChecklist(n); } }, `ScR ${n}`);
}

// Turns text such as "Rationale (PRISMA-ScR 3)" or "(PRISMA-ScR items 10–11)" into text + clickable chips
function withScr(text) {
  const m = String(text).match(/^(.*?)\s*\((?:PRISMA-ScR(?: items?)?)\s*([\d,\s–-]+)\)\s*(.*)$/);
  if (!m) return [text];
  const nums = [];
  m[2].split(/,\s*/).forEach(part => {
    const r = part.split(/[–-]/).map(Number);
    for (let i = r[0]; i <= (r[1] || r[0]); i++) nums.push(i);
  });
  return [m[1], " ", ...nums.map(scrChip), m[3] ? " " + m[3] : ""];
}

function openChecklist(focus) {
  const auto = S.checklist_auto, cl = S.state.checklist;
  const body = h("div", {},
    h("p", { class: "muted small", style: "margin-top:0" }, "The 22 items a scoping-review paper must report (Tricco et al. 2018, Annals of Internal Medicine). Items 5–13 are written in the protocol; the rest come with the final paper. Tick items on the Report stage."),
    SCR_PARTS.map(([part, a, b]) => h("div", {},
      h("h4", { style: "margin:14px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)" }, part),
      S.checklist_items.filter(it => it.n >= a && it.n <= b).map(it => {
        const done = cl[String(it.n)]?.done, ev = auto[String(it.n)];
        return h("div", { id: "scr" + it.n, class: "scr-row" + (it.n === focus ? " focus" : "") },
          h("span", { class: "scr-n" }, it.n),
          h("div", {}, h("b", {}, it.item), h("div", { class: "small muted" }, it.desc), ev ? h("div", { style: "margin-top:3px" }, pill(ev, "info")) : null),
          done ? pill("✓ reported", "ok") : null);
      }))));
  modal({ title: "PRISMA-ScR checklist", wide: true, body, buttons: [{ label: "Go to Report stage", value: () => go("report") }, { label: "Close", primary: true, value: null }] });
  if (focus) setTimeout(() => document.getElementById("scr" + focus)?.scrollIntoView({ block: "center" }), 60);
}

// ================================================================ pages
const PAGES = {};

PAGES.idea = () => {
  const ta = autosize(h("textarea", { placeholder: "What do you want to find out, and why? What did you read or discuss? What changed?", rows: 4, value: D.idea || "", oninput: e => D.idea = e.target.value }));
  const ideas = [...S.state.idea].reverse();
  return h("div", {},
    card("New idea note", "Short and dated. It is fine to be vague here — the next stage makes it precise.", ta,
      h("div", { class: "row end", style: "margin-top:10px" }, h("span", { class: "kbdhint" }, "Ctrl+Enter to add"),
        btn("Add note", e => { if (ta.value.trim()) busy(e.currentTarget, () => api("add_idea", { text: ta.value }).then(() => D.idea = "")); }, "primary"))),
    card("Idea log", `${ideas.length} note(s)`, ideas.length ? h("div", { class: "tl" }, ideas.map(i => h("div", { class: "ev" }, h("div", { class: "when" }, i.when), i.text)))
      : h("div", { class: "empty" }, h("div", { class: "big" }, "💡"), "No notes yet.")));
};

PAGES.questions = () => {
  const q = S.state.questions;
  const d = D.questions ??= { population: q.population, concept: q.concept, context: q.context, main: q.main, sub: [...q.sub], why: "" };
  const bind = k => e => d[k] = e.target.value;
  const subs = h("div", { class: "stack" });
  const drawSubs = () => subs.replaceChildren(...d.sub.map((s, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
    h("span", { class: "muted", style: "width:22px" }, `${i + 1}.`), h("input", { type: "text", value: s, oninput: e => d.sub[i] = e.target.value }),
    iconBtn("✕", "Remove sub-question", () => { d.sub.splice(i, 1); drawSubs(); }))), btn("+ Add sub-question", () => { d.sub.push(""); drawSubs(); }, "sm"));
  drawSubs();
  const pcc = (k, label, hint, color) => h("div", { class: "card", style: `border-top:3px solid ${color};margin:0` },
    h("h3", {}, label), h("p", { class: "sub" }, hint), autosize(h("textarea", { rows: 2, value: d[k], oninput: bind(k) })));
  return h("div", {},
    h("div", { class: "grid3", style: "margin-bottom:16px" },
      pcc("population", "Population", "What is studied? (products, systems, people…)", "#4f46e5"),
      pcc("concept", "Concept", "The core phenomenon, method or intervention", "#0891b2"),
      pcc("context", "Context", "Setting, domain, period, publication types", "#16a34a")),
    card("Review questions", null,
      field("Main question", autosize(h("textarea", { rows: 2, value: d.main, oninput: bind("main") }))),
      h("div", { style: "margin-top:12px" }, h("span", { class: "small muted", style: "font-weight:600" }, "Sub-questions"), subs),
      h("div", { class: "hr" }),
      h("div", { class: "row", style: "flex-wrap:nowrap" },
        h("input", { type: "text", placeholder: "What changed and why? (kept with this version)", value: d.why, oninput: bind("why") }),
        btn("Save new version", e => busy(e.currentTarget, () => api("save_questions", { q: { ...d, sub: d.sub.filter(s => s.trim()) }, why: d.why }).then(() => delete D.questions)), "primary"))),
    q.history.length ? card("Earlier versions", `${q.history.length} version(s), newest first`,
      [...q.history].reverse().map(v => h("details", { style: "padding:6px 0;border-bottom:1px solid var(--border)" },
        h("summary", {}, h("b", {}, v.when), " — ", v.why || "no reason given"),
        h("div", { class: "small", style: "padding:6px 0 0 14px" }, h("div", {}, "Main: ", v.main || "—"), h("div", { class: "muted" }, `P: ${v.population || "—"} · C: ${v.concept || "—"} · C: ${v.context || "—"}`))))) : null);
};

PAGES.concepts = () => {
  const d = D.concepts ??= JSON.parse(JSON.stringify(S.state.concepts));
  const list = h("div", {}), preview = h("div", { class: "code" }), dirty = h("span", { class: "pill warn", style: "display:none" }, "unsaved changes");
  const tabs = h("div", { class: "tabs" });
  let db = D.previewDb || S.state.queries.databases[0];
  const refresh = debounce(async () => {
    dirty.style.display = JSON.stringify(d) === JSON.stringify(S.state.concepts) ? "none" : "";
    try {
      const r = await api("preview_queries", { concepts: d }, { silent: true, quietError: true });
      D.previews = r.queries; drawPreview();
    } catch (e) { /* ignore */ }
  }, 250);
  const drawPreview = () => {
    tabs.replaceChildren(...S.state.queries.databases.map(x => h("button", { class: x === db ? "on" : "", onclick: () => { db = D.previewDb = x; drawPreview(); } }, x)));
    preview.innerHTML = hlQuery((D.previews || S.queries)[db] || "(add a concept with terms)");
  };
  const draw = () => {
    list.replaceChildren(...d.flatMap((c, i) => [i ? h("div", { class: "joiner" }, c.role === "NOT" ? "AND NOT" : "AND") : [],
      h("div", { class: "concept " + (c.role === "NOT" ? "not" : "and") },
        h("div", { class: "head" },
          h("input", { type: "text", value: c.name, placeholder: "Concept name", oninput: e => { c.name = e.target.value; refresh(); } }),
          segmented([["AND", "AND"], ["NOT", "NOT"]], c.role || "AND", v => { c.role = v; draw(); refresh(); }),
          h("span", { class: "spacer", style: "flex:1" }),
          btn("↑", () => { if (i) { [d[i - 1], d[i]] = [d[i], d[i - 1]]; draw(); refresh(); } }, "ghost icon"),
          btn("↓", () => { if (i < d.length - 1) { [d[i + 1], d[i]] = [d[i], d[i + 1]]; draw(); refresh(); } }, "ghost icon"),
          btn("🗑", () => { d.splice(i, 1); draw(); refresh(); }, "ghost icon danger")),
        chipsInput(c.terms, () => refresh()),
        h("div", { class: "small muted", style: "margin-top:5px" }, `${c.terms.length} term(s) · joined with OR · * = any ending, e.g. repairab* → repairable, repairability`))]));
  };
  draw(); drawPreview(); refresh();
  return h("div", {},
    h("div", { class: "grid2" },
      h("div", {}, card("Concept table", "One block per concept. Synonyms inside a block are joined with OR; blocks are joined with AND.",
        list, h("div", { class: "row", style: "margin-top:12px" },
          btn("+ Add concept", () => { d.push({ name: "", role: "AND", terms: [] }); draw(); }, ""),
          h("span", { style: "flex:1" }), dirty,
          btn("Save concepts", e => busy(e.currentTarget, () => api("save_concepts", { concepts: d, why: D.cwhy || "" }).then(() => { delete D.concepts; D.cwhy = ""; })), "primary")),
        h("input", { type: "text", placeholder: "What changed and why? (kept with this version)", value: D.cwhy || "", style: "margin-top:8px", oninput: e => D.cwhy = e.target.value })),
        conceptHistory()),
      h("div", {}, card("Live search string", "Updates as you type. Final strings and manual edits are in the next stage.", tabs, preview,
        h("div", { class: "row end", style: "margin-top:10px" }, btn("Copy", () => copy(preview.textContent), "sm"))))));
};

function conceptHistory() {
  const hist = [...(S.state.concepts_history || [])].reverse();
  if (!hist.length) return null;
  return card("Earlier versions", `${hist.length} earlier version(s), newest first — the reason for each change is reported with the search strategy`,
    hist.map((v, i) => h("details", { style: "padding:6px 0;border-bottom:1px solid var(--border)" },
      h("summary", {}, h("b", {}, `v${hist.length - i}`), ` · ${v.when} — `, v.why || "no reason given"),
      h("div", { class: "small", style: "padding:6px 0 0 14px" }, v.concepts.map(c => h("div", {}, h("b", {}, c.name), c.role === "NOT" ? " (NOT)" : "", ": ", c.terms.join(" · ")))))));
}

PAGES.queries = () => {
  const dbs = [...S.state.queries.databases];
  let db = D.qdb && dbs.includes(D.qdb) ? D.qdb : dbs[0];
  const box = h("div", {});
  const drawBox = () => {
    const q = S.queries[db] || "", manual = S.manual.includes(db);
    const editing = D.qedit === db;
    const ta = autosize(h("textarea", { class: "code", rows: 5, value: q }));
    box.replaceChildren(
      h("div", { class: "tabs" }, dbs.map(x => h("button", { class: x === db ? "on" : "", onclick: () => { db = D.qdb = x; D.qedit = null; drawBox(); } }, x, S.manual.includes(x) ? " ✎" : ""))),
      h("div", { class: "row", style: "margin-bottom:8px" }, pill(manual ? "edited by hand" : "generated from the concept table", manual ? "warn" : "accent"),
        db === "OpenAlex" ? pill("OpenAlex: no wildcards — stems completed to full words", "info") : null),
      editing ? ta : h("div", { class: "code", html: hlQuery(q || "(no concepts yet)") }),
      h("div", { class: "row end", style: "margin-top:10px" },
        editing ? [btn("Cancel", () => { D.qedit = null; drawBox(); }, "ghost"), btn("Save manual version", e => busy(e.currentTarget, () => api("save_manual_query", { db, text: ta.value }).then(() => D.qedit = null)), "primary")]
          : [manual ? btn("Use generated", () => api("save_manual_query", { db, text: null }), "ghost") : null, btn("✎ Edit by hand", () => { D.qedit = db; drawBox(); }), dbLink(db), btn("⧉ Copy", () => copy(q), "primary")]));
  };
  drawBox();
  const chips = chipsInput(dbs, () => {}, "add a database, press Enter");
  return h("div", {},
    card("Search strings", "Copy each string into the database's advanced search. Syntax differs per database; the tool translates it.", box),
    card("Databases", "Which sources this review searches. At least two bibliographic databases is the usual minimum (see Help).", chips,
      h("div", { class: "row end", style: "margin-top:10px" }, btn("Save databases", e => busy(e.currentTarget, () => api("save_databases", { databases: dbs })), "primary"))));
};

// Advanced-search pages of the databases (opened from the pilot and search-string pages)
const DB_LINKS = {
  "Scopus": "https://www.scopus.com/search/form.uri?display=advanced",
  "Web of Science": "https://www.webofscience.com/wos/woscc/advanced-search",
  "IEEE Xplore": "https://ieeexplore.ieee.org/search/advanced/command",
  "ACM Digital Library": "https://dl.acm.org/search/advanced",
  "PubMed": "https://pubmed.ncbi.nlm.nih.gov/advanced/",
  "OpenAlex": "https://openalex.org/",
};
const dbLink = db => DB_LINKS[db] ? h("a", { class: "btn sm", href: DB_LINKS[db], target: "_blank", rel: "noopener" }, `Open ${db} ↗`) : null;

function testCheckQuery(db, q) {
  const d = S.test_set.dois;
  if (!q || !d.length) return "";
  if (db === "Scopus") return `(${q}) AND (${d.map(x => `DOI(${x})`).join(" OR ")})`;
  if (db === "Web of Science") return `(${q}) AND DO=(${d.join(" OR ")})`;
  return "";
}

function copyBlock(text, label) {
  return h("div", {}, h("div", { class: "code", style: "max-height:150px;overflow:auto", html: hlQuery(text) }),
    h("div", { class: "row end", style: "margin-top:6px" }, btn("⧉ Copy " + label, () => copy(text), "sm primary")));
}

function testSetCard() {
  const sel = D.testsel ??= new Set(S.library.filter(x => x.test).map(x => x.stem));
  const results = h("div", { class: "queue", style: "max-height:220px" });
  const chosen = h("div", { class: "row", style: "gap:6px" });
  const dirty = () => JSON.stringify([...sel].sort()) !== JSON.stringify(S.library.filter(x => x.test).map(x => x.stem).sort());
  const saveBtn = btn("Save test set", null, "primary");
  saveBtn.onclick = e => busy(e.currentTarget, () => api("set_test_set", { stems: [...sel] }).then(() => delete D.testsel));
  const draw = () => {
    chosen.replaceChildren(...[...sel].sort().map(stem => h("span", { class: "chip", style: "font-family:var(--font)" }, stem.slice(0, 60),
      h("button", { title: "Remove", onclick: () => { sel.delete(stem); draw(); } }, "×"))),
      sel.size ? null : h("span", { class: "muted small" }, "No test papers yet — search below and click to add."));
    const q = search.value.toLowerCase().trim();
    results.replaceChildren(...(q ? S.library.filter(x => x.stem.toLowerCase().includes(q)) : []).slice(0, 40).map(x =>
      h("div", { class: "qitem" + (sel.has(x.stem) ? " cur" : ""), onclick: () => { sel.has(x.stem) ? sel.delete(x.stem) : sel.add(x.stem); draw(); } },
        h("span", { class: "dec-dot " + (sel.has(x.stem) ? "include" : "") }), h("span", { class: "t" }, x.stem), x.doi ? null : h("span", { class: "pill warn" }, "no DOI"))));
    saveBtn.style.display = dirty() ? "" : "none";
  };
  const search = h("input", { type: "text", placeholder: "Search your library (author, year, title words)…", oninput: draw });
  draw();
  return h("details", { class: "card", open: !S.test_set.size || dirty() },
    h("summary", { style: "font-weight:700;font-size:15.5px;color:var(--text)" }, `Test set · ${S.test_set.size} paper(s)`,
      h("span", { class: "muted small", style: "font-weight:400" }, " — papers you already know are relevant; a good search finds them")),
    h("div", { style: "margin-top:10px" }, chosen),
    h("div", { style: "margin-top:10px" }, search), results,
    h("div", { class: "row end", style: "margin-top:8px" }, h("span", { class: "small muted" }, "Papers without a DOI can only be checked by hand."), saveBtn));
}

PAGES.pilot = () => {
  const dbs = S.state.queries.databases.filter(x => x !== "OpenAlex");
  let db = D.pdb && dbs.includes(D.pdb) ? D.pdb : dbs[0];
  const note = h("input", { type: "text", placeholder: "What are you testing? e.g. 'v3: added decompos*'", value: D.pnote || "", oninput: e => D.pnote = e.target.value });
  const hits = h("input", { type: "number", placeholder: "e.g. 4090" }), got = h("input", { type: "number", placeholder: "found" });
  const avail = h("input", { type: "number", placeholder: "in database", value: S.test_set.dois.length || "" });
  const guide = h("div", {});
  const drawGuide = () => {
    const q = S.queries[db] || "", t = testCheckQuery(db, q);
    guide.replaceChildren(
      h("div", { class: "row", style: "margin:4px 0 10px" }, h("b", {}, "Step 1"), h("span", { class: "muted" }, `Open ${db}'s advanced search and paste your search string.`), h("span", { style: "flex:1" }), dbLink(db)),
      q ? copyBlock(q, "search string") : h("div", { class: "callout warn" }, "No search string yet — fill in the concept table first."),
      h("div", { class: "row", style: "margin:14px 0 10px" }, h("b", {}, "Step 2"), h("span", { class: "muted" }, t
        ? `Paste the test-set check: the same search, limited to your ${S.test_set.dois.length} test papers' DOIs. The number it shows = test papers found.`
        : `Check by hand which of your ${S.test_set.size} test papers appear in the results.`)),
      t ? copyBlock(t, "test-set check") : h("div", { class: "small muted" }, "Test papers: " + S.test_set.papers.join(" · ")),
      h("div", { class: "row", style: "margin:14px 0 6px" }, h("b", {}, "Step 3"), h("span", { class: "muted" }, "Enter what the database showed and log the pilot.")),
      h("div", { class: "grid3" }, field("Hits (documents found)", hits), field("Test papers found", got), field("Test papers in the database", avail, "lower if a test paper is not indexed there")),
      h("div", { class: "row end", style: "margin-top:10px" }, btn("Log pilot", () => {
        if (!hits.value) return toast("Enter the number of hits.", "err");
        api("pilot_manual", { database: db, hits: hits.value, retrieved: got.value, available: got.value ? avail.value : "", note: note.value }).then(() => D.pnote = "");
      }, "primary")));
  };
  drawGuide();
  const db2 = h("select", {}, dbs.map(x => h("option", {}, x)));
  const pilots = [...S.state.pilots].reverse();
  return h("div", {},
    testSetCard(),
    (() => {
      const method = D.pmethod || "db";
      const panels = {
        db: [h("div", { class: "row", style: "margin-bottom:6px" }, h("span", { class: "small muted" }, "Database"),
              segmented(dbs.map(x => [x, x]), db, v => { db = D.pdb = v; render(); })),
            field("Note for this run", note), h("div", { class: "hr" }), guide],
        file: [h("p", { class: "sub" }, "Run the string in the database, export the results (RIS, BibTeX or CSV) and drop the file here: the tool counts the records and checks the test set itself."),
            field("Note for this run", note), h("div", { class: "grid2", style: "margin-top:10px" }, field("Database", db2),
              dropzone("RIS, BibTeX or CSV", ".ris,.bib,.csv,.txt,.tsv", p => api("pilot_file", { path: p, database: db2.value, note: note.value })))],
        openalex: [h("p", { class: "sub" }, "Free and automatic, but rough: OpenAlex has no wildcards and searches differently, so its counts are only indicative. Good for a first impression, not for the final decision."),
            field("Note for this run", note),
            h("div", { class: "row end", style: "margin-top:10px" }, btn("Run OpenAlex check", e => busy(e.currentTarget, () => api("pilot_openalex", { note: note.value }).then(() => D.pnote = "")), "primary"))],
      };
      return card("How do you want to pilot?", `Pick one method per run — they are alternatives, not steps. Test set = ${S.test_set.size} paper(s) you already know are relevant (test_in).`,
        h("div", { class: "seg", style: "margin-bottom:14px" }, [["db", "In a database (recommended)"], ["file", "From an export file"], ["openalex", "Quick check in OpenAlex"]]
          .map(([k, t]) => h("button", { class: method === k ? "on" : "", onclick: () => { D.pmethod = k; render(); } }, t))),
        panels[method]);
    })(),
    card("Results", "Tune on recall first, then on the number of hits you can screen.", pilotChart(S.state.pilots),
      pilots.length ? h("div", { class: "scroll", style: "margin-top:12px" }, h("table", { class: "tbl" },
        h("tr", {}, ["When", "Source", "Hits", "Test set", "Missed papers"].map(t => h("th", {}, t))),
        pilots.map(p => h("tr", {}, h("td", { class: "small" }, p.when), h("td", {}, p.database, p.note ? h("div", { class: "small muted" }, p.note) : null),
          h("td", { class: "num" }, Number(p.hits).toLocaleString()), h("td", { class: "num" }, p.test_set === "" ? "–" : `${p.retrieved}/${p.test_set}`),
          h("td", { class: "small" }, p.missed.length ? h("details", {}, h("summary", {}, `${p.missed.length} missed`), h("ul", {}, p.missed.map(m => h("li", {}, m)))) : p.test_set === "" ? "" : "none"))))) : null));
};

function authorPill(key) {
  const m = (S.state.protocol_meta || {})[key];
  if (!m) return null;
  if (m.by === "approved") return h("span", { class: "pill info", style: "margin-left:8px", title: `Drafted by Claude, approved by you on ${m.when}` }, "Claude draft · approved by you");
  return m.by === "claude" ? h("span", { class: "pill warn", style: "margin-left:8px", title: `Drafted by Claude on ${m.when}. Read and edit it to make it yours.` }, "Draft by Claude")
    : h("span", { class: "pill ok", style: "margin-left:8px", title: `Last edited by you on ${m.when}` }, "Edited by you");
}

PAGES.protocol = () => {
  const d = D.protocol ??= { ...S.state.protocol_text };
  const r = D.reasons ??= { ta: [...S.reasons.ta], ft: [...S.reasons.ft] };
  const reasonList = key => {
    const wrap = h("div", { class: "stack" });
    const draw = () => wrap.replaceChildren(...r[key].map((x, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
      h("input", { type: "text", value: x, oninput: e => r[key][i] = e.target.value }), iconBtn("✕", "Remove", () => { r[key].splice(i, 1); draw(); }))),
      btn("+ Add reason", () => { r[key].push(`E${r[key].length + 1} `); draw(); }, "sm"));
    draw(); return wrap;
  };
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:16px" }, "Objectives, questions, search strings and pilot results are filled in automatically from stages 1–4. Write the method sections below, then generate the Protocol note."),
    card("Method sections", null, S.protocol_sections.map(sct => h("details", { open: !d[sct.key], style: "border-bottom:1px solid var(--border);padding:8px 0" },
      h("summary", {}, h("b", { style: "color:var(--text)" }, withScr(sct.title)), authorPill(sct.key), d[sct.key] ? h("span", { class: "pill ok", style: "margin-left:8px" }, "written") : h("span", { class: "pill", style: "margin-left:8px" }, "empty")),
      h("div", { style: "margin-top:8px" }, autosize(h("textarea", { rows: 3, value: d[sct.key] || "", oninput: e => d[sct.key] = e.target.value })),
        ((S.state.protocol_meta || {})[sct.key] || {}).by === "claude" ? h("div", { class: "row end", style: "margin-top:6px" },
          btn("✓ Approve as is", () => api("approve_section", { key: sct.key }), "sm")) : null))),
      h("div", { class: "row end", style: "margin-top:12px" },
        btn("Open Protocol in Obsidian", () => openNote("05 - Protocol.md"), "ghost"),
        btn("Save", e => busy(e.currentTarget, () => api("save_protocol_text", { text: d }).then(() => delete D.protocol)), ""),
        btn("Save & generate Protocol", e => busy(e.currentTarget, () => api("save_protocol_text", { text: d, generate: true }).then(() => delete D.protocol)), "primary"))),
    card("Exclusion reasons", "The only reasons allowed during screening. Short code first (E1, E2 …) — screeners can type just the code.",
      h("div", { class: "grid2" }, h("div", {}, h("b", {}, "Title/abstract"), reasonList("ta")), h("div", {}, h("b", {}, "Full text"), reasonList("ft"))),
      h("div", { class: "row end", style: "margin-top:12px" }, btn("Save reasons", e => busy(e.currentTarget, () => api("save_reasons", r).then(() => delete D.reasons)), "primary"))));
};

function lockReadiness() {
  const checks = S.lock_checks, open = checks.filter(c => c.required && !c.ok).length;
  const sup = S.state.supervisor_review || {};
  const who = h("input", { type: "text", placeholder: "Supervisor's name", value: sup.by || "" });
  return card(open ? `Ready to lock? ${open} thing(s) still open` : "Ready to lock ✓", "Everything a reviewer will look for before the protocol is frozen.",
    h("div", {}, checks.map(c => h("div", { class: "rule", style: "grid-template-columns:26px 1fr" },
      h("span", { style: `font-size:16px;color:${c.ok ? "var(--ok)" : c.required ? "var(--bad)" : "var(--warn)"}` }, c.ok ? "✓" : c.required ? "✕" : "!"),
      h("div", {}, h("b", {}, c.label), c.required ? null : h("span", { class: "small muted" }, " (recommended)"), h("div", { class: "small muted" }, c.detail))))),
    h("div", { class: "row", style: "margin-top:12px;flex-wrap:nowrap" }, h("span", { class: "small muted", style: "white-space:nowrap" }, "Reviewed by"), who,
      btn(sup.by ? "Update" : "Mark as reviewed", () => api("supervisor_review", { by: who.value }), ""),
      sup.by ? btn("Remove", () => api("supervisor_review", { by: "" }), "ghost") : null));
}

PAGES.registration = () => {
  const p = S.state.protocol;
  const reg = h("input", { type: "text", placeholder: "OSF DOI or URL (optional)" });
  const commit = h("input", { type: "checkbox", checked: true });
  return h("div", {},
    p.locked ? h("div", { class: "card", style: "border-left:4px solid var(--ok)" },
      h("h3", {}, "🔒 Protocol locked on " + p.locked),
      h("p", { class: "sub" }, `Frozen copy: ${p.file}`),
      h("div", { class: "row" }, pill(p.registration ? "Registration: " + p.registration : "No public registration", p.registration ? "ok" : ""),
        pill(p.commit ? "Git commit " + p.commit.slice(0, 10) : "No git commit", p.commit ? "ok" : ""),
        btn("Open frozen protocol", () => openNote(p.file), "sm")))
      : lockReadiness(),
    p.locked ? null : card("Lock the protocol", "Do this before the final database searches. Afterwards, every change to questions, concepts, strings, protocol text, charting fields or exclusion reasons asks for an amendment reason.",
        field("Registration", reg, "Public registration is optional for scoping reviews. PROSPERO does not accept them; OSF Registries does."),
        h("label", { class: "check", style: "margin-top:10px" }, commit, "Commit the frozen protocol to git (local commit — proves the date)"),
        h("div", { class: "row end", style: "margin-top:12px" }, btn("🔒 Lock protocol…", async e => {
          const open = S.lock_checks.filter(c => c.required && !c.ok);
          if (open.length && !(await confirmBox("Not ready yet", `${open.length} required check(s) are still open: ${open.map(c => c.label).join("; ")}. Lock anyway? This is reported in the timeline.`, "Lock anyway", true))) return;
          if (await confirmBox("Lock the protocol?", "This freezes the protocol. It cannot be undone — only amended with a reason.", "Lock protocol"))
            busy(e.target, () => api("lock_protocol", { registration: reg.value, commit: commit.checked }));
        }, "primary"))),
    card("Amendments", "Changes made after locking, with their reasons. They are reported in the manuscript.",
      S.state.amendments.length ? h("div", { class: "tl" }, S.state.amendments.map(a => h("div", { class: "ev" }, h("div", { class: "when" }, `${a.when} · ${a.what}`), a.reason)))
        : h("div", { class: "empty" }, "No amendments.")));
};

PAGES.searches = () => {
  let path = null;
  const dbIn = h("input", { type: "text", list: "dblist", value: S.state.queries.databases[0] || "" });
  const q = autosize(h("textarea", { class: "code", rows: 3, placeholder: "The exact string as you ran it" }));
  const date = h("input", { type: "date", value: new Date().toISOString().slice(0, 10) });
  const filters = h("input", { type: "text", placeholder: "e.g. 2010–2026; articles and reviews; English" });
  const other = h("input", { type: "checkbox" });
  const doImport = async (btnEl, force = false) => {
    if (!path || !q.value.trim()) return toast("Choose a file and give the exact search string.", "err");
    try {
      await api("import", { path, database: dbIn.value, query: q.value, date: date.value, filters: filters.value, other: other.checked, force }, { quietError: true });
    } catch (e) {
      if (e.message === "NOT_LOCKED") {
        if (await confirmBox("Protocol not locked", "The protocol is not locked and registration was not skipped. Searches are normally run after locking. Import anyway?", "Import anyway")) doImport(btnEl, true);
      } else if (e.message !== "cancelled") toast(e.message, "err");
    }
  };
  const add = { title: h("input", { type: "text" }), year: h("input", { type: "text" }), authors: h("input", { type: "text" }), doi: h("input", { type: "text" }), via: h("input", { type: "text", placeholder: "backward from R0012, round 1" }) };
  return h("div", {},
    h("datalist", { id: "dblist" }, [...S.state.queries.databases, "Scopus", "Web of Science", "IEEE Xplore", "ACM Digital Library", "PubMed", "Other"].map(x => h("option", { value: x }))),
    h("div", { class: "grid2" },
      card("Import a database export", "RIS works in every major database; BibTeX and CSV too. Duplicates are merged automatically.",
        dropzone("RIS, BibTeX, CSV or Web of Science TXT", ".ris,.bib,.csv,.txt,.tsv,.nbib", p => path = p),
        h("div", { class: "stack", style: "margin-top:12px" },
          field("Database / source", dbIn),
          field("Exact search string as run", q),
          h("div", { class: "row" }, btn("Use the planned string", () => { q.value = S.queries[dbIn.value] || ""; q.dispatchEvent(new Event("input")); }, "sm ghost")),
          h("div", { class: "grid2" }, field("Date run", date), field("Filters", filters)),
          h("label", { class: "check" }, other, "Count as 'other source' (not a database search)"),
          h("div", { class: "row end" }, btn("Import", e => busy(e.currentTarget, () => doImport(e.currentTarget)), "primary")))),
      card("Add a single paper", "For a paper found another way (reference list, expert tip). Papers with the same 'found via' are counted as one source.",
        h("div", { class: "stack" }, field("Title", add.title), h("div", { class: "grid2" }, field("Year", add.year), field("DOI", add.doi)),
          field("Authors (Surname, X.; …)", add.authors), field("Found via", add.via),
          h("div", { class: "row end" }, btn("Add paper", e => {
            if (!add.title.value || !add.via.value) return toast("Title and 'found via' are required.", "err");
            busy(e.currentTarget, () => api("add_paper", { title: add.title.value, year: add.year.value, authors: add.authors.value, doi: add.doi.value, via: add.via.value }));
          }, "primary"))))),
    card("Searches and other sources", `${S.searches.length} run(s) logged — this is the table reported under PRISMA-ScR items 7–8.`,
      S.searches.length ? h("div", { class: "scroll" }, h("table", { class: "tbl" },
        h("tr", {}, ["ID", "Source", "Date", "08 - Records", "New", "Dupl.", "Query"].map(t => h("th", {}, t))),
        S.searches.map(s => h("tr", {}, h("td", {}, s.id), h("td", {}, s.database, " ", pill(s.kind, s.kind === "database" ? "accent" : "")), h("td", { class: "small" }, s.date),
          h("td", { class: "num" }, s.records), h("td", { class: "num" }, s.new), h("td", { class: "num" }, s.duplicates), h("td", { class: "small", style: "font-family:var(--mono);max-width:360px;word-break:break-word" }, s.query)))))
        : h("div", { class: "empty" }, h("div", { class: "big" }, "🔎"), "No searches imported yet.")));
};

// ---------- screening
const SC = { stage: store.get("sc_stage", "ta"), filter: "todo", id: null, cache: {}, excl: false };

// AI suggestions per screening stage: ai_decision / ai_reason / ai_why (title/abstract), ai_ft_* (full text)
const aiKey = (k, stage = SC.stage) => (stage === "ta" ? "ai_" : "ai_ft_") + k;
const ftOpen = r => ["include", "unsure"].includes(r.ta_decision) && ["", "pending"].includes(r.ft_decision);
const suggested = (stage = SC.stage) => S.records.filter(r => r[aiKey("decision", stage)] && (stage === "ta" ? r.ta_decision === "pending" : ftOpen(r)));

function queue() {
  const recs = S.records;
  if (SC.filter === "pilot") return recs.filter(r => (r.notes || "").includes("[pilot]"));
  if (SC.filter === "presort") return recs.filter(r => r.presort && r.ta_decision === "pending");
  if (SC.filter === "suggest") return suggested();
  if (SC.stage === "ta") return SC.filter === "todo" ? recs.filter(r => r.ta_decision === "pending" && !r.presort) : recs;
  const ft = recs.filter(r => ["include", "unsure"].includes(r.ta_decision));
  return SC.filter === "todo" ? ft.filter(r => ["", "pending"].includes(r.ft_decision) && r.pdf_status !== "not-retrieved") : ft;
}

async function decide(decision, reason = "") {
  const q = queue(), i = q.findIndex(r => r.record_id === SC.id);
  if (i < 0) return;
  const next = q[i + 1] || q[i - 1];
  await api("decide", { record_id: SC.id, stage: SC.stage, decision, reason }, { silent: true });
  SC.excl = false;
  if (SC.filter === "todo") SC.id = next ? next.record_id : null;
  render();
}

PAGES.screening = () => {
  const q = queue();
  if (!q.find(r => r.record_id === SC.id)) SC.id = q[0]?.record_id || null;
  const rec = S.records.find(r => r.record_id === SC.id);
  const done = SC.stage === "ta" ? S.flow.unique - S.flow.ta_pending : S.flow.assessed;
  const total = SC.stage === "ta" ? S.flow.unique : S.flow.sought;
  const reasons = S.reasons[SC.stage];
  const dkey = SC.stage === "ta" ? "ta_decision" : "ft_decision", rkey = SC.stage === "ta" ? "ta_reason" : "ft_reason";

  const head = h("div", { class: "row", style: "margin-bottom:14px" },
    segmented([["ta", "Title / abstract"], ["ft", "Full text"]], SC.stage, v => { SC.stage = v; store.set("sc_stage", v); SC.id = null; if (SC.filter === "suggest" && !suggested(v).length) SC.filter = "todo"; render(); }),
    segmented([["todo", "To do"], ["all", "All"], ...(S.records.some(r => (r.notes || "").includes("[pilot]")) ? [["pilot", "Pilot"]] : []),
      ...(suggested().length ? [["suggest", `Suggested (${suggested().length})`]] : []),
      ...(SC.stage === "ta" && S.records.some(r => r.presort && r.ta_decision === "pending") ? [["presort", `Pre-sorted (${S.records.filter(r => r.presort && r.ta_decision === "pending").length})`]] : [])],
      SC.filter, v => { SC.filter = v; render(); }),
    h("div", { style: "flex:1;min-width:160px" }, bar(total ? done / total : 0), h("div", { class: "small muted" }, `${done} of ${total} decided`)),
    btn("Check decisions", e => busy(e.currentTarget, () => api("check")), ""),
    btn("Open Screening.base", () => openNote("08 - Screening.base"), "ghost"));

  let main;
  if (SC.filter === "suggest") {
    main = suggestView(q);
  } else if (SC.filter === "presort") {
    main = presortView(q);
  } else if (!rec) {
    main = h("div", { class: "card empty" }, h("div", { class: "big" }, total ? "🎉" : "📭"),
      h("h3", {}, total ? "Nothing left to screen here" : "No records yet"),
      h("p", {}, total ? "Switch to 'All' to review earlier decisions, or continue with the next stage." : "Import a database export in stage 7 first."));
  } else {
    const absBox = h("div", { class: "abstract" }, h("span", { class: "muted" }, "Loading abstract…"));
    const showAbs = r => absBox.innerHTML = r.abstract ? highlight(r.abstract) : `<span class="muted">No abstract in the export. Open the DOI to read it.</span>`;
    if (SC.cache[rec.record_id]) showAbs(SC.cache[rec.record_id]);
    else api("record_abstract", { record_id: rec.record_id }, { silent: true }).then(j => { SC.cache[rec.record_id] = j.record; if (SC.id === rec.record_id) showAbs(j.record); });
    const cur = rec[dkey];
    const reasonRow = h("div", { class: "reasons", style: SC.excl || cur === "exclude" ? "" : "display:none" },
      h("span", { class: "small muted", style: "align-self:center" }, "Reason:"),
      reasons.map((r, i) => h("button", { class: rec[rkey] && r.split(" ")[0] === rec[rkey].split(" ")[0] ? "on" : "", onclick: () => decide("exclude", r.split(" ")[0]) }, h("kbd", {}, i + 1), " ", r)));
    const notes = h("input", { type: "text", placeholder: "Note (optional) — e.g. 'other version of R0012'", value: rec.notes || "",
      onchange: e => api("set_record", { record_id: rec.record_id, fields: { notes: e.target.value } }, { render: false, silent: true }) });
    main = h("div", { class: "card rec" },
      h("div", { class: "meta" }, h("b", { style: "font-family:var(--mono)" }, rec.record_id), rec.year ? pill(rec.year) : null, rec.journal ? h("span", {}, rec.journal) : null,
        rec.language && !/^english$/i.test(rec.language) ? pill("language: " + rec.language, "bad") : null,
        rec.publication ? pill("in your library", "accent") : null,
        cur && cur !== "pending" ? pill("decided: " + cur + (rec[rkey] ? " · " + rec[rkey] : ""), decKind(cur)) : null,
        rec.sample_ta && SC.stage === "ta" ? pill("in 2nd-reviewer sample", "info") : null),
      h("h2", {}, rec.title),
      h("button", { class: "file", style: "margin:-2px 0 6px", title: "This paper's note — your decision is written here", onclick: () => openNote(S.record_files[rec.record_id]) },
        "📝 ", S.record_files[rec.record_id] || "", h("span", { class: "muted" }, ` · ${dkey} is saved here`)),
      h("div", { class: "authors" }, rec.authors),
      h("div", { class: "row", style: "margin-top:8px" },
        rec.doi ? h("a", { href: "https://doi.org/" + rec.doi, target: "_blank", class: "btn sm" }, "DOI ↗") : null,
        rec.oa_url ? h("a", { href: rec.oa_url, target: "_blank", class: "btn sm" }, "Open access ↗") : null,
        SC.stage === "ft" ? pill(rec.pdf_status ? "PDF: " + rec.pdf_status : "PDF: not checked", rec.pdf_status === "found" ? "ok" : rec.pdf_status ? "bad" : "") : null),
      absBox,
      h("div", { class: "decide" },
        h("button", { class: "inc" + (cur === "include" ? " on" : ""), onclick: () => decide("include") }, "✓ Include", h("kbd", {}, "I")),
        SC.stage === "ta" ? h("button", { class: "uns" + (cur === "unsure" ? " on" : ""), onclick: () => decide("unsure") }, "? Unsure", h("kbd", {}, "U"))
          : h("button", { class: "uns", onclick: () => api("mark_pdf", { record_id: rec.record_id, status: "not-retrieved" }) }, "⊘ Not retrieved"),
        h("button", { class: "exc" + (cur === "exclude" ? " on" : ""), onclick: () => { SC.excl = true; reasonRow.style.display = ""; } }, "✕ Exclude", h("kbd", {}, "E"))),
      reasonRow,
      h("div", { style: "margin-top:12px" }, notes),
      h("div", { class: "row", style: "margin-top:12px;justify-content:space-between" },
        btn("← Previous", () => move(-1), "ghost"), h("span", { class: "kbdhint" }, "I include · U unsure · E exclude · 1–9 reason · ←/→ move"), btn("Next →", () => move(1), "ghost")));
  }

  // the queue lists at most 400 records: those around the current one, so it is always in view
  const at = Math.max(0, q.findIndex(r => r.record_id === SC.id)), from = Math.max(0, Math.min(at - 100, q.length - 400));
  const shown = q.slice(from, from + 400);
  const side = h("div", {},
    h("div", { class: "card", style: "padding:12px" }, h("h3", { style: "padding:4px 6px" }, `Queue (${q.length})`,
      q.length > shown.length ? h("span", { class: "small muted" }, ` · showing ${from + 1}–${from + shown.length}`) : null),
      h("div", { class: "queue" }, shown.map(r => h("div", { class: "qitem" + (r.record_id === SC.id ? " cur" : ""), onclick: () => { SC.id = r.record_id; SC.excl = false; render(); } },
        h("span", { class: "dec-dot " + r[dkey] }), h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title))))),
    S.problems.length ? h("div", { class: "card", style: "padding:12px;border-left:4px solid var(--bad)" }, h("h3", {}, `${S.problems.length} problem(s)`),
      S.problems.slice(0, 30).map(p => h("div", { class: "small", style: "padding:3px 0;cursor:pointer", onclick: () => { SC.id = p.record_id; SC.filter = "all"; render(); } }, h("b", {}, p.record_id), " ", p.text))) : null);
  setTimeout(() => {                                    // keep the current record in view inside the queue list
    const list = document.querySelector(".queue"), cur = list?.querySelector(".qitem.cur");
    if (!cur) return;
    const box = list.getBoundingClientRect(), r = cur.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) list.scrollTop += r.top - box.top - box.height / 2;
  });
  return h("div", {}, head, h("div", { class: "screen" }, main, side));
};

function suggestView(q) {
  const batch = q.slice(0, 50);
  if (!batch.length) return h("div", { class: "card empty" }, h("div", { class: "big" }, "🎉"), h("h3", {}, "All suggestions reviewed"));
  const choice = D.sugg ??= {};
  const dec = r => r[aiKey("decision")], why = r => r[aiKey("why")], rsn = r => r[aiKey("reason")] || "";                       // record id -> "include" | "unsure" | "exclude:E1" …
  const opts = [["include", "Include"], ["unsure", "Unsure"], ...S.reasons[SC.stage].map(r => ["exclude:" + r.split(" ")[0], "Exclude " + r])];
  const val = r => choice[r.record_id] ?? (dec(r) === "exclude" ? "exclude:" + rsn(r) : dec(r));
  const order = { include: 0, unsure: 1, exclude: 2 };
  const rows = [...batch].sort((a, b) => order[dec(a)] - order[dec(b)] || rsn(a).localeCompare(rsn(b)));
  const counts = Counter => rows.reduce((m, r) => (m[val(r).split(":")[0]] = (m[val(r).split(":")[0]] || 0) + 1, m), {});
  const c = counts();
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:12px" }, `Batch of ${batch.length} of ${q.length} remaining. Claude read each ${SC.stage === "ta" ? "abstract" : "full text"} and suggests a decision (cautious: unsure when in doubt). Check the suggestions — click a title to see the abstract — change any you disagree with, then confirm the batch. The decisions are recorded as yours; changes to suggestions are noted per record.`),
    h("div", { class: "row", style: "margin-bottom:10px" }, pill(`${c.include || 0} include`, "ok"), pill(`${c.unsure || 0} unsure`, "warn"), pill(`${c.exclude || 0} exclude`, "bad"),
      h("span", { style: "flex:1" }),
      btn(`✓ Confirm these ${batch.length} decisions`, async e => {
        if (!(await confirmBox("Confirm batch", `Save ${batch.length} decisions as yours?`, "Save"))) return;
        const items = batch.map(r => { const [d, reason] = val(r).split(":"); return { id: r.record_id, decision: d, reason: reason || "" }; });
        busy(e.target, () => api("apply_decisions", { items, stage: SC.stage }).then(() => { for (const r of batch) delete choice[r.record_id]; }));
      }, "primary")),
    h("table", { class: "tbl" }, h("tr", {}, ["", "Record", "Claude suggests", "Your decision"].map(t => h("th", {}, t))),
      rows.map(r => {
        const changed = choice[r.record_id] !== undefined && choice[r.record_id] !== (dec(r) === "exclude" ? "exclude:" + rsn(r) : dec(r));
        const sel = h("select", { onchange: e => { choice[r.record_id] = e.target.value; render(); } }, opts.map(([v, t]) => h("option", { value: v, selected: v === val(r) }, t)));
        const abs = h("div", { class: "small muted", style: "display:none;margin-top:6px;max-width:640px" });
        return h("tr", {},
          h("td", {}, h("span", { class: "dec-dot " + val(r).split(":")[0] })),
          h("td", { style: "max-width:560px" }, h("a", { href: "#", onclick: async e => {
            e.preventDefault();
            if (abs.style.display === "none") { if (!abs.textContent) { const j = await api("record_abstract", { record_id: r.record_id }, { silent: true }); abs.innerHTML = highlight(j.record.abstract || "No abstract."); } abs.style.display = ""; }
            else abs.style.display = "none";
          } }, h("b", { style: "font-family:var(--mono);font-size:12px" }, r.record_id), " ", r.title), h("div", { class: "small muted" }, [r.year, r.journal].filter(Boolean).join(" · ")), abs),
          h("td", { style: "max-width:260px" }, pill(dec(r) + (rsn(r) ? " " + rsn(r) : ""), decKind(dec(r))), h("div", { class: "small muted" }, why(r))),
          h("td", {}, sel, changed ? h("div", { class: "small", style: "color:var(--warn)" }, "changed by you") : null));
      })));
}

function presortView(q) {
  const keep = D.presortOff ??= new Set();          // record ids the reviewer unticked
  const groups = {};
  q.forEach(r => (groups[r.presort] ??= []).push(r));
  const body = h("div", {});
  const draw = () => body.replaceChildren(...Object.entries(groups).sort().map(([code, rs]) => h("details", { class: "card", open: true, style: "padding:12px 16px" },
    h("summary", { style: "font-weight:700;color:var(--text)" }, `${code} · ${rs[0].presort_reason} — ${rs.length} record(s), ${rs.filter(r => !keep.has(r.record_id)).length} ticked`),
    h("div", { class: "queue", style: "max-height:420px;margin-top:8px" }, rs.map(r => h("label", { class: "qitem", style: "cursor:pointer" },
      h("input", { type: "checkbox", checked: !keep.has(r.record_id), onchange: e => { e.target.checked ? keep.delete(r.record_id) : keep.add(r.record_id); draw(); } }),
      h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title)))))));
  draw();
  const ticked = () => q.filter(r => !keep.has(r.record_id)).map(r => r.record_id);
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:12px" }, "These records were pre-sorted by fixed rules (non-English language; proceedings volumes; network-science or software topics without any product or design term). Glance through the titles and untick anything that might be relevant — unticked records go back to the normal queue. Confirming records the decision as yours."),
    h("div", { class: "row", style: "margin-bottom:12px" },
      btn("✓ Confirm ticked as excluded", async e => {
        if (await confirmBox("Confirm exclusions", `Exclude ${ticked().length} record(s) with their pre-sort reason, as your decision?`, "Exclude"))
          busy(e.target, async () => { const off = [...keep]; await api("bulk_decide", { ids: ticked() }); if (off.length) await api("clear_presort", { ids: off }); keep.clear(); });
      }, "primary"),
      keep.size ? btn(`Return ${keep.size} unticked to the queue`, () => api("clear_presort", { ids: [...keep] }).then(() => keep.clear()), "") : null),
    body);
}

function move(d) {
  const q = queue(), i = q.findIndex(r => r.record_id === SC.id);
  const n = q[i + d];
  if (n) { SC.id = n.record_id; SC.excl = false; render(); }
}

PAGES.reviewer = () => {
  const stage = h("select", {}, h("option", { value: "ta" }, "Title / abstract"), h("option", { value: "ft" }, "Full text"));
  const frac = h("input", { type: "number", step: "0.05", min: "0.05", max: "1", value: "0.2" });
  const seed = h("input", { type: "text", placeholder: "empty = random (logged)" });
  const g = st => {
    const a = S.agreement[st];
    return h("div", { class: "card", style: "margin:0;text-align:center" }, h("h3", {}, st === "ta" ? "Title / abstract" : "Full text"), gauge(a.kappa),
      h("div", { class: "small muted" }, `${a.sampled} sampled · ${a.decided} decided by both · agreement ${pct(a.agreement)}`),
      a.kappa != null ? h("div", { style: "margin-top:6px" }, a.kappa >= 0.6 ? pill("meets the usual 0.6 convention", "ok") : pill("below 0.6 — discuss and clarify criteria", "bad")) : null);
  };
  const dis = [...S.agreement.ta.disagreements.map(d => ({ ...d, st: "ta" })), ...S.agreement.ft.disagreements.map(d => ({ ...d, st: "ft" }))];
  return h("div", {},
    h("div", { class: "grid2" },
      card("1 · Draw the sample", "A random sample with a recorded seed. The sheet contains none of your decisions.",
        h("div", { class: "grid3" }, field("Stage", stage), field("Fraction", frac), field("Seed", seed)),
        h("div", { class: "row end", style: "margin-top:12px" }, btn("Draw sample & write sheet", async e => {
          const exists = S.records.some(r => r["sample_" + stage.value]);
          if (exists && !(await confirmBox("Sample exists", "A sample for this stage already exists. Draw a new one? The old draw stays in the log.", "Draw new sample"))) return;
          busy(e.target, () => api("sample", { stage: stage.value, fraction: frac.value, seed: seed.value, redo: exists }));
        }, "primary")),
        S.sheets.length ? h("div", { style: "margin-top:12px" }, h("b", { class: "small" }, "Sheets — send to your second reviewer:"),
          S.sheets.map(s => h("div", {}, h("a", { href: "#", onclick: e => { e.preventDefault(); download("09 - Second reviewer/" + s); } }, "⬇ " + s)))) : null),
      card("2 · Import the returned sheet", "The reviewer fills 'decision' (include / exclude / unsure) and 'reason'.",
        field("Stage of the sheet", (() => { const s2 = stage.cloneNode(true); D.r2stage = s2; return s2; })()),
        h("div", { style: "margin-top:10px" }, dropzone("The CSV sheet as returned", ".csv", p => api("import_r2", { path: p, stage: D.r2stage.value }))))),
    h("div", { class: "grid2", style: "margin-top:16px" }, g("ta"), g("ft")),
    card("Disagreements", "Resolve each by discussion; change your decision if needed and note the outcome.",
      dis.length ? h("table", { class: "tbl" }, h("tr", {}, ["Record", "You", "Second reviewer", ""].map(t => h("th", {}, t))),
        dis.map(d => h("tr", {}, h("td", {}, h("b", {}, d.record_id), " ", h("span", { class: "small" }, d.title)), h("td", {}, pill(d.mine, decKind(d.mine))),
          h("td", {}, pill(d.theirs, decKind(d.theirs)), d.reason ? h("span", { class: "small muted" }, " " + d.reason) : null),
          h("td", {}, btn("Open", () => { SC.stage = d.st; SC.filter = "all"; SC.id = d.record_id; go("screening"); }, "sm")))))
        : h("div", { class: "empty" }, "No disagreements (yet).")));
};

PAGES.snowballing = () => {
  const seeds = h("select", {}, h("option", { value: "included" }, "Included (full text)"), h("option", { value: "ta" }, "Include/unsure at title-abstract"));
  const back = h("input", { type: "checkbox", checked: true }), fwd = h("input", { type: "checkbox", checked: true });
  const per = h("input", { type: "number", value: "200", min: "5" });
  const rounds = S.rounds;
  const lastZero = rounds.length && rounds[rounds.length - 1].included === 0 && rounds[rounds.length - 1].added > 0;
  const max = Math.max(1, ...rounds.map(r => r.added));
  return h("div", {},
    card("Run a round", "References (backward) and citing papers (forward) of the seeds are fetched from OpenAlex and imported for screening.",
      h("div", { class: "grid3" }, field("Seeds", seeds), h("div", {}, h("span", { class: "small muted", style: "font-weight:600" }, "Directions"),
        h("div", { class: "stack", style: "margin-top:6px" }, h("label", { class: "check" }, back, "Backward (references)"), h("label", { class: "check" }, fwd, "Forward (citations)"))),
        field("Max per seed and direction", per, "Large rounds use more of the free OpenAlex daily budget.")),
      h("div", { class: "row end", style: "margin-top:12px" }, btn("Run next round", e => {
        const dirs = [back.checked && "backward", fwd.checked && "forward"].filter(Boolean);
        if (dirs.length) busy(e.currentTarget, () => api("snowball", { directions: dirs, seeds: seeds.value, per_seed: per.value }));
      }, "primary"))),
    lastZero ? h("div", { class: "callout ok", style: "margin-bottom:16px" }, "The last round has been screened and added no included study — the usual stopping rule is met. You can mark this stage done.") : null,
    card("Rounds", "Stop when a round adds no new included study.",
      rounds.length ? h("table", { class: "tbl" }, h("tr", {}, ["Round", "Records added", "", "Included so far"].map(t => h("th", {}, t))),
        rounds.map(r => h("tr", {}, h("td", {}, h("b", {}, "#" + r.round)), h("td", { class: "num" }, r.added),
          h("td", { style: "width:45%" }, bar(r.added / max)), h("td", { class: "num" }, r.included))))
        : h("div", { class: "empty" }, h("div", { class: "big" }, "❄️"), "No rounds yet.")));
};

// PDFs already on this PC: scan a folder, show the matches, copy the ticked ones into the review
async function scanPdfs(folder) {
  const j = await api("scan_pdfs", folder ? { folder } : {}, { render: false });
  D.scan = j.scan;
  D.scanPick = new Set(j.scan.matches.filter(m => m.how !== "likely").map(m => m.record_id));
  render();
}

function scanResults() {
  const sc = D.scan, pick = D.scanPick;
  const how = { doi: ["DOI matches", "ok"], title: ["title + first author", "ok"], likely: ["likely — check", "warn"] };
  if (!sc.matches.length) return h("div", { class: "callout", style: "margin-bottom:12px" },
    `No matches in ${sc.folder} (${sc.pdfs} PDFs read, ${sc.records} records without a full text). `, btn("Close", () => { D.scan = null; render(); }, "sm ghost"));
  return h("div", { class: "card", style: "padding:12px 16px;margin-bottom:14px;border-left:4px solid var(--accent);border-radius:0 12px 12px 0" },
    h("div", { class: "row", style: "margin-bottom:8px" },
      h("b", {}, `${sc.matches.length} match(es) in ${sc.folder.split(/[\\/]/).pop()}`),
      h("span", { class: "small muted" }, `${sc.pdfs} PDFs read. Ticked matches are copied (not moved) into 10 - Full texts under the record's name. Untick anything that is not the same paper.`),
      h("span", { class: "spacer", style: "flex:1" }),
      btn(`Copy ${pick.size} ticked PDF(s)`, e => busy(e.currentTarget, async () => {
        const items = sc.matches.filter(m => pick.has(m.record_id)).map(m => ({ record_id: m.record_id, pdf: m.pdf }));
        await api("attach_found", { items, folder: sc.folder }); D.scan = null; render();
      }), "primary"),
      btn("Close", () => { D.scan = null; render(); }, "ghost")),
    h("div", { class: "scroll", style: "max-height:360px;overflow:auto" }, h("table", { class: "tbl", style: "width:100%" },
      h("tr", {}, ["", "Record", "Match", "PDF found"].map(t => h("th", {}, t))),
      sc.matches.map(m => h("tr", {},
        h("td", {}, h("input", { type: "checkbox", checked: pick.has(m.record_id), "aria-label": `Copy the PDF for ${m.record_id}`,
          onchange: e => { e.target.checked ? pick.add(m.record_id) : pick.delete(m.record_id); render(); } })),
        h("td", {}, h("b", { style: "font-family:var(--mono)" }, m.record_id), " ", m.title, m.year ? h("span", { class: "muted" }, " · " + m.year) : null),
        h("td", {}, pill(how[m.how][0], how[m.how][1])),
        h("td", { class: "small", title: m.pdf }, m.name))))));
}

PAGES.retrieval = () => {
  const all = S.records.filter(r => ["include", "unsure"].includes(r.ta_decision));
  const st = r => r.pdf_status === "found" ? "found" : r.pdf_status === "not-retrieved" ? "not" : "find";
  const f = D.rfilter ??= "find";
  const inc = D.rinc ?? true;                       // included sources first: they are the ones to read
  const pool = all.filter(r => !inc || r.ft_decision === "include");
  const n = k => pool.filter(r => st(r) === k).length;
  const recs = pool.filter(r => f === "all" || st(r) === f);
  const stat = r => ({ found: pill("found", "ok"), not: pill("not retrieved", "bad"), find: pill("to find", "warn") })[st(r)];
  const actions = r => {
    const file = h("input", { type: "file", accept: ".pdf", style: "display:none", onchange: async () => { const p = await upload(file.files[0]); api("attach_pdf", { record_id: r.record_id, path: p }); } });
    const box = h("div", { style: "display:flex;flex-direction:column;gap:4px;align-items:stretch;min-width:120px" }, file);
    if (st(r) === "found") box.append(btn("📄 Open PDF", () => api("open_note", { note: `10 - Full texts/${r.file}.pdf` }, { silent: true }), "sm"),
      btn("Replace", () => file.click(), "sm ghost"));
    else if (st(r) === "not") box.append(btn("Undo", () => api("mark_pdf", { record_id: r.record_id, status: "" }), "sm ghost"));
    else box.append(btn("Attach PDF", () => file.click(), "sm"), btn("Not retrieved", () => api("mark_pdf", { record_id: r.record_id, status: "not-retrieved" }), "sm ghost"));
    return box;
  };
  return h("div", {},
    card("10 - Full texts", `${n("found")} found · ${n("not")} not retrieved · ${n("find")} to find`,
      h("div", { class: "row", style: "margin-bottom:12px" },
        btn("📁 Find PDFs in a folder…", e => busy(e.currentTarget, () => scanPdfs()), "primary"),
        S.pdf_folders.slice(0, 3).map(f => btn("↻ " + f.split(/[\\/]/).pop(), e => busy(e.currentTarget, () => scanPdfs(f)), "sm ghost")),
        btn("🔓 Find open-access links", e => busy(e.currentTarget, () => api("find_oa")), ""),
        h("span", { class: "small muted" }, "First the PDFs you already have, then open access, then your university access via the DOI. A missing PDF is not an exclusion.")),
      D.scan ? scanResults() : null,
      h("div", { class: "row", style: "margin-bottom:10px" },
        segmented([["find", `To find (${n("find")})`], ["found", `Found (${n("found")})`], ["not", `Not retrieved (${n("not")})`], ["all", "All"]], f, v => { D.rfilter = v; render(); }),
        h("label", { class: "small", style: "display:flex;gap:6px;align-items:center" },
          h("input", { type: "checkbox", checked: inc, onchange: e => { D.rinc = e.target.checked; render(); } }), "Included sources only")),
      recs.length ? h("div", { class: "scroll", style: "max-height:600px;overflow-x:auto" }, h("table", { class: "tbl", style: "width:100%" },
        h("tr", {}, ["Record", "Status", "Links", "Actions"].map(t => h("th", {}, t))),
        recs.map(r => h("tr", {},
          h("td", {}, h("b", { style: "font-family:var(--mono)" }, r.record_id), " ", r.title, h("div", { class: "small muted" }, r.authors.split(";")[0], r.year ? " · " + r.year : "")),
          h("td", {}, stat(r)),
          h("td", { style: "white-space:nowrap" }, r.doi ? h("a", { href: "https://doi.org/" + r.doi, target: "_blank" }, "DOI ↗") : null, r.oa_url ? [" · ", h("a", { href: r.oa_url, target: "_blank" }, "OA ↗")] : null),
          h("td", { style: "width:1%" }, actions(r)))))) : h("div", { class: "empty" }, all.length ? "Nothing in this view." : "No records have passed title/abstract screening yet.")));
};

PAGES.charting = () => {
  const fields = D.fields ??= S.state.charting.fields.map(f => ({ ...f }));
  const inc = S.records.filter(r => r.ft_decision === "include");
  const kind = r => (r.chart.checked_by || "").toLowerCase() === "reviewer" ? "me" : (r.chart.basis || "").toLowerCase() === "full text" ? "ft" : "abs";
  const n = k => inc.filter(r => kind(r) === k).length;
  const flt = D.cfilter ??= "all";
  const list = inc.filter(r => flt === "all" || kind(r) === flt);
  let sel = D.chartSel && inc.find(r => r.record_id === D.chartSel) ? D.chartSel : list[0]?.record_id;

  // field editor (rarely needed; protocol amendments) — collapsed
  const fl = h("div", { class: "stack" });
  const drawF = () => fl.replaceChildren(...fields.map((f, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
    h("input", { type: "text", value: f.name, placeholder: "field_name", style: "max-width:200px;font-family:var(--mono)", oninput: e => f.name = e.target.value }),
    h("input", { type: "text", value: f.description, placeholder: "What to record", oninput: e => f.description = e.target.value }),
    iconBtn("✕", "Remove field", () => { fields.splice(i, 1); drawF(); }))), btn("+ Add field", () => { fields.push({ name: "", description: "" }); drawF(); }, "sm"));
  drawF();

  const next = () => {                                  // next paper in the current filter that you have not checked
    const i = list.findIndex(r => r.record_id === sel);
    return list.slice(i + 1).find(r => kind(r) !== "me") || list.find(r => kind(r) !== "me" && r.record_id !== sel);
  };
  const form = h("div", {});
  const drawForm = () => {
    const r = inc.find(x => x.record_id === sel);
    if (!r) return form.replaceChildren(h("div", { class: "empty" }, "Nothing in this view."));
    const hasCols = Object.keys(r.chart).length > 0;
    const k = kind(r);
    form.replaceChildren(
      h("div", { class: "row", style: "align-items:flex-start;gap:10px;margin-bottom:6px" },
        h("div", { style: "flex:1" }, h("h3", { style: "margin:0" }, r.record_id + " · " + r.title),
          h("div", { class: "small muted", style: "margin-top:4px" }, r.authors, r.year ? " · " + r.year : "", r.journal ? " · " + r.journal : "")),
        pill(k === "me" ? "checked by you" : k === "ft" ? "AI · full text" : "AI · abstract", k === "me" ? "ok" : k === "ft" ? "info" : "warn")),
      h("div", { class: "row", style: "margin:8px 0 12px" },
        r.pdf_status === "found" ? btn("📄 Open PDF", () => api("open_note", { note: `10 - Full texts/${r.file}.pdf` }, { silent: true }), "")
          : h("span", { class: "small muted" }, "No PDF yet — values come from the abstract."),
        r.doi ? h("a", { href: "https://doi.org/" + r.doi, target: "_blank", class: "small" }, "DOI ↗") : null,
        h("span", { style: "flex:1" }),
        k !== "me" ? btn("✓ Checked — next", e => busy(e.currentTarget, async () => {
          const nx = next();
          await api("set_record", { record_id: r.record_id, fields: { chart_checked_by: "reviewer" } }, { silent: true });
          if (nx) D.chartSel = nx.record_id;
        }), "primary") : btn("Undo checked", () => api("set_record", { record_id: r.record_id, fields: { chart_checked_by: "AI" } }), "ghost"),
        btn("Next ›", () => { const nx = next(); if (nx) { D.chartSel = nx.record_id; render(); } }, "ghost")),
      r.notes ? h("details", { class: "small", style: "margin-bottom:10px" }, h("summary", { class: "muted" }, "Notes on this record"), h("div", { class: "muted", style: "margin-top:4px;white-space:pre-wrap" }, r.notes)) : null,
      ...(hasCols ? S.state.charting.fields.filter(f => f.name !== "checked_by").map(f => field(f.name, autosize(h("textarea", {
        rows: 2, value: r.chart[f.name] || "",
        onchange: e => { r.chart[f.name] = e.target.value; api("set_record", { record_id: r.record_id, fields: { ["chart_" + f.name]: e.target.value } }, { render: false, silent: true }).then(() => toast("Saved", "ok")); },
      })), f.description)) : [h("div", { class: "callout warn" }, "Add the charting columns first (Charting form, below).")]));
  };
  drawForm();
  return h("div", {},
    h("div", { class: "row", style: "margin-bottom:12px" },
      h("div", { style: "flex:1" }, bar(inc.length ? n("me") / inc.length : 0),
        h("div", { class: "small muted" }, `Checked by you: ${n("me")} of ${inc.length} included sources · AI from full text ${n("ft")} · AI from abstract ${n("abs")}`)),
      btn("Open Charting.base", () => openNote("12 - Charting.base"), "ghost")),
    h("div", { style: "display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:16px;align-items:start" },
      card("Included sources", null,
        segmented([["all", `All ${inc.length}`], ["ft", `Full text ${n("ft")}`], ["abs", `Abstract ${n("abs")}`], ["me", `Checked ${n("me")}`]], flt,
          v => { D.cfilter = v; D.chartSel = null; render(); }),
        h("div", { class: "queue", style: "max-height:640px;margin-top:10px" }, list.map(r => h("div", { class: "qitem" + (r.record_id === sel ? " cur" : ""), onclick: () => { D.chartSel = r.record_id; render(); } },
          h("span", { class: "dec-dot " + (kind(r) === "me" ? "include" : r.pdf_status === "found" ? "unsure" : "") }), h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title))))),
      card(null, null, form)),
    h("details", { class: "card", style: "margin-top:16px" },
      h("summary", { style: "font-weight:700;color:var(--text)" }, "Charting form (fields)", h("span", { class: "muted small", style: "font-weight:400" }, " — the data items (PRISMA-ScR 11); changing them after locking is an amendment")),
      h("div", { style: "margin-top:10px" }, fl), h("div", { class: "row end", style: "margin-top:10px" },
        btn("Save form", e => busy(e.currentTarget, () => api("save_fields", { fields }).then(() => delete D.fields)), ""),
        btn("Add columns to included records", e => busy(e.currentTarget, () => api("prepare_charting", {})), "primary"))));
};

PAGES.appraisal = () => {
  const tool = h("input", { type: "text", value: S.state.charting.appraisal_tool || "", placeholder: "e.g. MMAT 2018" });
  const inc = S.records.filter(r => r.ft_decision === "include");
  return h("div", {},
    card("Approach", "Choose a tool that suits the study designs. If you skip appraisal, use 'Skip' above and give the reason.",
      h("div", { class: "row", style: "flex-wrap:nowrap" }, tool, btn("Save", () => api("appraisal_tool", { tool: tool.value }), ""),
        btn("Add appraisal columns", () => api("prepare_charting", { appraisal: true }), "primary"))),
    card("Ratings", `${inc.length} included source(s)`, inc.length ? h("table", { class: "tbl" }, h("tr", {}, ["Source", "Rating", "Note"].map(t => h("th", {}, t))),
      inc.map(r => h("tr", {}, h("td", { style: "width:40%" }, h("b", {}, r.record_id), " ", r.title),
        h("td", { style: "width:180px" }, h("select", { onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal: e.target.value } }, { render: false, silent: true }) },
          ["", "high", "moderate", "low", "unclear"].map(v => h("option", { value: v, selected: (r.appraisal || "") === v }, v || "—")))),
        h("td", {}, h("input", { type: "text", value: r.appraisal_note || "", onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal_note: e.target.value } }, { render: false, silent: true }) })))))
      : h("div", { class: "empty" }, "No included sources yet.")));
};

PAGES.report = () => {
  const auto = S.checklist_auto;
  const kept = S.records.filter(r => r.ft_decision === "include");
  return h("div", {},
    kept.length ? card("Your library", "When the review is finished, copy the papers you kept to 98 - Publications. Everything else stays in this review's folder.",
      h("div", { class: "row" }, h("span", { class: "small muted", style: "flex:1" },
        `${kept.length} included paper(s); ${kept.filter(r => r.publication).length} already linked to a library note. Each gets a publication note from the template (or, if it is already in your library, this review is added to its 'included_in') and a copy of its PDF.`),
        btn("📚 Add kept papers to library", async e => {
          if (await confirmBox("Add to library", `Copy ${kept.length} included paper(s) to 98 - Publications? Do this when screening is final.`, "Add"))
            busy(e.target, () => api("add_to_library"));
        }, "primary"))) : null,
    h("div", { class: "grid2" },
      card("PRISMA flow", "Live from your records. The PRISMA flow note in Obsidian shows the same.", flowDiagram(S.flow),
        h("div", { class: "row end", style: "margin-top:8px" }, btn("Open note", () => openNote("14 - PRISMA flow.md"), "ghost"), btn("Refresh note", e => busy(e.currentTarget, () => api("report")), ""))),
      h("div", {},
        card("Exports", "For your reference manager and the tables in your manuscript.",
          h("div", { class: "row" },
            btn("⬇ BibTeX of included", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "bib" })); if (j?.download) download(j.download); }, ""),
            btn("⬇ Charting table (CSV)", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "csv" })); if (j?.download) download(j.download); }, ""))),
        card("Sync with the library", "Marks included papers in 98 - Publications (included_in). Preview first.",
          h("div", { class: "row" },
            btn("Preview", async e => { const j = await busy(e.currentTarget, () => api("sync", { apply: false }, { silent: true })); if (j) modal({ title: "Sync preview", body: h("pre", { class: "code" }, j.message || "Nothing to change.") }); }, ""),
            btn("Apply", async e => { if (await confirmBox("Apply sync?", "This writes included_in / candidate_in to the publication notes.", "Apply")) busy(e.target, () => api("sync", { apply: true })); }, "primary"))),
        card("Checklist progress", null, (() => {
          const n = Object.values(S.state.checklist).filter(c => c.done).length;
          return h("div", {}, h("div", { class: "big", style: "font-size:28px;font-weight:700" }, `${n} / 22`), bar(n / 22), h("div", { class: "small muted", style: "margin-top:4px" }, "PRISMA-ScR items marked as reported"));
        })()))),
    card("PRISMA-ScR checklist", "Tick each item and note where it is reported. 'Evidence' is what the tool can see in the vault.",
      h("table", { class: "tbl" }, h("tr", {}, ["#", "Item", "Evidence in the vault", "Location in manuscript", "Reported"].map(t => h("th", {}, t))),
        S.checklist_items.map(it => {
          const c = S.state.checklist[String(it.n)] || {};
          const loc = h("input", { type: "text", value: c.location || "", placeholder: "e.g. Methods 2.1" });
          const ok = h("input", { type: "checkbox", checked: !!c.done });
          const save = () => api("checklist", { n: it.n, location: loc.value, done: ok.checked }, { render: false, silent: true });
          loc.addEventListener("change", save); ok.addEventListener("change", save);
          return h("tr", {}, h("td", { class: "num" }, it.n), h("td", {}, h("b", {}, it.item), h("div", { class: "small muted" }, it.desc)),
            h("td", { class: "small" }, auto[String(it.n)] ? pill(auto[String(it.n)], "info") : h("span", { class: "muted" }, "—")),
            h("td", { style: "width:200px" }, loc), h("td", { style: "text-align:center" }, h("label", { class: "check" }, ok)));
        }))));
};

// ================================================================ keyboard
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector(".scrim");
  if (e.key === "Escape") { closeHelp(); return; }
  if (e.ctrlKey && e.key === "Enter" && CUR === "idea") { $("#page .btn.primary")?.click(); return; }
  if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    const i = S.stages.findIndex(s => s.key === CUR) + (e.key === "ArrowDown" ? 1 : -1);
    if (S.stages[i]) { e.preventDefault(); go(S.stages[i].key); }
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "?") { openHelp(CUR); return; }
  if (e.key.toLowerCase() === "x") { openExample(CUR); return; }
  if (e.key.toLowerCase() === "g") { openGlossary(); return; }
  if (e.key.toLowerCase() === "t") { openTimeline(); return; }
  if (CUR !== "screening" || !SC.id) return;
  const k = e.key.toLowerCase();
  if (k === "i") decide("include");
  else if (k === "u" && SC.stage === "ta") decide("unsure");
  else if (k === "e") { SC.excl = true; render(); }
  else if (/^[1-9]$/.test(k) && SC.excl) { const r = S.reasons[SC.stage][+k - 1]; if (r) decide("exclude", r.split(" ")[0]); }
  else if (e.key === "ArrowRight") move(1);
  else if (e.key === "ArrowLeft") move(-1);
});

// ================================================================ start
$("#reviewSel").addEventListener("change", async e => {
  if (e.target.value !== "__open__") return switchReview(e.target.value);
  e.target.value = REVIEW;
  openReviewFolder();
});
$("#btnTheme").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; store.set("theme", t); };
$("#btnGlossary").onclick = openGlossary;
$("#btnClaude").onclick = openClaudeGuide;
$("#btnTimeline").onclick = openTimeline;
$("#btnKeys").onclick = openKeys;
$("#btnTour").onclick = () => startTour();
$("#btnTour").classList.toggle("glow", store.get("toured", "") !== "yes");   // glows until the tour has been taken
$("#btnScr").onclick = () => openChecklist();
$("#main").addEventListener("scroll", () => $("#topwrap").classList.toggle("scrolled", $("#main").scrollTop > 4));

// Settings menu (theme, developer mode): opens on click, closes on Escape, outside click or after a choice
{
  const sb = $("#btnSettings"), menu = $("#settingsMenu");
  const show = on => { menu.hidden = !on; sb.setAttribute("aria-expanded", on); if (on) menu.querySelector("button").focus(); };
  sb.onclick = e => { e.stopPropagation(); show(menu.hidden); };
  menu.addEventListener("click", () => show(false));
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { show(false); sb.focus(); } });
}

// The draft (a review in the browser's own storage, where the app starts): save it to a folder, or open one.
function renderDraftBar() {
  const bar = $("#draftBar");
  bar.hidden = !backend.entry?.draft;
  bar.classList.toggle("has-content", draftHasContent());
  if (bar.hidden) return;
  const recent = S.reviews.filter(r => r !== REVIEW).slice(0, 2);
  bar.replaceChildren(
    h("span", { class: "draft-text" }, h("span", { class: "unsaved-badge" }, "● Not saved"),
      draftHasContent()
        ? " This draft exists only in this browser. Save it to a folder on your PC to keep it."
        : " Start writing here; save it to a folder on your PC when you want to keep it."),
    h("span", { class: "draft-actions" },
      btn("💾 Save to a folder…", e => busy(e.currentTarget, saveDraft), "sm primary"),
      btn("📂 Open a review folder…", openReviewFolder, "sm"),
      ...recent.map(r => btn(`▶ ${r.replace(/ records$/, "")}`, () => switchReview(r), "sm ghost"))));
}

// Closing or leaving the page with a draft that has content: the browser asks first (it shows its own wording).
// The draft is kept in the browser either way, but only a saved folder is safe from clearing the browser's data.
const draftHasContent = () => Boolean(backend.entry?.draft && S && (S.events.length || S.records.length || S.state.idea?.length));
window.addEventListener("beforeunload", e => {
  if (!draftHasContent()) return;
  e.preventDefault();
  e.returnValue = "";
});

async function saveDraft() {
  const name = (await promptText("Save the draft", "Name of the review. A folder \"<name> records\" is made in the place you choose next.", "e.g. Repairability review"))?.trim();
  if (!name) return;
  try {
    const entry = await backend.saveDraft(name);
    await switchReview(entry.name);
    toast(`Saved: ${entry.name}. From now on every change is written there.`, "ok");
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}

async function openReviewFolder() {
  try {
    const entry = await backend.pickFolder();
    await backend.open(entry);
    switchReview(entry.name);
  } catch (err) { if (err.name !== "AbortError") toast(err.message, "err"); }
}

async function switchReview(name) {
  try {
    S = await getJSON(`/api/state?review=${encodeURIComponent(name)}`);
    REVIEW = name; store.set("review", name);
    for (const k of Object.keys(D)) delete D[k];
    SC.id = null; SC.cache = {};
    if (!S.stages.find(s => s.key === CUR)) CUR = "idea";
    render();
  } catch (e) { toast(e.message, "err"); }
}

// Changes made outside Review Studio (Claude through bin/ai-assist.js, another program): re-read the review
// when the window comes back into view, and every 15 s while it is visible.
let checkingOutside = false;
async function checkOutside() {
  if (checkingOutside || document.hidden || !S) return;
  checkingOutside = true;
  try {
    if (await backend.refreshIfChanged()) {
      S = await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`);
      SC.cache = {};
      render();
      toast("Updated: the review was changed outside Review Studio (for example by Claude).", "ok");
    }
  } catch (e) { console.warn("checking for outside changes:", e); }
  finally { checkingOutside = false; }
}
window.addEventListener("focus", checkOutside);
document.addEventListener("visibilitychange", checkOutside);
setInterval(checkOutside, 15000);

// ================================================================ app tour
// A short, plain explanation of what the app is for, one highlighted part of the screen at a time.
// Offered once on the first visit; the 🎓 Tour button replays it.
const TOUR = [
  { title: "Welcome to PRISMA Studio 👋",
    text: "This app guides you through a scoping review, step by step: from your first idea to a finished PRISMA report. It keeps every step documented, so your review is transparent and easy to reproduce." },
  { target: "#stepper", title: "The 15 stages",
    text: "Your review in order: planning (questions, search terms, protocol), conducting (searching, screening, full texts, charting) and reporting. Optional stages are marked. Click any stage to open it." },
  { target: "#topbar", title: "One stage at a time",
    text: "Each stage says what to do and where it is saved. ? Help explains the method (with a filled-in example), and ✓ Mark done moves you on." },
  { target: "#draftBar", title: "Your files stay on your PC",
    text: "You start in a draft kept in this browser. Save it to a folder when you want to keep it: the review becomes plain notes, tables and PDFs on your PC. Nothing is uploaded." },
  { target: ".toolbar", title: "Tools for every stage",
    text: "The timeline of everything you did, the PRISMA-ScR checklist and, if you want it, AI help from Claude, which only ever suggests. The glossary and keyboard shortcuts are under ⚙ Settings." },
  { title: "Ready? Start with your idea ✍️",
    text: "Write down what you want to find out and why. It's fine to be vague: the next stage makes it precise. You can replay this tour with 🎓 Tour at the top." },
];

function offerTour() {
  const card = h("div", { class: "tour-offer", role: "dialog", "aria-label": "App tour" },
    h("div", { class: "tour-offer-text" }, h("b", {}, "New here?"), " Take the 1-minute tour to see what PRISMA Studio does."),
    h("div", { class: "row" },
      btn("🎓 Start tour", () => { card.remove(); startTour(); }, "sm primary"),
      btn("Not now", () => { card.remove(); store.set("toured", "skipped"); }, "sm ghost")));
  document.body.append(card);
}

let tourClose = null;                         // closes the step on screen
function startTour(i = 0) {
  tourClose?.();
  document.querySelector(".tour-offer")?.remove();
  store.set("toured", "yes");
  $("#btnTour").classList.remove("glow");
  const steps = TOUR.filter(s => !s.target || (document.querySelector(s.target) && !document.querySelector(s.target).hidden));
  const step = steps[i];
  if (!step) return;
  const target = step.target && document.querySelector(step.target);
  const wrap = h("div", { class: "tour" });
  const spot = h("div", { class: "tour-spot" + (target ? "" : " none") });
  const close = () => { wrap.remove(); document.removeEventListener("keydown", keys, true); window.removeEventListener("resize", place); tourClose = null; };
  tourClose = close;
  const card = h("div", { class: "tour-card", role: "dialog", "aria-label": step.title },
    h("div", { class: "tour-count" }, `${i + 1} of ${steps.length}`),
    h("h3", {}, step.title), h("p", {}, step.text),
    h("div", { class: "row tour-buttons" },
      i < steps.length - 1 ? btn("Skip tour", close, "sm ghost") : null,
      h("span", { class: "spacer" }),
      i > 0 ? btn("← Back", () => startTour(i - 1), "sm") : null,
      i < steps.length - 1 ? btn("Next →", () => startTour(i + 1), "sm primary") : btn("Let's start", () => { close(); go("idea"); }, "sm primary")));
  wrap.append(spot, card);
  document.body.append(wrap);
  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight, m = 14;
    let left = r.right + m, top = r.top;                                         // right of the target …
    if (left + cw > innerWidth - m) { left = Math.max(m, Math.min(r.left, innerWidth - cw - m)); top = r.bottom + m; }   // … or below it
    if (top + ch > innerHeight - m) top = Math.max(m, r.top - ch - m);                                                   // … or above it
    Object.assign(card.style, { left: `${left}px`, top: `${Math.max(m, top)}px` });
  }
  function keys(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && i < steps.length - 1) startTour(i + 1);
    else if (e.key === "ArrowLeft" && i > 0) startTour(i - 1);
    else return;
    e.stopPropagation(); e.preventDefault();
  }
  place();
  window.addEventListener("resize", place);
  document.addEventListener("keydown", keys, true);
  card.querySelector(".btn.primary")?.focus();
}

// main.js waits for this to time how long opening a review takes
window.studioReady = (async function start() {
  try {
    H = await getJSON("/api/help");
    try { S = await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`); }
    catch (e) {
      const { reviews } = await getJSON("/api/reviews");
      if (!reviews.length) throw new Error("No review anchor note found. Create a note with 'type: review' in its properties.");
      REVIEW = reviews[0]; store.set("review", REVIEW);
      S = await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`);
    }
    render();
    if (!store.get("toured", "")) offerTour();
  } catch (e) {
    $("#page").replaceChildren(h("div", { class: "card empty" }, h("div", { class: "big" }, "⚠️"), h("h3", {}, "Could not load the review"), h("p", {}, e.message)));
  }
})();

$("#btnDev").addEventListener("click", async () => {
  if (!S.dev_mode && !(await confirmBox("Developer mode", "Lift the locks? Locked parts (questions, concepts, search strings, protocol text, exclusion reasons, charting form) become editable without amendment reasons. Each change is still noted in the timeline.", "Switch on", true))) return;
  api("dev_mode", { on: !S.dev_mode });
});
