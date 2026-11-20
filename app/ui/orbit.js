// The classic Hive projection: stars move on inclined ellipses; messages follow curved flights.
const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const TAU = Math.PI * 2;
const signal = { proposal: '#69a9ff', rejection: '#ff7586', confirmation: '#69dfa3', deploy: '#ffffff' };
const palette = ['#84b6ff', '#b9a3ff', '#80d9d9', '#ebaa80', '#c696e8', '#b9d785'];
const named = {
  'rnode.validator1': { slot: 2, color: '#89b7ff' },
  'rnode.validator2': { slot: 1, color: '#a5a3ff' },
  'rnode.validator3': { slot: 4, color: '#83d7cc' },
  'rnode.bootstrap': { slot: 0, color: '#ebb175' },
  'rnode.readonly': { slot: 3, color: '#c694e6' },
};
function nodeName(id) {
  if (id === 'external') return 'External submitter';
  if (id === 'rnode.readonly') return 'Observer';
  if (id === 'rnode.bootstrap') return 'Bootstrap';
  const validator = /^rnode\.validator(\d+)$/.exec(id);
  return validator ? 'Validator ' + validator[1].padStart(2, '0') : id.replace(/^rnode\./, '');
}
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function nodeColor(id) {
  return named[id]?.color || palette[hash(id) % palette.length];
}
function generator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = generator(1077);
const noiseTable = Float32Array.from({ length: 65536 }, random);
function noise(x, y) {
  const i = Math.floor(x),
    j = Math.floor(y);
  let dx = x - i,
    dy = y - j;
  dx *= dx * (3 - 2 * dx);
  dy *= dy * (3 - 2 * dy);
  const sample = (a, b) => noiseTable[((b & 255) << 8) + (a & 255)];
  const a = sample(i, j) * (1 - dx) + sample(i + 1, j) * dx;
  return a * (1 - dy) + (sample(i, j + 1) * (1 - dx) + sample(i + 1, j + 1) * dx) * dy;
}
function cloud(x, y) {
  return (
    noise(x, y) * 0.52 +
    noise(x * 2.1, y * 2.1) * 0.27 +
    noise(x * 4.4, y * 4.4) * 0.14 +
    noise(x * 9, y * 9) * 0.07
  );
}
function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function backdrop(w, h) {
  const field = surface(Math.max(2, Math.ceil(w / 3)), Math.max(2, Math.ceil(h / 3)));
  const g = field.getContext('2d'),
    pixels = g.createImageData(field.width, field.height);
  for (let y = 0; y < field.height; y++)
    for (let x = 0; x < field.width; x++) {
      const u = x / field.width,
        v = y / field.height,
        n = cloud(u * 5 + 14, v * 4 + 32);
      const warp = noise(u * 4 + 9, v * 3) * 0.26;
      const band = Math.exp(-Math.pow((v - 0.78 + u * 0.56 - warp + 0.14) * 4.7, 2));
      const gas = Math.max(0, n - 0.32) * band * 1.8;
      const k = (y * field.width + x) * 4;
      pixels.data[k] = 7 + gas * 30;
      pixels.data[k + 1] = 10 + gas * 27;
      pixels.data[k + 2] = 21 + n * 3 + gas * 58;
      pixels.data[k + 3] = 255;
    }
  g.putImageData(pixels, 0, 0);
  const sky = surface(w, h),
    s = sky.getContext('2d');
  s.drawImage(field, 0, 0, w, h);
  const roll = generator(5042);
  for (let i = 0; i < (w * h) / 430; i++) {
    const x = roll() * w,
      y = roll() * h,
      power = roll() ** 3;
    const rgb = roll() > 0.86 ? '241,209,180' : '185,205,245';
    s.fillStyle = 'rgba(' + rgb + ',' + (0.16 + power * 0.58) + ')';
    s.beginPath();
    s.arc(x, y, 0.26 + power * 0.8, 0, TAU);
    s.fill();
    if (power > 0.975) {
      s.fillRect(x - 2, y - 0.25, 4, 0.5);
      s.fillRect(x - 0.25, y - 2, 0.5, 4);
    }
  }
  return sky;
}
const phases = [2.68, 4.5, 5.91, 0.92, 3.61];
const tilt = [-0.24, -0.16, -0.31, -0.23, -0.29];
const dpr = () => Math.min(2, window.devicePixelRatio || 1);
let w = 0,
  h = 0,
  sky = null,
  stars = [],
  flights = [],
  labels = true,
  zoom = 1,
  selected = null,
  visible = new Set(Object.keys(signal));
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches,
  elapsed = 0,
  last = 0,
  frame = 0;
