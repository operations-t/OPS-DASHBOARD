/* Operations Dashboard — phase 1 (Overview, Sales achievement, Data quality, embedded views) */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------------------------------------------ config
  const NAV = [
    { group: "", items: [["gm", "Growth & momentum"], ["on", "Outlet network"]] },
    { group: "Sales", items: [["overview", "Overview"], ["achievement", "Sales achievement"], ["growth", "Sales growth"], ["footfall", "Footfall and basket"], ["ranking", "Growth and degrowth"], ["loss", "Loss-making outlets"], ["category", "Category performance"]] },
    { group: "Performance", items: [["performance", "KPI performance"]] },
    { group: "Connected dashboards", items: [["av", "Availability"], ["cw", "Consumable and wastage"], ["gpva", "GPVA% Tracker"], ["cc", "Credit Card Extra Amount"], ["vc", "Visit Compliance"]] },
    { group: "System", items: [["dq", "Data quality"]] },
  ];
  const TITLES = Object.fromEntries(NAV.flatMap((g) => g.items.map(([k, t]) => [k, t])));
  const SALES_PAGES = new Set(["overview", "achievement", "growth", "footfall", "ranking"]);
  const PERIOD_PAGES = new Set([...SALES_PAGES, "category"]);
  const FILTER_PAGES = new Set([...SALES_PAGES, "loss"]);
  const EMBEDS = {
    av: { url: "https://operations-t.github.io/AV/", desc: "Core, KVI, promo and e-commerce availability by outlet and SKU." },
    cw: { url: "https://operations-t.github.io/consumable-wastage-n/", desc: "Consumable and wastage cost against target by outlet." },
    gm: { url: "https://operations-t.github.io/outlet-network-dashboard/insights.html", desc: "Momentum quadrant, top movers, trading-day heatmap, month trajectory and leadership league table." },
    on: { url: "https://operations-t.github.io/outlet-network-dashboard/index.html", desc: "Outlet network by region, zone, format and opening date." },
    gpva: { url: "https://outlet-wise-gpva.shwapno.app/", desc: "Outlet-wise GPVA% tracking." },
    cc: { url: "https://aftabz-lab.github.io/credit-card-extra-amount/", desc: "Credit card extra amount by outlet." },
    vc: { url: "https://aftabz-lab.github.io/visit-compliance-dashboard/", desc: "Outlet visit schedules and compliance." },
  };
  const DIMS = [["rl", "Regional leader"], ["zn", "Zonal"], ["div", "Division"], ["dis", "District"], ["fmt", "Outlet format"], ["own", "Ownership"], ["pnp", "PNP status"], ["loc", "Location type"]];
  const LEVELS = [["rl", "Regional leader"], ["zn", "Zonal"], ["div", "Division"], ["dis", "District"], ["fmt", "Outlet format"], ["own", "Ownership"], ["outlet", "Outlet"]];
  const BANDS = [
    { k: "b100", label: "100% or more", cls: "good", min: 1 },
    { k: "b90", label: "90 to 99%", cls: "warn", min: 0.9 },
    { k: "b80", label: "80 to 89%", cls: "bad", min: 0.8 },
    { k: "b0", label: "Below 80%", cls: "bad", min: -Infinity },
  ];

  const S = { data: null, page: "overview", period: "tilldate", filters: {}, openDim: null, tables: {}, level: "rl", bands: new Set(), lastFocus: null,
    cmp: "y", scope: "all", trend: "all", kp: null, kl: "rho", kv: "rank", pm: null, pbasis: "after", pstat: "all", plevel: "rl", ageDrill: null };
  DIMS.forEach(([k]) => (S.filters[k] = new Set()));

  // ------------------------------------------------------------------ format
  const isNum = (v) => typeof v === "number" && isFinite(v);
  function bdt(v) {
    if (!isNum(v)) return "—";
    const s = v < 0 ? "−" : "", a = Math.abs(v);
    return s + "৳" + (a >= 1e7 ? (a / 1e7).toFixed(2) + " Cr" : a >= 1e5 ? (a / 1e5).toFixed(2) + " Lac" : a >= 1e3 ? (a / 1e3).toFixed(1) + " K" : a.toFixed(0));
  }
  const exact = (v) => (isNum(v) ? (v < 0 ? "−" : "") + "৳" + Math.round(Math.abs(v)).toLocaleString("en-US") : "—");
  const int = (v) => (isNum(v) ? Math.round(v).toLocaleString("en-US") : "—");
  const pct = (v, d = 2) => (isNum(v) ? (v * 100).toFixed(d) + "%" : "—");
  const pp = (v) => (isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(2) + " pp" : "—");
  function delta(v, unit = "%") {
    if (!isNum(v)) return '<span class="flat" title="No comparison base">—</span>';
    if (unit === "%" && Math.abs(v) > 9.99) return '<span class="muted" title="Comparison base is too small to be meaningful">n/m</span>';
    const c = v > 0.00005 ? "up" : v < -0.00005 ? "down" : "flat";
    const arrow = c === "up" ? "▲" : c === "down" ? "▼" : "■";
    const txt = unit === "pp" ? pp(v) : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(2) + "%";
    return `<span class="${c}">${arrow} ${txt}</span>`;
  }
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fdate = (s, noYear) => { if (!s) return "—"; const [y, m, d] = s.split("-").map(Number); return `${d} ${MON[m - 1]}${noYear ? "" : " " + y}`; };
  const fmonth = (s) => { const [y, m] = s.split("-").map(Number); return `${MON[m - 1]} ${y}`; };
  const ratio = (n, d) => (isNum(n) && d > 0 ? n / d : null);
  const growth = (n, d) => (isNum(n) && d > 0 ? n / d - 1 : null);
  const band = (v) => (isNum(v) ? BANDS.find((b) => v >= b.min) : { k: "none", label: "No target", cls: "idle" });
  const chip = (b) => `<span class="chip ${b.cls}">${esc(b.label)}</span>`;

  // ------------------------------------------------------------------ data
  function prep(d) {
    const M = {};
    (d.master?.outlets || []).forEach((o) => (M[o.c] = o));
    ["tilldate", "monthend"].forEach((k) => {
      if (!d[k]) return;
      d[k].outlets.forEach((o) => {
        mkDim(o, M[o.c], o.s > 0 || o.t > 0 ? "Not in outlet master" : "Closed outlets");
        o.nm = o.m?.n || String(o.name || o.c).replace(new RegExp("^" + o.c + "\\s*-\\s*"), "");
      });
    });
    Object.values(d.pnl?.summary || {}).forEach((list) => list.forEach((o) => { mkDim(o, M[o.c], o.s >= 1 ? "Not in outlet master" : "Closed outlets"); o.nm = o.n || o.m?.n || o.c; }));
  }
  function mkDim(o, m, miss) {
    o.m = m;
    o.dim = {
      rl: m?.rl || o.rl || miss, zn: m?.zn || o.zn || miss, div: m?.div || miss, dis: m?.dis || miss,
      fmt: m?.fmt || miss, own: m?.own || miss, pnp: m?.pnp || miss, loc: m?.loc || miss,
    };
  }
  const rep = () => S.data?.[S.period];
  const matches = (o, skip) => DIMS.every(([k]) => k === skip || !S.filters[k].size || S.filters[k].has(o.dim[k]));
  const baseList = () => (S.page === "loss" ? pnlList() : rep()?.outlets || []);
  const inView = () => baseList().filter((o) => matches(o));
  function pnlList() {
    const P = S.data?.pnl;
    if (!P) return [];
    if (S.pm === "ytd" && P.months.length > 1) return pnlYtd();
    if (!P.summary[S.pm]) S.pm = P.months[P.months.length - 1];
    return P.summary[S.pm];
  }
  let ytdCache = null;
  function pnlYtd() {
    if (ytdCache) return ytdCache;
    const P = S.data.pnl, byC = new Map();
    P.months.forEach((m) => P.summary[m].forEach((o) => {
      const x = byC.get(o.c) || { c: o.c, s: 0, gp: 0, oi: 0, ox: 0, g: 0, ofc: 0, p: 0, ff: 0, months: 0 };
      ["s", "gp", "oi", "ox", "g", "ofc", "p", "ff"].forEach((k) => (x[k] += o[k] || 0));
      x.months++; x.n = o.n; x.nm = o.nm; x.ld = o.ld; x.sft = o.sft; x.m = o.m; x.dim = o.dim;
      byC.set(o.c, x);
    }));
    byC.forEach((x) => { x.bs = x.ff ? x.s / x.ff : null; if (!(x.s >= 1)) mkDim(x, x.m, "Closed outlets"); });
    return (ytdCache = [...byC.values()]);
  }
  function detailFor(code) {
    const P = S.data.pnl;
    if (S.pm !== "ytd") return P.detail?.[S.pm]?.[code] || null;
    let out = null;
    P.months.forEach((m) => { const d = P.detail?.[m]?.[code]; if (d) { out = out || d.map(() => 0); d.forEach((v, i) => (out[i] += v || 0)); } });
    return out;
  }

  function agg(list) {
    const a = { n: list.length, t: 0, a: 0, tn: 0, s: 0, sy: 0, sm: 0, f: 0, fy: 0, fm: 0, gv: 0, gvy: 0, gvm: 0, ssS: 0, ssY: 0, ssn: 0 };
    for (const o of list) {
      a.t += o.t || 0; a.a += o.a || 0; if (o.t > 0) a.tn++;
      a.s += o.s || 0; a.sy += o.sy || 0; a.sm += o.sm || 0;
      a.f += o.f || 0; a.fy += o.fy || 0; a.fm += o.fm || 0;
      a.gv += o.gv || 0; a.gvy += o.gvy || 0; a.gvm += o.gvm || 0;
      if (o.ssy) { a.ssS += o.s || 0; a.ssY += o.sy || 0; a.ssn++; }
    }
    a.ach = ratio(a.a, a.t);
    a.gy = growth(a.s, a.sy); a.gm = growth(a.s, a.sm); a.gss = growth(a.ssS, a.ssY);
    a.bk = ratio(a.s, a.f); a.bky = ratio(a.sy, a.fy);
    a.gp = ratio(a.gv, a.s); a.gpy = ratio(a.gvy, a.sy);
    const r = rep();
    if (r && !r.closed) {
      a.perDay = a.a / r.day;
      a.monthTarget = (a.t / r.day) * r.dim;
      a.projected = a.perDay * r.dim;
      a.needPerDay = r.dim > r.day ? Math.max(0, a.monthTarget - a.a) / (r.dim - r.day) : null;
    }
    return a;
  }

  // ------------------------------------------------------------------ table component
  function mountTable(id, spec) {
    S.tables[id] = S.tables[id] || { sort: spec.defaultSort, dir: spec.defaultDir || "desc", page: 1, q: "" };
    S.tables[id].spec = spec;
    return `<section class="panel" id="t-${id}"></section>`;
  }
  function tableRows(id) {
    const t = S.tables[id], sp = t.spec;
    let rows = sp.rows;
    if (t.q) {
      const q = t.q.toLowerCase();
      rows = rows.filter((r) => sp.searchText(r).toLowerCase().includes(q));
    }
    const col = sp.cols.find((c) => c.k === t.sort);
    if (col) {
      const v = col.val || ((r) => r[col.k]);
      rows = [...rows].sort((x, y) => {
        const a = v(x), b = v(y);
        const an = a == null || (typeof a === "number" && !isFinite(a)), bn = b == null || (typeof b === "number" && !isFinite(b));
        if (an || bn) return an && bn ? 0 : an ? 1 : -1;
        const c = typeof a === "number" ? a - b : String(a).localeCompare(String(b));
        return (t.dir === "asc" ? c : -c) || String(sp.key(x)).localeCompare(String(sp.key(y)));
      });
    }
    return rows;
  }
  function drawTable(id) {
    const el = $("#t-" + id);
    if (!el) return;
    const t = S.tables[id], sp = t.spec, rows = tableRows(id);
    const size = sp.pageSize || 50, pages = Math.max(1, Math.ceil(rows.length / size));
    t.page = Math.min(t.page, pages);
    const slice = rows.slice((t.page - 1) * size, t.page * size);
    const th = sp.cols.map((c) => {
      const active = t.sort === c.k;
      const arrow = active ? (t.dir === "asc" ? "↑" : "↓") : "↕";
      return `<th class="${c.num ? "num" : ""}" scope="col"><button class="sort-button${active ? " active" : ""}" data-sort="${c.k}">${esc(c.label)}<span>${arrow}</span></button></th>`;
    }).join("");
    const body = slice.length
      ? slice.map((r) => `<tr ${sp.rowAttr ? sp.rowAttr(r) : ""}>${sp.cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.fmt ? c.fmt(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${sp.cols.length}" class="empty">${esc(sp.empty || "No rows match the selected filters.")}</td></tr>`;
    const had = document.activeElement?.dataset?.tsearch === id;
    el.innerHTML = `
      <div class="panel-head"><div><h2>${esc(sp.title)}</h2><p>${esc(sp.desc(rows.length))}</p></div>
        <div class="panel-tools">${sp.tools || ""}<input class="search" type="search" placeholder="Search" aria-label="Search table" data-tsearch="${id}" value="${esc(t.q)}"><button class="btn" data-csv="${id}">Download CSV</button></div></div>
      <div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>
      ${rows.length > size ? `<div class="pager"><span>Showing ${int((t.page - 1) * size + 1)}–${int(Math.min(t.page * size, rows.length))} of ${int(rows.length)}</span><div><button class="btn" data-pg="-1" ${t.page === 1 ? "disabled" : ""}>Previous</button><span>Page ${t.page} of ${pages}</span><button class="btn" data-pg="1" ${t.page === pages ? "disabled" : ""}>Next</button></div></div>` : ""}`;
    $$("[data-sort]", el).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.sort;
      if (t.sort === k) t.dir = t.dir === "asc" ? "desc" : "asc"; else { t.sort = k; t.dir = "desc"; }
      drawTable(id);
    }));
    const inp = $("[data-tsearch]", el);
    inp.addEventListener("input", () => { t.q = inp.value; t.page = 1; drawTable(id); });
    if (had) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    $$("[data-pg]", el).forEach((b) => b.addEventListener("click", () => { t.page += +b.dataset.pg; drawTable(id); }));
    $("[data-csv]", el).addEventListener("click", () => csv(id, rows));
    sp.wire && sp.wire(el);
    wireDyn(el);
  }
  function csv(id, rows) {
    const sp = S.tables[id].spec;
    const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [sp.cols.map((c) => q(c.label)).join(",")].concat(rows.map((r) => sp.cols.map((c) => q(c.csv ? c.csv(r) : r[c.k])).join(",")));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sp.file}_${rep()?.date || "data"}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------------ shell
  function renderNav() {
    $("#nav").innerHTML = NAV.map((g) => (g.group ? `<div class="nav-group">${esc(g.group)}</div>` : "") + g.items.map(([k, t, soon]) =>
      `<button data-page="${k}" ${S.page === k ? 'aria-current="page"' : ""}>${esc(t)}${soon ? '<span class="soon">Phase 2</span>' : ""}</button>`).join("")).join("");
    $$("#nav [data-page]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.page; closeRail(); }));
  }
  function renderFilters() {
    const base = baseList();
    const el = $("#filters");
    const prevDim = el.querySelector(".ms-panel")?.closest(".ms")?.dataset.dim;
    const same = prevDim === S.openDim;
    const keepScroll = same ? el.querySelector(".ms-list")?.scrollTop || 0 : 0;
    const keepQ = same ? el.querySelector(".ms-panel input")?.value || "" : "";
    el.innerHTML = `<h2>Filters</h2>` + DIMS.map(([k, label]) => {
      const counts = new Map();
      base.forEach((o) => { if (matches(o, k)) counts.set(o.dim[k], (counts.get(o.dim[k]) || 0) + 1); });
      S.filters[k].forEach((v) => { if (!counts.has(v)) counts.set(v, 0); });
      const opts = [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const sel = S.filters[k];
      const btnTxt = !sel.size ? "All" : sel.size === 1 ? [...sel][0] : sel.size + " selected";
      const open = S.openDim === k;
      return `<div class="ms" data-dim="${k}">
        <div class="ms-label"><span>${esc(label)}</span>${sel.size ? `<span class="ms-count">${sel.size}</span>` : ""}</div>
        <button class="ms-btn${sel.size ? " active" : ""}" aria-expanded="${open}" data-ms="${k}"><span>${esc(btnTxt)}</span><span>▾</span></button>
        ${open ? `<div class="ms-panel">
          ${opts.length > 8 ? `<input class="search" type="search" placeholder="Search ${esc(label.toLowerCase())}" aria-label="Search ${esc(label)}" value="${esc(keepQ)}">` : ""}
          <div class="ms-tools"><button data-all>Select all</button><button data-clear>Clear</button><span>${sel.size} selected / ${opts.length} available</span></div>
          <div class="ms-list" role="listbox" aria-multiselectable="true" aria-label="${esc(label)}">
            ${opts.map(([v, n]) => `<label class="ms-opt" role="option" aria-selected="${sel.has(v)}"><input type="checkbox" value="${esc(v)}" ${sel.has(v) ? "checked" : ""}><span>${esc(v)}</span><small>${n}</small></label>`).join("")}
          </div></div>` : ""}
      </div>`;
    }).join("");
    $$("[data-ms]", el).forEach((b) => b.addEventListener("click", () => { S.openDim = S.openDim === b.dataset.ms ? null : b.dataset.ms; renderFilters(); }));
    const panel = $(".ms-panel", el);
    if (panel) {
      const k = S.openDim, list = $(".ms-list", panel);
      list.scrollTop = keepScroll;
      const search = $("input.search", panel);
      const applyQ = () => { const q = (search?.value || "").toLowerCase(); $$(".ms-opt", list).forEach((o) => (o.hidden = !o.textContent.toLowerCase().includes(q))); };
      if (search) { search.addEventListener("input", applyQ); applyQ(); }
      $$("input[type=checkbox]", list).forEach((c) => c.addEventListener("change", () => { c.checked ? S.filters[k].add(c.value) : S.filters[k].delete(c.value); changed(); }));
      $("[data-all]", panel).addEventListener("click", () => { $$(".ms-opt", list).filter((o) => !o.hidden).forEach((o) => S.filters[k].add($("input", o).value)); changed(); });
      $("[data-clear]", panel).addEventListener("click", () => { S.filters[k].clear(); changed(); });
    }
    $("#railFoot").innerHTML = base.length ? `${int(inView().length)} of ${int(base.length)} outlets in view` : "";
  }
  function renderPills() {
    const pills = [];
    DIMS.forEach(([k, label]) => S.filters[k].forEach((v) => pills.push(`<span class="filter-pill">${esc(label)}: ${esc(v)}<button aria-label="Remove ${esc(v)}" data-k="${k}" data-v="${esc(v)}">×</button></span>`)));
    $("#pills").innerHTML = pills.join("");
    $$("#pills button").forEach((b) => b.addEventListener("click", () => { S.filters[b.dataset.k].delete(b.dataset.v); changed(); }));
  }
  function renderTop() {
    $("#pageTitle").textContent = TITLES[S.page] || "Overview";
    const d = S.data, showP = PERIOD_PAGES.has(S.page);
    $("#periodSeg").hidden = !showP;
    $("#resetBtn").hidden = !FILTER_PAGES.has(S.page);
    if (d) {
      const opts = [["tilldate", d.tilldate && `Till ${fdate(d.tilldate.date, true)}`], ["monthend", d.monthend && `Last month, ${fmonth(d.monthend.date)}`]].filter((o) => o[1]);
      $("#periodSeg").innerHTML = opts.map(([k, t]) => `<button aria-pressed="${S.period === k}" data-period="${k}">${esc(t)}</button>`).join("");
      $$("#periodSeg button").forEach((b) => b.addEventListener("click", () => { S.period = b.dataset.period; changed(); }));
      const g = new Date(d.generated);
      $("#fresh").textContent = "Data updated " + g.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" }).replace("Sept", "Sep");
      const r = rep();
      $("#scope").textContent = S.page === "loss" && d.pnl ? `Outlet P&L for ${S.pm === "ytd" ? "the year to date" : fmonth(S.pm || d.pnl.months[d.pnl.months.length - 1])}. ${int(inView().filter((o) => o.s >= 1).length)} trading outlets in view.` : showP && r ? `${r.closed ? "Closed month" : "Month to date"}, ${r.splm_label?.replace(/^Same Day SPLM\s*/i, "") || fdate(r.date)}.${SALES_PAGES.has(S.page) ? ` ${int(inView().length)} outlets in view.` : " Company-wide figures."}` : "";
    }
  }
  function changed() {
    Object.values(S.tables).forEach((t) => (t.page = 1));
    render();
  }

  // ------------------------------------------------------------------ pages
  function kpi({ label, value, sub = "", foot = "", accent = "var(--info)", hero = false }) {
    return `<div class="kpi${hero ? " hero" : ""}" style="--accent:${accent}"><span class="label">${label}</span><span class="value">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ""}${foot ? `<span class="foot">${foot}</span>` : ""}</div>`;
  }
  function heroAchievement(a, r) {
    const b = band(a.ach), fill = Math.min(1, a.ach || 0) * 100;
    const pace = r.closed ? `<span>Closed month, final result</span>` : `<span>Now ${bdt(a.perDay)}/day</span><span>Needs ${bdt(a.needPerDay)}/day for ${r.dim - r.day} days</span>`;
    return kpi({
      hero: true, label: r.closed ? "Sales achievement, full month" : `Sales achievement, till ${fdate(r.date)}`, value: pct(a.ach),
      sub: `${chip(b)}<span>${bdt(a.a)} of ${bdt(a.t)} target</span>`,
      foot: `<div class="bar" style="flex:1 1 100%;margin:2px 0 6px" role="img" aria-label="Achievement ${pct(a.ach)}"><i style="width:${fill}%;background:var(--${b.cls})"></i></div>${pace}`,
    });
  }
  function bandsPanel(list) {
    const counts = Object.fromEntries(BANDS.map((b) => [b.k, 0])); let none = 0;
    list.forEach((o) => { const v = o.t > 0 ? (o.a || 0) / o.t : null; v == null ? none++ : counts[band(v).k]++; });
    const tot = list.length - none || 1;
    return `<section class="panel"><div class="panel-head"><div><h2>Outlets by achievement</h2><p>${int(list.length - none)} outlets with a target${none ? `, ${none} without` : ""}</p></div></div>
      <div class="panel-body bands">${BANDS.map((b) => `<div class="band-row"><span>${chip(b)}</span><div class="bar" style="--c:var(--${b.cls})"><i style="width:${(counts[b.k] / tot) * 100}%"></i></div><strong class="num" style="text-align:right">${int(counts[b.k])}</strong></div>`).join("")}
      <button class="btn" data-go="achievement" style="align-self:flex-start;margin-top:4px">Open sales achievement</button></div></section>`;
  }
  function levelRows(list, level) {
    const g = new Map();
    list.forEach((o) => { const k = level === "outlet" ? o.c : o.dim[level]; if (!g.has(k)) g.set(k, []); g.get(k).push(o); });
    return [...g.entries()].map(([k, os]) => {
      const a = agg(os), o = os[0];
      return level === "outlet"
        ? { key: k, name: o.nm, sub: `${o.c}, ${o.dim.zn}`, o, ...a }
        : { key: k, name: k, sub: `${int(os.length)} outlets`, ...a };
    });
  }
  function achCols(r, level) {
    const cols = [
      { k: "name", label: LEVELS.find((l) => l[0] === level)[1], fmt: (x) => `<span class="cell-primary">${esc(x.name)}</span><span class="cell-secondary">${esc(x.sub)}</span>`, csv: (x) => x.name },
      { k: "t", label: "Target", num: 1, fmt: (x) => bdt(x.t), csv: (x) => Math.round(x.t) },
      { k: "a", label: "Achieved", num: 1, fmt: (x) => bdt(x.a), csv: (x) => Math.round(x.a) },
      { k: "ach", label: "Achievement", num: 1, fmt: (x) => `<strong>${pct(x.ach)}</strong> ${chip(band(x.ach))}`, csv: (x) => (isNum(x.ach) ? (x.ach * 100).toFixed(2) : "") },
      { k: "gap", label: "Gap to target", num: 1, val: (x) => x.a - x.t, fmt: (x) => `<span class="${x.a - x.t < 0 ? "down" : "up"}">${bdt(x.a - x.t)}</span>`, csv: (x) => Math.round(x.a - x.t) },
    ];
    if (!r.closed) cols.push(
      { k: "perDay", label: "Now per day", num: 1, fmt: (x) => bdt(x.perDay), csv: (x) => Math.round(x.perDay) },
      { k: "needPerDay", label: "Needed per day", num: 1, fmt: (x) => `<span class="${x.needPerDay > x.perDay ? "down" : ""}">${bdt(x.needPerDay)}</span>`, csv: (x) => Math.round(x.needPerDay ?? 0) },
    );
    cols.push(
      { k: "gy", label: "Growth vs last year", num: 1, fmt: (x) => delta(x.gy), csv: (x) => (isNum(x.gy) ? (x.gy * 100).toFixed(2) : "") },
      { k: "gm", label: "Growth vs last month", num: 1, fmt: (x) => delta(x.gm), csv: (x) => (isNum(x.gm) ? (x.gm * 100).toFixed(2) : "") },
    );
    if (level !== "outlet") cols.splice(1, 0, { k: "n", label: "Outlets", num: 1, fmt: (x) => int(x.n) });
    return cols;
  }
  const outletAttr = (x) => (x.o ? `data-outlet="${esc(x.o.c)}" tabindex="0"` : "");

  function pageOverview() {
    const r = rep(), list = inView(), a = agg(list);
    if (!r) return `<p class="empty">No sales report is loaded yet. Check the Data quality page.</p>`;
    const top = levelRows(list.filter((o) => o.t > 0), "outlet");
    const best = [...top].sort((x, y) => y.ach - x.ach).slice(0, 10), worst = [...top].sort((x, y) => x.ach - y.ach).slice(0, 10);
    const mini = (title, rows) => `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p>By achievement against target</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Outlet</th><th class="num">Achieved</th><th class="num">Achievement</th><th class="num">vs last year</th></tr></thead><tbody>
      ${rows.map((x) => `<tr ${outletAttr(x)}><td><span class="cell-primary">${esc(x.name)}</span><span class="cell-secondary">${esc(x.sub)}</span></td><td class="num">${bdt(x.a)}</td><td class="num"><strong>${pct(x.ach)}</strong></td><td class="num">${delta(x.gy)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No outlets match the selected filters.</td></tr>`}
      </tbody></table></div></section>`;
    const cats = r.categories || {};
    const catRows = (cats.sply || []).map((c) => ({ ...c, m: (cats.splm || []).find((x) => x.cat === c.cat) }));
    const league = mountTable("ov-league", {
      title: "Regional leaders", desc: (n) => `${n} regional leaders. Achievement and growth for the outlets in view.`, file: "regional_leaders",
      rows: levelRows(list, "rl"), cols: achCols(r, "rl"), key: (x) => x.key, searchText: (x) => x.name, defaultSort: "ach", pageSize: 25,
    });
    return `
      <div class="kpis ov-kpis">
        ${heroAchievement(a, r)}
        ${kpi({ label: "Sales growth vs last year", value: delta(a.gy), sub: "All stores", foot: `<span>${bdt(a.s)}</span><span>last year ${bdt(a.sy)}</span>`, accent: "var(--series-2)" })}
        ${kpi({ label: "Same-store growth vs last year", value: delta(a.gss), sub: `${int(a.ssn)} same stores`, foot: `<span>${bdt(a.ssS)}</span><span>last year ${bdt(a.ssY)}</span>`, accent: "var(--series-2)" })}
        ${kpi({ label: "Sales growth vs last month", value: delta(a.gm), sub: "All stores, same days", foot: `<span>${bdt(a.s)}</span><span>last month ${bdt(a.sm)}</span>`, accent: "var(--series-3)" })}
        ${kpi({ label: "Footfall vs last year", value: delta(growth(a.f, a.fy)), sub: `${int(a.f)} customers`, foot: `<span>last year ${int(a.fy)}</span>`, accent: "var(--series-1)" })}
        ${kpi({ label: "Average bill value", value: bdt(a.bk), sub: delta(growth(a.bk, a.bky)) + " vs last year", foot: `<span>last year ${bdt(a.bky)}</span>`, accent: "var(--series-1)" })}
        ${kpi({ label: "Gross profit margin", value: pct(a.gp), sub: delta(isNum(a.gp) && isNum(a.gpy) ? a.gp - a.gpy : null, "pp") + " vs last year", foot: `<span>GP ${bdt(a.gv)}</span>`, accent: "var(--series-3)" })}
      </div>
      ${league}
      <div class="grid-h">${mini("Top 10 outlets", best)}${mini("Bottom 10 outlets", worst)}</div>
      <div class="grid-2">${catRows.length ? `<section class="panel"><div class="panel-head"><div><h2>Category growth</h2><p>Company-wide figures from the report. Filters don't apply here.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Category</th><th class="num">All stores vs last year</th><th class="num">Own same-store vs last year</th><th class="num">Franchise same-store vs last year</th><th class="num">All stores vs last month</th></tr></thead><tbody>
        ${catRows.map((c) => `<tr><td class="cell-primary">${esc(c.cat)}</td><td class="num">${delta(c.all)}</td><td class="num">${delta(c.own)}</td><td class="num">${delta(c.fran)}</td><td class="num">${delta(c.m?.all)}</td></tr>`).join("")}
        </tbody></table></div></section>` : ""}${bandsPanel(list)}</div>`;
  }

  function pageAchievement() {
    const r = rep();
    if (!r) return `<p class="empty">No sales report is loaded yet. Check the Data quality page.</p>`;
    const list = inView(), a = agg(list);
    let rows = levelRows(list, S.level);
    if (S.bands.size) rows = rows.filter((x) => S.bands.has(band(x.ach).k));
    const tools = `<select class="sel" data-level aria-label="Group by">${LEVELS.map(([k, t]) => `<option value="${k}" ${S.level === k ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
      ${BANDS.concat([{ k: "none", label: "No target" }]).map((b) => `<button class="btn" aria-pressed="${S.bands.has(b.k)}" data-band="${b.k}">${esc(b.label)}</button>`).join("")}`;
    const lvlName = LEVELS.find((l) => l[0] === S.level)[1];
    const table = mountTable("ach", {
      title: `Achievement by ${lvlName.toLowerCase()}`, file: `achievement_by_${S.level}`,
      desc: (n) => `${int(n)} rows. ${r.closed ? "Final month results." : "Target is prorated to the days elapsed; needed per day assumes an even daily target."}${S.level === "outlet" ? " Click a row for the outlet profile." : ""}`,
      rows, cols: achCols(r, S.level), key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "ach", tools, rowAttr: outletAttr,
      wire: (el) => {
        $("[data-level]", el).addEventListener("change", (e) => { S.level = e.target.value; S.tables.ach.page = 1; render(); });
        $$("[data-band]", el).forEach((b) => b.addEventListener("click", () => { const k = b.dataset.band; S.bands.has(k) ? S.bands.delete(k) : S.bands.add(k); S.tables.ach.page = 1; render(); }));
      },
    });
    const k = r.closed
      ? [kpi({ label: "Target", value: bdt(a.t), foot: `<span>${int(a.tn)} outlets with a target</span>` }), kpi({ label: "Achieved", value: bdt(a.a), foot: `<span>${exact(a.a)}</span>` }), kpi({ label: "Gap to target", value: bdt(a.a - a.t), foot: `<span>${a.a >= a.t ? "Above target" : "Below target"}</span>`, accent: `var(--${a.a >= a.t ? "good" : "bad"})` }), kpi({ label: "Average per day", value: bdt(a.a / r.dim), foot: `<span>${r.dim} trading days</span>` })]
      : [kpi({ label: "Projected month-end sales", value: bdt(a.projected), sub: "At the current daily pace", foot: `<span>Estimated month target ${bdt(a.monthTarget)}</span>` }),
         kpi({ label: "Needed per day", value: bdt(a.needPerDay), sub: `For the remaining ${r.dim - r.day} days`, foot: `<span>Now ${bdt(a.perDay)}/day</span>`, accent: `var(--${a.needPerDay > a.perDay ? "bad" : "good"})` }),
         kpi({ label: "Gap to till-date target", value: bdt(a.a - a.t), foot: `<span>${int(a.tn)} outlets with a target</span>`, accent: `var(--${a.a >= a.t ? "good" : "bad"})` }),
         kpi({ label: "Outlets at 100% or more", value: int(list.filter((o) => o.t > 0 && o.a >= o.t).length), foot: `<span>of ${int(a.tn)} with a target</span>`, accent: "var(--good)" })];
    return `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${heroAchievement(a, r)}${k.join("")}</div>${table}`;
  }

  function pageDQ() {
    const d = S.data;
    const lvl = { error: "bad", warn: "warn", info: "info" };
    const name = { error: "Problem", warn: "Warning", info: "Note" };
    const folder = { tilldate: "Till-date folder", monthend: "Month-end folder", performance: "Performance folder" };
    return `
      <section class="panel"><div class="panel-head"><div><h2>Files in use</h2><p>Recognised by their content. Filenames don't matter.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>Folder</th><th>Data up to</th></tr></thead><tbody>
        ${d.sources.map((s) => `<tr><td class="cell-primary">${esc(s.file)}</td><td>${esc(s.type)}</td><td>${esc(folder[s.folder] || s.folder)}</td><td>${/^\d{4}-\d{2}$/.test(s.date) ? esc(s.date) : fdate(s.date)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No files were found in the Drive folders.</td></tr>`}
        </tbody></table></div></section>
      <section class="panel"><div class="panel-head"><div><h2>Checks from the last refresh</h2><p>${d.issues.filter((i) => i.level === "error").length} problems, ${d.issues.filter((i) => i.level === "warn").length} warnings</p></div></div>
        <div class="panel-body">${d.issues.map((i) => `<div class="issue"><span>${chip({ cls: lvl[i.level], label: name[i.level] })}</span><div>${esc(i.message)}<small>${esc(i.source)}</small></div></div>`).join("") || '<p class="muted">All checks passed.</p>'}</div></section>
      <section class="panel"><div class="panel-head"><div><h2>How updates work</h2></div></div>
        <div class="panel-body"><p style="margin:0;max-width:72ch">Upload or replace a file in its Google Drive folder. The dashboard checks the folders every hour between 8 am and 11 pm and refreshes on its own. To refresh straight away, open the repository on GitHub, go to Actions, choose "Refresh data" and press "Run workflow". If a file is broken, the dashboard keeps the last good data and the problem appears on this page.</p></div></section>`;
  }

  function pageEmbed(k) {
    const e = EMBEDS[k];
    return `<section class="panel embed"><div class="panel-head"><div><h2>${esc(TITLES[k])}</h2><p>${esc(e.desc)}</p></div>
      <div class="panel-tools"><a class="btn" href="${e.url}" target="_blank" rel="noopener">Open in new tab</a></div></div>
      <iframe src="${e.url}" title="${esc(TITLES[k])} dashboard" loading="lazy"></iframe></section>`;
  }

  // ------------------------------------------------------------------ shared helpers (growth pages)
  const CMP = { y: "last year", m: "last month" };
  const SCOPES = [["all", "All stores"], ["same", "Same store"], ["own", "Own"], ["fran", "Franchise"]];
  const noData = () => `<p class="empty">No sales report is loaded yet. Check the Data quality page.</p>`;
  function cagg(list, c) {
    let s = 0, s0 = 0, f = 0, f0 = 0, g = 0, g0 = 0;
    for (const o of list) { s += o.s || 0; s0 += o["s" + c] || 0; f += o.f || 0; f0 += o["f" + c] || 0; g += o.gv || 0; g0 += o["gv" + c] || 0; }
    const b = ratio(s, f), b0 = ratio(s0, f0), gp = ratio(g, s), gp0 = ratio(g0, s0);
    return { n: list.length, s, s0, f, f0, diff: s - s0, gs: growth(s, s0), gf: growth(f, f0), b, b0, gb: growth(b, b0), gp, gp0, gpd: isNum(gp) && isNum(gp0) ? gp - gp0 : null };
  }
  const inScope = (o, scope, c) => scope === "all" || (scope === "same" ? !!o["ss" + c] : scope === "own" ? o.dim.own === "Own" : o.dim.own === "Franchise");
  function groupRows(list, level, fn) {
    const g = new Map();
    list.forEach((o) => { const k = level === "outlet" ? o.c : o.dim[level]; if (!g.has(k)) g.set(k, []); g.get(k).push(o); });
    return [...g.entries()].map(([k, os]) => level === "outlet"
      ? { key: k, name: os[0].nm, sub: `${os[0].c}, ${os[0].dim.zn}`, o: os[0], ...fn(os) }
      : { key: k, name: k, sub: `${int(os.length)} outlets`, ...fn(os) });
  }
  const seg = (set, opts, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${opts.map(([v, t]) => `<button data-set="${set}" data-val="${v}" aria-pressed="${S[set] === v}">${esc(t)}</button>`).join("")}</div>`;
  const levelSel = () => `<select class="sel" data-sel="level" aria-label="Group by">${LEVELS.map(([k, t]) => `<option value="${k}" ${S.level === k ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const pcsv = (v) => (isNum(v) ? (v * 100).toFixed(2) : "");
  const nameCol = (level) => ({ k: "name", label: LEVELS.find((l) => l[0] === level)[1], fmt: (x) => `<span class="cell-primary">${esc(x.name)}</span><span class="cell-secondary">${esc(x.sub)}</span>`, csv: (x) => x.name, val: (x) => x.name });
  const nCol = { k: "n", label: "Outlets", num: 1, fmt: (x) => int(x.n) };
  const cmpLabel = (r) => (S.cmp === "y" ? r.sply_label : r.splm_label) || "";
  const cmpSeg = () => seg("cmp", [["y", "vs last year"], ["m", "vs last month"]], "Compare with");

  function wireDyn(root) {
    $$("[data-age-band]", root).forEach((b) => (b.onclick = () => openAgeOutlets(b.dataset.ageBand, b.dataset.ageScope === "loss")));
    $$("[data-outlet]", root).forEach((tr) => { tr.onclick = () => openOutlet(tr.dataset.outlet); tr.onkeydown = (e) => { if (e.key === "Enter") openOutlet(tr.dataset.outlet); }; });
    $$("[data-pnl]", root).forEach((tr) => { tr.onclick = () => openPnl(tr.dataset.pnl); tr.onkeydown = (e) => { if (e.key === "Enter") openPnl(tr.dataset.pnl); }; });
    $$("[data-khead]", root).forEach((tr) => { tr.onclick = () => openHead(tr.dataset.khead); tr.onkeydown = (e) => { if (e.key === "Enter") openHead(tr.dataset.khead); }; });
    $$("[data-set]", root).forEach((b) => (b.onclick = () => { S[b.dataset.set] = b.dataset.val; changed(); }));
    $$("[data-sel]", root).forEach((sel) => (sel.onchange = () => { S[sel.dataset.sel] = sel.value; changed(); }));
    $$("[data-go]", root).forEach((b) => (b.onclick = () => (location.hash = b.dataset.go)));
  }

  // ------------------------------------------------------------------ sales growth
  function pageGrowth() {
    const r = rep(); if (!r) return noData();
    const c = S.cmp, list = inView();
    const card = (label, scope, accent) => {
      const a = cagg(list.filter((o) => inScope(o, scope, c)), c);
      return kpi({ label, value: delta(a.gs), sub: `${int(a.n)} outlets`, foot: `<span>${bdt(a.s)}</span><span>${CMP[c]} ${bdt(a.s0)}</span>`, accent });
    };
    const rows = groupRows(list.filter((o) => inScope(o, S.scope, c)), S.level, (os) => cagg(os, c));
    const scopeName = SCOPES.find((x) => x[0] === S.scope)[1].toLowerCase();
    const cols = [nameCol(S.level), ...(S.level === "outlet" ? [] : [nCol]),
      { k: "s", label: "Sales", num: 1, fmt: (x) => bdt(x.s), csv: (x) => Math.round(x.s) },
      { k: "s0", label: `Sales ${CMP[c]}`, num: 1, fmt: (x) => bdt(x.s0), csv: (x) => Math.round(x.s0) },
      { k: "gs", label: "Growth", num: 1, fmt: (x) => delta(x.gs), csv: (x) => pcsv(x.gs) },
      { k: "diff", label: "Change", num: 1, fmt: (x) => `<span class="${x.diff < 0 ? "down" : "up"}">${bdt(x.diff)}</span>`, csv: (x) => Math.round(x.diff) },
      { k: "gp", label: "GP margin", num: 1, fmt: (x) => pct(x.gp), csv: (x) => pcsv(x.gp) },
      { k: "gpd", label: "GP margin change", num: 1, fmt: (x) => delta(x.gpd, "pp"), csv: (x) => pcsv(x.gpd) }];
    const table = mountTable("growth", {
      title: `Growth ${CMP[c] === "last year" ? "vs last year" : "vs last month"}, ${scopeName}`, file: `growth_${c}_${S.scope}_${S.level}`,
      desc: (n) => `${int(n)} rows. ${cmpLabel(r)}.${S.scope === "same" ? " Same store follows the report's own same-store list." : ""}`,
      rows, cols, key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "gs", rowAttr: outletAttr,
      tools: `${cmpSeg()}${seg("scope", SCOPES, "Stores")}${levelSel()}`,
    });
    return `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${card("All stores", "all", "var(--series-2)")}${card("Same store", "same", "var(--series-2)")}${card("Own outlets", "own", "var(--series-3)")}${card("Franchise outlets", "fran", "var(--series-3)")}
      </div>${table}`;
  }

  // ------------------------------------------------------------------ footfall & basket
  function pageFootfall() {
    const r = rep(); if (!r) return noData();
    const c = S.cmp, list = inView().filter((o) => inScope(o, S.scope, c)), a = cagg(list, c);
    const rows = groupRows(list, S.level, (os) => cagg(os, c));
    const cols = [nameCol(S.level), ...(S.level === "outlet" ? [] : [nCol]),
      { k: "f", label: "Footfall", num: 1, fmt: (x) => int(x.f), csv: (x) => Math.round(x.f) },
      { k: "f0", label: `Footfall ${CMP[c]}`, num: 1, fmt: (x) => int(x.f0), csv: (x) => Math.round(x.f0) },
      { k: "gf", label: "Footfall growth", num: 1, fmt: (x) => delta(x.gf), csv: (x) => pcsv(x.gf) },
      { k: "b", label: "Bill value", num: 1, fmt: (x) => bdt(x.b), csv: (x) => (isNum(x.b) ? x.b.toFixed(2) : "") },
      { k: "b0", label: `Bill value ${CMP[c]}`, num: 1, fmt: (x) => bdt(x.b0), csv: (x) => (isNum(x.b0) ? x.b0.toFixed(2) : "") },
      { k: "gb", label: "Bill value growth", num: 1, fmt: (x) => delta(x.gb), csv: (x) => pcsv(x.gb) },
      { k: "gs", label: "Sales growth", num: 1, fmt: (x) => delta(x.gs), csv: (x) => pcsv(x.gs) }];
    const days = r.closed ? r.dim : r.day;
    const table = mountTable("footfall", {
      title: `Footfall and bill value ${S.cmp === "y" ? "vs last year" : "vs last month"}`, file: `footfall_${c}_${S.scope}_${S.level}`,
      desc: (n) => `${int(n)} rows. Bill value is sales divided by customers. ${cmpLabel(r)}.`,
      rows, cols, key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "gf", rowAttr: outletAttr,
      tools: `${cmpSeg()}${seg("scope", SCOPES, "Stores")}${levelSel()}`,
    });
    return `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${kpi({ label: "Footfall growth", value: delta(a.gf), sub: `${int(a.f)} customers`, foot: `<span>${CMP[c]} ${int(a.f0)}</span>`, accent: "var(--series-1)" })}
      ${kpi({ label: "Customers per day", value: int(a.f / days), sub: `Over ${days} days`, foot: `<span>${int(a.n)} outlets</span>`, accent: "var(--series-1)" })}
      ${kpi({ label: "Average bill value", value: bdt(a.b), sub: `${delta(a.gb)} vs ${CMP[c]}`, foot: `<span>${CMP[c]} ${bdt(a.b0)}</span>`, accent: "var(--series-2)" })}
      ${kpi({ label: "Sales growth", value: delta(a.gs), sub: "Footfall and bill value combined", foot: `<span>${bdt(a.s)}</span><span>${CMP[c]} ${bdt(a.s0)}</span>`, accent: "var(--series-3)" })}
      </div>${table}`;
  }

  // ------------------------------------------------------------------ growth & degrowth ranking
  const DRIVERS = { "More customers": "good", "Bigger baskets": "good", "Fewer customers": "bad", "Smaller baskets": "bad" };
  function driver(x) {
    if (!(x.f > 0 && x.f0 > 0 && x.b > 0 && x.b0 > 0)) return null;
    const lf = Math.log(x.f / x.f0), lb = Math.log(x.b / x.b0);
    return Math.abs(lf) >= Math.abs(lb) ? (lf >= 0 ? "More customers" : "Fewer customers") : (lb >= 0 ? "Bigger baskets" : "Smaller baskets");
  }
  function pageRanking() {
    const r = rep(); if (!r) return noData();
    const c = S.cmp, list = inView().filter((o) => inScope(o, S.scope, c));
    const comp = list.filter((o) => o.s > 0 && o["s" + c] > 0);
    const fresh = list.filter((o) => o.s > 0 && !(o["s" + c] > 0)).length, gone = list.filter((o) => !(o.s > 0) && o["s" + c] > 0).length;
    let rows = groupRows(comp, "outlet", (os) => cagg(os, c));
    rows.forEach((x) => (x.drv = driver(x)));
    const grow = rows.filter((x) => x.gs > 0).length, dec = rows.filter((x) => x.gs < 0).length;
    if (S.trend === "up") rows = rows.filter((x) => x.gs > 0);
    if (S.trend === "down") rows = rows.filter((x) => x.gs < 0);
    const t1 = mountTable("rank", {
      title: "Outlet ranking", file: `growth_ranking_${c}_${S.trend}`,
      desc: (n) => `${int(n)} comparable outlets (sales in both periods). Main driver is whichever of footfall or bill value moved sales more. Click a row for the outlet profile.`,
      rows, key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "gs", defaultDir: S.trend === "down" ? "asc" : "desc", rowAttr: outletAttr,
      tools: `${cmpSeg()}${seg("trend", [["all", "All"], ["up", "Growing"], ["down", "Declining"]], "Trend")}${seg("scope", SCOPES, "Stores")}`,
      cols: [nameCol("outlet"),
        { k: "s", label: "Sales", num: 1, fmt: (x) => bdt(x.s), csv: (x) => Math.round(x.s) },
        { k: "s0", label: `Sales ${CMP[c]}`, num: 1, fmt: (x) => bdt(x.s0), csv: (x) => Math.round(x.s0) },
        { k: "gs", label: "Growth", num: 1, fmt: (x) => delta(x.gs), csv: (x) => pcsv(x.gs) },
        { k: "diff", label: "Change", num: 1, fmt: (x) => `<span class="${x.diff < 0 ? "down" : "up"}">${bdt(x.diff)}</span>`, csv: (x) => Math.round(x.diff) },
        { k: "gf", label: "Footfall", num: 1, fmt: (x) => delta(x.gf), csv: (x) => pcsv(x.gf) },
        { k: "gb", label: "Bill value", num: 1, fmt: (x) => delta(x.gb), csv: (x) => pcsv(x.gb) },
        { k: "drv", label: "Main driver", fmt: (x) => (x.drv ? chip({ cls: DRIVERS[x.drv], label: x.drv }) : '<span class="muted">—</span>'), csv: (x) => x.drv || "" }],
    });
    const byRl = groupRows(comp, "rl", (os) => { const g = os.map((o) => cagg([o], c)); const up = g.filter((x) => x.gs > 0).length, dn = g.filter((x) => x.gs < 0).length; return { ...cagg(os, c), up, dn, share: os.length ? dn / os.length : null }; });
    const t2 = mountTable("rank-rl", {
      title: "Growing and declining outlets by regional leader", file: `growth_by_rl_${c}`, pageSize: 25,
      desc: (n) => `${n} regional leaders, comparable outlets only.`, rows: byRl, key: (x) => x.key, searchText: (x) => x.name, defaultSort: "share",
      cols: [nameCol("rl"), { k: "n", label: "Comparable outlets", num: 1, fmt: (x) => int(x.n) },
        { k: "up", label: "Growing", num: 1, fmt: (x) => `<span class="up">${int(x.up)}</span>` }, { k: "dn", label: "Declining", num: 1, fmt: (x) => `<span class="down">${int(x.dn)}</span>` },
        { k: "share", label: "Share declining", num: 1, fmt: (x) => pct(x.share), csv: (x) => pcsv(x.share) }, { k: "gs", label: "Growth", num: 1, fmt: (x) => delta(x.gs), csv: (x) => pcsv(x.gs) }],
    });
    return `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${kpi({ label: "Growing outlets", value: int(grow), sub: `of ${int(grow + dec)} comparable`, foot: `<span>${pct((grow / (grow + dec || 1)))} of comparable outlets</span>`, accent: "var(--good)" })}
      ${kpi({ label: "Declining outlets", value: int(dec), sub: `of ${int(grow + dec)} comparable`, foot: `<span>${pct((dec / (grow + dec || 1)))} of comparable outlets</span>`, accent: "var(--bad)" })}
      ${kpi({ label: "New since comparison", value: int(fresh), sub: `No sales ${CMP[c]}`, foot: "<span>Not ranked</span>", accent: "var(--idle)" })}
      ${kpi({ label: "No sales this period", value: int(gone), sub: "Usually closed outlets", foot: "<span>Not ranked</span>", accent: "var(--idle)" })}
      </div>${t1}${t2}`;
  }

  // ------------------------------------------------------------------ category
  function pageCategory() {
    const r = rep(); if (!r) return noData();
    const cats = r.categories || {};
    if (!cats.sply && !cats.splm) return `<p class="empty">The report's category summary wasn't found. Check the Data quality page.</p>`;
    const tot = (k) => (cats[k] || []).find((x) => x.cat === "Total") || {};
    const block = (k, title, label) => {
      const rows = cats[k] || [];
      if (!rows.length) return "";
      return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${esc(label || "")}. Company-wide; outlet filters don't apply.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Category</th><th class="num">All stores sales</th><th class="num">All stores CP</th><th class="num">Own same-store sales</th><th class="num">Own same-store CP</th><th class="num">Franchise same-store sales</th><th class="num">Franchise same-store CP</th>${rows[0].this != null ? '<th class="num">Sales this period</th><th class="num">Sales comparison period</th>' : ""}</tr></thead><tbody>
        ${rows.map((c) => `<tr${c.cat === "Total" ? ' style="font-weight:650"' : ""}><td class="cell-primary">${esc(c.cat)}</td><td class="num">${delta(c.all)}</td><td class="num">${delta(c.all_cp)}</td><td class="num">${delta(c.own)}</td><td class="num">${delta(c.own_cp)}</td><td class="num">${delta(c.fran)}</td><td class="num">${delta(c.fran_cp)}</td>${c.this != null ? `<td class="num">${bdt(c.this)}</td><td class="num">${bdt(c.last)}</td>` : ""}</tr>`).join("")}
        </tbody></table></div></section>`;
    };
    const ty = tot("sply"), tm = tot("splm");
    return `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${kpi({ label: "All stores vs last year", value: delta(ty.all), sub: "Sales growth", foot: `<span>CP ${delta(ty.all_cp)}</span>`, accent: "var(--series-2)" })}
      ${kpi({ label: "Own same-store vs last year", value: delta(ty.own), sub: "Sales growth", foot: `<span>CP ${delta(ty.own_cp)}</span>`, accent: "var(--series-2)" })}
      ${kpi({ label: "Franchise same-store vs last year", value: delta(ty.fran), sub: "Sales growth", foot: `<span>CP ${delta(ty.fran_cp)}</span>`, accent: "var(--series-2)" })}
      ${kpi({ label: "All stores vs last month", value: delta(tm.all), sub: "Sales growth", foot: `<span>CP ${delta(tm.all_cp)}</span>`, accent: "var(--series-3)" })}
      </div>
      ${block("sply", "Category growth vs last year", r.sply_label)}${block("splm", "Category growth vs last month", r.splm_label)}
      <p class="muted" style="margin:0">CP is contribution profit growth, as calculated in the report. "n/m" marks a category whose comparison base is too small to be meaningful.</p>`;
  }

  // ------------------------------------------------------------------ KPI performance
  function kpiAch(t, a, dir) {
    if (!isNum(t) || !isNum(a)) return null;
    let v;
    if (dir.startsWith("lower")) { if (a <= 0) return 1; v = t / a; } else { if (t === 0) return a >= 0 ? 1 : 0; v = a / t; }
    return Math.max(0, Math.min(1, v));
  }
  function kpiPeriods() {
    const ms = S.data.kpi?.months || [];
    if (!ms.length) return [];
    const [y, m] = ms[ms.length - 1].split("-").map(Number), fy = m >= 7 ? y : y - 1;
    const all = Array.from({ length: 12 }, (_, i) => { const mm = ((6 + i) % 12) + 1; return `${fy + (i >= 6 ? 1 : 0)}-${String(mm).padStart(2, "0")}`; });
    const has = new Set(ms), short = (k) => fmonth(k).slice(0, 3);
    const out = ms.filter((x) => all.includes(x)).map((x) => ({ k: x, label: fmonth(x), months: [x], len: 1 }));
    [["Q1", 0], ["Q2", 3], ["Q3", 6], ["Q4", 9]].forEach(([q, i]) => { const mm = all.slice(i, i + 3); if (mm.some((x) => has.has(x))) out.push({ k: q, label: `${q}, ${short(mm[0])} to ${short(mm[2])}`, months: mm, len: 3 }); });
    [["H1", 0], ["H2", 6]].forEach(([h, i]) => { const mm = all.slice(i, i + 6); if (mm.some((x) => has.has(x))) out.push({ k: h, label: `${h}, ${short(mm[0])} to ${short(mm[5])}`, months: mm, len: 6 }); });
    out.push({ k: "ytd", label: `Year to date, FY ${fy}–${String(fy + 1).slice(2)}`, months: all, len: 12 });
    out.forEach((p) => (p.have = p.months.filter((x) => has.has(x)).length));
    return out;
  }
  function kpiScores(rows, months) {
    const heads = new Map();
    for (const rec of rows) {
      const M = months.filter((m) => isNum(rec.a[m]));
      if (!M.length || !rec.w) continue;
      const sum = (v) => v.reduce((x, y) => x + y, 0);
      const pick = (v) => (rec.calc === "sum" ? sum(v) : sum(v) / v.length);
      const tv = M.map((m) => rec.t[m]).filter(isNum), av = M.map((m) => rec.a[m]);
      const t = tv.length ? pick(tv) : null, a = pick(av), ach = kpiAch(t, a, rec.dir);
      if (ach == null) continue;
      const h = heads.get(rec.head) || { head: rec.head, pts: 0, w: 0, cats: {}, metrics: [] };
      h.pts += ach * rec.w; h.w += rec.w;
      const cc = h.cats[rec.cat] || (h.cats[rec.cat] = { pts: 0, w: 0 });
      cc.pts += ach * rec.w; cc.w += rec.w;
      h.metrics.push({ cat: rec.cat, metric: rec.metric, w: rec.w, dir: rec.dir, calc: rec.calc, t, a, ach, pts: ach * rec.w, n: M.length });
      heads.set(rec.head, h);
    }
    const list = [...heads.values()].map((h) => ({ ...h, score: h.pts / h.w }));
    const nat = list.find((h) => h.head === "National");
    const rest = list.filter((h) => h.head !== "National").sort((x, y) => y.score - x.score);
    rest.forEach((h, i) => (h.rank = i + 1));
    return { nat, rest };
  }
  function zonalRl() {
    const m = {};
    (S.data.master?.outlets || []).forEach((o) => { if (o.zn && o.rl && !m[o.zn]) m[o.zn] = o.rl; });
    return m;
  }
  const catShort = (c) => { const l = c.toLowerCase(); return l.startsWith("business") ? "Business" : l.startsWith("satisf") ? "Customer" : l.startsWith("skill") ? "People" : l.startsWith("expense") ? "Expense" : c; };
  function pageKPI() {
    const K = S.data.kpi, periods = kpiPeriods();
    if (!periods.length) return `<p class="empty">No KPI performance file is loaded yet. Add one to the Performance folder.</p>`;
    if (!periods.find((p) => p.k === S.kp)) S.kp = periods.filter((p) => p.len === 1).slice(-1)[0].k;
    const P = periods.find((p) => p.k === S.kp), rows = K[S.kl] || [];
    const { nat, rest } = kpiScores(rows, P.months);
    const cats = [...new Set(rows.map((x) => x.cat))];
    const zr = zonalRl(), lvlName = S.kl === "rho" ? "RHO" : "Zonal";
    const periodSel = `<select class="sel" data-sel="kp" aria-label="Period">${periods.map((p) => `<option value="${p.k}" ${p.k === S.kp ? "selected" : ""}>${esc(p.label)}${p.len > 1 && p.have < p.len ? ` (${p.have} of ${p.len} months)` : ""}</option>`).join("")}</select>`;
    const tools = `${seg("kl", [["rho", "RHO"], ["zonal", "Zonal"]], "Level")}${seg("kv", [["rank", "Ranking"], ["summary", "Summary"]], "View")}${S.kv === "rank" ? periodSel : ""}`;
    const partial = P.len > 1 && P.have < P.len ? `<p class="note">${esc(P.label)} is partial: ${P.have} of ${P.len} months uploaded. Scores cover the uploaded months only.</p>` : "";
    const sub = (h) => (S.kl === "zonal" ? `RHO ${zr[h.head] || "not in outlet master"}` : `${h.metrics.length} metrics`);
    let table;
    if (S.kv === "rank") {
      table = mountTable("kpi-" + S.kl, {
        title: `${lvlName} ranking, ${P.label}`, file: `kpi_${S.kl}_${P.k}`, pageSize: 70,
        desc: (n) => `${n} ${lvlName === "RHO" ? "RHOs" : "zonals"}. Score = weighted achievement across all KPIs; each KPI is capped at 100%. Click a row for the KPI breakdown.`,
        rows: rest.map((h) => ({ ...h, key: h.head, name: h.head, sub: sub(h), ...Object.fromEntries(cats.map((c, i) => [`c${i}`, h.cats[c] ? h.cats[c].pts / h.cats[c].w : null])) })),
        key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "score", tools, rowAttr: (x) => `data-khead="${esc(x.head)}" tabindex="0"`,
        cols: [{ k: "rank", label: "Rank", num: 1, fmt: (x) => int(x.rank), val: (x) => -x.rank },
          { k: "name", label: lvlName, fmt: (x) => `<span class="cell-primary">${esc(x.name)}</span><span class="cell-secondary">${esc(x.sub)}</span>`, csv: (x) => x.name, val: (x) => x.name },
          { k: "score", label: "Score", num: 1, fmt: (x) => `<strong>${pct(x.score)}</strong>`, csv: (x) => pcsv(x.score) },
          ...cats.map((c, i) => ({ k: `c${i}`, label: catShort(c), num: 1, fmt: (x) => pct(x[`c${i}`]), csv: (x) => pcsv(x[`c${i}`]) }))],
      });
    } else {
      const cols = periods.filter((p) => p.have);
      const byP = Object.fromEntries(cols.map((p) => [p.k, kpiScores(rows, p.months).rest]));
      const heads = [...new Set(Object.values(byP).flat().map((h) => h.head))];
      const data = heads.map((h) => { const x = { key: h, name: h, head: h }; cols.forEach((p) => { const f = byP[p.k].find((y) => y.head === h); x[p.k] = f?.score ?? null; x[p.k + "_r"] = f?.rank; }); x.sub = S.kl === "zonal" ? `RHO ${zr[h] || "not in outlet master"}` : ""; return x; });
      table = mountTable("kpisum-" + S.kl, {
        title: `${lvlName} summary across periods`, file: `kpi_summary_${S.kl}`, pageSize: 70,
        desc: (n) => `${n} ${lvlName === "RHO" ? "RHOs" : "zonals"}. Scores with rank underneath. Partial quarters and halves cover uploaded months only.`,
        rows: data, key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "ytd", tools, rowAttr: (x) => `data-khead="${esc(x.head)}" tabindex="0"`,
        cols: [{ k: "name", label: lvlName, fmt: (x) => `<span class="cell-primary">${esc(x.name)}</span>${x.sub ? `<span class="cell-secondary">${esc(x.sub)}</span>` : ""}`, csv: (x) => x.name, val: (x) => x.name },
          ...cols.map((p) => ({ k: p.k, label: p.len === 12 ? "Year to date" : p.len === 1 ? p.label : p.k, num: 1, fmt: (x) => `<strong>${pct(x[p.k])}</strong><span class="cell-secondary">${x[p.k + "_r"] ? "Rank " + x[p.k + "_r"] : ""}</span>`, csv: (x) => pcsv(x[p.k]) }))],
      });
    }
    const top = rest[0], low = rest[rest.length - 1];
    return `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${kpi({ label: `National score, ${P.label}`, value: pct(nat?.score), sub: `${P.have} month${P.have === 1 ? "" : "s"} of data`, foot: `<span>${nat ? nat.metrics.length + " KPIs" : "National row not found"}</span>`, accent: "var(--info)" })}
      ${kpi({ label: `Top ${lvlName === "RHO" ? "RHO" : "zonal"}`, value: esc(top?.head || "—"), sub: pct(top?.score), foot: `<span>Rank 1 of ${rest.length}</span>`, accent: "var(--good)" })}
      ${kpi({ label: `Lowest ${lvlName === "RHO" ? "RHO" : "zonal"}`, value: esc(low?.head || "—"), sub: pct(low?.score), foot: `<span>Rank ${rest.length} of ${rest.length}</span>`, accent: "var(--bad)" })}
      ${kpi({ label: "Performance files", value: int(K.files.length), sub: `Months: ${K.months.map(fmonth).join(", ")}`, foot: "<span>Newest file wins for each month</span>", accent: "var(--idle)" })}
      </div>${partial}${table}`;
  }
  function kfmt(metric, v) {
    if (!isNum(v)) return "—";
    if (/\(in cr\)/i.test(metric)) return v.toFixed(2) + " Cr";
    if (/%|growth|churn|skill|assessment|audit/i.test(metric)) return pct(v, Math.abs(v) < 0.01 ? 3 : 2);
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  function openHead(head) {
    const periods = kpiPeriods(), P = periods.find((p) => p.k === S.kp) || periods.find((p) => p.k === "ytd");
    const all = kpiScores(S.data.kpi[S.kl] || [], P.months), h = all.rest.find((x) => x.head === head);
    if (!h) return;
    S.lastFocus = document.activeElement;
    $("#drawerTitle").textContent = `${head}, ${P.label}`;
    const cats = [...new Set(h.metrics.map((m) => m.cat))];
    $("#drawerBody").innerHTML = `
      <div class="stat-grid">
        <div class="stat"><small>Score</small><strong>${pct(h.score)}</strong><div style="font-size:12px">Rank ${h.rank} of ${all.rest.length}</div></div>
        ${cats.map((c) => `<div class="stat"><small>${esc(catShort(c))}</small><strong>${pct(h.cats[c].pts / h.cats[c].w)}</strong><div style="font-size:12px">${h.cats[c].pts.toFixed(1)} of ${h.cats[c].w} points</div></div>`).join("")}
      </div>
      <div class="table-wrap" style="max-height:none"><table><thead><tr><th>KPI</th><th class="num">Weight</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Achievement</th><th class="num">Points</th></tr></thead><tbody>
      ${h.metrics.map((m) => `<tr><td><span class="cell-primary">${esc(m.metric)}</span><span class="cell-secondary">${esc(catShort(m.cat))}${m.dir.startsWith("lower") ? ", lower is better" : ""}${P.len > 1 ? `, ${m.calc === "sum" ? "summed" : "averaged"} over ${m.n} month${m.n === 1 ? "" : "s"}` : ""}</span></td><td class="num">${int(m.w)}</td><td class="num">${kfmt(m.metric, m.t)}</td><td class="num">${kfmt(m.metric, m.a)}</td><td class="num">${pct(m.ach)}</td><td class="num">${m.pts.toFixed(2)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted" style="margin:0;font-size:12px">Targets and actuals are the scoring values from the KPI file. Achievement is capped at 100%. Sum and average rules come from each KPI's calc type in the file.</p>`;
    showDrawer();
  }

  // ------------------------------------------------------------------ loss-making outlets (outlet P&L)
  const AGE_BANDS = [["Under 6 months", 0, 6], ["6 to 12 months", 6, 12], ["1 to 2 years", 12, 24], ["2 years or more", 24, Infinity]];
  const LOSS_STATUS = {
    new: { label: "New loss", cls: "bad" }, wide: { label: "Loss widening", cls: "bad" },
    narrow: { label: "Loss narrowing", cls: "warn" }, first: { label: "No prior month", cls: "idle" }, ytd: { label: "Loss year to date", cls: "bad" },
  };
  function pnlCalc(o) {
    const after = S.pbasis === "after";
    const ytd = S.pm === "ytd";
    const pl = after ? o.p : o.g, pl0 = ytd ? null : after ? o.p0 : o.g0;
    const fixed = (o.ox || 0) + (after ? o.ofc || 0 : 0);
    const rate = o.s > 0 ? ((o.gp || 0) + (o.oi || 0)) / o.s : null;
    const be = rate > 0 ? fixed / rate : null;
    const P = S.data.pnl, [y, m] = (ytd ? P.months[P.months.length - 1] : S.pm).split("-").map(Number);
    const ld = o.ld || o.m?.ld;
    let age = null;
    if (ld) { const [ly, lm] = ld.split("-").map(Number); age = (y - ly) * 12 + (m - lm); }
    let st = null;
    const closed = !(o.s >= 1);
    if (!closed && isNum(pl) && pl < 0) st = ytd ? "ytd" : !isNum(pl0) ? "first" : pl0 >= 0 ? "new" : pl < pl0 ? "wide" : "narrow";
    return {
      pl, pl0, chg: isNum(pl) && isNum(pl0) ? pl - pl0 : null, gpp: ratio(o.gp, o.s), oxp: ratio(o.ox, o.s),
      be, need: isNum(be) && o.s > 0 ? be / o.s - 1 : null, age, st, closed, loss: !closed && isNum(pl) && pl < 0,
    };
  }
  const ageBand = (a) => (a == null ? "Opening date unknown" : AGE_BANDS.find(([, lo, hi]) => a >= lo && a < hi)[0]);
  const ageTxt = (a) => (a == null ? "—" : a < 12 ? `${a} mo` : `${(a / 12).toFixed(1)} yr`);
  function ageDrillLink(bandName, scope, value, label, cls = "") {
    return `<button type="button" class="age-drill-link ${cls}" data-age-band="${esc(bandName)}" data-age-scope="${scope}" aria-label="${esc(label + ": " + bandName)}" title="${esc(label + ": " + bandName)}">${value}</button>`;
  }
  function openAgeOutlets(bandName, onlyLoss) {
    if (!S.data.pnl) return;
    S.lastFocus = document.activeElement;
    S.ageDrill = { bandName, onlyLoss, outlet: null };
    delete S.tables["age-outlets"];
    drawAgeOutlets();
  }
  function drawAgeOutlets() {
    const context = S.ageDrill;
    if (!context) return;
    const { bandName, onlyLoss } = context;
    const rows = inView().map((o) => ({ o, ...pnlCalc(o) }))
      .filter((x) => !x.closed && ageBand(x.age) === bandName && (!onlyLoss || x.loss))
      .map((x) => ({ ...x, key: x.o.c, name: x.o.nm, sub: `${x.o.c}, ${x.o.dim.rl}, ${x.o.dim.zn}`, s: x.o.s }));
    const periodName = S.pm === "ytd" ? "Year to date" : fmonth(S.pm);
    const basisName = S.pbasis === "after" ? "after financing cost" : "before financing cost";
    $("#drawerTitle").textContent = `${onlyLoss ? "Loss-making outlets" : "Trading outlets"}: ${bandName}`;
    $("#drawerBody").innerHTML = mountTable("age-outlets", {
      title: `${periodName}, ${basisName}`, file: `outlets_by_age_${bandName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${onlyLoss ? "loss" : "all"}_${S.pm}_${S.pbasis}`,
      desc: (n) => `${int(n)} outlets within the selected dashboard filters. Click an outlet for its cost breakdown.`,
      rows, key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "pl", defaultDir: "asc",
      rowAttr: (x) => `data-pnl="${esc(x.key)}" tabindex="0"`,
      cols: [
        nameCol("outlet"),
        { k: "code", label: "Outlet code", val: (x) => x.key, fmt: (x) => esc(x.key), csv: (x) => x.key },
        { k: "age", label: "Age", num: 1, fmt: (x) => ageTxt(x.age), csv: (x) => x.age ?? "" },
        { k: "s", label: "Sales", num: 1, fmt: (x) => bdt(x.s), csv: (x) => Math.round(x.s || 0) },
        { k: "pl", label: "P/L", num: 1, fmt: (x) => `<strong class="${x.pl < 0 ? "down" : "up"}">${bdt(x.pl)}</strong>`, csv: (x) => isNum(x.pl) ? Math.round(x.pl) : "" },
        { k: "status", label: "Status", val: (x) => x.loss ? "Loss-making" : "Profitable", fmt: (x) => chip(x.loss ? LOSS_STATUS[x.st] : { cls: "good", label: "Profitable" }), csv: (x) => x.loss ? LOSS_STATUS[x.st].label : "Profitable" },
      ],
    });
    drawTable("age-outlets");
    showDrawer();
    if (context.outlet) {
      $$("[data-pnl]", $("#drawerBody")).find((row) => row.dataset.pnl === context.outlet)?.focus();
      context.outlet = null;
    }
  }
  function pageLoss() {
    const P = S.data.pnl;
    if (!P) return `<p class="empty">No outlet P&L file is loaded yet. Add one to the Performance folder.</p>`;
    pnlList();
    const ytd = S.pm === "ytd";
    const every = inView().map((o) => ({ o, ...pnlCalc(o) }));
    const closedL = every.filter((x) => x.closed), all = every.filter((x) => !x.closed);
    const losses = all.filter((x) => x.loss);
    const sum = (arr, k) => arr.reduce((t, x) => t + (x[k] || 0), 0);
    const totLoss = sum(losses, "pl"), net = sum(all, "pl");
    const newL = losses.filter((x) => x.st === "new").length, rec = all.filter((x) => !x.loss && isNum(x.pl0) && x.pl0 < 0).length;
    const young = losses.filter((x) => x.age != null && x.age < 12).length;
    const basisLbl = S.pbasis === "after" ? "after financing cost" : "before financing cost";
    const periodName = ytd ? `year to date (${P.months.length} months)` : fmonth(S.pm);
    const monthSel = `<select class="sel" data-sel="pm" aria-label="Month">${P.months.map((m) => `<option value="${m}" ${m === S.pm ? "selected" : ""}>${fmonth(m)}</option>`).join("")}${P.months.length > 1 ? `<option value="ytd" ${ytd ? "selected" : ""}>Year to date, ${fmonth(P.months[0])} to ${fmonth(P.months[P.months.length - 1])}</option>` : ""}</select>`;
    const basisSeg = seg("pbasis", [["after", "After financing cost"], ["before", "Before financing cost"]], "P&L basis");

    // age bands
    const bands = [...AGE_BANDS.map((b) => b[0]), "Opening date unknown"].map((b) => {
      const inB = all.filter((x) => ageBand(x.age) === b), lB = inB.filter((x) => x.loss);
      return { b, n: inB.length, l: lB.length, loss: sum(lB, "pl") };
    }).filter((x) => x.n);
    const agePanel = `<section class="panel"><div class="panel-head"><div><h2>Loss-making outlets by age</h2><p>New outlets usually lose money while they build up trade. Click a number to see the matching outlets.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Outlet age</th><th class="num">Outlets</th><th class="num">Loss-making</th><th class="num">Share</th><th class="num">Total loss</th></tr></thead><tbody>
      ${bands.map((x) => `<tr><td class="cell-primary">${esc(x.b)}</td><td class="num">${ageDrillLink(x.b, "all", int(x.n), "View all trading outlets")}</td><td class="num">${ageDrillLink(x.b, "loss", int(x.l), "View loss-making outlets")}</td><td class="num">${ageDrillLink(x.b, "loss", pct(x.l / x.n), "View outlets behind the loss-making share")}</td><td class="num down">${ageDrillLink(x.b, "loss", bdt(x.loss), "View outlets contributing to total loss", "down")}</td></tr>`).join("")}
      </tbody></table></div></section>`;

    // by level
    const lvls = LEVELS.filter((l) => l[0] !== "outlet");
    const g = new Map();
    all.forEach((x) => { const k = x.o.dim[S.plevel]; if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
    const grpRows = [...g.entries()].map(([k, xs]) => { const l = xs.filter((x) => x.loss); return { key: k, name: k, sub: `${int(xs.length)} outlets`, n: xs.length, l: l.length, share: l.length / xs.length, loss: sum(l, "pl"), net: sum(xs, "pl"), s: xs.reduce((t, x) => t + (x.o.s || 0), 0) }; });
    const grp = mountTable("loss-grp", {
      title: `Loss by ${lvls.find((l) => l[0] === S.plevel)[1].toLowerCase()}`, file: `loss_by_${S.plevel}_${S.pm}`, pageSize: 25,
      desc: (n) => `${int(n)} rows, P&L ${basisLbl}.`, rows: grpRows, key: (x) => x.key, searchText: (x) => x.name, defaultSort: "loss", defaultDir: "asc",
      tools: `<select class="sel" data-sel="plevel" aria-label="Group by">${lvls.map(([k, t]) => `<option value="${k}" ${S.plevel === k ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`,
      cols: [{ k: "name", label: lvls.find((l) => l[0] === S.plevel)[1], fmt: (x) => `<span class="cell-primary">${esc(x.name)}</span><span class="cell-secondary">${esc(x.sub)}</span>`, csv: (x) => x.name, val: (x) => x.name },
        { k: "l", label: "Loss-making", num: 1, fmt: (x) => int(x.l) }, { k: "share", label: "Share", num: 1, fmt: (x) => pct(x.share), csv: (x) => pcsv(x.share) },
        { k: "loss", label: "Total loss", num: 1, fmt: (x) => `<span class="down">${bdt(x.loss)}</span>`, csv: (x) => Math.round(x.loss) },
        { k: "net", label: "Net outlet P/L", num: 1, fmt: (x) => `<span class="${x.net < 0 ? "down" : "up"}">${bdt(x.net)}</span>`, csv: (x) => Math.round(x.net) },
        { k: "s", label: "Sales", num: 1, fmt: (x) => bdt(x.s), csv: (x) => Math.round(x.s) }],
    });

    // outlet list
    let rows = losses.map((x) => ({ key: x.o.c, name: x.o.nm, sub: `${x.o.c}, ${x.o.dim.rl}, ${x.o.dim.zn}`, ...x, s: x.o.s }));
    if (S.pstat !== "all" && !ytd) rows = rows.filter((x) => x.st === S.pstat);
    const list = mountTable("loss", {
      title: `Loss-making outlets, ${periodName}`, file: `loss_making_outlets_${S.pm}`,
      desc: (n) => `${int(n)} outlets. "Break-even sales" is the sales needed to cover costs at the outlet's current margin. Click a row for the cost breakdown.`,
      rows, key: (x) => x.key, searchText: (x) => `${x.name} ${x.sub}`, defaultSort: "pl", defaultDir: "asc", rowAttr: (x) => `data-pnl="${esc(x.key)}" tabindex="0"`,
      tools: ytd ? "" : seg("pstat", [["all", "All"], ["new", "New loss"], ["wide", "Widening"], ["narrow", "Narrowing"]], "Loss status"),
      cols: [nameCol("outlet"),
        { k: "age", label: "Age", num: 1, fmt: (x) => ageTxt(x.age), csv: (x) => x.age ?? "" },
        { k: "s", label: "Sales", num: 1, fmt: (x) => bdt(x.s), csv: (x) => Math.round(x.s || 0) },
        { k: "gpp", label: "GP margin", num: 1, fmt: (x) => pct(x.gpp), csv: (x) => pcsv(x.gpp) },
        { k: "oxp", label: "Opex to sales", num: 1, fmt: (x) => pct(x.oxp), csv: (x) => pcsv(x.oxp) },
        { k: "pl", label: "P/L", num: 1, fmt: (x) => `<strong class="down">${bdt(x.pl)}</strong>`, csv: (x) => Math.round(x.pl) },
        ...(ytd ? [{ k: "months", label: "Months", num: 1, val: (x) => x.o.months, fmt: (x) => int(x.o.months), csv: (x) => x.o.months }] : []),
        { k: "pl0", label: "P/L last month", num: 1, fmt: (x) => `<span class="${x.pl0 < 0 ? "down" : "up"}">${bdt(x.pl0)}</span>`, csv: (x) => (isNum(x.pl0) ? Math.round(x.pl0) : "") },
        { k: "st", label: "Status", val: (x) => x.st, fmt: (x) => chip(LOSS_STATUS[x.st]), csv: (x) => LOSS_STATUS[x.st].label },
        { k: "need", label: "Break-even sales", num: 1, fmt: (x) => (isNum(x.need) ? `${bdt(x.be)}<span class="cell-secondary">+${pct(x.need, 1)} needed</span>` : '<span class="muted" title="Gross margin plus other income is zero or negative">Not reachable</span>'), csv: (x) => (isNum(x.be) ? Math.round(x.be) : "") }],
    });

    if (ytd) S.tables.loss.spec.cols = S.tables.loss.spec.cols.filter((c) => c.k !== "pl0");
    return `<div class="panel-tools">${monthSel}${basisSeg}</div>
      <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${kpi({ hero: true, label: `Loss-making outlets, ${periodName}`, value: int(losses.length), sub: `${chip({ cls: "bad", label: pct(losses.length / (all.length || 1)) + " of outlets" })}<span>of ${int(all.length)} trading outlets, ${basisLbl}</span>`, foot: `<span>Total loss ${bdt(totLoss)}</span><span>Net outlet P/L ${bdt(net)}</span><span>${int(closedL.length)} closed outlets excluded (P/L ${bdt(sum(closedL, "pl"))})</span>`, accent: "var(--bad)" })}
      ${kpi({ label: "Total loss", value: `<span class="down">${bdt(totLoss)}</span>`, sub: "Sum of loss-making outlets", foot: `<span>Average ${bdt(losses.length ? totLoss / losses.length : null)} per outlet</span>`, accent: "var(--bad)" })}
      ${ytd ? "" : kpi({ label: "New losses", value: int(newL), sub: "Profitable last month", foot: `<span>Widening ${int(losses.filter((x) => x.st === "wide").length)}, narrowing ${int(losses.filter((x) => x.st === "narrow").length)}</span>`, accent: "var(--warn)" })}
      ${ytd ? "" : kpi({ label: "Back to profit", value: `<span class="up">${int(rec)}</span>`, sub: "Loss-making last month", foot: "<span>Profitable this month</span>", accent: "var(--good)" })}
      </div>
      <p class="muted" style="margin:0">${int(young)} of the ${int(losses.length)} loss-making outlets opened less than a year ago.</p>
      ${agePanel}${grp}${list}`;
  }
  const peerCache = {};
  function peerMedians(fmt) {
    const P = S.data.pnl, key = S.pm + "|" + S.pbasis + "|" + fmt;
    if (peerCache[key]) return peerCache[key];
    const list = pnlList().filter((o) => (S.pbasis === "after" ? o.p : o.g) >= 0 && o.s >= 1 && detailFor(o.c) && (!fmt || o.dim.fmt === fmt)).map((o) => ({ o, d: detailFor(o.c) }));
    const med = P.lines.map((_, i) => {
      const v = list.map(({ o, d }) => (d[i] || 0) / o.s).sort((a, b) => a - b);
      return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
    });
    return (peerCache[key] = { med, n: list.length });
  }
  function openPnl(code) {
    const P = S.data.pnl, o = pnlList().find((x) => x.c === code);
    if (!o) return;
    const x = pnlCalc(o);
    const fromAgeList = !!S.ageDrill && !$("#drawer").hidden && !!$("#t-age-outlets", $("#drawerBody"));
    if (fromAgeList) S.ageDrill.outlet = code;
    else { S.ageDrill = null; S.lastFocus = document.activeElement; }
    $("#drawerTitle").textContent = `${o.c} ${o.nm}`;
    const stat = (l, v, sub = "") => `<div class="stat"><small>${l}</small><strong>${v}</strong>${sub ? `<div style="font-size:12px">${sub}</div>` : ""}</div>`;
    const det = detailFor(code);
    let costHtml = '<p class="muted" style="margin:0">No cost breakdown for this outlet in the P&L file.</p>';
    if (det) {
      const fmt = o.dim.fmt !== "Not in outlet master" ? o.dim.fmt : null;
      const peers = peerMedians(fmt);
      const items = P.lines.map((l, i) => ({ l, v: det[i] || 0, sp: o.s > 0 ? (det[i] || 0) / o.s : null, pm: peers.med[i] }))
        .filter((c) => c.v !== 0).sort((a, b) => b.v - a.v);
      costHtml = `<div class="table-wrap" style="max-height:none"><table class="compact"><thead><tr><th>Cost line</th><th class="num">Amount</th><th class="num">% of sales</th><th class="num">Profitable peers</th><th class="num">Difference</th></tr></thead><tbody>
        ${items.map((c) => { const d = isNum(c.sp) && isNum(c.pm) ? c.sp - c.pm : null; return `<tr><td class="cell-primary">${esc(c.l)}</td><td class="num">${bdt(c.v)}</td><td class="num">${pct(c.sp)}</td><td class="num">${pct(c.pm)}</td><td class="num"><span class="${d > 0.0025 ? "down" : d < -0.0025 ? "up" : "flat"}">${isNum(d) ? pp(d) : "—"}</span></td></tr>`; }).join("")}
        </tbody></table></div>
        <p class="muted" style="margin:0;font-size:12px">Peers are the median of ${int(peers.n)} profitable ${fmt ? esc(fmt.toLowerCase()) + " " : ""}outlets. Red lines cost this outlet more than 0.25 pp of sales above its peers.</p>`;
    }
    $("#drawerBody").innerHTML = `
      ${fromAgeList ? '<button type="button" class="btn age-drill-back" data-age-back>Back to outlet list</button>' : ""}
      <div class="stat-grid">
        ${stat(S.pbasis === "after" ? "P/L after financing cost" : "P/L before financing cost", `<span class="${x.pl < 0 ? "down" : "up"}">${bdt(x.pl)}</span>`, x.closed ? chip({ cls: "idle", label: "Closed outlet" }) : x.st ? chip(LOSS_STATUS[x.st]) : chip({ cls: "good", label: "Profitable" }))}
        ${S.pm === "ytd" ? stat("Months in P&L", int(o.months), "Year to date") : stat("P/L last month", bdt(x.pl0), `Change ${bdt(x.chg)}`)}
        ${stat("Sales", bdt(o.s), `${int(o.ff)} customers, bill ${bdt(o.bs)}`)}
        ${stat("GP margin", pct(x.gpp), `Other income ${bdt(o.oi)}`)}
        ${stat("Opex", bdt(o.ox), `${pct(x.oxp)} of sales`)}
        ${stat("Break-even sales", isNum(x.be) ? bdt(x.be) : "Not reachable", isNum(x.need) ? (x.need > 0 ? `+${pct(x.need, 1)} on current sales` : "Already above break-even") : "Margin plus other income is zero or negative")}
      </div>
      <dl class="facts">
        <dt>Regional leader</dt><dd>${esc(o.dim.rl)}</dd><dt>Zonal</dt><dd>${esc(o.dim.zn)}</dd>
        <dt>Format</dt><dd>${esc(o.dim.fmt)}</dd><dt>Size</dt><dd>${o.sft ? int(o.sft) + " sq ft" : "—"}</dd>
        <dt>Opened</dt><dd>${o.ld || o.m?.ld ? fdate(o.ld || o.m.ld) + ` (${ageTxt(x.age)})` : "—"}</dd><dt>Financing cost</dt><dd>${bdt(o.ofc)}</dd>
      </dl>
      <h3 style="font-size:14px">Where the money goes</h3>${costHtml}`;
    if (fromAgeList) $("[data-age-back]", $("#drawerBody")).onclick = drawAgeOutlets;
    showDrawer();
  }

  // ------------------------------------------------------------------ drawer
  function openOutlet(code) {
    const o = rep()?.outlets.find((x) => x.c === code);
    if (!o) return;
    const m = o.m || {}, a = agg([o]);
    S.lastFocus = document.activeElement;
    $("#drawerTitle").textContent = `${o.c} ${o.nm}`;
    const stat = (l, v, s = "") => `<div class="stat"><small>${l}</small><strong>${v}</strong>${s ? `<div style="font-size:12px">${s}</div>` : ""}</div>`;
    const fact = (l, v) => (v ? `<dt>${l}</dt><dd>${v}</dd>` : "");
    $("#drawerBody").innerHTML = `
      <div class="stat-grid">
        ${stat("Achievement", pct(a.ach), `${chip(band(a.ach))} ${bdt(a.a)} of ${bdt(a.t)}`)}
        ${stat("Sales", bdt(a.s), `${delta(a.gy)} vs last year`)}
        ${stat("Sales vs last month", delta(a.gm), `last month ${bdt(a.sm)}`)}
        ${stat("Footfall", int(a.f), `${delta(growth(a.f, a.fy))} vs last year`)}
        ${stat("Average bill value", bdt(a.bk), `${delta(growth(a.bk, a.bky))} vs last year`)}
        ${stat("Gross profit margin", pct(a.gp), `${delta(isNum(a.gp) && isNum(a.gpy) ? a.gp - a.gpy : null, "pp")} vs last year`)}
      </div>
      ${o.m ? "" : '<p class="note">This outlet is not in the latest outlet master (zone distribution), so its region, format and ownership are unknown. Outlets with no sales this period are usually closed.</p>'}
      <dl class="facts">
        ${fact("Regional leader", esc(o.dim.rl))}${fact("Zonal", esc(o.dim.zn) + (m.zc ? ` <a href="tel:${esc(m.zc)}">${esc(m.zc)}</a>` : ""))}
        ${fact("Outlet in-charge", esc(o.oi))}${fact("Format", esc(m.fmt))}${fact("Size", m.sft ? int(m.sft) + " sq ft" : "")}
        ${fact("Opened", m.ld ? fdate(m.ld) : "")}${fact("Ownership", esc(m.own))}${fact("PNP status", esc(m.pnp))}
        ${fact("Area", esc([m.area, m.dis, m.div].filter(Boolean).join(", ")))}${fact("Location type", esc(m.loc))}
        ${fact("Same store", o.ssy ? "Yes, vs last year" : "No")}${fact("Map", m.geo ? `<a href="${esc(m.geo)}" target="_blank" rel="noopener">Open in maps</a>` : "")}
      </dl>`;
    showDrawer();
  }
  function showDrawer() {
    $("#drawer").hidden = false; $("#scrim").hidden = false; document.body.style.overflow = "hidden";
    $("#drawerClose").focus();
  }
  function closeDrawer() {
    if ($("#drawer").hidden) return;
    $("#drawer").hidden = true; document.body.style.overflow = ""; S.ageDrill = null;
    if (!$("#rail").classList.contains("open")) $("#scrim").hidden = true;
    S.lastFocus?.focus?.();
  }
  const closeRail = () => { $("#rail").classList.remove("open"); if ($("#drawer").hidden) $("#scrim").hidden = true; };

  // ------------------------------------------------------------------ render
  function render() {
    renderNav(); renderTop(); renderPills();
    $("#filters").hidden = !FILTER_PAGES.has(S.page);
    if (FILTER_PAGES.has(S.page)) renderFilters();
    const p = S.page;
    const PAGE = { overview: pageOverview, achievement: pageAchievement, growth: pageGrowth, footfall: pageFootfall, ranking: pageRanking, category: pageCategory, loss: pageLoss, performance: pageKPI, dq: pageDQ };
    const html = PAGE[p] ? PAGE[p]() : EMBEDS[p] ? pageEmbed(p) : pageOverview();
    // keep embedded iframes alive when only filters change
    const view = $("#view");
    if (!(EMBEDS[p] && view.dataset.page === p)) view.innerHTML = html;
    view.dataset.page = p;
    Object.keys(S.tables).forEach((id) => $("#t-" + id) && drawTable(id));
    wireDyn(view);
  }

  function route() {
    const h = location.hash.slice(1);
    S.page = TITLES[h] ? h : "overview";
    render();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ boot
  $("#themeBtn").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("opsdash-theme", t); } catch (e) {}
  });
  $("#resetBtn").addEventListener("click", () => { DIMS.forEach(([k]) => S.filters[k].clear()); S.bands.clear(); changed(); });
  $("#menuBtn").addEventListener("click", () => { $("#rail").classList.add("open"); $("#scrim").hidden = false; });
  $("#scrim").addEventListener("click", () => { closeDrawer(); closeRail(); });
  $("#drawerClose").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeRail(); } });
  document.addEventListener("click", (e) => { if (S.openDim && !e.target.closest(".ms")) { S.openDim = null; renderFilters(); } }, true);
  window.addEventListener("hashchange", route);

  (window.__DATA__ ? Promise.resolve(window.__DATA__) : fetch("data/data.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }))
    .then((d) => {
      prep(d);
      S.data = d;
      if (!d.tilldate && d.monthend) S.period = "monthend";
      route();
    })
    .catch((e) => {
      $("#view").innerHTML = `<p class="empty">The data file could not be loaded (${esc(e.message)}). Run the "Refresh data" workflow on GitHub, then reload this page.</p>`;
    });
})();
