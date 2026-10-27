/* Theme (light/dark/auto) + icon hydration. Load in <head> so the theme applies before paint. */
(function () {
  const KEY = 'poct-theme';
  const root = document.documentElement;
  root.classList.add('js');
  const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const set = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };
  const systemDark = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  const apply = (t) => { root.setAttribute('data-theme', t); document.dispatchEvent(new CustomEvent('themechange', { detail: t })); };
  apply(get() || (systemDark() ? 'dark' : 'light'));

  window.Theme = {
    current: () => root.getAttribute('data-theme'),
    toggle() { const n = this.current() === 'dark' ? 'light' : 'dark'; set(n); apply(n); return n; }
  };

  // <i data-i="name" data-c="extra-class"></i> -> inline svg icon
  window.hydrateIcons = function (scope) {
    (scope || document).querySelectorAll('i[data-i]').forEach((el) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('class', 'icon' + (el.dataset.c ? ' ' + el.dataset.c : ''));
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML = `<use href="img/icons.svg#${el.dataset.i}"/>`;
      el.replaceWith(s);
    });
  };

  // scroll reveal
  window.initReveal = function (scope) {
    const els = (scope || document).querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
    els.forEach((e) => io.observe(e));
  };

  // count-up for numbers: <span data-count="87.5" data-dec="1">
  window.countUp = function (el, to, dec, ms) {
    dec = dec || 0; ms = ms || 900;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toFixed(dec); return; }
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toFixed(dec); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
})();
