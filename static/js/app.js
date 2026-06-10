/* The Empathy Engine — Professional Frontend */

const TWEMOJI = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

const EMOTION_META = {
  joy:      { code: '1f60a', color: '#c9a227', label: 'Joy' },
  anger:    { code: '1f621', color: '#c45050', label: 'Anger' },
  sadness:  { code: '1f614', color: '#7c75a8', label: 'Sadness' },
  fear:     { code: '1f628', color: '#9b6bb0', label: 'Fear' },
  surprise: { code: '1f632', color: '#d4843a', label: 'Surprise' },
  disgust:  { code: '1f922', color: '#8fa855', label: 'Disgust' },
  neutral:  { code: '1f610', color: '#8a7a72', label: 'Neutral' },
};

function emoSrc(emotion) {
  const m = EMOTION_META[emotion] || EMOTION_META.neutral;
  return `${TWEMOJI}/${m.code}.png`;
}

function emoImg(emotion, size = 24, cls = 'emo-img') {
  const m = EMOTION_META[emotion] || EMOTION_META.neutral;
  return `<img src="${TWEMOJI}/${m.code}.png" alt="${m.label}" class="${cls}" width="${size}" height="${size}" loading="lazy">`;
}

const SAMPLES = {
  joy: "I just got promoted! This is the best day of my life!",
  sadness: "I'm really disappointed. Nothing seems to be going right today.",
  anger: "This is completely unacceptable! I've been waiting for hours!",
  fear: "I don't know what's happening, everything feels uncertain and scary",
  surprise: "Oh my god! I can't believe this actually happened! What a shock!",
  disgust: "That smell is absolutely revolting. I can't stand being here anymore.",
  neutral: "The meeting is scheduled for three o'clock on Tuesday afternoon.",
};

const EMOTIONS_ORDER = ['joy', 'anger', 'sadness', 'fear', 'surprise', 'disgust', 'neutral'];
const CIRC = 2 * Math.PI * 54;
const GAUGE_CIRC = 2 * Math.PI * 34;

const HERO_PHRASES = [
  'Speech that understands joy.',
  'Voices that carry sadness.',
  'Words that feel anger.',
  'Audio that senses fear.',
  'Language with empathy.',
];

const LIVE_KEYWORDS = {
  joy: ['happy', 'love', 'great', 'best', 'promoted', 'wonderful', 'excited', 'amazing', '!'],
  anger: ['unacceptable', 'angry', 'furious', 'hate', 'waiting', 'never', 'worst'],
  sadness: ['disappointed', 'sad', 'wrong', 'miss', 'lonely', 'hopeless', 'cry'],
  fear: ['scared', 'afraid', 'uncertain', 'scary', 'anxious', 'worried', 'unknown'],
  surprise: ['wow', 'shock', 'believe', 'unexpected', 'god', 'what'],
  disgust: ['revolting', 'gross', 'disgusting', 'vile', 'smell', 'stand'],
};

