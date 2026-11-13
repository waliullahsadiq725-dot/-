"use strict";

/* ---------- مرستندویه ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const TOKEN_KEY = "nul_token";
const THEME_KEY = "nul_theme";

const ICONS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
};

function icon(name) {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return t.content.firstChild;
}

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false));
  return el;
}

const nf = (n) => Number(n).toLocaleString("fa-AF");

// LRI/PDI: د لاتیني واحد (MB) ځای په کیڼ-ښي کرښه کې ثابتوي
const ltr = (s) => "⁦" + s + "⁩";

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return ltr(nf(Math.max(1, Math.round(bytes / 1024))) + " KB");
  if (bytes < 1024 ** 3) return ltr(nf((bytes / 1024 ** 2).toFixed(1)) + " MB");
  return ltr(nf((bytes / 1024 ** 3).toFixed(2)) + " GB");
}

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  try {
    return d.toLocaleDateString("fa-AF-u-ca-persian", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d.toLocaleDateString();
  }
}

const roleLabel = (u) => (u.is_admin ? "مدیر" : u.role === "teacher" ? "استاد" : "محصل");

const SPINES = ["#1e7b5c", "#2f6fb0", "#7a4fb5", "#d98e04", "#c0392b", "#138d9e", "#c2417b", "#7d8f1f", "#4f6b7a", "#8a5a3b", "#3d4fb0", "#6b7b78"];

function spineColor(category) {
  const i = state.meta.categories.indexOf(category);
  return SPINES[(i < 0 ? SPINES.length - 1 : i) % SPINES.length];
}

function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }

function setMsg(el, text, kind) {
  el.textContent = text || "";
  el.className = "msg" + (kind ? " " + kind : "");
}

function toast(text, kind = "ok") {
  const el = h("div", { class: "toast " + kind, text });
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 3600);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  const init = { ...options, headers };
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.json);
  }
  const res = await fetch(path, init);
  if (res.status === 401 && token && !path.endsWith("/login")) {
    setToken(null);
    showAuth();
  }
  if (!res.ok) {
    let detail = "یوه ستونزه رامنځته شوه.";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = "مهرباني وکړئ ټولې خانې سمې ډکې کړئ.";
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res;
}
const getJSON = async (path) => (await api(path)).json();

/* ---------- حالت ---------- */
const state = {
  user: null,
  meta: { categories: [], page_size: 12 },
  view: "files",
  scope: "all",
  q: "",
  category: "",
  sort: "new",
  page: 1,
  stats: null,
};
const FILE_VIEWS = { files: "all", mine: "mine", favorites: "favorites" };

/* ---------- تیاره/روښانه حالت ---------- */
function applyThemeIcon() {
  const dark = document.documentElement.dataset.theme === "dark";
  $("#themeBtn").replaceChildren(icon(dark ? "sun" : "moon"));
}
$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  applyThemeIcon();
});

/* ---------- ننوتل / نوم لیکنه ---------- */
function buildShelf() {
  const heights = [150, 190, 130, 210, 170, 120, 200, 160, 140, 185, 125];
  const shelf = $("#shelf");
  heights.forEach((ht, i) => {
    shelf.append(h("div", { class: "spine" + (i === heights.length - 1 ? " lean" : ""), style: `height:${ht}px;background-color:${SPINES[i % SPINES.length]}` }));
  });
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    $("#loginForm").classList.toggle("hidden", btn.dataset.tab !== "login");
    $("#registerForm").classList.toggle("hidden", btn.dataset.tab !== "register");
    setMsg($("#authMsg"), "");
  });
});

function withBusy(form, fn) {
  return async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try { await fn(form); } finally { btn.disabled = false; }
  };
}

const registerForm = $("#registerForm");
registerForm.addEventListener("submit", withBusy(registerForm, async (form) => {
  try {
    await api("/api/register", { method: "POST", json: Object.fromEntries(new FormData(form)) });
    form.reset();
    $('.tab[data-tab="login"]').click();
    setMsg($("#authMsg"), "اکاونټ جوړ شو. اوس ننوځئ.", "ok");
  } catch (err) { setMsg($("#authMsg"), err.message, "error"); }
}));

