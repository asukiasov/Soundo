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
})();
