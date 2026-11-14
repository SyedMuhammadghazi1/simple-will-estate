// End card + loop. The table rises to fill the frame (so the stage never "cuts"), the mascot
// hops to centre stage, and the ask appears as the thing the viewer is being asked to do: a
// comment being typed and liked. The final frames cross-dissolve into frame 0 so the reel loops
// without a visible seam.

import { parseCaption } from "./captions.js";
import { LAYOUT } from "./theme.js";
import { clamp, ease, lerp, prog, settle } from "./timing.js";
import { esc, h } from "./props/_util.js";

const { W, H, tableY, mascot: M } = LAYOUT;

const NAVY_TOP = "#24456f";
const NAVY_BOTTOM = "#142a45";

export function buildEndcard(backLayer, frontLayer, spec, timeline) {
  if (!spec || !timeline.endcard) {
    return { update: () => null, sfx: () => [] };
  }
  const t0 = timeline.endcard.start;

  const rise = h("div", {
    style: `position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:linear-gradient(${NAVY_TOP}, ${NAVY_BOTTOM});`,
    html: `<div style="position:absolute;left:50%;top:500px;width:980px;height:980px;margin-left:-490px;border-radius:50%;background:radial-gradient(closest-side, rgba(244,185,66,0.20), rgba(244,185,66,0));" data-glow></div>`,
  });
  backLayer.appendChild(rise);

  const words = parseCaption(spec.headline ?? "");
  const headline = h("div", { class: "headline", style: "top:846px" });
  const wordEls = words.map((w, i) => {
    const el = h(
      w.accent ? "em" : "span",
      { style: "display:inline-block;opacity:0" },
      w.text + w.tail,
    );
    headline.appendChild(el);
    if (i < words.length - 1) headline.appendChild(document.createTextNode(" "));
    return el;
  });

  const keyword = spec.keyword ?? "";
  // Without a keyword the comment pill is left out and the rest closes up: a follow-only end
  // card, for testing the ask against the comment-keyword version.
  const up = keyword ? 0 : 126;
  const pill = h("div", {
    style:
      "position:absolute;left:50%;top:1046px;width:468px;height:104px;margin-left:-234px;background:#fffdf7;border:3.5px solid #1c1917;border-radius:22px;box-shadow:8px 9px 0 #0b1626;",
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
      style: `position:absolute;left:0;top:${1172 - up}px;width:1080px;text-align:center;font:500 27px var(--font-ui);color:#b9c6d9;opacity:0`,
    },
    spec.sub ?? "",
  );
  const brand = h("div", {
    style: `position:absolute;left:50%;top:${1226 - up}px;transform:translateX(-50%);padding:9px 24px 10px;border:3px solid #f6efe0;border-radius:999px;font:500 27px var(--font-mono);letter-spacing:0.06em;color:#f6efe0;white-space:nowrap;opacity:0`,
    html: esc(spec.brand ?? ""),
  });

  // required disclosure, inside the video (a caption-only disclosure is easy to miss)
  const legal = h(
    "div",
    { class: "legal", style: `top:${1318 - up}px;opacity:0` },
    spec.disclaimer ?? "",
  );
  if (!keyword) pill.style.display = "none";

  const front = h("div", { id: "endcard" }, headline, pill, sub, brand, legal);
  frontLayer.appendChild(front);
  const loopImg = h("img", { id: "loop-img", alt: "" });
  frontLayer.appendChild(loopImg);

  const T = {
    rise: 0.0,
    riseDur: 0.5,
    hop: 0.06,
    hopDur: 0.56,
    head: 0.36,
    pill: 0.74,
    type: 0.98,
    like: 1.62,
    sub: 1.12,
    brand: 1.26,
  };
  const typeStep = 0.085;

  /** Returns the mascot placement override while the end card is up, else null. */
  function update(t) {
    const te = t - t0;
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
      const p = ease.outCubic(prog(te, T.head + i * 0.055, T.head + i * 0.055 + 0.26));
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
    legal.style.opacity = ease.outCubic(prog(te, 0.5, 0.8)).toFixed(3);

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
      baseY: lerp(M.baseY, 786, e) - arc,
      scale: lerp(1, 1.42, e),
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
