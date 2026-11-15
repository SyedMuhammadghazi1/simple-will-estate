// A download card: a status line, one button, and a cursor that clicks it on cue. The button
// becomes a progress bar that starts to fill. Shows "this is open: start it" as the action itself.
//
// spec: { title, status, button, clickAt, running, size, tag, tagAt }
//   button   label before the click ("Start pre-load")
//   running  label after it ("Downloading…")
//   size     small text at the right of the bar ("212 GB")

import { clamp, ease, lerp, prog, settle } from "../timing.js";
import { cursor } from "./_art.js";
import { box, esc, h } from "./_util.js";

const W = 600;
const H = 300;

const prop = {
  build(el, spec) {
    box(el, W, H);
    const card = h("div", {
      class: "card",
      style: "position:absolute;inset:0;padding:26px 32px;",
      html: `
        <div class="mono" style="font-size:22px;color:var(--muted);white-space:nowrap">${esc(spec.title ?? "")}</div>
        <div class="serif" style="font-size:52px;line-height:1.12;font-weight:620;color:var(--ink);margin-top:6px;white-space:nowrap">${esc(spec.status ?? "")}</div>
        <div data-btn style="position:relative;height:84px;margin-top:22px;border:3.5px solid var(--line);border-radius:20px;background:var(--navy);overflow:hidden;box-shadow:6px 7px 0 var(--shadow)">
          <div data-fill style="position:absolute;left:0;top:0;bottom:0;width:0;background:var(--green)">
            <div data-stripes style="position:absolute;inset:0;background:repeating-linear-gradient(115deg, rgba(255,255,255,0.26) 0 14px, transparent 14px 32px)"></div>
          </div>
          <div data-label style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 34px var(--font-ui);color:#fff;white-space:nowrap"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:12px;white-space:nowrap">
          <div data-pct class="mono" style="font-size:22px;color:var(--muted)"></div>
          <div class="mono" style="font-size:22px;color:var(--muted)">${esc(spec.size ?? "")}</div>
        </div>`,
    });
    const pointer = h("div", {
      style: "position:absolute;left:0;top:0;width:44px;height:44px;opacity:0",
      html: cursor(44),
    });
    const tag = h(
      "div",
      {
        class: "tag",
        style:
          "position:absolute;right:-22px;top:-28px;background:var(--gold);color:#1c1917;opacity:0",
      },
      spec.tag ?? "",
    );
    el.append(card, pointer, tag);
    return {
      btn: card.querySelector("[data-btn]"),
      fill: card.querySelector("[data-fill]"),
      stripes: card.querySelector("[data-stripes]"),
      label: card.querySelector("[data-label]"),
      pct: card.querySelector("[data-pct]"),
      pointer,
      tag,
    };
  },

  update(state, t, ctx) {
    const spec = ctx.spec;
    const click = ctx.at(spec.clickAt ?? 0.8);
    // the cursor travels in from the lower right and presses the button
    const fly = ease.outCubic(prog(t, click - 0.5, click - 0.06));
    const x = lerp(W + 20, W * 0.62, fly);
    const y = lerp(H + 40, 196, fly);
    const press = t >= click - 0.06 && t < click + 0.1 ? 0.84 : 1;
    state.pointer.style.opacity = clamp(prog(t, click - 0.5, click - 0.4)).toFixed(3);
    state.pointer.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${press})`;

    const on = t >= click;
    const bump = on ? 1 + Math.exp(-12 * (t - click)) * Math.sin((t - click) * 30) * 0.03 : 1;
    state.btn.style.transform = `scale(${(press < 1 ? 0.975 : bump).toFixed(4)})`;
    // it starts to fill and keeps going: a real pre-load takes hours, so it never reaches the end
    const p = on ? 1 - Math.exp(-(t - click) / 2.6) : 0;
    const share = p * 0.62;
    state.fill.style.width = `${(share * 100).toFixed(2)}%`;
    state.stripes.style.backgroundPosition = `${(-t * 60).toFixed(1)}px 0`;
    const label = on ? (spec.running ?? "Downloading…") : (spec.button ?? "Start");
    if (state.label._t !== label) {
      state.label.textContent = label;
      state.label._t = label;
    }
    const pct = on ? `${Math.floor(share * 100)}%` : "";
    if (state.pct._t !== pct) {
      state.pct.textContent = pct;
      state.pct._t = pct;
    }
    if (spec.tag) {
      const at = ctx.at(spec.tagAt ?? 0.3);
      const tp = settle(t - at, 18);
      state.tag.style.opacity = clamp(prog(t, at, at + 0.07)).toFixed(3);
      state.tag.style.transform = `rotate(${lerp(14, 5, tp).toFixed(2)}deg) scale(${lerp(0.5, 1, tp).toFixed(4)})`;
    }
  },

  sfx(spec, ctx) {
    const click = ctx.at(spec.clickAt ?? 0.8);
    const cues = [
      { t: click, name: "click" },
      { t: click + 0.08, name: "swell", gain: 0.5 },
    ];
    if (spec.tag) cues.push({ t: ctx.at(spec.tagAt ?? 0.3), name: "pop" });
    return cues;
  },
};

export default prop;
