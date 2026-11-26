(() => {
  "use strict";

  const T = {
    en: {
      subtitle: "Hokkaido redrawn with driving time as the unit of the map. Directions and neighbours stay; kilometres go.",
      unit: "Unit of the map", unit_km: "km (normal map)", unit_summer: "Drive time, summer", unit_winter: "Drive time, winter",
      method: "How towns are placed", method_radial: "Radial from a centre", method_mds: "All town pairs (MDS)",
      center: "Centre", c_sapporo: "Sapporo", c_obihiro: "Obihiro",
      morph: "From map to cartogram to line", tick0: "Map", tick1: "Time map", tick2: "Line",
      notes_h: "Notes, method and sources",
      hint: "Tap a town to see its distance and drive times from the centre.",
      from: c => `From ${c}`,
      straight: "Straight-line distance", road: "Road distance (summer route)", t_summer: "Drive time, summer", t_winter: "Drive time, winter", extra: "Extra in winter",
      far_h: c => `Towns that get farthest in winter (from ${c})`,
      legend_h: c => `Extra drive time in winter from ${c}`,
      ghost: "Summer outline",
      scale_km: "100 km", scale_h: "1 hour of driving",
      fit_km: (m, r) => `Normal map vs. summer drive time: straight-line distances miss the drive times by ${m}% (median), ${r} min (RMSE) over all town pairs.`,
      fit: (m, r) => `Distances on this drawing vs. drive times: off by ${m}% (median), ${r} min (RMSE) over all 15,931 town pairs.`,
      t_unit: { km: "Normal map (km)", summer: "Summer drive time", winter: "Winter drive time" },
      t_radial: c => `from ${c}`, t_mds: "all town pairs", t_line: c => `lined up from ${c}`,
      axis_h: "h", axis_km: "km", snow_on: "Effects: on", snow_off: "Effects: off",
      hm: m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; },
    },
    ja: {
      subtitle: "地図の単位を km から車の移動時間に取り替えて、北海道を描き直しました。方角と隣り合う関係はそのままです。",
      unit: "地図の単位", unit_km: "km（普通の地図）", unit_summer: "車の時間・夏", unit_winter: "車の時間・冬",
      method: "町の置き方", method_radial: "中心型（中心からの時間）", method_mds: "全点型（全ての町の組・MDS）",
      center: "中心", c_sapporo: "札幌", c_obihiro: "帯広",
      morph: "地図 → 時間の地図 → 1本の線", tick0: "地図", tick1: "時間の地図", tick2: "線",
      notes_h: "注記・作り方・出典",
      hint: "町をタップすると、中心からの距離と移動時間を表示します。",
      from: c => `${c}から`,
      straight: "直線距離", road: "道のり（夏のルート）", t_summer: "車の時間（夏）", t_winter: "車の時間（冬）", extra: "冬に増える時間",
      far_h: c => `冬に最も遠くなる町（${c}から）`,
      legend_h: c => `冬に増える時間（${c}から）`,
      ghost: "夏の輪郭",
      scale_km: "100 km", scale_h: "車で1時間",
      fit_km: (m, r) => `普通の地図の直線距離と夏の移動時間のずれ：中央値 ${m}%、RMSE ${r} 分（全ての町の組）。`,
      fit: (m, r) => `この図の上の距離と移動時間のずれ：中央値 ${m}%、RMSE ${r} 分（全15,931組）。`,
      t_unit: { km: "普通の地図（km）", summer: "夏の移動時間", winter: "冬の移動時間" },
      t_radial: c => `${c}から`, t_mds: "全ての町の組", t_line: c => `${c}から1本の線に`,
      axis_h: "時間", axis_km: "km", snow_on: "演出：オン", snow_off: "演出：オフ",
      hm: m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, "0")}分` : `${m}分`; },
    },
  };

  const MAJOR = ["01100", "01202", "01203", "01204", "01205", "01206", "01207", "01208", "01211", "01212",
    "01213", "01214", "01221", "01223", "01229", "01219", "01361", "01367", "01517", "01519", "01694",
    "01545", "01644", "01608", "01226"];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d");
  const labelsEl = document.getElementById("labels");
  const stage = document.querySelector(".stage");
  const morph = document.getElementById("morph");

  let D, N, NV, k;
  let lang = "en";
  const st = { unit: "summer", method: "radial", center: "sapporo", s: 1, sel: null, snow: true };
  let anim = null;           // {from:{V,P}, to:{V,P}, t0, dur}
  let prevShape = null;      // {V, until}: outline of the previous state, fades after a change
  let wmix = 0, wFrom = 0;   // 1 = winter look
  let smix = 0, sFrom = 0;   // 1 = summer look
  let curKey = null;
  const FADE = 2500;
  let VT, PT;                // currently displayed target (animated)
  let view = { scale: 1, tx: 0, ty: 0, w: 0, h: 0 };
  let polyPaths = [], townScreen = [];
  let lineCache = {};
  let SAT = null, MT = null, mFrom = null, mTo = null;   // summer satellite mesh (WebGL)
  const satKey = (unit, method, center) => unit === "km" ? "km" : (method === "radial" ? `summer-radial-${center}` : "summer-mds");
  let labelNodes = {};

  const key = (unit, method, center) => unit === "km" ? "km" : (method === "radial" ? `${unit}-radial-${center}` : `${unit}-mds`);
  const f32 = a => Float32Array.from(a, v => v / 10);
  const cname = () => T[lang][st.center === "sapporo" ? "c_sapporo" : "c_obihiro"];
  const tname = t => lang === "ja" ? t.ja : t.en;

  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (["km", "summer", "winter"].includes(h.get("unit"))) st.unit = h.get("unit");
    if (["radial", "mds"].includes(h.get("method"))) st.method = h.get("method");
    if (["sapporo", "obihiro"].includes(h.get("center"))) st.center = h.get("center");
    if (["en", "ja"].includes(h.get("lang"))) lang = h.get("lang");
    if (h.get("fx") === "0" || h.get("snow") === "0") st.snow = false;
    const sv = parseFloat(h.get("s"));
    if (sv >= 0 && sv <= 2) { st.s = sv; st.fixedS = true; }
  }
  function writeHash() {
    const h = new URLSearchParams({ unit: st.unit, method: st.method, center: st.center, lang });
    if (!st.snow) h.set("fx", "0");
    history.replaceState(null, "", "#" + h.toString());
  }

  // ---------- geometry ----------
  function computeView() {
    const r = canvas.getBoundingClientRect();
    view.w = r.width; view.h = r.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    satCanvas.width = canvas.width; satCanvas.height = canvas.height;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const kk in D.states) {
      const a = D.states[kk];
      for (let i = 0; i < a.length; i += 2) {
        const x = a[i] / 10, y = a[i + 1] / 10;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const narrow = view.w < 560;
    const padT = narrow ? 50 : 46, padB = narrow ? 118 : 46, padX = narrow ? 8 : 16;
    const sc = Math.min((view.w - 2 * padX) / (x1 - x0), (view.h - padT - padB) / (y1 - y0));
    view.scale = sc;
    view.tx = padX + ((view.w - 2 * padX) - sc * (x1 - x0)) / 2 - sc * x0;
    view.ty = padT + ((view.h - padT - padB) - sc * (y1 - y0)) / 2 + sc * y1;
    view.bbox = { x0, x1, y0, y1 };
    lineCache = {};
  }
  const sx = x => view.tx + view.scale * x;
  const sy = y => view.ty - view.scale * y;

  // positions of towns on the line (screen px) for the current unit/centre
  function linePositions() {
    const id = `${st.unit}|${st.center}`;
    if (lineCache[id]) return lineCache[id];
    const vals = D.towns.map(t => st.unit === "km" ? t[`km_${st.center}`] : t[`min_${st.unit}_${st.center}`] / 60 * k);
    // the line shares the map's scale: 1 px = the same km (or the same km-equivalent of time)
    const x0 = sx(view.bbox.x0) + 6;
    const yMid = Math.round(view.h * 0.52);
    const r = 3.6;
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    const placed = [];
    const out = new Array(N);
    for (const i of order) {
      const x = x0 + vals[i] * view.scale;
      let dy = 0;
      for (let step = 0; step < 60; step++) {
        dy = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * r * 1.1;
        let ok = true;
        for (let j = placed.length - 1; j >= 0; j--) {
          const p = placed[j];
          if (x - p[0] > r * 2) break;
          if (Math.hypot(x - p[0], yMid + dy - p[1]) < r * 1.9) { ok = false; break; }
        }
        if (ok) break;
      }
      out[i] = [x, yMid + dy];
      placed.push(out[i]);
    }
    lineCache[id] = { pos: out, x0, yMid, max: Math.max(...vals) };
    return lineCache[id];
  }

  // ---------- state & animation ----------
  function targetArrays(unit, method, center) {
    const kk = key(unit, method, center);
    return { V: f32(D.states[kk]), P: f32(D.towns_pos[kk]) };
  }
  function setTarget(animate) {
    const newKey = key(st.unit, st.method, st.center);
    const to = targetArrays(st.unit, st.method, st.center);
    const wTo = st.unit === "winter" ? 1 : 0;
    // keep the previous outline for a moment, unless it is the summer outline already shown in winter
    const ghostKey = key("summer", st.method, st.center);
    if (VT && curKey && curKey !== newKey && !(st.unit === "winter" && curKey === ghostKey)) {
      prevShape = { V: VT.slice(), until: performance.now() + (reduceMotion.matches ? 0 : 1100) + FADE };
    } else prevShape = null;
    curKey = newKey;
    if (!VT || !animate || reduceMotion.matches) {
      VT = to.V; PT = to.P; anim = null; wmix = wTo; smix = st.unit === "summer" ? 1 : 0;
      if (SAT) MT = SAT.states[satKey(st.unit, st.method, st.center)];
      draw(); startSnow();
      if (prevShape) setTimeout(() => { prevShape = null; draw(); }, FADE);
      return;
    }
    wFrom = wmix; sFrom = smix;
    anim = { from: { V: VT.slice(), P: PT.slice() }, to, t0: performance.now(), dur: 1100, wTo, sTo: st.unit === "summer" ? 1 : 0 };
    if (SAT) { mFrom = MT.slice(); mTo = SAT.states[satKey(st.unit, st.method, st.center)]; }
    requestAnimationFrame(tick);
    startSnow();
  }
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function tick(now) {
    if (!anim) return;
    const t = Math.min(1, (now - anim.t0) / anim.dur), e = ease(t);
    const a = anim.from, b = anim.to;
    VT = new Float32Array(a.V.length); PT = new Float32Array(a.P.length);
    for (let i = 0; i < VT.length; i++) VT[i] = a.V[i] + (b.V[i] - a.V[i]) * e;
    for (let i = 0; i < PT.length; i++) PT[i] = a.P[i] + (b.P[i] - a.P[i]) * e;
    if (SAT && mFrom) { MT = new Float32Array(mFrom.length); for (let i = 0; i < MT.length; i++) MT[i] = mFrom[i] + (mTo[i] - mFrom[i]) * e; }
    wmix = wFrom + (anim.wTo - wFrom) * e;
    smix = sFrom + (anim.sTo - sFrom) * e;
    draw();
    if (t < 1) requestAnimationFrame(tick); else { anim = null; VT = b.V; PT = b.P; if (SAT && mTo) MT = mTo; draw(); requestAnimationFrame(fadeTick); }
  }
  function fadeTick(now) {
    if (anim || !prevShape) return;
    if (now >= prevShape.until) { prevShape = null; draw(); return; }
    draw(); requestAnimationFrame(fadeTick);
  }

  // ---------- colours ----------
  function mixHex(a, b, t) {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  const BINS = [10, 20, 30, 45];
  const COLS = ["#f1e7cf", "#f2c27b", "#e58a45", "#c4522b", "#7d2418"];
  const extraMin = t => t[`min_winter_${st.center}`] - t[`min_summer_${st.center}`];
  const colorOf = t => { const e = extraMin(t); let i = 0; while (i < BINS.length && e >= BINS[i]) i++; return COLS[i]; };

  // ---------- drawing ----------
  function draw() {
    if (!D) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    const s = st.s, s1 = Math.min(s, 1), s2 = Math.max(0, s - 1);
    const V0 = D._V0, P0 = D._P0;
    const vx = new Float32Array(NV), vy = new Float32Array(NV);
    for (let i = 0; i < NV; i++) {
      vx[i] = sx(V0[2 * i] + (VT[2 * i] - V0[2 * i]) * s1);
      vy[i] = sy(V0[2 * i + 1] + (VT[2 * i + 1] - V0[2 * i + 1]) * s1);
    }
    const css = getComputedStyle(document.documentElement);
    const landAlpha = 1 - 0.9 * s2;
    const landCol = mixHex(mixHex("#e4ded2", "#dde8c4", smix), "#e3e8ee", wmix);
    // seasons (not on the line): summer = satellite image, winter = slate sea with snow
    const fadeLine = 1 - Math.min(1, s2 * 2);
    const sat = SAT ? smix * fadeLine : 0;
    const dark = Math.max(wmix * fadeLine, sat);
    stage.style.backgroundColor = mixHex(mixHex("#f4f2ee", SAT ? SAT.ocean : "#a9d3ea", smix * fadeLine), "#3b4a5a", wmix * fadeLine);
    stage.classList.toggle("dark", dark > 0.5);
    stage.classList.toggle("sat", sat > 0.5);
    drawSat(s1, sat);

    // land
    polyPaths = [];
    ctx.globalAlpha = landAlpha * (1 - sat);
    ctx.lineJoin = "round";
    for (const poly of D.polys) {
      const p = new Path2D();
      for (const ri of poly.rings) {
        const r = D.rings[ri];
        p.moveTo(vx[r[0]], vy[r[0]]);
        for (let j = 1; j < r.length; j++) p.lineTo(vx[r[j]], vy[r[j]]);
        p.closePath();
      }
      polyPaths.push(p);
      ctx.fillStyle = poly._sel ? mixHex("#d8cdb6", "#c9d3de", wmix) : landCol;
      ctx.fill(p, "evenodd");
    }
    ctx.globalAlpha = landAlpha * (1 - 0.6 * sat);
    ctx.strokeStyle = css.getPropertyValue("--land-edge"); ctx.lineWidth = 0.8;
    for (const p of polyPaths) ctx.stroke(p);
    ctx.globalAlpha = landAlpha;
    if (st.sel != null && sat > 0) {                       // keep the selected town visible on the image
      const i = D.polys.findIndex(p => p._sel);
      if (i >= 0) { ctx.save(); ctx.globalAlpha = 0.35 * sat; ctx.fillStyle = "#ffffff"; ctx.fill(polyPaths[i], "evenodd"); ctx.restore(); }
    }
    // coast
    ctx.strokeStyle = mixHex(mixHex("#6b6559", "#1f2a35", wmix * fadeLine), "#cfe3b8", sat); ctx.lineWidth = 1;
    ctx.beginPath();
    for (const ln of D.coast) {
      ctx.moveTo(vx[ln[0]], vy[ln[0]]);
      for (let j = 1; j < ln.length; j++) ctx.lineTo(vx[ln[j]], vy[ln[j]]);
    }
    ctx.stroke();

    const outline = (G, color, alpha) => {
      ctx.save();
      ctx.globalAlpha = landAlpha * alpha;
      ctx.setLineDash([4, 3]); ctx.strokeStyle = color; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const ln of D.coast) {
        for (let j = 0; j < ln.length; j++) {
          const v = ln[j];
          const x = sx(V0[2 * v] + (G[2 * v] - V0[2 * v]) * s1), y = sy(V0[2 * v + 1] + (G[2 * v + 1] - V0[2 * v + 1]) * s1);
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      }
      ctx.stroke(); ctx.restore();
    };
    // the summer shape while looking at winter
    if (st.unit === "winter" && s1 > 0) outline(D._ghost, mixHex("#2f6fb0", "#a9d2ff", dark), 1);
    // the previous shape, fading out after a change
    if (prevShape && s1 > 0) {
      const left = prevShape.until - performance.now();
      outline(prevShape.V, mixHex("#6b6559", "#e6ebf0", dark), anim ? 1 : Math.max(0, Math.min(1, left / FADE)));
    }
    ctx.globalAlpha = 1;

    // line axis
    const L = s2 > 0 ? linePositions() : null;
    if (L) {
      ctx.globalAlpha = s2;
      ctx.strokeStyle = css.getPropertyValue("--ink"); ctx.fillStyle = css.getPropertyValue("--muted");
      ctx.lineWidth = 1; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center";
      const yA = L.yMid + 78;
      ctx.beginPath(); ctx.moveTo(L.x0, yA); ctx.lineTo(L.x0 + L.max * view.scale, yA); ctx.stroke();
      const isKm = st.unit === "km";
      const stepW = isKm ? 50 : k; // 50 km or 1 h
      const nT = Math.floor(L.max / stepW);
      for (let i = 0; i <= nT; i++) {
        const x = L.x0 + i * stepW * view.scale;
        ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yA + 4); ctx.stroke();
        if (!isKm || i % 2 === 0) ctx.fillText(isKm ? `${i * 50}` : `${i}`, x, yA + 15);
      }
      ctx.textAlign = "left";
      ctx.fillText(isKm ? T[lang].axis_km : T[lang].axis_h, L.x0 + (nT + 0.4) * stepW * view.scale, yA + 15);
      ctx.globalAlpha = 1;
    }

    // towns
    townScreen = new Array(N);
    for (let i = 0; i < N; i++) {
      let x = sx(P0[2 * i] + (PT[2 * i] - P0[2 * i]) * s1), y = sy(P0[2 * i + 1] + (PT[2 * i + 1] - P0[2 * i + 1]) * s1);
      if (L) { const q = L.pos[i]; x += (q[0] - x) * s2; y += (q[1] - y) * s2; }
      townScreen[i] = [x, y];
    }
    const centerIdx = D._idx[st.center === "sapporo" ? "01100" : "01207"];
    for (let i = 0; i < N; i++) {
      const [x, y] = townScreen[i], t = D.towns[i];
      const isC = i === centerIdx, isSel = i === st.sel;
      const rr = (isC ? 5.5 : isSel ? 5 : 3.4) * (1 - 0.3 * s2);
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = isC ? css.getPropertyValue("--ink") : colorOf(t);
      ctx.fill(); ctx.lineWidth = isSel ? 2 : 0.7; ctx.strokeStyle = isSel ? css.getPropertyValue("--ink") : "#00000066"; ctx.stroke();
    }
    drawLabels(centerIdx);
    drawScale(s1, s2);
  }

  function drawLabels(centerIdx) {
    const far = new Set(D._farIdx.slice(0, 5));
    const want = new Set(MAJOR.map(c => D._idx[c]));
    far.forEach(i => want.add(i));
    if (st.sel != null) want.add(st.sel);
    want.add(centerIdx);
    for (const id in labelNodes) if (!want.has(+id)) { labelNodes[id].remove(); delete labelNodes[id]; }
    const narrow = view.w < 560 || st.s > 1.5;
    for (const i of want) {
      if (narrow && !far.has(i) && i !== st.sel && i !== centerIdx && !MAJOR.slice(0, 12).includes(D.towns[i].code)) {
        if (labelNodes[i]) { labelNodes[i].remove(); delete labelNodes[i]; }
        continue;
      }
      let el = labelNodes[i];
      if (!el) { el = document.createElement("span"); labelsEl.appendChild(el); labelNodes[i] = el; }
      el.textContent = tname(D.towns[i]);
      el.className = (far.has(i) ? "hot " : "") + (i === st.sel || i === centerIdx ? "sel" : "");
      const [x, y] = townScreen[i];
      el.style.left = x + "px"; el.style.top = y + "px";
    }
  }

  function drawScale(s1, s2) {
    const el = document.getElementById("scale");
    const bar = el.querySelector(".bar"), txt = el.querySelector(".txt");
    if (s2 > 0.05) { el.style.visibility = "hidden"; return; }
    el.style.visibility = "visible";
    const useH = st.unit !== "km" && s1 > 0.5;
    const len = (useH ? k : 100) * view.scale;
    bar.style.width = len + "px";
    txt.textContent = useH ? T[lang].scale_h : T[lang].scale_km;
  }

  // ---------- text ----------
  function renderText() {
    const L = T[lang];
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(el => { const v = L[el.dataset.i18n]; if (typeof v === "string") el.textContent = v; });
    document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    for (const g of ["unit", "method", "center"]) {
      document.querySelectorAll(`#${g} button`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === st[g])));
    }
    document.querySelectorAll("#method button").forEach(b => b.disabled = st.unit === "km");
    const sb = document.getElementById("snowbtn");
    sb.hidden = st.unit === "km";
    sb.setAttribute("aria-pressed", String(st.snow));
    sb.textContent = st.snow ? L.snow_on : L.snow_off;
    // caption
    const s = st.s, c = cname();
    let cap;
    if (s < 0.15) cap = L.t_unit.km;
    else if (s > 1.15) cap = `${L.t_unit[st.unit]} · ${L.t_line(c)}`;
    else cap = st.unit === "km" ? L.t_unit.km : `${L.t_unit[st.unit]} · ${st.method === "radial" ? L.t_radial(c) : L.t_mds}`;
    document.getElementById("stagecap").textContent = cap;
    // fit
    const rows = D.accuracy;
    let row, txt;
    if (st.unit === "km") { row = rows.find(r => r.unit === "summer" && r.method === "original map"); txt = L.fit_km; }
    else { row = rows.find(r => r.unit === st.unit && r.method === st.method && (st.method === "mds" || r.center === st.center)); txt = L.fit; }
    document.getElementById("fit").textContent = txt(row.median_abs_pct.toFixed(1), row.rmse_min.toFixed(0));
    renderLegend(); renderInfo(); renderFar(); renderNotes();
  }

  function renderLegend() {
    const L = T[lang];
    const lab = [`< ${BINS[0]} min`, `${BINS[0]}–${BINS[1]}`, `${BINS[1]}–${BINS[2]}`, `${BINS[2]}–${BINS[3]}`, `≥ ${BINS[3]} min`];
    let h = `<div>${L.legend_h(cname())}</div>`;
    h += COLS.map((c, i) => `<div class="row"><span class="sw" style="background:${c}"></span>${lab[i]}</div>`).join("");
    if (st.unit === "winter") h += `<div class="row"><span class="ln"></span>${L.ghost}</div>`;
    document.getElementById("legend").innerHTML = h;
  }

  function renderInfo() {
    const L = T[lang], el = document.getElementById("info");
    if (st.sel == null) { el.innerHTML = `<p class="hint">${L.hint}</p>`; return; }
    const t = D.towns[st.sel], c = st.center;
    const ex = extraMin(t);
    el.innerHTML = `<h2>${tname(t)} <small style="font-weight:400;color:var(--muted)">${lang === "ja" ? t.en : t.ja}</small></h2>
      <table>
      <tr><td colspan="2" style="color:var(--muted)">${L.from(cname())}</td></tr>
      <tr><td>${L.straight}</td><td class="v">${t[`km_${c}`].toFixed(0)} km</td></tr>
      <tr><td>${L.road}</td><td class="v">${t[`road_summer_${c}`].toFixed(0)} km</td></tr>
      <tr><td>${L.t_summer}</td><td class="v">${L.hm(t[`min_summer_${c}`])}</td></tr>
      <tr><td>${L.t_winter}</td><td class="v">${L.hm(t[`min_winter_${c}`])}</td></tr>
      <tr><td>${L.extra}</td><td class="v">+${L.hm(Math.max(0, ex))}</td></tr>
      </table>`;
  }

  function renderFar() {
    const L = T[lang];
    const items = D._farIdx.slice(0, 5).map(i => {
      const t = D.towns[i];
      return `<li><button type="button" data-i="${i}">${tname(t)}</button> +${L.hm(extraMin(t))} <span style="color:var(--muted)">(${L.hm(t[`min_summer_${st.center}`])} → ${L.hm(t[`min_winter_${st.center}`])})</span></li>`;
    }).join("");
    const el = document.getElementById("far");
    el.innerHTML = items ? `<h3>${L.far_h(cname())}</h3><ol>${items}</ol>` : "";
    el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => select(+b.dataset.i)));
  }

  function renderNotes() {
    const n = D.notes[lang];
    const L = T[lang];
    const rows = D.accuracy.map(r => {
      const m = r.method === "original map" ? (lang === "ja" ? "普通の地図" : "normal map")
        : r.method === "radial" ? `${L.method_radial.split("（")[0].split(" (")[0]} · ${L[r.center === "sapporo" ? "c_sapporo" : "c_obihiro"]}`
        : "MDS";
      const u = r.unit === "summer" ? (lang === "ja" ? "夏" : "summer") : (lang === "ja" ? "冬" : "winter");
      return `<tr><td>${m}</td><td>${u}</td><td>${r.median_abs_pct.toFixed(1)}%</td><td>${r.rmse_min.toFixed(0)}</td><td>${r.stress1.toFixed(3)}</td></tr>`;
    }).join("");
    const head = lang === "ja" ? "<tr><th>作り方</th><th>単位</th><th>中央値</th><th>RMSE 分</th><th>stress</th></tr>"
      : "<tr><th>Method</th><th>Unit</th><th>Median</th><th>RMSE min</th><th>Stress</th></tr>";
    document.getElementById("notes").innerHTML = n.html.replace("{{ACCURACY}}", `<table>${head}${rows}</table>`);
  }

  // ---------- interaction ----------
  function select(i) {
    st.sel = (i === st.sel) ? null : i;
    D.polys.forEach(p => p._sel = false);
    if (st.sel != null) { const p = D.polys.find(p => p.code === D.towns[st.sel].code); if (p) p._sel = true; }
    renderInfo(); draw();
  }

  canvas.addEventListener("click", ev => {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = -1, bd = 18;
    townScreen.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
    if (best < 0 && st.s < 1.5) {
      const dpr = window.devicePixelRatio || 1;
      for (let j = 0; j < polyPaths.length; j++) {
        if (ctx.isPointInPath(polyPaths[j], x * dpr, y * dpr, "evenodd")) { best = D._idx[D.polys[j].code]; break; }
      }
    }
    if (best >= 0) select(best);
  });

  function bindSeg(g) {
    document.querySelectorAll(`#${g} button`).forEach(b => b.addEventListener("click", () => {
      if (st[g] === b.dataset.v) return;
      st[g] = b.dataset.v;
      updateDerived();
      writeHash(); renderText(); setTarget(true);
    }));
  }

  function updateDerived() {
    const kk = key("summer", st.method, st.center);
    D._ghost = f32(D.states[kk]);
    D._farIdx = D.towns.map((t, i) => i).filter(i => extraMin(D.towns[i]) >= 1)
      .sort((a, b) => extraMin(D.towns[b]) - extraMin(D.towns[a]));
  }

  morph.addEventListener("input", () => { st.s = +morph.value; renderText(); draw(); startSnow(); });
  document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => { lang = b.dataset.lang; writeHash(); renderText(); draw(); }));
  ["unit", "method", "center"].forEach(bindSeg);
  new ResizeObserver(() => { if (D) { computeView(); draw(); makeFlakes(); startSnow(); } }).observe(canvas);

  // ---------- summer satellite (WebGL mesh) ----------
  const satCanvas = document.getElementById("sat");
  const gl = satCanvas.getContext("webgl", { premultipliedAlpha: false, antialias: true });
  let glProg, glPos, glUV, glIdx, glTex, glN = 0, posBuf;
  function initSat(mesh, img) {
    if (!gl) return false;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    glProg = gl.createProgram();
    gl.attachShader(glProg, sh(gl.VERTEX_SHADER, "attribute vec2 p; attribute vec2 uv; uniform vec2 res; varying vec2 v;" +
      "void main(){ v = uv; gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0); }"));
    gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, "precision mediump float; varying vec2 v; uniform sampler2D t; uniform float a;" +
      "void main(){ vec4 c = texture2D(t, v); float e = min(min(v.x, 1.0 - v.x), min(v.y, 1.0 - v.y));" +
      " gl_FragColor = vec4(c.rgb, a * smoothstep(0.0, 0.04, e)); }"));
    gl.linkProgram(glProg);
    if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) return false;
    glPos = gl.getAttribLocation(glProg, "p"); glUV = gl.getAttribLocation(glProg, "uv");
    const uvBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.uv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(glUV); gl.vertexAttribPointer(glUV, 2, gl.FLOAT, false, 0, 0);
    posBuf = gl.createBuffer();
    glIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.tris), gl.STATIC_DRAW); glN = mesh.tris.length;
    glTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  }
  function drawSat(s1, alpha) {
    if (!gl) return;
    gl.viewport(0, 0, satCanvas.width, satCanvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!SAT || !MT || alpha <= 0.01) return;
    const M0 = SAT.states.km, n = M0.length / 2, dpr = window.devicePixelRatio || 1;
    const pos = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      pos[2 * i] = sx(M0[2 * i] + (MT[2 * i] - M0[2 * i]) * s1) * dpr;
      pos[2 * i + 1] = sy(M0[2 * i + 1] + (MT[2 * i + 1] - M0[2 * i + 1]) * s1) * dpr;
    }
    gl.useProgram(glProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(glPos); gl.vertexAttribPointer(glPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(glProg, "res"), satCanvas.width, satCanvas.height);
    gl.uniform1f(gl.getUniformLocation(glProg, "a"), alpha);
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIdx);
    gl.drawElements(gl.TRIANGLES, glN, gl.UNSIGNED_SHORT, 0);
  }
  function loadSat() {
    fetch("data/satellite_mesh.json").then(r => r.json()).then(mesh => {
      const img = new Image();
      img.onload = () => {
        if (!initSat(mesh, img)) return;
        const st2 = {}; for (const kk in mesh.states) st2[kk] = f32(mesh.states[kk]);
        SAT = { ocean: mesh.ocean, states: st2 };
        MT = SAT.states[satKey(st.unit, st.method, st.center)];
        draw();
      };
      img.src = "data/" + mesh.image;
    }).catch(() => {});
  }

  // ---------- snow ----------
  const snowCanvas = document.getElementById("snow");
  const sctx = snowCanvas.getContext("2d");
  let flakes = [], snowLast = 0, snowRunning = false;
  let clouds = [];
  const lineFade = () => 1 - Math.max(0, Math.min(1, (st.s - 1) * 2));
  function snowAlpha() { return st.snow ? wmix * lineFade() : 0; }
  function cloudAlpha() { return st.snow ? smix * lineFade() : 0; }
  function makeFlakes() {
    const r = snowCanvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    snowCanvas.width = Math.round(r.width * dpr); snowCanvas.height = Math.round(r.height * dpr);
    const big = Math.max(r.width, r.height);
    // fair-weather clouds: each one a few soft puffs in a row
    clouds = Array.from({ length: 5 }, (_, i) => {
      const size = big * (0.035 + Math.random() * 0.03);
      const np = 4 + Math.floor(Math.random() * 3);
      const puffs = Array.from({ length: np }, (_, j) => ({
        dx: (j - (np - 1) / 2) * size * 0.9 + (Math.random() - 0.5) * size * 0.3,
        dy: (Math.random() - 0.5) * size * 0.5 - (j % 2) * size * 0.25, r: size * (0.8 + Math.random() * 0.6) }));
      return { x: Math.random() * r.width, y: (i + 0.5) / 5 * r.height + (Math.random() - 0.5) * r.height * 0.1,
               w: size * puffs.length, puffs, v: 7 + Math.random() * 9 };
    });
    const n = Math.min(420, Math.round(r.width * r.height / 2300));
    flakes = Array.from({ length: n }, () => {
      const z = Math.random();                       // depth: 0 far, 1 near
      return { x: Math.random() * r.width, y: Math.random() * r.height, r: 1 + z * 2.6,
               v: 22 + z * 55, ph: Math.random() * 6.28, sw: 8 + z * 16 };
    });
  }
  function drawSnow(dt) {
    const r = snowCanvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, r.width, r.height);
    const ca = cloudAlpha();
    if (ca > 0.01) {
      const big = Math.max(r.width, r.height);
      for (const c of clouds) {
        if (dt) { c.x += c.v * dt; if (c.x - c.w > r.width) c.x = -c.w - Math.random() * big * 0.15; }
        for (const p of c.puffs) {
          const x = c.x + p.dx, y = c.y + p.dy;
          const g = sctx.createRadialGradient(x, y, 0, x, y, p.r);
          g.addColorStop(0, `rgba(255,255,255,${0.3 * ca})`); g.addColorStop(0.55, `rgba(255,255,255,${0.17 * ca})`); g.addColorStop(1, "rgba(255,255,255,0)");
          sctx.fillStyle = g; sctx.beginPath(); sctx.arc(x, y, p.r, 0, Math.PI * 2); sctx.fill();
        }
      }
    }
    const a = snowAlpha();
    if (a <= 0.01) return;
    sctx.globalAlpha = a;
    sctx.fillStyle = "#ffffff";
    sctx.strokeStyle = "rgba(96,114,134,0.35)"; sctx.lineWidth = 0.6;
    for (const f of flakes) {
      if (dt) {
        f.y += f.v * dt; f.ph += dt * 0.9;
        if (f.y > r.height + 4) { f.y = -4; f.x = Math.random() * r.width; }
      }
      const x = (f.x + Math.sin(f.ph) * f.sw + r.width) % r.width;
      sctx.beginPath(); sctx.arc(x, f.y, f.r, 0, Math.PI * 2); sctx.fill(); sctx.stroke();
    }
  }
  function snowFrame(now) {
    const dt = snowLast ? Math.min(0.05, (now - snowLast) / 1000) : 0;
    snowLast = now;
    drawSnow(dt);
    if (snowAlpha() > 0.01 || cloudAlpha() > 0.01 || anim) requestAnimationFrame(snowFrame);
    else { snowRunning = false; snowLast = 0; }
  }
  function startSnow() {
    if (reduceMotion.matches) { drawSnow(0); return; }   // still flakes, no motion
    if (!snowRunning && (snowAlpha() > 0.01 || cloudAlpha() > 0.01 || anim)) { snowRunning = true; requestAnimationFrame(snowFrame); }
    if (!snowRunning) drawSnow(0);
  }
  document.getElementById("snowbtn").addEventListener("click", () => { st.snow = !st.snow; writeHash(); renderText(); startSnow(); });

  // ---------- boot ----------
  fetch("data/elastic.json").then(r => r.json()).then(data => {
    D = data; N = D.towns.length; k = D.scale_km_per_h;
    D._V0 = f32(D.states.km); D._P0 = f32(D.towns_pos.km); NV = D._V0.length / 2;
    D._idx = {}; D.towns.forEach((t, i) => D._idx[t.code] = i);
    readHash(); updateDerived();
    renderText(); computeView();
    const to = targetArrays(st.unit, st.method, st.center);
    VT = to.V; PT = to.P;
    curKey = key(st.unit, st.method, st.center);
    wmix = st.unit === "winter" ? 1 : 0; smix = st.unit === "summer" ? 1 : 0;
    makeFlakes(); startSnow(); loadSat();
    if (reduceMotion.matches || st.fixedS) { morph.value = st.s; renderText(); draw(); return; }
    // opening: grow from the normal map into the time map
    st.s = 0; morph.value = 0; draw();
    const t0 = performance.now();
    const open = now => {
      const t = Math.min(1, (now - t0 - 400) / 1600);
      if (t > 0) { st.s = ease(t); morph.value = st.s; }
      draw();
      if (t < 1) requestAnimationFrame(open); else renderText();
    };
    requestAnimationFrame(open);
  });
})();
