// edit.js: captions and graphics on top of your own recording.
// edit_build.py writes window.EDIT (sizes, safe boxes, words, graphics). This file only draws it.
// Every move sits on one paused GSAP timeline, so any frame can be rendered on its own.
(function () {
  const E = window.EDIT, root = document.getElementById('root');
  const vars = (window.__hyperframes && window.__hyperframes.getVariables) ? window.__hyperframes.getVariables() : {};
  const baseOn = String(vars.base == null ? 'on' : vars.base) !== 'off';
  const capsOn = String(vars.captions == null ? 'on' : vars.captions) !== 'off';
  const css = document.documentElement.style;
  for (const [k, v] of Object.entries(E.style)) css.setProperty('--' + k, v);
  if (!baseOn) {                       // overlay-only render for editors: no video, clear background
    root.querySelectorAll('video').forEach(v => v.remove());
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    root.style.background = 'transparent';
  }
  const tl = gsap.timeline({ paused: true });
  const el = (parent, cls, box, html) => {
    const d = document.createElement('div');
    d.className = cls;
    if (box) Object.assign(d.style, { left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px' });
    if (html != null) d.innerHTML = html;
    parent.appendChild(d);
    return d;
  };

  // captions: each chunk is 1 to 3 words; each word lands as it is spoken, the spoken word wears the accent
  if (capsOn) {
    const band = el(root, 'caps', E.captionBox);
    for (const c of E.chunks) {
      const line = el(band, 'line');
      line.style.opacity = 0;
      const spans = c.words.map(w => {
        const m = el(line, 'mask'); const s = el(m, 'word', null, w.text); return s;
      });
      tl.set(line, { opacity: 1 }, c.t0);
      c.words.forEach((w, i) => {
        tl.fromTo(spans[i], { yPercent: 70, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.14, ease: 'power3.out' }, w.start);
        tl.set(spans[i], { color: E.style.capaccent || E.style.accent }, w.start);
        tl.set(spans[i], { color: E.style.caption }, Math.min(w.end + 0.08, c.words[i + 1] ? c.words[i + 1].start : c.t1));
      });
      tl.set(line, { opacity: 0 }, c.t1);
    }
  }

  // graphics: they land on their word, sit in a safe box away from the face, then leave
  // **word** in a title or end card wears the accent colour
  const mark = t => String(t || '').replace(/\*\*(.+?)\*\*/g, '<em>$1</em>');
  for (const g of E.graphics) {
    if (g.type === 'media') {               // a picture or clip in the free panel (built into index.html)
      const m = document.getElementById(g.id);
      if (!m) continue;
      tl.fromTo(m, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' }, g.t);
      tl.to(m, { opacity: 0, duration: 0.3, ease: 'power2.in' }, g.t + g.hold);
      continue;
    }
    const card = el(root, 'gfx ' + g.type, g.box);
    const fromX = g.side === 'left' ? -60 : g.side === 'right' ? 60 : 0;
    const fromY = g.side === 'top' ? -50 : g.side === 'bottom' ? 50 : 0;
    card.style.opacity = 0;
    if (g.type === 'stat') {
      const num = el(card, 'num', null, (g.prefix || '') + '0' + (g.suffix || ''));
      el(card, 'label', null, g.label || '');
      const p = { v: 0 };
      tl.to(p, { v: g.value, duration: 0.8, ease: 'power2.out',
        onUpdate: () => { num.textContent = (g.prefix || '') + Math.round(p.v).toLocaleString('en-US') + (g.suffix || ''); } }, g.t + 0.1);
    } else if (g.type === 'title') {
      el(card, 'head', null, mark(g.text));
      if (g.sub) el(card, 'sub', null, mark(g.sub));
    } else if (g.type === 'end') {
      el(card, 'kicker', null, g.kicker || 'Comment');
      el(card, 'key', null, mark(g.text || ''));
      if (g.sub) el(card, 'sub', null, mark(g.sub));
    } else {
      el(card, 'bar');
      el(card, 'text', null, mark(g.text));
    }
    tl.fromTo(card, { x: fromX, y: fromY, opacity: 0, scale: 0.94 }, { x: 0, y: 0, opacity: 1, scale: 1, duration: 0.55, ease: 'expo.out' }, g.t);
    tl.to(card, { x: fromX * 0.5, y: fromY * 0.5, opacity: 0, duration: 0.3, ease: 'power3.in' }, g.t + g.hold);
  }

  tl.set({}, {}, E.D);
  window.__timelines = window.__timelines || {};
  window.__timelines[root.dataset.compositionId] = tl;
  tl.seek(0);
})();
