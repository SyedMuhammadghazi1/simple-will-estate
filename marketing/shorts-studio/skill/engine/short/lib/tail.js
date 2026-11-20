// jack-youtube Short library, part 3 of 3: the captions layer and the clock. Keep last.
// ============================================================ captions (own layer, unchanged)
if (MODE !== 'graphics') D.caps.forEach((c, k) => { const d = el(root, { top: px(c.cy - 42) }, 'cap', `<span>${c.text}</span>`); d.id = 'cap' + k; d.dataset.ov = 'cap';
  tl.set(d, { visibility: 'visible' }, c.start); tl.set(d, { visibility: 'hidden' }, c.end); });
if (MODE === 'captions') Array.from(root.children).forEach(ch => { if (!ch.classList.contains('cap')) ch.style.display = 'none'; });

// ============================================================ clock
const clock = { t: 0 };
tl.to(clock, { t: T, duration: T, ease: 'none', onUpdate: () => frame(clock.t) }, 0);
frame(0);
tl.seek(0);
})();