const loginForm = $("#loginForm");
loginForm.addEventListener("submit", withBusy(loginForm, async (form) => {
  try {
    const out = await (await api("/api/login", { method: "POST", json: Object.fromEntries(new FormData(form)) })).json();
    setToken(out.token);
    form.reset();
    setMsg($("#authMsg"), "");
    showApp(out.user);
  } catch (err) { setMsg($("#authMsg"), err.message, "error"); }
}));

$("#logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
  setToken(null);
  showAuth();
});

function showAuth() {
  state.user = null;
  $("#authView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
}

function showApp(user) {
  state.user = user;
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#whoName").textContent = user.name;
  $("#whoRole").textContent = roleLabel(user);
  $("#adminNav").classList.toggle("hidden", !user.is_admin);
  go("files");
}

/* ---------- ناوبري ---------- */
const VIEW_TEXT = {
  files: ["ټول فایلونه", "د ټولو کارونکو شریک شوي PDF کتابونه."],
  mine: ["زما فایلونه", "هغه فایلونه چې تاسو اپلوډ کړي دي."],
  favorites: ["خوښې", "هغه فایلونه چې تاسو خوښ کړي دي."],
};

function showView(view) {
  state.view = view;
  if (FILE_VIEWS[view]) state.scope = FILE_VIEWS[view];
  for (const id of ["files", "profile", "admin"]) {
    const on = FILE_VIEWS[view] ? id === "files" : id === view;
    $("#view-" + id).classList.toggle("hidden", !on);
  }
  document.querySelectorAll(".nav-btn").forEach((b) => {
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (FILE_VIEWS[view]) {
    $("#filesTitle").textContent = VIEW_TEXT[view][0];
    $("#filesSub").textContent = VIEW_TEXT[view][1];
    $("#figures").classList.toggle("hidden", view !== "files");
  }
  window.scrollTo({ top: 0 });
}

function go(view) {
  state.q = "";
  state.category = "";
  state.page = 1;
  $("#search").value = "";
  showView(view);
  if (FILE_VIEWS[view]) { renderChips(); loadFiles(); loadStats(); }
  else if (view === "profile") fillProfile();
  else if (view === "admin") loadAdmin();
}

document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));

/* ---------- احصایې او کټګورۍ ---------- */
async function loadStats() {
  try {
    state.stats = await getJSON("/api/stats");
    renderFigures($("#figures"), state.stats);
    renderChips();
  } catch { /* بې ستونزې */ }
}

function renderFigures(list, s) {
  const items = [
    [s.files, "فایلونه"],
    [s.downloads, "ډاونلوډونه"],
    [s.users, "کارونکي"],
    [fmtSize(s.bytes), "ټوله اندازه"],
  ];
  list.replaceChildren(...items.map(([v, label]) => h("li", {}, h("b", { text: typeof v === "number" ? nf(v) : v }), h("span", { text: label }))));
}

function renderChips() {
  const counts = new Map((state.stats?.categories || []).map((c) => [c.name, c.count]));
  const wrap = $("#chips");
  const make = (value, label, dot, count) =>
    h("button", {
      class: "chip", type: "button", "aria-pressed": String(state.category === value),
      onclick: () => { state.category = value; state.page = 1; renderChips(); loadFiles(); },
    }, dot ? h("i", { style: `--dot:${dot}` }) : null, label, count != null && state.scope === "all" ? h("small", { text: nf(count) }) : null);
  wrap.replaceChildren(
    make("", "ټول", null, state.stats?.files),
    ...state.meta.categories.map((c) => make(c, c, spineColor(c), counts.get(c) || 0)),
  );
}

/* ---------- د فایلونو لیست ---------- */
let loadSeq = 0;
async function loadFiles() {
  const seq = ++loadSeq;
  const p = new URLSearchParams({ q: state.q, category: state.category, sort: state.sort, scope: state.scope, page: state.page });
  try {
    const data = await getJSON("/api/files?" + p);
    if (seq !== loadSeq) return;
    renderFiles(data);
  } catch (err) { toast(err.message, "error"); }
}

function emptyState() {
  const searching = state.q || state.category;
  const box = $("#fileEmpty");
  box.replaceChildren();
  if (searching) {
    box.append(h("h3", { text: "هېڅ پایله ونه موندل شوه" }), h("p", { text: "لټون بدل کړئ یا کټګورۍ پاکه کړئ." }));
  } else if (state.scope === "mine") {
    box.append(h("h3", { text: "تاسو لا تر اوسه فایل نه دی اپلوډ کړی" }), h("p", { text: "لومړی PDF اپلوډ کړئ چې نور یې ولولي." }),
      h("button", { class: "btn", onclick: openUpload }, icon("upload"), "PDF اپلوډ کړئ"));
  } else if (state.scope === "favorites") {
    box.append(h("h3", { text: "هېڅ خوښ شوی فایل نشته" }), h("p", { text: "په هر کتاب کې د زړه نخښه وټکوئ چې دلته راشي." }));
  } else {
    box.append(h("h3", { text: "کتابتون لا تش دی" }), h("p", { text: "لومړی فایل تاسو اپلوډ کړئ." }),
      h("button", { class: "btn", onclick: openUpload }, icon("upload"), "PDF اپلوډ کړئ"));
  }
}

function renderFiles(data) {
  const grid = $("#fileGrid");
  grid.replaceChildren(...data.items.map(createBook));
  const empty = data.items.length === 0;
  if (empty) emptyState();
  $("#fileEmpty").classList.toggle("hidden", !empty);
  renderPager(data.page, data.pages);
}

function createBook(f) {
  const favBtn = h("button", { class: "btn-icon fav", type: "button", "aria-pressed": String(f.favorite), "aria-label": "خوښه", title: "خوښه" }, icon("heart"));
  favBtn.addEventListener("click", () => toggleFavorite(f, favBtn));
  const meta = h("div", { class: "book-meta" },
    h("div", { text: `${f.owner_name} (${f.owner_role === "teacher" ? "استاد" : "محصل"})` }),
    h("div", { class: "book-stats" },
      h("span", { text: fmtDate(f.created_at) }),
      h("span", { text: fmtSize(f.size) }),
      h("span", { text: `${nf(f.downloads)} ډاونلوډه` })));
  return h("article", { class: "book" },
    h("div", { class: "book-spine", style: `--spine:${spineColor(f.category)}` }),
    h("div", { class: "book-body" },
      h("span", { class: "book-cat", text: f.category }),
      h("button", { class: "book-title", type: "button", text: f.title, onclick: () => openDetail(f.id) }),
      f.description ? h("p", { class: "book-desc", text: f.description }) : null,
      meta,
      h("div", { class: "book-actions" },
        h("button", { class: "btn btn-soft btn-sm", type: "button", onclick: () => previewFile(f) }, icon("eye"), "کتل"),
        h("button", { class: "btn btn-sm", type: "button", onclick: (e) => downloadFile(f, e.currentTarget) }, icon("download"), "ډاونلوډ"),
        h("span", { class: "grow" }),
        favBtn),
    ));
}

function renderPager(page, pages) {
  const nav = $("#pager");
  nav.replaceChildren();
  if (pages <= 1) return;
  const btn = (label, p, opts = {}) =>
    h("button", { class: "btn btn-soft btn-sm" + (opts.cur ? " cur" : ""), type: "button", disabled: opts.disabled, "aria-current": opts.cur ? "page" : null,
      onclick: () => { state.page = p; loadFiles(); window.scrollTo({ top: 0, behavior: "smooth" }); } }, label);
  nav.append(btn("مخکینۍ", page - 1, { disabled: page <= 1 }));
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p++) nav.append(btn(nf(p), p, { cur: p === page }));
  nav.append(btn("بله", page + 1, { disabled: page >= pages }));
}

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    state.page = 1;
    if (!FILE_VIEWS[state.view]) { showView("files"); renderChips(); }
    loadFiles();
  }, 300);
});

