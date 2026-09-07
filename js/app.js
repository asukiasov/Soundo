/* Soundo UI: screen flow + wiring. */
(function () {
  'use strict';

  const engine = new AudioEngine();
  let selectedEffect = null;
  let timerId = null;
  let recStart = 0;

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $('home'),
    recording: $('recording'),
    playback: $('playback'),
  };

  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove('is-active'));
    screens[name].classList.add('is-active');
  }

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = false;
  }
  function clearError() { $('error').hidden = true; }

  /* ---- build effect button rows --------------------------------------- */
  function buildEffectButtons(container, onPick) {
    container.innerHTML = '';
    SoundoEffects.list.forEach(def => {
      const btn = document.createElement('button');
      btn.className = 'effect-btn';
      btn.dataset.id = def.id;
      btn.innerHTML = `<span class="emoji">${def.emoji}</span><span>${def.name}</span>`;
      btn.addEventListener('click', () => onPick(def.id));
      container.appendChild(btn);
    });
  }

  function markSelected(container) {
    container.querySelectorAll('.effect-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.id === selectedEffect);
    });
  }

  async function pickEffect(id) {
    selectedEffect = id;
    markSelected($('homeEffects'));
    markSelected($('recEffects'));
    clearError();
    try {
      await engine.init();
      engine.setEffect(id);
      engine.setAmount(Number($('distortion').value));
      $('homeControls').hidden = false;
      if (!engine.canRecord()) {
        $('recordBtn').disabled = true;
        $('recordBtn').textContent = 'Recording not supported';
      }
    } catch (err) {
      showError('Microphone access is needed. Please allow it and reload. (' + err.name + ')');
      $('homeControls').hidden = true;
    }
  }

  /* ---- home controls -------------------------------------------------- */
  $('distortion').addEventListener('input', (e) => {
    $('distortionOut').textContent = e.target.value + '%';
    engine.setAmount(Number(e.target.value));
  });

  const volEl = $('volume');
  try {
    const saved = localStorage.getItem('soundo.volume');
    if (saved) volEl.value = saved;
  } catch (e) {}
  function applyVolume() {
    $('volumeOut').textContent = volEl.value + '%';
    engine.setMonitorVolume(Number(volEl.value));
    try { localStorage.setItem('soundo.volume', volEl.value); } catch (e) {}
  }
  volEl.addEventListener('input', applyVolume);
  applyVolume();

  let listening = false;
  $('listenBtn').addEventListener('click', async () => {
    await engine.init();
    listening = !listening;
    engine.setMonitor(listening);
    $('listenBtn').textContent = listening ? '⏸ Stop' : '▶ Listen';
    $('listenBtn').classList.toggle('ghost', listening);
  });

  $('recordBtn').addEventListener('click', async () => {
    await engine.init();
    if (listening) { listening = false; engine.setMonitor(false); $('listenBtn').textContent = '▶ Listen'; }
    if (!engine.startRecording()) { showError('Could not start recording.'); return; }
    recStart = Date.now();
    updateTimer();
    timerId = setInterval(updateTimer, 500);
    show('recording');
  });

  function updateTimer() {
    const s = Math.floor((Date.now() - recStart) / 1000);
    $('timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  $('stopBtn').addEventListener('click', () => {
    clearInterval(timerId);
    engine.stopRecording((blob) => {
      const url = URL.createObjectURL(blob);
      $('player').src = url;
      show('playback');
    });
  });

  $('saveBtn').addEventListener('click', () => {
    if (!engine.lastBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(engine.lastBlob);
    a.download = 'soundo-' + Date.now() + '.' + engine.fileExtension();
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  $('againBtn').addEventListener('click', () => {
    $('player').removeAttribute('src');
    $('timer').textContent = '0:00';
    show('home');
  });

  /* ---- init --------------------------------------------------------- */
  buildEffectButtons($('homeEffects'), pickEffect);
  buildEffectButtons($('recEffects'), (id) => {
    selectedEffect = id;
    markSelected($('recEffects'));
    engine.setEffect(id);
  });

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('This browser cannot access the microphone.');
  }

  /* ---- diagnostics overlay: open the page with #debug ---------------- */
  if (location.hash.indexOf('debug') >= 0) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;left:0;bottom:0;right:0;z-index:9999;background:rgba(0,0,0,.85)';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;padding:6px';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    const shareBtn = document.createElement('button');
    shareBtn.textContent = 'Share';
    [copyBtn, shareBtn].forEach(b => {
      b.style.cssText = 'flex:1;padding:10px;font-size:14px;border:0;border-radius:8px;background:#0f0;color:#000;font-weight:700';
    });
    bar.append(copyBtn, shareBtn);
    const box = document.createElement('pre');
    box.style.cssText =
      'margin:0;padding:8px;font-size:11px;color:#0f0;white-space:pre-wrap;max-height:40vh;overflow:auto;' +
      'user-select:all;-webkit-user-select:all';
    wrap.append(bar, box);
    document.body.appendChild(wrap);

    let lastT = performance.now();
    let maxGapMs = 0;
    let text = '';
    setInterval(() => {
      const now = performance.now();
      const gap = now - lastT - 250; // scheduler jitter ~ main-thread stall
      if (gap > maxGapMs) maxGapMs = gap;
      lastT = now;
      const d = engine.getDiagnostics();
      text =
        'SOUNDO DEBUG @ ' + location.hash + '\n' +
        JSON.stringify(d, null, 1) + '\nmainThreadStallMaxMs: ' + Math.round(maxGapMs);
      box.textContent = text;
    }, 250);

    async function copyOut() {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied ✓';
      } catch (e) {
        const r = document.createRange();
        r.selectNodeContents(box);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        copyBtn.textContent = document.execCommand('copy') ? 'Copied ✓' : 'Select + long-press';
      }
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    }
    copyBtn.addEventListener('click', copyOut);
    shareBtn.addEventListener('click', () => {
      if (navigator.share) navigator.share({ text: text }).catch(() => {});
      else copyOut();
    });
  }
})();
