/* Keele Runs — route browsing, filtering, and a map per route.
 *
 * No accounts, no storage, no analytics. Location is read only when the runner
 * asks for it and is never sent anywhere or kept.
 */

const TILES = 'https://tiles.openfreemap.org/styles/liberty';

// The OpenFreeMap style ships with no attribution of its own, so MapLibre would
// otherwise credit nobody. The OpenStreetMap licence requires this on the map itself,
// not only in the page footer.
const ATTRIBUTION =
  '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenMapTiles</a> · ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const el = (id) => document.getElementById(id);
const listView = el('view-list');
const detailView = el('view-detail');

let ROUTES = [];
let map = null;          // created once, on first route opened
let locationWatch = null;
let youMarker = null;

const filters = { distance: 'any', surface: 'any', lighting: 'any', scenery: 'any' };

/* ---------------- loading ---------------- */

async function boot() {
  try {
    const res = await fetch('data/routes.json');
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    ROUTES = data.routes;
  } catch (err) {
    el('routes').innerHTML =
      `<li class="empty">Could not load the routes (${err.message}).
       If you opened this file directly, run it through a local server instead —
       see README.md.</li>`;
    return;
  }
  wireFilters();
  render();
  window.addEventListener('hashchange', route);
  route();
}

/* ---------------- filtering ---------------- */

function inDistanceBand(km, band) {
  if (band === 'any') return true;
  if (band === 'short') return km < 3;
  if (band === 'mid') return km >= 3 && km <= 6;
  return km > 6;
}

function matches(r) {
  return inDistanceBand(r.distanceKm, filters.distance)
    && (filters.surface === 'any' || r.surface === filters.surface)
    && (filters.lighting === 'any' || r.lighting.status === filters.lighting)
    && (filters.scenery === 'any' || r.scenery.includes(filters.scenery));
}

function wireFilters() {
  document.querySelectorAll('.chips').forEach((group) => {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      group.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-on'));
      chip.classList.add('is-on');
      filters[group.dataset.group] = chip.dataset.value;
      render();
    });
  });

  el('reset').addEventListener('click', () => {
    Object.keys(filters).forEach((k) => { filters[k] = 'any'; });
    document.querySelectorAll('.chips').forEach((group) => {
      group.querySelectorAll('.chip').forEach((c) => {
        c.classList.toggle('is-on', c.dataset.value === 'any');
      });
    });
    render();
  });

  el('back').addEventListener('click', () => { location.hash = ''; });
  el('locate').addEventListener('click', locate);
}

/* ---------------- list ---------------- */

function render() {
  const shown = ROUTES.filter(matches);
  const list = el('routes');

  list.innerHTML = shown.map((r) => `
    <li class="card">
      <button class="card-hit" data-id="${r.id}">
        <span class="thumb"><span>Photo to come</span></span>
        <span class="card-body">
          <h3>${r.name}</h3>
          <p>${r.summary}</p>
          <span class="meta">
            <span class="tag strong">${r.distanceKm} km</span>
            <span class="tag">${r.timeMin[0]}–${r.timeMin[1]} min</span>
            <span class="tag">${r.surface}</span>
            <span class="tag">${r.lighting.status}</span>
          </span>
        </span>
      </button>
    </li>`).join('');

  list.querySelectorAll('.card-hit').forEach((b) => {
    b.addEventListener('click', () => { location.hash = b.dataset.id; });
  });

  el('count').textContent =
    `${shown.length} of ${ROUTES.length} route${ROUTES.length === 1 ? '' : 's'}`;
  el('empty').hidden = shown.length !== 0;
}

/* ---------------- routing ---------------- */

function route() {
  const id = location.hash.slice(1);
  const found = ROUTES.find((r) => r.id === id);
  if (found) showDetail(found);
  else showList();
}

function showList() {
  stopLocating();
  detailView.hidden = true;
  listView.hidden = false;
  window.scrollTo(0, 0);
}