$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; loadFiles(); });

/* ---------- خوښې، ډاونلوډ، کتنه ---------- */
async function toggleFavorite(f, btn) {
  btn.disabled = true;
  try {
    await api(`/api/files/${f.id}/favorite`, { method: f.favorite ? "DELETE" : "PUT" });
    f.favorite = !f.favorite;
    btn.setAttribute("aria-pressed", String(f.favorite));
    if (state.scope === "favorites" && !f.favorite) loadFiles();
  } catch (err) { toast(err.message, "error"); }
  finally { btn.disabled = false; }
}

async function downloadFile(f, btn) {
  if (btn) btn.disabled = true;
  try {
    const blob = await (await api(`/api/files/${f.id}/download`)).blob();
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: f.title + ".pdf" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("ډاونلوډ پیل شو.");
    loadFiles();
  } catch (err) { toast(err.message, "error"); }
  finally { if (btn) btn.disabled = false; }
}

const previewDialog = $("#previewDialog");
let previewUrl = null;
async function previewFile(f) {
  try {
    const blob = await (await api(`/api/files/${f.id}/view`)).blob();
    previewUrl = URL.createObjectURL(blob);
    $("#previewTitle").textContent = f.title;
    $("#previewFrame").src = previewUrl;
    $("#previewTab").href = previewUrl;
    previewDialog.showModal();
  } catch (err) { toast(err.message, "error"); }
}
previewDialog.addEventListener("close", () => {
  $("#previewFrame").removeAttribute("src");
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
});