let radarChart = null;
let barChart = null;
let doughnutChart = null;
let audioContext = null;
let currentResult = null;
let selectedOverride = null;
let waveformMain = null;
let waveformFlatVis = null;
let waveformEmoVis = null;
let demoInterval = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Particles ───
function initParticles() {
  const canvas = $('#particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  const count = 60;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      color: ['#d4658a', '#c9a227', '#f0c14d', '#b87868', '#c9788a'][Math.floor(Math.random() * 5)],
      alpha: Math.random() * 0.4 + 0.1,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, i) => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
      particles.slice(i + 1).forEach(p2 => {
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = (1 - dist / 120) * 0.12;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      });
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── Physics emoji background (Twemoji images, bounce + collide) ───
const PHYSICS_EMOJIS = Object.values(EMOTION_META).map(m => m.code);
const spriteCache = {};

function loadSprite(code) {
  if (spriteCache[code]) return spriteCache[code];
  const img = new Image();
  img.src = `${TWEMOJI}/${code}.png`;
  spriteCache[code] = img;
  return img;
}

function initEmojiRain() {
  const canvas = $('#emoji-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let bodies = [];
  const COUNT = 22;
  const GRAVITY = 0.045;
  const BOUNCE = 0.68;
  const FRICTION = 0.992;
  let w = 0, h = 0;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  PHYSICS_EMOJIS.forEach(loadSprite);

  function spawn() {
    const code = PHYSICS_EMOJIS[Math.floor(Math.random() * PHYSICS_EMOJIS.length)];
    const r = 16 + Math.random() * 14;
    return {
      code,
      x: r + Math.random() * (w - 2 * r),
      y: -r - Math.random() * h * 0.3,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 2,
      r,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.04,
      opacity: 0.14 + Math.random() * 0.16,
    };
  }

  for (let i = 0; i < COUNT; i++) {
    const b = spawn();
    b.y = b.r + Math.random() * (h - 2 * b.r);
    bodies.push(b);
  }

  function resolve(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const overlap = a.r + b.r - dist;
    if (overlap <= 0) return;
    const nx = dx / dist, ny = dy / dist;
    a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
    const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
    const dvn = dvx * nx + dvy * ny;
    if (dvn > 0) return;
    const imp = -(1 + BOUNCE) * dvn / 2;
    a.vx -= imp * nx; a.vy -= imp * ny;
    b.vx += imp * nx; b.vy += imp * ny;
  }

  function step() {
    ctx.clearRect(0, 0, w, h);
    bodies.forEach(b => {
      b.vy += GRAVITY;
      b.vx *= FRICTION;
      b.x += b.vx; b.y += b.vy; b.rot += b.vr;
      if (b.y + b.r > h) { b.y = h - b.r; b.vy *= -BOUNCE; b.vx *= 0.95; }
      if (b.y - b.r < 0) { b.y = b.r; b.vy *= -BOUNCE; }
      if (b.x - b.r < 0) { b.x = b.r; b.vx *= -BOUNCE; }
      if (b.x + b.r > w) { b.x = w - b.r; b.vx *= -BOUNCE; }
    });
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) resolve(bodies[i], bodies[j]);

    bodies.forEach(b => {
      const img = spriteCache[b.code];
      if (!img?.complete) return;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = b.opacity;
      const s = b.r * 2;
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    });
    requestAnimationFrame(step);
  }
  step();

  setInterval(() => {
    if (bodies.length < COUNT + 5) bodies.push(spawn());
  }, 4000);
}

// ─── Scroll reveal ───
function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  $$('.reveal').forEach(el => obs.observe(el));
}

// ─── Utilities ───
function showToast(msg, type = 'error') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  $('#toast-container').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 4000);
}

function showSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden-section');
  el.classList.add('visible', 'reveal');
  requestAnimationFrame(() => el.classList.add('visible'));
}

function hideSection(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden-section');
}

function countSentences(text) {
  if (!text.trim()) return 0;
  return text.split(/[.!?]+/).filter(s => s.trim()).length;
}

