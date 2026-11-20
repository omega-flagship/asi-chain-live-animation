const el = (id) => document.getElementById(id);
const map = globalThis.orbitalMap;
const channels = {
  proposal: { name: 'Block proposal', singular: 'Proposal', hint: 'A proposer sent its block to this peer.' },
  confirmation: {
    name: 'Block confirmation',
    singular: 'Confirmed',
    hint: 'The receiving node validated the gossiped block. Finalized height is shown separately.',
  },
  rejection: {
    name: 'Block rejection',
    singular: 'Rejected',
    hint: 'The receiving node rejected the gossiped block.',
  },
  deploy: {
    name: 'Deploy submission',
    singular: 'Deploy',
    hint: 'An external signed deploy reached this node’s intake.',
  },
};
const icons = {
  hive: '<path d="m16 2 11 6.4v13L16 28 5 21.4v-13Z"/><path d="m5 8.5 11 6.3 11-6.3M16 14.8v13M10.5 5.3l11 6.4v6.5l-5.5 3.2-5.5-3.2v-6.5L21.5 5.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  orbit:
    '<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-33 12 12)"/><circle cx="12" cy="12" r="2.7"/><circle cx="18" cy="6" r="1.8" fill="currentColor"/>',
  signals: '<path d="M3 18h3M3 12h7M3 6h12M10 18h11M14 12h7M19 6h2"/>',
  nodes:
    '<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="m10.8 7.4-4.6 8.1m7-8.1 4.6 8.1M7.5 18h9"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="2.7"/>',
  play: '<path d="m8 5 10 7-10 7Z" fill="currentColor"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  collapse: '<path d="M9 4v5H4m16 0h-5V4m0 16v-5h5M4 15h5v5"/>',
  tag: '<path d="M3 5h8l9 9-6 6-11-11Z"/><circle cx="7.5" cy="8.5" r="1" fill="currentColor"/>',
  pulse: '<path d="M2 13h5l3-7 4 13 3-8 2 2h3"/>',
};
function icon(name) {
  const box = name === 'hive' ? '0 0 32 31' : '0 0 24 24';
  return (
    '<svg aria-hidden="true" viewBox="' +
    box +
    '" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' +
    icons[name] +
    '</svg>'
  );
}
document.querySelectorAll('[data-icon]').forEach((i) => (i.innerHTML = icon(i.dataset.icon)));
function element(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
const enabled = new Set(Object.keys(channels)),
  counts = new Map(),
  number = new Intl.NumberFormat('en-US');
let sample = null,
  nodes = [],
  selected = null,
  more = false,
  zoom = 1,
  lastSeen = new Map(),
  lastSampleAt = 0,
  feedKey = '';
let polling = false,
  pollTimer = 0,
  started = false,
  pending = null,
  sequence = 0;
const { appChannel: channel, appHostOrigin: origin } = document.documentElement.dataset;
const embedded = Boolean(channel && origin);
const utc = (at) => new Date(at).toISOString().slice(11, 19);
function tick() {
  el('utc').textContent = utc(Date.now());
}
tick();
setInterval(tick, 1000);
for (const [kind, meta] of Object.entries(channels)) {
  const btn = element('button', undefined, 'channel');
  btn.type = 'button';
  btn.setAttribute('aria-pressed', 'true');
  btn.setAttribute('aria-label', 'Show ' + meta.name.toLowerCase());
  btn.title = meta.hint + ' Toggle visibility.';
  btn.style.setProperty('--signal', map.signal[kind]);
  const count = element('span', '—', 'count');
  counts.set(kind, count);
  btn.append(element('i', undefined, 'comet-key'), element('span', meta.name, 'signal-name'), count);
  btn.onclick = () => {
    if (enabled.has(kind)) enabled.delete(kind);
    else enabled.add(kind);
    btn.setAttribute('aria-pressed', String(enabled.has(kind)));
    updateFilter();
  };
  el('channels').append(btn);
}
function updateFilter() {
  map.setFilter(enabled, selected);
  feedKey = '';
  renderFeed();
}
function selectNode(id) {
  selected = id === selected ? null : id;
  el('clear-node').hidden = !selected;
  for (const btn of el('nodes').querySelectorAll('button'))
    btn.setAttribute('aria-pressed', String(btn.dataset.id === selected));
  updateFilter();
}
map.onNode(selectNode);
el('clear-node').onclick = () => selectNode(null);
function directory(next) {
  if (JSON.stringify(nodes) === JSON.stringify(next) && el('nodes').dataset.ready) return;
  nodes = next;
  if (selected && !nodes.some((n) => n.id === selected)) selectNode(null);
  const list = el('nodes');
  list.dataset.ready = 'true';
  const previous = list.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  list.replaceChildren(
    ...nodes.map((n) => {
      const btn = element('button', undefined, 'node-row'),
        dot = element('span', undefined, 'star-key');
      btn.type = 'button';
      btn.dataset.id = n.id;
      btn.setAttribute('aria-pressed', String(n.id === selected));
      btn.title = n.id + ' · ' + (n.issue || n.role) + ' · Filter events';
      dot.style.setProperty('--star', map.nodeColor(n.id));
      btn.append(
        dot,
        element('span', map.nodeName(n.id), 'node-label'),
        element(
          'span',
          n.issue
            ? 'No feed'
            : n.role === 'Observer'
              ? 'Read-only'
              : n.role === 'Bootstrap'
                ? 'Seed'
                : n.role,
          'node-role',
        ),
      );
      btn.onclick = () => selectNode(n.id);
      return btn;
    }),
  );
  if (!nodes.length) list.append(element('p', 'No connected nodes reported.', 'empty'));
  if (previous) [...list.children].find((n) => n.dataset.id === previous)?.focus({ preventScroll: true });
}
function renderFeed() {
  const history = sample?.events || [];
  const filtered = history.filter(
    (e) =>
      (enabled.has(e.type) || (e.proposed && enabled.has('proposal'))) &&
      (!selected || e.from === selected || e.to === selected),
  );
  const rows = filtered.slice(more ? -50 : -6).reverse();
  const key = rows.map((e) => e.id + '/' + e.type).join('|') + '/' + more;
  if (key !== feedKey) {
    feedKey = key;
    el('events').replaceChildren(
      ...rows.map((e) => {
        const kind = enabled.has(e.type) ? e.type : 'proposal';
        const row = element('tr'),
          signalCell = element('td');
        const sig = element('span', channels[kind].singular, 'signal');
        sig.style.setProperty('--signal', map.signal[kind]);
        signalCell.append(sig);
        const route = element('td', undefined, 'route');
        route.append(map.nodeName(e.from), element('span', '→', 'direction'), map.nodeName(e.to));
        const block = element('td');
        const ref = e.deploy || e.block;
        block.title = ref;
        if (e.height != null) block.append(element('span', '#' + number.format(e.height), 'block-no'));
        const short = e.deploy ? '…' + ref.slice(-10) : ref.slice(0, 10) + '…';
        block.append(element('span', short, e.height != null ? 'block-code' : ''));
        row.title = e.detail + ' · ' + ref;
        const at = kind === 'proposal' ? e.at : (e.decidedAt ?? e.at);
        const stamp = element('td', utc(at));
        stamp.title = new Date(at).toISOString();
        row.append(stamp, signalCell, route, block);
        return row;
      }),
    );
  }
  el('more').hidden = filtered.length <= 6;
  el('more').textContent = more ? 'Show fewer' : 'Show more';
  el('quiet').hidden = rows.length > 0;
  el('quiet').textContent =
    sample?.state === 'offline'
      ? 'Observer offline.'
      : !enabled.size
        ? 'Enable a signal channel to see its events.'
        : selected
          ? 'No matching events for ' + map.nodeName(selected) + ' in the recent stream.'
          : 'Listening for shard events…';
}
el('more').onclick = () => {
  more = !more;
  renderFeed();
};
function pauseLabel() {
  const btn = el('pause');
  btn.firstElementChild.innerHTML = icon(map.paused ? 'play' : 'pause');
  btn.lastElementChild.textContent = map.paused ? 'Resume' : 'Pause';
  btn.title = map.paused ? 'Resume animation' : 'Pause animation (telemetry stays live)';
  btn.setAttribute('aria-label', btn.title);
}
pauseLabel();
el('pause').onclick = () => {
  map.pause(!map.paused);
  pauseLabel();
};
el('labels').onclick = () => {
  const on = el('labels').getAttribute('aria-pressed') !== 'true';
  el('labels').setAttribute('aria-pressed', String(on));
  map.label(on);
};
function setZoom(z) {
  zoom = Math.min(1.6, Math.max(0.6, Math.round(z * 10) / 10));
  el('zoom-level').textContent = Math.round(zoom * 100) + '%';
  el('zoom-out').disabled = zoom === 0.6;
  el('zoom-in').disabled = zoom === 1.6;
  map.zoom(zoom);
}
el('zoom-in').onclick = () => setZoom(zoom + 0.2);
el('zoom-out').onclick = () => setZoom(zoom - 0.2);
el('zoom-level').onclick = () => setZoom(1);
function expand() {
  const open = el('orbital').classList.toggle('map-expanded');
  document.body.classList.toggle('expanded', open);
  el('expand').setAttribute('aria-label', open ? 'Restore map size' : 'Expand map');
  el('expand').title = el('expand').getAttribute('aria-label');
  el('expand').firstElementChild.innerHTML = icon(open ? 'collapse' : 'expand');
}
el('expand').onclick = expand;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('expanded')) expand();
});
function state(value, label, note = '') {
  el('status').dataset.state = value;
  el('status').textContent = label;
  el('notice').textContent = note;
  el('notice').hidden = !note;
}
function render(graph) {
  const root = graph?.items?.find((n) => n.kind === 'shard');
  if (!root || !Array.isArray(root.events)) throw new Error('Invalid shard view');
  sample = root;
  const members = graph.items
    .filter((n) => n.kind === 'node')
    .sort((a, b) => {
      const order = { Validator: 0, Bootstrap: 1, Observer: 2, Peer: 3 };
      return order[a.role] - order[b.role] || a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  directory(members);
  map.setNodes(nodes);
  el('tip').textContent = root.tip == null ? '—' : number.format(root.tip);
  el('finalized').textContent = root.finalized == null ? '—' : number.format(root.finalized);
  el('node-count').textContent = root.state === 'offline' ? '—' : String(nodes.length).padStart(2, '0');
  el('network').textContent = root.network || '—';
  el('shard').textContent = root.shard || '—';
  const issues = nodes.filter((n) => n.issue).map((n) => map.nodeName(n.id) + ' · ' + n.issue);
  if (root.state === 'offline') state('offline', 'Offline', root.note || 'Observer unavailable.');
  else if (root.state === 'partial')
    state('partial', 'Partial feed', issues.join(' / ') || 'Observer has no node telemetry.');
  else state('live', 'Live feed');
  for (const [kind, c] of counts)
    c.textContent = root.state === 'offline' ? '—' : number.format(root.counts[kind] || 0);
  const queueTotal = el('queue-accepted');
  queueTotal.textContent = Number.isSafeInteger(root.queueAccepted) ? number.format(root.queueAccepted) : '—';
  queueTotal.title = Number.isSafeInteger(root.queueAccepted)
    ? 'Signed deploys accepted across the connected validators’ queues since each queue started.'
    : 'Queue totals unavailable.';
  const fresh = root.events.filter(
    (e) => lastSeen.get(e.id) !== e.type && (e.decidedAt ?? e.at) >= root.at - (lastSampleAt ? 6500 : 2000),
  );
  if (root.state === 'offline') map.clear();
  else map.add(fresh, lastSeen);
  lastSampleAt = root.state === 'offline' ? 0 : root.at;
  lastSeen = new Map(root.events.map((e) => [e.id, e.type]));
  renderFeed();
}
function requestGraph() {
  if (!embedded)
    return fetch('./api/view', { cache: 'no-store', signal: AbortSignal.timeout(12000) }).then((r) => {
      if (!r.ok) throw new Error('View unavailable');
      return r.json();
    });
  return new Promise((resolve, reject) => {
    const id = 'orbit-' + ++sequence,
      timer = setTimeout(() => {
        pending = null;
        reject(new Error('Hive request timed out'));
      }, 60000);
    pending = { id, resolve, reject, timer };
    parent.postMessage({ type: 'app-request', channel, id, op: 'view', body: { stage: 'unfold' } }, origin);
  });
}
async function poll() {
  if (polling || document.hidden || !started) return;
  clearTimeout(pollTimer);
  polling = true;
  try {
    render(await requestGraph());
  } catch {
    map.clear();
    lastSampleAt = 0;
    state(
      'offline',
      'Disconnected',
      sample
        ? 'Feed disconnected. Showing the last received snapshot. Reconnecting…'
        : 'Waiting for the telemetry host. Reconnecting…',
    );
  } finally {
    polling = false;
    if (!document.hidden) pollTimer = setTimeout(poll, 2100);
  }
}
function begin() {
  started = true;
  poll();
}
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!embedded || event.source !== parent || event.origin !== origin || msg?.channel !== channel) return;
  if (msg.type === 'app-context') {
    if (!started) begin();
    return;
  }
  if (msg.type === 'app-reply' && pending?.id === msg.id) {
    const p = pending;
    pending = null;
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error('Hive view unavailable'));
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(pollTimer);
  else poll();
});
if (embedded) parent.postMessage({ type: 'app-ready', channel }, origin);
else begin();
