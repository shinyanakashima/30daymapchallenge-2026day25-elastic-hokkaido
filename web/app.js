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
      cap0: "Normal map: 1 cm is the same number of kilometres everywhere.",
      cap1r: c => `Each town keeps its direction from ${c}; its distance from ${c} is the drive time.`,
      cap1m: "Every town pair is pulled toward its drive time at once (multidimensional scaling), then rotated to fit the normal map.",
      cap1k: "The unit is still km. Choose a drive-time unit to stretch the island.",
      cap2: c => `Directions are dropped: towns are lined up by drive time from ${c}. Is this still a map?`,
      cap2k: c => `Directions are dropped: towns are lined up by straight-line distance from ${c}.`,
      axis_h: "h", axis_km: "km",
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
      cap0: "普通の地図：どこでも 1 cm が同じ km を表します。",
      cap1r: c => `各町は${c}から見た方角を保ち、${c}からの距離が移動時間になっています。`,
      cap1m: "全ての町の組の時間を同時に満たすよう配置し（多次元尺度法）、普通の地図に合わせて回転しています。",
      cap1k: "単位はまだ km です。時間の単位を選ぶと北海道が伸び縮みします。",
      cap2: c => `方角を捨て、${c}からの移動時間の順に1本の線に並べました。これはまだ地図でしょうか。`,
      cap2k: c => `方角を捨て、${c}からの直線距離の順に1本の線に並べました。`,
      axis_h: "時間", axis_km: "km",
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
  const morph = document.getElementById("morph");

  let D, N, NV, k;
  let lang = "en";
  const st = { unit: "summer", method: "radial", center: "sapporo", s: 1, sel: null };
  let anim = null;           // {from:{V,P}, to:{V,P}, t0, dur}
  let VT, PT;                // currently displayed target (animated)
  let view = { scale: 1, tx: 0, ty: 0, w: 0, h: 0 };
  let polyPaths = [], townScreen = [];
  let lineCache = {};
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
    const sv = parseFloat(h.get("s"));
    if (sv >= 0 && sv <= 2) { st.s = sv; st.fixedS = true; }
  }
  function writeHash() {
    const h = new URLSearchParams({ unit: st.unit, method: st.method, center: st.center, lang });
    history.replaceState(null, "", "#" + h.toString());
  }

  // ---------- geometry ----------
  function computeView() {
    const r = canvas.getBoundingClientRect();
    view.w = r.width; view.h = r.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const kk in D.states) {
      const a = D.states[kk];
      for (let i = 0; i < a.length; i += 2) {
        const x = a[i] / 10, y = a[i + 1] / 10;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const narrow = view.w < 560;
    const padT = narrow ? 44 : 34, padB = narrow ? 96 : 46, padX = narrow ? 8 : 16;
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
    const yMid = view.h - (view.w < 560 ? 76 : 30) - 70;
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
    const to = targetArrays(st.unit, st.method, st.center);
    if (!VT || !animate || reduceMotion.matches) {
      VT = to.V; PT = to.P; anim = null; draw(); return;
    }
    anim = { from: { V: VT.slice(), P: PT.slice() }, to, t0: performance.now(), dur: 1100 };
    requestAnimationFrame(tick);
  }
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function tick(now) {
    if (!anim) return;
    const t = Math.min(1, (now - anim.t0) / anim.dur), e = ease(t);
    const a = anim.from, b = anim.to;
    VT = new Float32Array(a.V.length); PT = new Float32Array(a.P.length);
    for (let i = 0; i < VT.length; i++) VT[i] = a.V[i] + (b.V[i] - a.V[i]) * e;
    for (let i = 0; i < PT.length; i++) PT[i] = a.P[i] + (b.P[i] - a.P[i]) * e;
    draw();
    if (t < 1) requestAnimationFrame(tick); else { anim = null; VT = b.V; PT = b.P; draw(); }
  }

  // ---------- colours ----------
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

    // land
    polyPaths = [];
    ctx.globalAlpha = landAlpha;
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
      ctx.fillStyle = poly._sel ? "#d8cdb6" : css.getPropertyValue("--land");
      ctx.fill(p, "evenodd");
    }
    ctx.strokeStyle = css.getPropertyValue("--land-edge"); ctx.lineWidth = 0.8;
    for (const p of polyPaths) ctx.stroke(p);
    // coast
    ctx.strokeStyle = css.getPropertyValue("--coast"); ctx.lineWidth = 1;
    ctx.beginPath();
    for (const ln of D.coast) {
      ctx.moveTo(vx[ln[0]], vy[ln[0]]);
      for (let j = 1; j < ln.length; j++) ctx.lineTo(vx[ln[j]], vy[ln[j]]);
    }
    ctx.stroke();

    // ghost of the summer shape while looking at winter
    if (st.unit === "winter" && s1 > 0) {
      const G = D._ghost;
      ctx.setLineDash([4, 3]); ctx.strokeStyle = css.getPropertyValue("--ghost"); ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const ln of D.coast) {
        for (let j = 0; j < ln.length; j++) {
          const v = ln[j];
          const x = sx(V0[2 * v] + (G[2 * v] - V0[2 * v]) * s1), y = sy(V0[2 * v + 1] + (G[2 * v + 1] - V0[2 * v + 1]) * s1);
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // line axis
    const L = s2 > 0 ? linePositions() : null;
    if (L) {
      ctx.globalAlpha = s2;
      ctx.strokeStyle = css.getPropertyValue("--ink"); ctx.fillStyle = css.getPropertyValue("--muted");
      ctx.lineWidth = 1; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center";
      const yA = view.h - (view.w < 560 ? 76 : 30);
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
    // caption
    const s = st.s, c = cname();
    let cap;
    if (s < 0.15) cap = L.cap0;
    else if (s <= 1.15) cap = st.unit === "km" ? L.cap1k : (st.method === "radial" ? L.cap1r(c) : L.cap1m);
    else cap = st.unit === "km" ? L.cap2k(c) : L.cap2(c);
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

  morph.addEventListener("input", () => { st.s = +morph.value; renderText(); draw(); });
  document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => { lang = b.dataset.lang; writeHash(); renderText(); draw(); }));
  ["unit", "method", "center"].forEach(bindSeg);
  new ResizeObserver(() => { if (D) { computeView(); draw(); } }).observe(canvas);

  // ---------- boot ----------
  fetch("data/elastic.json").then(r => r.json()).then(data => {
    D = data; N = D.towns.length; k = D.scale_km_per_h;
    D._V0 = f32(D.states.km); D._P0 = f32(D.towns_pos.km); NV = D._V0.length / 2;
    D._idx = {}; D.towns.forEach((t, i) => D._idx[t.code] = i);
    readHash(); updateDerived();
    renderText(); computeView();
    const to = targetArrays(st.unit, st.method, st.center);
    VT = to.V; PT = to.P;
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