/* ---------- د فایل جزئیات ---------- */
const detailDialog = $("#detailDialog");
let detailDirty = false;

async function openDetail(id) {
  try {
    const [f, comments] = await Promise.all([getJSON(`/api/files/${id}`), getJSON(`/api/files/${id}/comments`)]);
    detailDirty = false;
    renderDetail(f, comments, false);
    if (!detailDialog.open) detailDialog.showModal();
  } catch (err) { toast(err.message, "error"); }
}

function renderDetail(f, comments, editing) {
  $("#detailTitle").textContent = f.title;
  const body = $("#detailBody");

  const info = [
    ["کټګورۍ", f.category],
    ["اپلوډ کوونکی", `${f.owner_name} (${f.owner_role === "teacher" ? "استاد" : "محصل"})`],
    ["نېټه", fmtDate(f.created_at)],
    ["اندازه", fmtSize(f.size)],
    ["ډاونلوډ", nf(f.downloads)],
    ["کتل", nf(f.views)],
  ].map(([k, v]) => h("div", {}, h("span", { text: k }), v));

  let main;
  if (editing) {
    const form = h("form", { class: "form" },
      h("label", { class: "field" }, h("span", { text: "سرلیک" }), h("input", { name: "title", required: true, minlength: "2", maxlength: "150", value: f.title })),
      h("label", { class: "field" }, h("span", { text: "کټګورۍ" }),
        h("select", { name: "category" }, ...state.meta.categories.map((c) => h("option", { value: c, text: c, selected: c === f.category })))),
      h("label", { class: "field" }, h("span", { text: "توضیح" }), h("textarea", { name: "description", rows: "3", maxlength: "1000", text: f.description })),
      h("div", { class: "row-actions", style: "margin:0" },
        h("button", { class: "btn", type: "submit" }, "بدلونونه خوندي کړه"),
        h("button", { class: "btn btn-soft", type: "button", onclick: () => renderDetail(f, comments, false) }, "لغوه")),
    );
    form.addEventListener("submit", withBusy(form, async () => {
      try {
        const updated = await (await api(`/api/files/${f.id}`, { method: "PATCH", json: Object.fromEntries(new FormData(form)) })).json();
        detailDirty = true;
        toast("بدلونونه خوندي شول.");
        renderDetail(updated, comments, false);
      } catch (err) { toast(err.message, "error"); }
    }));
    main = form;
  } else {
    const favBtn = h("button", { class: "btn btn-soft fav", type: "button", "aria-pressed": String(f.favorite) }, icon("heart"), f.favorite ? "خوښ شوی" : "خوښه");
    favBtn.addEventListener("click", async () => {
      try {
        await api(`/api/files/${f.id}/favorite`, { method: f.favorite ? "DELETE" : "PUT" });
        f.favorite = !f.favorite;
        detailDirty = true;
        renderDetail(f, comments, false);
      } catch (err) { toast(err.message, "error"); }
    });
    main = h("div", {},
      f.description ? h("p", { class: "detail-desc", text: f.description }) : h("p", { class: "muted", text: "توضیح نشته." }),
      h("div", { class: "row-actions" },
        h("button", { class: "btn", type: "button", onclick: () => previewFile(f) }, icon("eye"), "کتل"),
        h("button", { class: "btn btn-soft", type: "button", onclick: (e) => { detailDirty = true; downloadFile(f, e.currentTarget); } }, icon("download"), "ډاونلوډ"),
        favBtn,
        f.can_edit ? h("button", { class: "btn btn-soft", type: "button", onclick: () => renderDetail(f, comments, true) }, icon("edit"), "سمون") : null,
        f.can_edit ? h("button", { class: "btn btn-danger", type: "button", onclick: () => deleteFile(f) }, icon("trash"), "ړنګول") : null),
    );
  }

  const list = comments.length
    ? comments.map((c) => h("div", { class: "comment" },
        h("header", {}, h("span", {}, h("b", { text: c.author_name }), ` (${c.author_role === "teacher" ? "استاد" : "محصل"}) · ${fmtDate(c.created_at)}`),
          c.can_delete ? h("button", { class: "btn-icon", type: "button", "aria-label": "نظر ړنګول", onclick: () => removeComment(f, c.id) }, icon("trash")) : null),
        h("p", { text: c.body })))
    : [h("p", { class: "muted", text: "تر اوسه نظر نشته. لومړی نظر تاسو ولیکئ." })];

  const cform = h("form", { class: "comment-form" },
    h("label", { class: "sr-only", for: "commentBody" }, "نظر"),
    h("textarea", { id: "commentBody", name: "body", rows: "2", required: true, maxlength: "1000", placeholder: "خپل نظر ولیکئ…" }),
    h("button", { class: "btn", type: "submit" }, "نظر ولیکه"));
  cform.addEventListener("submit", withBusy(cform, async () => {
    try {
      await api(`/api/files/${f.id}/comments`, { method: "POST", json: { body: cform.elements.body.value } });
      detailDirty = true;
      renderDetail(f, await getJSON(`/api/files/${f.id}/comments`), false);
    } catch (err) { toast(err.message, "error"); }
  }));

  body.replaceChildren(
    h("div", { class: "detail-meta" }, ...info),
    main,
    h("section", { class: "comments" }, h("h4", { text: `نظرونه (${nf(comments.length)})` }), ...list, cform),
  );
}

