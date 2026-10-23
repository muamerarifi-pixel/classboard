/* Classboard 4 — offline-first teacher companion.
 * Plain script (no modules, no libraries): works from file:// and on Vercel.
 * Data: key/value store in localStorage, each key = { v: value, t: timestamp, d: device }.
 * Sync: your own Vercel project (/api/sync + Postgres), newest-wins per key, works offline-first.
 */
(function () {
  "use strict";

  var VERSION = "5.0.0";
  var CFG = window.CLASSBOARD_CONFIG || {};
  var LS_KV = "cb4.kv";
  var LS_META = "cb4.meta";
  var LS_BK = "cb4.bk";
  var OLD_KEY = "classboard-v3";
  var PLAN_ANCHOR = "2026-09-19"; // spreadsheet "Updated 19 Sep 2026"

  // ——————————————————— Calendar words (Albanian) ———————————————————
  var DAY_FULL = ["e diel", "e hënë", "e martë", "e mërkurë", "e enjte", "e premte", "e shtunë"];
  var DAY_SHORT = ["Die", "Hën", "Mar", "Mër", "Enj", "Pre", "Sht"];
  var MONTHS = ["janar", "shkurt", "mars", "prill", "maj", "qershor", "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor"];
  var MONTHS_S = ["jan", "shk", "mar", "pri", "maj", "qer", "kor", "gus", "sht", "tet", "nën", "dhj"];
  var COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#2563eb", "#d946ef", "#f43f5e", "#ca8a04", "#16a34a", "#92400e", "#475569"]; // new colours only at the end: saved groups keep theirs

  // Books the app knows: edition, CEFR level (with the matching Cambridge exam), last SB page of the course.
  var BOOKS = [
    { name: "Family & Friends Starter", short: "F&F Starter", ed: "2nd ed.", cefr: "Pre-A1", exam: "Starters", end: 77, total: 56, units: 12 },
    { name: "Family & Friends 1", short: "F&F 1", ed: "2nd ed.", cefr: "Pre-A1", exam: "Starters", end: 123, total: 56, units: 15 },
    { name: "Family & Friends 2", short: "F&F 2", ed: "2nd ed.", cefr: "A1", exam: "Movers", end: 123, total: 56, units: 15 },
    { name: "Family & Friends 3", short: "F&F 3", ed: "2nd ed.", cefr: "A1", exam: "Movers", end: 135, total: 56, units: 15 },
    { name: "Family & Friends 4", short: "F&F 4", ed: "2nd ed.", cefr: "A2", exam: "Flyers", total: 72, units: 15 },
    { name: "Family & Friends 5", short: "F&F 5", ed: "2nd ed.", cefr: "A2+", exam: "Flyers", total: 72, units: 15 },
    { name: "Family & Friends 6", short: "F&F 6", ed: "2nd ed.", cefr: "B1", exam: "KET", total: 72, units: 15 },
    { name: "English Plus 1", short: "EP1 · 1st ed.", ed: "1st ed.", cefr: "A1–A2", end: 87, total: 72, units: 9 },
    { name: "English Plus 1 New", short: "EP1 · 2nd ed.", ed: "2nd ed.", cefr: "A1–A2", end: 91, total: 72, units: 9 },
    { name: "English Plus 2", short: "EP2 · 1st ed.", ed: "1st ed.", cefr: "A2", exam: "KET", end: 87, total: 72, units: 9 },
    { name: "English Plus 2 New", short: "EP2 · 2nd ed.", ed: "2nd ed.", cefr: "A2", exam: "KET", end: 87, total: 72, units: 9 },
    { name: "English Plus 3", short: "EP3", cefr: "A2–B1", total: 72, units: 9 },
    { name: "English Plus 4", short: "EP4", cefr: "B2", total: 72, units: 9 },
  ];
  var BOOK_ALIAS = { "Family & Friends 3 New": "Family & Friends 3" };
  function bookInfo(name) {
    var n = BOOK_ALIAS[name] || name;
    for (var i = 0; i < BOOKS.length; i++) if (BOOKS[i].name === n) return BOOKS[i];
    if (/ New$/.test(n)) return bookInfo(n.replace(/ New$/, "")); // a new edition of a book the app knows
    return null;
  }
  function levelOf(g) { var b = bookInfo(g.book); return g.level || (b ? b.cefr : ""); }
  function levelText(g) { var b = bookInfo(g.book), l = levelOf(g); return l ? l + (b && b.exam && !g.level ? " · " + b.exam : "") : ""; }
  function bookText(name) { var b = bookInfo(name); return name ? name.replace(/ New$/, "") + (b && b.ed ? " (" + b.ed + ")" : "") : ""; }
  // Group icons: one per group so the groups are easy to tell apart (changeable in "Ndrysho grupin")
  var ICONS = ["🦁", "🐬", "🐣", "🐼", "🦊", "⚡", "🌍", "🚀", "🦄", "🐢", "🐝", "🦋", "🐙", "🌈", "🌻", "🍎", "🍉", "⚽", "🎨", "🎸", "🎈", "💎", "🔥", "🌙", "⭐", "🍀", "🐧", "🐨"];
  var DEFAULT_ICON = { ff3a: "🦁", ff3b: "🐬", ffs: "🐣", ff1: "🐼", ff2p: "🦊", ep2: "⚡", ep1m: "🌍", ep1n: "🚀" };
  function iconClean(v) { return Array.from(String(v || "").trim()).slice(0, 3).join(""); }
  function usedIcons(exceptId) { var u = {}; data().groups.forEach(function (g) { if (g.id !== exceptId) u[groupIcon(g)] = 1; }); return u; }
  function freeIcon(exceptId) { var u = usedIcons(exceptId); for (var i = 0; i < ICONS.length; i++) if (!u[ICONS[i]]) return ICONS[i]; return ICONS[0]; }
  function groupIcon(g) {
    if (g.icon) return g.icon;
    if (DEFAULT_ICON[g.id]) return DEFAULT_ICON[g.id];
    var taken = {}; // groups without an icon get the first one nobody else uses (stable: by group order)
    data().groups.forEach(function (x) { if (x.icon) taken[x.icon] = 1; else if (DEFAULT_ICON[x.id]) taken[DEFAULT_ICON[x.id]] = 1; });
    var free = ICONS.filter(function (c) { return !taken[c]; }), k = 0;
    data().groups.some(function (x) { if (x.id === g.id) return true; if (!x.icon && !DEFAULT_ICON[x.id]) k++; return false; });
    return free.length ? free[k % free.length] : ICONS[0];
  }
  function gi(g) { return '<span class="gico" aria-hidden="true">' + esc(groupIcon(g)) + "</span>"; }
  function levelChip(g) { var l = levelOf(g); return l ? '<span class="lvl">' + esc(l) + "</span>" : ""; }

  var IDEAS = [
    ["Lojëra", "Bingo, board race, memory, charades, hot seat, “Correct the teacher”."],
    ["Këngë", "Këndoni sërish këngën e unitit. Shtoni lëvizje ose një strofë të re."],
    ["Role-play", "Luani historinë, ose krijoni një dialog të shkurtër në çifte."],
    ["Mini-projekte", "Postera, “My family”, “My favourite day”, mini-libra të prezantuar."],
    ["Të folurit", "Find someone who…, intervista në çifte, përshkruani një foto."],
    ["Përsëritje", "Kuiz i shpejtë për unitet e kaluara, flashcards të përziera."],
    ["Stili Cambridge", "Detyra të thjeshta listening/reading Starters / Movers / Flyers."],
    ["Punëdore + anglisht", "Bëni flashcards ose maska, pastaj prezantojini në anglisht."],
  ];

  // ——————————————————— Seed data (from the spreadsheet, 19 Sep 2026) ———————————————————
  function sl(d, s, e) { return { d: d, s: s, e: e }; }
  var SEED_GROUPS = [
    { id: "ff3a", name: "FF3 (A) Gr.1", short: "FF3 A", book: "Family & Friends 3", total: 56, done: 37, units: 15, perWeek: 2, color: 0, schedule: [sl(2, "18:00", "19:00"), sl(4, "18:00", "19:00")] },
    { id: "ff3b", name: "FF3 (B) Gr.2 New", short: "FF3 B", book: "Family & Friends 3 New", total: 56, done: 5, units: 15, perWeek: 2, color: 1, schedule: [sl(2, "19:00", "20:00"), sl(4, "19:00", "20:00")] },
    { id: "ffs", name: "FFS", short: "FFS", book: "Family & Friends Starter", total: 56, done: 31, units: 12, perWeek: 2, color: 2, schedule: [sl(2, "17:00", "18:00"), sl(4, "17:00", "18:00")] },
    { id: "ff1", name: "FF1", short: "FF1", book: "Family & Friends 1", total: 56, done: 20, units: 15, perWeek: 2, color: 3, schedule: [sl(1, "18:30", "19:30"), sl(3, "18:30", "19:30")] },
    { id: "ff2p", name: "FF2", short: "FF2", book: "Family & Friends 2", total: 56, done: 21, units: 15, perWeek: 2, color: 4, schedule: [sl(3, "17:30", "18:30"), sl(5, "17:30", "18:30")] },
    { id: "ep2", name: "EP2", short: "EP2", book: "English Plus 2 New", total: 72, done: 44, units: 9, perWeek: 2, color: 5, schedule: [sl(1, "17:30", "18:30"), sl(5, "18:30", "19:30")] },
    { id: "ep1m", name: "EP1 (M) First", short: "EP1 M", book: "English Plus 1", total: 72, done: 23, units: 9, perWeek: 2, color: 6, schedule: [sl(2, "20:00", "21:00"), sl(4, "20:00", "21:00")] },
    { id: "ep1n", name: "EP1 2nd edition New", short: "EP1 New", book: "English Plus 1 New", total: 72, done: 4, units: 9, perWeek: 3, color: 7, schedule: [sl(1, "19:30", "20:30"), sl(3, "19:30", "20:30"), sl(5, "19:30", "20:30")] },
  ];
  // School regulation: 3 lessons a week → the level lasts 6 months, 2 a week → 7 months.
  // Start dates of the existing groups (from the spreadsheet); deadlines the school gave (Oct 2026).
  // Editing a group (Ndrysho) saves its own values, which then always win over these.
  var DEFAULT_START = { ff3a: "2026-02-19", ff3b: "2026-09-08", ffs: "2026-03-26", ff1: "2026-04-20", ff2p: "2026-04-24", ep2: "2026-01-28", ep1m: "2026-04-28", ep1n: "2026-09-07" };
  var DEFAULT_DEADLINE = { ep1m: "2027-01-08", ep2: "2026-11-06" };
  // Long breaks before the holiday list in the app begins (the course pauses, so the months don't run)
  var PAST_BREAKS = [{ a: "2026-06-24", b: "2026-08-31", n: "Pushimi veror 2026" }];
  var LONG_BREAK_DAYS = 7;
  // Points for the class marks: ★ = 5, + = 3, − = −2 (stored as "+", "p", "-"; "+" was the old ★)
  var MARKS = { "+": { ic: "★", pts: 5, cls: "star-plus", label: "yll" }, p: { ic: "+", pts: 3, cls: "star-p", label: "plus" }, "-": { ic: "−", pts: -2, cls: "star-minus", label: "minus" } };
  var MARK_NEXT = { "": "+", "+": "p", p: "-", "-": "" };
  var SEED_STUDENTS = {
    ffs: ["Daris Doci", "Robin Krasniqi", "Anaja Reqica", "Nohea Lasi", "Lura Pacolli", "Aria Pacolli", "Ari Pacolli", "Kron Gashi", "Aksa Kabashi", "Alp Kadrin"],
    ff1: ["Roan Kastrati", "Renika Jahiri", "Siar Dudas", "Reis Rama", "Enur Rama", "Teo Gjaravina", "Nisa Prenqi", "Nili Demiri", "Tuan Hajiri"],
    ff2p: ["Leka Hysiqi", "Ufis Ismaili", "Erik Sinani", "Eron Makiqi", "Jusuf Gashi", "Dalmat Hajdari", "Priam Koca", "Lea Hyseni", "Leke Hyseni", "Art Gjemshiti", "Liana Shabani"],
    ff3a: ["Algres Makolli", "Dijar Shehu", "Doa Muqolli", "Elda Rexhepi", "Gerti Brestovci", "Nina Gashi", "Seal Kelani", "Unik Enra", "Anik Vlasaliu", "Noara Dushulaci", "Daris Hoxha", "Dalmat Gllareva", "Rion Dauti", "Dacina Gllareva"],
    ff3b: ["Nina Agaj", "Melek Hajredini", "Hamza Ajredini", "Morea Hajra", "Lorena Dulaj"],
    ep2: ["Hira Gashi", "Diell Selimi", "Siar Kadriolli", "Roi Koliqi", "Diell Spahiu", "Amela Hajdari", "Elma Hasani", "Azmir Plana", "Almira Plana", "Rron Ademaj", "Amra Jamin"],
    ep1m: ["Klea Kabashi", "Buana Hasani", "Sibora Hajra", "Akil Efendija", "Donart Ramabaja", "Sevdau Sinani", "Princ Dushullovci", "Dijar Zeneli", "Blond Berani", "Anes Namoni", "Lora Berani"],
    ep1n: ["Mjacta Vitia", "Sibora Hajra", "Unik Kupina", "Unik Nika", "Kaia Bajrami", "Dua Cala", "Niketa Bajrami", "Elif Meliqi", "Siara Morina", "Luna Salauka"],
  };

  // ——————————————————— Small helpers ———————————————————
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); }
  function now() { return new Date(); }
  function todayStr() { return ymd(now()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function fmtLong(d) { return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  function fmtShort(d) { return d ? d.getDate() + " " + MONTHS_S[d.getMonth()] + " " + d.getFullYear() : "—"; }
  function fmtDayDate(s) { var d = parseYmd(s); return DAY_FULL[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()]; }
  function minutes(hhmm) { var p = String(hhmm || "0:0").split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function uid(prefix) {
    var a = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(a);
    var s = "";
    for (var i = 0; i < a.length; i++) s += (a[i] % 36).toString(36);
    return (prefix || "") + Date.now().toString(36).slice(-5) + s;
  }
  function toArr(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x.filter(Boolean);
    if (typeof x === "object") return Object.keys(x).sort(function (a, b) { return a - b; }).map(function (k) { return x[k]; }).filter(Boolean);
    return [];
  }
  function collator() {
    try { return new Intl.Collator("sq", { sensitivity: "base" }); } catch (e) { return { compare: function (a, b) { return a < b ? -1 : a > b ? 1 : 0; } }; }
  }
  var COLL = collator();
  // ——————————————————— Storage ———————————————————
  function loadLS(k, d) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; }
  }
  var storageWarned = false;
  function saveLS(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) {
      if (!storageWarned) { storageWarned = true; toast("Ruajtja lokale dështoi. Bëni një eksport (Më shumë → Backup)."); }
      return false;
    }
  }

  var kv = loadLS(LS_KV, null);
  var meta = loadLS(LS_META, null) || {};
  if (!meta.dev) meta.dev = uid("d");
  if (!meta.dirty) meta.dirty = {};
  var dataVer = 0;

  var persistTimer = null;
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 120);
  }
  function persistNow() {
    clearTimeout(persistTimer);
    saveLS(LS_KV, kv);
    saveLS(LS_META, meta);
  }
  window.addEventListener("pagehide", persistNow);
  document.addEventListener("visibilitychange", function () { if (document.hidden) persistNow(); });

  function getK(k) { var o = kv[k]; return o && o.v != null ? o.v : undefined; }
  function setK(k, v, silent) {
    var o = kv[k];
    var t = Date.now();
    if (o && o.t >= t) t = o.t + 1;
    kv[k] = { v: v == null ? null : v, t: t, d: meta.dev };
    meta.dirty[k] = 1;
    dataVer++;
    persist();
    Sync.schedulePush();
    if (!silent) render();
  }
  function delK(k, silent) { if (kv[k] && kv[k].v != null) setK(k, null, silent); }
  // Seed writes use tiny timestamps so any real edit (anywhere) always wins.
  function seedK(k, v, t) { if (!kv[k]) kv[k] = { v: v, t: t || 1, d: "seed" }; }

  function seedAll(t) {
    SEED_GROUPS.forEach(function (g, gi) {
      var o = JSON.parse(JSON.stringify(g));
      var id = o.id; delete o.id;
      o.order = gi; o.sb = ""; o.wb = "";
      seedK("g~" + id, o, t);
      (SEED_STUDENTS[id] || []).forEach(function (name, i) {
        seedK("s~" + id + "-" + (i + 1), { g: id, name: name, note: "", order: i }, t);
      });
    });
  }

  // One-time import of data from the previous Classboard version on this device
  function migrateOld() {
    var old = loadLS(OLD_KEY, null);
    if (!old || !Array.isArray(old.groups) || !Array.isArray(old.students)) return false;
    var T = 2; // newer than seed, older than any real edit
    var seedById = {};
    SEED_GROUPS.forEach(function (g) { seedById[g.id] = g; });
    old.groups.forEach(function (og, i) {
      var seed = seedById[og.id];
      var g = {
        name: seed ? seed.name : og.name,
        short: seed ? seed.short : (og.shortName || og.name),
        book: seed ? seed.book : (og.book || ""),
        total: seed ? seed.total : (+og.lessonsNeeded || 56),
        done: seed ? Math.max(seed.done, +og.currentLesson || 0) : (+og.currentLesson || 0),
        units: +og.units || (seed ? seed.units : 15),
        perWeek: seed ? seed.perWeek : (+og.lessonsPerWeek || 2),
        color: seed ? seed.color : (i % COLORS.length),
        order: seed ? SEED_GROUPS.indexOf(seed) : 20 + i,
        sb: og.studentBookPage || "",
        wb: og.workbookPage || "",
        schedule: toArr(og.schedule).map(function (s) { return sl(+s.day, s.start, s.end); }),
      };
      if (!g.schedule.length && seed) g.schedule = seed.schedule;
      kv["g~" + og.id] = { v: g, t: T, d: "migrate" };
    });
    var oldIds = {};
    old.students.forEach(function (st, i) {
      oldIds[st.id] = 1;
      kv["s~" + st.id] = { v: { g: st.groupId, name: st.name, note: st.notes || "", order: i }, t: T, d: "migrate" };
      var att = st.attendance || {};
      Object.keys(att).forEach(function (date) {
        var m = { present: "P", late: "L", absent: "A" }[att[date]];
        if (m && /^\d{4}-\d{2}-\d{2}$/.test(date)) kv["a~" + date + "~" + st.id] = { v: m, t: T, d: "migrate" };
      });
    });
    // Seed students that were removed in the old app stay removed.
    Object.keys(SEED_STUDENTS).forEach(function (gid) {
      SEED_STUDENTS[gid].forEach(function (n, i) {
        var sid = gid + "-" + (i + 1);
        if (!oldIds[sid] && old.groups.some(function (g) { return g.id === gid; })) kv["s~" + sid] = { v: null, t: T, d: "migrate" };
      });
    });
    return true;
  }

  if (!kv) {
    kv = {};
    migrateOld();
    seedAll(1);
    persistNow();
  }

  // Kosovo school calendar 2026–2027 (MASHT, UA nr. 01/2026) — preloaded once; editable in Më shumë → Pushimet
  var MASHT_2026_27 = [
    { a: "2026-10-28", b: "2026-10-30", n: "Pushimi vjeshtor" },
    { a: "2026-11-30", b: "2026-11-30", n: "28 Nëntori — Dita e Flamurit (pushim)" },
    { a: "2026-12-25", b: "2026-12-25", n: "Krishtlindjet" },
    { a: "2026-12-28", b: "2027-01-08", n: "Pushimi dimëror" },
    { a: "2027-02-17", b: "2027-02-17", n: "Dita e Pavarësisë së Kosovës" },
    { a: "2027-03-09", b: "2027-03-09", n: "Fitër Bajrami" },
    { a: "2027-03-29", b: "2027-03-29", n: "Pashkët Katolike" },
    { a: "2027-04-05", b: "2027-04-08", n: "Pushimi pranveror" },
    { a: "2027-04-09", b: "2027-04-09", n: "Dita e Kushtetutës" },
    { a: "2027-05-03", b: "2027-05-03", n: "Dita Ndërkombëtare e Punës" },
    { a: "2027-05-04", b: "2027-05-04", n: "Pashkët Ortodokse" },
    { a: "2027-05-10", b: "2027-05-10", n: "Dita e Evropës" },
    { a: "2027-05-17", b: "2027-05-17", n: "Kurban Bajrami" },
    { a: "2027-06-14", b: "2027-06-14", n: "Dita e Paqes" },
    { a: "2027-06-24", b: "2027-08-31", n: "Pushimi veror" },
  ];
  if (!kv["g~_cfg~holidays"]) kv["g~_cfg~holidays"] = { v: MASHT_2026_27, t: 4, d: "seed" };

  // ——————————————————— Derived data ———————————————————
  var C = null, cVer = -1;
  function normGroup(id, v) {
    var total = Math.max(1, +v.total || 56);
    var schedule = toArr(v.schedule).map(function (s) { return { d: +s.d, s: s.s || "17:00", e: s.e || "18:00" }; })
      .filter(function (s) { return s.d >= 0 && s.d <= 6; })
      .sort(function (a, b) { return a.d - b.d || minutes(a.s) - minutes(b.s); });
    return {
      id: id, raw: v,
      name: v.name || "Grup", short: v.short || v.name || "Grup",
      book: v.book || "", total: total, done: clamp(+v.done || 0, 0, total),
      units: Math.max(1, +v.units || 15), perWeek: Math.max(1, +v.perWeek || schedule.length || 2),
      schedule: schedule, sb: v.sb == null ? "" : String(v.sb), wb: v.wb == null ? "" : String(v.wb),
      // Last SB page of the course: typed by the teacher, otherwise known from the book
      pages: Math.max(0, parseInt(v.pages, 10) || 0) || ((bookInfo(v.book) || {}).end || 0),
      pagesAuto: !(parseInt(v.pages, 10) > 0) && !!(bookInfo(v.book) || {}).end,
      wbPages: Math.max(0, parseInt(v.wbPages, 10) || 0),
      level: String(v.level || ""), icon: iconClean(v.icon),
      hw: v.hw && typeof v.hw === "object" ? { p: String(v.hw.p || ""), d: String(v.hw.d || "") } : null,
      color: COLORS[(+v.color || 0) % COLORS.length], colorIdx: (+v.color || 0) % COLORS.length,
      order: v.order == null ? 99 : +v.order,
      // School regulation (v5): start date, months for the level (0 = from lessons a week), deadline set by the school
      start: isYmd("start" in v ? v.start : DEFAULT_START[id]) ? ("start" in v ? v.start : DEFAULT_START[id]) : "",
      months: Math.max(0, Math.min(36, +v.months || 0)),
      deadline: isYmd("deadline" in v ? v.deadline : DEFAULT_DEADLINE[id]) ? ("deadline" in v ? v.deadline : DEFAULT_DEADLINE[id]) : "",
      testAt: String(v.testAt || ""),
      tests: v.tests && typeof v.tests === "object" ? v.tests : {},
    };
  }
  // Lesson progress and page numbers sync as their own keys (g~id~done, g~id~sb, g~id~wb),
  // so editing pages on one device can never undo a lesson marked on another.
  var GROUP_FIELDS = ["done", "sb", "wb", "hw", "tests"];
  function isYmd(x) { return typeof x === "string" && /^\d{4}-\d\d-\d\d$/.test(x); }
  function effectiveGroup(base, fields) {
    var v = {};
    Object.keys(base.v).forEach(function (k) { v[k] = base.v[k]; });
    if (fields) GROUP_FIELDS.forEach(function (f) {
      var o = fields[f];
      if (o && o.v != null && (o.t >= base.t || !(f in base.v))) v[f] = o.v;
    });
    return v;
  }
  function data() {
    if (cVer === dataVer && C) return C;
    C = { groups: [], gById: {}, students: [], sById: {}, byGroup: {}, att: {}, hw: {}, star: {}, logs: {}, pg: {} };
    var gBase = {}, gField = {};
    Object.keys(kv).forEach(function (k) {
      var o = kv[k];
      if (!o || o.v == null) return;
      var p = k.split("~");
      switch (p[0]) {
        case "g":
          if (p[2] === "pg") (C.pg[p[1]] || (C.pg[p[1]] = [])).push({ date: p[3], slot: p[4], f: o.v.f, t: o.v.t, w: o.v.w || "" });
          else if (p[2]) (gField[p[1]] || (gField[p[1]] = {}))[p[2]] = o; // separately-synced field (done / sb / wb)
          else gBase[p[1]] = o;
          break;
        case "s": C.students.push({ id: p[1], g: o.v.g, name: o.v.name || "", note: o.v.note || "", order: o.v.order == null ? 999 : +o.v.order, raw: o.v }); break;
        case "a": (C.att[p[1]] || (C.att[p[1]] = {}))[p[2]] = o.v; break;
        case "h": (C.hw[p[1]] || (C.hw[p[1]] = {}))[p[2]] = o.v; break;
        case "p": (C.star[p[1]] || (C.star[p[1]] = {}))[p[2]] = o.v; break;
        case "l": (C.logs[p[1] + "~" + p[2]] || (C.logs[p[1] + "~" + p[2]] = {}))[p[3]] = o.v; break;
      }
    });
    Object.keys(gBase).forEach(function (id) {
      var g = normGroup(id, effectiveGroup(gBase[id], gField[id]));
      C.groups.push(g); C.gById[g.id] = g;
    });
    C.groups.sort(function (a, b) { return a.order - b.order || COLL.compare(a.name, b.name); });
    C.students.forEach(function (s) {
      if (!C.gById[s.g]) return;
      C.sById[s.id] = s;
      (C.byGroup[s.g] || (C.byGroup[s.g] = [])).push(s);
    });
    Object.keys(C.byGroup).forEach(function (gid) {
      C.byGroup[gid].sort(function (a, b) { return a.order - b.order || COLL.compare(a.name, b.name); });
    });
    cVer = dataVer;
    return C;
  }
  function studentsOf(gid) { return data().byGroup[gid] || []; }
  function slotKey(s) { return String(s.s).replace(":", ""); }
  function loggedSlot(gid, date, s) { var l = data().logs[gid + "~" + date]; return l ? l[slotKey(s)] : undefined; }

  function unitOf(g, lessonNo) {
    var per = g.total / g.units;
    return clamp(Math.ceil(lessonNo / per) || 1, 1, g.units);
  }
  function lessonsPerWeek(g) { return g.schedule.length || g.perWeek || 2; }
  function lastNum(v) { var m = String(v == null ? "" : v).match(/\d+/g); return m ? +m[m.length - 1] : null; }
  // Pages per lesson over the last lessons you saved (from "✓ U krye"), or null if there are too few.
  function recentPace(g) {
    var recs = (data().pg[g.id] || []).filter(function (r) { return r.t != null; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot < b.slot ? -1 : 1; }).slice(-8);
    if (recs.length < 3) return null;
    var pages = 0;
    recs.forEach(function (r) { var f = r.f != null ? +r.f : +r.t; pages += Math.max(0, +r.t - f + 1); });
    return { ppl: pages / recs.length, n: recs.length };
  }
  // Progress by Student's Book pages (when the course's last page and the current page are known).
  function pageInfo(g) {
    var cur = lastNum(g.sb);
    if (!g.pages || cur == null) return null;
    cur = clamp(cur, 0, g.pages);
    var planned = g.pages / g.total;                       // pages per lesson in the plan
    var rp = recentPace(g);
    var seen = rp ? rp.ppl : g.done >= 4 && cur > 0 ? cur / g.done : 0;  // pages per lesson you actually cover
    var ppl = seen >= planned * 0.3 && seen <= planned * 3 ? seen : planned;
    var left = g.pages - cur;
    var lessonsLeft = Math.max(0, g.total - g.done);
    var tg = targetInfo(g), byDeadline = !!(tg && tg.slots < lessonsLeft);
    if (byDeadline) lessonsLeft = tg.slots; // the school's deadline comes before the planned number of lessons
    var need = left <= 0 ? 0 : lessonsLeft > 0 ? left / lessonsLeft : left;
    return { cur: cur, total: g.pages, left: left, pct: Math.round(cur / g.pages * 100), ppl: ppl, observed: ppl === seen, recent: !!rp,
      rem: left <= 0 ? 0 : Math.max(1, Math.ceil(left / ppl - 0.05)),
      lessonsLeft: lessonsLeft, planned: planned, byDeadline: byDeadline, tg: tg,
      // pages you need per lesson to finish the book in the planned number of lessons
      need: need };
  }
  // Where the class is in the book: the contents row of the next page to teach
  function unitAt(g, page) { var u = unitsFor(g.book, page, page); return u.length ? u[0] : null; }
  function nextUnit(g) { var c = lastNum(g.sb); return c == null ? null : unitAt(g, c + 1); }
  function r1(x) { return Math.round(x * 10) / 10; }
  // Today's target pages: from the page after where you stopped, enough to stay on the plan
  // Pages for the next lesson: what the plan needs, but never less than your usual pace
  function lessonPages(pi) { return Math.max(pi.need, pi.observed ? pi.ppl : 0); }
  function todayTarget(pi) {
    if (!pi || pi.left <= 0) return null;
    var n = Math.max(1, Math.round(lessonPages(pi)));
    var a = pi.cur + 1, b = Math.min(pi.total, pi.cur + n);
    return { a: a, b: b, n: b - a + 1, need: pi.need };
  }
  function targetText(pi) {
    var t = todayTarget(pi);
    if (!t) return "";
    return "🎯 Sot: <b>SB f. " + (t.b > t.a ? t.a + "–" + t.b : t.a) + "</b> (≈ " + r1(t.need) + " faqe/mësim)";
  }
  function paceNote(pi) {
    if (!pi || pi.left <= 0 || !pi.observed) return "";
    if (!pi.lessonsLeft) return '<p class="pace-warn">⚠️ ' + (pi.tg && pi.tg.past ? "Afati (" + esc(fmtShort(pi.tg.date)) + ") kaloi" : "Mësimet e planifikuara mbaruan") + ", por mbeten " + pi.left + " faqe (≈ " + pi.rem + " mësime me ritmin tuaj).</p>";
    var inN = pi.byDeadline ? pi.lessonsLeft + " mësimet deri në afat (" + esc(fmtShort(pi.tg.date)) + ")" : pi.lessonsLeft + " mësimet e mbetura";
    if (pi.ppl < pi.need * 0.9) return '<p class="pace-warn">⚠️ Ritmi juaj' + (pi.recent ? " (mësimet e fundit)" : "") + ": " + r1(pi.ppl) + " faqe/mësim — duhen " + r1(pi.need) + " për ta mbaruar librin në " + inN + ".</p>";
    if (pi.ppl > pi.need * 1.15) return '<p class="pace-good">✅ Jeni përpara planit: ' + r1(pi.ppl) + " faqe/mësim (mjaftojnë " + r1(pi.need) + "). Keni kohë për aktivitete.</p>";
    return '<p class="pace-good">✅ Ritmi juaj (' + r1(pi.ppl) + " faqe/mësim) përputhet me planin.</p>";
  }
  // ——— Holidays (synced as g~_cfg~holidays: [{a:"YYYY-MM-DD", b:"YYYY-MM-DD", n:"name"}]) ———
  function holidays() {
    var v = getK("g~_cfg~holidays");
    return (Array.isArray(v) ? v : []).filter(function (h) { return h && /^\d{4}-\d\d-\d\d$/.test(h.a); })
      .map(function (h) { return { a: h.a, b: h.b && h.b >= h.a ? h.b : h.a, n: String(h.n || "Pushim") }; })
      .sort(function (x, y) { return x.a < y.a ? -1 : 1; });
  }
  var holCache = null, holVer = -1;
  function holidayOn(date) {
    if (holVer !== dataVer) { holCache = holidays(); holVer = dataVer; }
    for (var i = 0; i < holCache.length; i++) if (date >= holCache[i].a && date <= holCache[i].b) return holCache[i];
    return null;
  }
  // ——— Workbook pages ———
  function wbInfo(g) {
    var cur = lastNum(g.wb);
    if (!g.wbPages || cur == null) return null;
    cur = clamp(cur, 0, g.wbPages);
    var left = g.wbPages - cur, ll = Math.max(1, g.total - g.done);
    return { cur: cur, total: g.wbPages, left: left, pct: Math.round(cur / g.wbPages * 100), need: left <= 0 ? 0 : left / ll };
  }
  function rangeText(a, b) { return b > a ? a + "–" + b : String(a); }
  // ——— Exact Workbook pages for each Student's Book page ———
  // F&F: the WB follows the Class Book page by page (F&F 3 has no WB pages for the "Extensive reading" spreads).
  // English Plus: each SB unit (10 pages) has an 8-page WB unit; lesson → WB page as in the Teacher's Book "More practice".
  var EP_ORDER = {
    1: [[0], [0], [4], [1], [2], [3], [], [5], [6, 7], [6, 7]],      // 1st ed.: Vocab(2 f.), Reading, Lang. focus, Vocab & listening, Lang. focus, Speaking, Writing, Review, Exam
    2: [[0], [4], [1], [2], [3], [7], [5], [6, 7], [6, 7], [6, 7]],  // 2nd ed.: Vocab, Reading, Lang. focus, Vocab & listening, Lang. focus, Speaking, Writing, Review…
  };
  var WB_MAP = {
    "Family & Friends Starter": { ff: [[1, 77, 0]] },
    "Family & Friends 1": { ff: [[1, 123, 0]] },
    "Family & Friends 2": { ff: [[1, 123, 0]] },
    "Family & Friends 3": { ff: [[1, 29, 0], [32, 53, -2], [56, 77, -4], [80, 101, -6], [104, 125, -8], [130, 135, -12]] },
    "English Plus 1": { ep: 1, st: 4, sb: 8, wb: 8 },
    "English Plus 1 New": { ep: 2, st: 4, sb: 12, wb: 12 },
    "English Plus 2": { ep: 1, st: 4, sb: 8, wb: 8 },
    "English Plus 2 New": { ep: 2, st: 4, sb: 8, wb: 8 },
  };
  function wbMapOf(book) { return WB_MAP[BOOK_ALIAS[book] || book] || null; }
  function wbOfPage(m, p) { // -> { u: unit, w: [WB pages] }
    if (m.ff) {
      for (var i = 0; i < m.ff.length; i++) if (p >= m.ff[i][0] && p <= m.ff[i][1]) return { u: "ff", w: [p + m.ff[i][2]] };
      return { u: "ff", w: [] };
    }
    if (p < m.sb) return { u: "s", w: p >= m.st ? [p] : [] };
    var k = Math.floor((p - m.sb) / 10);
    if (k > 7) return { u: "x", w: [] };
    return { u: k, w: EP_ORDER[m.ep][(p - m.sb) % 10].map(function (o) { return m.wb + 8 * k + o; }) };
  }
  // WB pages for SB pages a..b (skips WB pages already given for earlier pages of the same unit); null = book not mapped
  function wbPagesFor(book, a, b) {
    var m = wbMapOf(book);
    if (!m || a == null || b == null || b < a) return null;
    var seen = {}, out = [], u0 = wbOfPage(m, a).u, p;
    for (p = Math.max(1, a - 9); p < a; p++) { var r = wbOfPage(m, p); if (r.u === u0) r.w.forEach(function (w) { seen[w] = 1; }); }
    for (p = a; p <= b; p++) wbOfPage(m, p).w.forEach(function (w) { if (!seen[w]) { seen[w] = 1; out.push(w); } });
    return out.sort(function (x, y) { return x - y; });
  }
  function pagesText(arr) { // [12,13,16] -> "12-13, 16"
    var out = [], i = 0;
    while (i < arr.length) { var j = i; while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++; out.push(j > i ? arr[i] + "-" + arr[j] : String(arr[i])); i = j + 1; }
    return out.join(", ");
  }
  // Homework suggestion: the Workbook pages that go with the SB pages taught today.
  // Exact pages for the books the app knows; otherwise from how far the WB is compared with the SB.
  function wbSuggest(g, sbTo, sbFrom) {
    var s = sbFrom != null ? sbFrom - 1 : lastNum(g.sb);
    if (sbTo != null && s != null && sbTo > s) {
      var ex = wbPagesFor(g.book, s + 1, sbTo);
      if (ex) return pagesText(ex);
    }
    var c = lastNum(g.wb);
    if (c == null) return "";
    var wi = wbInfo(g);
    if (wi && wi.left <= 0) return "";
    var b;
    if (sbTo != null && s && s > 0 && sbTo > s) {
      var ratio = c / s;
      b = Math.round(sbTo * ratio);
      b = clamp(b, c + 1, c + 4);
    } else {
      var n = wi ? Math.max(1, Math.round(wi.need)) : 1;
      b = c + n;
    }
    if (wi) b = Math.min(wi.total, b);
    return b > c + 1 ? (c + 1) + "-" + b : String(c + 1);
  }
  function sbSuggest(g) {
    var t = todayTarget(pageInfo(g));
    if (t) return String(t.b);
    var c = lastNum(g.sb);
    return c == null ? "" : String(c + 1);
  }
  // Homework set last lesson that still has to be checked (before `date`)
  function hwPending(g, date) { return g.hw && g.hw.p && g.hw.d && g.hw.d < date ? g.hw.p : ""; }
  function hwStreaks() { // missed homework in a row per student, most recent first
    var hw = data().hw, out = {}, stop = {};
    Object.keys(hw).sort().reverse().forEach(function (d) {
      Object.keys(hw[d]).forEach(function (sid) {
        if (stop[sid]) return;
        if (hw[d][sid] === "N") out[sid] = (out[sid] || 0) + 1; else stop[sid] = 1;
      });
    });
    return out;
  }

  function forecast(g) {
    var pi = pageInfo(g);
    var rem = pi ? pi.rem : Math.max(0, g.total - g.done);
    var per = lessonsPerWeek(g);
    var weeks = Math.ceil(rem / per);
    var out = { rem: rem, per: per, weeks: weeks, date: null, pace: "done", paceLabel: "Përfunduar", pct: pi ? pi.pct : Math.round(g.done / g.total * 100), pi: pi, tg: targetInfo(g), late: false };
    if (rem <= 0) return out;
    if (g.schedule.length) {
      var d = now(); d.setHours(12, 0, 0, 0);
      var left = rem, today = ymd(d);
      for (var i = 0; i < 1200 && left > 0; i++) {
        var dow = d.getDay(), ds = ymd(d);
        if (!holidayOn(ds)) for (var j = 0; j < g.schedule.length && left > 0; j++) {
          var s = g.schedule[j];
          if (s.d !== dow) continue;
          if (ds === today && loggedSlot(g.id, ds, s) != null) continue;
          left--;
          if (left === 0) out.date = new Date(d.getTime());
        }
        d = addDays(d, 1);
      }
    } else {
      out.date = addDays(now(), weeks * 7);
    }
    out.late = !!(out.tg && out.date && ymd(out.date) > ymd(out.tg.date));
    // With pages: compare the pages you need per lesson with the plan's pages per lesson
    if (pi && pi.left > 0) {
      // your pace (or the plan's, if there is too little history) against the pages you still need per lesson
      var r = pi.lessonsLeft ? (pi.observed ? pi.ppl : pi.planned) / pi.need : 0;
      if (r < 0.9) { out.pace = "speed"; out.paceLabel = "Prapa planit"; }
      else if (r > 1.15) { out.pace = "done"; out.paceLabel = "Përpara planit"; }
      else { out.pace = "ease"; out.paceLabel = "Në plan"; }
      return out;
    }
    // Without pages: against the deadline if there is one, otherwise the spreadsheet's thresholds
    if (out.tg) { if (out.late) { out.pace = "speed"; out.paceLabel = "Prapa afatit"; } else { out.pace = "ease"; out.paceLabel = "Në afat"; } return out; }
    if (weeks >= 23) { out.pace = "speed"; out.paceLabel = "Përshpejto"; }
    else if (weeks <= 13) { out.pace = "ease"; out.paceLabel = "Normal"; }
    else { out.pace = "keep"; out.paceLabel = "Mbaj ritmin"; }
    return out;
  }


  // ——— School regulation: how long a level lasts (v5) ———
  // 3 lessons a week → 6 months, 2 a week → 7 months, counted from the group's start date.
  // Long breaks (summer, winter — 7+ days) don't count, so the deadline moves past them.
  // A deadline the school gave (Ndrysho → Afati) always wins.
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 864e5); }
  function addMonthsYmd(s, m) {
    var d = parseYmd(s), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + m);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate()));
    return d;
  }
  function longBreaks() {
    var hs = holidays();
    var past = PAST_BREAKS.filter(function (pb) { return !hs.some(function (h) { return h.a <= pb.b && h.b >= pb.a; }); });
    return hs.concat(past).filter(function (h) { return daysBetween(h.a, h.b) + 1 >= LONG_BREAK_DAYS; });
  }
  function regMonths(g) { return g.months || (lessonsPerWeek(g) >= 3 ? 6 : 7); }
  function regEndOf(start, months) {
    if (!isYmd(start)) return null;
    var br = longBreaks(), base = addMonthsYmd(start, months), end = base;
    for (var it = 0; it < 8; it++) {
      var e = ymd(end), extra = 0;
      br.forEach(function (h) { var a = h.a > start ? h.a : start, b = h.b < e ? h.b : e; if (b >= a) extra += daysBetween(a, b) + 1; });
      var nx = addDays(base, extra);
      if (ymd(nx) === e) break;
      end = nx;
    }
    return end;
  }
  function regEnd(g) { return regEndOf(g.start, regMonths(g)); }
  // Scheduled lessons from today up to `end` (holidays skipped, today's lessons already marked not counted)
  function slotsUntil(g, end) {
    if (!g.schedule.length || !end) return 0;
    var d = now(); d.setHours(12, 0, 0, 0);
    var today = ymd(d), last = ymd(end), n = 0;
    for (var i = 0; i < 1500; i++) {
      var ds = ymd(d);
      if (ds > last) break;
      if (!holidayOn(ds)) g.schedule.forEach(function (s) { if (s.d === d.getDay() && !(ds === today && loggedSlot(g.id, ds, s) != null)) n++; });
      d = addDays(d, 1);
    }
    return n;
  }
  var tgCache = {}, tgKey = "";
  function targetInfo(g) {
    var key = dataVer + "|" + todayStr();
    if (key !== tgKey) { tgCache = {}; tgKey = key; }
    if (g.id in tgCache) return tgCache[g.id];
    var date = null, src = "";
    if (g.deadline) { date = parseYmd(g.deadline); src = "school"; }
    else if (g.start) { date = regEnd(g); src = "rule"; }
    var out = date ? { date: date, src: src, months: regMonths(g), slots: slotsUntil(g, date), past: ymd(date) < todayStr() } : null;
    tgCache[g.id] = out;
    return out;
  }
  function deadlineSrc(tg, g) {
    if (!tg) return "";
    return tg.src === "school" ? "afat i shkollës" : tg.months + " muaj · " + (lessonsPerWeek(g) >= 3 ? "3" : lessonsPerWeek(g)) + "×/javë";
  }

  // ——— Tests (school regulation, Cambridge School 2021/22 programme table) ———
  // F&F Starter: Summative & Skills tests after units 1, 3, 5, 7, 9 · F&F 1–3: after 3, 6, 9, 12, 15 · F&F 4–6: after 3, 6, 9, 12
  // English Plus: End-of-term test 1 in the middle of the course, test 2 at the end (Standard A; A and B when the class is big)
  // Any other book: type the units in Ndrysho → "Testet pas unitit".
  function maxUnitNo(g) {
    var m = 0;
    contentsOf(g.book).forEach(function (r) { if (/^\d+$/.test(r.u)) m = Math.max(m, +r.u); });
    return m;
  }
  function testRule(g) {
    var custom = (String(g.testAt || "").match(/\d+/g) || []).map(Number).filter(function (x) { return x > 0 && x < 100; });
    if (custom.length) return { kind: "custom", units: custom.sort(function (a, b) { return a - b; }) };
    var b = BOOK_ALIAS[g.book] || g.book || "", m;
    if (/family\s*(&|and)\s*friends\s*starter/i.test(b)) return { kind: "ff", units: [1, 3, 5, 7, 9] };
    if ((m = b.match(/family\s*(&|and)\s*friends\s*(\d)/i))) return { kind: "ff", units: +m[2] <= 3 ? [3, 6, 9, 12, 15] : [3, 6, 9, 12] };
    if (/english\s*plus/i.test(b)) { var last = maxUnitNo(g) || 8; return { kind: "ep", units: [Math.ceil(last / 2), last] }; }
    return null;
  }
  // The SB pages of unit u (to the page before the next numbered unit, so Review / Values pages belong to it)
  function unitSpan(g, u) {
    var rows = contentsOf(g.book), i, from = null, to = null;
    for (i = 0; i < rows.length; i++) if (rows[i].u === String(u)) { from = rows[i].from; break; }
    if (from == null) return null;
    for (var j = i + 1; j < rows.length; j++) if (/^\d+$/.test(rows[j].u) && +rows[j].u > u) { to = rows[j].from - 1; break; }
    if (to == null) to = g.pages || rows[rows.length - 1].to;
    return { from: from, to: Math.min(to, 99998) };
  }
  function testsOf(g) {
    var rule = testRule(g);
    if (!rule) return [];
    var cur = lastNum(g.sb), nStu = studentsOf(g.id).length, per = g.total / Math.max(1, rule.kind === "ep" ? (maxUnitNo(g) || 8) + 1 : g.units);
    var list = rule.units.map(function (u, i) {
      var t = { u: u, i: i, key: String(u), done: g.tests[String(u)] || "" };
      if (rule.kind === "ep") {
        t.title = "End-of-term Test " + (i + 1);
        t.sub = (i === 0 ? "mesi i kursit" : "fundi i kursit") + " · pas Unit " + u;
        t.tip = (nStu > 10 ? "Standard A dhe B (klasë e madhe)" : "Standard A") + " · audio endofterm" + (i + 1) + ".mp3";
      } else if (rule.kind === "ff") {
        t.title = "Summative & Skills Test " + (i + 1);
        t.sub = "pas Unit " + u;
      } else { t.title = "Testi " + (i + 1); t.sub = "pas Unit " + u; }
      var sp = unitSpan(g, u);
      if (sp && cur != null) { t.state = cur >= sp.to ? "due" : cur + 1 >= sp.from ? "soon" : "later"; t.page = sp.to; }
      else { // no contents / no page yet: from the lesson number
        var endL = Math.min(g.total, Math.round((rule.kind === "ep" ? u + 1 : u) * per));
        t.state = g.done >= endL ? "due" : g.done >= endL - Math.ceil(per) ? "soon" : "later"; t.lesson = endL;
      }
      if (t.done) t.state = "done";
      return t;
    });
    // Only the most recent test that's due is "now"; older undone ones are just listed
    var lastDue = -1;
    list.forEach(function (t, i) { if (t.state === "due") lastDue = i; });
    list.forEach(function (t, i) { if (t.state === "due" && i !== lastDue) t.state = "missed"; });
    return list;
  }
  function testNow(g) { return testsOf(g).filter(function (t) { return t.state === "due" || t.state === "soon"; })[0] || null; }
  function testLine(g) {
    var t = testNow(g);
    if (!t) return "";
    if (t.state === "due") return '<div class="test-line due">📝 Koha për testin: <b>' + esc(t.title) + "</b> <span class=\"muted small\">(" + esc(t.sub) + ")</span>" +
      ' <button type="button" class="btn btn-sm btn-soft" data-a="testDone" data-g="' + esc(g.id) + '" data-u="' + esc(t.key) + '">✓ U bë</button></div>';
    return '<div class="test-line">📝 Testi i radhës: <b>' + esc(t.title) + "</b> — " + esc(t.sub) + (t.page ? " (pas SB f. " + t.page + ")" : "") + "</div>";
  }
  function testsCard(g) {
    var list = testsOf(g), rule = testRule(g);
    var h = '<div class="card"><div class="row between"><h2 style="margin:0">📝 Testet</h2><span class="muted small">' + (rule ? (rule.kind === "custom" ? "të caktuara nga ju" : "sipas rregullores") : "") + "</span></div>";
    if (!list.length) return h + '<p class="small muted" style="margin-top:8px">Për këtë libër nuk ka rregull. Shkruani unitet te “✎ Ndrysho” → “Testet pas unitit” (p.sh. 3, 6, 9).</p></div>';
    var LBL = { done: "✓ u bë", due: "📝 tani", missed: "⚠️ pa shënuar", soon: "së shpejti", later: "" };
    h += '<ul class="tests">' + list.map(function (t) {
      return '<li class="t-' + t.state + '"><div class="grow"><b>' + esc(t.title) + "</b><small>" + esc(t.sub) + (t.page ? " · SB f. " + t.page : t.lesson ? " · rreth mësimit " + t.lesson : "") + (t.done ? " · " + esc(fmtShort(parseYmd(t.done))) : "") + (t.tip && t.state !== "done" ? "<br>" + esc(t.tip) : "") + "</small></div>" +
        (LBL[t.state] ? '<span class="chip' + (t.state === "due" ? " chip-now" : t.state === "done" ? " chip-ok" : "") + '">' + LBL[t.state] + "</span>" : "") +
        '<button type="button" class="btn btn-sm ' + (t.done ? "btn-ghost" : "btn-soft") + '" data-a="testDone" data-g="' + esc(g.id) + '" data-u="' + esc(t.key) + '">' + (t.done ? "↺" : "✓") + "</button></li>";
    }).join("") + "</ul>";
    if (rule.kind !== "custom") h += '<p class="muted tiny" style="margin-top:6px">Opsionale (formative): ' + (rule.kind === "ep" ? "Unit Standard Tests pas çdo uniti." : "Unit Tests pas çdo uniti.") + "</p>";
    return h + "</div>";
  }

  // ——— Class marks: ★ 5 · + 3 · − −2 ———
  function studentStats(sid) {
    var D = data(), o = { P: 0, L: 0, A: 0, Y: 0, N: 0, S: 0, Pl: 0, M: 0, pts: 0, last: [] };
    Object.keys(D.att).forEach(function (d) { var a = D.att[d][sid]; if (a === "P") o.P++; else if (a === "L") o.L++; else if (a === "A") o.A++; });
    Object.keys(D.hw).forEach(function (d) { var w = D.hw[d][sid]; if (w === "Y") o.Y++; else if (w === "N") o.N++; });
    Object.keys(D.star).sort().forEach(function (d) {
      var m = MARKS[D.star[d][sid]];
      if (!m) return;
      if (m.pts === 5) o.S++; else if (m.pts === 3) o.Pl++; else o.M++;
      o.pts += m.pts; o.last.push({ d: d, v: D.star[d][sid] });
    });
    var att = o.P + o.L + o.A, hw = o.Y + o.N;
    o.attPct = att ? Math.round((o.P + o.L) / att * 100) : null;
    o.hwPct = hw ? Math.round(o.Y / hw * 100) : null;
    return o;
  }
  function groupStats(gid) { var out = {}; studentsOf(gid).forEach(function (s) { out[s.id] = studentStats(s.id); }); return out; }
  function markBtn(v) { var m = MARKS[v]; return m ? m.ic : "☆"; }
  function marksText(o) { return (o.S || o.Pl || o.M) ? [o.S ? "★" + o.S : "", o.Pl ? "+" + o.Pl : "", o.M ? "−" + o.M : ""].filter(Boolean).join(" ") + " = " + o.pts + " p" : "—"; }

  // ——————————————————— Sync (your Vercel project: /api/sync + Postgres) ———————————————————
  // Local-first: every change is saved on the device immediately, then sent to the server.
  // The server keeps the newest version of each item; devices pull what changed since their cursor.
  var Sync = (function () {
    var S = { status: "local", msg: "", busy: false, busyP: null, again: false, againFull: false, pushTimer: null, pollTimer: null, lastFull: 0, fullSeen: null, lastErr: "" };

    function cfg() { return meta.sync && meta.sync.mode === "vercel" && meta.sync.code ? meta.sync : null; }
    function api() {
      if (CFG.syncApi) return CFG.syncApi;
      if (/^https?:$/.test(location.protocol)) return location.origin + "/api/sync";
      return String(CFG.appUrl || "https://classboard-v4.vercel.app/").replace(/\/+$/, "") + "/api/sync";
    }
    function pendingCount() { return Object.keys(meta.dirty).length; }
    function setStatus(st, msg) { S.status = st; S.msg = msg || ""; paintStatus(); }

    function call(code, since, changes) {
      var opt = { method: changes ? "POST" : "GET", headers: { "x-cb-code": code }, cache: "no-store" };
      if (changes) { opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify({ changes: changes }); }
      return fetch(api() + "?since=" + (since || 0), opt).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j || !j.ok) {
            var e = new Error((j && j.error) || "HTTP " + r.status);
            e.code = (j && j.error) || "http_" + r.status;
            throw e;
          }
          return j;
        });
      });
    }

    function applyRemote(map) {
      var changed = false;
      Object.keys(map || {}).forEach(function (k) {
        var r = map[k];
        if (!r || typeof r.t !== "number") return;
        if (S.fullSeen) S.fullSeen[k] = 1;
        var l = kv[k];
        if (!l || r.t > l.t) {
          kv[k] = { v: r.v === undefined ? null : r.v, t: r.t, d: r.d || "" };
          delete meta.dirty[k];
          changed = true;
        } else if (r.t < l.t) {
          meta.dirty[k] = 1; // this device has something newer: send it again
        }
      });
      if (changed) { dataVer++; render(); }
      return changed;
    }

    function errorText(e) {
      if (e.code === "bad_code") return "Kodi i klasës nuk pranohet";
      if (e.code === "not_configured" || e.code === "no_database") return "Serveri i sinkronizimit s'është gati";
      return navigator.onLine ? "S'u lidh me serverin" : "Pa internet";
    }

    // One round trip: send local changes (if any) and receive everything newer than our cursor.
    function cycle(full) {
      var c = cfg();
      if (!c) { setStatus("local"); return Promise.resolve(); }
      if (S.busy) { S.again = true; if (full) S.againFull = true; return S.busyP; }
      if (!navigator.onLine) { setStatus("pending", "Pa internet"); return Promise.resolve(); }
      S.busy = true;
      if (S.status !== "ok") setStatus("syncing");
      if (full) S.fullSeen = {};
      var since = full ? 0 : Math.max(0, (meta.cursor || 0) - 100); // small overlap = never miss a late write
      var keys = Object.keys(meta.dirty).slice(0, 1500), body = null, sentT = {};
      keys.forEach(function (k) {
        var o = kv[k];
        if (!o) { delete meta.dirty[k]; return; }
        body = body || {};
        body[k] = { v: o.v == null ? null : o.v, t: o.t, d: o.d || "" };
        sentT[k] = o.t;
      });
      S.busyP = call(c.code, since, body).then(function (res) {
        Object.keys(sentT).forEach(function (k) {
          if (S.fullSeen) S.fullSeen[k] = 1;
          if (kv[k] && kv[k].t === sentT[k]) delete meta.dirty[k];
        });
        applyRemote(res.changes);
        meta.cursor = Math.max(full ? 0 : meta.cursor || 0, +res.seq || 0);
        if (res.more) S.again = true;
        else if (S.fullSeen) {
          // After a full download: anything the server doesn't have yet gets uploaded.
          var seen = S.fullSeen; S.fullSeen = null;
          Object.keys(kv).forEach(function (k) { if (!seen[k]) meta.dirty[k] = 1; });
          S.lastFull = Date.now();
        }
        if (pendingCount()) S.again = true;
        meta.lastSync = Date.now();
        S.lastErr = "";
        persist();
        setStatus(pendingCount() ? "pending" : "ok");
      }).catch(function (e) {
        S.fullSeen = null;
        S.lastErr = e.code || e.message;
        S.again = false; S.againFull = false;
        setStatus(e.code === "bad_code" || e.code === "not_configured" || e.code === "no_database" ? "error" : "pending", errorText(e));
      }).then(function () {
        S.busy = false;
        if (S.again) { var f = S.againFull; S.again = false; S.againFull = false; return cycle(f); }
      });
      return S.busyP;
    }

    function loop() {
      clearTimeout(S.pollTimer);
      if (!cfg()) return;
      var delay = S.status === "error" ? 30000 : document.hidden ? 60000 : 4000;
      S.pollTimer = setTimeout(function () {
        if (!document.hidden || pendingCount()) {
          var full = Date.now() - S.lastFull > 30 * 60 * 1000;
          cycle(full).then(loop, loop);
        } else loop();
      }, delay);
    }

    function schedulePush() {
      if (!cfg()) return;
      clearTimeout(S.pushTimer);
      paintStatus();
      S.pushTimer = setTimeout(function () { cycle(false); }, 300);
    }

    function start() {
      if (!cfg()) { setStatus("local"); return; }
      cycle(true).then(loop, loop);
    }
    function test(code) { return call(code, 9007199254740991, null); }
    function connect(code) {
      meta.sync = { mode: "vercel", code: code };
      meta.cursor = 0;
      Object.keys(kv).forEach(function (k) { meta.dirty[k] = 1; });
      persistNow();
      setStatus("syncing");
      return cycle(true).then(function () { loop(); });
    }
    function disconnect() {
      clearTimeout(S.pollTimer);
      meta.sync = null; meta.dirty = {}; meta.cursor = 0;
      persistNow();
      setStatus("local");
    }

    window.addEventListener("online", function () { if (cfg()) cycle(false); });
    window.addEventListener("offline", function () { if (cfg()) setStatus("pending", "Pa internet"); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && cfg()) { cycle(false); loop(); } });

    return { S: S, cfg: cfg, api: api, start: start, connect: connect, disconnect: disconnect, test: test, syncNow: function () { return cycle(true); }, schedulePush: schedulePush, pendingCount: pendingCount };
  })();

  function statusText() {
    var S = Sync.S, n = Sync.pendingCount();
    if (S.status === "local") return "Vetëm në këtë pajisje";
    if (S.status === "syncing") return "Duke sinkronizuar…";
    if (S.status === "ok") return "Sinkronizuar";
    if (S.status === "error") return "Gabim sinkronizimi";
    return (n ? n + " ndryshime në pritje" : "Në pritje") + (S.msg ? " · " + S.msg : "");
  }
  function paintStatus() {
    var pill = $("#sync-pill");
    if (!pill) return;
    var st = Sync.S.status;
    if (st === "ok" && Sync.pendingCount()) st = "pending";
    pill.className = "sync-pill st-" + st;
    var txt = { local: "Lokal", syncing: "Sinkronizim…", ok: "Sinkronizuar", error: "Gabim", pending: "Offline" }[st] || st;
    if (st === "pending" && Sync.pendingCount()) txt = "Në pritje (" + Sync.pendingCount() + ")";
    $("#sync-text").textContent = txt;
    pill.title = statusText();
    var box = $("#sync-status-line");
    if (box) box.textContent = statusText() + (meta.lastSync ? " · e fundit " + timeAgo(meta.lastSync) : "");
  }
  function timeAgo(t) {
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return "tani";
    if (s < 3600) return Math.round(s / 60) + " min më parë";
    var d = new Date(t);
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + " (" + d.getDate() + " " + MONTHS_S[d.getMonth()] + ")";
  }

  function appUrl() {
    if (/^https?:/.test(location.protocol)) return location.origin + location.pathname;
    return CFG.appUrl || "https://classboard-v4.vercel.app/";
  }
  function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function fmtCode(s) { return normCode(s).replace(/(.{4})(?=.)/g, "$1-"); }
  function joinLink() { var c = Sync.cfg(); return appUrl().replace(/#.*$/, "") + "#code=" + (c ? fmtCode(c.code) : ""); }
  function parseCode(text) {
    text = String(text || "").trim();
    var m = text.match(/code=([A-Za-z0-9-]+)/);
    var c = normCode(m ? m[1] : text);
    return c.length >= 8 ? c : "";
  }

  // ——————————————————— UI state & navigation ———————————————————
  var ui = { tab: "today", groupId: null, sheet: null, flash: null };
  var TABS = ["today", "groups", "plan", "more"];

  var ignorePop = false;
  function pushNav(kind) { try { history.pushState({ cb: kind }, ""); } catch (e) { } }
  window.addEventListener("popstate", function () {
    if (ignorePop) { ignorePop = false; return; }
    if ($("#dialog-root").innerHTML) { $("#dialog-root").innerHTML = ""; }
    if (ui.sheet) { commitDone(ui.sheet); ui.sheet = null; render(true); return; }
    if (ui.groupId) { ui.groupId = null; render(true); return; }
  });
  function setTab(t) {
    if (TABS.indexOf(t) < 0) t = "today";
    var hadStack = ui.sheet || ui.groupId;
    commitDone(ui.sheet);
    ui.tab = t; ui.groupId = null; ui.sheet = null;
    try { sessionStorage.setItem("cb.tab", t); } catch (e) { }
    render(true);
    window.scrollTo(0, 0);
    if (hadStack) { try { history.replaceState(null, ""); } catch (e) { } }
  }
  function openGroup(id) { commitDone(ui.sheet); ui.groupId = id; ui.sheet = null; pushNav("group"); render(true); window.scrollTo(0, 0); }
  function closeGroup() {
    ui.groupId = null;
    if (history.state && history.state.cb === "group") { ignorePop = true; history.back(); }
    render(true);
  }
  function openSheet(s) { ui.sheet = s; pushNav("sheet"); render(true); }
  function closeSheet() {
    if (!ui.sheet) return;
    commitDone(ui.sheet);
    var back = ui.sheet.back === "allParents" ? { type: "allParents", mon: ui.sheet.mon } : null;
    ui.sheet = null;
    if (history.state && history.state.cb === "sheet") { ignorePop = true; history.back(); }
    if (back) { ui.sheet = back; pushNav("sheet"); }
    render(true);
  }

  // ——————————————————— Rendering ———————————————————
  var pendingRender = false;
  function isEditing() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") return !/^(button|checkbox|radio|submit|color)$/.test(el.type);
    return false;
  }
  document.addEventListener("focusout", function () {
    setTimeout(function () { if (pendingRender && !isEditing()) render(); }, 60);
  });

  function render(force) {
    if (!force && isEditing()) { pendingRender = true; paintStatus(); return; }
    pendingRender = false;
    var main = $("#main");
    var html;
    if (ui.groupId && data().gById[ui.groupId]) html = viewGroup(data().gById[ui.groupId]);
    else {
      if (ui.groupId) ui.groupId = null;
      html = ({ today: viewToday, groups: viewGroups, plan: viewPlan, more: viewMore })[ui.tab]();
    }
    main.innerHTML = html;
    var sr = $("#sheet-root");
    var inner = ui.sheet ? viewSheet() : "";
    if (!inner) { sr.innerHTML = ""; sr.removeAttribute("data-id"); }
    else {
      var sid = ui.sheet.type + ":" + (ui.sheet.g || ui.sheet.s || "new");
      var sheetEl = $(".sheet", sr);
      if (sheetEl && sr.getAttribute("data-id") === sid) {
        // Same sheet: swap contents only (no re-animation, keep scroll position)
        var body = $(".sheet-body", sheetEl), top = body ? body.scrollTop : 0;
        sheetEl.innerHTML = inner;
        var nb = $(".sheet-body", sheetEl);
        if (nb && top) nb.scrollTop = top;
      } else {
        sr.innerHTML = '<div class="sheet-bg" data-a="sheetBg"><div class="sheet" role="dialog" aria-modal="true">' + inner + "</div></div>";
        sr.setAttribute("data-id", sid);
      }
    }
    $all("#tabbar button").forEach(function (b) { b.classList.toggle("on", !ui.groupId && b.getAttribute("data-tab") === ui.tab); });
    document.body.style.overflow = ui.sheet ? "hidden" : "";
    paintStatus();
    if (ui.focus) {
      var f = $(ui.focus);
      ui.focus = null;
      if (f) { f.focus(); }
    }
  }

  // ——— Today ———
  function todaysSlots(date) {
    var d = parseYmd(date), dow = d.getDay(), out = [];
    data().groups.forEach(function (g) {
      g.schedule.forEach(function (s) { if (s.d === dow) out.push({ g: g, s: s }); });
    });
    out.sort(function (a, b) { return minutes(a.s.s) - minutes(b.s.s); });
    return out;
  }

  function viewToday() {
    var n = now(), date = ymd(n), dow = n.getDay();
    var hol = holidayOn(date);
    var slots = hol ? [] : todaysSlots(date);
    var h = '<div class="stack v-today">';
    if (!Sync.cfg()) h += '<button type="button" class="card sync-warn" data-a="tab" data-tab="more"><b>⚠️ Kjo pajisje nuk sinkronizohet</b><span class="small">Ndryshimet këtu nuk shihen në pajisjet e tjera. Prekni këtu dhe shkruani kodin e klasës.</span></button>';
    h += '<div class="hero"><div class="day">' + esc(DAY_FULL[dow]) + '</div><div class="date">' + esc(fmtLong(n)) + "</div>";
    if (slots.length) {
      var doneN = slots.filter(function (x) { return loggedSlot(x.g.id, date, x.s) != null; }).length;
      h += '<div class="sub">' + slots.length + (slots.length === 1 ? " mësim" : " mësime") + " sot · " + esc(slots[0].s.s) + "–" + esc(slots[slots.length - 1].s.e) +
        (doneN ? ' · <span style="color:var(--ok)">' + doneN + " kryer</span>" : "") + "</div>";
    }
    h += "</div>";

    if (hol) {
      h += '<div class="card empty"><div class="big">🏖️</div><b>' + esc(hol.n) + "</b>Pushim — nuk ka mësime sot" + (hol.b > hol.a ? " (deri më " + esc(fmtShort(parseYmd(hol.b))) + ")" : "") + ".</div>";
      h += '<div class="section-title">Progresi i grupeve</div><div class="card"><div class="mini-list">' + miniProgress() + "</div></div></div>";
      return h;
    }
    if (!slots.length) {
      var weekend = dow === 0 || dow === 6;
      h += '<div class="card empty"><div class="big">' + (weekend ? "🌿" : "☕") + "</div><b>" +
        (weekend ? "Fundjavë — nuk ka mësime" : "Nuk ka mësime sot") + "</b>" +
        (weekend ? "Pushoni! Mësimet e ditës shfaqen këtu të hënën." : "Asnjë grup nuk ka orar për sot.") + "</div>";
      h += '<div class="section-title">Progresi i grupeve</div><div class="card"><div class="mini-list">' + miniProgress() + "</div></div>";
      h += "</div>";
      return h;
    }

    var nowMin = n.getHours() * 60 + n.getMinutes();
    var nextFound = false;
    slots.forEach(function (x) {
      var g = x.g, s = x.s;
      var logged = loggedSlot(g.id, date, s);
      var st = minutes(s.s), en = minutes(s.e);
      var state = nowMin >= st && nowMin < en ? "now" : nowMin >= en ? "past" : "future";
      var chip = "";
      if (logged != null) chip = '<span class="chip chip-ok">✓ Kryer</span>';
      else if (state === "now") chip = '<span class="chip chip-now">Tani</span>';
      else if (state === "future" && !nextFound) { nextFound = true; var mins = st - nowMin; chip = '<span class="chip">' + (mins <= 90 ? "pas " + mins + " min" : "Më pas") + "</span>"; }
      else if (state === "past") chip = '<span class="chip">Mbaroi</span>';
      var lessonNo = logged != null ? logged : Math.min(g.done + 1, g.total);
      var complete = g.done >= g.total && logged == null;
      var nStu = studentsOf(g.id).length;
      var attToday = data().att[date] || {};
      var marked = studentsOf(g.id).filter(function (st) { return attToday[st.id]; }).length;
      h += '<article class="lesson' + (state === "now" ? " is-now" : "") + (state === "past" ? " is-past" : "") + (logged != null ? " is-done" : "") + '" style="--gc:' + g.color + '">' +
        '<div class="lesson-time"><b>' + esc(s.s) + "</b><span>" + esc(s.e) + "</span></div>" +
        '<div class="lesson-body">' +
        '<div class="lesson-top"><h3>' + gi(g) + esc(g.short) + "</h3>" + chip + "</div>" +
        '<div class="lesson-meta">' + esc(bookText(g.book)) + " " + levelChip(g) + "</div>" +
        lessonPlanHtml(g, date, logged, lessonNo, complete) +
        '<div class="lesson-actions">' +
        (logged != null
          ? '<button type="button" class="btn btn-soft" data-a="editDone" data-g="' + esc(g.id) + '" data-slot="' + esc(slotKey(s)) + '">✎ Ndrysho</button>'
          : '<button type="button" class="btn btn-ok" data-a="markDone" data-g="' + esc(g.id) + '" data-slot="' + esc(slotKey(s)) + '"' + (complete ? " disabled" : "") + ">✓ U krye</button>") +
        '<button type="button" class="btn" data-a="openClass" data-g="' + esc(g.id) + '" data-date="' + date + '">👥 ' + (nStu ? (marked ? marked + "/" + nStu + " shënuar" : nStu + " nxënës") : "Prezenca") + "</button>" +
        '<button type="button" class="icon-btn" data-a="openGroup" data-g="' + esc(g.id) + '" aria-label="Hap grupin"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>' +
        "</div></div></article>";
    });
    if (dow === 5 || dow === 6) h += '<div class="card ap-cta"><b>💬 Raportet e javës për prindërit</b><span class="small muted">Kur t\'i mbaroni të gjitha grupet: një listë me të gjitha raportet, gati për Viber.</span><button type="button" class="btn btn-primary btn-sm" data-a="allParents">Hap raportet</button></div>';
    h += "</div>";
    return h;
  }

  // What to do in this lesson: the unit, the SB pages, the homework to check and to give
  function plannedLesson(g) {
    var pi = pageInfo(g), t = todayTarget(pi);
    var sbTo = t ? t.b : null;
    return { pi: pi, t: t, sb: sbTo != null ? String(sbTo) : sbSuggest(g), hw: wbSuggest(g, sbTo) };
  }
  function lessonPlanHtml(g, date, logged, lessonNo, complete) {
    if (complete) return '<div class="lesson-next">Libri përfundoi 🎉 · Activity Time</div>';
    var pl = plannedLesson(g), h = "";
    if (logged == null) {
      var u = pl.t ? unitsFor(g.book, pl.t.a, pl.t.b) : nextUnit(g) ? [nextUnit(g)] : [];
      if (u.length) h += '<div class="lesson-unit">📖 ' + u.map(function (x) { return esc(unitLabel(x)); }).join(" → ") + "</div>";
      if (pl.t) h += '<div class="target-line">🎯 Sot: <b>SB f. ' + rangeText(pl.t.a, pl.t.b) + "</b>" + (pl.hw ? " · 📓 DSh: WB f. " + esc(pl.hw) : "") + "</div>";
      else if (lastNum(g.sb) == null) h += '<div class="plan-line muted small">Shtypni “✓ U krye” dhe shkruani faqen ku ndaluat — pastaj app-i i llogarit vetë faqet.</div>';
      if (hwPending(g, date)) h += '<div class="plan-line">✔️ Kontrollo detyrën: <b>WB f. ' + esc(hwPending(g, date)) + "</b></div>";
      h += testLine(g);
    } else {
      var rec = (data().pg[g.id] || []).filter(function (r) { return r.date === date; })[0];
      h += '<div class="lesson-next">Mësimi ' + logged + " u krye" + (rec && rec.t != null ? " · SB deri f. " + rec.t : "") + "</div>";
      if (g.hw && g.hw.d === date) h += '<div class="plan-line">📓 Detyrë për herën tjetër: <b>' + (g.hw.p ? "WB f. " + esc(g.hw.p) : "pa detyrë") + "</b></div>";
    }
    var f = forecast(g);
    if (f.pi) h += '<div class="mini-prog"><span class="bar pb-' + f.pace + '"><i style="width:' + f.pi.pct + '%"></i></span><span class="tiny muted">SB f. ' + f.pi.cur + "/" + f.pi.total + " · " + f.pi.pct + '% · <span class="pace-t pace-' + f.pace + '">' + esc(f.paceLabel) + "</span></span></div>";
    else h += '<div class="lesson-next">Mësimi ' + lessonNo + " / " + g.total + "</div>";
    return h;
  }

  function miniProgress() {
    var gs = data().groups;
    if (!gs.length) return '<p class="muted">Nuk ka grupe ende.</p>';
    return gs.map(function (g) {
      var f = forecast(g);
      return '<button type="button" class="mini" data-a="openGroup" data-g="' + esc(g.id) + '" style="--gc:' + g.color + '">' +
        '<span><span class="gdot"></span>' + gi(g) + '<b>' + esc(g.short) + '</b> <span class="muted small">' + (f.pi ? "f. " + f.pi.cur + "/" + f.pi.total : g.done + "/" + g.total) + "</span></span>" +
        '<span class="chip pace-' + f.pace + '">' + esc(f.paceLabel) + "</span>" +
        '<span class="bar pb-' + f.pace + '"><i style="width:' + f.pct + '%"></i></span></button>';
    }).join("");
  }

  // ——— Groups ———
  function totals() {
    var gs = data().groups, t = 0, d = 0, left = 0, w = 0;
    gs.forEach(function (g) { var f = forecast(g); t += g.total; d += g.done; left += f.rem; w += f.pct * g.total; });
    return { groups: gs.length, total: t, done: d, left: left, pct: t ? Math.round(w / t) : 0 };
  }
  function viewGroups() {
    var T = totals();
    var h = '<div class="stack v-groups">';
    h += '<div class="row between"><h1 style="font-size:1.4rem">Grupet</h1><button type="button" class="btn btn-primary" data-a="newGroup">+ Grup i ri</button></div>';
    h += '<div class="summary"><div class="kpi"><b>' + T.groups + '</b><span>Grupe</span></div><div class="kpi"><b>' + T.pct + '%</b><span>Progresi</span></div><div class="kpi"><b>' + T.left + "</b><span>Mësime mbetur</span></div></div>";
    if (!data().groups.length) h += '<div class="card empty"><div class="big">📚</div><b>Nuk ka grupe</b>Shtypni “+ Grup i ri” për të filluar.</div>';
    data().groups.forEach(function (g) {
      var f = forecast(g);
      var n = studentsOf(g.id).length;
      h += '<button type="button" class="card group-card" data-a="openGroup" data-g="' + esc(g.id) + '" style="--gc:' + g.color + '">' +
        '<div class="row between"><h3>' + gi(g) + esc(g.name) + " " + levelChip(g) + '</h3><span class="chip pace-' + f.pace + '">' + esc(f.paceLabel) + "</span></div>" +
        '<div class="muted small">' + esc(bookText(g.book)) + " · " + n + " nxënës · " + esc(scheduleText(g)) + "</div>" +
        '<div class="bar pb-' + f.pace + '"><i style="width:' + f.pct + '%"></i></div>' +
        '<div class="row between small"><span>' + (f.pi ? "SB <b>" + f.pi.cur + "</b>/" + f.pi.total + " f. · " : "<b>" + g.done + "</b>/" + g.total + " · ") + f.rem + " mësime mbetur</span><span class=\"muted\">" + (f.rem ? "Mbaron ~ " + fmtShort(f.date) : "Përfunduar ✓") + "</span></div>" +
        (f.tg ? '<div class="small deadline' + (f.late ? " late" : "") + '">🎯 Afati: <b>' + esc(fmtShort(f.tg.date)) + "</b> <span class=\"muted\">(" + esc(deadlineSrc(f.tg, g)) + ")</span>" + (f.rem && !f.tg.past ? " · " + f.tg.slots + " mësime deri atëherë" : "") + (f.late ? " · ⚠️ vonohet" : "") + "</div>" : "") +
        (testNow(g) ? '<div class="small">📝 ' + esc(testNow(g).title) + (testNow(g).state === "due" ? " — tani" : " — së shpejti") + "</div>" : "") +
        "</button>";
    });
    h += "</div>";
    return h;
  }
  function scheduleText(g) {
    if (!g.schedule.length) return "pa orar";
    var days = g.schedule.map(function (s) { return DAY_SHORT[s.d]; });
    var times = g.schedule.map(function (s) { return s.s; });
    var sameTime = times.every(function (t) { return t === times[0]; });
    return days.join("/") + (sameTime ? " " + times[0] : "");
  }

  function viewGroup(g) {
    var f = forecast(g);
    var stu = studentsOf(g.id);
    var h = '<div class="stack v-group">';
    h += '<button type="button" class="back" data-a="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Kthehu</button>';
    h += '<div class="gd-head" style="--gc:' + g.color + '"><div class="grow"><h1><span class="gdot"></span>' + gi(g) + esc(g.name) + " " + levelChip(g) + '</h1><div class="muted">' + esc(bookText(g.book)) + (levelText(g) ? " · niveli " + esc(levelText(g)) : "") + '</div></div>' +
      '<button type="button" class="btn btn-sm" data-a="editGroup" data-g="' + esc(g.id) + '">✎ Ndrysho</button></div>' +
      '<div class="gd-actions"><button type="button" class="btn btn-sm btn-primary" data-a="parents" data-g="' + esc(g.id) + '">💬 Raport për prindërit</button><button type="button" class="btn btn-sm" data-a="report" data-g="' + esc(g.id) + '">📄 Raport PDF</button></div>';

    h += '<div class="gd-cols"><div class="gd-col">';
    // Progress — one card: where you are, what comes next, when you finish
    var pi = f.pi, pl = plannedLesson(g), nu = nextUnit(g);
    h += '<div class="card" style="--gc:' + g.color + '"><div class="row between"><h2 style="margin:0">Progresi</h2><span class="chip pace-' + f.pace + '">' + esc(f.paceLabel) + "</span></div>";
    if (pi) {
      h += '<div class="big-prog"><b>' + pi.pct + '%</b><span>SB faqja ' + pi.cur + " nga " + pi.total + "</span></div>" +
        '<div class="bar pb-' + f.pace + '"><i style="width:' + pi.pct + '%"></i></div>';
      if (pi.left > 0) {
        if (nu) h += '<p class="lesson-unit" style="margin-top:10px">📖 Tani: ' + esc(unitLabel(nu)) + "</p>";
        if (pl.t) h += '<div class="target-line">🎯 Mësimi i radhës: <b>SB f. ' + rangeText(pl.t.a, pl.t.b) + "</b>" + (pl.hw ? " · DSh WB f. " + esc(pl.hw) : "") + "</div>";
        h += paceNote(pi);
      } else h += '<p class="pace-good">🎉 Libri përfundoi.</p>';
    } else {
      h += '<div class="bar pb-' + f.pace + '"><i style="width:' + f.pct + '%"></i></div><p class="muted small" style="margin-top:6px">Shkruani më poshtë faqen e SB ku jeni — pastaj progresi dhe faqet e çdo mësimi llogariten vetë.</p>';
    }
    h += '<div class="facts">' +
      '<div class="fact"><span>Mësime</span><b>' + g.done + " / " + g.total + "</b></div>" +
      '<div class="fact"><span>Mbeten' + (pi ? " (me ritmin tuaj)" : "") + '</span><b>' + f.rem + " mësime</b></div>" +
      (pi && pi.left > 0 ? '<div class="fact"><span>Duhen</span><b>≈ ' + r1(pi.need) + " faqe/mësim</b></div>" : '<div class="fact"><span>Javë</span><b>' + f.weeks + " (" + f.per + "/javë)</b></div>") +
      '<div class="fact"><span>Mbaron rreth</span><b>' + (f.rem ? fmtShort(f.date) : "Përfunduar") + "</b></div>" +
      (f.tg ? '<div class="fact' + (f.late ? " fact-late" : "") + '"><span>🎯 Afati · ' + esc(deadlineSrc(f.tg, g)) + '</span><b>' + esc(fmtShort(f.tg.date)) + "</b></div>" +
        '<div class="fact"><span>Mësime deri në afat</span><b>' + (f.tg.past ? "afati kaloi" : f.tg.slots) + "</b></div>" : '<div class="fact"><span>🎯 Afati</span><b class="small"><button type="button" class="btn btn-sm btn-soft" data-a="editGroup" data-g="' + esc(g.id) + '">Vendos datën e fillimit</button></b></div>') +
      "</div>" + (f.late && f.rem ? '<p class="pace-warn">⚠️ Me ritmin e tanishëm mbaron rreth ' + esc(fmtShort(f.date)) + ", pas afatit " + esc(fmtShort(f.tg.date)) + ".</p>" : "");
    h += '<details class="fix"><summary>Korrigjo faqet ose numrin e mësimeve</summary>' +
      '<div class="pages"><label><span>SB</span><input data-in="page" data-g="' + esc(g.id) + '" data-f="sb" value="' + esc(g.sb) + '" placeholder="faqja" inputmode="numeric"></label>' +
      '<label><span>WB</span><input data-in="page" data-g="' + esc(g.id) + '" data-f="wb" value="' + esc(g.wb) + '" placeholder="faqja"></label></div>' +
      '<div class="stepper small-stepper"><button type="button" data-a="step" data-g="' + esc(g.id) + '" data-d="-1" aria-label="Minus">−</button>' +
      '<div class="num"><b>' + g.done + '</b><span> / ' + g.total + '</span><div class="muted tiny">mësime të kryera</div></div>' +
      '<button type="button" data-a="step" data-g="' + esc(g.id) + '" data-d="1" aria-label="Plus">+</button></div></details>';
    h += '<p class="small" style="margin-top:8px">📓 ' + (g.hw ? (g.hw.p ? "Detyra e fundit: <b>WB f. " + esc(g.hw.p) + "</b> · " + esc(fmtDayDate(g.hw.d)) : "Mësimi i fundit: pa detyrë · " + esc(fmtDayDate(g.hw.d))) : '<span class="muted">Detyra sugjerohet vetë pas “✓ U krye”.</span>') + "</p></div>";

    h += testsCard(g);

    // Units of the book with where the class is
    var cts = contentsOf(g.book), curP = lastNum(g.sb);
    h += '<details class="card units-card"' + (ui.unitsOpen ? " open" : "") + '><summary><h2 style="margin:0;display:inline">📚 Unitet e librit</h2> <span class="muted small">' + (cts.length ? cts.length + " pjesë" : "pa përmbajtje") + "</span></summary>";
    if (cts.length) {
      h += '<ul class="units">' + cts.map(function (r) {
        var st = curP == null ? "" : curP >= r.to ? "done" : curP + 1 >= r.from ? "now" : "";
        return '<li class="' + st + '"><span class="u-ic">' + (st === "done" ? "✓" : st === "now" ? "▶" : "") + '</span><span class="u-p">f. ' + r.from + '</span><span class="u-t"><b>' + esc(unitLabel(r)) + "</b>" + (r.sq ? "<small>" + esc(r.sq) + "</small>" : "") + "</span></li>";
      }).join("") + "</ul>";
    } else h += '<p class="small muted">Shtoni përmbajtjen e librit që raportet të tregojnë temat.</p>';
    h += '<button type="button" class="btn btn-sm btn-soft" style="margin-top:8px" data-a="contents" data-g="' + esc(g.id) + '">✎ Ndrysho përmbajtjen</button></details>';

    h += '</div><div class="gd-col">';
    // Schedule + class
    h += '<div class="card"><div class="row between"><h2 style="margin:0">Orari</h2><button type="button" class="btn btn-sm btn-soft" data-a="openClass" data-g="' + esc(g.id) + '" data-date="' + todayStr() + '">👥 Prezenca</button></div><div class="slots" style="margin-top:10px">' +
      (g.schedule.length ? g.schedule.map(function (s) { return '<span class="slot">' + DAY_SHORT[s.d] + " " + esc(s.s) + "–" + esc(s.e) + "</span>"; }).join("") : '<span class="muted">Pa orar — shtoni te “Ndrysho”.</span>') +
      "</div></div>";

    // Students
    h += '<div class="card"><div class="row between"><h2 style="margin:0">Nxënësit <span class="muted">(' + stu.length + ')</span></h2></div>' +
      '<div class="add-row" style="margin-top:10px"><textarea class="input" rows="1" id="add-stu" data-enter="addStudents" data-g="' + esc(g.id) + '" placeholder="Shto nxënës… (disa emra? një për rresht)"></textarea>' +
      '<button type="button" class="btn btn-primary" data-a="addStudents" data-g="' + esc(g.id) + '">Shto</button></div>';
    if (stu.length) {
      var absences = absenceCounts(), hwMiss = hwStreaks(), gst = groupStats(g.id);
      h += '<ul class="students">' + stu.map(function (s, i) {
        var a = absences[s.id] || 0, miss = hwMiss[s.id] || 0, o = gst[s.id];
        return '<li><span class="num-badge">' + (i + 1) + '</span><button type="button" class="stu-name" data-a="openStudent" data-s="' + esc(s.id) + '"><b>' + esc(s.name) + "</b>" +
          (a || s.note || miss >= 3 || o.pts ? "<small>" + [o.pts ? "⭐ " + o.pts + " pikë" : "", a ? a + " mungesa" : "", miss >= 3 ? "⚠️ " + miss + " herë radhazi pa detyrë" : "", s.note ? "📝 " + esc(s.note.slice(0, 40)) : ""].filter(Boolean).join(" · ") + "</small>" : "") + "</button>" +
          '<button type="button" class="icon-btn" data-a="delStudent" data-s="' + esc(s.id) + '" aria-label="Fshi ' + esc(s.name) + '"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></li>';
      }).join("") + "</ul>";
    } else {
      h += '<p class="muted small" style="margin-top:10px">Nuk ka nxënës ende.</p>';
    }
    h += "</div>";

    h += '</div></div>';
    h += '<div class="center" style="padding:8px 0 4px"><button type="button" class="btn btn-danger btn-sm" data-a="delGroup" data-g="' + esc(g.id) + '">Fshi grupin</button></div>';
    h += "</div>";
    return h;
  }

  function absenceCounts() {
    var out = {}, att = data().att;
    Object.keys(att).forEach(function (date) {
      var day = att[date];
      Object.keys(day).forEach(function (sid) { if (day[sid] === "A") out[sid] = (out[sid] || 0) + 1; });
    });
    return out;
  }

  // ——— Plan ———
  function viewPlan() {
    var gs = data().groups.map(function (g) { return { g: g, f: forecast(g) }; });
    var T = totals();
    var active = gs.filter(function (x) { return x.f.rem > 0; });
    var dates = active.map(function (x) { return x.f.date; }).filter(Boolean).sort(function (a, b) { return a - b; });
    var avgW = active.length ? Math.round(active.reduce(function (a, x) { return a + x.f.weeks; }, 0) / active.length * 10) / 10 : 0;
    var h3 = 0, h5 = 0, hL = 0;
    active.forEach(function (x) { if (x.f.weeks <= 13) h3++; else if (x.f.weeks <= 22) h5++; else hL++; });
    var nearest = active.filter(function (x) { return x.f.date; }).sort(function (a, b) { return a.f.date - b.f.date; })[0];
    gs.sort(function (a, b) { return (a.f.date ? a.f.date.getTime() : 0) - (b.f.date ? b.f.date.getTime() : 0); });

    var h = '<div class="stack">';
    h += weekCard();
    var tn = data().groups.map(function (g) { return { g: g, t: testNow(g) }; }).filter(function (x) { return x.t; });
    if (tn.length) h += '<div class="card"><h2>📝 Testet e radhës</h2>' + tn.map(function (x) {
      return '<button type="button" class="wk-row" data-a="openGroup" data-g="' + esc(x.g.id) + '" style="--gc:' + x.g.color + '"><span class="gdot"></span>' + gi(x.g) + "<b>" + esc(x.g.short) + "</b>&nbsp;" + esc(x.t.title) + '<span class="wk-s ' + (x.t.state === "due" ? "miss" : "") + '">' + (x.t.state === "due" ? "tani" : "së shpejti") + "</span></button>";
    }).join("") + "</div>";
    h += '<div><h1 style="font-size:1.4rem">Plani deri në fund</h1><p class="muted small">Llogaritet nga sot sipas orarit të çdo grupi. Ndryshon vetë kur shënoni mësimet.</p></div>';
    h += '<div class="summary"><div class="kpi"><b>' + T.pct + '%</b><span>Progresi total</span></div><div class="kpi"><b>' + (nearest ? esc(nearest.g.short) : "—") + "</b><span>Mbaron i pari" + (nearest ? " · " + fmtShort(nearest.f.date) : "") + '</span></div><div class="kpi"><b>' + (dates.length ? fmtShort(dates[dates.length - 1]) : "—") + "</b><span>Mbaron i fundit</span></div></div>";
    // Table (desktop)
    h += '<div class="card plan-table-wrap" style="overflow-x:auto"><table class="plan-table"><thead><tr><th>Grupi</th><th>Libri</th><th class="n">Totali</th><th class="n">Kryer</th><th class="n">Progresi</th><th class="n">Mbetur</th><th class="n">/Javë</th><th class="n">Javë</th><th>Mbaron</th><th>Afati</th><th>Ritmi</th></tr></thead><tbody>';
    gs.forEach(function (x) {
      var g = x.g, f = x.f;
      h += '<tr data-a="openGroup" data-g="' + esc(g.id) + '" style="--gc:' + g.color + '"><td><span class="gdot"></span>' + gi(g) + '<b>' + esc(g.name) + "</b> " + levelChip(g) + "</td><td>" + esc(bookText(g.book)) + '</td><td class="n">' + g.total + '</td><td class="n">' + g.done + '</td><td class="n">' + f.pct + "%" + (f.pi ? ' <span class="muted tiny">f.' + f.pi.cur + "/" + f.pi.total + "</span>" : "") + '</td><td class="n">' + f.rem + '</td><td class="n">' + f.per + '</td><td class="n">' + f.weeks + "</td><td>" + (f.rem ? fmtShort(f.date) : "—") + "</td><td" + (f.late ? ' class="late"' : "") + ">" + (f.tg ? esc(fmtShort(f.tg.date)) + (f.late ? " ⚠️" : "") : "—") + '</td><td><span class="chip pace-' + f.pace + '">' + esc(f.paceLabel) + "</span></td></tr>";
    });
    h += "</tbody></table></div>";
    // Cards (mobile)
    h += '<div class="plan-cards">';
    gs.forEach(function (x) {
      var g = x.g, f = x.f;
      h += '<button type="button" class="card group-card" data-a="openGroup" data-g="' + esc(g.id) + '" style="--gc:' + g.color + '">' +
        '<div class="row between"><h3>' + gi(g) + esc(g.name) + " " + levelChip(g) + '</h3><span class="chip pace-' + f.pace + '">' + esc(f.paceLabel) + "</span></div>" +
        '<div class="bar pb-' + f.pace + '"><i style="width:' + f.pct + '%"></i></div>' +
        '<div class="facts" style="grid-template-columns:repeat(3,1fr);margin-top:6px">' +
        '<div class="fact"><span>Mbetur</span><b>' + f.rem + "</b></div>" +
        '<div class="fact"><span>Javë</span><b>' + f.weeks + "</b></div>" +
        '<div class="fact"><span>Mbaron</span><b>' + (f.rem ? fmtShort(f.date) : "✓") + "</b></div></div>" +
        (f.tg ? '<div class="small deadline' + (f.late ? " late" : "") + '" style="margin-top:6px">🎯 Afati ' + esc(fmtShort(f.tg.date)) + (f.late ? " · ⚠️ vonohet" : " · në rregull") + "</div>" : "") + "</button>";
    });
    h += "</div>";
    h += '<p class="muted tiny">Në plan = faqet për mësim përputhen me planin · Prapa planit = duhen më shumë faqe për mësim · Përpara planit = keni kohë për aktivitete. Data e përfundimit llogaritet me ritmin tuaj të fundit, pa pushimet. Afati = rregullorja e shkollës (3×/javë → 6 muaj, 2×/javë → 7 muaj nga fillimi, pa pushimet e gjata) ose data që jep shkolla.</p>';
    h += '<div class="row wrap"><button type="button" class="btn btn-sm" data-a="exportCsv">⬇ Shkarko CSV</button><button type="button" class="btn btn-sm" data-a="print">🖨 Printo</button></div>';
    h += "</div>";
    return h;
  }
  // ——— This week ———
  function weekCard() {
    var n = now(), today = ymd(n);
    var mon = addDays(new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12), -((n.getDay() + 6) % 7));
    var cursor = {}; // running SB page per group for upcoming lessons
    data().groups.forEach(function (g) { var pi = pageInfo(g); if (pi) cursor[g.id] = { cur: pi.cur, need: lessonPages(pi), total: pi.total }; });
    var h = '<div class="card week"><div class="row between"><h2 style="margin:0">📅 Kjo javë</h2><span class="muted small">' + esc(fmtShort(mon).replace(/ \d{4}$/, "")) + " – " + esc(fmtShort(addDays(mon, 6))) + "</span></div>";
    var total = 0, doneN = 0;
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), ds = ymd(d), hol = holidayOn(ds), slots = todaysSlots(ds);
      if (!slots.length && i >= 5) continue;
      h += '<div class="wk-day' + (ds === today ? " is-today" : "") + '"><div class="wk-h"><b class="cap">' + esc(DAY_FULL[d.getDay()]) + "</b> " + d.getDate() + " " + MONTHS_S[d.getMonth()] + (ds === today ? ' <span class="chip chip-now">Sot</span>' : "") + (hol ? ' <span class="chip">🏖️ ' + esc(hol.n) + "</span>" : "") + "</div>";
      if (hol) { h += '<div class="wk-row muted small">Pushim — pa mësime</div></div>'; continue; }
      if (!slots.length) { h += '<div class="wk-row muted small">Pa mësime</div></div>'; continue; }
      slots.forEach(function (x) {
        var g = x.g, lg = loggedSlot(g.id, ds, x.s), st, cls = "";
        total++;
        if (lg != null) { doneN++; st = "✓ u krye"; cls = "ok"; }
        else if (ds < today) { st = "s'u shënua"; cls = "miss"; }
        else {
          var c = cursor[g.id];
          if (c && c.cur < c.total) { var k = Math.max(1, Math.round(c.need)); var a = c.cur + 1, b = Math.min(c.total, c.cur + k); c.cur = b; st = "SB f. " + rangeText(a, b); }
          else st = "planifikuar";
        }
        h += '<button type="button" class="wk-row" data-a="openGroup" data-g="' + esc(g.id) + '" style="--gc:' + g.color + '"><span class="wk-t">' + esc(x.s.s) + '</span><span class="gdot"></span>' + gi(g) + '<b>' + esc(g.short) + '</b><span class="wk-s ' + cls + '">' + esc(st) + "</span></button>";
      });
      h += "</div>";
    }
    var behind = data().groups.filter(function (g) { var pi = pageInfo(g); return pi && pi.left > 0 && forecast(g).pace === "speed"; });
    h += '<p class="small" style="margin-top:8px">' + doneN + " nga " + total + " mësime të kryera këtë javë." + "</p>";
    h += '<button type="button" class="btn btn-sm ' + (n.getDay() === 5 || n.getDay() === 6 ? "btn-primary" : "btn-soft") + '" style="margin-top:6px" data-a="allParents">💬 Raportet e javës për prindërit</button>';
    if (behind.length) h += '<p class="pace-warn">⚠️ Prapa planit: ' + behind.map(function (g) { var pi = pageInfo(g); return "<b>" + esc(g.short) + "</b> (duhen ≈ " + r1(pi.need) + " faqe/mësim, plani " + r1(pi.planned) + ")"; }).join(", ") + "</p>";
    return h + "</div>";
  }

  // ——— Book contents (synced: g~_cfg~contents = { "<book>": [{u, t, from, sq}] }) ———
  // Contents of the Student's Books (read from the scope & sequence pages, Sep 2026).
  // A contents list saved in the app (📚 Përmbajtja) always wins over these defaults.
  var BOOK_CONTENTS = {
    "Family & Friends Starter": [
      {"u":"Starter","from":4,"t":"Hello!","sq":"Përshëndetjet dhe emrat e personazheve; pyesin “What's your name?”, shkronjat A, B dhe numrat 1–2"},
      {"u":"1","from":10,"t":"What colour is it?","sq":"Ngjyrat; pyesin dhe përgjigjen “What colour is it? It's green.”, shkronjat C, D dhe numrat 3–4"},
      {"u":"2","from":16,"t":"What's this?","sq":"Sendet e shkollës; “What's this? It's a notebook.”, shkronjat E, F dhe numrat 5–6"},
      {"u":"3","from":22,"t":"Is it a plane?","sq":"Lodrat; pyetjet “Is it a plane? Yes, it is. / No, it isn't.”, shkronjat G, H, I dhe numrat 7–8"},
      {"u":"Values Time 1","from":28,"t":"Be polite","sq":"Vlera: të jemi të sjellshëm; projekt i vogël – ylberi"},
      {"u":"Review 1","from":30,"t":"Review 1","sq":"Përsëritje e njësive 1–3"},
      {"u":"4","from":32,"t":"This is my mum!","sq":"Familja; “This is my mum.”, shkronjat J, K, L dhe numrat 9–10"},
      {"u":"5","from":38,"t":"He's happy!","sq":"Ndjenjat; he/she – “He's happy. She's cold.”, shkronjat M, N, O dhe numrat 11–12"},
      {"u":"6","from":44,"t":"They're bears!","sq":"Kafshët e kopshtit zoologjik; shumësi me -s, “What are they? They're bears.”, numrat 13–14"},
      {"u":"Values Time 2","from":50,"t":"Share with others","sq":"Vlera: të ndajmë me të tjerët; projekt – portret familjar"},
      {"u":"Review 2","from":52,"t":"Review 2","sq":"Përsëritje e njësive 4–6"},
      {"u":"7","from":54,"t":"Are they teachers?","sq":"Profesionet; “Are they teachers? Yes, they are.”, shkronjat S, T, U dhe numrat 15–16"},
      {"u":"8","from":60,"t":"I've got a shirt!","sq":"Rrobat; “I've got a shirt.”, shkronjat V, W, X dhe numrat 17–18"},
      {"u":"9","from":66,"t":"I like plums!","sq":"Ushqimi dhe pijet; “I like… / I don't like…”, shkronjat Y, Z dhe numrat 19–20"},
      {"u":"Values Time 3","from":72,"t":"Be kind to animals","sq":"Vlera: të jemi të mirë me kafshët; projekt – libër me kafshë"},
      {"u":"Review 3","from":74,"t":"Review 3","sq":"Përsëritje e njësive 7–9"},
      {"u":"Culture","from":76,"t":"Food","sq":"Kulturë: ushqimi në vende të ndryshme"},
      {"u":"Dictionary","from":78,"t":"Picture dictionary","sq":"Fjalor me figura për përsëritje"}
    ],
    "Family & Friends 1": [
      {"u":"Starter","from":4,"t":"Hello!","sq":"Përshëndetjet, “How are you?”, “What's your name?”, mosha, numrat 1–10, ditët e javës dhe ngjyrat"},
      {"u":"1","from":8,"t":"What's this?","sq":"Sendet e shkollës; “What's this? It's a pen.”; tingujt e shkronjave a, b, c, d"},
      {"u":"2","from":14,"t":"Playtime!","sq":"Lodrat; my/your, “Is this your teddy? Yes, it is. / No, it isn't.”; tingujt e, f, g, h"},
      {"u":"3","from":20,"t":"This is my nose!","sq":"Pjesët e trupit; njëjës/shumës “This is… / These are…”; tingujt i, j, k, l"},
      {"u":"Fluency Time 1","from":26,"t":"Introductions","sq":"Prezantimi i vetes në bisedë; projekt – kukull"},
      {"u":"Review 1","from":28,"t":"Review 1","sq":"Përsëritje e njësive 1–3"},
      {"u":"4","from":30,"t":"He's a hero!","sq":"Profesionet; “He's / She's a teacher.”, “Is he a doctor?”; tingujt m, n, o, p"},
      {"u":"5","from":36,"t":"Where's the ball?","sq":"Parku; “Where's the ball?” me parafjalët in / on / under; tingujt q, r, s, t, u"},
      {"u":"6","from":42,"t":"Billy's teddy!","sq":"Familja; pronësia me ’s (Billy's teddy); tingujt v, w, x, y, z"},
      {"u":"Fluency Time 2","from":48,"t":"Playing outside","sq":"Loja jashtë dhe fjalët për të; projekt – poster i parkut"},
      {"u":"Review 2","from":50,"t":"Review 2","sq":"Përsëritje e njësive 4–6"},
      {"u":"7","from":52,"t":"Are these his trousers?","sq":"Rrobat; this is his/her…, “Are these his socks? Yes, they are.”; alfabeti"},
      {"u":"8","from":58,"t":"Where's Grandma?","sq":"Shtëpia dhe dhomat; “Is she in the kitchen?”, “Where are…?”; tingulli sh"},
      {"u":"9","from":64,"t":"Lunchtime!","sq":"Kutia e drekës; “I've got / I haven't got…”, a dhe an; tingulli ch"},
      {"u":"Fluency Time 3","from":70,"t":"Getting dressed","sq":"Veshja dhe biseda përkatëse; projekt – kub me rroba"},
      {"u":"Review 3","from":72,"t":"Review 3","sq":"Përsëritje e njësive 7–9"},
      {"u":"10","from":74,"t":"A new friend!","sq":"Shokët dhe format; “He's got / She's got…”, “It's got…”; tingulli th"},
      {"u":"11","from":80,"t":"I like monkeys!","sq":"Kafshët e kopshtit zoologjik; “I like… / I don't like…”, “They're big.”; fjalë me a"},
      {"u":"12","from":86,"t":"Dinnertime!","sq":"Ushqimi dhe pijet; “Do you like…? Yes, I do. / No, I don't.”; fjalë me e"},
      {"u":"Fluency Time 4","from":92,"t":"At the dinner table","sq":"Biseda në tryezë; projekt – pjatë me ushqime"},
      {"u":"Review 4","from":94,"t":"Review 4","sq":"Përsëritje e njësive 10–12"},
      {"u":"13","from":96,"t":"Tidy up!","sq":"Dhoma e gjumit dhe numrat 11–20; “There's… / There are…”; fjalë me i"},
      {"u":"14","from":102,"t":"Action Boy can run!","sq":"Foljet e veprimit; “He can / can't…”, “Can he…?”; fjalë me o"},
      {"u":"15","from":108,"t":"Let's play ball!","sq":"Plazhi; “Let's…” + folje për propozime; fjalë me u"},
      {"u":"Fluency Time 5","from":114,"t":"Finding things","sq":"Gjetja e sendeve dhe pyetjet përkatëse; projekt – poster i dhomës"},
      {"u":"Review 5","from":116,"t":"Review 5","sq":"Përsëritje e njësive 13–15"},
      {"u":"Culture","from":118,"t":"Culture","sq":"Kulturë: familja, kafshët e egra dhe shkolla në vende të tjera"},
      {"u":"Grammar","from":124,"t":"Grammar reference","sq":"Përmbledhje e gramatikës së librit"}
    ],
    "Family & Friends 2": [
      {"u":"Starter","from":4,"t":"Welcome back!","sq":"Përsëritje: familja, ngjyrat, lodrat, numrat 1–20, “I've got…”, “There is / There are…”"},
      {"u":"1","from":8,"t":"Our new things","sq":"Sendet e shkollës; this/that dhe these/those; përsëritje e alfabetit"},
      {"u":"2","from":14,"t":"They're happy now!","sq":"Ndjenjat; “We're / They're…”, “Are they…?”; tingujt ch, sh, th"},
      {"u":"3","from":20,"t":"I can ride a bike!","sq":"Aktivitetet jashtë; can / can't dhe parafjalët behind, in front of, next to, between"},
      {"u":"Fluency Time 1","from":26,"t":"Classroom language","sq":"Gjuha e klasës; projekt – rrotë me fjalë të shkollës"},
      {"u":"Review 1","from":28,"t":"Review 1","sq":"Përsëritje e njësive 1–3"},
      {"u":"4","from":30,"t":"Have you got a milkshake?","sq":"Ushqimet dhe numrat 20–100; “Have you got…? / Has he got…?”; tingujt gr, br, fr"},
      {"u":"5","from":36,"t":"We've got English!","sq":"Lëndët dhe mjediset e shkollës; “What / When have we got…?”, our/their; tingujt dr, tr, cr"},
      {"u":"6","from":42,"t":"Let's play after school!","sq":"Aktivitetet pas shkollës; “I visit… / I don't have…”; tingujt fl, pl, bl"},
      {"u":"Fluency Time 2","from":48,"t":"Shopping","sq":"Blerja në dyqan; projekt – tezgë tregu"},
      {"u":"Review 2","from":50,"t":"Review 2","sq":"Përsëritje e njësive 4–6"},
      {"u":"7","from":52,"t":"Let's buy presents!","sq":"Ditët e veçanta dhe dhuratat; “What does he like? He likes / doesn't like…”"},
      {"u":"8","from":58,"t":"What's the time?","sq":"Aktivitetet e përditshme dhe ora; “What's the time? It's … o'clock.”"},
      {"u":"9","from":64,"t":"Where does she work?","sq":"Vendet e punës; “Where does he work? He works in a…”; a + magic e"},
      {"u":"Fluency Time 3","from":70,"t":"Making plans","sq":"Bërja e planeve; projekt – mini-libër"},
      {"u":"Review 3","from":72,"t":"Review 3","sq":"Përsëritje e njësive 7–9"},
      {"u":"10","from":74,"t":"It's hot today!","sq":"Moti dhe veshja sipas motit; “What's the weather like?”, “Put on / Don't put on…”"},
      {"u":"11","from":80,"t":"What are you wearing?","sq":"Rrobat dhe ora; koha e tashme e vazhdueshme “What are you wearing?”"},
      {"u":"12","from":86,"t":"You're sleeping!","sq":"Festat dhe përgatitjet; koha e tashme e vazhdueshme “What are you doing?”"},
      {"u":"Fluency Time 4","from":92,"t":"At a party","sq":"Biseda në festë; projekt – dhuratë"},
      {"u":"Review 4","from":94,"t":"Review 4","sq":"Përsëritje e njësive 10–12"},
      {"u":"13","from":96,"t":"Look at all the animals!","sq":"Kafshët e fermës dhe mbiemrat; krahasimi “This cow is bigger than that cow.”"},
      {"u":"14","from":102,"t":"Look at the photos!","sq":"Kujtimet; koha e shkuar “I was / wasn't…, You were / weren't…”"},
      {"u":"15","from":108,"t":"Well done!","sq":"Njerëzit dhe numrat rendorë; “There were some / weren't any…”, shumësi i parregullt"},
      {"u":"Fluency Time 5","from":114,"t":"Playing games","sq":"Lojërat në grup; projekt – lojë me letra"},
      {"u":"Review 5","from":116,"t":"Review 5","sq":"Përsëritje e njësive 13–15"},
      {"u":"Culture","from":118,"t":"Culture","sq":"Kulturë: lojërat, vaktet dhe shtëpitë në vende të tjera"},
      {"u":"Grammar","from":124,"t":"Grammar reference","sq":"Përmbledhje e gramatikës së librit"}
    ],
    "Family & Friends 3": [
      {"u":"Starter","from":4,"t":"My family","sq":"Familja dhe muajt; “When is your birthday?”, “How old are you?”, numrat 10–100"},
      {"u":"1","from":8,"t":"They're from Australia!","sq":"Shtetet, stinët dhe shtëpia; foljet “be”: “Where are you from? I'm from…”"},
      {"u":"2","from":14,"t":"My weekend","sq":"Hobet; like + folje me -ing: “I like reading.”, “Does he like…?”"},
      {"u":"3","from":20,"t":"My things","sq":"Sendet personale dhe koleksionet; your/our/their dhe can për leje: “Can I use…?”"},
      {"u":"Fluency Time 1","from":26,"t":"Things in common","sq":"Biseda për gjërat e përbashkëta; projekt – tabelë anketimi"},
      {"u":"Review 1","from":28,"t":"Review 1","sq":"Përsëritje e njësive 1–3"},
      {"u":"Reading","from":30,"t":"Extensive reading: Family","sq":"Lexim i gjatë për familjen"},
      {"u":"4","from":32,"t":"We're having fun at the beach!","sq":"Sportet ujore dhe përshkrimi i vendeve; koha e tashme e vazhdueshme (pohore/mohore)"},
      {"u":"5","from":38,"t":"A naughty monkey!","sq":"Kafshët dhe emocionet; pyetje në kohën e tashme të vazhdueshme “Is the crocodile eating…?”"},
      {"u":"6","from":44,"t":"Jim's day","sq":"Rutina ditore; koha e tashme e thjeshtë: “I have breakfast at…”, “Do they live…?”"},
      {"u":"Fluency Time 2","from":50,"t":"Abilities","sq":"Aftësitë dhe biseda përkatëse; projekt – poster"},
      {"u":"Review 2","from":52,"t":"Review 2","sq":"Përsëritje e njësive 4–6"},
      {"u":"Reading","from":54,"t":"Extensive reading: Animals","sq":"Lexim i gjatë për kafshët"},
      {"u":"7","from":56,"t":"Places to go!","sq":"Vendet në qytet; always / sometimes / never dhe parafjalët e kohës on, at, in"},
      {"u":"8","from":62,"t":"I'd like a melon!","sq":"Ushqimi; emrat e numërueshëm/panumërueshëm a, an, some; “Would you like…?”"},
      {"u":"9","from":68,"t":"The fastest animal in the world","sq":"Përshkrimi i vendeve; shkalla krahasore dhe sipërore e mbiemrave"},
      {"u":"Fluency Time 3","from":74,"t":"Giving directions","sq":"Dhënia e udhëzimeve për rrugën; projekt – hartë e një ishulli"},
      {"u":"Review 3","from":76,"t":"Review 3","sq":"Përsëritje e njësive 7–9"},
      {"u":"Reading","from":78,"t":"Extensive reading: Food","sq":"Lexim i gjatë për ushqimin"},
      {"u":"10","from":80,"t":"In the park!","sq":"Parku dhe rregullat; must / mustn't: “You mustn't walk on the grass.”"},
      {"u":"11","from":86,"t":"In the museum","sq":"Transporti dhe parafjalët; koha e shkuar “there was / there were”, yesterday, ago"},
      {"u":"12","from":92,"t":"A clever baby!","sq":"Përshkrimi i njerëzve; koha e shkuar e foljeve “be” dhe “have”"},
      {"u":"Fluency Time 4","from":98,"t":"Describing people","sq":"Përshkrimi i njerëzve në bisedë; projekt – skenë feste"},
      {"u":"Review 4","from":100,"t":"Review 4","sq":"Përsëritje e njësive 10–12"},
      {"u":"Reading","from":102,"t":"Extensive reading: Transport","sq":"Lexim i gjatë për transportin"},
      {"u":"13","from":104,"t":"The Ancient Egyptians","sq":"Egjipti i lashtë; koha e shkuar e foljeve të rregullta: “They lived…”, “They didn't…”"},
      {"u":"14","from":110,"t":"Did you have a good day?","sq":"Shkolla dhe kampimi; pyetje në kohën e shkuar “Did you…?” dhe what/when/where"},
      {"u":"15","from":116,"t":"Our holiday!","sq":"Pushimet; plane për të ardhmen me “be going to”: “He's going to play…”"},
      {"u":"Fluency Time 5","from":122,"t":"Talking about holidays","sq":"Biseda për pushimet; projekt – album me foto"},
      {"u":"Review 5","from":124,"t":"Review 5","sq":"Përsëritje e njësive 13–15"},
      {"u":"Reading","from":126,"t":"Extensive reading: School","sq":"Lexim i gjatë për shkollën dhe një tregim (fiction)"},
      {"u":"Culture","from":130,"t":"Culture","sq":"Kulturë: Mbretëria e Bashkuar, ngjarjet sportive dhe veshjet"}
    ],
    "English Plus 1": [
      {"u":"Starter","from":4,"t":"Starter unit","sq":"Klasa, ditët dhe muajt; foljet “be”, përemrat vetorë e pronorë dhe ’s"},
      {"u":"1","from":8,"t":"Your interests","sq":"Kohë e lirë dhe hobet; “have got”, fjalët pyetëse; prezantimi dhe një email i shkurtër"},
      {"u":"2","from":18,"t":"City to city","sq":"Vendet në qytet; there is / there are, a/an/some/any dhe mbiemrat krahasorë"},
      {"u":"3","from":28,"t":"Around the world","sq":"Shtetet, kombësitë dhe gjuhët; koha e tashme e thjeshtë dhe ndajfoljet e shpeshtësisë"},
      {"u":"4","from":38,"t":"The wild side","sq":"Kafshët dhe natyra; koha e tashme e vazhdueshme dhe krahasimi me të tashmen e thjeshtë"},
      {"u":"5","from":48,"t":"In and out of school","sq":"Shkolla dhe ushqimi; can për aftësi/leje, some/any/much/many dhe ftesat"},
      {"u":"6","from":58,"t":"Names and places","sq":"Profesionet; koha e shkuar: was/were, there was/were dhe foljet e rregullta"},
      {"u":"7","from":68,"t":"Games","sq":"Sportet dhe përshkrimi i njerëzve; koha e shkuar e foljeve të rregullta e të parregullta"},
      {"u":"8","from":78,"t":"Expedition","sq":"Pajisjet e udhëtimit dhe moti; urdhërorja, “be going to” dhe will / won't"},
      {"u":"Options","from":88,"t":"English Plus Options","sq":"Pjesë shtesë: dëgjim e të folur, kulturë, lëndë të tjera në anglisht dhe projekte"}
    ],
    "English Plus 1 New": [
      {"u":"Starter","from":4,"t":"Starter unit","sq":"Koha e lirë, sendet, mbiemrat dhe shtetet; “be”, ’s, this/that, “have got” dhe fjalët pyetëse"},
      {"u":"1","from":12,"t":"Towns and cities","sq":"Vendet në qytet; there is/are, a/an/some/any dhe mbiemrat krahasorë"},
      {"u":"2","from":22,"t":"Days","sq":"Rutina ditore dhe ditët e veçanta; koha e tashme e thjeshtë dhe ndajfoljet e shpeshtësisë"},
      {"u":"3","from":32,"t":"Wild life","sq":"Kafshët; shkalla sipërore e mbiemrave, “can” për aftësi dhe pyetjet me How…?"},
      {"u":"4","from":42,"t":"Learning world","sq":"Lëndët e shkollës; koha e tashme e vazhdueshme dhe krahasimi me të tashmen e thjeshtë"},
      {"u":"5","from":52,"t":"Food and health","sq":"Ushqimi dhe shëndeti; some/any/much/many/a lot of, urdhërorja dhe porosia në kafene"},
      {"u":"6","from":62,"t":"Sport","sq":"Sportet; was/were, there was/were dhe koha e shkuar e thjeshtë"},
      {"u":"7","from":72,"t":"Growing up","sq":"Përshkrimi i njerëzve dhe ngjarjet e jetës; përemrat në kallëzore dhe pyetjet në kohën e shkuar"},
      {"u":"8","from":82,"t":"Going away","sq":"Pushimet dhe moti; “be going to”, will / won't, ofertat dhe premtimet"},
      {"u":"Options","from":92,"t":"English Plus Options","sq":"Pjesë shtesë: dëgjim e të folur, kulturë, lëndë të tjera në anglisht, projekte dhe këngë"}
    ],
    "English Plus 2": [
      {"u":"Starter","from":4,"t":"Starter unit","sq":"Familja; foljet “be”, përemrat vetorë dhe ’s"},
      {"u":"1","from":8,"t":"Possessions","sq":"Sendet personale dhe koha e lirë; koha e tashme e thjeshtë dhe ndajfoljet e shpeshtësisë"},
      {"u":"2","from":18,"t":"Home","sq":"Shtëpia dhe punët e shtëpisë; koha e tashme e vazhdueshme"},
      {"u":"3","from":28,"t":"Looking back","sq":"Ndjenjat dhe ngjarjet e jetës; was/were dhe koha e shkuar e thjeshtë"},
      {"u":"4","from":38,"t":"Dare!","sq":"Lëvizja dhe gjeografia; koha e shkuar e vazhdueshme dhe propozimet"},
      {"u":"5","from":48,"t":"Clever","sq":"Aftësitë dhe cilësitë; can / could dhe pyetjet me How…?"},
      {"u":"6","from":58,"t":"Life in numbers","sq":"Koha dhe numrat; will / won't për parashikime dhe mbiemrat e karakterit"},
      {"u":"7","from":68,"t":"Sport for all","sq":"Njerëzit në sport; urdhërorja, “be going to” dhe dallimi me will"},
      {"u":"8","from":78,"t":"Are you scared?","sq":"Emocionet dhe lëndimet; koha e kryer (present perfect)"},
      {"u":"Options","from":88,"t":"English Plus Options","sq":"Pjesë shtesë: dëgjim e të folur, kulturë, lëndë të tjera në anglisht dhe projekte"}
    ],
    "English Plus 2 New": [
      {"u":"Starter","from":4,"t":"Starter unit","sq":"Familja; foljet “be”, mbiemrat pronorë dhe fjalët pyetëse"},
      {"u":"1","from":8,"t":"My time","sq":"Si e kalojmë kohën; koha e tashme e thjeshtë dhe aktivitetet e kohës së lirë"},
      {"u":"2","from":18,"t":"Communication","sq":"Komunikimi; koha e tashme e vazhdueshme dhe biseda në telefon"},
      {"u":"3","from":28,"t":"The past","sq":"Përshkrimi i njerëzve dhe vendeve; was/were, there was/were dhe foljet e zakonshme në të shkuarën"},
      {"u":"4","from":38,"t":"In the picture","sq":"Veprimet dhe lëvizjet; koha e shkuar e vazhdueshme, mbiemrat dhe ndajfoljet"},
      {"u":"5","from":48,"t":"Achieve","sq":"Njësitë matëse, punët dhe aftësitë; shkalla krahasore dhe sipërore"},
      {"u":"6","from":58,"t":"Survival","sq":"Mbijetesa dhe pajisjet; will / won't në kushtoren e parë"},
      {"u":"7","from":68,"t":"Music","sq":"Muzika dhe instrumentet; “be going to” dhe dallimi me will"},
      {"u":"8","from":78,"t":"Scary","sq":"Ndjenjat dhe lëndimet; koha e kryer (present perfect)"},
      {"u":"Options","from":88,"t":"English Plus Options","sq":"Pjesë shtesë: dëgjim e të folur, kulturë, lëndë të tjera në anglisht dhe projekte"}
    ],
    "Family & Friends 3 New": [
      {"u":"Starter","from":4,"t":"My family","sq":"Familja dhe muajt; “When is your birthday?”, “How old are you?”, numrat 10–100"},
      {"u":"1","from":8,"t":"They're from Australia!","sq":"Shtetet, stinët dhe shtëpia; foljet “be”: “Where are you from? I'm from…”"},
      {"u":"2","from":14,"t":"My weekend","sq":"Hobet; like + folje me -ing: “I like reading.”, “Does he like…?”"},
      {"u":"3","from":20,"t":"My things","sq":"Sendet personale dhe koleksionet; your/our/their dhe can për leje: “Can I use…?”"},
      {"u":"Fluency Time 1","from":26,"t":"Things in common","sq":"Biseda për gjërat e përbashkëta; projekt – tabelë anketimi"},
      {"u":"Review 1","from":28,"t":"Review 1","sq":"Përsëritje e njësive 1–3"},
      {"u":"Reading","from":30,"t":"Extensive reading: Family","sq":"Lexim i gjatë për familjen"},
      {"u":"4","from":32,"t":"We're having fun at the beach!","sq":"Sportet ujore dhe përshkrimi i vendeve; koha e tashme e vazhdueshme (pohore/mohore)"},
      {"u":"5","from":38,"t":"A naughty monkey!","sq":"Kafshët dhe emocionet; pyetje në kohën e tashme të vazhdueshme “Is the crocodile eating…?”"},
      {"u":"6","from":44,"t":"Jim's day","sq":"Rutina ditore; koha e tashme e thjeshtë: “I have breakfast at…”, “Do they live…?”"},
      {"u":"Fluency Time 2","from":50,"t":"Abilities","sq":"Aftësitë dhe biseda përkatëse; projekt – poster"},
      {"u":"Review 2","from":52,"t":"Review 2","sq":"Përsëritje e njësive 4–6"},
      {"u":"Reading","from":54,"t":"Extensive reading: Animals","sq":"Lexim i gjatë për kafshët"},
      {"u":"7","from":56,"t":"Places to go!","sq":"Vendet në qytet; always / sometimes / never dhe parafjalët e kohës on, at, in"},
      {"u":"8","from":62,"t":"I'd like a melon!","sq":"Ushqimi; emrat e numërueshëm/panumërueshëm a, an, some; “Would you like…?”"},
      {"u":"9","from":68,"t":"The fastest animal in the world","sq":"Përshkrimi i vendeve; shkalla krahasore dhe sipërore e mbiemrave"},
      {"u":"Fluency Time 3","from":74,"t":"Giving directions","sq":"Dhënia e udhëzimeve për rrugën; projekt – hartë e një ishulli"},
      {"u":"Review 3","from":76,"t":"Review 3","sq":"Përsëritje e njësive 7–9"},
      {"u":"Reading","from":78,"t":"Extensive reading: Food","sq":"Lexim i gjatë për ushqimin"},
      {"u":"10","from":80,"t":"In the park!","sq":"Parku dhe rregullat; must / mustn't: “You mustn't walk on the grass.”"},
      {"u":"11","from":86,"t":"In the museum","sq":"Transporti dhe parafjalët; koha e shkuar “there was / there were”, yesterday, ago"},
      {"u":"12","from":92,"t":"A clever baby!","sq":"Përshkrimi i njerëzve; koha e shkuar e foljeve “be” dhe “have”"},
      {"u":"Fluency Time 4","from":98,"t":"Describing people","sq":"Përshkrimi i njerëzve në bisedë; projekt – skenë feste"},
      {"u":"Review 4","from":100,"t":"Review 4","sq":"Përsëritje e njësive 10–12"},
      {"u":"Reading","from":102,"t":"Extensive reading: Transport","sq":"Lexim i gjatë për transportin"},
      {"u":"13","from":104,"t":"The Ancient Egyptians","sq":"Egjipti i lashtë; koha e shkuar e foljeve të rregullta: “They lived…”, “They didn't…”"},
      {"u":"14","from":110,"t":"Did you have a good day?","sq":"Shkolla dhe kampimi; pyetje në kohën e shkuar “Did you…?” dhe what/when/where"},
      {"u":"15","from":116,"t":"Our holiday!","sq":"Pushimet; plane për të ardhmen me “be going to”: “He's going to play…”"},
      {"u":"Fluency Time 5","from":122,"t":"Talking about holidays","sq":"Biseda për pushimet; projekt – album me foto"},
      {"u":"Review 5","from":124,"t":"Review 5","sq":"Përsëritje e njësive 13–15"},
      {"u":"Reading","from":126,"t":"Extensive reading: School","sq":"Lexim i gjatë për shkollën dhe një tregim (fiction)"},
      {"u":"Culture","from":130,"t":"Culture","sq":"Kulturë: Mbretëria e Bashkuar, ngjarjet sportive dhe veshjet"}
    ]
  };
  function contentsAll() { var v = getK("g~_cfg~contents"); return v && typeof v === "object" ? v : {}; }
  function contentsOf(book) {
    var c = contentsAll()[book] || BOOK_CONTENTS[book] || [];
    var rows = c.filter(function (r) { return r && +r.from > 0; }).map(function (r) { return { u: String(r.u || ""), t: String(r.t || ""), from: +r.from, sq: String(r.sq || "") }; })
      .sort(function (a, b) { return a.from - b.from; });
    rows.forEach(function (r, i) { r.to = rows[i + 1] ? rows[i + 1].from - 1 : 99999; });
    return rows;
  }
  function unitsFor(book, a, b) { return contentsOf(book).filter(function (r) { return r.from <= b && r.to >= a; }); }
  function unitLabel(r) { var u = r.u ? (/^\d+$/.test(r.u) ? "Unit " + r.u : r.u) : ""; if (r.t && r.u && r.t.toLowerCase().indexOf(r.u.toLowerCase()) >= 0) return r.t; return r.t && r.t !== r.u ? u + (u ? " – " : "") + r.t : u || r.t; }

  function weekStart(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); return addDays(x, -((x.getDay() + 6) % 7)); }
  // What the children learn in each unit (for the parents' report): t = topic, w = words, g = grammar, p = sounds, h = home practice
  var BOOK_DETAILS = {"books":{"Family & Friends Starter":{"Starter":{"t":"përshëndetjet dhe prezantimi","w":"hello, goodbye, Rosy, Tim, Billy","g":"“What's your name?” – “I'm Rosy.”","p":"shkronjat A a (apple), B b (boy); numrat 1–2","h":"Pyeteni: “What's your name?” – fëmija përgjigjet “I'm …”."},"1":{"t":"ngjyrat","w":"red, blue, green, yellow, orange, pink, purple, brown","g":"“What colour is it?” – “It's green.”","p":"C c (cat, car), D d (dog, duck); numrat 3–4","h":"Tregoni sende në shtëpi dhe pyetni: “What colour is it?”"},"2":{"t":"sendet e shkollës","w":"pen, pencil, book, bag, notebook, rubber, ruler","g":"“What's this?” – “It's a notebook.”","p":"E e (egg, elephant), F f (fish, farm); numrat 5–6","h":"Tregoni sendet e çantës: “What's this?”"},"3":{"t":"lodrat","w":"ball, doll, teddy, car, plane, bike, train","g":"“Is it a plane?” – “Yes, it is. / No, it isn't.”","p":"G g (girl, guitar), H h (hat, horse), I i (insect); numrat 7–8","h":"Fshihni një lodër dhe pyetni: “Is it a ball?”"},"4":{"t":"familja","w":"mum, dad, brother, sister, grandma, grandpa","g":"“This is my mum.”","p":"J j (jug, juice), K k (kangaroo, key), L l (lion, lollipop); numrat 9–10","h":"Shikoni foto familjare: fëmija thotë “This is my …”."},"5":{"t":"ndjenjat","w":"happy, sad, hot, cold, hungry, thirsty","g":"“He's happy.” / “She's cold.” (he = ai, she = ajo)","p":"M m (man, mango), N n (nose, neck), O o (orange, octopus); numrat 11–12","h":"Bëni fytyra (i gëzuar, i trishtuar) dhe fëmija thotë: “He's happy / sad.”"},"6":{"t":"kafshët e kopshtit zoologjik","w":"bear, monkey, lion, tiger, snake, hippo, crocodile, panda","g":"“What are they?” – “They're bears.” (shumësi me -s)","p":"P p (panda, pen), Q q (queen, quilt), R r (river, rainbow); numrat 13–14","h":"Tregoni figura kafshësh: “What are they?” – “They're lions.”"},"7":{"t":"profesionet","w":"teacher, doctor, farmer, police officer, cook, pilot","g":"“Are they teachers?” – “Yes, they are. / No, they aren't.”","p":"S s (sofa, sock), T t (towel, turtle), U u (umbrella, up); numrat 15–16","h":"Pyeteni për punët e familjarëve: “Is Dad a teacher?”"},"8":{"t":"rrobat","w":"shirt, T-shirt, skirt, jacket, shoes, hat, dress, trousers","g":"“I've got a shirt.”","p":"V v (violin, vase), W w (woman, wall), X x (box, fox); numrat 17–18","h":"Kur vishet, fëmija thotë: “I've got a …”."},"9":{"t":"ushqimi dhe pijet","w":"plums, raisins, cake, grapes, milk, water, juice","g":"“I like plums.” / “I don't like raisins.”","p":"Y y (yogurt, yo-yo), Z z (zebra, zoo); numrat 19–20","h":"Në tryezë pyeteni: “Do you like …?” – fëmija thotë “I like …” ose “I don't like …”."}},"Family & Friends 1":{"Starter":{"t":"përshëndetjet, numrat, ditët dhe ngjyrat","w":"hello, goodbye, numbers 1–10, Monday … Sunday, colours of the rainbow","g":"“How are you?” – “I'm fine, thank you.” · “How old are you?” – “I'm seven.”","h":"Pyeteni çdo ditë: “How are you?” dhe “What day is it today?”"},"1":{"t":"sendet e shkollës","w":"pen, pencil, book, bag, ruler, rubber, crayon, pencil case","g":"“What's this?” – “It's a pen.”","p":"tingujt e shkronjave a, b, c, d (apple, bird, cat, dog)","h":"Tregoni sendet e çantës: “What's this?”"},"2":{"t":"lodrat","w":"ball, car, doll, kite, puppet, teddy, train, bike","g":"my / your · “Is this your teddy?” – “Yes, it is. / No, it isn't.”","p":"e, f, g, h (egg, fig, goat, hat)","h":"Pyeteni për lodrat: “Is this your ball?”"},"3":{"t":"trupi","w":"head, face, nose, mouth, eyes, ears, arm, hand, leg, foot","g":"“This is my nose.” / “These are my arms.” (njëjës / shumës)","p":"i, j, k, l (ink, jam, kite, lion)","h":"Luani “Touch your nose / head / arms!”"},"Fluency Time 1":{"t":"prezantimi në bisedë","g":"“Hello, I'm … Nice to meet you.”","h":"Luani prezantimin me një lodër: “Hello, I'm … What's your name?”"},"4":{"t":"profesionet","w":"teacher, doctor, farmer, pilot, police officer, nurse, cook, vet","g":"“He's / She's a teacher.” · “Is she a doctor?” – “Yes, she is. / No, she isn't.”","p":"m, n, o, p (mum, nurse, orange, pen)","h":"Pyeteni: “Is Grandpa a teacher?”"},"5":{"t":"parku dhe vendndodhja","w":"tree, flower, slide, swing, seesaw, pond, bench, kite","g":"“Where's the ball?” – “It's in / on / under the tree.”","p":"q, r, s, t, u (queen, rabbit, sofa, teddy, umbrella)","h":"Fshihni një send: “Where's the ball?” – “It's under the table.”"},"6":{"t":"familja","w":"mum, dad, brother, sister, grandma, grandpa, aunt, uncle, cousin","g":"pronësia me ’s: “This is Billy's teddy.” · “Who's this?”","p":"v, w, x, y, z (van, window, box, yo-yo, zebra)","h":"Tregoni sende: “Whose is this?” – “It's Dad's.”"},"Fluency Time 2":{"t":"lojërat jashtë","g":"“Let's play!” · “Can I play, please?”","h":"Kur dalin jashtë, përdorni “Let's play!”"},"7":{"t":"rrobat","w":"T-shirt, trousers, socks, shoes, dress, skirt, jacket, hat","g":"“This is his / her T-shirt.” · “Are these his socks?” – “Yes, they are. / No, they aren't.”","p":"alfabeti – emrat e shkronjave","h":"Kur palosni rrobat pyeteni: “Are these your socks?”"},"8":{"t":"shtëpia dhe dhomat","w":"kitchen, bedroom, bathroom, living room, dining room, garden, hall","g":"“Is she in the kitchen?” · “Where are Dad and Billy?” – “They're in the garden.”","p":"tingulli sh (shoes, sheep, fish)","h":"Pyeteni: “Where's Mum?” – “She's in the kitchen.”"},"9":{"t":"kutia e drekës","w":"sandwich, apple, banana, pear, orange, water, juice, biscuit","g":"“I've got two sandwiches.” / “I haven't got …” · a / an (an apple)","p":"tingulli ch (chair, teacher, chick)","h":"Kur përgatitni ushqimin: “What have you got?” – “I've got an apple.”"},"Fluency Time 3":{"t":"veshja","g":"“Put on your jacket.” · “Here you are.”","h":"Në mëngjes thoni në anglisht: “Put on your shoes!”"},"10":{"t":"shokët dhe format","w":"blond / black / brown hair, curly, straight, blue eyes; circle, square, triangle, rectangle","g":"“He's got / She's got blond hair.” · “It's got …”","p":"tingulli th (three, bath, teeth)","h":"Përshkruani dikë: “She's got long black hair.”"},"11":{"t":"kafshët e zoo-s","w":"monkey, elephant, giraffe, lion, snake, hippo, crocodile, zebra","g":"“I like monkeys.” / “I don't like elephants.” · “They're big / little.”","p":"fjalë të shkurtra me a (cat, man, fan)","h":"Pyeteni: “Do you like snakes?”"},"12":{"t":"ushqimet dhe pijet","w":"carrots, peas, rice, meat, fish, yogurt, milk, juice","g":"“Do you like carrots?” – “Yes, I do. / No, I don't.” · “What do you like?”","p":"fjalë të shkurtra me e (bed, pen, red)","h":"Në drekë pyeteni: “Do you like rice?”"},"Fluency Time 4":{"t":"në tryezë","g":"“Can I have …, please?” · “Here you are.” · “Thank you.”","h":"Në tryezë fëmija kërkon: “Can I have water, please?”"},"13":{"t":"dhoma e gjumit dhe numrat 11–20","w":"bed, lamp, rug, cupboard, shelf, box, poster; numrat 11–20","g":"“There's a lamp.” / “There are two beds.”","p":"fjalë të shkurtra me i (bin, fig, tin)","h":"Numëroni sendet: “There are twelve books.”"},"14":{"t":"foljet e veprimit","w":"run, jump, swim, fly, climb, talk, sing, dance","g":"“He can fly.” / “He can't talk.” · “Can he …?” – “Yes, he can. / No, he can't.”","p":"fjalë të shkurtra me o (dog, fox, log)","h":"Pyeteni: “Can you swim?” – “Yes, I can!”"},"15":{"t":"plazhi","w":"sea, sand, shell, sandcastle, towel, sunhat, boat, crab","g":"“Let's play ball!” · “Let's + folje” (le të …)","p":"fjalë të shkurtra me u (rug, jug, sun)","h":"Propozoni në anglisht: “Let's read!”, “Let's play!”"},"Fluency Time 5":{"t":"gjetja e sendeve","g":"“Where's my …?” – “It's here!”","h":"Luani “Where's my …?” me sendet e shtëpisë."}},"Family & Friends 2":{"Starter":{"t":"përsëritje: familja, ngjyrat, lodrat dhe numrat 1–20","g":"“I've got brown hair.” · “There is / There are …”","h":"Pyeteni: “How many books are there?”"},"1":{"t":"sendet e reja të shkollës","w":"pencil case, rubber, ruler, sharpener, crayon, schoolbag","g":"this / that (njëjës), these / those (shumës): “These are my books.”","p":"përsëritje e alfabetit","h":"Tregoni afër e larg: “This is … / That is …”"},"2":{"t":"ndjenjat","w":"happy, sad, hungry, thirsty, tired, hot, cold, scared","g":"“We're / They're happy.” · “Are they sad?”","p":"ch, sh, th (chair, shoes, thumb)","h":"Pyeteni si ndihet: “Are you tired?”"},"3":{"t":"aktivitetet jashtë dhe vendi","w":"ride a bike, skateboard, play football, skip; behind, in front of, next to, between","g":"“She can / can't ride a bike.” · “Where's the skateboard?” – “It's in front of the table.”","p":"a, e, i, o, u në fjalë të shkurtra (cat, peg, bin, mop, bus)","h":"Pyeteni: “Can you ride a bike?” dhe “Where's the ball?”"},"Fluency Time 1":{"t":"gjuha e klasës","g":"“Can I have a pencil, please?” · “Sorry, I don't understand.”","h":"Praktikoni: “Can I have …, please?”"},"4":{"t":"ushqimet dhe numrat 20–100","w":"milkshake, sandwich, salad, pizza, burger, grapes; twenty … one hundred","g":"“Have you got a milkshake?” – “I have / I haven't.” · “Has he got …?”","p":"gr, br, fr (grapes, bread, frog)","h":"Numëroni deri në 100 dhe pyetni: “Have you got a …?”"},"5":{"t":"lëndët dhe mjediset e shkollës","w":"English, maths, science, art, music, PE; classroom, library, playground","g":"“What have we got on Monday?” – “We've got English.” · our / their","p":"dr, tr, cr (drum, truck, crab)","h":"Pyeteni për orarin: “What have you got today?”"},"6":{"t":"aktivitetet pas shkollës","w":"visit grandma, play the piano, have a swimming lesson, read a book, watch TV","g":"“I visit my grandma on Monday.” / “I don't have …”","p":"fl, pl, bl (flower, plum, blue)","h":"Pyeteni: “What do you do after school?”"},"Fluency Time 2":{"t":"blerjet","g":"“How much is it?” · “Can I have …, please?”","h":"Luani dyqan në shtëpi: “How much is it?”"},"7":{"t":"ditët e veçanta dhe dhuratat","w":"present, card, party, balloon, cake; likes / doesn't like","g":"“What does he like?” – “He likes / doesn't like …”","p":"cl, gl, sl (clock, gloves, slide)","h":"Pyeteni: “What does Dad like?”"},"8":{"t":"ora dhe aktivitetet e përditshme","w":"get up, have breakfast, go to school, have lunch, go to bed; o'clock","g":"“What's the time?” – “It's seven o'clock.” · “He has breakfast at …”","p":"sm, sn, st, sk (smile, snake, star, sky)","h":"Pyeteni gjatë ditës: “What's the time?”"},"9":{"t":"vendet e punës","w":"hospital, school, farm, shop, office, police station","g":"“Where does he work?” – “He works in a hospital.” · “Does she work in a …?”","p":"a + magic e (lake, face, plane)","h":"Pyeteni: “Where does Mum work?”"},"Fluency Time 3":{"t":"planet","g":"“Let's go to …” · “Good idea!”","h":"Bëni plane për fundjavën në anglisht: “Let's go to the park!”"},"10":{"t":"moti","w":"sunny, rainy, windy, cloudy, snowy, hot, cold; coat, scarf, sunglasses","g":"“What's the weather like?” – “It's hot.” · “Put on your coat. / Don't put on …”","p":"i + magic e (bike, kite, nine)","h":"Çdo mëngjes pyeteni: “What's the weather like today?”"},"11":{"t":"rrobat dhe ora","w":"sweater, jeans, boots, cap, shorts; half past","g":"koha e tashme e vazhdueshme: “What are you wearing?” – “I'm wearing a red shirt.”","p":"o + magic e (nose, bone, home)","h":"Pyeteni: “What are you wearing today?”"},"12":{"t":"festat dhe përgatitjet","w":"party, dance, sing, eat cake, open presents, get ready","g":"“What are you doing?” – “I'm dancing.” · “What's he doing?”","p":"u + magic e (June, tube, cube)","h":"Pyeteni gjatë ditës: “What are you doing?”"},"Fluency Time 4":{"t":"në festë","g":"“Happy birthday!” · “Would you like …?”","h":"Praktikoni urimet në anglisht."},"13":{"t":"kafshët e fermës dhe krahasimi","w":"cow, goat, sheep, horse, duck; big, small, tall, fast, slow","g":"krahasorja: “This cow is bigger than that cow.”","p":"ee (tree, cheese, feet)","h":"Krahasoni sende: “Dad is taller than me.”"},"14":{"t":"kujtimet dhe foto","w":"baby, young, old, yesterday, last year","g":"koha e shkuar e “be”: “I was / wasn't …”, “You were / weren't …”","p":"zanore të shkurtra e të gjata (cub – cube, tap – tape)","h":"Shikoni foto të vjetra: “I was a baby here.”"},"15":{"t":"njerëzit dhe numrat rendorë","w":"first, second, third … tenth; man – men, child – children","g":"“There were some … / There weren't any …” · shumësi i parregullt","p":"ng / nk (ring, king, bank, pink)","h":"Pyeteni: “Who was first?”"},"Fluency Time 5":{"t":"lojërat","g":"“It's my turn.” · “Well done!”","h":"Luani një lojë tavoline dhe përdorni “It's my turn!”"}},"Family & Friends 3":{"Starter":{"t":"familja, muajt dhe numrat 10–100","g":"“When is your birthday?” – “It's in May.” · “The red car is bigger than the blue car.”","h":"Pyeteni: “When is your birthday?”"},"1":{"t":"shtetet, stinët dhe shtëpia","w":"Australia, Egypt, Spain, Brazil, the UK; spring, summer, autumn, winter","g":"foljet “be”: “Where are you from?” – “I'm from Kosovo.”","p":"cr, dr, sp, sn, pl","h":"Pyeteni: “Where are you from?” dhe “What's your favourite season?”"},"2":{"t":"hobet dhe fundjava","w":"fishing, skateboarding, reading comics, playing chess, playing basketball, taking photos","g":"like + -ing: “I like reading.” · “Does he like fishing?” – “Yes, he does. / No, he doesn't.”","p":"magic e: a_e, i_e, o_e, u_e (face, kite, rope, cube)","h":"Pyeteni: “What do you like doing at the weekend?”"},"3":{"t":"sendet personale dhe koleksionet","w":"CD player, camera, stickers, coins, postcards; phrasal verbs (put on, take off)","g":"your / our / their · “Can I use your computer?” – “Yes, you can. / No, you can't.”","p":"ar (car, park, shark, scarf)","h":"Fëmija kërkon leje në anglisht: “Can I …, please?”"},"Fluency Time 1":{"t":"gjërat e përbashkëta","g":"“Me too!” · “Do you like …?”","h":"Gjeni 3 gjëra që ju pëlqejnë të dyve: “I like … – Me too!”"},"Reading":{"t":"lexim i gjatë (extensive reading)","h":"Lexoni së bashku një tregim të shkurtër në anglisht."},"4":{"t":"plazhi dhe sportet ujore","w":"swimming, snorkelling, sailing, surfing; sunny, sandy, rocky","g":"koha e tashme e vazhdueshme: “I'm swimming.” / “She isn't snorkelling.”","p":"all (ball, wall, tall, small)","h":"Pyeteni: “What are you doing now?”"},"5":{"t":"kafshët dhe emocionet","w":"crocodile, kangaroo, parrot; angry, bored, excited, scared","g":"“Is the crocodile eating the sandwich?” – “Yes, it is. / No, it isn't.”","p":"or, aw (fork, horse, straw, yawn)","h":"Pyeteni për figura: “Is he eating?”"},"6":{"t":"rutina ditore","w":"get up, have a shower, have breakfast, go to school, do homework, go to bed","g":"koha e tashme e thjeshtë: “I have breakfast at seven.” · “Do they live in a big house?”","p":"oy, oi (boy, toy, coin, oil)","h":"Pyeteni: “What time do you get up?”"},"Fluency Time 2":{"t":"aftësitë","g":"“Can you …?” – “Yes, I can.”","h":"Pyeteni: “What can you do?”"},"7":{"t":"vendet në qytet","w":"cinema, museum, theatre, library, sports centre, circus","g":"always / sometimes / never · on / at / in (on Monday, at 5 o'clock, in May)","p":"ow, ou (cow, clown, house, mouse)","h":"Pyeteni: “Do you always go to the park on Saturday?”"},"8":{"t":"ushqimi","w":"melon, cereal, bread, cheese, rice, pasta, butter, jam","g":"a / an / some · “I'd like a melon.” · “Would you like some cereal?” – “Yes, please. / No, thanks.”","p":"ld, lt (child, field, belt, quilt)","h":"Në tryezë pyeteni: “Would you like some bread?”"},"9":{"t":"përshkrimi i vendeve","w":"mountain, river, lake, desert, forest, city","g":"krahasorja dhe sipërorja: “Russia is bigger than the UK.” · “The highest mountain in the world is …”","p":"nd, nt, mp (sand, plant, lamp)","h":"Pyeteni: “What's the biggest city in Kosovo?”"},"Fluency Time 3":{"t":"udhëzimet për rrugën","g":"“Go straight on.” · “Turn left / right.”","h":"Kur ecni, fëmija ju drejton: “Turn left!”"},"10":{"t":"parku dhe rregullat","w":"path, grass, flowers, bin, trees, playground, fountain, litter","g":"must / mustn't: “You must walk on the path.” · “You mustn't pick the flowers.”","p":"tingulli i gjatë a (rain, Monday, case)","h":"Bëni 3 rregulla të shtëpisë: “We must … / We mustn't …”"},"11":{"t":"muzeu dhe transporti","w":"train, tram, bus, plane, ship; next to, opposite, behind","g":"koha e shkuar: “There was / There were …” · yesterday, last week, 50 years ago","p":"tingulli i gjatë e (dream, green, happy)","h":"Pyeteni: “Where were you yesterday?”"},"12":{"t":"përshkrimi i njerëzve","w":"tall, short, clever, funny, kind, friendly","g":"koha e shkuar e “be” dhe “have”: “I wasn't tall when I was five.” · “I had a maths lesson.”","p":"tingulli i gjatë i (night, sky, smile)","h":"Pyeteni: “What were you like when you were a baby?”"},"Fluency Time 4":{"t":"përshkrimi i njerëzve","g":"“He's got … He's wearing …”","h":"Përshkruani një familjar dhe fëmija e gjen."},"13":{"t":"Egjipti i lashtë","w":"pyramid, king, queen, mummy; lived, cooked, played","g":"koha e shkuar e foljeve të rregullta: “They lived 5,000 years ago.” / “They didn't cook pizza.”","p":"tingulli i gjatë o (snow, coat, nose)","h":"Pyeteni: “What did you play yesterday?”"},"14":{"t":"dita e shkollës dhe kampimi","w":"tent, torch, sleeping bag, campfire; what / when / where","g":"pyetjet në të shkuarën: “Did you have a good day?” – “Yes, I did. / No, I didn't.” · “What did you watch?”","p":"tingulli i gjatë u (moon, blue, tune)","h":"Çdo ditë pas shkollës: “Did you have a good day?”"},"15":{"t":"pushimet","w":"suitcase, passport, ticket, beach, hotel; tomorrow, next week","g":"plane për të ardhmen: “I'm going to swim tomorrow.” · “Are you going to …?”","p":"oo (book, wool, hood)","h":"Pyeteni: “What are you going to do at the weekend?”"},"Fluency Time 5":{"t":"pushimet","g":"“Where did you go?” · “It was great!”","h":"Flisni për pushimet e fundit në anglisht."}},"English Plus 1":{"Starter":{"t":"klasa, ditët dhe muajt","w":"board, dictionary, shelf, laptop; Monday … Sunday; January … December","g":"foljet “be” · përemrat (I, you, he / my, your, his) · ’s","h":"Pyeteni: “What's the date today?”"},"1":{"t":"koha e lirë dhe hobet","w":"martial arts, computer games, meeting friends, watching TV, guitar, laptop","g":"“have got” · parafjalët about / of / by · fjalët pyetëse (who, what, where)","h":"Pyeteni: “What have you got in your bag?”"},"2":{"t":"vendet në qytet","w":"train station, office, library, shops; quiet, dirty, safe","g":"there is / there are · a / an / some / any · mbiemrat krahasorë (bigger, more interesting)","h":"Pyeteni: “Is there a library in our town?”"},"3":{"t":"shtetet, kombësitë dhe gjuhët","w":"British, Spanish, Polish, Albanian; have lunch, watch TV, go to bed","g":"koha e tashme e thjeshtë (pohore, mohore, pyetëse) · always / usually / sometimes / never","h":"Pyeteni: “What do you usually do after school?”"},"4":{"t":"kafshët dhe natyra","w":"snake, frog, elephant, bear, parrot, owl, shark, whale, spider, butterfly, chameleon","g":"koha e tashme e vazhdueshme (“It's hunting.”) dhe dallimi me të tashmen e thjeshtë","h":"Shikoni një dokumentar me kafshë: “What is it doing?”"},"5":{"t":"shkolla dhe ushqimi","w":"maths, science, basketball, music; salad, chips, soup, sweets","g":"can për aftësi dhe leje · some / any / much / many / a lot of · ftesat","h":"Pyeteni: “Can you play basketball?” · “How much water do you drink?”"},"6":{"t":"profesionet dhe emrat","w":"inventor, firefighter, explorer, writer; named, established, discovered","g":"koha e shkuar: was / were, there was / were, foljet e rregullta","h":"Pyeteni: “Where were you on Saturday?”"},"7":{"t":"sportet dhe përshkrimi i njerëzve","w":"cycling, swimming, ice hockey, skiing; tall, short, blonde, dark","g":"koha e shkuar e foljeve të rregullta dhe të parregullta · pyetjet në të shkuarën","h":"Pyeteni: “What did you do yesterday?”"},"8":{"t":"udhëtimi dhe moti","w":"map, compass, rope, rucksack; wind, storm, rain, sun","g":"urdhërorja · “be going to” · will / won't","h":"Pyeteni: “What are you going to do this weekend?”"},"Options":{"t":"pjesë shtesë: dëgjim, kulturë dhe projekte","h":"Pyeteni çfarë projekti bënë në klasë."}},"English Plus 1 New":{"Starter":{"t":"koha e lirë, sendet, mbiemrat dhe shtetet","w":"video games, music, art, animals; laptop, bag, coat; new, fast, cheap, boring; Spain, Turkey, Japan, China","g":"foljet “be” · përemrat dhe mbiemrat pronorë · ’s · this / that / these / those · have got · fjalët pyetëse","h":"Pyeteni: “Where are you from?” dhe “What's in your bag?”"},"1":{"t":"vendet në qytet","w":"restaurant, school, park, library, station, museum; old, quiet, pretty","g":"there's / there are · a / an / some / any · “Is there …? / How many …?” · krahasorja (older, more beautiful)","h":"Pyeteni: “How many shops are there in our street?”"},"2":{"t":"rutina ditore dhe ditët e veçanta","w":"get up, have classes, study; sing, dance, wear","g":"koha e tashme e thjeshtë · always / usually / often / sometimes / never · pyetjet me “Do / Does”","h":"Pyeteni: “What time do you usually get up?”"},"3":{"t":"kafshët","w":"camel, butterfly, snake; kill, grow, survive; beautiful, common, dull","g":"sipërorja (the biggest, the most dangerous) · can për aftësi · pyetjet me How …? (How fast / How long)","h":"Pyeteni: “What's the most dangerous animal?”"},"4":{"t":"lëndët e shkollës dhe mësimi i gjuhës","w":"maths, English, history; primary school, boarding school; listen, check, repeat","g":"koha e tashme e vazhdueshme (“I'm studying.”) dhe dallimi me të tashmen e thjeshtë","h":"Pyeteni: “What are you studying at school this week?”"},"5":{"t":"ushqimi dhe shëndeti","w":"burger, salad, meat, dish, vitamins; fit, hungry","g":"emrat e numërueshëm / të panumërueshëm · some / any / much / many / a lot of · urdhërorja","h":"Pyeteni: “How much water do you drink every day?”"},"6":{"t":"sportet","w":"football, athletics, cycling; winner, competitor, swimmer","g":"there was / there were · was / were · koha e shkuar (completed, became)","h":"Pyeteni: “Who was the winner of the last match?”"},"7":{"t":"përshkrimi i njerëzve dhe ngjarjet e jetës","w":"short, round, moustache; grow up, go to school; grow, change, give","g":"përemrat në kallëzore (me, him, her, them) · koha e shkuar pohore, mohore dhe pyetëse","h":"Pyeteni: “Where did you go to school?” (edhe prindërit tregojnë)"},"8":{"t":"pushimet dhe moti","w":"rucksack, tent, water bottle; windy, stormy, foggy; cool, expensive","g":"“be going to” · will / won't · ofertat dhe premtimet (“I'll help you.”)","h":"Pyeteni: “What are you going to do next summer?”"},"Options":{"t":"pjesë shtesë: dëgjim, kulturë dhe projekte","h":"Pyeteni çfarë projekti bënë në klasë."}},"English Plus 2":{"Starter":{"t":"familja","w":"mother, father, sister, brother, cousin","g":"foljet “be” · përemrat vetorë · ’s","h":"Pyeteni për familjen: “How many cousins have you got?”"},"1":{"t":"sendet personale dhe koha e lirë","w":"bag, bus pass, clothes; watch TV, listen to music, meet friends","g":"koha e tashme e thjeshtë · ndajfoljet e shpeshtësisë","h":"Pyeteni: “How often do you meet your friends?”"},"2":{"t":"shtëpia dhe punët e shtëpisë","w":"table, chair, sofa, cupboard; make breakfast, take out the rubbish","g":"koha e tashme e vazhdueshme","h":"Kur ndihmon në shtëpi: “What are you doing?”"},"3":{"t":"ndjenjat dhe ngjarjet e jetës","w":"cute, nervous, lucky; become a professional, have a child","g":"was / were · koha e shkuar e thjeshtë","h":"Pyeteni: “What did you do last weekend?”"},"4":{"t":"lëvizja dhe gjeografia","w":"across, around, down; desert, falls, forest","g":"koha e shkuar e vazhdueshme · propozimet","h":"Pyeteni: “What were you doing at 8 o'clock yesterday?”"},"5":{"t":"aftësitë dhe cilësitë","w":"paint, painter, compose, composer; artistic, common","g":"can / could · pyetjet me How …?","h":"Pyeteni: “What could you do when you were five?”"},"6":{"t":"koha dhe numrat","w":"a millennium, a century; lucky, superstitious; helpful, easy-going, impatient","g":"will / won't për parashikime","h":"Pyeteni: “What will you do in 10 years?”"},"7":{"t":"sportet","w":"captain, champion, finalist; tennis tournament, athletics stadium","g":"urdhërorja · “be going to” · dallimi will / be going to","h":"Pyeteni: “Which sport are you going to try?”"},"8":{"t":"emocionet dhe lëndimet","w":"enthusiastic about, bad at, fond of; cut, burn, a burn","g":"koha e kryer (present perfect): “I have visited …”","h":"Pyeteni: “Have you ever been to …?”"},"Options":{"t":"pjesë shtesë: dëgjim, kulturë dhe projekte","h":"Pyeteni çfarë projekti bënë në klasë."}},"English Plus 2 New":{"Starter":{"t":"familja","w":"brother, father, husband, wife, aunt, uncle","g":"foljet “be” · mbiemrat pronorë · fjalët pyetëse","h":"Pyeteni për familjen në anglisht."},"1":{"t":"si e kalojmë kohën","w":"at school, at the shops, awake; allow, ban, let; watch TV, listen to music, meet friends","g":"koha e tashme e thjeshtë (pohore dhe mohore) · -s në vetën e tretë","h":"Pyeteni: “How do you spend your free time?”"},"2":{"t":"komunikimi","w":"email, letter, card; colourful, funny; be engaged, call back, hang up","g":"koha e tashme e vazhdueshme","h":"Pyeteni: “Who are you texting?” / “What are you doing now?”"},"3":{"t":"e kaluara – njerëz dhe vende","w":"poor, popular, brilliant, brave; museum, exhibition; stay, help, visit","g":"was / were · there was / there were · foljet e rregullta në të shkuarën","h":"Pyeteni: “Where were you last Saturday?”"},"4":{"t":"veprimet dhe fotot","w":"hold, stand in, jump up, sit on; yell, team; slow – slowly, brave – bravely, good – well","g":"koha e shkuar e vazhdueshme (“I was running.”) · mbiemrat dhe ndajfoljet","h":"Pyeteni për një foto: “What were you doing here?”"},"5":{"t":"arritjet, njësitë matëse dhe punët","w":"billion, century, decade; programmer, professor, inventor","g":"krahasorja dhe sipërorja (faster, the fastest, more / the most …)","h":"Pyeteni: “Who is the tallest person in our family?”"},"6":{"t":"mbijetesa","w":"build, find, follow, climb; compass, first-aid kit, map; competitive, fit, bossy","g":"kushtorja e parë: “If it rains, we will stay at home.” · will / won't","h":"Pyeteni: “If it's sunny tomorrow, what will you do?”"},"7":{"t":"muzika","w":"rap, samba, lyrics; reality, hit, star; ambition – ambitious, charm – charming","g":"“be going to” dhe dallimi me will","h":"Pyeteni: “What song are you going to learn?”"},"8":{"t":"ndjenjat dhe lëndimet","w":"enthusiastic about, bad at, fond of; ridiculous, fatal, excited; cut, burn","g":"koha e kryer (present perfect): “I have seen …” / “I haven't …”","h":"Pyeteni: “Have you ever been scared of something?”"},"Options":{"t":"pjesë shtesë: dëgjim, kulturë dhe projekte","h":"Pyeteni çfarë projekti bënë në klasë."}}},"gen":{"Review":{"t":"përsëritje e njësive të mëparshme","h":"Pyeteni fëmijën çfarë i kujtohet nga unitet e fundit."},"Culture":{"t":"kulturë – si jetojnë fëmijët në vende të tjera","h":"Krahasoni me Kosovën: çfarë është njësoj, çfarë ndryshe?"},"Values Time":{"t":"vlerat – sjellja e mirë","h":"Flisni për vlerën e javës dhe si e zbatojmë në shtëpi."},"Grammar":{"t":"përmbledhje e gramatikës","h":"Përsëritni tabelat e gramatikës në fund të librit."},"Dictionary":{"t":"fjalori me figura","h":"Përsëritni fjalët me fjalorin me figura në fund të librit."}}};
  function unitDetail(book, r) {
    var b = BOOK_DETAILS.books[BOOK_ALIAS[book] || book] || {}, u = String(r.u || "");
    if (b[u]) return b[u];
    var gk = Object.keys(BOOK_DETAILS.gen).filter(function (k) { return u.indexOf(k) === 0; })[0];
    return gk ? BOOK_DETAILS.gen[gk] : null;
  }
  function weekLessons(g, a, b) {
    var n = 0;
    Object.keys(data().logs).forEach(function (k) {
      var p = k.split("~");
      if (p[0] !== g.id || p[1] < a || p[1] > b) return;
      var l = data().logs[k]; Object.keys(l).forEach(function (sl) { if (l[sl] != null) n++; });
    });
    return n;
  }
  // Lessons on the timetable this week up to today (holidays skipped) — for weeks where lessons weren't marked
  function schedWeek(g, a, b) {
    var n = 0, end = b < todayStr() ? b : todayStr();
    for (var d = parseYmd(a); ymd(d) <= end; d = addDays(d, 1)) {
      var ds = ymd(d);
      if (holidayOn(ds)) continue;
      g.schedule.forEach(function (s) { if (s.d === d.getDay()) n++; });
    }
    return n;
  }
  function weekMarked(g, a, b) { return weekLessons(g, a, b) > 0 || (data().pg[g.id] || []).some(function (r) { return r.date >= a && r.date <= b; }); }
  function parentReport(g, mon) {
    var a = ymd(mon), b = ymd(addDays(mon, 6));
    var recs = (data().pg[g.id] || []).filter(function (r) { return r.date >= a && r.date <= b && r.t != null; })
      .sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    var lessons = weekLessons(g, a, b);
    var from = null, to = null, hws = [];
    recs.forEach(function (r) {
      var rf = r.f != null ? Math.min(+r.f, +r.t) : +r.t;
      if (from == null || rf < from) from = rf;
      if (to == null || r.t > to) to = r.t;
      if (r.w && hws.indexOf(r.w) < 0) hws.push(r.w);
    });
    var pi = pageInfo(g);
    if (!recs.length && !lessons) { // lessons not marked this week: timetable + where the class is now (teacher checks the text)
      var sw = schedWeek(g, a, b);
      if (sw && pi && pi.cur > 0) {
        lessons = sw; to = pi.cur;
        from = Math.max(1, to - Math.max(1, Math.round(pi.ppl * sw)) + 1);
        var ew = wbPagesFor(g.book, from, to);
        if (ew && ew.length) hws.push(pagesText(ew));
        else if (g.hw && g.hw.p && g.hw.d >= a && g.hw.d <= b) hws.push(g.hw.p);
      }
    }
    var bookShort = bookText(g.book).replace(/ \((1st|2nd) ed\.\)$/, "") || "librin e anglishtes";
    var fri = addDays(mon, 4);
    var range = mon.getDate() + (mon.getMonth() !== fri.getMonth() ? " " + MONTHS[mon.getMonth()] : "") + " – " + fri.getDate() + " " + MONTHS[fri.getMonth()] + " " + fri.getFullYear();
    var L = [];
    L.push("📚 *Anglisht – raporti i javës*");
    L.push("👥 Grupi: *" + g.name + "*" + (levelOf(g) ? " · niveli " + levelOf(g) : ""));
    L.push("🗓️ " + range);
    L.push("");
    L.push("Të nderuar prindër,");
    var us = [];
    if (to != null) {
      L.push("këtë javë mbajtëm " + (lessons || recs.length) + (Math.max(lessons, recs.length) === 1 ? " orë" : " orë") + " anglishte me librin *" + bookShort + "* dhe punuam " + (from != null && from !== to ? "faqet *" + from + "–" + to + "*" : "faqen *" + to + "*") + " të Student's Book.");
      us = unitsFor(g.book, from != null ? from : to, to);
    } else if (lessons && pi) {
      L.push("këtë javë mbajtëm " + lessons + " orë anglishte me librin *" + bookShort + "*.");
      var cu = unitAt(g, Math.max(1, pi.cur));
      if (cu) us = [cu];
    } else {
      L.push(lessons ? "këtë javë mbajtëm " + lessons + " orë anglishte me librin *" + bookShort + "*." : "këtë javë nuk kishim orë mësimi të shënuara.");
    }
    var homes = [];
    if (us.length) {
      L.push("");
      L.push("✏️ *Çfarë mësuam këtë javë:*");
      us.forEach(function (u) {
        var d = unitDetail(g.book, u) || {};
        L.push("");
        L.push("📖 *" + unitLabel(u) + "*");
        if (d.t) L.push("• Tema: " + d.t);
        else if (u.sq) L.push("• " + u.sq);
        if (d.w) L.push("• Fjalë të reja: _" + d.w + "_");
        if (d.g) L.push("• Gjuha / gramatika: " + d.g);
        if (d.p) L.push("• Tingujt dhe shkronjat: " + d.p);
        if (d.h && homes.indexOf(d.h) < 0) homes.push(d.h);
      });
    }
    if (hws.length) {
      L.push("");
      var hset = {}, hok = true;
      hws.forEach(function (w) { String(w).split(/[,;]/).forEach(function (x) { var m = x.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/); if (!m) { hok = false; return; } for (var q = +m[1]; q <= +(m[2] || m[1]) && q - m[1] < 40; q++) hset[q] = 1; }); });
      var hlist = Object.keys(hset).map(Number).sort(function (x, y) { return x - y; });
      L.push("📓 *Detyrat e shtëpisë:* Workbook " + (hok && hlist.length ? (hlist.length > 1 ? "faqet " : "faqja ") + pagesText(hlist) : hws.map(function (w) { return "f. " + w; }).join(", ")) + ". Ju lutemi kontrolloni që janë bërë.");
    }
    if (homes.length) {
      L.push("");
      L.push("🏠 *Si të ndihmoni në shtëpi (5 minuta në ditë):*");
      homes.forEach(function (x) { L.push("• " + x); });
    }
    if (pi) {
      var cur = to != null ? to : pi.cur; // progress as it was at the end of that week
      L.push("");
      L.push("📈 *Progresi:* " + Math.round(cur / pi.total * 100) + "% e librit (faqja " + cur + " nga " + pi.total + ").");
      if (cur < pi.total) {
        var nx = Math.max(1, lessonsPerWeek(g)), end = Math.min(pi.total, cur + Math.max(1, Math.round(lessonPages(pi) * nx)));
        var nu = unitsFor(g.book, cur + 1, end);
        var started = false;
        var parts = nu.slice(0, 3).map(function (u) {
          var seen = us.some(function (x) { return x.from === u.from; }), d = unitDetail(g.book, u);
          var verb = seen ? "vazhdojmë me " : started ? "pastaj " : "fillojmë ";
          if (!seen) started = true;
          return verb + unitLabel(u) + (!seen && d && d.t ? " (" + d.t + ")" : "");
        });
        L.push("🔜 *Javën e ardhshme:* faqet " + rangeText(cur + 1, end) + (parts.length ? " – " + parts.join(", ") : "") + ".");
      } else L.push("🎉 E përfunduam librin!");
    }
    L.push("");
    L.push("Faleminderit për bashkëpunimin! 🙏");
    L.push("Prof. Muhamer — Cambridge School");
    return L.join("\n");
  }

  // Friday: every group's report in one place, with "sent" ticks (kept on this device)
  function sheetAllParents(s) {
    var mon = s.mon, wk = ymd(mon), sent = {};
    data().groups.forEach(function (g) { if (getK("g~_cfg~sent~" + wk + "~" + g.id)) sent[g.id] = 1; });
    var a = ymd(mon), b = ymd(addDays(mon, 6));
    var gs = data().groups.filter(function (g) { return weekMarked(g, a, b) || schedWeek(g, a, b) > 0; });
    var others = data().groups.filter(function (g) { return gs.indexOf(g) < 0; });
    var h = sheetHead("💬 Raportet e javës për prindërit", "Java " + esc(fmtShort(mon).replace(/ \d{4}$/, "")) + " – " + esc(fmtShort(addDays(mon, 4))));
    h += '<div class="sheet-body">';
    h += '<div class="class-tools"><div class="daynav"><button type="button" class="icon-btn" data-a="apWeek" data-d="-7" aria-label="Java e kaluar"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<button type="button" class="icon-btn" data-a="apWeek" data-d="7" aria-label="Java tjetër"' + (ymd(addDays(mon, 7)) > todayStr() ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
      '<span class="small"><b>' + Object.keys(sent).filter(function (k) { return sent[k]; }).length + "</b> / " + gs.length + " të dërguara</span></div>";
    h += '<p class="muted tiny" style="margin:0 0 8px">Për çdo grup: <b>Dërgo</b> hap Viber-in me tekstin gati (ose e kopjon). <b>Shiko</b> për ta lexuar ose ndryshuar para dërgimit.</p>';
    if (!gs.length) h += '<p class="muted center" style="padding:20px">Këtë javë nuk ka mësime të shënuara.</p>';
    gs.forEach(function (g) {
      var ok = !!sent[g.id];
      h += '<div class="ap-row' + (ok ? " is-sent" : "") + '" style="--gc:' + g.color + '"><span class="gdot"></span><span class="grow">' + gi(g) + '<b>' + esc(g.name) + "</b> " + levelChip(g) + '<small>' + (ok ? "✓ dërguar" : weekMarked(g, a, b) ? "gati për dërgim" : "⚠️ mësimet s'u shënuan — kontrolloni faqet te Shiko") + "</small></span>" +
        '<button type="button" class="btn btn-sm" data-a="apOpen" data-g="' + esc(g.id) + '">Shiko</button>' +
        '<button type="button" class="btn btn-sm ' + (ok ? "btn-soft" : "btn-primary") + '" data-a="apSend" data-g="' + esc(g.id) + '">' + (ok ? "Sërish" : "Dërgo") + "</button></div>";
    });
    if (others.length) h += '<p class="muted tiny" style="margin-top:10px">Pa mësime këtë javë: ' + others.map(function (g) { return esc(groupIcon(g) + " " + g.short); }).join(", ") + "</p>";
    h += "</div>";
    h += '<div class="sheet-foot"><button type="button" class="btn btn-primary" data-a="closeSheet">Gati</button></div>';
    return h;
  }
  function markSent(mon, gid) {
    setK("g~_cfg~sent~" + ymd(mon) + "~" + gid, 1, true); // synced, so every device sees what was sent
  }
  function sendText(t) {
    if (navigator.share && /android|iphone|ipad/i.test(navigator.userAgent)) { navigator.share({ text: t }).catch(function () { }); return; }
    copyText(t);
    setTimeout(function () { location.href = "viber://forward?text=" + encodeURIComponent(t); }, 300);
  }

  function sheetParents(s) {
    var g = data().gById[s.g];
    if (!g) return "";
    if (s.text == null) s.text = parentReport(g, s.mon);
    var cts = contentsOf(g.book);
    var h = sheetHead("💬 Raport për prindërit · " + esc(groupIcon(g) + " " + g.short), "Java " + esc(fmtShort(s.mon).replace(/ \d{4}$/, "")) + " – " + esc(fmtShort(addDays(s.mon, 4))));
    h += '<div class="sheet-body">';
    h += '<div class="class-tools"><div class="daynav"><button type="button" class="icon-btn" data-a="prWeek" data-d="-7" aria-label="Java e kaluar"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<button type="button" class="icon-btn" data-a="prWeek" data-d="7" aria-label="Java tjetër"' + (ymd(addDays(s.mon, 7)) > todayStr() ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-a="prRegen">↺ Rigjenero</button></div>';
    var wa = ymd(s.mon), wb2 = ymd(addDays(s.mon, 6));
    if (!weekMarked(g, wa, wb2) && schedWeek(g, wa, wb2)) h += '<p class="note" style="margin-bottom:8px">⚠️ Këtë javë mësimet nuk u shënuan me “✓ U krye”. Faqet dhe detyra janë llogaritur nga orari dhe faqja ku është grupi tani — kontrollojini para dërgimit.</p>';
    if (!cts.length) h += '<p class="note" style="margin-bottom:8px">Shtoni përmbajtjen e librit (<b>📚 Përmbajtja</b> te faqja e grupit) që raporti të tregojë edhe temat e mësuara.</p>';
    h += '<textarea class="input pr-text" rows="16" data-prt="1">' + esc(s.text) + "</textarea>";
    h += '<p class="muted tiny" style="margin-top:6px">Mund ta ndryshoni tekstin para se ta dërgoni. *Yjet* e bëjnë tekstin të trashë në Viber.</p>';
    h += "</div>";
    h += '<div class="sheet-foot"><button type="button" class="btn" data-a="prCopy">📋 Kopjo</button><button type="button" class="btn btn-primary" data-a="prViber">💬 Dërgo në Viber</button></div>';
    return h;
  }

  function sheetContents(s) {
    var g = data().gById[s.g];
    if (!g) return "";
    var rows = s.rows;
    var h = sheetHead("📚 Përmbajtja · " + esc(g.book || g.short), "Vlen për të gjitha grupet me këtë libër");
    h += '<div class="sheet-body">';
    h += '<div class="photo-box">' + (s.busy
      ? '<div class="spin"></div><b>Duke lexuar fotot…</b><span class="small muted">Zakonisht 10–40 sekonda. Mos e mbyllni.</span>'
      : '<b>📷 Nga fotoja e faqes “Contents”</b><span class="small muted">Bëni foto faqes së përmbajtjes (1–4 foto). Aplikacioni i nxjerr vetë unitet, faqet dhe përshkrimet në shqip.</span>' +
        '<button type="button" class="btn btn-primary btn-sm" data-a="ctPhoto">📷 Ngarko foton</button><input type="file" id="ct-file" accept="image/*" multiple class="hidden">') +
      (s.photoErr ? '<p class="err">' + esc(s.photoErr) + "</p>" : "") +
      (s.photoOk ? '<p class="ok-msg">✓ U lexuan ' + s.photoOk + " unite. Kontrolloni faqet më poshtë dhe shtypni <b>Ruaj</b>.</p>" : "") + "</div>";
    h += '<p class="small muted" style="margin:12px 0 10px">Ose shkruajini vetë: për çdo unit faqja ku fillon në Student\'s Book, titulli, dhe çfarë mësojnë fëmijët (shqip, për prindërit).</p>';
    rows.forEach(function (r, i) {
      h += '<div class="ct-row"><div class="ct-top"><input class="input" data-ct="' + i + '" data-k="u" value="' + esc(r.u) + '" placeholder="Unit"><input class="input" data-ct="' + i + '" data-k="from" value="' + esc(r.from) + '" placeholder="Faqja" inputmode="numeric">' +
        '<button type="button" class="icon-btn" data-a="ctDel" data-i="' + i + '" aria-label="Hiq"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>' +
        '<input class="input" data-ct="' + i + '" data-k="t" value="' + esc(r.t) + '" placeholder="Titulli, p.sh. Where were you yesterday?">' +
        '<textarea class="input" rows="2" data-ct="' + i + '" data-k="sq" placeholder="Çfarë mësojnë, p.sh. kohën e shkuar të foljes “to be”, fjalë për vendet në qytet">' + esc(r.sq) + "</textarea></div>";
    });
    h += '<button type="button" class="btn btn-sm btn-soft" data-a="ctAdd">+ Shto unit</button></div>';
    h += '<div class="sheet-foot"><button type="button" class="btn" data-a="closeSheet">Anulo</button><button type="button" class="btn btn-primary" data-a="ctSave">Ruaj</button></div>';
    return h;
  }

  // ——— Contents from photos (server reads them with AI; see api/contents.js) ———
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = reject;
      r.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = 1800, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
          var c = document.createElement("canvas");
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.85));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  function readContentsPhotos(sh, files) {
    var c = Sync.cfg(), g = data().gById[sh.g];
    sh.photoErr = null; sh.photoOk = null;
    if (!navigator.onLine) { sh.photoErr = "Duhet internet për leximin e fotos."; render(true); return; }
    if (!c) { sh.photoErr = "Lidhni fillimisht këtë pajisje me kodin e klasës (Më shumë → Sinkronizimi)."; render(true); return; }
    sh.busy = true; render(true);
    Promise.all(files.map(shrinkImage)).then(function (images) {
      return fetch(Sync.api().replace(/\/api\/sync$/, "/api/contents"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cb-code": c.code },
        body: JSON.stringify({ images: images, book: g ? g.book : "" }),
      }).then(function (r) { return r.json().catch(function () { return { ok: false, error: "HTTP " + r.status }; }); });
    }).then(function (res) {
      sh.busy = false;
      if (!res || !res.ok) {
        var e = res && res.error;
        sh.photoErr = ({
          bad_code: "Kodi i klasës nuk pranohet.",
          no_ai: "Leximi me AI nuk është aktiv në Vercel.",
          ai_auth: "Leximi me AI nuk është aktiv në Vercel (AI Gateway).",
          ai_credits: "Kreditet e AI në Vercel kanë mbaruar.",
          too_large: "Fotot janë shumë të mëdha. Provoni me më pak foto.",
          ai_parse: "Fotoja nuk u lexua qartë. Provoni një foto më të ndritshme dhe të drejtë.",
        })[e] || "Leximi dështoi (" + (e || "gabim") + "). Provoni përsëri.";
        render(true); return;
      }
      if (!res.units.length) { sh.photoErr = "Nuk u gjet asnjë unit me numër faqeje. Provoni një foto më të qartë të faqes Contents."; render(true); return; }
      sh.rows = res.units.map(function (u) { return { u: u.u, from: String(u.from), t: u.t, sq: u.sq }; });
      sh.photoOk = res.units.length;
      render(true);
    }).catch(function () {
      sh.busy = false;
      sh.photoErr = "Nuk u arrit serveri. Kontrolloni internetin dhe provoni përsëri.";
      render(true);
    });
  }

  // ——— Group report (print / Save as PDF) ———
  function printReport(gid) {
    var g = data().gById[gid];
    if (!g) return;
    var f = forecast(g), pi = pageInfo(g), wi = wbInfo(g), stu = studentsOf(gid);
    var att = data().att, hw = data().hw, star = data().star;
    var rows = stu.map(function (s, i) {
      var P = 0, L = 0, Ab = 0, Y = 0, N = 0, so = studentStats(s.id);
      Object.keys(att).forEach(function (d) { var a = att[d][s.id]; if (a === "P") P++; else if (a === "L") L++; else if (a === "A") Ab++; });
      Object.keys(hw).forEach(function (d) { var w = hw[d][s.id]; if (w === "Y") Y++; else if (w === "N") N++; });
      var tot = P + L + Ab;
      return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(s.name) + "</b></td><td>" + P + "</td><td>" + L + "</td><td>" + Ab + "</td><td>" + (tot ? Math.round((P + L) / tot * 100) + "%" : "—") + "</td><td>" + Y + "</td><td>" + N + "</td><td>" + esc(marksText(so)) + "</td><td>" + esc(s.note || "") + "</td></tr>";
    }).join("");
    var hRep = '<div class="rep"><div class="rep-head"><div><div class="rep-kicker">Cambridge School · Prof. Muhamer</div><h1>Raport — ' + esc(g.name) + "</h1><div>" + esc(bookText(g.book)) + (levelText(g) ? " · Niveli " + esc(levelText(g)) : "") + "</div></div><div class=\"rep-date\">" + esc(fmtLong(now())) + "</div></div>" +
      '<div class="rep-kpis">' +
      "<div><span>Mësime</span><b>" + g.done + " / " + g.total + "</b></div>" +
      "<div><span>Student's Book</span><b>" + (pi ? "f. " + pi.cur + " / " + pi.total + " (" + pi.pct + "%)" : esc(g.sb ? "f. " + g.sb : "—")) + "</b></div>" +
      "<div><span>Workbook</span><b>" + (wi ? "f. " + wi.cur + " / " + wi.total + " (" + wi.pct + "%)" : esc(g.wb ? "f. " + g.wb : "—")) + "</b></div>" +
      "<div><span>Mbaron rreth</span><b>" + (f.rem ? esc(fmtShort(f.date)) : "Përfunduar") + "</b></div>" +
      (pi && pi.left > 0 ? "<div><span>Objektivi</span><b>≈ " + r1(pi.need) + " faqe / mësim</b></div>" : "") +
      "<div><span>Nxënës</span><b>" + stu.length + "</b></div></div>" +
      '<table class="rep-t"><thead><tr><th>#</th><th>Nxënësi</th><th>Prezent</th><th>Vonë</th><th>Mungesa</th><th>Prezenca</th><th>Detyra ✓</th><th>Detyra ✗</th><th>Pikët (★5 +3 −2)</th><th>Shënime</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<p class="rep-foot">Gjeneruar nga Classboard · ' + esc(fmtLong(now())) + "</p></div>";
    var root = $("#print-root");
    if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
    root.innerHTML = hRep;
    document.body.classList.add("printing");
    var old = document.title;
    document.title = "Raport " + g.name + " " + todayStr();
    function done() { document.body.classList.remove("printing"); document.title = old; window.removeEventListener("afterprint", done); }
    window.addEventListener("afterprint", done);
    setTimeout(function () { window.print(); setTimeout(done, 1500); }, 60);
  }

  // ——— Automatic weekly backups (kept on this device) ———
  function snapshots() { var l = loadLS(LS_BK, []); return Array.isArray(l) ? l.filter(function (x) { return x && x.kv; }) : []; }
  function makeSnapshot() {
    var list = snapshots();
    list.unshift({ t: Date.now(), n: Object.keys(kv).length, kv: JSON.parse(JSON.stringify(kv)) });
    for (var keep = 5; keep >= 1; keep--) {
      try { localStorage.setItem(LS_BK, JSON.stringify(list.slice(0, keep))); return true; } catch (e) { }
    }
    return false;
  }
  function autoSnapshot() {
    var l = snapshots();
    if (!l.length || Date.now() - l[0].t > 7 * 864e5) makeSnapshot();
  }
  function fmtStamp(t) { var d = new Date(t); return d.getDate() + " " + MONTHS_S[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  // ——— PIN lock (this device only) ———
  function pinHash(p) { var h = 2166136261, s2 = "classboard:" + p; for (var i = 0; i < s2.length; i++) { h ^= s2.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function showLock() {
    if (!meta.pin || $("#lock-root")) return;
    var el = document.createElement("div");
    el.id = "lock-root";
    el.innerHTML = '<div class="lock"><img src="icons/icon.svg" alt="" width="56" height="56"><h2>Classboard</h2><p class="muted">Shkruani PIN-in</p>' +
      '<input type="password" inputmode="numeric" autocomplete="off" maxlength="8" class="input lock-in" aria-label="PIN"><p class="err lock-err"></p>' +
      '<button type="button" class="btn btn-primary btn-block lock-ok">Hap</button><button type="button" class="btn btn-ghost btn-sm lock-forgot" style="margin-top:14px">Harruat PIN-in?</button></div>';
    document.body.appendChild(el);
    document.body.style.overflow = "hidden";
    var inp = $(".lock-in", el);
    function tryOpen() {
      if (pinHash(inp.value.trim()) === meta.pin) { el.remove(); document.body.style.overflow = ui.sheet ? "hidden" : ""; }
      else { $(".lock-err", el).textContent = "PIN i gabuar."; inp.value = ""; inp.focus(); }
    }
    $(".lock-ok", el).addEventListener("click", tryOpen);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") tryOpen(); });
    $(".lock-forgot", el).addEventListener("click", function () {
      ask("Fshi të dhënat në këtë pajisje?", "Hiqet PIN-i dhe të dhënat në këtë pajisje. Nëse pajisja ishte e lidhur, i merrni përsëri duke shkruar kodin e klasës (Më shumë → Sinkronizimi).", "Fshi", true).then(function (ok) {
        if (!ok) return;
        try { localStorage.removeItem(LS_KV); localStorage.removeItem(LS_META); localStorage.removeItem(LS_BK); } catch (e) { }
        location.reload();
      });
    });
    setTimeout(function () { inp.focus(); }, 50);
  }
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) hiddenAt = Date.now();
    else if (meta.pin && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) showLock();
  });

  function kpi(v, label) { return '<div class="kpi"><b>' + v + "</b><span>" + esc(label) + "</span></div>"; }

  // ——— More / settings ———
  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; if (ui.tab === "more") render(); });

  function viewMore() {
    var c = Sync.cfg();
    var h = '<div class="set-list">';
    h += '<h1 style="font-size:1.4rem">Më shumë</h1>';

    // Groups with their book and official level
    h += '<div class="card"><h2>🎓 Grupet dhe nivelet (CEFR)</h2><ul class="lvl-list">' + data().groups.map(function (g) {
      return '<li><button type="button" data-a="openGroup" data-g="' + esc(g.id) + '" style="--gc:' + g.color + '"><span class="gdot"></span><span class="grow">' + gi(g) + '<b>' + esc(g.name) + "</b><small>" + esc(bookText(g.book)) + ((bookInfo(g.book) || {}).exam && !g.level ? " · Cambridge " + esc(bookInfo(g.book).exam) : "") + "</small></span>" + (levelOf(g) ? '<span class="lvl lvl-big">' + esc(levelOf(g)) + "</span>" : '<span class="muted small">—</span>') + "</button></li>";
    }).join("") + '</ul><p class="muted tiny" style="margin-top:6px">Niveli vjen nga libri (Oxford). Mund ta ndryshoni te grupi → Ndrysho → Më shumë opsione.</p></div>';

    // Theme (only on this device)
    var th = (function () { try { return localStorage.getItem("cb_theme") || "auto"; } catch (e) { return "auto"; } })();
    h += '<div class="card"><h2>🎨 Pamja</h2><div class="theme-seg">' + [["auto", "Auto"], ["light", "E çelët"], ["dark", "E errët"]].map(function (o) {
      return '<button type="button" class="btn btn-sm' + (th === o[0] ? " on" : "") + '" data-a="theme" data-v="' + o[0] + '">' + o[1] + "</button>";
    }).join("") + '</div><p class="muted tiny" style="margin-top:8px">Auto ndjek pamjen e telefonit (ditë/natë).</p></div>';

    // Sync
    h += '<div class="card"><h2>🔄 Sinkronizimi mes pajisjeve</h2>';
    h += '<div class="status-box ' + "st-" + Sync.S.status + '"><i class="dot"></i><span id="sync-status-line" class="small">' + esc(statusText()) + "</span></div>";
    if (c) {
      h += '<p class="small">Çdo ndryshim ruhet në këtë pajisje dhe dërgohet te serveri juaj në Vercel. Pajisjet e tjera e marrin brenda pak sekondash. Pa internet? Punoni normalisht — dërgohet vetë kur kthehet lidhja.</p>' +
        '<div class="section-title" style="margin-top:14px">Lidh një pajisje tjetër</div>' +
        '<p class="small muted">Hapni lidhjen në pajisjen tjetër, ose shkruani atje kodin e klasës:</p>' +
        '<div class="code-box center" style="margin:8px 0;font-size:1.25rem;font-weight:800;letter-spacing:.08em">' + esc(fmtCode(c.code)) + "</div>" +
        '<div class="row wrap"><button type="button" class="btn btn-primary btn-sm" data-a="shareLink">📤 Dërgo lidhjen</button><button type="button" class="btn btn-sm" data-a="copyLink">📋 Kopjo lidhjen</button><button type="button" class="btn btn-sm" data-a="syncNow">↻ Sinkronizo tani</button></div>' +
        '<details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">Detaje</summary><p class="small muted" style="margin-top:6px">Serveri: ' + esc(Sync.api()) + (Sync.S.lastErr ? "<br>Gabimi i fundit: " + esc(Sync.S.lastErr) : "") + '</p><button type="button" class="btn btn-danger btn-sm" style="margin-top:8px" data-a="disconnect">Shkëput këtë pajisje</button></details>';
    } else {
      var f = (ui.syncForm = ui.syncForm || { key: "" });
      h += '<p class="small">Shkruani kodin e klasës një herë në çdo pajisje (telefon, kompjuter). Pastaj çdo ndryshim shfaqet kudo automatikisht.</p>' +
        '<div class="add-row" style="margin-top:10px"><input class="input" data-sf="key" value="' + esc(f.key) + '" placeholder="Kodi i klasës, p.sh. ABCD-EFGH-JKLM" autocapitalize="characters" autocomplete="off" spellcheck="false" style="text-transform:uppercase;letter-spacing:.05em"><button type="button" class="btn btn-primary" data-a="joinKey">Lidhu</button></div>' +
        (ui.syncErr ? '<p class="err">' + esc(ui.syncErr) + "</p>" : "") +
        '<p class="small muted" style="margin-top:10px">Kodin e gjeni te një pajisje e lidhur (Më shumë → Sinkronizimi), ose te mesazhi i konfigurimit.</p>';
    }
    h += "</div>";

    // Install
    var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (!standalone) {
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      h += '<div class="card"><h2>📱 Instalo si aplikacion</h2>' +
        (deferredInstall ? '<button type="button" class="btn btn-primary" data-a="install">Instalo Classboard</button>'
          : '<p class="small muted">' + (ios ? "Në iPhone: Safari → butoni Share → “Add to Home Screen”." : "Në Chrome: menyja ⋮ → “Install app” / “Add to Home screen”.") + "</p>") +
        (location.protocol === "file:" ? '<p class="note" style="margin-top:8px">Po e hapni nga skedari lokal. Funksionon plotësisht offline; instalimi si aplikacion bëhet nga adresa në Vercel.</p>' : "") +
        "</div>";
    }

    // Holidays
    var hl = holidays(), hf = ui.holForm || {};
    var holEnd = hl.reduce(function (m, x) { return x.b > m ? x.b : m; }, "");
    h += '<div class="card"><h2>🏖️ Pushimet dhe ditët pa mësim</h2><p class="small muted">Në këto ditë nuk shfaqen mësime dhe datat e përfundimit llogariten pa to. Pushimet e gjata (7+ ditë) shtyjnë edhe afatin e nivelit.</p>' +
      (!holEnd || holEnd < ymd(addDays(now(), 60)) ? '<p class="pace-warn">📅 Kalendari i pushimeve mbaron ' + (holEnd ? "më " + esc(fmtShort(parseYmd(holEnd))) : "") + ". Shtoni pushimet e vitit të ri shkollor që datat dhe afatet të dalin saktë.</p>" : "") +
      (hl.length ? '<ul class="hol-list">' + hl.map(function (x, i) {
        return '<li><div><b>' + esc(x.n) + '</b><small>' + esc(fmtShort(parseYmd(x.a))) + (x.b > x.a ? " – " + esc(fmtShort(parseYmd(x.b))) : "") + '</small></div><button type="button" class="icon-btn" data-a="delHoliday" data-i="' + i + '" aria-label="Hiq"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></li>';
      }).join("") + "</ul>" : '<p class="small muted" style="margin-top:8px">Nuk ka pushime të shënuara.</p>') +
      '<div class="hol-form"><input class="input" data-hf="n" value="' + esc(hf.n || "") + '" placeholder="Emri, p.sh. Pushimet dimërore">' +
      '<div class="grid2"><label class="field"><span>Nga</span><input class="input" type="date" data-hf="a" value="' + esc(hf.a || "") + '"></label><label class="field"><span>Deri (opsionale)</span><input class="input" type="date" data-hf="b" value="' + esc(hf.b || "") + '"></label></div>' +
      (ui.holErr ? '<p class="err">' + esc(ui.holErr) + "</p>" : "") +
      '<div class="row wrap"><button type="button" class="btn btn-sm btn-primary" data-a="addHoliday">+ Shto pushim</button><button type="button" class="btn btn-sm btn-soft" data-a="addMasht">Kalendari MASHT 2026–27</button></div></div></div>';

    // Backup
    var snaps = snapshots();
    h += '<div class="card"><h2>💾 Backup</h2><p class="small muted">Ruani një kopje të të gjitha të dhënave, ose rikthejeni atë.</p><div class="row wrap" style="margin-top:10px">' +
      '<button type="button" class="btn btn-sm" data-a="exportJson">⬇ Eksporto</button>' +
      '<button type="button" class="btn btn-sm" data-a="importJson">⬆ Importo</button>' +
      '<input type="file" id="import-file" accept="application/json,.json" class="hidden"></div>' +
      '<div class="section-title" style="margin-top:14px">Kopje automatike (çdo javë, në këtë pajisje)</div>' +
      (snaps.length ? '<ul class="hol-list">' + snaps.map(function (x, i) {
        return '<li><div><b>' + esc(fmtStamp(x.t)) + "</b><small>" + (x.n || Object.keys(x.kv).length) + ' të dhëna</small></div><button type="button" class="btn btn-sm" data-a="snapRestore" data-i="' + i + '">Rikthe</button></li>';
      }).join("") + "</ul>" : '<p class="small muted">Kopja e parë ruhet automatikisht së shpejti.</p>') +
      '<button type="button" class="btn btn-sm btn-soft" style="margin-top:8px" data-a="snapNow">Ruaj një kopje tani</button></div>';

    // PIN
    var pf = ui.pinForm || {};
    h += '<div class="card"><h2>🔒 PIN i pajisjes</h2><p class="small muted">Mbron emrat e nxënësve nëse dikush tjetër e përdor këtë telefon ose kompjuter. Vlen vetëm për këtë pajisje; kërkohet kur hapet aplikacioni dhe pas 5 minutash pa përdorim.</p>' +
      (meta.pin ? '<div class="row wrap" style="margin-top:10px"><span class="chip chip-ok">PIN aktiv</span><button type="button" class="btn btn-sm" data-a="lockNow">Kyç tani</button><button type="button" class="btn btn-sm btn-danger" data-a="removePin">Hiq PIN-in</button></div>'
        : '<div class="grid2" style="margin-top:10px"><input class="input" type="password" inputmode="numeric" maxlength="8" data-pf="p" value="' + esc(pf.p || "") + '" placeholder="PIN (4–8 shifra)"><input class="input" type="password" inputmode="numeric" maxlength="8" data-pf="p2" value="' + esc(pf.p2 || "") + '" placeholder="Përsërite"></div>' +
          (ui.pinErr ? '<p class="err">' + esc(ui.pinErr) + "</p>" : "") + '<button type="button" class="btn btn-sm btn-primary" style="margin-top:8px" data-a="setPin">Vendos PIN</button>') + "</div>";

    // Ideas
    h += '<details class="card"><summary>💡 Ide për Activity Time</summary><ul class="ideas">' +
      IDEAS.map(function (i) { return "<li><b>" + esc(i[0]) + "</b><span>" + esc(i[1]) + "</span></li>"; }).join("") + "</ul></details>";

    h += '<details class="card"><summary>⚠️ Rivendos</summary><p class="small muted" style="margin:8px 0">Kthen grupet dhe nxënësit si në planin e 19 shtatorit 2026. Fshin prezencat dhe shënimet' + (c ? " në të gjitha pajisjet e lidhura" : "") + '.</p><button type="button" class="btn btn-danger btn-sm" data-a="reset">Rivendos të dhënat</button></details>';

    h += '<p class="center muted tiny">Classboard ' + VERSION + " · " + (location.protocol === "file:" ? "skedar lokal" : esc(location.host)) + "</p>";
    h += "</div>";
    return h;
  }

  // ——— Sheets ———
  function viewSheet() {
    var s = ui.sheet, inner = "";
    if (s.type === "class") inner = sheetClass(s);
    else if (s.type === "group") inner = sheetGroup(s);
    else if (s.type === "student") inner = sheetStudent(s);
    else if (s.type === "done") inner = sheetDone(s);
    else if (s.type === "parents") inner = sheetParents(s);
    else if (s.type === "allParents") inner = sheetAllParents(s);
    else if (s.type === "contents") inner = sheetContents(s);
    if (!inner) { ui.sheet = null; return ""; }
    return inner;
  }
  function sheetHead(title, sub) {
    return '<div class="sheet-head"><h2>' + title + (sub ? "<small>" + sub + "</small>" : "") + '</h2><button type="button" class="icon-btn" data-a="closeSheet" aria-label="Mbyll"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
  }

  function sheetDone(s) {
    var g = data().gById[s.g];
    if (!g) return "";
    var f = s.form, pi = pageInfo(g), wi = wbInfo(g);
    var h = sheetHead(esc(groupIcon(g) + " " + g.short) + " · Mësimi " + s.n + " ✓", "Kontrolloni dhe shtypni Ruaj");
    h += '<div class="sheet-body">';
    h += '<label class="field"><span>📖 Ku ndaluat sot në Student\'s Book?</span><input class="input big-num" data-df="sb" inputmode="numeric" enterkeyhint="done" value="' + esc(f.sb) + '" placeholder="numri i faqes">' +
      '<small class="muted">' + (lastNum(s.prevSb) != null ? "Para mësimit: f. " + esc(s.prevSb) + (pi && pi.left > 0 ? " · objektivi ≈ " + r1(pi.need) + " faqe/mësim" : "") : "Shkruajeni një herë — pastaj app-i e llogarit vetë çdo herë.") + "</small></label>";
    h += '<label class="field"><span>📓 Detyra e shtëpisë — Workbook, faqja</span><input class="input big-num" data-df="hw" inputmode="text" enterkeyhint="done" value="' + esc(f.hw) + '" placeholder="p.sh. 45"' + (f.none ? " disabled" : "") + ">" +
      '<small class="muted">' + (s.prevWb ? "Detyra e kaluar: WB f. " + esc(s.prevWb) + (wbMapOf(g.book) ? " · faqet e WB që shkojnë me mësimin e sotëm (ndryshojnë vetë kur ndryshoni SB)" : " · sugjerohet vetë sipas faqeve të SB") : "Shkruajeni një herë — pastaj sugjerohet vetë.") + "</small></label>";
    h += '<button type="button" class="btn btn-sm ' + (f.none ? "btn-primary" : "btn-soft") + '" data-a="dfNone">' + (f.none ? "✓ Pa detyrë sot" : "Pa detyrë sot") + "</button>";
    h += '<div class="center" style="margin-top:18px"><button type="button" class="btn btn-ghost btn-sm muted" data-a="dfUndo">Anulo — mësimi nuk u mbajt</button></div>';
    h += "</div>";
    h += '<div class="sheet-foot"><button type="button" class="btn btn-primary" data-a="dfSave">Ruaj ✓</button></div>';
    return h;
  }
  // Saves a finished lesson. Safe to run again after "Ndrysho" (uses the pages from before the lesson).
  function commitDone(sh) {
    if (!sh || sh.type !== "done" || sh.committed) return;
    sh.committed = true;
    var g = data().gById[sh.g];
    if (!g) return;
    if (sh.prevSb == null) { sh.prevSb = g.sb; sh.prevWb = g.wb; }
    if (sh.prevHw === undefined) sh.prevHw = g.hw && g.hw.d !== sh.date ? g.hw : null;
    var f = sh.form, sb = String(f.sb || "").trim();
    var prev = lastNum(sh.prevSb), to = lastNum(sb);
    var p = f.none ? "" : String(f.hw || "").trim();
    var pgk = "g~" + sh.g + "~pg~" + sh.date + "~" + sh.slot;
    if (to != null) setK(pgk, { f: prev != null ? prev + 1 : to, t: to, w: p, ps: sh.prevSb, pw: sh.prevWb, ph: sh.prevHw }, true);
    else if (getK(pgk) != null) setK(pgk, null, true);
    var newSb = sb || sh.prevSb;
    if (newSb !== g.sb) updGroup(sh.g, { sb: newSb }, true);
    updGroup(sh.g, { hw: { p: p, d: sh.date } }, true);
    var newWb = p || sh.prevWb;
    if (newWb !== g.wb) updGroup(sh.g, { wb: newWb }, true);
    render();
  }

  function sheetClass(s) {
    var g = data().gById[s.g];
    if (!g) return "";
    var stu = studentsOf(g.id), date = s.date;
    var att = data().att[date] || {}, hw = data().hw[date] || {}, star = data().star[date] || {};
    var P = 0, L = 0, A = 0;
    stu.forEach(function (st) { var a = att[st.id]; if (a === "P") P++; else if (a === "L") L++; else if (a === "A") A++; });
    var h = sheetHead(esc(groupIcon(g) + " " + g.short) + " · Prezenca", esc(fmtDayDate(date)) + " · " + stu.length + " nxënës");
    h += '<div class="sheet-body">';
    h += '<div class="class-tools"><div class="daynav"><button type="button" class="icon-btn" data-a="classDay" data-d="-1" aria-label="Dita e kaluar"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<button type="button" class="icon-btn" data-a="classDay" data-d="1" aria-label="Dita tjetër"' + (date >= todayStr() ? " disabled" : "") + '><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
      '<span class="small"><b style="color:var(--ok)">' + P + "</b> prezent" + (L ? ' · <b style="color:#d97706">' + L + "</b> vonë" : "") + (A ? ' · <b style="color:var(--bad)">' + A + "</b> mungojnë" : "") + "</span></div>";
    var chk = hwPending(g, date) || (g.hw && g.hw.p && g.hw.d < date ? g.hw.p : "");
    if (chk) h += '<div class="note" style="margin-bottom:8px">📓 Kontrolloni detyrën: <b>WB f. ' + esc(chk) + "</b></div>";
    h += '<div class="class-btns"><button type="button" class="btn btn-soft btn-sm" data-a="allPresent">✓ Të gjithë prezent</button><button type="button" class="btn btn-soft btn-sm" data-a="allHw">📓 Të gjithë e bënë detyrën</button></div>' +
      '<p class="muted tiny" style="margin:0 0 8px">Pastaj prekni vetëm ata që mungojnë ose s\'e bënë detyrën.</p>';
    var streaks = hwStreaks(), gst = groupStats(g.id);
    if (!stu.length) h += '<p class="muted center" style="padding:20px">Nuk ka nxënës në këtë grup.</p>';
    stu.forEach(function (st) {
      var a = att[st.id] || "", w = hw[st.id] || "", p = star[st.id] || "";
      h += '<div class="crow">' +
        '<button type="button" class="att' + (a ? " att-" + a : "") + '" data-a="att" data-s="' + esc(st.id) + '" aria-label="Prezenca">' + ({ P: "✓", L: "⏰", A: "✗" }[a] || "·") + "</button>" +
        '<button type="button" class="nm" data-a="openStudent" data-s="' + esc(st.id) + '">' + esc(st.name) + ((streaks[st.id] || 0) >= 3 ? ' <span title="' + streaks[st.id] + ' herë radhazi pa detyrë">⚠️</span>' : "") + (gst[st.id].pts ? ' <small class="pts">' + gst[st.id].pts + " p</small>" : "") + "</button>" +
        '<button type="button" class="hw' + (w ? " hw-" + w : "") + '" data-a="hw" data-s="' + esc(st.id) + '" aria-label="Detyra">' + ({ Y: "DSh ✓", N: "DSh ✗" }[w] || "DSh") + "</button>" +
        '<button type="button" class="star' + (MARKS[p] ? " " + MARKS[p].cls : "") + '" data-a="star" data-s="' + esc(st.id) + '" aria-label="Pikët: ' + (MARKS[p] ? MARKS[p].label : "pa shenjë") + '">' + markBtn(p) + "</button>" +
        "</div>";
    });
    h += '<div class="legend"><span>Prekni: ✓ prezent → ⏰ vonë → ✗ mungon</span><span>DSh = detyra e shtëpisë</span><span>Pikët: ☆ → ★ = 5 → + = 3 → − = −2</span></div>';
    h += "</div>";
    h += '<div class="sheet-foot"><button type="button" class="btn btn-primary" data-a="closeSheet">Gati</button></div>';
    return h;
  }

  function sheetGroup(s) {
    var f = s.form;
    var isNew = !s.g;
    var h = sheetHead(isNew ? "Grup i ri" : "Ndrysho grupin", isNew ? "Vetëm emri është i detyrueshëm" : "");
    h += '<div class="sheet-body">';
    h += '<label class="field"><span>Emri i grupit</span><input class="input" data-gf="name" value="' + esc(f.name) + '" placeholder="p.sh. FF2 Mëngjes" id="gf-name"></label>';
    h += '<label class="field"><span>Emri i shkurtër (për ekranin Sot)</span><input class="input" data-gf="short" value="' + esc(f.short) + '" placeholder="' + esc(f.name || "FF2 M") + '"></label>';
    var bi = bookInfo(f.book);
    h += '<div class="field"><span>Libri</span><div class="book-pick">' + BOOKS.map(function (b, i) {
      return '<button type="button" class="' + ((BOOK_ALIAS[f.book] || f.book) === b.name ? "on" : "") + '" data-a="pickBook" data-i="' + i + '">' + esc(b.short) + ' <small>' + esc(b.cefr) + "</small></button>";
    }).join("") + '</div>' + (bi ? '<small class="muted">Niveli: <b>' + esc(bi.cefr) + "</b>" + (bi.exam ? " (Cambridge " + esc(bi.exam) + ")" : "") + (bi.end ? " · kursi mbaron te SB f. " + bi.end : "") + "</small>" : '<input class="input" data-gf="book" value="' + esc(f.book) + '" placeholder="ose shkruani emrin e librit">') + "</div>";
    h += '<div class="grid2"><label class="field"><span>Mësime gjithsej (plani)</span><input class="input" type="number" min="1" inputmode="numeric" data-gf="total" value="' + esc(f.total) + '"></label>' +
      '<label class="field"><span>Mësime të kryera</span><input class="input" type="number" min="0" inputmode="numeric" data-gf="done" value="' + esc(f.done) + '"></label></div>';
    h += '<div class="field"><span>Orari</span>';
    f.schedule.forEach(function (sl, i) {
      h += '<div class="slot-edit"><select class="input" data-slot="' + i + '" data-k="d">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<option value="' + d + '"' + (+sl.d === d ? " selected" : "") + ">" + DAY_SHORT[d] + "</option>"; }).join("") + "</select>" +
        '<input class="input" type="time" data-slot="' + i + '" data-k="s" value="' + esc(sl.s) + '">' +
        '<input class="input" type="time" data-slot="' + i + '" data-k="e" value="' + esc(sl.e) + '">' +
        '<button type="button" class="icon-btn" data-a="rmSlot" data-i="' + i + '" aria-label="Hiq"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
    });
    h += '<button type="button" class="btn btn-sm btn-soft" data-a="addSlot">+ Shto orë</button></div>';
    // School regulation: 3×/week → 6 months, 2×/week → 7 months (long breaks don't count)
    var nSl = f.schedule.filter(function (x) { return x.s && x.e; }).length || +f.perWeek || 2, autoM = nSl >= 3 ? 6 : 7;
    var fm = Math.max(0, parseInt(f.months, 10) || 0) || autoM;
    var prev = isYmd(f.deadline) ? parseYmd(f.deadline) : regEndOf(f.start, fm);
    h += '<div class="field reg-box"><span>🎯 Kohëzgjatja e nivelit (rregullorja e shkollës)</span>' +
      '<div class="grid2"><label class="field"><span>Data e fillimit</span><input class="input" type="date" data-gf="start" value="' + esc(f.start || "") + '"></label>' +
      '<label class="field"><span>Muaj</span><input class="input" type="number" min="1" max="36" inputmode="numeric" data-gf="months" value="' + esc(f.months || "") + '" placeholder="automatikisht: ' + autoM + '"></label></div>' +
      '<label class="field"><span>Afati i caktuar nga shkolla (opsionale)</span><input class="input" type="date" data-gf="deadline" value="' + esc(f.deadline || "") + '"><small class="muted">Nëse shkolla ju jep një datë, kjo ka përparësi.</small></label>' +
      '<p class="small">' + (prev ? "→ Afati: <b>" + esc(fmtLong(prev)) + "</b> " + (isYmd(f.deadline) ? "(nga shkolla)" : "(" + fm + " muaj · " + nSl + "×/javë, pa pushimet e gjata)") : '<span class="muted">Zgjidhni datën e fillimit — afati llogaritet vetë: ' + autoM + " muaj për " + nSl + "×/javë.</span>") + "</p></div>";
    h += '<details class="field more-opt"' + (f.pages || f.wbPages || f.level || f.testAt ? " open" : "") + '><summary>Më shumë opsione</summary>' +
      '<label class="field"><span>Faqja e fundit e kursit në SB</span><input class="input" type="number" min="0" inputmode="numeric" data-gf="pages" value="' + esc(f.pages || "") + '" placeholder="' + (bi && bi.end ? "automatikisht: " + bi.end : "p.sh. 120") + '"></label>' +
      '<label class="field"><span>Faqe gjithsej në Workbook (opsionale)</span><input class="input" type="number" min="0" inputmode="numeric" data-gf="wbPages" value="' + esc(f.wbPages || "") + '" placeholder="nuk nevojitet"></label>' +
      '<label class="field"><span>Niveli (CEFR)</span><input class="input" data-gf="level" value="' + esc(f.level || "") + '" placeholder="' + (bi ? "automatikisht: " + esc(bi.cefr) : "p.sh. A1") + '"></label>' +
      (bi ? "" : '<label class="field"><span>Unite në libër</span><input class="input" type="number" min="1" inputmode="numeric" data-gf="units" value="' + esc(f.units || "") + '" placeholder="15"></label>') +
      '<label class="field"><span>Testet pas unitit (opsionale)</span><input class="input" data-gf="testAt" value="' + esc(f.testAt || "") + '" placeholder="' + esc(testRule({ book: f.book, testAt: "", units: f.units, pages: 0 }) ? "automatikisht: " + testRule({ book: f.book, testAt: "", units: f.units, pages: 0 }).units.join(", ") : "p.sh. 3, 6, 9, 12") + '"><small class="muted">Bosh = sipas rregullores për librin.</small></label></details>';
    var takenI = usedIcons(s.g);
    h += '<div class="field"><span>Ikona e grupit</span><div class="icons">' + ICONS.map(function (c) {
      return '<button type="button" class="' + (f.icon === c ? "on" : "") + (takenI[c] && f.icon !== c ? " taken" : "") + '" data-a="pickIcon" data-v="' + esc(c) + '" aria-label="Ikona ' + esc(c) + '">' + esc(c) + "</button>";
    }).join("") + '</div><input class="input icon-own" data-gf="icon" value="' + esc(f.icon || "") + '" placeholder="ose shkruani një emoji tuajën" maxlength="8">' +
      '<small class="muted">Ikonat e zbehta i kanë grupet e tjera.</small></div>';
    h += '<div class="field"><span>Ngjyra</span><div class="colors">' + COLORS.map(function (c, i) { return '<button type="button" style="--c:' + c + '" class="' + (+f.color === i ? "on" : "") + '" data-a="pickColor" data-i="' + i + '" aria-label="Ngjyra ' + (i + 1) + '"></button>'; }).join("") + "</div></div>";
    if (isNew) h += '<label class="field"><span>Nxënësit (opsionale — një emër për rresht)</span><textarea class="input" rows="4" data-gf="students" placeholder="Emri Mbiemri">' + esc(f.students || "") + "</textarea></label>";
    h += (s.err ? '<p class="err">' + esc(s.err) + "</p>" : "");
    h += "</div>";
    h += '<div class="sheet-foot"><button type="button" class="btn" data-a="closeSheet">Anulo</button><button type="button" class="btn btn-primary" data-a="saveGroup">' + (isNew ? "Krijo grupin" : "Ruaj") + "</button></div>";
    return h;
  }

  function sheetStudent(s) {
    var st = data().sById[s.s];
    if (!st) return "";
    var att = data().att, hw = data().hw, star = data().star, g = data().gById[st.g];
    var o = studentStats(st.id), rows = [];
    [att, hw, star].forEach(function (src) { Object.keys(src).forEach(function (d) { if (src[d][st.id] && rows.indexOf(d) < 0) rows.push(d); }); });
    rows.sort().reverse();
    // Rank in the group by points, and an overall picture from attendance + homework + points
    var gst = groupStats(st.g), mates = Object.keys(gst).sort(function (x, y) { return gst[y].pts - gst[x].pts; });
    var rank = mates.indexOf(st.id) + 1, maxPts = mates.length ? Math.max(1, gst[mates[0]].pts) : 1;
    var parts = [o.attPct, o.hwPct, o.S + o.Pl + o.M ? Math.max(0, Math.round(o.pts / maxPts * 100)) : null].filter(function (x) { return x != null; });
    var score = parts.length ? Math.round(parts.reduce(function (x, y) { return x + y; }, 0) / parts.length) : null;
    var verdict = score == null ? ["—", ""] : score >= 85 ? ["Shkëlqyeshëm", "ok"] : score >= 70 ? ["Shumë mirë", "ok"] : score >= 55 ? ["Mirë", "keep"] : ["Ka nevojë për ndihmë", "bad"];
    // Last 4 weeks vs the 4 weeks before (points)
    var cut = ymd(addDays(now(), -28)), cut2 = ymd(addDays(now(), -56)), p4 = 0, p8 = 0;
    o.last.forEach(function (x) { var m = MARKS[x.v]; if (!m) return; if (x.d >= cut) p4 += m.pts; else if (x.d >= cut2) p8 += m.pts; });
    function barRow(label, pct, txt) {
      return '<div class="pf-row"><span class="pf-l">' + label + '</span><span class="bar pf-bar"><i style="width:' + (pct == null ? 0 : pct) + '%"></i></span><span class="pf-v">' + txt + "</span></div>";
    }
    var h = sheetHead(esc(st.name), esc(g ? groupIcon(g) + " " + g.name : ""));
    h += '<div class="sheet-body">';
    h += '<div class="card pf"><div class="row between"><b>📈 Performanca</b><span class="chip pf-' + verdict[1] + '">' + esc(verdict[0]) + (score != null ? " · " + score + "%" : "") + "</span></div>" +
      barRow("Prezenca", o.attPct, o.attPct == null ? "—" : o.attPct + "%") +
      barRow("Detyrat", o.hwPct, o.hwPct == null ? "—" : o.hwPct + "%") +
      barRow("Pikët", o.S + o.Pl + o.M ? Math.max(0, Math.round(o.pts / maxPts * 100)) : null, o.pts + " p") +
      '<div class="facts" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="fact"><span>Prezent / vonë</span><b>' + o.P + " / " + o.L + '</b></div><div class="fact"><span>Mungesa</span><b>' + o.A + "</b></div>" +
      '<div class="fact"><span>DSh ✓ / ✗</span><b>' + o.Y + " / " + o.N + "</b></div>" +
      '<div class="fact"><span>★ · + · −</span><b>' + o.S + " · " + o.Pl + " · " + o.M + '</b></div><div class="fact"><span>Pikë gjithsej</span><b>' + o.pts + "</b></div>" +
      '<div class="fact"><span>Vendi në grup</span><b>' + (o.S + o.Pl + o.M ? rank + " / " + mates.length : "—") + "</b></div></div>" +
      '<p class="small muted" style="margin-top:8px">4 javët e fundit: <b>' + p4 + " p</b>" + (p8 || p4 ? " · 4 javët para tyre: " + p8 + " p " + (p4 > p8 ? "↗" : p4 < p8 ? "↘" : "→") : "") + " · ★ = 5, + = 3, − = −2</p></div>";
    h += '<label class="field"><span>Emri</span><input class="input" data-in="stuName" data-s="' + esc(st.id) + '" value="' + esc(st.name) + '"></label>';
    h += '<label class="field"><span>Shënim</span><textarea class="input" rows="3" data-in="stuNote" data-s="' + esc(st.id) + '" placeholder="p.sh. prindi, niveli, çfarë të përsërisë…">' + esc(st.note) + "</textarea></label>";
    h += '<label class="field"><span>Grupi</span><select class="input" data-in="stuGroup" data-s="' + esc(st.id) + '">' + data().groups.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === st.g ? " selected" : "") + ">" + esc(groupIcon(x) + " " + x.name) + "</option>"; }).join("") + "</select></label>";
    if (rows.length) {
      h += '<div class="section-title">Historiku</div><ul class="hist">' + rows.slice(0, 40).map(function (d) {
        var a = (att[d] || {})[st.id], w = (hw[d] || {})[st.id], m = MARKS[(star[d] || {})[st.id]];
        return "<li><span>" + esc(fmtDayDate(d)) + "</span><span>" + ({ P: "✓ prezent", L: "⏰ vonë", A: "✗ mungon" }[a] || "") + (w ? " · DSh " + (w === "Y" ? "✓" : "✗") : "") + (m ? " · " + m.ic + " " + (m.pts > 0 ? "+" + m.pts : "−" + Math.abs(m.pts)) : "") + "</span></li>";
      }).join("") + "</ul>";
    }
    h += '<div class="center" style="margin-top:16px"><button type="button" class="btn btn-danger btn-sm" data-a="delStudent" data-s="' + esc(st.id) + '">Fshi nxënësin</button></div>';
    h += "</div>";
    h += '<div class="sheet-foot"><button type="button" class="btn btn-primary" data-a="closeSheet">Gati</button></div>';
    return h;
  }

  // ——————————————————— Toast & dialog ———————————————————
  function toast(msg, action, fn, ms) {
    var root = $("#toast-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<span>" + esc(msg) + "</span>" + (action ? '<button type="button">' + esc(action) + "</button>" : "");
    root.innerHTML = "";
    root.appendChild(el);
    var t = setTimeout(function () { el.remove(); }, ms || (action ? 6000 : 2600));
    if (action) el.querySelector("button").addEventListener("click", function () { clearTimeout(t); el.remove(); fn(); });
  }
  function ask(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var root = $("#dialog-root");
      root.innerHTML = '<div class="dlg-bg"><div class="dlg" role="alertdialog" aria-modal="true"><h2>' + esc(title) + "</h2>" + (text ? "<p>" + esc(text) + "</p>" : "") +
        '<div class="row"><button type="button" class="btn" data-r="0">Anulo</button><button type="button" class="btn ' + (danger ? "btn-danger" : "btn-primary") + '" data-r="1">' + esc(okLabel || "Po") + "</button></div></div></div>";
      function done(v) { root.innerHTML = ""; resolve(v); }
      root.querySelector('[data-r="1"]').addEventListener("click", function () { done(true); });
      root.querySelector('[data-r="0"]').addEventListener("click", function () { done(false); });
      root.querySelector(".dlg-bg").addEventListener("click", function (e) { if (e.target.classList.contains("dlg-bg")) done(false); });
      root.querySelector('[data-r="1"]').focus();
    });
  }

  // ——————————————————— Actions ———————————————————
  function groupRaw(id) { var g = data().gById[id]; return g ? JSON.parse(JSON.stringify(g.raw)) : null; }
  function updGroup(id, patch, silent) {
    var raw = groupRaw(id);
    if (!raw) return;
    var baseChange = false;
    Object.keys(patch).forEach(function (k) {
      if (GROUP_FIELDS.indexOf(k) >= 0 && Object.keys(patch).length === 1) setK("g~" + id + "~" + k, patch[k], true);
      else { raw[k] = patch[k]; baseChange = true; }
    });
    if (baseChange) setK("g~" + id, raw, true);
    if (!silent) render();
  }
  function studentRaw(id) { var o = kv["s~" + id]; return o && o.v ? JSON.parse(JSON.stringify(o.v)) : null; }
  function updStudent(id, patch, silent) {
    var raw = studentRaw(id);
    if (!raw) return;
    Object.keys(patch).forEach(function (k) { raw[k] = patch[k]; });
    setK("s~" + id, raw, silent);
  }
  function restoreKeys(snapshot) {
    Object.keys(snapshot).forEach(function (k) { setK(k, snapshot[k], true); });
    render();
  }

  function groupForm(g) {
    if (!g) return { name: "", short: "", book: "", total: 56, done: 0, units: 15, perWeek: 2, color: data().groups.length % COLORS.length, icon: freeIcon(null), schedule: [{ d: 1, s: "17:00", e: "18:00" }, { d: 3, s: "17:00", e: "18:00" }], students: "", start: todayStr(), months: "", deadline: "", testAt: "" };
    return { name: g.name, short: g.raw.short || "", book: g.book, pages: g.raw.pages || "", wbPages: g.wbPages || "", level: g.level || "", icon: groupIcon(g), total: g.total, done: g.done, units: g.units, perWeek: g.perWeek, color: g.colorIdx, schedule: JSON.parse(JSON.stringify(g.schedule)),
      start: g.start, months: g.raw.months || "", deadline: g.deadline, testAt: g.testAt };
  }

  function addStudentsFrom(gid, text) {
    var names = String(text || "").split(/[\n,;]+/).map(function (s) { return s.replace(/^\s*\d+[.)]\s*/, "").trim(); }).filter(Boolean);
    if (!names.length) return 0;
    var start = studentsOf(gid).reduce(function (m, s) { return Math.max(m, s.order); }, -1) + 1;
    names.forEach(function (n, i) { setK("s~" + uid("s"), { g: gid, name: n, note: "", order: start + i }, true); });
    return names.length;
  }

  var A = {
    tab: function (el) { setTab(el.getAttribute("data-tab")); },
    back: function () { closeGroup(); },
    openGroup: function (el) { openGroup(el.getAttribute("data-g")); },
    closeSheet: function () { closeSheet(); },
    sheetBg: function (el, e) { if (e.target === el) closeSheet(); },

    // One tap: the lesson is saved with the planned pages and homework; "Ndrysho" only if it went differently.
    markDone: function (el) {
      var gid = el.getAttribute("data-g"), slot = el.getAttribute("data-slot"), g = data().gById[gid];
      if (!g || g.done >= g.total) return;
      var date = todayStr(), n = g.done + 1;
      var pl = plannedLesson(g);
      var sh = { type: "done", g: gid, slot: slot, date: date, n: n, prevSb: g.sb, prevWb: g.wb, form: { sb: pl.sb, hw: pl.hw, none: false } };
      setK("l~" + gid + "~" + date + "~" + slot, n, true);
      updGroup(gid, { done: n }, true);
      if (lastNum(g.sb) == null || !pl.t) { openSheet(sh); return; } // first lesson in the app / end of book: ask once
      commitDone(sh);
      ui.lastDone = sh;
      toast(g.short + " ✓ SB deri f. " + pl.sb + (pl.hw ? " · DSh WB f. " + pl.hw : ""), "Ndrysho", function () { A.editDone(); }, 9000);
    },
    editDone: function (el) {
      var sh = ui.lastDone;
      if (el && el.getAttribute) {
        var gid = el.getAttribute("data-g"), slot = el.getAttribute("data-slot"), date = todayStr(), g = data().gById[gid];
        if (!sh || sh.g !== gid || sh.slot !== slot || sh.date !== date) {
          var rec = getK("g~" + gid + "~pg~" + date + "~" + slot) || {};
          sh = { type: "done", g: gid, slot: slot, date: date, n: getK("l~" + gid + "~" + date + "~" + slot),
            prevSb: rec.ps != null ? rec.ps : rec.f != null ? String(rec.f - 1) : g.sb, prevWb: rec.pw != null ? rec.pw : g.wb, prevHw: rec.ph || null,
            form: { sb: rec.t != null ? String(rec.t) : g.sb, hw: g.hw && g.hw.d === date ? g.hw.p : "", none: !!(g.hw && g.hw.d === date && !g.hw.p) } };
        }
      }
      if (!sh) return;
      sh.committed = false; ui.lastDone = sh;
      openSheet(sh);
    },
    dfSave: function () {
      var sh = ui.sheet;
      commitDone(sh);
      closeSheet();
      var g = sh && data().gById[sh.g];
      if (g) toast(g.short + ": mësimi " + sh.n + " u ruajt ✓" + (lastNum(g.sb) != null ? " · Herën tjetër nga SB f. " + (lastNum(g.sb) + 1) : ""));
    },
    dfNone: function () { var f = ui.sheet.form; f.none = !f.none; render(true); },
    dfUndo: function () {
      var sh = ui.sheet;
      sh.committed = true;
      undoLesson(sh.g, sh.date, sh.slot);
      ui.lastDone = null;
      closeSheet();
      toast("Mësimi nuk u shënua");
    },
    allHw: function () {
      var date = ui.sheet.date, hw = data().hw[date] || {};
      studentsOf(ui.sheet.g).forEach(function (st) { if (!hw[st.id]) setK("h~" + date + "~" + st.id, "Y", true); });
      render();
    },
    report: function (el) { printReport(el.getAttribute("data-g")); },
    parents: function (el) { openSheet({ type: "parents", g: el.getAttribute("data-g"), mon: weekStart(now()), text: null }); },
    prWeek: function (el) { var s = ui.sheet; s.mon = addDays(s.mon, +el.getAttribute("data-d")); s.text = null; render(true); },
    prRegen: function () { ui.sheet.text = null; render(true); },
    prCopy: function () { copyText(ui.sheet.text || ""); },
    prViber: function () {
      var s = ui.sheet;
      if (s.g) markSent(s.mon, s.g);
      sendText(s.text || "");
    },
    allParents: function () { openSheet({ type: "allParents", mon: weekStart(now()) }); },
    apWeek: function (el) { ui.sheet.mon = addDays(ui.sheet.mon, +el.getAttribute("data-d")); render(true); },
    apOpen: function (el) { var mon = ui.sheet.mon; openSheet({ type: "parents", g: el.getAttribute("data-g"), mon: mon, text: null, back: "allParents" }); },
    apSend: function (el) {
      var g = data().gById[el.getAttribute("data-g")];
      if (!g) return;
      markSent(ui.sheet.mon, g.id);
      sendText(parentReport(g, ui.sheet.mon));
      render(true);
    },
    contents: function (el) {
      var g = data().gById[el.getAttribute("data-g")];
      if (!g) return;
      var rows = contentsOf(g.book).map(function (r) { return { u: r.u, from: String(r.from), t: r.t, sq: r.sq }; });
      if (!rows.length) rows = [{ u: "1", from: "", t: "", sq: "" }];
      openSheet({ type: "contents", g: g.id, rows: rows });
    },
    ctPhoto: function () { var i = $("#ct-file"); if (i) i.click(); },
    ctAdd: function () { var r = ui.sheet.rows, last = r[r.length - 1]; r.push({ u: last && /^\d+$/.test(last.u) ? String(+last.u + 1) : "", from: "", t: "", sq: "" }); render(true); },
    ctDel: function (el) { ui.sheet.rows.splice(+el.getAttribute("data-i"), 1); render(true); },
    ctSave: function () {
      var s = ui.sheet, g = data().gById[s.g];
      if (!g) return;
      var clean = s.rows.filter(function (r) { return parseInt(r.from, 10) > 0; }).map(function (r) { return { u: String(r.u || "").trim(), from: parseInt(r.from, 10), t: String(r.t || "").trim(), sq: String(r.sq || "").trim() }; });
      var all = JSON.parse(JSON.stringify(contentsAll()));
      all[g.book] = clean;
      setK("g~_cfg~contents", all, true);
      closeSheet();
      toast("Përmbajtja u ruajt ✓ (" + clean.length + " unite)");
    },
    addMasht: function () {
      var list = holidays(), have = {};
      list.forEach(function (x) { have[x.a + x.n] = 1; });
      MASHT_2026_27.forEach(function (x) { if (!have[x.a + x.n]) list.push(x); });
      list.sort(function (x, y) { return x.a < y.a ? -1 : 1; });
      setK("g~_cfg~holidays", list, true);
      render(true);
      toast("Kalendari MASHT 2026–2027 u shtua ✓");
    },
    addHoliday: function () {
      var f = ui.holForm || {}, a = f.a || "", b = f.b || "";
      if (!/^\d{4}-\d\d-\d\d$/.test(a)) { ui.holErr = "Zgjidhni datën e fillimit."; render(true); return; }
      if (b && b < a) { ui.holErr = "Data e mbarimit është para fillimit."; render(true); return; }
      var list = holidays();
      list.push({ a: a, b: b || a, n: String(f.n || "").trim() || "Pushim" });
      list.sort(function (x, y) { return x.a < y.a ? -1 : 1; });
      setK("g~_cfg~holidays", list, true);
      ui.holForm = null; ui.holErr = null;
      render(true);
      toast("Pushimi u shtua ✓ Datat e përfundimit u rillogaritën.");
    },
    delHoliday: function (el) {
      var i = +el.getAttribute("data-i"), list = holidays(), rm = list[i];
      if (!rm) return;
      list.splice(i, 1);
      setK("g~_cfg~holidays", list, true);
      render(true);
      toast("U hoq: " + rm.n, "Anulo", function () { var l = holidays(); l.push(rm); setK("g~_cfg~holidays", l, true); render(true); });
    },
    snapNow: function () { makeSnapshot(); render(true); toast("Kopja u ruajt në këtë pajisje ✓"); },
    snapRestore: function (el) {
      var list = snapshots(), sn = list[+el.getAttribute("data-i")];
      if (!sn) return;
      ask("Rikthe kopjen e " + fmtStamp(sn.t) + "?", "Të dhënat kthehen si në atë ditë" + (Sync.cfg() ? " në të gjitha pajisjet e lidhura" : "") + ". Para kësaj ruhet edhe një kopje e gjendjes së tanishme.", "Rikthe").then(function (ok) {
        if (!ok) return;
        makeSnapshot();
        var cur = {}; Object.keys(kv).forEach(function (k) { cur[k] = 1; });
        var restore = {}; Object.keys(sn.kv).forEach(function (k) { restore[k] = sn.kv[k]; delete cur[k]; });
        Object.keys(cur).forEach(function (k) { restore[k] = { v: null }; }); // items created after the copy
        importData({ kv: restore });
        render(true);
        toast("Kopja u rikthye ✓");
      });
    },
    setPin: function () {
      var f = ui.pinForm || {}, p = String(f.p || "").trim();
      if (!/^\d{4,8}$/.test(p)) { ui.pinErr = "PIN-i duhet të ketë 4–8 shifra."; render(true); return; }
      if (p !== String(f.p2 || "").trim()) { ui.pinErr = "Të dy PIN-et nuk përputhen."; render(true); return; }
      meta.pin = pinHash(p); persistNow();
      ui.pinForm = null; ui.pinErr = null; render(true);
      toast("PIN-i u vendos ✓ Kërkohet kur hapet aplikacioni.");
    },
    removePin: function () {
      ask("Hiq PIN-in?", "Aplikacioni do të hapet pa PIN në këtë pajisje.", "Hiq").then(function (ok) {
        if (!ok) return;
        delete meta.pin; persistNow(); render(true); toast("PIN-i u hoq");
      });
    },
    lockNow: function () { showLock(); },
    undoDone: function (el) {
      var gid = el.getAttribute("data-g"), slot = el.getAttribute("data-slot");
      undoLesson(gid, todayStr(), slot);
      toast("Shënimi u anulua");
    },
    step: function (el) {
      var g = data().gById[el.getAttribute("data-g")];
      if (!g) return;
      var n = clamp(g.done + (+el.getAttribute("data-d")), 0, g.total);
      if (n !== g.done) updGroup(g.id, { done: n });
    },
    openClass: function (el) { openSheet({ type: "class", g: el.getAttribute("data-g"), date: el.getAttribute("data-date") || todayStr() }); },
    classDay: function (el) {
      var d = parseYmd(ui.sheet.date);
      var nd = ymd(addDays(d, +el.getAttribute("data-d")));
      if (nd > todayStr()) return;
      ui.sheet.date = nd; render(true);
    },
    att: function (el) {
      var k = "a~" + ui.sheet.date + "~" + el.getAttribute("data-s");
      var cur = getK(k) || "";
      var next = { "": "P", P: "L", L: "A", A: "" }[cur];
      if (next) setK(k, next); else delK(k);
    },
    allPresent: function () {
      var date = ui.sheet.date, att = data().att[date] || {};
      studentsOf(ui.sheet.g).forEach(function (st) { if (!att[st.id]) setK("a~" + date + "~" + st.id, "P", true); });
      render();
    },
    hw: function (el) {
      var k = "h~" + ui.sheet.date + "~" + el.getAttribute("data-s");
      var next = { "": "Y", Y: "N", N: "" }[getK(k) || ""];
      if (next) setK(k, next); else delK(k);
    },
    star: function (el) {
      var k = "p~" + ui.sheet.date + "~" + el.getAttribute("data-s");
      var next = MARK_NEXT[getK(k) || ""];
      if (next) setK(k, next); else delK(k);
    },
    testDone: function (el) {
      var g = data().gById[el.getAttribute("data-g")], u = el.getAttribute("data-u");
      if (!g) return;
      var t = JSON.parse(JSON.stringify(g.tests || {}));
      if (t[u]) delete t[u]; else t[u] = todayStr();
      updGroup(g.id, { tests: t });
      toast(t[u] ? "Testi u shënua si i bërë ✓" : "Shënimi i testit u hoq");
    },

    newGroup: function () { openSheet({ type: "group", g: null, form: groupForm(null) }); ui.focus = "#gf-name"; render(true); },
    editGroup: function (el) { var g = data().gById[el.getAttribute("data-g")]; if (g) openSheet({ type: "group", g: g.id, form: groupForm(g) }); },
    pickBook: function (el) {
      var b = BOOKS[+el.getAttribute("data-i")], f = ui.sheet.form;
      if (f.book !== b.name && !(BOOK_ALIAS[f.book] === b.name)) { f.book = b.name; f.units = b.units; if (!ui.sheet.g) f.total = b.total; }
      if (!f.name) { f.name = b.name.replace(" New", " (2nd ed.)").replace("Family & Friends ", "FF").replace("English Plus ", "EP").replace("FFStarter", "FFS"); }
      render(true);
    },
    pickIcon: function (el) { ui.sheet.form.icon = el.getAttribute("data-v"); render(true); },
    pickColor: function (el) { ui.sheet.form.color = +el.getAttribute("data-i"); render(true); },
    addSlot: function () {
      var f = ui.sheet.form, last = f.schedule[f.schedule.length - 1];
      f.schedule.push(last ? { d: (+last.d >= 1 && +last.d + 2 <= 5) ? +last.d + 2 : 1, s: last.s, e: last.e } : { d: 1, s: "17:00", e: "18:00" });
      render(true);
    },
    rmSlot: function (el) { ui.sheet.form.schedule.splice(+el.getAttribute("data-i"), 1); render(true); },
    saveGroup: function () {
      var s = ui.sheet, f = s.form;
      var name = String(f.name || "").trim();
      if (!name) { s.err = "Shkruani emrin e grupit."; ui.focus = "#gf-name"; render(true); return; }
      var total = Math.max(1, parseInt(f.total, 10) || 56);
      var sched = f.schedule.filter(function (x) { return x.s && x.e; }).map(function (x) { return { d: +x.d, s: x.s, e: x.e }; });
      var obj = {
        name: name, short: String(f.short || "").trim() || name, book: String(f.book || "").trim(),
        total: total, done: clamp(parseInt(f.done, 10) || 0, 0, total), units: Math.max(1, parseInt(f.units, 10) || 15),
        perWeek: sched.length || Math.max(1, parseInt(f.perWeek, 10) || 2), color: +f.color || 0, schedule: sched,
        pages: Math.max(0, parseInt(f.pages, 10) || 0),
        wbPages: Math.max(0, parseInt(f.wbPages, 10) || 0),
        level: String(f.level || "").trim(),
        icon: iconClean(f.icon),
        start: isYmd(f.start) ? f.start : "",
        months: Math.max(0, Math.min(36, parseInt(f.months, 10) || 0)),
        deadline: isYmd(f.deadline) ? f.deadline : "",
        testAt: String(f.testAt || "").trim(),
      };
      if (bookInfo(obj.book)) obj.units = bookInfo(obj.book).units;
      if (s.g) {
        updGroup(s.g, obj, true);
        closeSheet();
        render(true);
        toast("U ruajt ✓");
      } else {
        var id = uid("g");
        obj.order = data().groups.reduce(function (m, g) { return Math.max(m, g.order); }, 0) + 1;
        obj.sb = ""; obj.wb = "";
        setK("g~" + id, obj, true);
        var n = addStudentsFrom(id, f.students);
        ui.sheet = null; ui.groupId = id;
        try { if (history.state && history.state.cb === "sheet") history.replaceState({ cb: "group" }, ""); } catch (e) { }
        render(true);
        window.scrollTo(0, 0);
        toast("Grupi “" + name + "” u krijua" + (n ? " me " + n + " nxënës" : ""));
      }
    },
    delGroup: function (el) {
      var gid = el.getAttribute("data-g"), g = data().gById[gid];
      if (!g) return;
      var n = studentsOf(gid).length;
      ask("Fshi grupin “" + g.name + "”?", n ? "Fshihen edhe " + n + " nxënës. Mund ta anuloni menjëherë pas." : "", "Fshi", true).then(function (ok) {
        if (!ok) return;
        var snap = {};
        snap["g~" + gid] = groupRaw(gid);
        studentsOf(gid).forEach(function (s) { snap["s~" + s.id] = studentRaw(s.id); delK("s~" + s.id, true); });
        delK("g~" + gid, true);
        ui.groupId = null;
        try { if (history.state && history.state.cb === "group") history.replaceState(null, ""); } catch (e) { }
        render(true);
        toast("Grupi u fshi", "Anulo", function () { restoreKeys(snap); });
      });
    },

    addStudents: function (el) {
      var gid = el.getAttribute("data-g"), ta = $("#add-stu");
      var n = addStudentsFrom(gid, ta ? ta.value : "");
      if (!n) { if (ta) ta.focus(); return; }
      if (ta) ta.value = "";
      ui.focus = "#add-stu";
      render(true);
      toast(n === 1 ? "Nxënësi u shtua" : n + " nxënës u shtuan");
    },
    openStudent: function (el) { openSheet({ type: "student", s: el.getAttribute("data-s") }); },
    delStudent: function (el) {
      var sid = el.getAttribute("data-s"), raw = studentRaw(sid);
      if (!raw) return;
      if (ui.sheet && ui.sheet.type === "student") closeSheet();
      delK("s~" + sid);
      toast("“" + raw.name + "” u fshi", "Anulo", function () { setK("s~" + sid, raw); });
    },

    // Sync
    joinKey: function () {
      var code = parseCode(ui.syncForm && ui.syncForm.key);
      if (!code) { ui.syncErr = "Shkruani kodin e plotë të klasës (12 shkronja/numra)."; render(true); return; }
      ui.syncErr = "";
      joinWith(code);
    },
    theme: function (el) {
      var v = el && el.getAttribute("data-v");
      try { if (v === "light" || v === "dark") localStorage.setItem("cb_theme", v); else localStorage.removeItem("cb_theme"); } catch (e) {}
      var r = document.documentElement, m = document.querySelector('meta[name="color-scheme"]');
      if (v === "light" || v === "dark") { r.dataset.theme = v; if (m) m.content = v; } else { delete r.dataset.theme; if (m) m.content = "light dark"; }
      render();
    },
    shareLink: function () {
      var link = joinLink();
      if (navigator.share) navigator.share({ title: "Classboard — lidh pajisjen", text: "Hape këtë lidhje për të sinkronizuar Classboard:", url: link }).catch(function () { });
      else A.copyLink();
    },
    copyLink: function () { copyText(joinLink()); },
    syncNow: function () { Sync.syncNow().then(function () { toast(Sync.S.status === "ok" ? "Gjithçka e sinkronizuar ✓" : statusText()); render(); }); },
    disconnect: function () {
      ask("Shkëput këtë pajisje?", "Të dhënat mbeten këtu, por nuk sinkronizohen më. Pajisjet e tjera vazhdojnë normalisht.", "Shkëput", true).then(function (ok) {
        if (ok) { Sync.disconnect(); render(true); }
      });
    },
    install: function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () { deferredInstall = null; render(); });
    },
    exportJson: function () {
      download("classboard-backup-" + todayStr() + ".json", JSON.stringify({ app: "classboard", version: 4, exported: new Date().toISOString(), kv: kv }), "application/json");
    },
    importJson: function () { var i = $("#import-file"); if (i) i.click(); },
    exportCsv: function () {
      var rows = [["Grupi", "Libri", "Totali", "Kryer", "Faqja SB", "Faqe gjithsej", "Progresi %", "Mbetur", "Mësime/javë", "Javë", "Mbaron", "Këshilla"]];
      data().groups.forEach(function (g) { var f = forecast(g); rows.push([g.name, g.book, g.total, g.done, f.pi ? f.pi.cur : "", g.pages || "", f.pct, f.rem, f.per, f.weeks, f.date ? ymd(f.date) : "", f.paceLabel]); });
      var csv = "﻿" + rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\r\n");
      download("classboard-plani-" + todayStr() + ".csv", csv, "text/csv");
    },
    print: function () { window.print(); },
    reset: function () {
      ask("Rivendos të dhënat?", "Grupet dhe nxënësit kthehen si në planin e 19 shtatorit. Prezencat, shënimet dhe grupet e reja fshihen.", "Rivendos", true).then(function (ok) {
        if (!ok) return;
        var t = Date.now();
        Object.keys(kv).forEach(function (k) { kv[k] = { v: null, t: t, d: meta.dev }; meta.dirty[k] = 1; });
        var tmp = {};
        var keep = kv; kv = tmp; seedAll(t + 1); kv = keep;
        Object.keys(tmp).forEach(function (k) { kv[k] = { v: tmp[k].v, t: t + 1, d: meta.dev }; meta.dirty[k] = 1; });
        dataVer++; persistNow(); Sync.schedulePush();
        setTab("today");
        toast("Të dhënat u rivendosën");
      });
    },
  };

  function undoLesson(gid, date, slot) {
    var k = "l~" + gid + "~" + date + "~" + slot;
    if (getK(k) == null) return;
    var gg = data().gById[gid], rec = getK("g~" + gid + "~pg~" + date + "~" + slot);
    if (gg && gg.hw && gg.hw.d === date) setK("g~" + gid + "~hw", rec && rec.ph ? rec.ph : null, true); // homework from that lesson
    if (gg && rec) { // put the pages back where they were before the lesson
      if (rec.ps != null && lastNum(gg.sb) === rec.t) setK("g~" + gid + "~sb", rec.ps, true);
      if (rec.pw != null && rec.w && gg.wb === rec.w) setK("g~" + gid + "~wb", rec.pw, true);
    }
    if (rec != null) setK("g~" + gid + "~pg~" + date + "~" + slot, null, true);
    var g = data().gById[gid];
    delK(k, true);
    if (g) updGroup(gid, { done: Math.max(0, g.done - 1) }, true);
    render();
  }

  function copyText(t) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("U kopjua ✓"); } catch (e) { toast("Kopjojeni me dorë"); }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast("U kopjua ✓"); }, fallback);
    else fallback();
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importData(obj) {
    var t = Date.now(), n = 0;
    if (obj && obj.kv && typeof obj.kv === "object") {
      Object.keys(obj.kv).forEach(function (k) {
        var o = obj.kv[k];
        if (!o || typeof o !== "object" || !/^[gsahpl]~/.test(k)) return;
        kv[k] = { v: o.v == null ? null : o.v, t: t, d: meta.dev }; meta.dirty[k] = 1; n++;
      });
    } else if (obj && Array.isArray(obj.groups) && Array.isArray(obj.students)) {
      // Old Classboard backup
      var keep = localStorage.getItem(OLD_KEY);
      try { localStorage.setItem(OLD_KEY, JSON.stringify(obj)); } catch (e) { }
      var before = JSON.parse(JSON.stringify(kv));
      kv = {};
      migrateOld();
      var migrated = kv; kv = before;
      Object.keys(migrated).forEach(function (k) { kv[k] = { v: migrated[k].v, t: t, d: meta.dev }; meta.dirty[k] = 1; n++; });
      try { if (keep == null) localStorage.removeItem(OLD_KEY); else localStorage.setItem(OLD_KEY, keep); } catch (e) { }
    } else {
      throw new Error("format");
    }
    dataVer++; persistNow(); Sync.schedulePush();
    return n;
  }

  function joinWith(code) {
    toast("Duke u lidhur…");
    Sync.test(code).then(function () {
      return Sync.connect(code);
    }).then(function () {
      ui.syncForm = null;
      render(true);
      toast("Pajisja u lidh ✓ Të dhënat janë të njëjta kudo.");
    }).catch(function (e) {
      if (!navigator.onLine) {
        Sync.connect(code); // saved — it will sync when the internet is back
        render(true);
        toast("Pa internet — do të sinkronizohet kur të lidheni.");
        return;
      }
      ui.syncErr = e.code === "bad_code" ? "Ky kod nuk pranohet. Kontrolloni shkronjat." :
        e.code === "not_configured" || e.code === "no_database" ? "Serveri i sinkronizimit nuk është konfiguruar ende." :
        "Nuk u lidh dot me serverin (" + (e.code || e.message) + ").";
      setTab("more");
    });
  }

  // ——————————————————— Event wiring ———————————————————
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-a]");
    if (!el || el.disabled) return;
    var fn = A[el.getAttribute("data-a")];
    if (fn) fn(el, e);
  });

  var inputTimers = {};
  document.addEventListener("input", function (e) {
    var el = e.target;
    // Sheet forms: keep drafts in memory so live sync can't wipe what you type
    if (el.hasAttribute("data-gf") && ui.sheet && ui.sheet.form) { ui.sheet.form[el.getAttribute("data-gf")] = el.value; return; }
    if (el.hasAttribute("data-slot") && ui.sheet && ui.sheet.form) {
      var sl = ui.sheet.form.schedule[+el.getAttribute("data-slot")];
      if (sl) sl[el.getAttribute("data-k")] = el.getAttribute("data-k") === "d" ? +el.value : el.value;
      return;
    }
    if (el.hasAttribute("data-sf")) { ui.syncForm = ui.syncForm || {}; ui.syncForm[el.getAttribute("data-sf")] = el.value; return; }
    if (el.hasAttribute("data-df") && ui.sheet && ui.sheet.form) {
      var dk = el.getAttribute("data-df"), dsh = ui.sheet;
      dsh.form[dk] = el.value;
      if (dk === "hw") dsh.form.hwTyped = true;
      else if (dk === "sb" && !dsh.form.hwTyped && !dsh.form.none) { // new SB page → the matching WB pages
        var dg = data().gById[dsh.g], dfrom = lastNum(dsh.prevSb), dto = lastNum(el.value);
        var dex = dg && dfrom != null && dto != null && dto > dfrom ? wbPagesFor(dg.book, dfrom + 1, dto) : null;
        if (dex) { dsh.form.hw = pagesText(dex); var hin = document.querySelector('[data-df="hw"]'); if (hin) hin.value = dsh.form.hw; }
      }
      return;
    }
    if (el.hasAttribute("data-prt") && ui.sheet) { ui.sheet.text = el.value; return; }
    if (el.hasAttribute("data-ct") && ui.sheet && ui.sheet.rows) { var cr = ui.sheet.rows[+el.getAttribute("data-ct")]; if (cr) cr[el.getAttribute("data-k")] = el.value; return; }
    if (el.hasAttribute("data-hf")) { ui.holForm = ui.holForm || {}; ui.holForm[el.getAttribute("data-hf")] = el.value; return; }
    if (el.hasAttribute("data-pf")) { ui.pinForm = ui.pinForm || {}; ui.pinForm[el.getAttribute("data-pf")] = el.value; return; }
    var kind = el.getAttribute("data-in");
    if (!kind) return;
    var key = kind + (el.getAttribute("data-g") || el.getAttribute("data-s") || "") + (el.getAttribute("data-f") || "");
    clearTimeout(inputTimers[key]);
    inputTimers[key] = setTimeout(function () { saveInline(el); }, kind === "stuGroup" ? 0 : 450);
  });
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.id === "ct-file") {
      var files = Array.prototype.slice.call(el.files || [], 0, 4);
      el.value = "";
      if (files.length && ui.sheet && ui.sheet.type === "contents") readContentsPhotos(ui.sheet, files);
      return;
    }
    if (el.id === "import-file") {
      var file = el.files && el.files[0];
      if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try { var n = importData(JSON.parse(r.result)); render(true); toast("U importuan " + n + " të dhëna ✓"); }
        catch (err) { toast("Skedari nuk është backup i vlefshëm i Classboard."); }
      };
      r.readAsText(file);
      el.value = "";
      return;
    }
    if (el.hasAttribute("data-slot") && ui.sheet && ui.sheet.form) {
      var sl = ui.sheet.form.schedule[+el.getAttribute("data-slot")];
      if (sl) sl[el.getAttribute("data-k")] = el.getAttribute("data-k") === "d" ? +el.value : el.value;
      return;
    }
    if (el.hasAttribute("data-gf") && ui.sheet && ui.sheet.type === "group" && /^(start|months|deadline|testAt|units)$/.test(el.getAttribute("data-gf"))) { ui.sheet.form[el.getAttribute("data-gf")] = el.value; render(true); return; }
    if (el.getAttribute("data-in")) saveInline(el);
  });
  document.addEventListener("keydown", function (e) {
    var el = e.target;
    if (e.key === "Escape") {
      if ($("#dialog-root").innerHTML) return;
      if (ui.sheet) { closeSheet(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && el.getAttribute && el.getAttribute("data-enter")) {
      e.preventDefault();
      A[el.getAttribute("data-enter")](el, e);
      return;
    }
    if (e.key === "Enter" && el.getAttribute && /^(page|bookPages|wbPages)$/.test(el.getAttribute("data-in") || "")) { el.blur(); }
    if (e.key === "Enter" && el.getAttribute && el.hasAttribute("data-df")) { e.preventDefault(); A.dfSave(); return; }
    if (e.key === "Enter" && el.getAttribute && el.hasAttribute("data-sf")) {
      e.preventDefault();
      A.joinKey();
    }
  });

  function saveInline(el) {
    var kind = el.getAttribute("data-in"), v = el.value;
    if (kind === "page") {
      var gid = el.getAttribute("data-g"), f = el.getAttribute("data-f"), g = data().gById[gid];
      if (g && g[f] !== v) { var p = {}; p[f] = v; updGroup(gid, p, true); }
      // mirror the value in the other copy of this field (Today card / group page)
      $all('[data-in="page"][data-g="' + gid + '"][data-f="' + f + '"]').forEach(function (x) { if (x !== el) x.value = v; });
    } else if (kind === "wbPages") {
      var wg = data().gById[el.getAttribute("data-g")], wp = Math.max(0, parseInt(v, 10) || 0);
      if (wg && wg.wbPages !== wp) { updGroup(wg.id, { wbPages: wp }, true); render(); }
    } else if (kind === "bookPages") {
      var bg = data().gById[el.getAttribute("data-g")], np = Math.max(0, parseInt(v, 10) || 0);
      if (bg && bg.pages !== np) { updGroup(bg.id, { pages: np }, true); render(); }
    } else if (kind === "stuName") {
      var n = v.trim(); if (n) updStudent(el.getAttribute("data-s"), { name: n }, true);
    } else if (kind === "stuNote") {
      updStudent(el.getAttribute("data-s"), { note: v }, true);
    } else if (kind === "stuGroup") {
      var sid = el.getAttribute("data-s"), st = studentRaw(sid);
      if (st && st.g !== v) {
        updStudent(sid, { g: v, order: 999 }, true);
        closeSheet();
        render(true);
        toast("U zhvendos te " + ((data().gById[v] || {}).name || "grupi"));
      }
    }
  }

  // Keep "Tani / pas X min" fresh on the Today screen, and roll over at midnight.
  var lastDay = todayStr();
  setInterval(function () {
    if (todayStr() !== lastDay) { lastDay = todayStr(); render(); return; }
    if (ui.tab === "today" && !ui.groupId && !ui.sheet) render();
  }, 60000);

  // ——————————————————— Service worker (only on http/https — not on file://) ———————————————————
  function registerSW() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    var reloading = false, hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading || !hadController) { hadController = true; return; } // first install: no reload needed
      reloading = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      function offer(w) {
        toast("Version i ri i Classboard është gati.", "Rifresko", function () { w.postMessage("SKIP_WAITING"); }, 30000);
      }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) offer(nw);
        });
      });
      document.addEventListener("visibilitychange", function () { if (!document.hidden) reg.update().catch(function () { }); });
    }).catch(function () { });
  }


  // v5 styles live here, so the page itself (index.html, style.css) never needs to change
  (function () { var st = document.createElement("style"); st.id = "cb-v5-css"; st.textContent = "\n/* v5: deadlines, tests, marks, student profile */\n.crow .nm { background: none; border: 0; padding: 0; text-align: left; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }\n.crow .nm .pts { color: var(--muted); font-weight: 700; font-size: .72rem; margin-left: 4px; }\n.star-p { background: var(--ok-soft); color: var(--ok); border-color: transparent; font-size: 1.15rem; }\n.deadline { margin-top: 4px; }\n.deadline.late, td.late { color: var(--bad); font-weight: 700; }\n.fact-late b { color: var(--bad); }\n.test-line { margin-top: 6px; font-size: .92rem; background: var(--warn-soft); border-radius: 10px; padding: 6px 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }\n.test-line.due { background: var(--brand-soft); border: 1px solid var(--brand); }\n.test-line .btn { min-height: 30px; padding: 4px 10px; }\n.tests { list-style: none; margin: 10px 0 0; padding: 0; }\n.tests li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--line); }\n.tests li:first-child { border-top: 0; }\n.tests li small { display: block; color: var(--muted); font-size: .8rem; }\n.tests li.t-done b { color: var(--muted); text-decoration: line-through; }\n.tests li.t-due { background: var(--brand-soft); border-radius: 10px; padding-left: 8px; padding-right: 4px; }\n.tests li.t-missed b { color: var(--warn); }\n.reg-box { background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }\n.reg-box > span { margin-bottom: 8px !important; }\n.reg-box .field { margin-bottom: 8px; }\n.pf { padding: 12px; margin-bottom: 14px; box-shadow: none; }\n.pf-row { display: grid; grid-template-columns: 78px 1fr 56px; align-items: center; gap: 8px; margin-top: 8px; font-size: .9rem; }\n.pf-bar { margin: 0 !important; }\n.pf-v { text-align: right; font-weight: 700; }\n.pf-ok { background: var(--ok-soft); color: var(--ok); border-color: transparent; }\n.pf-keep { background: var(--warn-soft); color: var(--warn); border-color: transparent; }\n.pf-bad { background: var(--bad-soft); color: var(--bad); border-color: transparent; }\n"; document.head.appendChild(st); })();
  // ——————————————————— Boot ———————————————————
  try { var savedTab = sessionStorage.getItem("cb.tab"); if (savedTab) ui.tab = savedTab; } catch (e) { }
  render(true);
  registerSW();

  // Join link: …/#code=XXXX-XXXX-XXXX  (works on first load and when the app is already open)
  function handleJoinHash(atBoot) {
    var m = location.hash.match(/code=([A-Za-z0-9-]+)/);
    if (!m) { if (atBoot) Sync.start(); return; }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { }
    var code = parseCode(m[1]);
    var cur = Sync.cfg();
    if (code && !(cur && cur.code === code)) {
      ask("Lidhe këtë pajisje?", "Classboard do të sinkronizohet me pajisjet e tjera. Të dhënat bashkohen — asgjë nuk humbet.", "Lidhu").then(function (ok) {
        if (ok) joinWith(code); else if (atBoot) Sync.start();
      });
    } else {
      if (atBoot) Sync.start();
      if (cur) toast("Kjo pajisje është tashmë e lidhur ✓");
    }
  }
  window.addEventListener("hashchange", function () { handleJoinHash(false); });
  handleJoinHash(true);
  showLock();
  setTimeout(autoSnapshot, Sync.cfg() ? 20000 : 3000);

  // For debugging/tests
  window.__classboard = { version: VERSION, targetInfo: targetInfo, regEnd: regEnd, testsOf: testsOf, pageInfo: pageInfo, kv: function () { return kv; }, meta: function () { return meta; }, sync: Sync, data: data, render: render };
})();