let spots = new Map(),
  clickNode = () => {};
function geometry() {
  const radius = Math.min(w * 0.411, h * 0.92) * zoom;
  return {
    cx: w * 0.5,
    cy: h * 0.515,
    rx: radius,
    ry: Math.min(h * 0.37, Math.min(w * 0.411, h * 0.92) * 0.63) * zoom,
  };
}
function orbitPoint(star, angle, g) {
  const u = Math.cos(angle) * star.radius,
    v = Math.sin(angle) * star.radius;
  return {
    x: g.cx + g.rx * (u * Math.cos(star.tilt) - v * 0.58 * Math.sin(star.tilt)),
    y: g.cy + g.ry * (u * Math.sin(star.tilt) * 1.65 + v * star.flat * Math.cos(star.tilt)),
  };
}
function pathStar(star, g) {
  ctx.beginPath();
  for (let i = 0; i <= 180; i++) {
    const p = orbitPoint(star, (i * TAU) / 180, g);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.strokeStyle = star.id === selected ? star.color + 'b3' : star.color + '43';
  ctx.lineWidth = star.id === selected ? 1.4 : 0.85;
  ctx.stroke();
}
function starGlow(p, star) {
  const radius = star.id === selected ? 23 : 18,
    glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  glow.addColorStop(0, star.color);
  glow.addColorStop(0.18, star.color + 'ce');
  glow.addColorStop(0.4, star.color + '40');
  glow.addColorStop(1, star.color + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  ctx.fillStyle = '#edf5ff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = star.color + '99';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(p.x - 8, p.y);
  ctx.lineTo(p.x + 8, p.y);
  ctx.moveTo(p.x, p.y - 7);
  ctx.lineTo(p.x, p.y + 7);
  ctx.stroke();
  if (star.id === selected) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, TAU);
    ctx.stroke();
  }
}
// The entry point is a layout choice; the intake log identifies the receiving node only.
function edgePoint(angle) {
  const dx = Math.cos(angle),
    dy = Math.sin(angle);
  const radius = Math.min((w / 2 + 5) / Math.abs(dx), (h / 2 + 5) / Math.abs(dy));
  return { x: w / 2 + dx * radius, y: h / 2 + dy * radius };
}

