'use strict';

// Detached mini timer. It renders snapshots produced by the main window and
// forwards button presses back, so both views always show the same session.
(() => {
  const api = window.fourfold;
  const $ = selector => document.querySelector(selector);
  const els = {
    phase: $('#phase'), round: $('#round'), time: $('#time'), dots: $('#dots'), task: $('#task'),
    toggle: $('#toggle'), reset: $('#reset'), skip: $('#skip'), complete: $('#complete'),
    pin: $('#pin'), mini: $('#mini'), close: $('#close'), status: $('#status'),
    custom: $('#custom'), customUnit: $('#custom-unit'), customStart: $('#custom-start'),
  };

  // Count down locally from the raw end timestamp. Snapshots are only used to
  // calibrate, so this window keeps ticking even if the main window renderer is
  // occluded, hidden or throttled by Chromium.
  let state = null, shownTime = '';
  const pad = n => String(n).padStart(2, '0');
  function paintTime() {
    if (!state) return;
    let text = typeof state.time === 'string' ? state.time : '';
    const running = !!state.running && Number(state.endAt) > 0;
    const milliseconds = running ? Math.max(0, Number(state.endAt) - Date.now()) : Number(state.remaining);
    if (Number.isFinite(milliseconds)) {
      const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
      text = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
    }
    if (text && text !== shownTime) {
      shownTime = text;
      els.time.textContent = text;
    }
  }

  function render(snapshot) {
    if (!snapshot) return;
    state = snapshot;
    document.documentElement.dataset.theme = snapshot.theme || 'system';
    document.documentElement.dataset.palette = snapshot.palette || 'ink';
    if (snapshot.language) {
      window.RixuI18n.setLanguage(String(snapshot.language).startsWith('en') ? 'en' : 'zh-CN');
      document.documentElement.lang = snapshot.language;
      document.title = window.RixuI18n.tr('日序 · 番茄钟');
      els.close.setAttribute('aria-label', window.RixuI18n.tr('关闭番茄钟窗口'));
      els.close.title = window.RixuI18n.tr('关闭番茄钟窗口');
      for (const [el, label] of [[els.pin, '悬浮置顶'], [els.mini, '迷你模式']]) {
        el.setAttribute('aria-label', window.RixuI18n.tr(label));
        el.title = window.RixuI18n.tr(label);
        el.classList.toggle('active', label === '悬浮置顶' ? !!snapshot.pin : !!snapshot.mini);
      }
      els.customStart.textContent = window.RixuI18n.tr('倒计时');
      els.customUnit.textContent = window.RixuI18n.tr('分钟');
      els.custom.setAttribute('aria-label', window.RixuI18n.tr('自定义倒计时分钟数'));
    }
    els.phase.textContent = snapshot.phase;
    els.round.textContent = snapshot.round;
    paintTime();
    els.dots.innerHTML = Array.from({ length: snapshot.dotsTotal }, (_, i) => `<i class="${i < snapshot.dotsFilled ? 'on' : ''}"></i>`).join('');
    els.task.textContent = snapshot.task;
    els.task.title = snapshot.task;
    els.toggle.textContent = snapshot.toggle;
    els.complete.hidden = !snapshot.canComplete;
    document.body.classList.toggle('running', snapshot.running);
    document.body.classList.toggle('mini', !!snapshot.mini);
    els.pin.classList.toggle('active', !!snapshot.pin);
    els.mini.classList.toggle('active', !!snapshot.mini);
    if (snapshot.status) els.status.textContent = snapshot.status;
  }

  const command = (name, extra) => api.call('pomodoro:command', { command: name, ...extra }).catch(error => { els.status.textContent = error.message; });
  els.toggle.onclick = () => command('toggle');
  els.reset.onclick = () => command('reset');
  els.skip.onclick = () => command('skip');
  els.complete.onclick = () => command('complete');
  const startCustom = () => {
    const minutes = Math.round(Number(els.custom.value));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) { els.status.textContent = window.RixuI18n.tr('请填写 1–180 分钟'); return; }
    els.custom.value = String(minutes);
    command('custom', { minutes });
  };
  els.customStart.onclick = startCustom;
  els.custom.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); startCustom(); } };
  // Commands are the only channel allowed from the detached window.
  els.close.onclick = () => command('close');
  els.pin.onclick = () => command('pin');
  els.mini.onclick = () => command('mini');

  api.onPomodoroState(render);
  setInterval(paintTime, 250);
})();
