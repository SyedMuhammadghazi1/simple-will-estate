"use strict";
// Shorts Studio page. Plain JavaScript, no build step. The server (../server.py) does the work;
// this file shows the project, collects the choices and polls while a step runs.

const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

const TYPES = {
  recording: [".mp4", ".mov", ".m4v", ".webm", ".mkv"],
  panel: [".mp4", ".mov", ".m4v", ".webm", ".png", ".jpg", ".jpeg", ".webp"],
  music: [".mp3", ".wav", ".m4a", ".aac"],
};
const TABS = ["Recording", "Cut", "Look", "Graphics", "Make"];
const S = {
  pid: null,
  st: null,
  styles: {},
  doctor: [],
  tab: 0,
  sel: null,
  cardWord: null,
  pending: false,
};
let saveTimer = null;
let pollTimer = null;
let wasRunning = false;

const running = () => S.st?.job?.status === "running";
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const size = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(1)} MB`);
const core = (t) => t.replace(/^[^\w']+|[^\w']+$/g, "");
const NUMS = new Set(
  "zero one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand million".split(
    " ",
  ),
);
const isNum = (t) => /\d/.test(t) || NUMS.has(core(t).toLowerCase());

function toast(msg) {
  const a = $("#activity");
  a.prepend(h("p", { class: "err", role: "alert" }, msg));
}

// ---- loading and saving ----------------------------------------------------------------------
async function init() {
  [S.styles, S.doctor] = await Promise.all([api("GET", "/api/styles"), api("GET", "/api/doctor")]);
  $("#doctor").replaceChildren(
    ...S.doctor.map((d) =>
      h(
        "span",
        { class: `chip ${d.ok ? "ok" : d.optional ? "opt" : "bad"}`, title: d.fix || d.detail },
        d.ok ? d.name : `${d.name}: ${d.detail}`,
      ),
    ),
  );
  $("#new").addEventListener("click", async () => {
    const name = prompt("Name this Short", "My Short");
    if (name == null) return;
    const { id } = await api("POST", "/api/projects", { name });
    await loadProjects(id);
  });
  $("#del").addEventListener("click", async () => {
    if (!S.pid || !confirm(`Delete "${S.st.meta.name}" and all its files? This cannot be undone.`))
      return;
    try {
      await api("POST", `/api/projects/${S.pid}/delete`);
      localStorage.removeItem("shorts.pid");
      await loadProjects();
    } catch (e) {
      toast(e.message);
    }
  });
  $("#project").addEventListener("change", (e) => open(e.target.value));
  await loadProjects(localStorage.getItem("shorts.pid"));
}

async function loadProjects(want) {
  let list = await api("GET", "/api/projects");
  if (!list.length) {
    const { id } = await api("POST", "/api/projects", { name: "My first Short" });
    want = id;
    list = await api("GET", "/api/projects");
  }
  const pid = list.some((p) => p.id === want) ? want : list[0].id;
  $("#project").replaceChildren(
    ...list.map((p) => h("option", { value: p.id, selected: p.id === pid }, p.name)),
  );
  await open(pid);
}

async function open(pid) {
  S.pid = pid;
  S.sel = S.cardWord = null;
  S.pending = false;
  localStorage.setItem("shorts.pid", pid);
  await refresh(true);
  S.tab = !S.st.meta.files.recording ? 0 : !S.st.has.cut ? 0 : S.st.has.final ? 4 : 1;
  render();
}

async function refresh(full) {
  // While a step runs the page polls. The choices on this page are the source of truth then:
  // only a full refresh (opening a project, an upload, starting a step) takes them from the server.
  const mine = !full && S.st ? S.st.meta : null;
  const st = await api("GET", `/api/projects/${S.pid}`);
  if (mine) {
    mine.files = st.meta.files;
    st.meta = mine;
  }
  S.st = st;
  const now = running();
  if (full || (wasRunning && !now)) render();
  else side();
  wasRunning = now;
  clearTimeout(pollTimer);
  if (now) pollTimer = setTimeout(() => refresh(false).catch(() => {}), 1200);
}

function save(patch) {
  Object.assign(S.st.meta, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const m = S.st.meta;
  await api("POST", `/api/projects/${S.pid}/save`, {
    drops: m.drops,
    fixes: m.fixes,
    cut: m.cut,
    model: m.model,
    plan: m.plan,
    quality: m.quality,
  });
}
async function run(chain) {
  try {
    await flush();
    await api("POST", `/api/projects/${S.pid}/run/${chain}`);
    S.pending = false;
    await refresh(false);
    wasRunning = running();
    render();
  } catch (e) {
    toast(e.message);
  }
}

// ---- the side column: player and activity ------------------------------------------------------
function side() {
  const st = S.st;
  const player = $("#player");
  const pick = st.has.final
    ? ["deliver/final.mp4", st.has.final, "The finished Short"]
    : st.has.cut
      ? ["work/cut.mp4", st.has.cut, "The cut, before captions and graphics"]
      : null;
  const want = pick ? `/p/${S.pid}/${pick[0]}?v=${pick[1]}` : "";
  if (player.dataset.src !== want) {
    player.dataset.src = want;
    if (want) player.src = want;
    else player.removeAttribute("src");
    player.style.display = want ? "" : "none";
    $("#noplay").style.display = want ? "none" : "";
    $("#playing").textContent = pick ? pick[2] : "";
  }
  const a = $("#activity");
  const j = st.job;
  if (!j) return a.replaceChildren();
  const open = a.querySelector("details")?.open;
  const icon = { waiting: "·", running: "◐", done: "✓", failed: "✕" };
  a.replaceChildren(
    ...j.steps.map((s) =>
      h(
        "div",
        { class: `step ${s.status}` },
        h("span", { class: "ic" }, icon[s.status]),
        s.name,
        h(
          "span",
          { class: "secs" },
          s.status === "running"
            ? `${Math.round(Date.now() / 1000 - s.started)} s`
            : s.seconds != null
              ? `${s.seconds} s`
              : "",
        ),
      ),
    ),
    j.error && h("p", { class: "err", role: "alert" }, j.error),
    h("details", { open }, h("summary", {}, "Details"), h("pre", { class: "log" }, st.log || "")),
  );
  const log = a.querySelector("pre");
  log.scrollTop = log.scrollHeight;
  document
    .querySelectorAll("[data-run]")
    .forEach((b) => (b.disabled = running() || b.dataset.off === "1"));
}

// ---- tabs ------------------------------------------------------------------------------------
function render() {
  const st = S.st;
  // a redraw must not take the cursor out of the box someone is typing in
  const active = document.activeElement;
  const typing = active && $("#panel").contains(active) && /INPUT|TEXTAREA/.test(active.tagName);
  const key = typing
    ? active.getAttribute("placeholder") || active.getAttribute("aria-label")
    : null;
  const caret = typing && active.type === "text" ? active.selectionStart : null;
  const done = [
    !!st.meta.files.recording,
    !!st.has.cut,
    !!st.has.cut,
    !!st.has.cut,
    !!st.has.final,
  ];
  $("#tabs").replaceChildren(
    ...TABS.map((t, i) =>
      h(
        "button",
        {
          class: `tab ${i === S.tab ? "on" : ""} ${done[i] ? "done" : ""}`,
          "aria-current": i === S.tab ? "step" : null,
          onclick: () => {
            S.tab = i;
            render();
          },
        },
        h("span", { class: "n" }, i + 1),
        t,
      ),
    ),
  );
  $("#panel").replaceChildren(
    ...[tabRecording, tabCut, tabLook, tabGraphics, tabMake]
      [S.tab]()
      .filter((x) => x && x !== true),
  );
  if (key) {
    const again = [...$("#panel").querySelectorAll("input, textarea")].find(
      (el) => (el.getAttribute("placeholder") || el.getAttribute("aria-label")) === key,
    );
    if (again) {
      again.focus();
      if (caret != null) again.setSelectionRange(caret, caret);
    }
  }
  side();
}
const runBtn = (label, chain, off, cls) =>
  h(
    "button",
    {
      "data-run": chain,
      "data-off": off ? "1" : "0",
      class: cls || "",
      disabled: off || running(),
      onclick: () => run(chain),
    },
    label,
  );
const next = (label) =>
  h(
    "button",
    {
      class: "ghost",
      onclick: () => {
        S.tab += 1;
        render();
      },
    },
    label,
  );

function uploader(kind, title, hint, accept) {
  const f = S.st.meta.files[kind];
  const input = h("input", { type: "file", accept });
  const bar = h("div", { class: "bar" });
  const info = h(
    "span",
    { class: "small muted" },
    f ? `${f.name} · ${size(f.size)}${f.dur ? ` · ${fmt(f.dur)}` : ""}` : hint,
  );
  const box = h("label", { class: `drop ${f ? "has" : ""}` }, h("b", {}, title), info, input, bar);
  const send = (file) => {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!TYPES[kind].includes(ext)) {
      info.textContent = `That file type is not supported here. Use ${TYPES[kind].join(", ")}`;
      info.className = "small err";
      return;
    }
    const x = new XMLHttpRequest();
    x.open("PUT", `/api/projects/${S.pid}/upload/${kind}?name=${encodeURIComponent(file.name)}`);
    x.upload.onprogress = (e) => {
      bar.style.width = `${(e.loaded / e.total) * 100}%`;
      info.textContent = `Uploading ${Math.round((e.loaded / e.total) * 100)}%`;
    };
    x.onload = () => {
      bar.style.width = "0";
      if (x.status !== 200) {
        let msg = "Upload failed.";
        try {
          msg = JSON.parse(x.responseText).error;
        } catch {
          /* keep the default message */
        }
        info.textContent = msg;
        info.className = "small err";
        return;
      }
      refresh(true);
    };
    x.onerror = () => (info.textContent = "Upload failed. Is the server still running?");
    x.send(file);
  };
  input.addEventListener("change", () => send(input.files[0]));
  box.addEventListener("dragover", (e) => (e.preventDefault(), box.classList.add("over")));
  box.addEventListener("dragleave", () => box.classList.remove("over"));
  box.addEventListener(
    "drop",
    (e) => (e.preventDefault(), box.classList.remove("over"), send(e.dataTransfer.files[0])),
  );
  return box;
}

function tabRecording() {
  const m = S.st.meta;
  const bad = S.doctor.filter((d) => !d.ok && !d.optional);
  return [
    h("h2", {}, "Your recording"),
    h("p", { class: "muted" }, "Drop in the raw video. Everything stays on this computer."),
    bad.length > 0 &&
      h(
        "div",
        { class: "note warn" },
        "Missing on this computer: ",
        bad.map((d) => `${d.name} (${d.fix})`).join("; "),
      ),
    h(
      "div",
      { class: "drops" },
      uploader("recording", "Recording", "The talking video (required)", "video/*,.mkv"),
      uploader(
        "panel",
        "Screen or picture",
        "Optional: shown above you (split layout)",
        "video/*,image/*",
      ),
      uploader("music", "Music", "Optional: a track you have the rights to", "audio/*"),
    ),
    h("h3", {}, "Speech model"),
    h(
      "div",
      { class: "row" },
      h(
        "select",
        { "aria-label": "Speech model", onchange: (e) => save({ model: e.target.value }) },
        ["tiny.en", "base.en", "small.en", "medium.en"].map((x) =>
          h(
            "option",
            { value: x, selected: x === m.model },
            x +
              (x === "small.en"
                ? " (recommended)"
                : x === "medium.en"
                  ? " (slower, more accurate)"
                  : ""),
          ),
        ),
      ),
      runBtn(
        S.st.has.cut ? "Transcribe and cut again" : "Transcribe and cut",
        "prepare",
        !m.files.recording,
      ),
      S.st.has.cut && next("Next: review the cut"),
    ),
    h(
      "p",
      { class: "muted small", style: "margin-top:10px" },
      "This finds every word, then removes the silences. The first run downloads the speech model.",
    ),
  ];
}

function tabCut() {
  const st = S.st;
  const m = st.meta;
  if (!st.raw.length)
    return [
      h("h2", {}, "The cut"),
      h("p", { class: "muted" }, "Transcribe the recording first (step 1)."),
    ];
  const kept = new Set(st.words.map((w) => w.i));
  const cutTime = new Map(st.words.map((w) => [w.i, w.start]));
  const inDrop = (w) => m.drops.some(([a, b]) => w.start >= a - 0.01 && w.end <= b + 0.01);
  const [sa, sb] = S.sel ? [Math.min(...S.sel), Math.max(...S.sel)] : [-1, -1];
  const box = h("div", { class: "words" });
  st.raw.forEach((w, k) => {
    const gap = k ? w.start - st.raw[k - 1].end : w.start;
    if (gap > 0.6) box.append(h("span", { class: "gap" }, `${gap.toFixed(1)} s`));
    const text = m.fixes[w.i] ?? w.text;
    box.append(
      h(
        "span",
        {
          class: `word ${inDrop(w) ? "drop-user" : kept.has(w.i) ? "" : "gone"} ${w.i >= sa && w.i <= sb ? "sel" : ""}`,
          tabindex: 0,
          role: "button",
          title: `${w.start.toFixed(2)} s`,
          onclick: (e) => {
            S.sel = S.sel && (e.shiftKey || S.sel.length === 1) ? [S.sel[0], w.i] : [w.i];
            if (cutTime.has(w.i) && $("#player").dataset.src.includes("cut.mp4"))
              $("#player").currentTime = cutTime.get(w.i);
            const top = $(".words").scrollTop;
            render();
            $(".words").scrollTop = top;
          },
          onkeydown: (e) => e.key === "Enter" && e.target.click(),
        },
        text,
      ),
    );
  });
  const range = () => [st.raw.find((w) => w.i === sa), st.raw.find((w) => w.i === sb)];
  const change = (fn) => () => {
    fn();
    S.pending = true;
    S.sel = null;
    save({});
    render();
  };
  const c = m.cut;
  const num = (key, label, step) =>
    h(
      "label",
      { class: "f" },
      label,
      h("input", {
        type: "number",
        step,
        value: c[key],
        onchange: (e) => {
          c[key] = Number(e.target.value) || 0;
          S.pending = true;
          save({});
          render();
        },
      }),
    );
  const dur = m.files.recording.dur;
  const cd = st.edl ? st.edl.cut_duration : 0;
  return [
    h("h2", {}, "The cut"),
    st.edl
      ? h(
          "p",
          { class: "muted" },
          `${fmt(dur)} recorded, ${fmt(cd)} after the cut (${st.edl.pieces.length} pieces, ${(st.words.length / Math.max(cd, 1)).toFixed(1)} words a second). `,
          "Struck-out words are gone. Click a word, then another, to select a retake.",
        )
      : h("p", { class: "muted" }, "Not cut yet."),
    cd > 62 &&
      h(
        "div",
        { class: "note warn" },
        "Shorts work best at 27 to 62 seconds. Remove a section or trim the start and end below.",
      ),
    box,
    h(
      "div",
      { class: "row", style: "margin-top:10px" },
      h(
        "button",
        {
          class: "ghost",
          disabled: sa < 0,
          onclick: change(() => {
            const [a, b] = range();
            m.drops.push([a.start, b.end]);
          }),
        },
        "Remove selected words",
      ),
      h(
        "button",
        {
          class: "ghost",
          disabled: sa < 0,
          onclick: change(() => {
            const [a, b] = range();
            m.drops = m.drops.filter(([x, y]) => y < a.start - 0.01 || x > b.end + 0.01);
          }),
        },
        "Put them back",
      ),
      h(
        "button",
        {
          class: "ghost",
          disabled: sa < 0 || sa !== sb,
          onclick: () => {
            const w = st.raw.find((x) => x.i === sa);
            const fixed = prompt(
              "Correct this word (names and products are often misheard)",
              core(m.fixes[sa] ?? w.text),
            );
            if (fixed == null) return;
            change(() => {
              if (fixed.trim()) m.fixes[sa] = fixed.trim();
              else delete m.fixes[sa];
            })();
          },
        },
        "Fix spelling",
      ),
      runBtn(
        S.pending ? "Apply changes (cut again)" : "Cut again",
        "recut",
        false,
        S.pending ? "" : "ghost",
      ),
      next("Next: the look"),
    ),
    S.pending &&
      h(
        "div",
        { class: "note" },
        "Changes are saved but not applied yet. Press “Apply changes” to cut again.",
      ),
    h(
      "details",
      {},
      h("summary", {}, "Fine tuning"),
      h(
        "div",
        { class: "row", style: "margin-top:10px" },
        num("noise", "Silence is quieter than (dB)", 1),
        num("min_silence", "Shortest silence to cut (s)", 0.1),
        num("pad", "Air kept around speech (s)", 0.02),
        num("from", "Start at (s, 0 = the start)", 0.5),
        num("to", "End at (s, 0 = the end)", 0.5),
      ),
    ),
  ];
}

function tabLook() {
  const st = S.st;
  const p = st.meta.plan;
  const set = (patch, redraw) => {
    Object.assign(p, patch);
    save({});
    if (redraw) render();
  };
  const frame = h("div", { class: "face" });
  if (st.has.frame) {
    const img = h("img", {
      src: `/p/${S.pid}/work/frame.jpg?v=${st.has.frame}`,
      alt: "A frame of your recording",
    });
    const boxEl = h("div", { class: "box" });
    const place = () => {
      const [l, t, r, b] = p.face;
      Object.assign(boxEl.style, {
        left: `${l}%`,
        top: `${t}%`,
        width: `${r - l}%`,
        height: `${b - t}%`,
      });
    };
    place();
    let start = null;
    const at = (e) => {
      const q = frame.getBoundingClientRect();
      const c = (v) => Math.min(100, Math.max(0, Math.round(v)));
      return [c(((e.clientX - q.left) / q.width) * 100), c(((e.clientY - q.top) / q.height) * 100)];
    };
    frame.addEventListener("pointerdown", (e) => {
      start = at(e);
      frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener("pointermove", (e) => {
      if (!start) return;
      const [x, y] = at(e);
      p.face = [
        Math.min(start[0], x),
        Math.min(start[1], y),
        Math.max(start[0], x),
        Math.max(start[1], y),
      ];
      place();
    });
    frame.addEventListener("pointerup", () => {
      if (!start) return;
      start = null;
      if (p.face[2] - p.face[0] < 5 || p.face[3] - p.face[1] < 5) p.face = [30, 10, 70, 75];
      place();
      save({});
    });
    frame.append(img, boxEl);
  }
  return [
    h("h2", {}, "The look"),
    h("p", { class: "muted" }, "Pick a preset. Captions and cards use its colours and font."),
    h(
      "div",
      { class: "presets" },
      Object.entries(S.styles).map(([key, s]) =>
        h(
          "button",
          {
            class: `preset ${p.style === key ? "on" : ""}`,
            "aria-pressed": p.style === key,
            onclick: () => set({ style: key, accent: "" }, true),
          },
          s.name,
          h(
            "div",
            { class: "sw" },
            ["ground", "panel", "ink", "accent"].map((k) =>
              h("i", { style: `background:${s.style[k]}` }),
            ),
          ),
          h("span", { class: "small muted" }, s.about),
        ),
      ),
    ),
    h(
      "div",
      { class: "row", style: "margin-top:14px" },
      h(
        "label",
        { class: "f" },
        "Accent colour",
        h("input", {
          type: "color",
          value: p.accent || S.styles[p.style]?.style.accent || "#7cf29c",
          onchange: (e) => set({ accent: e.target.value }),
        }),
      ),
      h(
        "label",
        { class: "f" },
        "Layout",
        h(
          "select",
          { onchange: (e) => set({ layout: e.target.value }) },
          [
            ["auto", "Automatic"],
            ["crop", "Full: just you, cropped tall"],
            ["split", "Split: you below, a panel above"],
          ].map(([v, t]) => h("option", { value: v, selected: p.layout === v }, t)),
        ),
      ),
      h(
        "label",
        { class: "f" },
        "Captions",
        h(
          "select",
          {
            onchange: (e) =>
              set({ captions: e.target.value !== "0", max_words: Number(e.target.value) || 3 }),
          },
          [
            ["3", "Up to 3 words at a time"],
            ["2", "Up to 2 words"],
            ["1", "One word at a time"],
            ["0", "No captions"],
          ].map(([v, t]) =>
            h("option", { value: v, selected: (p.captions ? String(p.max_words) : "0") === v }, t),
          ),
        ),
      ),
    ),
    st.meta.files.panel &&
      h(
        "p",
        { class: "small muted", style: "margin-top:8px" },
        "A screen recording or picture was uploaded, so the split layout is used.",
      ),
    h("h3", {}, "Where your face is"),
    st.has.frame
      ? h(
          "p",
          { class: "muted small" },
          "Drag a box around your head and shoulders. Nothing is ever placed on top of it.",
        )
      : h("p", { class: "muted small" }, "Cut the recording first to see a frame here."),
    st.has.frame && frame,
    h("div", { class: "row", style: "margin-top:14px" }, next("Next: graphics")),
  ];
}

function tabGraphics() {
  const st = S.st;
  const p = st.meta.plan;
  if (!st.words.length)
    return [
      h("h2", {}, "Graphics"),
      h("p", { class: "muted" }, "Cut the recording first (step 1)."),
    ];
  const byI = new Map(st.words.map((w) => [w.i, w]));
  p.cards = p.cards.filter((c) => byI.has(c.word_i));
  const carded = new Set(p.cards.map((c) => c.word_i));
  const box = h(
    "div",
    { class: "words" },
    st.words.map((w) =>
      h(
        "span",
        {
          class: `word ${carded.has(w.i) ? "card" : ""} ${isNum(w.text) ? "num" : ""} ${S.cardWord === w.i ? "sel" : ""}`,
          tabindex: 0,
          role: "button",
          title: `${w.start.toFixed(1)} s`,
          onclick: () => {
            S.cardWord = w.i;
            const top = $(".words").scrollTop;
            render();
            $(".words").scrollTop = top;
            $("#cardtext")?.focus();
          },
          onkeydown: (e) => e.key === "Enter" && e.target.click(),
        },
        w.text,
      ),
    ),
  );
  let form = null;
  if (S.cardWord != null && byI.has(S.cardWord)) {
    const w = byI.get(S.cardWord);
    const number = isNum(w.text);
    const type = h(
      "select",
      { "aria-label": "Card type" },
      h("option", { value: "callout", selected: !number }, "A short line"),
      h("option", { value: "stat", selected: number }, "A number that counts up"),
    );
    const text = h("input", {
      type: "text",
      id: "cardtext",
      class: "grow",
      placeholder: "Up to 6 words. **word** takes the accent colour",
      maxlength: 60,
    });
    const value = h("input", {
      type: "number",
      step: "any",
      value: core(w.text).replace(/[^\d.]/g, "") || 0,
      "aria-label": "Number",
    });
    const suffix = h("input", {
      type: "text",
      style: "width:70px",
      placeholder: "%, x, k",
      maxlength: 4,
      "aria-label": "Suffix",
    });
    const label = h("input", {
      type: "text",
      class: "grow",
      placeholder: "Label, 1 to 3 words",
      maxlength: 30,
      "aria-label": "Label",
    });
    const fields = h("div", { class: "row grow" });
    const show = () =>
      fields.replaceChildren(...(type.value === "stat" ? [value, suffix, label] : [text]));
    type.addEventListener("change", show);
    show();
    form = h(
      "div",
      { class: "carditem", style: "margin-top:10px" },
      h("span", { class: "when" }, `On “${w.text}” at ${w.start.toFixed(1)} s`),
      type,
      fields,
      h(
        "button",
        {
          onclick: () => {
            const card =
              type.value === "stat"
                ? {
                    type: "stat",
                    word_i: w.i,
                    value: Number(value.value) || 0,
                    suffix: suffix.value.trim(),
                    label: label.value.trim(),
                  }
                : { type: "callout", word_i: w.i, text: text.value.trim() };
            if (card.type === "callout" && !card.text) return text.focus();
            p.cards = p.cards.filter((c) => c.word_i !== w.i).concat(card);
            S.cardWord = null;
            save({});
            render();
          },
        },
        "Add card",
      ),
    );
  }
  const input = (key, obj, ph, max) =>
    h("input", {
      type: "text",
      class: "grow",
      value: obj[key] || "",
      placeholder: ph,
      maxlength: max,
      oninput: (e) => {
        obj[key] = e.target.value;
        save({});
      },
    });
  return [
    h("h2", {}, "Graphics"),
    h(
      "p",
      { class: "muted" },
      "Keep it light: a title, two or three cards, an ask at the end. One card at a time, six words at most.",
    ),
    h("h3", {}, "Hook title (on screen from the first frame)"),
    h(
      "div",
      { class: "row" },
      input("title", p, "2 to 6 words that say the promise, e.g. Build it in **12 minutes**", 60),
    ),
    h("h3", {}, "Cards (click the word a card should land on; numbers are underlined)"),
    box,
    form,
    h(
      "div",
      { class: "cards", style: "margin-top:10px" },
      p.cards
        .slice()
        .sort((a, b) => byI.get(a.word_i).start - byI.get(b.word_i).start)
        .map((c) =>
          h(
            "div",
            { class: "carditem" },
            h(
              "span",
              { class: "when" },
              `${byI.get(c.word_i).start.toFixed(1)} s · “${byI.get(c.word_i).text}”`,
            ),
            h(
              "span",
              { class: "grow" },
              c.type === "stat" ? `${c.value}${c.suffix || ""}  ${c.label || ""}` : c.text,
            ),
            h(
              "button",
              {
                class: "ghost",
                onclick: () => {
                  p.cards = p.cards.filter((x) => x !== c);
                  save({});
                  render();
                },
              },
              "Remove",
            ),
          ),
        ),
    ),
    h("h3", {}, "Ending"),
    h(
      "div",
      { class: "row" },
      h(
        "label",
        { class: "row" },
        h("input", {
          type: "checkbox",
          checked: p.end.on,
          onchange: (e) => {
            p.end.on = e.target.checked;
            save({});
          },
        }),
        "End card",
      ),
      h("div", { class: "kick" }, input("kicker", p.end, "Comment", 14)),
      input("word", p.end, "One short word in capitals, e.g. BUILD", 16),
    ),
    h("div", { class: "row", style: "margin-top:16px" }, next("Next: make it")),
  ];
}

function tabMake() {
  const st = S.st;
  const m = st.meta;
  const ready = !!st.has.cut;
  const gate = st.gate || [];
  const fails = gate.filter((g) => g.level === "FAIL").length;
  const warns = gate.filter((g) => g.level === "WARN").length;
  const key = S.doctor.find((d) => d.name === "Auphonic key")?.ok;
  return [
    h("h2", {}, "Make the Short"),
    h(
      "p",
      { class: "muted" },
      "Preview a few frames first, then render. The quality gate checks the result against the skill’s rules.",
    ),
    h(
      "div",
      { class: "row" },
      runBtn("Preview frames", "preview", !ready, "ghost"),
      runBtn("Make the Short", "make", !ready),
      h(
        "label",
        { class: "row small muted" },
        "Quality",
        h(
          "select",
          { onchange: (e) => save({ quality: e.target.value }) },
          [
            ["draft", "Draft (fast)"],
            ["high", "High (final)"],
          ].map(([v, t]) => h("option", { value: v, selected: (m.quality || "draft") === v }, t)),
        ),
      ),
      key && runBtn("Clean the voice (Auphonic)", "voice", !ready, "ghost"),
    ),
    !ready &&
      h(
        "p",
        { class: "muted small", style: "margin-top:8px" },
        "Upload and cut a recording first.",
      ),
    st.edit &&
      st.meta.plan.layout === "auto" &&
      h(
        "p",
        { class: "muted small", style: "margin-top:10px" },
        st.edit.layout === "split"
          ? "Layout used: split (you below, captions and cards above). Full face needs free room above or below the face box; draw the box tighter in step 3 to get it."
          : "Layout used: full face, with captions and cards clear of the face box.",
      ),
    st.stills.length > 0 && h("h3", {}, "Preview frames"),
    st.stills.length > 0 &&
      h(
        "div",
        { class: "stills" },
        st.stills.map((f) =>
          h("img", {
            src: `/p/${S.pid}/work/stills/${f}?v=${st.has.stills}`,
            alt: `Preview frame ${f}`,
            loading: "lazy",
          }),
        ),
      ),
    st.has.final > 0 && h("h3", {}, "Quality gate"),
    st.has.final > 0 &&
      gate.length > 0 &&
      h(
        "div",
        {},
        h(
          "div",
          { class: "verdict", style: `color:var(--${fails ? "bad" : warns ? "warn" : "accent"})` },
          fails
            ? `${fails} check${fails > 1 ? "s" : ""} failed. Fix and make it again.`
            : warns
              ? `Passed, with ${warns} thing${warns > 1 ? "s" : ""} to look at.`
              : "Passed every check.",
        ),
        h(
          "table",
          { class: "gate" },
          gate.map((g) =>
            h(
              "tr",
              {},
              h("td", {}, h("span", { class: `lv ${g.level}` }, g.level)),
              h("td", {}, g.check),
              h("td", { class: "muted" }, g.detail),
            ),
          ),
        ),
      ),
    st.has.final > 0 && h("h3", {}, "Files"),
    st.has.final > 0 &&
      h(
        "div",
        { class: "row" },
        h("a", { href: `/p/${S.pid}/deliver/final.mp4?download=1` }, "Download the Short (MP4)"),
        st.has.srt > 0 &&
          h("a", { href: `/p/${S.pid}/work/captions.srt?download=1` }, "Captions (SRT)"),
        st.has.contact > 0 &&
          h(
            "a",
            { href: `/p/${S.pid}/deliver/final-contact.jpg`, target: "_blank", rel: "noopener" },
            "Contact sheet",
          ),
      ),
  ];
}

init().catch((e) => {
  $("#panel").replaceChildren(h("p", { class: "err" }, `Could not start: ${e.message}`));
});