async function removeComment(f, commentId) {
  if (!confirm("ایا غواړئ دا نظر ړنګ کړئ؟")) return;
  try {
    await api(`/api/comments/${commentId}`, { method: "DELETE" });
    detailDirty = true;
    renderDetail(f, await getJSON(`/api/files/${f.id}/comments`), false);
  } catch (err) { toast(err.message, "error"); }
}

async function deleteFile(f) {
  if (!confirm(`ایا غواړئ «${f.title}» ړنګ کړئ؟ دا کار بیرته نه کېږي.`)) return;
  try {
    await api(`/api/files/${f.id}`, { method: "DELETE" });
    detailDialog.close();
    toast("فایل ړنګ شو.");
    loadFiles();
    loadStats();
  } catch (err) { toast(err.message, "error"); }
}

detailDialog.addEventListener("close", () => { if (detailDirty) loadFiles(); });

/* ---------- اپلوډ ---------- */
const uploadDialog = $("#uploadDialog");
const uploadForm = $("#uploadForm");
const fileInput = uploadForm.elements.file;
const drop = $("#drop");
const DROP_TEXT = "PDF فایل وټاکئ یا دلته یې راوکاږئ";

function openUpload() {
  uploadForm.reset();
  const cats = state.meta.categories;
  $("#uploadCategory").value = cats[cats.length - 1] || "";
  $("#dropName").textContent = DROP_TEXT;
  $("#progress").classList.add("hidden");
  setMsg($("#uploadMsg"), "");
  uploadDialog.showModal();
}
$("#openUpload").addEventListener("click", openUpload);

