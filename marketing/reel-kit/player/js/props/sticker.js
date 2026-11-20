// An animated sticker from a sprite sheet (frames in a grid, left to right, top to bottom),
// played frame-accurately from the reel clock. It pops in, bobs, and can be mirrored.
//
// spec: { src, frames, cols, fw, fh, fps, w, flip, at, bob }
//   fw/fh   one frame's size in the sheet (px); w is the size it is drawn at

import { clamp, lerp, prog, settle } from "../timing.js";
import { box, h } from "./_util.js";

const prop = {
  build(el, spec, ctx) {
    const scale = (spec.w ?? spec.fw) / spec.fw;
    const w = spec.fw * scale;
    const hgt = spec.fh * scale;
    box(el, w, hgt);
    const rows = Math.ceil(spec.frames / spec.cols);
    const win = h("div", {
      style: `position:absolute;inset:0;overflow:hidden;opacity:0;transform-origin:50% 100%;filter:drop-shadow(0 14px 18px rgba(0,0,0,0.45))`,
    });
    const img = h("img", {
      src: ctx.asset(spec.src),
      alt: "",
      style: `position:absolute;left:0;top:0;width:${spec.cols * w}px;height:${rows * hgt}px;max-width:none`,
    });
    win.appendChild(img);
    el.appendChild(win);
    return { win, img, w, hgt };
  },
  update(s, t, ctx) {
    const spec = ctx.spec;
    const at = ctx.at(spec.at ?? 0);
    const fps = spec.fps ?? 15;
    const f = Math.max(0, Math.floor((t - at) * fps)) % spec.frames;
    const cx = (f % spec.cols) * s.w;
    const cy = Math.floor(f / spec.cols) * s.hgt;
    s.img.style.transform = `translate(${-cx}px, ${-cy}px)`;
    const p = settle(t - at, 14);
    const bob = Math.sin(t * 3 + (ctx.seed ?? 0)) * (spec.bob ?? 6);
    s.win.style.opacity = clamp(prog(t, at, at + 0.08)).toFixed(3);
    s.win.style.transform = `translateY(${bob.toFixed(2)}px) scale(${(spec.flip ? -1 : 1) * lerp(0.3, 1, p)}, ${lerp(0.3, 1, p).toFixed(4)})`;
  },
  sfx(spec, ctx) {
    return [{ t: ctx.at(spec.at ?? 0), name: "pop", gain: 0.8 }];
  },
};

export default prop;
