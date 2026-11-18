// An image from the reel's own folder (reels/<slug>/assets/...): framed like a card or full-bleed
// behind the beat, with a slow Ken Burns move so a still never sits still.
//
// spec: { src, w, h, fit: "cover" | "contain", frame, radius, fullbleed,
//         zoom: [from, to], pan: [x, y] (px over the prop's life), shade, label }
//   fullbleed  fills the whole 1080x1920 frame (use "z": 2 so the beat's other props sit on top)
//   shade      darkens the top and bottom so captions and fine print stay readable (0-1)

import { clamp, ease, lerp, prog } from "../timing.js";
import { box, esc, h } from "./_util.js";

const prop = {
  build(el, spec, ctx) {
    const full = !!spec.fullbleed;
    const w = full ? 1080 : (spec.w ?? 760);
    const hgt = full ? 1920 : (spec.h ?? 520);
    box(el, w, hgt);
    const frame = h("div", {
      class: spec.frame === false || full ? "" : "card",
      style: `position:absolute;inset:0;overflow:hidden;border-radius:${full ? 0 : (spec.radius ?? 26)}px;${full ? "" : "padding:0;"}`,
    });
    const img = h("img", {
      src: ctx.asset(spec.src),
      alt: "",
      style: `position:absolute;left:0;top:0;width:100%;height:100%;object-fit:${spec.fit ?? "cover"};object-position:${spec.position ?? "50% 50%"};transform-origin:50% 50%`,
    });
    frame.appendChild(img);
    if (full || spec.shade) {
      const s = spec.shade ?? 0.75;
      frame.appendChild(
        h("div", {
          style: `position:absolute;inset:0;background:linear-gradient(rgba(8,3,20,${s}) 0%, rgba(8,3,20,${s * 0.25}) 34%, rgba(8,3,20,${s * 0.15}) 60%, rgba(8,3,20,${s}) 100%)`,
        }),
      );
    }
    if (spec.label) {
      frame.appendChild(
        h(
          "div",
          {
            class: "mono",
            style:
              "position:absolute;left:18px;bottom:14px;font-size:18px;color:#fff;opacity:0.85;text-shadow:0 2px 6px #000",
          },
          esc(spec.label),
        ),
      );
    }
    el.appendChild(frame);
    return { img };
  },
  update(state, t, ctx) {
    const spec = ctx.spec;
    const [z0, z1] = spec.zoom ?? [1.04, 1.14];
    const [px, py] = spec.pan ?? [0, -30];
    const p = ease.inOutQuad(clamp(prog(t, 0, Math.max(1, ctx.dur))));
    state.img.style.transform = `translate(${lerp(0, px, p).toFixed(2)}px, ${lerp(0, py, p).toFixed(2)}px) scale(${lerp(z0, z1, p).toFixed(4)})`;
  },
};

export default prop;