function pickFile(file) {
  if (!file) return;
  const maxMb = state.meta.max_upload_mb || 20;
  if (!/\.pdf$/i.test(file.name)) return setMsg($("#uploadMsg"), "یوازې PDF فایل منل کېږي.", "error");
  if (file.size > maxMb * 1024 * 1024) return setMsg($("#uploadMsg"), `فایل له ${maxMb}MB څخه لوی دی.`, "error");
  setMsg($("#uploadMsg"), "");
  $("#dropName").textContent = `${file.name} (${fmtSize(file.size)})`;
  if (!uploadForm.elements.title.value) uploadForm.elements.title.value = file.name.replace(/\.pdf$/i, "").slice(0, 150);
}
fileInput.addEventListener("change", () => pickFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  try { const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; } catch { /* ignore */ }
  pickFile(file);
});

function sendUpload(form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.setRequestHeader("Authorization", "Bearer " + getToken());
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let detail = "اپلوډ ونه شو.";
      try { const j = JSON.parse(xhr.responseText); if (typeof j.detail === "string") detail = j.detail; } catch { /* ignore */ }
      if (xhr.status === 401) { setToken(null); showAuth(); }
      reject(new Error(detail));
    };
    xhr.onerror = () => reject(new Error("د شبکې ستونزه ده. بیا هڅه وکړئ."));
    xhr.send(new FormData(form));
  });
}

uploadForm.addEventListener("submit", withBusy(uploadForm, async () => {
  const file = fileInput.files[0];
  if (!file) return setMsg($("#uploadMsg"), "لومړی PDF فایل وټاکئ.", "error");
  const bar = $("#progress");
  bar.classList.remove("hidden");
  setMsg($("#uploadMsg"), "اپلوډ کېږي…");
  try {
    await sendUpload(uploadForm, (r) => { bar.firstElementChild.style.width = Math.round(r * 100) + "%"; });
    uploadDialog.close();
    toast("فایل په بریالیتوب اپلوډ شو.");
    go("mine");
  } catch (err) {
    setMsg($("#uploadMsg"), err.message, "error");
    bar.classList.add("hidden");
  }
}));

/* ---------- پروفایل ---------- */
function fillProfile() {
  const u = state.user;
  const form = $("#profileForm");
  form.elements.name.value = u.name;
  form.elements.email.value = u.email;
  $("#profileSub").textContent = `د اکاونټ ډول: ${roleLabel(u)}`;
  setMsg($("#profileMsg"), "");
  setMsg($("#passwordMsg"), "");
}

const profileForm = $("#profileForm");
profileForm.addEventListener("submit", withBusy(profileForm, async () => {
  try {
    const u = await (await api("/api/me", { method: "PATCH", json: { name: profileForm.elements.name.value } })).json();
    state.user = u;
    $("#whoName").textContent = u.name;
    setMsg($("#profileMsg"), "بدلونونه خوندي شول.", "ok");
  } catch (err) { setMsg($("#profileMsg"), err.message, "error"); }
}));

const passwordForm = $("#passwordForm");
passwordForm.addEventListener("submit", withBusy(passwordForm, async () => {
  try {
    await api("/api/me/password", { method: "POST", json: Object.fromEntries(new FormData(passwordForm)) });
    passwordForm.reset();
    setMsg($("#passwordMsg"), "پاسورډ بدل شو.", "ok");
  } catch (err) { setMsg($("#passwordMsg"), err.message, "error"); }
}));

/* ---------- مدیریت ---------- */
async function loadAdmin() {
  try {
    const s = await getJSON("/api/stats");
    renderFigures($("#adminFigures"), s);
    const max = Math.max(1, ...s.categories.map((c) => c.count));
    $("#catBars").replaceChildren(...(s.categories.length
      ? s.categories.map((c) => h("div", { class: "bar-row" },
          h("span", { text: c.name }),
          h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: `width:${(c.count / max) * 100}%;--c:${spineColor(c.name)}` })),
          h("b", { text: nf(c.count) })))
      : [h("p", { class: "muted", text: "تر اوسه فایل نشته." })]));
  } catch (err) { toast(err.message, "error"); }
  loadUsers();
}

let userTimer;
$("#userSearch").addEventListener("input", () => { clearTimeout(userTimer); userTimer = setTimeout(loadUsers, 300); });

async function adminPatch(u, body, okText) {
  try {
    await api(`/api/admin/users/${u.id}`, { method: "PATCH", json: body });
    toast(okText);
  } catch (err) { toast(err.message, "error"); }
  loadUsers();
}

