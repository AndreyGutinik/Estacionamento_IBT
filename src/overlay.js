const bar = document.getElementById('bar');
const ticker = document.getElementById('ticker');

let config = {
  position: 'bottom',
  speed: 90,
  bgColor: '#000000',
  textColor: '#fff7e8',
  fontSize: 26,
  fontFamily: 'Marble, "Marble Regular", "Segoe UI", Arial, sans-serif',
  paddingX: 24,
  slideDurationMs: 320
};

let scrollFrame = null;
let effectFrame = null;
let previewTimer = null;
let currentPayload = null;
let currentX = window.innerWidth;
let lastScrollTime = null;
let finishing = false;
let animationToken = 0;

function applyConfig(nextConfig) {
  config = { ...config, ...nextConfig };
  bar.style.background = config.bgColor;
  ticker.style.color = config.textColor;
  ticker.style.fontSize = `${config.fontSize}px`;
  ticker.style.fontFamily = config.fontFamily;
  ticker.style.paddingLeft = `${config.paddingX}px`;
  ticker.style.paddingRight = `${config.paddingX}px`;
}

function clearMotionHandles() {
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  if (effectFrame) cancelAnimationFrame(effectFrame);
  if (previewTimer) clearTimeout(previewTimer);
  scrollFrame = null;
  effectFrame = null;
  previewTimer = null;
  lastScrollTime = null;
}

function stopCurrentRun() {
  animationToken += 1;
  clearMotionHandles();
  return animationToken;
}

function getHiddenOffset() {
  return config.position === 'top' ? -window.innerHeight : window.innerHeight;
}

function getTickerStartX() {
  return Math.max(window.innerWidth, bar.clientWidth || 0);
}

function isActiveRun(token) {
  return token === animationToken;
}

function setTickerTransform(x) {
  ticker.style.transform = `translate3d(${x}px, -50%, 0)`;
}

function getCurrentBarOffset() {
  const match = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(bar.style.transform || '');
  return match ? Number(match[1]) : 0;
}

function prepareTicker(mode) {
  ticker.classList.toggle('preview', mode === 'preview');
  ticker.style.visibility = 'hidden';

  if (mode === 'preview') {
    ticker.style.transform = 'translate(-50%, -50%)';
    return;
  }

  setTickerTransform(getTickerStartX());
}

function animateBarY(from, to, durationMs, options = {}) {
  const token = options.token;
  const opacityFrom = Number.isFinite(options.opacityFrom) ? options.opacityFrom : Number(bar.style.opacity || 0);
  const opacityTo = Number.isFinite(options.opacityTo) ? options.opacityTo : opacityFrom;

  return new Promise((resolve) => {
    const duration = Math.max(80, Number(durationMs) || 320);
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      if (!isActiveRun(token)) {
        effectFrame = null;
        resolve(false);
        return;
      }

      const progress = Math.min(1, (now - start) / duration);
      const value = from + (to - from) * ease(progress);
      const opacity = opacityFrom + (opacityTo - opacityFrom) * ease(progress);
      bar.style.transform = `translateY(${value}px)`;
      bar.style.opacity = String(opacity);
      if (progress < 1) {
        effectFrame = requestAnimationFrame(step);
      } else {
        effectFrame = null;
        resolve(true);
      }
    };

    effectFrame = requestAnimationFrame(step);
  });
}

function resetHidden() {
  bar.classList.remove('active');
  bar.style.transform = `translateY(${getHiddenOffset()}px)`;
  bar.style.opacity = '0';
  prepareTicker('scroll');
  ticker.textContent = '';
  currentPayload = null;
}

function clearBar() {
  stopCurrentRun();
  finishing = false;
  resetHidden();
}

async function finishNow(expectedToken = animationToken) {
  if (finishing || !bar.classList.contains('active') || !isActiveRun(expectedToken)) return;
  finishing = true;
  clearMotionHandles();
  const completedPayload = currentPayload;
  const finished = await animateBarY(getCurrentBarOffset(), getHiddenOffset(), config.slideDurationMs, {
    token: expectedToken,
    opacityFrom: Number(bar.style.opacity || 1),
    opacityTo: 0
  });

  if (!finished || !isActiveRun(expectedToken)) {
    finishing = false;
    return;
  }

  resetHidden();
  finishing = false;
  if (completedPayload) {
    window.appApi.notifyOverlayComplete();
  }
}

function startScroll(token) {
  currentX = getTickerStartX();
  ticker.style.visibility = 'visible';
  setTickerTransform(currentX);

  const step = (timestamp) => {
    if (!isActiveRun(token)) {
      scrollFrame = null;
      return;
    }

    if (!lastScrollTime) lastScrollTime = timestamp;
    const delta = (timestamp - lastScrollTime) / 1000;
    lastScrollTime = timestamp;
    currentX -= (Number(config.speed) || 90) * delta;
    setTickerTransform(currentX);

    const width = ticker.getBoundingClientRect().width;
    if (currentX + width < 0) {
      scrollFrame = null;
      void finishNow(token);
      return;
    }

    scrollFrame = requestAnimationFrame(step);
  };

  scrollFrame = requestAnimationFrame(step);
}

async function startMessage(payload) {
  const token = stopCurrentRun();
  finishing = false;
  currentPayload = typeof payload === 'string' ? { text: payload, mode: 'scroll', durationMs: 3000 } : { ...(payload || {}) };
  const text = String(currentPayload.text || '').trim();
  if (!text) {
    clearBar();
    return;
  }

  ticker.textContent = text;
  prepareTicker(currentPayload.mode);
  bar.classList.add('active');
  bar.style.transform = `translateY(${getHiddenOffset()}px)`;
  bar.style.opacity = '0';

  const entered = await animateBarY(getHiddenOffset(), 0, config.slideDurationMs, {
    token,
    opacityFrom: 0,
    opacityTo: 1
  });
  if (!entered || !currentPayload || !isActiveRun(token)) return;

  if (currentPayload.mode === 'preview') {
    ticker.style.visibility = 'visible';
    previewTimer = setTimeout(() => {
      if (isActiveRun(token)) {
        void finishNow(token);
      }
    }, Math.max(250, Number(currentPayload.durationMs) || 3000));
    return;
  }

  startScroll(token);
}

window.appApi.onOverlayConfig((payload) => {
  applyConfig(payload || {});
  if (!currentPayload) resetHidden();
});

window.appApi.onOverlayStartMessage((payload) => {
  void startMessage(payload || '');
});

window.appApi.onOverlayClear(() => {
  clearBar();
});

window.appApi.onOverlayFinishNow(() => {
  void finishNow();
});

window.addEventListener('resize', () => {
  if (!currentPayload) {
    resetHidden();
  }
});

resetHidden();
