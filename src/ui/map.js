// A small slippy-map engine on a plain canvas. No Leaflet, no Google, no
// tracking. Tiles come from OpenStreetMap when online; when they are missing
// the map still draws the route, so the app stays useful offline.

const TILE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
// Turns light OpenStreetMap tiles into a night basemap without any tile server
// that needs a key.
const NIGHT_FILTER = "invert(1) hue-rotate(200deg) brightness(0.82) contrast(0.85) saturate(0.42)";

function lonToWorldX(lon, worldSize) { return ((lon + 180) / 360) * worldSize; }

function latToWorldY(lat, worldSize) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize;
}

function worldXToLon(x, worldSize) { return (x / worldSize) * 360 - 180; }

function worldYToLat(y, worldSize) {
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// One free basemap (OpenStreetMap, no API key). The night look is produced by
// filtering the tiles on the canvas, so there is nothing to license or leak.
export function makeTileUrl() {
  return function (z, x, y) {
    return "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";
  };
}

export function attributionFor() {
  return "\u00a9 OpenStreetMap contributors";
}

export class TrailMap {
  constructor(canvas, options) {
    const opts = options || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.style = opts.style || "dark";
    this.tileUrl = opts.tileUrl || makeTileUrl(this.style);
    this.attribution = opts.attribution || attributionFor(this.style);
    this.center = opts.center || { lat: -36.8, lon: 174.8 };
    this.zoom = opts.zoom || 12;
    this.tiles = new Map();
    this.maxTiles = 320;
    this.route = [];
    this.routeProfile = null;
    this.positionDist = 0;
    this.position = null;
    this.turnaround = null;
    this.bailouts = [];
    this.drawMode = false;
    this.drawPoints = [];
    this.onMapClick = null;
    this.onDrawFinish = null;
    this.onViewChange = null;
    this.dpr = 1;
    this.width = 300;
    this.height = 200;
    this._pointers = new Map();
    this._pinchBase = null;
    this._raf = null;
    this._bind();
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      const target = canvas.parentElement || canvas;
      this._ro = new ResizeObserver(() => { this.resize(); this.render(); });
      this._ro.observe(target);
    }
    window.addEventListener("resize", this._onWinResize = () => { this.resize(); this.render(); });
  }

  // ---------- projection ----------
  _worldSize() { return TILE * Math.pow(2, this.zoom); }

  project(lat, lon) {
    const ws = this._worldSize();
    const cw = { x: lonToWorldX(this.center.lon, ws), y: latToWorldY(this.center.lat, ws) };
    return {
      x: lonToWorldX(lon, ws) - cw.x + this.width / 2,
      y: latToWorldY(lat, ws) - cw.y + this.height / 2,
    };
  }

  unproject(sx, sy) {
    const ws = this._worldSize();
    const cw = { x: lonToWorldX(this.center.lon, ws), y: latToWorldY(this.center.lat, ws) };
    const wx = sx - this.width / 2 + cw.x;
    const wy = sy - this.height / 2 + cw.y;
    return { lat: worldYToLat(wy, ws), lon: worldXToLon(wx, ws) };
  }

  // ---------- sizing ----------
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(50, Math.round(rect.width));
    this.height = Math.max(50, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  // ---------- data ----------
  setRoute(track, profile) {
    this.route = track || [];
    this.routeProfile = profile || null;
    this.drawPoints = [];
  }

  setPosition(distM, profile) {
    this.positionDist = distM;
    if (profile && profile.points.length) {
      const pts = profile.points;
      let lo = 0;
      let hi = pts.length - 1;
      const d = clamp(distM, 0, profile.distanceM);
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].dist <= d) lo = mid; else hi = mid;
      }
      const a = pts[lo];
      const b = pts[hi];
      const span = b.dist - a.dist;
      const t = span > 0 ? (d - a.dist) / span : 0;
      this.position = {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
      };
    }
  }

  setTurnaround(point) { this.turnaround = point; }

  setStyle(style) {
    this.style = style;
    this.attribution = attributionFor();
    this.render();
  }
  setBailouts(list) { this.bailouts = list || []; }

  // ---------- tiles ----------
  _tile(z, x, y) {
    const n = Math.pow(2, z);
    const wx = ((x % n) + n) % n;
    const key = z + "/" + wx + "/" + y;
    let rec = this.tiles.get(key);
    if (rec) return rec;
    rec = { state: "loading", img: null, used: 0 };
    const img = new Image();
    rec.img = img;
    const self = this;
    img.onload = function () { rec.state = "loaded"; self._schedule(); };
    img.onerror = function () { rec.state = "error"; self._schedule(); };
    img.src = this.tileUrl(z, wx, y);
    this.tiles.set(key, rec);
    return rec;
  }

  _prune(visible) {
    if (this.tiles.size <= this.maxTiles) return;
    for (const key of Array.from(this.tiles.keys())) {
      if (this.tiles.size <= this.maxTiles) break;
      if (!visible.has(key)) this.tiles.delete(key);
    }
  }

  // ---------- render ----------
  _schedule() {
    if (this._raf) return;
    const self = this;
    this._raf = requestAnimationFrame(function () { self._raf = null; self.render(); });
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#0a1120";
    ctx.fillRect(0, 0, this.width, this.height);

    const z = Math.round(this.zoom);
    const n = Math.pow(2, z);
    const ws = this._worldSize();
    const cw = { x: lonToWorldX(this.center.lon, ws), y: latToWorldY(this.center.lat, ws) };
    const left = cw.x - this.width / 2;
    const top = cw.y - this.height / 2;
    const x0 = Math.floor(left / TILE);
    const x1 = Math.floor((left + this.width) / TILE);
    const y0 = Math.max(0, Math.floor(top / TILE));
    const y1 = Math.min(n - 1, Math.floor((top + this.height) / TILE));
    const visible = new Set();

    // The night look is a canvas filter over plain OSM tiles; the route and
    // markers drawn below stay un-filtered.
    ctx.filter = this.style === "terrain" ? "none" : NIGHT_FILTER;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const wx = ((x % n) + n) % n;
        visible.add(z + "/" + wx + "/" + y);
        const rec = this._tile(z, x, y);
        if (rec.state !== "loaded") continue;
        const sx = Math.round(x * TILE - left);
        const sy = Math.round(y * TILE - top);
        ctx.drawImage(rec.img, sx, sy, TILE + 1, TILE + 1);
      }
    }
    ctx.filter = "none";
    this._prune(visible);

    this._drawRoute(ctx);
    this._drawBailouts(ctx);
    this._drawTurnaround(ctx);
    this._drawPosition(ctx);

    // attribution + a soft vignette to keep the UI readable
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#8ea3c788";
    ctx.textAlign = "right";
    ctx.fillText(this.attribution, this.width - 8, this.height - 6);
    ctx.textAlign = "left";
    if (this.drawMode) {
      ctx.fillStyle = "#ffb347";
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("Drawing route — click to add, double-click to finish", 14, this.height - 10);
    }
  }

  _pathFrom(points, uptoDist) {
    const ctx = this.ctx;
    ctx.beginPath();
    let started = false;
    let prevD = 0;
    for (let i = 0; i < points.length; i++) {
      const p = this.project(points[i].lat, points[i].lon);
      const d = points[i].dist == null ? prevD : points[i].dist;
      prevD = d;
      if (uptoDist != null && d > uptoDist) {
        if (!started) { ctx.moveTo(p.x, p.y); }
        break;
      }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); }
    }
  }

  _drawRoute(ctx) {
    const pts = this.route;
    if (!pts || pts.length < 2) {
      if (this.drawPoints.length > 1) this._strokePolyline(ctx, this.drawPoints);
      return;
    }
    if (this.routeProfile) {
      // walked portion, muted
      this._pathFrom(this.routeProfile.points, this.positionDist);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "#5b7fb0aa"; ctx.lineWidth = 3; ctx.stroke();
      // remaining portion, amber
      const remaining = this.routeProfile.points.filter(function (p) { return p.dist >= 0; });
      this._strokeRemaining(ctx, remaining, this.positionDist);
    } else {
      this._strokePolyline(ctx, pts);
    }
  }

  _strokeRemaining(ctx, points, fromDist) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].dist < fromDist) continue;
      const p = this.project(points[i].lat, points[i].lon);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); }
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a1120cc"; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 3.5; ctx.stroke();
  }

  _strokePolyline(ctx, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = this.project(pts[i].lat, pts[i].lon);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a1120cc"; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 3.5; ctx.stroke();
  }

  _dot(ctx, x, y, r, fill, ring) {
    if (ring) { ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  }

  _label(ctx, text, x, y, color) {
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "#0a1120dd";
    ctx.beginPath();
    const padX = 5;
    ctx.roundRect(x, y - 11, w + padX * 2, 16, 5);
    ctx.fill();
    ctx.fillStyle = color || "#e9eefc";
    ctx.fillText(text, x + padX, y + 1);
  }

  _drawBailouts(ctx) {
    for (let i = 0; i < this.bailouts.length; i++) {
      const b = this.bailouts[i];
      const p = this.project(b.lat, b.lon);
      if (p.x < -40 || p.y < -40 || p.x > this.width + 40 || p.y > this.height + 40) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = b.reachable === false ? "#6d5b86" : "#c084fc";
      ctx.strokeStyle = "#0a1120";
      ctx.lineWidth = 1.5;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
      if (b.name && this.zoom >= 11) this._label(ctx, b.name, p.x + 10, p.y - 4, b.reachable === false ? "#b6a6c9" : "#e6ccff");
    }
  }

  _drawTurnaround(ctx) {
    const t = this.turnaround;
    if (!t) return;
    const p = this.project(t.lat, t.lon);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = "#0a1120";
    ctx.lineWidth = 3;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  _drawPosition(ctx) {
    if (!this.position) return;
    const p = this.project(this.position.lat, this.position.lon);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#6ea8fe33";
    ctx.fill();
    this._dot(ctx, p.x, p.y, 6, "#6ea8fe", "#0a1120cc");
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ---------- view ----------
  zoomBy(delta, anchor) {
    const before = anchor ? this.unproject(anchor.x, anchor.y) : null;
    this.zoom = clamp(this.zoom + delta, MIN_ZOOM, MAX_ZOOM);
    if (before) {
      const after = this.project(before.lat, before.lon);
      this._panPixels(after.x - anchor.x, after.y - anchor.y);
    }
    this._schedule();
    if (this.onViewChange) this.onViewChange(this);
  }

  _panPixels(dx, dy) {
    const ws = this._worldSize();
    const cwx = lonToWorldX(this.center.lon, ws) - dx;
    const cwy = latToWorldY(this.center.lat, ws) - dy;
    this.center = { lat: worldYToLat(cwy, ws), lon: worldXToLon(cwx, ws) };
  }

  fitTo(points, padding) {
    if (!points || points.length < 2) return;
    const pad = padding == null ? 48 : padding;
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (let i = 0; i < points.length; i++) {
      minLat = Math.min(minLat, points[i].lat); maxLat = Math.max(maxLat, points[i].lat);
      minLon = Math.min(minLon, points[i].lon); maxLon = Math.max(maxLon, points[i].lon);
    }
    this.center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
    let best = MIN_ZOOM;
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
      this.zoom = z;
      const a = this.project(maxLat, minLon);
      const b = this.project(minLat, maxLon);
      if (Math.abs(b.x - a.x) <= this.width - pad * 2 && Math.abs(b.y - a.y) <= this.height - pad * 2) best = z;
    }
    this.zoom = best;
    this._schedule();
  }

  // ---------- interaction ----------
  _localPoint(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  _bind() {
    const self = this;
    this.canvas.addEventListener("pointerdown", function (ev) {
      self.canvas.setPointerCapture(ev.pointerId);
      self._pointers.set(ev.pointerId, self._localPoint(ev));
      if (self._pointers.size === 2) self._startPinch();
    });
    this.canvas.addEventListener("pointermove", function (ev) {
      if (!self._pointers.has(ev.pointerId)) return;
      const prev = self._pointers.get(ev.pointerId);
      const next = self._localPoint(ev);
      self._pointers.set(ev.pointerId, next);
      if (self._pointers.size === 1) {
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 0) {
          self._panPixels(dx, dy);
          self._moved = (self._moved || 0) + Math.abs(dx) + Math.abs(dy);
          self.canvas.parentElement && self.canvas.parentElement.classList.add("dragging");
          self._schedule();
        }
      } else if (self._pointers.size === 2) {
        self._updatePinch();
      }
    });
    const end = function (ev) {
      const wasSingle = self._pointers.size === 1;
      const point = self._pointers.get(ev.pointerId) || self._localPoint(ev);
      self._pointers.delete(ev.pointerId);
      if (self._pointers.size < 2) self._pinchBase = null;
      self.canvas.parentElement && self.canvas.parentElement.classList.remove("dragging");
      if (wasSingle && (self._moved || 0) < 6 && !self._pinchBase) {
        const ll = self.unproject(point.x, point.y);
        if (self.onMapClick) self.onMapClick(ll.lat, ll.lon);
      }
      self._moved = 0;
    };
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", function (ev) {
      self._pointers.delete(ev.pointerId);
      self._pinchBase = null;
      self._moved = 0;
    });
    this.canvas.addEventListener("dblclick", function (ev) {
      ev.preventDefault();
      if (self.drawMode && self.onDrawFinish) self.onDrawFinish();
    });
    this.canvas.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      const p = self._localPoint(ev);
      self.zoomBy(ev.deltaY < 0 ? 1 : -1, p);
    }, { passive: false });
  }

  _startPinch() {
    const pts = Array.from(this._pointers.values());
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    this._pinchBase = { dist: Math.hypot(dx, dy) || 1, zoom: this.zoom };
  }

  _updatePinch() {
    if (!this._pinchBase) { this._startPinch(); return; }
    const pts = Array.from(this._pointers.values());
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    const dist = Math.hypot(dx, dy) || 1;
    const ratio = dist / this._pinchBase.dist;
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    if (ratio > 1.35) { this.zoomBy(1, mid); this._startPinch(); }
    else if (ratio < 0.74) { this.zoomBy(-1, mid); this._startPinch(); }
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
    if (this._onWinResize) window.removeEventListener("resize", this._onWinResize);
  }
}
