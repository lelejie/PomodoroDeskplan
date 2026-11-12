'use strict';

// A local, self-contained Pomodoro timer. State lives in localStorage so a
// restart or a hidden/mini panel does not lose the current session. The popover
// can be dragged, and can be detached into a small movable desktop window.
(() => {
  const api = window.fourfold;
  const { tr } = window.RixuI18n;
  const { dateKey } = window.FourfoldTime;
  const STORE_KEY = 'rixu.pomodoro.v1';
  const POS_KEY = 'rixu.pomodoro.pos.v1';
  const DEFAULTS = { focus: 25, short: 5, long: 15, interval: 4, autoBreak: true, autoFocus: false, sound: true, autoTop: true };
  const PHASES = ['focus', 'short', 'long'];
  let settings = { ...DEFAULTS };
  let session = { phase: 'focus', running: false, endAt: 0, remaining: DEFAULTS.focus * 60000, cycle: 0, done: 0, day: dateKey(new Date()), custom: null };
  let current = null, els = {}, audio = null, lastTime = '', lastPublish = 0, ticker = 0;

  const pad = n => String(n).padStart(2, '0');
  const clampInt = (value, min, max, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const phaseMinutes = phase => settings[phase] * 60000;
  // A custom countdown replaces the standard focus length for one session only.
  const sessionTotal = () => (session.phase === 'focus' && session.custom ? session.custom * 60000 : phaseMinutes(session.phase));
  const phaseLabel = phase => tr(phase === 'focus' ? '专注' : phase === 'short' ? '短休息' : '长休息');
  const today = () => dateKey(new Date());

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!saved) return;
      const s = saved.settings || {};
      settings = {
        focus: clampInt(s.focus, 1, 180, DEFAULTS.focus),
        short: clampInt(s.short, 1, 60, DEFAULTS.short),
        long: clampInt(s.long, 1, 120, DEFAULTS.long),
        interval: clampInt(s.interval, 1, 12, DEFAULTS.interval),
        autoBreak: s.autoBreak !== false,
        autoFocus: !!s.autoFocus,
        sound: s.sound !== false,
        autoTop: s.autoTop !== false,
        pin: !!s.pin,
        mini: !!s.mini,
      };
      const d = saved.session || {};
      if (PHASES.includes(d.phase)) session.phase = d.phase;
      session.running = !!d.running;
      session.endAt = Number.isFinite(Number(d.endAt)) ? Number(d.endAt) : 0;
      session.remaining = Number.isFinite(Number(d.remaining)) ? Math.max(0, Number(d.remaining)) : phaseMinutes(session.phase);
      session.cycle = Math.max(0, Math.floor(Number(d.cycle) || 0));
      session.done = Math.max(0, Math.floor(Number(d.done) || 0));
      session.custom = d.custom === null || d.custom === undefined ? null : clampInt(d.custom, 1, 180, null) || null;
      session.day = typeof d.day === 'string' ? d.day : today();
      if (session.day !== today()) { session.day = today(); session.done = 0; session.cycle = 0; }
      if (session.custom && session.phase !== 'focus') session.custom = null;
      // A phase that elapsed while the app was closed rolls forward once, without auto-starting.
      if (session.running && session.endAt <= Date.now()) {
        session.running = false;
        advancePhase(true, false);
        session.running = false;
        session.endAt = 0;
      }
    } catch {}
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ settings, session })); } catch {}
  }

  function remaining() {
    if (session.running) return Math.max(0, session.endAt - Date.now());
    return Math.max(0, session.remaining);
  }

  function primeAudio() {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch { audio = null; }
  }
  function chime() {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const start = audio.currentTime + 0.02;
      [880, 1174.7, 1568].forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain(), at = start + i * 0.18;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.36);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(at); oscillator.stop(at + 0.4);
      });
    } catch {}
  }
  function notify(title, body) {
    if (!api) return;
    api.call('pomodoro:notify', { title, body }).catch(() => {});
  }

  function setStatus(message) {
    if (message) { els.status.textContent = message; return; }
    els.status.textContent = tr`今天已完成 ${session.done} 个番茄钟`;
  }

  function filledDots() {
    const interval = settings.interval;
    let filled = session.cycle % interval;
    if (session.cycle > 0 && filled === 0 && session.phase === 'long') filled = interval;
    return filled;
  }

  function advancePhase(completed, announce) {
    const wasFocus = session.phase === 'focus';
    if (wasFocus && completed) { session.done++; session.cycle++; }
    const next = wasFocus
      ? (session.cycle > 0 && session.cycle % settings.interval === 0 ? 'long' : 'short')
      : 'focus';
    session.phase = next;
    session.custom = null;
    session.remaining = phaseMinutes(next);
    const auto = next === 'focus' ? settings.autoFocus : settings.autoBreak;
    session.running = auto;
    session.endAt = auto ? Date.now() + session.remaining : 0;
    if (announce) {
      chime();
      if (wasFocus) notify(tr('日序 · 番茄钟'), `${tr('专注结束，休息一下')} · ${phaseLabel(next)}`);
      else notify(tr('日序 · 番茄钟'), tr('休息结束，继续专注'));
    }
    save();
  }

  function start() {
    if (session.running) return;
    if (session.remaining <= 0) session.remaining = phaseMinutes(session.phase);
    primeAudio();
    session.endAt = Date.now() + session.remaining;
    session.running = true;
    save(); render(true);
  }
  function pause() {
    if (!session.running) return;
    session.remaining = Math.max(0, session.endAt - Date.now());
    session.running = false;
    save(); render(true);
  }
  function reset() {
    session.running = false; session.endAt = 0;
    session.remaining = sessionTotal();
    save(); render(true);
  }
  function skip() {
    session.running = false;
    advancePhase(false, false);
    session.running = false; session.endAt = 0;
    setStatus(tr('已跳过这一段'));
    save(); render(true);
  }
  function toggle() { if (session.running) pause(); else start(); }

  // 一段按任务需要自定义时长的专注：立即开始，完成后照常计入番茄钟与轮次。
  function startCustom() {
    const minutes = clampInt(els.customInput.value, 1, 180, 0);
    if (!minutes) { setStatus(tr('请填写 1–180 分钟')); return; }
    els.customInput.value = String(minutes);
    primeAudio();
    session.phase = 'focus';
    session.custom = minutes;
    session.remaining = minutes * 60000;
    session.running = true;
    session.endAt = Date.now() + session.remaining;
    setStatus(tr`自定义倒计时 ${minutes} 分钟`);
    save(); render(true);
  }

  function snapshot() {
    const left = remaining(), total = sessionTotal();
    const started = session.running || left < total - 500;
    return {
      time: els.time.textContent,
      // The detached window counts down on its own from these raw values, so a
      // throttled or hidden main renderer can no longer freeze the display.
      endAt: session.running ? session.endAt : 0,
      remaining: left,
      total,
      phase: phaseLabel(session.phase),
      round: els.round.textContent,
      running: session.running,
      started,
      toggle: session.running ? tr('暂停') : (started ? tr('继续') : tr('开始')),
      dotsFilled: filledDots(),
      dotsTotal: settings.interval,
      task: current ? current.title : tr('还没有设为「正在做」的任务'),
      status: els.status.textContent,
      canComplete: !!current,
      autoTop: settings.autoTop !== false,
      pin: !!settings.pin,
      mini: !!settings.mini,
      theme: document.documentElement.dataset.theme || 'system',
      palette: document.documentElement.dataset.palette || 'ink',
      language: document.documentElement.lang || 'zh-CN',
    };
  }
  function publish(force) {
    if (!api) return;
    const at = Date.now();
    if (!force && at - lastPublish < 900) return;
    lastPublish = at;
    api.call('pomodoro:sync', { snapshot: snapshot() }).catch(() => {});
  }

  function render(force) {
    if (!els.time) return;
    const left = remaining(), total = sessionTotal();
    const seconds = Math.ceil(left / 1000);
    const time = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
    if (force || time !== lastTime) {
      lastTime = time;
      els.time.textContent = time;
      els.button.title = `${tr('番茄钟')} ${time}`;
      els.button.setAttribute('aria-label', `${tr('番茄钟')} ${time}`);
    }
    // Button and badge follow state changes immediately, even within the same second.
    const started = session.running || left < total - 500;
    els.badge.hidden = !started;
    els.badge.textContent = String(Math.ceil(left / 60000));
    els.toggle.textContent = session.running ? tr('暂停') : (started ? tr('继续') : tr('开始'));
    els.button.classList.toggle('running', session.running);
    els.phase.textContent = phaseLabel(session.phase);
    const round = Math.min(session.cycle + 1, settings.interval);
    els.round.textContent = tr`第 ${round} / ${settings.interval} 轮`;
    els.dots.innerHTML = Array.from({ length: settings.interval }, (_, i) => `<i class="${i < filledDots() ? 'on' : ''}"></i>`).join('');
    setStatus();
    publish(force);
  }

  function tick() {
    const day = today();
    if (session.day !== day) { session.day = day; session.done = 0; save(); }
    if (!session.running) return;
    if (session.endAt - Date.now() <= 0) {
      session.running = false; session.remaining = 0;
      advancePhase(true, true);
      render(true);
      return;
    }
    render();
  }

  function syncSettingsUI() {
    for (const key of ['focus', 'short', 'long', 'interval']) els.inputs[key].value = String(settings[key]);
    els.autoBreak.checked = settings.autoBreak;
    els.autoFocus.checked = settings.autoFocus;
    els.autoTop.checked = settings.autoTop !== false;
    els.sound.checked = settings.sound;
  }

  // ---- popover position (draggable) ----
  function clampPosition(left, top) {
    const rect = els.popover.getBoundingClientRect();
    const minLeft = 48, minTop = 6;
    const maxLeft = Math.max(minLeft, window.innerWidth - rect.width - 6);
    const maxTop = Math.max(minTop, window.innerHeight - rect.height - 6);
    return { left: Math.min(maxLeft, Math.max(minLeft, left)), top: Math.min(maxTop, Math.max(minTop, top)) };
  }
  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        const pos = clampPosition(saved.left, saved.top);
        els.popover.style.left = `${pos.left}px`;
        els.popover.style.top = `${pos.top}px`;
      }
    } catch {}
    keepPositionInView();
  }
  function keepPositionInView() {
    if (els.popover.hidden) return;
    const rect = els.popover.getBoundingClientRect();
    const pos = clampPosition(rect.left, rect.top);
    els.popover.style.left = `${pos.left}px`;
    els.popover.style.top = `${pos.top}px`;
  }
  function makeDraggable() {
    els.head.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault(); event.stopPropagation();
      const rect = els.popover.getBoundingClientRect();
      const origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      els.head.setPointerCapture(event.pointerId);
      document.body.classList.add('pomodoro-moving');
      const move = moveEvent => {
        const pos = clampPosition(origin.left + moveEvent.clientX - origin.x, origin.top + moveEvent.clientY - origin.y);
        els.popover.style.left = `${pos.left}px`;
        els.popover.style.top = `${pos.top}px`;
      };
      const end = () => {
        els.head.removeEventListener('pointermove', move);
        els.head.removeEventListener('pointerup', end);
        els.head.removeEventListener('pointercancel', end);
        document.body.classList.remove('pomodoro-moving');
        const next = els.popover.getBoundingClientRect();
        try { localStorage.setItem(POS_KEY, JSON.stringify({ left: next.left, top: next.top })); } catch {}
      };
      els.head.addEventListener('pointermove', move);
      els.head.addEventListener('pointerup', end);
      els.head.addEventListener('pointercancel', end);
    });
    window.addEventListener('resize', keepPositionInView);
  }

  function open() {
    els.popover.hidden = false;
    els.button.setAttribute('aria-expanded', 'true');
    restorePosition();
    render(true);
  }
  function close() { els.popover.hidden = true; els.button.setAttribute('aria-expanded', 'false'); }
  function togglePanel() { if (els.popover.hidden) open(); else close(); }

  async function detach() {
    close();
    try { await api.call('pomodoro:window', { open: true }); publish(true); }
    catch (error) { setStatus(error.message || tr('操作未完成，请重试')); }
  }

  function bind() {
    els = {
      button: document.querySelector('#pomodoro-button'), badge: document.querySelector('#pomodoro-badge'),
      popover: document.querySelector('#pomodoro-popover'), head: document.querySelector('.pomodoro-head'),
      phase: document.querySelector('#pomodoro-phase'), round: document.querySelector('#pomodoro-round'),
      time: document.querySelector('#pomodoro-time'), dots: document.querySelector('#pomodoro-dots'),
      current: document.querySelector('#pomodoro-current'),
      toggle: document.querySelector('#pomodoro-toggle'), reset: document.querySelector('#pomodoro-reset'),
      skip: document.querySelector('#pomodoro-skip'), status: document.querySelector('#pomodoro-status'),
      complete: document.querySelector('#pomodoro-complete'), close: document.querySelector('#pomodoro-close'),
      detach: document.querySelector('#pomodoro-detach'),
      customInput: document.querySelector('#pomodoro-custom'), countdown: document.querySelector('#pomodoro-countdown'),
      autoBreak: document.querySelector('#pomodoro-auto-break'), autoFocus: document.querySelector('#pomodoro-auto-focus'),
      autoTop: document.querySelector('#pomodoro-auto-top'),
      sound: document.querySelector('#pomodoro-sound'),
      inputs: { focus: document.querySelector('#pomodoro-focus'), short: document.querySelector('#pomodoro-short'), long: document.querySelector('#pomodoro-long'), interval: document.querySelector('#pomodoro-interval') },
    };
    els.button.addEventListener('click', event => { event.stopPropagation(); togglePanel(); });
    els.close.addEventListener('click', close);
    els.detach.addEventListener('click', detach);
    els.toggle.addEventListener('click', () => { primeAudio(); toggle(); });
    els.reset.addEventListener('click', reset);
    els.skip.addEventListener('click', skip);
    els.countdown.addEventListener('click', () => { primeAudio(); startCustom(); });
    els.customInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); primeAudio(); startCustom(); }
    });
    els.complete.addEventListener('click', async () => {
      if (!current) return;
      try {
        await api.call('status', { id: current.id, action: 'complete' });
        setCurrentTask(null);
        setStatus(tr('已标记完成，辛苦了'));
        publish(true);
      } catch (error) { setStatus(error.message || tr('操作未完成，请重试')); }
    });
    for (const key of ['focus', 'short', 'long', 'interval']) {
      els.inputs[key].addEventListener('change', () => {
        const limits = { focus: [1, 180], short: [1, 60], long: [1, 120], interval: [1, 12] };
        settings[key] = clampInt(els.inputs[key].value, limits[key][0], limits[key][1], DEFAULTS[key]);
        els.inputs[key].value = String(settings[key]);
        if (!session.running) { session.remaining = sessionTotal(); session.endAt = 0; }
        save(); render(true);
      });
    }
    for (const [element, key] of [[els.autoBreak, 'autoBreak'], [els.autoFocus, 'autoFocus'], [els.sound, 'sound']]) {
      element.addEventListener('change', () => { settings[key] = element.checked; save(); });
    }
    els.autoTop.addEventListener('change', () => { settings.autoTop = els.autoTop.checked; save(); publish(true); });
    document.addEventListener('click', event => {
      if (!els.popover.hidden && !event.target.closest('#pomodoro-popover,#pomodoro-button')) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !els.popover.hidden) close();
    });
    makeDraggable();
    api.onPomodoroCommand?.(payload => {
      const command = typeof payload === 'string' ? payload : payload?.command;
      if (command === 'toggle') { primeAudio(); toggle(); }
      else if (command === 'reset') reset();
      else if (command === 'skip') skip();
      else if (command === 'complete') els.complete.click();
      else if (command === 'pin') { settings.pin = !settings.pin; save(); }
      else if (command === 'mini') { settings.mini = !settings.mini; save(); }
      else if (command === 'custom') { els.customInput.value = String(clampInt(payload?.minutes, 1, 180, 4)); primeAudio(); startCustom(); }
      publish(true);
    });
    api.onPomodoroWindow?.(isOpen => { if (isOpen) close(); });
    ticker = setInterval(tick, 500);
  }

  function setCurrentTask(task) {
    current = task ? { id: task.id, title: task.title } : null;
    if (!els.current) return;
    els.current.textContent = current ? current.title : tr('还没有设为「正在做」的任务');
    els.complete.hidden = !current;
    publish(true);
  }
  function refresh() { syncSettingsUI(); render(true); publish(true); }

  load();
  bind();
  syncSettingsUI();
  setCurrentTask(null);
  // Defer the first paint so app.js captures the pristine static markup (title
  // "番茄钟") before this module writes dynamic values like "番茄钟 25:00".
  requestAnimationFrame(() => render(true));
  window.PomodoroPanel = Object.freeze({ open, close, toggle: togglePanel, refresh, setCurrentTask });
})();