function animateValue(el, start, end, suffix = '', duration = 900) {
  const t0 = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const v = start + (end - start) * eased;
    if (suffix === '%') el.textContent = Math.round(v) + suffix;
    else el.textContent = (suffix === ' st' ? v.toFixed(1) : v.toFixed(2)) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function highlightSSML(ssml) {
  return ssml
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="ssml-tag">$2</span>')
    .replace(/([\w:-]+)=("[^"]*")/g, '<span class="ssml-attr">$1</span>=<span class="ssml-attr">$2</span>')
    .replace(/(&gt;)([^&<]+?)(&lt;)/g, '$1<span class="ssml-text">$2</span>$3');
}

// ─── Multi-step loader ───
const LOADER_STEPS = ['analyze', 'modulate', 'synthesize'];
function setLoading(show, step = 0, message = '') {
  const section = $('#loading-section');
  if (!show) { hideSection('loading-section'); return; }
  showSection('loading-section');
  if (message) $('#loading-message').textContent = message;
  LOADER_STEPS.forEach((s, i) => {
    const el = $(`#step-${s}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  });
  const pct = ((step + 1) / LOADER_STEPS.length) * 100;
  const bar = $('#loader-bar-fill');
  if (bar) bar.style.width = pct + '%';
}

async function runLoaderSteps(messages) {
  for (let i = 0; i < messages.length; i++) {
    setLoading(true, i, messages[i]);
    await new Promise(r => setTimeout(r, i === 0 ? 300 : 600));
  }
}

// ─── Health & Stats ───
async function fetchHealth() {
  try {
    const d = await (await fetch('/health')).json();
    const dot = $('#status-dot');
    const label = $('#status-label');
    if (d.model_loaded) {
      dot.style.background = '#10b981';
      label.textContent = `AI Ready · ${d.backend}`;
    } else {
      dot.style.background = '#ef4444';
      label.textContent = 'Model loading...';
    }
  } catch {
    $('#status-label').textContent = 'Offline';
    $('#status-dot').style.background = '#ef4444';
  }
}

async function fetchStats() {
  try {
    const d = await (await fetch('/stats')).json();
    animateValue($('#stat-analyses'), 0, d.total_analyses || 0, '', 600);
    animateValue($('#stat-generations'), 0, d.total_generations || 0, '', 600);
    if (d.top_emotion) {
      const m = EMOTION_META[d.top_emotion];
      $('#stat-top').innerHTML = m ? `${emoImg(d.top_emotion, 22, 'emo-img emo-img-sm')} ${d.top_emotion}` : '—';
    }
  } catch { /* ignore */ }
}

// ─── Charts ───
function chartDefaults() {
  Chart.defaults.color = '#9a8880';
  Chart.defaults.borderColor = 'rgba(212,160,120,0.06)';
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
}

function chartTooltip() {
  return {
    backgroundColor: 'rgba(15,10,12,0.95)',
    titleColor: '#f2e8dc',
    bodyColor: '#9a8880',
    borderColor: 'rgba(212,160,120,0.15)',
    borderWidth: 1,
    padding: 12,
    cornerRadius: 8,
    titleFont: { weight: '600', size: 12 },
    bodyFont: { size: 11 },
    displayColors: true,
    boxPadding: 4,
  };
}

function updateRadarChart(scores) {
  const ctx = $('#radar-chart')?.getContext('2d');
  if (!ctx) return;
  const data = EMOTIONS_ORDER.map(e => (scores[e] || 0) * 100);
  if (radarChart) radarChart.destroy();
  const ctx2d = ctx;
  const grad = ctx2d.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(212,101,138,0.25)');
  grad.addColorStop(1, 'rgba(201,162,39,0.05)');
  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: EMOTIONS_ORDER.map(e => EMOTION_META[e].label),
      datasets: [{
        data,
        backgroundColor: grad,
        borderColor: '#d4658a',
        borderWidth: 2.5,
        pointBackgroundColor: EMOTIONS_ORDER.map(e => EMOTION_META[e].color),
        pointBorderColor: '#1a1014',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      animation: { duration: 1400, easing: 'easeOutQuart' },
      scales: {
        r: {
          beginAtZero: true, max: 100,
          angleLines: { color: 'rgba(212,160,120,0.08)', lineWidth: 1 },
          grid: { color: 'rgba(212,160,120,0.1)', circular: true },
          ticks: {
            stepSize: 25, backdropColor: 'transparent',
            color: '#6a5a52', font: { size: 9 }, showLabelBackdrop: false,
          },
          pointLabels: { color: '#c4b0a8', font: { size: 10, weight: '500' } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: chartTooltip(),
      },
    },
  });
}

function updateBarChart(scores) {
  const ctx = $('#bar-chart')?.getContext('2d');
  if (!ctx) return;
  const data = EMOTIONS_ORDER.map(e => (scores[e] || 0) * 100);
  const colors = EMOTIONS_ORDER.map(e => EMOTION_META[e].color);
  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: EMOTIONS_ORDER.map(e => EMOTION_META[e].label),
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'bb'),
        hoverBackgroundColor: colors,
        borderColor: colors.map(c => c + 'ee'),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.65,
      }],
    },
    options: {
      responsive: true,
      animation: { duration: 1200, easing: 'easeOutQuart' },
      scales: {
        y: {
          beginAtZero: true, max: 100,
          grid: { color: 'rgba(212,160,120,0.06)', drawBorder: false },
          border: { display: false },
          ticks: { color: '#6a5a52', font: { size: 9 }, callback: v => v + '%', padding: 8 },
        },
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#9a8880', font: { size: 9 }, maxRotation: 45 },
        },
      },
      plugins: { legend: { display: false }, tooltip: chartTooltip() },
    },
  });
}

function updateDoughnutChart(scores) {
  const ctx = $('#doughnut-chart')?.getContext('2d');
  if (!ctx) return;
  const data = EMOTIONS_ORDER.map(e => scores[e] || 0);
  const colors = EMOTIONS_ORDER.map(e => EMOTION_META[e].color);
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: EMOTIONS_ORDER.map(e => EMOTION_META[e].label),
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + '88'),
        hoverBackgroundColor: colors,
        borderColor: 'rgba(15,10,12,0.8)',
        borderWidth: 3,
        hoverBorderColor: '#f2e8dc',
        hoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      cutout: '68%',
      animation: { animateRotate: true, duration: 1400, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 8, boxHeight: 8, padding: 14,
            color: '#9a8880', font: { size: 10, weight: '500' },
            usePointStyle: true, pointStyle: 'circle',
          },
        },
        tooltip: chartTooltip(),
      },
    },
  });
}

// ─── Emotion ring ───
function updateEmotionRing(confidence, color) {
  const ring = $('#confidence-ring');
  if (!ring) return;
  ring.style.stroke = color;
  ring.style.strokeDashoffset = CIRC * (1 - confidence);
}

// ─── Emotion cards ───
function renderEmotionCards(scores, primary) {
  const grid = $('#emotion-grid');
  if (!grid) return;
  grid.innerHTML = '';
  EMOTIONS_ORDER.forEach((e, i) => {
    const m = EMOTION_META[e];
    const score = (scores[e] || 0) * 100;
    const card = document.createElement('div');
    card.className = 'emotion-card' + (e === primary ? ' winner' : '');
    card.style.animationDelay = (i * 0.08) + 's';
    card.innerHTML = `
      ${emoImg(e, 32, 'emo-img emo-img-md')}
      <div class="emotion-card-name">${m.label}</div>
      <div class="emotion-card-score" style="color:${m.color}">${score.toFixed(0)}%</div>
      <div class="emotion-card-bar"><div class="emotion-card-fill" style="background:${m.color}"></div></div>
    `;
    card.addEventListener('click', () => selectOverride(e));
    grid.appendChild(card);
    requestAnimationFrame(() => {
      card.querySelector('.emotion-card-fill').style.width = score + '%';
    });
  });
}

// ─── Text heatmap ───
function renderTextHeatmap(sentenceEmotions) {
  const el = $('#text-heatmap');
  if (!el || !sentenceEmotions?.length) { if (el) el.innerHTML = ''; return; }
  el.innerHTML = sentenceEmotions.map((se, i) => {
    const m = EMOTION_META[se.emotion] || EMOTION_META.neutral;
    return `<span class="heat-span" style="background:${m.color}22;border-bottom-color:${m.color}" title="${se.emotion} (${(se.confidence*100).toFixed(0)}%)">${se.sentence}</span>${i < sentenceEmotions.length - 1 ? ' ' : ''}`;
  }).join('');
}

// ─── Timeline ───
function renderTimeline(sentenceEmotions) {
  const el = $('#timeline');
  if (!el) return;
  el.innerHTML = '';
  (sentenceEmotions || []).forEach((se, i) => {
    const m = EMOTION_META[se.emotion] || EMOTION_META.neutral;
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.style.animationDelay = (i * 0.1) + 's';
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem">
        <span style="font-size:0.7rem;padding:0.2rem 0.55rem;border-radius:4px;background:${m.color}22;color:${m.color};display:inline-flex;align-items:center;gap:0.35rem">
          ${emoImg(se.emotion, 16, 'emo-img emo-img-sm')} ${se.emotion} · ${(se.confidence*100).toFixed(0)}%
        </span>
      </div>
      <p style="font-size:0.88rem;color:#cbd5e1">${se.sentence}</p>
    `;
    el.appendChild(item);
  });
}

// ─── Voice gauges ───
function renderGauges(vp) {
  if (!vp) return;
  const gauges = [
    { id: 'gauge-speed', val: vp.speed, max: 1.6, min: 0.6, color: '#e879a9' },
    { id: 'gauge-pitch', val: vp.pitch_shift, max: 6, min: -6, color: '#d4a574' },
    { id: 'gauge-volume', val: vp.volume_boost, max: 6, min: -6, color: '#a8c686' },
    { id: 'gauge-pause', val: vp.pause_factor, max: 2, min: 0.4, color: '#c9958a' },
  ];
  gauges.forEach(g => {
    const pct = ((g.val - g.min) / (g.max - g.min)) * 100;
    const offset = GAUGE_CIRC * (1 - Math.min(1, Math.max(0, pct / 100)));
    const ring = $(`#${g.id}-ring`);
    const valEl = $(`#${g.id}-val`);
    if (ring) { ring.style.stroke = g.color; ring.style.strokeDashoffset = offset; }
    if (valEl) {
      const isMult = g.id.includes('speed') || g.id.includes('pause');
      const sign = g.val >= 0 && !isMult ? '+' : '';
      valEl.textContent = isMult ? g.val.toFixed(2) + '×' : sign + g.val;
    }
  });
  const desc = $('#voice-description');
  if (desc) desc.textContent = vp.description || '';
}

// ─── Render analysis ───
function renderAnalysis(data) {
  currentResult = data;
  const emotion = data.primary_emotion || data.emotion;
  const confidence = data.confidence;
  const meta = EMOTION_META[emotion] || EMOTION_META.neutral;
  const vp = data.voice_params;

  $('#emotion-emoji').src = emoSrc(emotion);
  $('#emotion-emoji').alt = meta.label;
  $('#emotion-name').textContent = meta.label;
  const badge = $('#intensity-badge');
  badge.textContent = data.intensity || 'medium';
  badge.style.background = meta.color + '33';
  badge.style.color = meta.color;

  if (data.overridden) {
    badge.textContent += ' · Manual';
    showToast('Emotion manually overridden to ' + emotion, 'info');
  }

  animateValue($('#confidence-value'), 0, confidence * 100, '%');
  updateEmotionRing(confidence, meta.color);

  const glow = $('#emotion-glow');
  if (glow) glow.style.background = meta.color;

  updateRadarChart(data.all_scores);
  updateBarChart(data.all_scores);
  updateDoughnutChart(data.all_scores);
  renderEmotionCards(data.all_scores, emotion);
  renderTextHeatmap(data.sentence_emotions);
  renderTimeline(data.sentence_emotions);
  renderGauges(vp);

  showSection('analysis-section');

  const ssml = data.ssml || data.ssml_preview || '';
  if (ssml) {
    $('#ssml-code').innerHTML = highlightSSML(ssml);
    showSection('ssml-section');
  }
}

// ─── Waveform ───
function setupWaveform(audioEl, canvasId) {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = 90 * dpr;
  ctx.scale(dpr, dpr);
  let analyser = null, source = null, animId = null;

  function draw() {
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    const w = canvas.offsetWidth, h = 90;
    ctx.clearRect(0, 0, w, h);
    const bars = 48;
    const step = Math.floor(buf.length / bars);
    for (let i = 0; i < bars; i++) {
      const v = buf[i * step] / 255;
      const barH = v * h * 0.9;
      const x = (w / bars) * i;
      const grad = ctx.createLinearGradient(0, h - barH, 0, h);
      grad.addColorStop(0, '#d4658a');
      grad.addColorStop(0.5, '#c9a227');
      grad.addColorStop(1, '#f0c14d');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, h - barH, w / bars - 2, barH);
    }
    animId = requestAnimationFrame(draw);
  }

  return {
    connect() {
      if (source) return;
      try {
        source = audioContext.createMediaElementSource(audioEl);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(audioContext.destination);
      } catch { /* already connected */ }
    },
    start() { this.connect(); if (animId) cancelAnimationFrame(animId); draw(); },
    stop() { if (animId) { cancelAnimationFrame(animId); animId = null; } },
  };
}

function setupMainPlayer(url, filename, processingMs, emotionColor) {
  hideSection('compare-players');
  $('#single-player-container').style.display = 'block';
  const audio = $('#audio-main');
  audio.src = url;
  audio.load();
  $('#audio-filename').textContent = filename || url.split('/').pop();
  $('#btn-download').href = url;
  $('#processing-time-badge').textContent = `⚡ ${processingMs}ms`;
  if (emotionColor) {
    $('#player-gradient').style.background = `linear-gradient(135deg, ${emotionColor}44, rgba(212,165,116,0.2))`;
  }
  waveformMain = setupWaveform(audio, 'waveform-canvas');
  audio.onloadedmetadata = () => { $('#time-duration').textContent = formatTime(audio.duration); };
  audio.ontimeupdate = () => {
    if (audio.duration) {
      $('#seek-bar').value = (audio.currentTime / audio.duration) * 100;
      $('#time-current').textContent = formatTime(audio.currentTime);
    }
  };
  audio.onended = () => { $('#btn-play').textContent = '▶'; waveformMain?.stop(); };
  showSection('audio-section');
}

function setupComparePlayers(flatUrl, emoUrl, processingMs, emotionColor) {
  $('#single-player-container').style.display = 'none';
  showSection('compare-players');
  const flat = $('#audio-flat-el'), emo = $('#audio-emotional-el');
  flat.src = flatUrl; emo.src = emoUrl;
  flat.load(); emo.load();
  $('#download-flat').href = flatUrl;
  $('#download-emotional').href = emoUrl;
  $('#processing-time-badge').textContent = `⚡ ${processingMs}ms · 2 tracks`;
  if (emotionColor) {
    $('#compare-emotional-gradient').style.background = `linear-gradient(135deg, ${emotionColor}44, rgba(212,165,116,0.2))`;
  }
  waveformFlatVis = setupWaveform(flat, 'waveform-flat');
  waveformEmoVis = setupWaveform(emo, 'waveform-emotional');
  showSection('audio-section');
}

function bindPlayerControls(audioEl, playBtn, seekBar, vis) {
  playBtn.addEventListener('click', async () => {
    if (audioContext?.state === 'suspended') await audioContext.resume();
    if (audioEl.paused) { audioEl.play(); playBtn.textContent = '⏸'; vis?.start(); }
    else { audioEl.pause(); playBtn.textContent = '▶'; vis?.stop(); }
  });
  seekBar.addEventListener('input', () => {
    if (audioEl.duration) audioEl.currentTime = (seekBar.value / 100) * audioEl.duration;
  });
  audioEl.addEventListener('ended', () => { playBtn.textContent = '▶'; vis?.stop(); });
}

// ─── Emotion override ───
function selectOverride(emotion) {
  selectedOverride = selectedOverride === emotion ? null : emotion;
  $$('.pick-btn').forEach(b => b.classList.toggle('selected', b.dataset.emotion === selectedOverride));
  $$('.emotion-card').forEach(c => c.classList.remove('winner'));
  if (selectedOverride) {
    showToast(`Override set: ${EMOTION_META[selectedOverride].label}`, 'info');
  }
}

function buildEmotionPicker() {
  const picker = $('#emotion-picker');
  if (!picker) return;
  EMOTIONS_ORDER.forEach(e => {
    const m = EMOTION_META[e];
    const btn = document.createElement('button');
    btn.className = 'pick-btn';
    btn.dataset.emotion = e;
    btn.innerHTML = `${emoImg(e, 18, 'emo-img emo-img-sm')} <span>${m.label}</span>`;
    btn.addEventListener('click', () => selectOverride(e));
    picker.appendChild(btn);
  });
}

function initSampleButtons() {
  $$('.sample-btn[data-sample]').forEach(btn => {
    const key = btn.dataset.sample;
    const m = EMOTION_META[key];
    if (!m) return;
    btn.innerHTML = `${emoImg(key, 22, 'emo-img emo-img-sm')} <span class="sample-label">${m.label}</span>`;
  });
}

// ─── History ───
function saveHistory(entry) {
  let h = JSON.parse(localStorage.getItem('empathy_history') || '[]');
  h.unshift({ ...entry, timestamp: Date.now() });
  h = h.slice(0, 5);
  localStorage.setItem('empathy_history', JSON.stringify(h));
  renderHistory();
}

function renderHistory() {
  const h = JSON.parse(localStorage.getItem('empathy_history') || '[]');
  const section = $('#history-section');
  const list = $('#history-list');
  if (!h.length) { hideSection('history-section'); return; }
  showSection('history-section');
  list.innerHTML = '';
  h.forEach(item => {
    const m = EMOTION_META[item.emotion] || EMOTION_META.neutral;
    const btn = document.createElement('button');
    btn.className = 'history-item';
    btn.innerHTML = `${emoImg(item.emotion, 28, 'emo-img emo-img-sm')}<span class="history-text">${item.text.slice(0, 70)}</span><span class="history-tag">${item.emotion}</span>`;
    btn.addEventListener('click', () => {
      $('#text-input').value = item.text;
      updateCounts();
      if (item.audioUrl) setupMainPlayer(item.audioUrl, item.filename, item.processingMs || 0, m.color);
    });
    list.appendChild(btn);
  });
}

// ─── Export ───
function exportReport() {
  if (!currentResult) { showToast('Run an analysis first'); return; }
  const blob = new Blob([JSON.stringify(currentResult, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'empathy-engine-report.json';
  a.click();
  showToast('Report exported!', 'success');
}

// ─── Demo mode ───
function toggleDemo() {
  const btn = $('#btn-demo');
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
    btn.textContent = '▶ Demo';
    btn.classList.remove('selected');
    return;
  }
  btn.textContent = '⏹ Stop Demo';
  btn.classList.add('selected');
  const keys = Object.keys(SAMPLES);
  let i = 0;
  const run = async () => {
    const key = keys[i % keys.length];
    $('#text-input').value = SAMPLES[key];
    updateCounts();
    $$('.sample-btn').forEach(b => b.classList.toggle('active', b.dataset.sample === key));
    await handleAnalyze();
    i++;
  };
  run();
  demoInterval = setInterval(run, 8000);
}

// ─── API ───
async function apiPost(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Request failed');
  return data;
}

async function handleAnalyze() {
  const text = $('#text-input').value.trim();
  if (!text) { showToast('Enter some text first'); return; }
  await runLoaderSteps(['Scanning emotional signals...', 'Mapping voice parameters...', 'Building analysis report...']);
  try {
    const data = await apiPost('/analyze', { text });
    renderAnalysis(data);
    fetchStats();
    showToast('Analysis complete!', 'success');
    $('#analysis-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { showToast(err.message); }
  finally { setLoading(false); }
}

async function handleGenerate() {
  const text = $('#text-input').value.trim();
  if (!text) { showToast('Enter some text first'); return; }
  await runLoaderSteps(['Detecting emotions...', 'Modulating voice...', 'Synthesizing speech...']);
  try {
    const body = { text, preview_only: false };
    if (selectedOverride) body.emotion_override = selectedOverride;
    const data = await apiPost('/generate', body);
    renderAnalysis(data);
    const m = EMOTION_META[data.emotion] || EMOTION_META.neutral;
    setupMainPlayer(data.audio_url, data.filename, data.processing_time_ms, m.color);
    saveHistory({ text, emotion: data.emotion, audioUrl: data.audio_url, filename: data.filename, processingMs: data.processing_time_ms, ...data });
    fetchStats();
    showToast('Voice generated!', 'success');
    $('#audio-section').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { showToast(err.message); }
  finally { setLoading(false); }
}

async function handleCompare() {
  const text = $('#text-input').value.trim();
  if (!text) { showToast('Enter some text first'); return; }
  await runLoaderSteps(['Analyzing text...', 'Generating flat voice...', 'Generating emotional voice...']);
  try {
    const data = await apiPost('/compare', { text });
    renderAnalysis(data);
    const m = EMOTION_META[data.emotion] || EMOTION_META.neutral;
    setupComparePlayers(data.flat_audio_url, data.emotional_audio_url, data.processing_time_ms, m.color);
    saveHistory({ text, emotion: data.emotion, audioUrl: data.emotional_audio_url, filename: data.emotional_filename, processingMs: data.processing_time_ms });
    fetchStats();
    showToast('A/B comparison ready!', 'success');
    $('#audio-section').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { showToast(err.message); }
  finally { setLoading(false); }
}

function updateCounts() {
  const text = $('#text-input').value;
  $('#char-count').textContent = text.length;
  $('#sentence-count').textContent = countSentences(text);
  $('#word-count').textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
  updateLivePreview(text);
}

// ─── Hero typing animation ───
function initHeroTyping() {
  const el = $('#hero-typed');
  if (!el) return;
  let phraseIdx = 0, charIdx = 0, deleting = false;
  function tick() {
    const phrase = HERO_PHRASES[phraseIdx];
    if (!deleting) {
      el.textContent = phrase.slice(0, ++charIdx);
      if (charIdx === phrase.length) { deleting = true; setTimeout(tick, 2200); return; }
    } else {
      el.textContent = phrase.slice(0, --charIdx);
      if (charIdx === 0) { deleting = false; phraseIdx = (phraseIdx + 1) % HERO_PHRASES.length; }
    }
    setTimeout(tick, deleting ? 35 : 65);
  }
  tick();
}

// ─── Live emotion hint while typing ───
function guessEmotionHint(text) {
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  const scores = {};
  for (const [emotion, words] of Object.entries(LIVE_KEYWORDS)) {
    scores[emotion] = words.filter(w => lower.includes(w)).length;
  }
  if (text.includes('!')) scores.joy = (scores.joy || 0) + 1;
  if (text.includes('?')) scores.surprise = (scores.surprise || 0) + 1;
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] === 0) return { emotion: 'neutral', hint: 'Neutral tone detected — try adding more expressive words.' };
  const m = EMOTION_META[top[0]];
  return { emotion: top[0], hint: `Feels like ${m.label.toLowerCase()} — keywords match ${top[0]} tone.` };
}

function updateLivePreview(text) {
  const strip = $('#live-preview');
  const label = $('#live-text');
  if (!strip) return;
  const hint = guessEmotionHint(text);
  if (!hint || !text.trim()) {
    strip.classList.remove('active');
    $('#live-emoji').innerHTML = '';
    label.textContent = 'Start typing to see a live emotion hint...';
    return;
  }
  const m = EMOTION_META[hint.emotion];
  strip.classList.add('active');
  const liveEl = $('#live-emoji');
  liveEl.innerHTML = emoImg(hint.emotion, 28, 'emo-img emo-img-sm');
  label.textContent = hint.hint;
  label.style.color = m.color;
}

// ─── Scroll progress & navbar ───
function initScrollEffects() {
  const bar = $('#scroll-progress');
  const nav = $('#navbar');
  window.addEventListener('scroll', () => {
    const pct = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    if (bar) bar.style.width = pct + '%';
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
}

// ─── Nav scroll spy ───
function initNavSpy() {
  const links = $$('.nav-link');
  const sections = ['studio', 'analysis-section', 'features', 'faq'];
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
      }
    });
  }, { threshold: 0.3 });
  sections.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
}

// ─── FAQ accordion ───
function initFAQ() {
  $$('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      $$('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}

// ─── Button ripple ───
function initButtonRipple() {
  $$('.btn').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--x', ((e.clientX - r.left) / r.width * 100) + '%');
      btn.style.setProperty('--y', ((e.clientY - r.top) / r.height * 100) + '%');
    });
  });
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  chartDefaults();
  initParticles();
  initEmojiRain();
  initReveal();
  initHeroTyping();
  initScrollEffects();
  initNavSpy();
  initFAQ();
  initButtonRipple();
  buildEmotionPicker();
  initSampleButtons();
  fetchHealth();
  fetchStats();
  renderHistory();
  updateCounts();

  $('#btn-analyze').addEventListener('click', handleAnalyze);

  $$('.sample-btn[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sample;
      $('#text-input').value = SAMPLES[key];
      updateCounts();
      $$('.sample-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  $('#text-input').addEventListener('input', updateCounts);
  $('#btn-generate').addEventListener('click', handleGenerate);
  $('#btn-compare').addEventListener('click', handleCompare);
  $('#btn-cta-compare')?.addEventListener('click', () => {
    document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(handleCompare, 400);
  });
  $('#btn-export').addEventListener('click', exportReport);
  $('#btn-demo').addEventListener('click', toggleDemo);

  $('#ssml-toggle').addEventListener('click', () => {
    const c = $('#ssml-content');
    c.classList.toggle('hidden-section');
    $('#ssml-chevron').style.transform = c.classList.contains('hidden-section') ? '' : 'rotate(180deg)';
  });

  $('#btn-copy-ssml').addEventListener('click', () => {
    const ssml = currentResult?.ssml || currentResult?.ssml_preview || '';
    navigator.clipboard.writeText(ssml).then(() => showToast('SSML copied!', 'success'));
  });

  bindPlayerControls($('#audio-main'), $('#btn-play'), $('#seek-bar'), { start: () => waveformMain?.start(), stop: () => waveformMain?.stop() });
  bindPlayerControls($('#audio-flat-el'), $('#btn-play-flat'), $('#seek-flat'), { start: () => waveformFlatVis?.start(), stop: () => waveformFlatVis?.stop() });
  bindPlayerControls($('#audio-emotional-el'), $('#btn-play-emotional'), $('#seek-emotional'), { start: () => waveformEmoVis?.start(), stop: () => waveformEmoVis?.stop() });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') handleCompare();
  });

  // A/B slider crossfade
  const abSlider = $('#ab-slider');
  if (abSlider) {
    abSlider.addEventListener('input', () => {
      const v = abSlider.value / 100;
      const flat = $('#audio-flat-el'), emo = $('#audio-emotional-el');
      if (flat) flat.volume = 1 - v;
      if (emo) emo.volume = v;
    });
  }

  setInterval(fetchHealth, 30000);
});