const verdictPhase = 0.56;
function flight(f) {
  const fraction = (elapsed - f.start) / 2;
  const phase = f.proposed && fraction < verdictPhase ? 'proposal' : f.type;
  if (
    fraction < 0 ||
    fraction > 1 ||
    !visible.has(phase) ||
    (selected && f.from !== selected && f.to !== selected)
  )
    return;
  const a = f.type === 'deploy' ? edgePoint(f.entryAngle) : spots.get(f.from),
    b = spots.get(f.to);
  if (!a || !b) return;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const bend = f.bend;
  const point = (t) => ({
    x: a.x + dx * t - dy * bend * 4 * t * (1 - t),
    y: a.y + dy * t + dx * bend * 4 * t * (1 - t),
  });
  const color = signal[phase],
    head = point(fraction);
  const tail = Math.max(0, fraction - 0.2);
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const p = point(tail + ((fraction - tail) * i) / 12),
      q = point(tail + ((fraction - tail) * (i + 1)) / 12);
    ctx.globalAlpha = ((i + 1) / 12) * 0.83;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7 + i * 0.15;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 2.3, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
}
function paint() {
  if (!sky || !w || !h) return;
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  ctx.drawImage(sky, 0, 0, w, h);
  const g = geometry();
  spots.clear();
  for (const star of stars) {
    pathStar(star, g);
    spots.set(star.id, orbitPoint(star, star.phase + elapsed * star.speed, g));
  }
  for (const f of flights) flight(f);
  const occupied = [];
  for (const star of stars) {
    const p = spots.get(star.id);
    ctx.globalAlpha = (selected && star.id !== selected) || star.issue ? 0.58 : 1;
    starGlow(p, star);
    if (labels) {
      const name = nodeName(star.id);
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'left';
      const size = ctx.measureText(name).width,
        x = Math.max(5, Math.min(w - size - 6, p.x - size / 2));
      let y = p.y + 22;
      for (
        let i = 0;
        i < 4 && occupied.some((l) => x < l.x + l.w + 4 && x + size + 4 > l.x && Math.abs(y - l.y) < 14);
        i++
      )
        y += 14;
      occupied.push({ x, y, w: size });
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0b0e19';
      ctx.strokeText(name, x, y);
      ctx.fillStyle = star.color;
      ctx.fillText(name, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
function step(t) {
  frame = 0;
  if (last && t - last < 1000 / 30 - 1) {
    schedule();
    return;
  }
  if (last) elapsed += Math.min((t - last) / 1000, 0.12);
  last = t;
  flights = flights.filter((f) => f.start + 2 >= elapsed);
  paint();
  schedule();
}
function schedule() {
  if (!paused && !document.hidden && !frame) frame = requestAnimationFrame(step);
}
function resetFrame() {
  cancelAnimationFrame(frame);
  frame = 0;
  last = 0;
  paint();
  schedule();
}
function resize() {
  const r = canvas.getBoundingClientRect();
  const width = Math.round(r.width),
    height = Math.round(r.height);
  if (width < 1 || height < 1 || (width === w && height === h && canvas.width === Math.round(w * dpr())))
    return;
  w = width;
  h = height;
  canvas.width = Math.round(w * dpr());
  canvas.height = Math.round(h * dpr());
  sky = backdrop(w, h);
  paint();
  schedule();
}
new ResizeObserver(resize).observe(canvas);
document.addEventListener('visibilitychange', resetFrame);
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const hit = stars.find((s) => {
    const p = spots.get(s.id);
    return p && Math.hypot(e.clientX - r.left - p.x, e.clientY - r.top - p.y) < 20;
  });
  if (hit) clickNode(hit.id);
});
globalThis.orbitalMap = {
  signal,
  nodeName,
  nodeColor,
  setNodes(nodes) {
    stars = nodes.map((n, i) => {
      const slot = named[n.id]?.slot ?? 5 + i,
        phase = phases[slot] ?? (hash(n.id) / 4294967296) * TAU;
      return {
        ...n,
        color: nodeColor(n.id),
        phase,
        tilt: tilt[slot] ?? -0.25,
        radius: slot < 5 ? 0.36 + slot * 0.156 : 0.45 + (slot % 6) * 0.1,
        flat: 0.85 + (slot % 3) * 0.09,
        speed: (0.0097 + 0.0009 * (5 - (slot % 6))) * (slot % 2 ? 1 : -1),
      };
    });
    paint();
  },
  add(events, previous) {
    if (paused || document.hidden || !events.length) return;
    const first = Math.min(...events.map((e) => e.decidedAt ?? e.at));
    for (const e of events) {
      const active = flights.find((f) => f.id === e.id);
      if (active) {
        Object.assign(active, e);
        continue;
      }
      // A verdict arriving after the flight ended colors only the final approach.
      const arrival = previous.has(e.id) && e.decidedAt != null;
      const offset = Math.min(1.7, ((e.decidedAt ?? e.at) - first) / 1000);
      flights.push({
        ...e,
        start: elapsed + offset - (arrival ? 2 * verdictPhase : 0),
        entryAngle: (hash(e.id + 'entry') / 4294967296) * TAU,
        bend: (hash(e.id) % 2 ? 1 : -1) * (0.09 + (hash(e.id + 'b') % 8) / 100),
      });
    }
    flights = flights.slice(-180);
  },
  clear() {
    flights = [];
    paint();
  },
  setFilter(kinds, node) {
    visible = new Set(kinds);
    selected = node;
    paint();
  },
  onNode(fn) {
    clickNode = fn;
  },
  get paused() {
    return paused;
  },
  pause(value) {
    paused = value;
    if (!paused) flights = [];
    resetFrame();
  },
  label(value) {
    labels = value;
    paint();
  },
  zoom(value) {
    zoom = value;
    paint();
  },
};