function showDetail(r) {
  listView.hidden = true;
  detailView.hidden = false;
  window.scrollTo(0, 0);

  el('d-name').textContent = r.name;
  el('d-summary').textContent = r.summary;
  el('d-unverified').hidden = r.verified;

  const checked = r.lighting.checked
    ? `<span class="checked">checked ${r.lighting.checked}</span>`
    : `<span class="checked">not yet checked</span>`;

  el('d-facts').innerHTML = `
    <div><dt>Distance</dt><dd>${r.distanceKm} km</dd></div>
    <div><dt>Rough time</dt><dd>${r.timeMin[0]}–${r.timeMin[1]} min</dd></div>
    <div><dt>Shape</dt><dd>${r.shape}</dd></div>
    <div><dt>Start</dt><dd>${r.start}</dd></div>
    <div><dt>Underfoot</dt><dd>${r.surface}</dd></div>
    <div><dt>Hills</dt><dd>${r.hills}</dd></div>
    <div><dt>Lighting</dt><dd>${r.lighting.status} ${checked}</dd></div>
    <div><dt>Traffic</dt><dd>${r.traffic}</dd></div>
    <div><dt>Scenery</dt><dd>${r.scenery.join(', ')}</dd></div>`;

  // Placeholders stay visibly blank rather than borrowing a photo of somewhere else.
  el('d-photos').innerHTML = r.photos.length
    ? r.photos.map((p) => `<img src="${p.src}" alt="${p.alt}" loading="lazy">`).join('')
    : `<div class="photo-ph">Photo of the start<br>to come</div>
       <div class="photo-ph">Photo along the route<br>to come</div>`;

  drawMap(r);
}

/* ---------------- map ---------------- */

function drawMap(r) {
  if (!map) {
    map = new maplibregl.Map({
      container: 'map',
      style: TILES,
      center: r.path[0],
      zoom: 13,
      attributionControl: { compact: true, customAttribution: ATTRIBUTION },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => paintRoute(r));
  } else if (map.isStyleLoaded()) {
    // Coming back from the list, the container was hidden and may have gone stale.
    map.resize();
    paintRoute(r);
  } else {
    map.once('load', () => paintRoute(r));
  }
}

function paintRoute(r) {
  const geo = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: r.path },
  };

  if (map.getSource('route')) {
    map.getSource('route').setData(geo);
  } else {
    map.addSource('route', { type: 'geojson', data: geo });
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 },
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1f6f4a', 'line-width': 4 },
    });
  }

  const b = r.path.reduce(
    (acc, c) => acc.extend(c),
    new maplibregl.LngLatBounds(r.path[0], r.path[0]),
  );
  map.fitBounds(b, { padding: 48, duration: 0 });
}

/* ---------------- where am I ---------------- */

function locate() {
  const msg = el('locate-msg');
  const btn = el('locate');

  if (locationWatch !== null) { stopLocating(); return; }

  if (!navigator.geolocation) {
    msg.textContent = 'This browser cannot provide a location.';
    return;
  }
  if (!window.isSecureContext) {
    msg.textContent = 'Location needs a secure connection. On your own machine, localhost counts.';
    return;
  }

  msg.textContent = 'Asking your browser…';
  btn.disabled = true;

  locationWatch = navigator.geolocation.watchPosition(
    (pos) => {
      btn.disabled = false;
      btn.textContent = 'Stop showing my location';
      const here = [pos.coords.longitude, pos.coords.latitude];
      const accuracy = Math.round(pos.coords.accuracy);
      msg.textContent = `Showing your position, accurate to about ${accuracy} m. Nothing is stored.`;

      if (!youMarker) {
        youMarker = new maplibregl.Marker({ color: '#c2410c' }).setLngLat(here).addTo(map);
      } else {
        youMarker.setLngLat(here);
      }
    },
    (err) => {
      btn.disabled = false;
      stopLocating();
      msg.textContent = err.code === err.PERMISSION_DENIED
        ? 'No problem — the route works without it.'
        : 'Could not get a location just now. The route works without it.';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
}

function stopLocating() {
  if (locationWatch !== null) {
    navigator.geolocation.clearWatch(locationWatch);
    locationWatch = null;
  }
  if (youMarker) { youMarker.remove(); youMarker = null; }
  const btn = el('locate');
  if (btn) { btn.textContent = 'Show where I am'; btn.disabled = false; }
  const msg = el('locate-msg');
  if (msg) msg.textContent = '';
}

boot();
