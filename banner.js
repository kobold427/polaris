'use strict';
(() => {
  const { api, el, star, t } = W;
  const bn = document.getElementById('bn');
  document.title = t(document.title);

  function render(p) {
    if (!p || !p.text) { bn.replaceChildren(); return; }
    const x = p.text;
    const act = (what) => { api.banner.action(what); };
    const btns = el('div', { className: 'btns' },
      el('button', { 'data-nodrag': true, onClick: () => act('dismiss') }, t('Dismiss')),
      x.action ? el('button', { className: 'go', 'data-nodrag': true, onClick: () => act('start') }, x.action) : null);
    bn.replaceChildren(...[
      el('div', { className: 'ttl', title: x.title }, x.title, p.info && p.info.kind === 'work-end' ? [' ', star()] : null),
      x.body ? el('div', { className: 'txt', title: x.body }, x.body) : null,
      x.extra ? el('div', { className: 'extra' }, x.extra) : null,
      btns,
      el('div', { className: 'prog', style: `animation-duration:${Math.max(1000, p.ms || 12000)}ms` }),
    ].filter(Boolean));
    bn.style.animation = 'none';
    void bn.offsetWidth;
    bn.style.animation = '';
  }

  api.banner.onShown(render);
  api.banner.state().then(render);
})();