async function loadUsers() {
  try {
    const users = await getJSON("/api/admin/users?q=" + encodeURIComponent($("#userSearch").value.trim()));
    const list = $("#userList");
    if (!users.length) return list.replaceChildren(h("p", { class: "muted", text: "کارونکی ونه موندل شو." }));
    list.replaceChildren(...users.map((u) => {
      const self = u.id === state.user.id;
      const roleSel = h("select", { "aria-label": "د اکاونټ ډول", onchange: (e) => adminPatch(u, { role: e.target.value }, "ډول بدل شو.") },
        h("option", { value: "student", text: "محصل", selected: u.role === "student" }),
        h("option", { value: "teacher", text: "استاد", selected: u.role === "teacher" }));
      roleSel.style.padding = "5px 8px";
      return h("div", { class: "user-row" },
        h("div", { class: "user-info" },
          h("b", { text: u.name }), u.is_admin ? h("span", { class: "tag", text: "مدیر" }) : null, !u.is_active ? h("span", { class: "tag off", text: "بند" }) : null,
          h("br"), h("small", { class: "ltr", text: u.email }), h("br"), h("small", { text: `${nf(u.file_count)} فایلونه · ${fmtDate(u.created_at)}` })),
        h("div", { class: "user-actions" },
          roleSel,
          h("button", { class: "btn btn-soft btn-sm", type: "button", disabled: u.locked_admin || self,
            onclick: () => adminPatch(u, { is_admin: !u.is_admin }, u.is_admin ? "د مدیر حق لرې شو." : "مدیر شو.") }, u.is_admin ? "مدیري لرې کړه" : "مدیر یې کړه"),
          h("button", { class: "btn btn-soft btn-sm", type: "button", disabled: u.locked_admin || self,
            onclick: () => adminPatch(u, { is_active: !u.is_active }, u.is_active ? "اکاونټ بند شو." : "اکاونټ فعال شو.") }, u.is_active ? "بند یې کړه" : "فعال یې کړه"),
          h("button", { class: "btn btn-soft btn-sm", type: "button", onclick: () => resetPassword(u) }, "پاسورډ بیا ټاکل"),
          h("button", { class: "btn btn-danger btn-sm", type: "button", disabled: u.locked_admin || self, onclick: () => removeUser(u) }, icon("trash"), "ړنګول")));
    }));
  } catch (err) { toast(err.message, "error"); }
}

async function resetPassword(u) {
  if (!confirm(`د «${u.name}» لپاره نوی لنډمهاله پاسورډ جوړ شي؟ پخوانی پاسورډ به کار ونه کړي.`)) return;
  try {
    const out = await getJSONPost(`/api/admin/users/${u.id}/reset-password`);
    $("#tempWho").textContent = `د ${u.name} (${u.email}) نوی پاسورډ:`;
    $("#tempPass").textContent = out.temporary_password;
    $("#tempDialog").showModal();
  } catch (err) { toast(err.message, "error"); }
}
const getJSONPost = async (path) => (await api(path, { method: "POST" })).json();

async function removeUser(u) {
  if (!confirm(`ایا غواړئ «${u.name}» او ټول فایلونه یې ړنګ کړئ؟ دا کار بیرته نه کېږي.`)) return;
  try {
    await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
    toast("کارونکی ړنګ شو.");
    loadAdmin();
  } catch (err) { toast(err.message, "error"); }
}

/* ---------- ډیالوګ عمومي کنټرول ---------- */
document.querySelectorAll("dialog").forEach((dlg) => {
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
});

/* ---------- پیل ---------- */
(async function init() {
  document.querySelectorAll("[data-icon]").forEach((el) => { el.append(icon(el.dataset.icon)); el.removeAttribute("data-icon"); });
  applyThemeIcon();
  buildShelf();
  try { state.meta = await getJSON("/api/meta"); } catch { /* ډیفالټ */ }
  const sel = $("#uploadCategory");
  sel.replaceChildren(...state.meta.categories.map((c) => h("option", { value: c, text: c })));
  sel.value = state.meta.categories[state.meta.categories.length - 1] || "";
  if (!getToken()) return showAuth();
  try {
    showApp(await getJSON("/api/me"));
  } catch {
    setToken(null);
    showAuth();
  }
})();
