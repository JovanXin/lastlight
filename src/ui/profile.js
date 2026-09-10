// Elevation profile canvas: gradient area chart with the live position, the
// turnaround point and bailout ticks. Supports scrubbing by pointer.
import { minutesAtDistance } from "../core/pace.js";

const PAD = { l: 46, r: 14, t: 14, b: 34 };

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export class ElevationProfile {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.profile = null;
    this.positionDist = 0;
    this.turnaroundDist = null;
    this.bailouts = [];
    this.schedule = null;
    this.startMs = null;
    this.hoverX = null;
    this.width = 400;
    this.height = 120;
    this.dpr = 1;
    this.onScrub = null;
    this._dragging = false;
    this._bind();
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => { this.resize(); this.render(); });
      this._ro.observe(canvas.parentElement || canvas);
    }
    window.addEventListener("resize", this._onWin = () => { this.resize(); this.render(); });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(80, Math.round(rect.width));
    this.height = Math.max(60, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  setData(profile, overlays) {
    this.profile = profile;
    const o = overlays || {};
    if (o.turnaroundDist !== undefined) this.turnaroundDist = o.turnaroundDist;
    if (o.bailouts !== undefined) this.bailouts = o.bailouts;
    if (o.positionDist !== undefined) this.positionDist = o.positionDist;
    if (o.schedule !== undefined) this.schedule = o.schedule;
    if (o.startMs !== undefined) this.startMs = o.startMs;
    this.render();
  }

  setPosition(dist) { this.positionDist = dist; this.render(); }

  // PNG of the current chart, used by the printable plan sheet.
  toDataUrl() { return this.canvas.toDataURL("image/png"); }

  _elevRange() {
    const pts = this.profile.points;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].ele < min) min = pts[i].ele;
      if (pts[i].ele > max) max = pts[i].ele;
    }
    if (!Number.isFinite(min)) { min = 0; max = 100; }
    if (max - min < 20) { max += 10; min -= 10; }
    return { min: min, max: max };
  }

  _x(dist) {
    const total = this.profile.distanceM || 1;
    return PAD.l + (dist / total) * (this.width - PAD.l - PAD.r);
  }

  _y(ele, range) {
    const span = range.max - range.min || 1;
    return this.height - PAD.b - ((ele - range.min) / span) * (this.height - PAD.t - PAD.b);
  }

  _distFromX(x) {
    const total = this.profile ? this.profile.distanceM : 0;
    const t = clamp((x - PAD.l) / Math.max(1, this.width - PAD.l - PAD.r), 0, 1);
    return t * total;
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.profile || this.profile.points.length < 2) return;

    const pts = this.profile.points;
    const range = this._elevRange();
    const baseY = this.height - PAD.b;

    // grid
    ctx.strokeStyle = "#1b2a4566";
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#61789f";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const y = PAD.t + frac * (this.height - PAD.t - PAD.b);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(this.width - PAD.r, y); ctx.stroke();
      const ele = range.max - frac * (range.max - range.min);
      ctx.fillText(Math.round(ele) + "m", PAD.l - 6, y + 3);
    }
    ctx.textAlign = "center";
    const totalKm = this.profile.distanceM / 1000;
    const steps = totalKm > 8 ? 4 : 3;
    for (let i = 0; i <= steps; i++) {
      const d = (this.profile.distanceM * i) / steps;
      const x = this._x(d);
      const label = (d / 1000).toFixed(totalKm > 8 ? 0 : 1) + "km";
      ctx.fillText(label, x, this.height - 20);
      // Planned clock time at this distance, from the outbound schedule.
      if (this.schedule && this.startMs != null) {
        const mins = minutesAtDistance(this.schedule, d);
        const at = new Date(this.startMs + mins * 60000);
        const hh = String(at.getHours()).padStart(2, "0");
        const mm = String(at.getMinutes()).padStart(2, "0");
        ctx.fillStyle = "#557099";
        ctx.fillText(hh + ":" + mm, x, this.height - 6);
        ctx.fillStyle = "#61789f";
      }
    }

    // full area, muted
    const areaPath = () => {
      ctx.beginPath();
      ctx.moveTo(this._x(pts[0].dist), baseY);
      for (let i = 0; i < pts.length; i++) ctx.lineTo(this._x(pts[i].dist), this._y(pts[i].ele, range));
      ctx.lineTo(this._x(pts[pts.length - 1].dist), baseY);
      ctx.closePath();
    };
    areaPath();
    ctx.fillStyle = "#16233c";
    ctx.fill();

    // walked region (cool) and remaining region (amber)
    const posX = this._x(this.positionDist);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, posX, this.height);
    ctx.clip();
    areaPath();
    const g1 = ctx.createLinearGradient(0, PAD.t, 0, baseY);
    g1.addColorStop(0, "#5b8fd6aa");
    g1.addColorStop(1, "#5b8fd622");
    ctx.fillStyle = g1;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(posX, 0, this.width - posX, this.height);
    ctx.clip();
    areaPath();
    const g2 = ctx.createLinearGradient(0, PAD.t, 0, baseY);
    g2.addColorStop(0, "#ffb347cc");
    g2.addColorStop(1, "#ff8a3d18");
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.restore();

    // ridgeline
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = this._x(pts[i].dist);
      const y = this._y(pts[i].ele, range);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#ffd9a8";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // bailout ticks
    for (let i = 0; i < this.bailouts.length; i++) {
      const b = this.bailouts[i];
      if (b.routeDist == null) continue;
      const x = this._x(b.routeDist);
      ctx.beginPath();
      ctx.moveTo(x, baseY - 2);
      ctx.lineTo(x, baseY + 7);
      ctx.strokeStyle = b.reachable === false ? "#6d5b86" : "#c084fc";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // turnaround marker
    if (this.turnaroundDist != null && this.turnaroundDist > 0 && this.turnaroundDist < this.profile.distanceM) {
      const x = this._x(this.turnaroundDist);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, baseY);
      ctx.strokeStyle = "#ffb34788";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.t + 1);
      ctx.lineTo(x + 5, PAD.t + 6);
      ctx.lineTo(x, PAD.t + 11);
      ctx.lineTo(x - 5, PAD.t + 6);
      ctx.closePath();
      ctx.fillStyle = "#ffb347";
      ctx.fill();
    }

    // position marker
    const posEle = this._eleAt(this.positionDist);
    const py = this._y(posEle, range);
    ctx.beginPath();
    ctx.moveTo(posX, PAD.t - 6);
    ctx.lineTo(posX, baseY);
    ctx.strokeStyle = "#e9eefc";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(posX, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#6ea8fe";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(posX, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#6ea8fe33";
    ctx.fill();

    // hover tooltip
    if (this.hoverX != null && !this._dragging) {
      const d = this._distFromX(this.hoverX);
      const e = this._eleAt(d);
      const hx = this._x(d);
      const hy = this._y(e, range);
      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      const text = (d / 1000).toFixed(2) + " km · " + Math.round(e) + " m";
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      const w = ctx.measureText(text).width + 12;
      const bx = clamp(hx - w / 2, 2, this.width - w - 2);
      ctx.fillStyle = "#0a1120ee";
      ctx.beginPath();
      ctx.roundRect(bx, PAD.t - 2, w, 17, 5);
      ctx.fill();
      ctx.fillStyle = "#e9eefc";
      ctx.textAlign = "left";
      ctx.fillText(text, bx + 6, PAD.t + 10);
    }
  }

  _eleAt(dist) {
    const pts = this.profile.points;
    if (!pts.length) return 0;
    const d = clamp(dist, 0, this.profile.distanceM);
    let lo = 0;
    let hi = pts.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].dist <= d) lo = mid; else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    const span = b.dist - a.dist;
    const t = span > 0 ? (d - a.dist) / span : 0;
    return a.ele + (b.ele - a.ele) * t;
  }

  _evtX(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return ev.clientX - rect.left;
  }

  _bind() {
    const self = this;
    this.canvas.addEventListener("pointerdown", (ev) => {
      this._dragging = true;
      this.canvas.setPointerCapture(ev.pointerId);
      this._scrub(ev);
    });
    this.canvas.addEventListener("pointermove", (ev) => {
      this.hoverX = this._evtX(ev);
      if (this._dragging) this._scrub(ev);
      else this.render();
    });
    const up = (ev) => {
      if (!this._dragging) return;
      this._dragging = false;
      this._scrub(ev);
    };
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", () => { this._dragging = false; });
    this.canvas.addEventListener("pointerleave", () => { this.hoverX = null; this.render(); });
  }

  _scrub(ev) {
    const d = this._distFromX(this._evtX(ev));
    if (this.onScrub) this.onScrub(d);
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
    if (this._onWin) window.removeEventListener("resize", this._onWin);
  }
}
