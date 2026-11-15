// End card + loop. The table rises to fill the frame (so the stage never "cuts"), the mascot
// hops to centre stage and the follow line builds under it. With `endcard.say` the line is
// spoken and its words appear as the voice reaches them; with `endcard.keyword` the ask is also
// shown as the thing the viewer is being asked to do: a comment being typed and liked. The final
// frames cross-dissolve into frame 0 so the reel loops without a visible seam.
//
// The stack (headline, comment pill, sub line, brand, legal line) is laid out from its measured
// heights and always ends inside the safe zone; a taller stack pushes the mascot up.

import { parseCaption } from "./captions.js";
import { LAYOUT } from "./theme.js";
import { clamp, ease, lerp, prog, settle } from "./timing.js";
import { esc, h } from "./props/_util.js";

const { W, H, tableY, mascot: M, SAFE } = LAYOUT;

const NAVY_TOP = "#24456f";
const NAVY_BOTTOM = "#142a45";

export function buildEndcard(backLayer, frontLayer, spec, timeline) {
  if (!spec || !timeline.endcard) {
    return { update: () => null, sfx: () => [] };
  }
  const t0 = timeline.endcard.start;

  const rise = h("div", {
    style: `position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:linear-gradient(${NAVY_TOP}, ${NAVY_BOTTOM});`,
    html: `<div style="position:absolute;left:50%;top:380px;width:980px;height:980px;margin-left:-490px;border-radius:50%;background:radial-gradient(closest-side, rgba(244,185,66,0.20), rgba(244,185,66,0));" data-glow></div>`,
  });
  backLayer.appendChild(rise);

  // "\n" in the headline forces a line break, so a three-line headline breaks where it reads best
  const headline = h("div", { class: "headline" });
  const words = [];
  const wordEls = [];
  String(spec.headline ?? "")
    .split("\n")
    .forEach((line) => {
      const row = h("div", {});
      const parsed = parseCaption(line);
      parsed.forEach((w, i) => {
        const el = h(
          w.accent ? "em" : "span",
          { style: "display:inline-block;opacity:0" },
          w.text + w.tail,
        );
        row.appendChild(el);
        if (i < parsed.length - 1) row.appendChild(document.createTextNode(" "));
        words.push(w);
        wordEls.push(el);
      });
      headline.appendChild(row);
    });
  // spoken end card: each headline word appears on the frame the voice reaches it
  const spoken = timeline.endcard.words ?? [];
  const synced = spoken.length === words.length && words.length > 0;

  // Without a keyword the comment pill is left out and the rest closes up: a follow-only end
  // card (the default; the keyword version is the one to test against it).
  const keyword = spec.keyword ?? "";
  const pill = h("div", {
    style:
      "position:absolute;left:50%;width:468px;height:104px;margin-left:-234px;background:#fffdf7;border:3.5px solid #1c1917;border-radius:22px;box-shadow:8px 9px 0 #0b1626;",
    html: `
      <div style="position:absolute;left:22px;top:22px;width:60px;height:60px;border-radius:50%;background:#f4b942;border:3.5px solid #1c1917"></div>
      <div style="position:absolute;left:102px;top:14px;font:500 19px var(--font-mono);letter-spacing:0.06em;color:#7b746b">you · now</div>
      <div style="position:absolute;left:102px;top:40px;font:700 42px var(--font-ui);letter-spacing:0.01em;color:#1c1917;white-space:nowrap"><span data-typed></span><span data-caret style="display:inline-block;width:4px;height:38px;margin-left:4px;background:#1c1917;vertical-align:-4px"></span></div>
      <svg data-heart viewBox="0 0 32 30" width="44" height="42" style="position:absolute;right:26px;top:31px;overflow:visible">
        <path d="M16 27 C4 18 1 12 1 8 A7.5 7.5 0 0 1 16 5.5 A7.5 7.5 0 0 1 31 8 C31 12 28 18 16 27 Z" fill="none" stroke="#1c1917" stroke-width="3" stroke-linejoin="round"/>
      </svg>`,
  });
  const typed = pill.querySelector("[data-typed]");
  const caret = pill.querySelector("[data-caret]");
  const heart = pill.querySelector("[data-heart]");
  const heartPath = heart.querySelector("path");

  const sub = h(
    "div",
    {
      style: `position:absolute;left:90px;width:900px;text-align:center;font:600 31px/40px var(--font-ui);color:#e6edf6;opacity:0`,
    },
    spec.sub ?? "",
  );
  const brand = h("div", {
    style: `position:absolute;left:50%;transform:translateX(-50%);padding:9px 24px 10px;border:3px solid #f6efe0;border-radius:999px;font:500 27px var(--font-mono);letter-spacing:0.06em;color:#f6efe0;white-space:nowrap;opacity:0`,
    html: esc(spec.brand ?? ""),
  });

  // required disclosure, inside the video (a caption-only disclosure is easy to miss)
  const legal = h("div", { class: "legal", style: "opacity:0" }, spec.disclaimer ?? "");
  if (!keyword) pill.style.display = "none";
  if (!spec.sub) sub.style.display = "none";
  if (!spec.brand) brand.style.display = "none";

  const front = h("div", { id: "endcard" }, headline, pill, sub, brand, legal);
  frontLayer.appendChild(front);
  const loopImg = h("img", { id: "loop-img", alt: "" });
  frontLayer.appendChild(loopImg);

  // Stack the parts from their measured heights. The stack starts under the mascot at y = 728
  // unless that would push the legal line past the safe zone; then everything moves up.
  let y = headline.offsetHeight;
  const place = (el, gap, height = el.offsetHeight) => {
    if (el.style.display === "none") return null;
    const at = y + gap;
    y = at + height;
    return at;
  };
  const offsets = [
    [pill, place(pill, 22, 104)],
    [sub, place(sub, 20)],
    [brand, place(brand, 16)],
    [legal, place(legal, 24)],
  ];
  const stackTop = Math.round(Math.min(728, SAFE.bottom - 10 - y));
  headline.style.top = `${stackTop}px`;
  for (const [el, at] of offsets) if (at != null) el.style.top = `${stackTop + at}px`;
  const mascotY = stackTop - 16;

  const T = {
    rise: 0.0,
    riseDur: 0.5,
    hop: 0.02,
    hopDur: 0.46,
    head: 0.36,
    pill: 0.74,
    type: 0.98,
    like: 1.62,
    // the sub line and brand come up with the card, so that after the first half second only
    // the headline is still arriving and the legal line can be read
    sub: 0.3,
    brand: 0.42,
  };
  const typeStep = 0.085;

  /** Returns the mascot placement override while the end card is up, else null. */
  function update(t) {
    // the same float tolerance the player uses for cuts
    const raw = t - t0;
    const te = raw > -1e-6 ? Math.max(0, raw) : raw;
    if (te < 0) {
      rise.style.display = "none";
      front.style.display = "none";
      loopImg.style.opacity = "0";
      return null;
    }
    rise.style.display = "";
    front.style.display = "";

    // the table rises: clip the navy panel from the table line up to the top of the frame
    const rp = ease.inOutCubic(prog(te, T.rise, T.rise + T.riseDur));
    const topY = lerp(tableY, 0, rp);
    rise.style.clipPath = `inset(${topY.toFixed(1)}px 0 0 0)`;

    words.forEach((_, i) => {
      const at = synced ? Math.max(0, spoken[i].t0 - 0.05 - t0) : T.head + i * 0.055;
      const p = ease.outCubic(prog(te, at, at + (synced ? 0.2 : 0.26)));
      wordEls[i].style.opacity = p.toFixed(3);
      wordEls[i].style.transform = `translateY(${((1 - p) * 22).toFixed(2)}px)`;
    });

    const pp = settle(te - T.pill, 18);
    pill.style.opacity = clamp(prog(te, T.pill, T.pill + 0.1)).toFixed(3);
    pill.style.transform = `scale(${lerp(0.7, 1, pp).toFixed(4)}) rotate(${((1 - pp) * -4).toFixed(2)}deg)`;
    const n = clamp(Math.floor((te - T.type) / typeStep) + 1, 0, keyword.length);
    const shown = te < T.type ? "" : keyword.slice(0, n);
    if (typed._t !== shown) {
      typed.textContent = shown;
      typed._t = shown;
    }
    const typing = te >= T.type && n < keyword.length;
    caret.style.opacity = te > T.like ? "0" : typing || Math.floor(te * 2.6) % 2 === 0 ? "1" : "0";

    const liked = te >= T.like;
    heartPath.setAttribute("fill", liked ? "#e0245e" : "none");
    heartPath.setAttribute("stroke", liked ? "#e0245e" : "#1c1917");
    const hs = liked ? 1 + Math.exp(-9 * (te - T.like)) * Math.sin((te - T.like) * 30) * 0.5 : 1;
    heart.style.transform = `scale(${hs.toFixed(4)})`;

    sub.style.opacity = ease.outCubic(prog(te, T.sub, T.sub + 0.3)).toFixed(3);
    const bp = settle(te - T.brand, 18);
    brand.style.opacity = clamp(prog(te, T.brand, T.brand + 0.12)).toFixed(3);
    brand.style.transform = `translateX(-50%) scale(${lerp(0.8, 1, bp).toFixed(4)})`;
    // the legal line comes up with the card, so it has the whole hold to be read
    legal.style.opacity = ease.outCubic(prog(te, 0.12, 0.38)).toFixed(3);

    if (timeline.loop) {
      const lp = prog(t, timeline.loop.start, timeline.loop.start + timeline.loop.dur);
      loopImg.style.opacity = ease.inOutQuad(lp).toFixed(3);
    }

    // mascot: one hop from its spot on the table to centre stage
    const hp = prog(te, T.hop, T.hop + T.hopDur);
    const e = ease.inOutCubic(hp);
    const arc = Math.sin(hp * Math.PI) * 150;
    return {
      x: lerp(M.x, 540, e),
      baseY: lerp(M.baseY, mascotY, e) - arc,
      scale: lerp(1, 1.3, e),
      shadow: 1 - clamp(hp * 3),
      captionFade: 1 - clamp(prog(te, 0, 0.16)),
    };
  }

  function sfx() {
    const cues = [{ t: t0 + T.rise, name: "swell" }];
    if (keyword) {
      cues.push({ t: t0 + T.pill, name: "pop" }, { t: t0 + T.like, name: "ding" });
    }
    for (let i = 0; i < keyword.length; i++)
      cues.push({ t: t0 + T.type + i * typeStep, name: "key" });
    return cues;
  }

  /** The renderer hands us frame 0 so the tail can dissolve into it. */
  function setLoopImage(src) {
    loopImg.src = src;
  }

  return { update, sfx, setLoopImage, start: t0 };
}
