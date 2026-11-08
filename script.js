/* Botnet Architecture Visualizer
 * Muallif: Zarnigor Shamuratova, KX 109-23 UZB
 * Barcha jarayonlar faqat brauzer ichida virtual tarzda simulyatsiya qilinadi.
 */
(function () {
  "use strict";

  /* ====================== MA'LUMOTLAR ====================== */
  var NODES = [
    { id: "botmaster", name: "Botmaster", img: "img/hacker.png", glyph: "BM", x: 95, y: 290, big: true,
      role: "Buyruq beruvchi (operator)",
      desc: "Botmaster botnetni boshqaruvchi shaxs yoki tizim. Bu loyihada u faqat virtual va ta’limiy maqsadda ko‘rsatilgan: buyruqlar C2 server orqali botlarga yuboriladi." },
    { id: "c2", name: "C2 Server", img: "img/data-center.png", glyph: "C2", x: 345, y: 290, big: true,
      role: "Boshqaruv markazi (Command & Control)",
      desc: "C2 server botlar bilan aloqa o‘rnatadigan va buyruqlarni tarqatadigan markaziy tugun. Botlar unga ulanib, yangi ko‘rsatmalarni oladi va hisobot qaytaradi." },
    { id: "router", name: "Router", img: "img/router.png", glyph: "R", x: 595, y: 290, big: true,
      role: "Tarmoq yo‘naltirgichi",
      desc: "Router tarmoq trafigini C2 serverdan botlarga va aksincha yo‘naltiradi. Real tarmoqlarda g‘ayrioddiy trafikni aniqlash aynan shu yerda amalga oshiriladi." }
  ];
  var BOT_Y = [70, 158, 246, 334, 422, 510];
  for (var i = 0; i < 6; i++) {
    NODES.push({
      id: "bot" + (i + 1), name: "BOT-0" + (i + 1), img: "img/pc.png", glyph: "PC",
      x: 855, y: BOT_Y[i], big: false, bot: true,
      role: "Virtual yuqtirilgan qurilma (simulyatsiya)",
      desc: "Bot — botnet tarkibidagi qurilma. Bu yerda u faqat virtual obyekt bo‘lib, haqiqiy qurilmaga yoki tarmoqqa hech qanday ta’sir ko‘rsatmaydi. U C2 serverga ulanib, buyruq kutadi."
    });
  }
  var NODE_BY_ID = {};
  NODES.forEach(function (n) { NODE_BY_ID[n.id] = n; });

  var EDGES = [
    { id: "bm-c2", from: "botmaster", to: "c2" },
    { id: "c2-router", from: "c2", to: "router" }
  ];
  for (var b = 1; b <= 6; b++) EDGES.push({ id: "router-bot" + b, from: "router", to: "bot" + b });
  var EDGE_BY_ID = {};
  EDGES.forEach(function (e) { EDGE_BY_ID[e.id] = e; });

  var STATUS_TEXT = { offline: "Ulanmagan", pending: "Kutilmoqda", active: "Faol" };
  var BOT_IDS = ["bot1", "bot2", "bot3", "bot4", "bot5", "bot6"];
  var TICK_MS = 1000;
  var TOTAL_TICKS = 3 + 6 + 1; // 3 infratuzilma + 6 bot + yakun

  var COMMANDS = {
    status: {
      name: "Holatni tekshirish",
      reply: function (n) { return n + ": holat — faol, resurslar normal (virtual)."; }
    },
    link: {
      name: "Ulanish holatini tekshirish",
      reply: function (n) { return n + ": C2 server bilan ulanish barqaror, kechikish " + (15 + Math.floor(Math.random() * 60)) + " ms (virtual)."; }
    },
    message: {
      name: "Test xabarini yuborish",
      reply: function (n) { return n + ": test xabari qabul qilindi va tasdiqlandi (virtual)."; }
    }
  };

  /* ====================== HOLAT ====================== */
  var state = {
    sim: "idle", // idle | running | paused | done
    tick: 0,
    timer: null,
    epoch: 0,
    busy: false,
    commands: 0,
    selected: "botmaster",
    status: {},
    log: []
  };
  NODES.forEach(function (n) { state.status[n.id] = "offline"; });

  var instances = [];

  /* ====================== YORDAMCHI ====================== */
  var SVG_NS = "http://www.w3.org/2000/svg";
  function $(id) { return document.getElementById(id); }
  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function timeStamp() {
    var d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  /* ====================== DIAGRAMMA ====================== */
  function buildDiagram(container, infoEl) {
    var svg = svgEl("svg", { viewBox: "0 0 1000 580", "class": "diagram", role: "img", "aria-label": "Botnet arxitekturasi diagrammasi" });

    var labels = [
      [95, 30, "Botmaster"], [345, 30, "C2 server"], [595, 30, "Router"], [855, 30, "Virtual botlar"]
    ];
    labels.forEach(function (l) {
      var t = svgEl("text", { x: l[0], y: l[1], "class": "col-label" }, svg);
      t.textContent = l[2];
    });

    var inst = { svg: svg, edges: {}, nodes: {}, packets: null, info: infoEl };

    var edgeLayer = svgEl("g", {}, svg);
    EDGES.forEach(function (e) {
      var a = NODE_BY_ID[e.from], c = NODE_BY_ID[e.to];
      var g = svgEl("g", { "class": "edge off" }, edgeLayer);
      svgEl("line", { x1: a.x, y1: a.y, x2: c.x, y2: c.y, "class": "edge-base" }, g);
      svgEl("line", { x1: a.x, y1: a.y, x2: c.x, y2: c.y, "class": "edge-flow" }, g);
      inst.edges[e.id] = g;
    });

    inst.packets = svgEl("g", {}, svg);

    var nodeLayer = svgEl("g", {}, svg);
    NODES.forEach(function (n) {
      var g = svgEl("g", { "class": "node offline", transform: "translate(" + n.x + "," + n.y + ")", tabindex: "0", role: "button", "aria-label": n.name }, nodeLayer);
      var r = n.big ? 44 : 31;
      var imgSize = n.big ? 56 : 38;
      svgEl("circle", { r: r, "class": "bg" }, g);
      svgEl("circle", { r: r + 5, "class": "halo" }, g);

      var glyph = svgEl("text", { "class": "fallback-glyph", style: "display:none" }, g);
      glyph.textContent = n.glyph;
      var img = svgEl("image", { href: n.img, x: -imgSize / 2, y: -imgSize / 2, width: imgSize, height: imgSize, preserveAspectRatio: "xMidYMid meet" }, g);
      img.addEventListener("error", function () { img.style.display = "none"; glyph.style.display = ""; });

      var name, st;
      if (n.big) {
        name = svgEl("text", { x: 0, y: r + 26, "class": "node-name center" }, g);
        st = svgEl("text", { x: 0, y: r + 44, "class": "node-status center" }, g);
      } else {
        name = svgEl("text", { x: r + 16, y: -3, "class": "node-name" }, g);
        st = svgEl("text", { x: r + 16, y: 15, "class": "node-status" }, g);
      }
      name.textContent = n.name;
      st.textContent = STATUS_TEXT.offline;

      g.addEventListener("click", function () { selectNode(n.id); });
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectNode(n.id); }
      });
      inst.nodes[n.id] = { g: g, st: st };
    });

    container.appendChild(svg);
    instances.push(inst);
    return inst;
  }

  function edgeState(e) {
    var s = state.status[e.from], d = state.status[e.to];
    if (d === "pending" && s !== "offline") return "pending";
    if (s === "active" && d === "active") return "active";
    return "off";
  }

  function renderDiagrams() {
    instances.forEach(function (inst) {
      NODES.forEach(function (n) {
        var ref = inst.nodes[n.id];
        var s = state.status[n.id];
        var cls = "node " + s;
        if (state.selected === n.id) cls += " selected";
        if (ref.g.classList.contains("flash")) cls += " flash";
        ref.g.setAttribute("class", cls);
        ref.st.textContent = STATUS_TEXT[s];
      });
      EDGES.forEach(function (e) {
        inst.edges[e.id].setAttribute("class", "edge " + edgeState(e));
      });
      inst.svg.setAttribute("class", "diagram" + (state.sim === "paused" ? " paused" : ""));
      renderInfo(inst);
    });
  }

  function renderInfo(inst) {
    var n = NODE_BY_ID[state.selected];
    if (!n) { inst.info.innerHTML = ""; return; }
    var s = state.status[n.id];
    inst.info.innerHTML =
      '<div class="ni-title"><h4>' + escapeHtml(n.name) + '</h4><span class="pill ' + s + '">' + STATUS_TEXT[s] + "</span></div>" +
      "<dl><dt>Nomi</dt><dd>" + escapeHtml(n.name) + "</dd>" +
      "<dt>Roli</dt><dd>" + escapeHtml(n.role) + "</dd>" +
      "<dt>Holati</dt><dd>" + STATUS_TEXT[s] + "</dd>" +
      "<dt>Izoh</dt><dd>" + escapeHtml(n.desc) + "</dd></dl>";
  }

  function selectNode(id) {
    state.selected = id;
    renderDiagrams();
  }

  function flashNode(id) {
    instances.forEach(function (inst) { inst.nodes[id].g.classList.add("flash"); });
    setTimeout(function () {
      instances.forEach(function (inst) { inst.nodes[id].g.classList.remove("flash"); });
    }, 650);
  }

  /* Paket animatsiyasi: barcha diagrammalarda bir vaqtda */
  function sendPacket(edgeId, reverse, duration, back) {
    var e = EDGE_BY_ID[edgeId];
    var a = NODE_BY_ID[reverse ? e.to : e.from];
    var c = NODE_BY_ID[reverse ? e.from : e.to];
    var dots = instances.map(function (inst) {
      return svgEl("circle", { r: 6, cx: a.x, cy: a.y, "class": "packet" + (back ? " back" : "") }, inst.packets);
    });
    return new Promise(function (resolve) {
      var start = null;
      function frame(ts) {
        if (start === null) start = ts;
        var t = Math.min((ts - start) / duration, 1);
        var k = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var x = a.x + (c.x - a.x) * k, y = a.y + (c.y - a.y) * k;
        dots.forEach(function (d) { d.setAttribute("cx", x); d.setAttribute("cy", y); });
        if (t < 1) requestAnimationFrame(frame);
        else {
          dots.forEach(function (d) { if (d.parentNode) d.parentNode.removeChild(d); });
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  /* ====================== STATISTIKA ====================== */
  function setStat(id, value) {
    var el = $(id);
    if (el.textContent !== String(value)) {
      el.textContent = value;
      el.classList.add("bump");
      setTimeout(function () { el.classList.remove("bump"); }, 200);
    }
  }

  function activeBots() {
    return BOT_IDS.filter(function (id) { return state.status[id] === "active"; });
  }

  function renderStats() {
    var botsActive = activeBots().length;
    var connected = NODES.filter(function (n) { return state.status[n.id] === "active"; }).length;
    setStat("stat-total", NODES.length);
    setStat("stat-bots", botsActive);
    setStat("stat-connected", connected);
    setStat("stat-commands", state.commands);
    $("stat-bots-hint").textContent = "6 tadan " + botsActive + " tasi";

    var list = $("bot-list");
    list.innerHTML = BOT_IDS.map(function (id) {
      var s = state.status[id];
      var dot = s === "active" ? "green" : s === "pending" ? "orange" : "red";
      return '<li><span class="dot ' + dot + '"></span>' + NODE_BY_ID[id].name + '<span class="st">' + STATUS_TEXT[s] + "</span></li>";
    }).join("");
  }

  function renderBadge() {
    var map = {
      idle: ["red", "To‘xtatilgan"],
      running: ["green", "Ishlamoqda"],
      paused: ["orange", "Pauzada"],
      done: ["green", "Tarmoq tayyor"]
    };
    var m = map[state.sim];
    $("sim-badge").innerHTML = '<span class="dot ' + m[0] + '"></span><span>' + m[1] + "</span>";

    $("btn-start").disabled = state.sim !== "idle";
    $("btn-pause").disabled = state.sim !== "running";
    $("btn-resume").disabled = state.sim !== "paused";

    var pct = Math.round((state.tick / TOTAL_TICKS) * 100);
    $("progress-bar").style.width = pct + "%";
    var text = {
      idle: "Simulyatsiya hali boshlanmagan.",
      running: "Simulyatsiya davom etmoqda… " + pct + "%",
      paused: "Simulyatsiya pauzada. " + pct + "% bajarildi.",
      done: "Barcha virtual botlar ulandi. Endi buyruq yuborishingiz mumkin."
    };
    $("progress-text").textContent = text[state.sim];
  }

  function renderAll() {
    renderDiagrams();
    renderStats();
    renderBadge();
  }

  /* ====================== JURNAL ====================== */
  function addLog(text, type) {
    state.log.push({ time: timeStamp(), text: text, type: type || "info" });
    renderLog();
  }

  function logItem(e) {
    return '<li class="' + e.type + '"><span class="log-time">[' + e.time + ']</span><span class="log-msg">' + escapeHtml(e.text) + "</span></li>";
  }

  function renderLog() {
    var full = $("log-full");
    var prev = $("log-preview");
    if (!state.log.length) {
      full.innerHTML = '<li class="log-empty">Jurnal bo‘sh. Simulyatsiyani boshlang.</li>';
      prev.innerHTML = '<li class="log-empty">Hozircha hodisalar yo‘q.</li>';
    } else {
      full.innerHTML = state.log.map(logItem).join("");
      prev.innerHTML = state.log.slice(-6).map(logItem).join("");
      full.scrollTop = full.scrollHeight;
    }
    $("log-badge").textContent = state.log.length;
  }

  /* ====================== SIMULYATSIYA ====================== */
  function setStatus(id, s) { state.status[id] = s; }

  function step() {
    var t = state.tick;
    if (t === 0) {
      setStatus("botmaster", "active");
      addLog("Botmaster virtual boshqaruv paneli ishga tushdi.", "ok");
    } else if (t === 1) {
      setStatus("c2", "pending");
      addLog("C2 server ishga tushirilmoqda…", "warn");
      // keyingi qadamda faol bo'ladi
    } else if (t === 2) {
      setStatus("c2", "active");
      addLog("C2 server tayyor va Botmaster bilan ulandi.", "ok");
      setStatus("router", "active");
      addLog("Router tarmoq trafigini yo‘naltirishga tayyor.", "ok");
    } else if (t >= 3 && t <= 8) {
      var idx = t - 3; // 0..5
      if (idx > 0) {
        var prev = BOT_IDS[idx - 1];
        setStatus(prev, "active");
        flashNode(prev);
        addLog(NODE_BY_ID[prev].name + " C2 serverga ulandi.", "ok");
      }
      var cur = BOT_IDS[idx];
      setStatus(cur, "pending");
      addLog(NODE_BY_ID[cur].name + " ulanishga urinmoqda…", "warn");
    } else if (t === 9) {
      var last = BOT_IDS[5];
      setStatus(last, "active");
      flashNode(last);
      addLog(NODE_BY_ID[last].name + " C2 serverga ulandi.", "ok");
      addLog("Barcha virtual botlar ulandi. Tarmoq tayyor.", "ok");
      state.tick = TOTAL_TICKS;
      state.sim = "done";
      clearInterval(state.timer);
      state.timer = null;
      renderAll();
      return;
    }
    state.tick++;
    renderAll();
  }

  function startTimer() {
    clearInterval(state.timer);
    state.timer = setInterval(step, TICK_MS);
  }

  function startSim() {
    if (state.sim !== "idle") return;
    state.sim = "running";
    addLog("Simulyatsiya boshlandi.", "info");
    renderAll();
    startTimer();
  }

  function pauseSim() {
    if (state.sim !== "running") return;
    clearInterval(state.timer);
    state.timer = null;
    state.sim = "paused";
    addLog("Simulyatsiya pauzaga qo‘yildi.", "warn");
    renderAll();
  }

  function resumeSim() {
    if (state.sim !== "paused") return;
    state.sim = "running";
    addLog("Simulyatsiya davom ettirildi.", "info");
    renderAll();
    startTimer();
  }

  function resetSim(autoStart) {
    clearInterval(state.timer);
    state.timer = null;
    state.epoch++;
    state.busy = false;
    state.tick = 0;
    state.commands = 0;
    state.sim = "idle";
    NODES.forEach(function (n) { state.status[n.id] = "offline"; });
    $("responses").innerHTML = '<li class="muted">Hozircha javoblar yo‘q. Simulyatsiyani boshlab, buyruq yuboring.</li>';
    $("btn-send").disabled = false;
    instances.forEach(function (inst) { inst.packets.innerHTML = ""; });
    addLog("Simulyatsiya qayta o‘rnatildi. Barcha qurilmalar ulanmagan holatga qaytdi.", "err");
    renderAll();
    if (autoStart) {
      addLog("Simulyatsiya qayta boshlandi.", "info");
      state.sim = "running";
      renderAll();
      startTimer();
    }
  }

  /* ====================== VIRTUAL BUYRUQ ====================== */
  function showToast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  async function sendCommand() {
    if (state.busy) return;
    var targets = activeBots();
    if (!targets.length) {
      showToast("Avval simulyatsiyani boshlang va kamida bitta bot ulanishini kuting.");
      addLog("Buyruq yuborilmadi: faol botlar yo‘q.", "err");
      return;
    }
    var key = $("cmd-select").value;
    var cmd = COMMANDS[key];
    var ep = state.epoch;
    function alive() { return ep === state.epoch; }

    state.busy = true;
    $("btn-send").disabled = true;
    $("responses").innerHTML = "";

    addLog("Virtual buyruq yuborildi: “" + cmd.name + "”.", "cmd");
    await sendPacket("bm-c2", false, 800);
    if (!alive()) return;
    addLog("C2 server buyruqni qabul qildi.", "cmd");

    await sendPacket("c2-router", false, 700);
    if (!alive()) return;
    addLog("Router buyruqni botlarga yo‘naltirmoqda.", "cmd");

    await Promise.all(targets.map(function (id) { return sendPacket("router-" + id, false, 900); }));
    if (!alive()) return;
    targets.forEach(flashNode);
    addLog("Buyruq " + targets.length + " ta virtual botga yetkazildi.", "cmd");

    // javoblar
    await Promise.all(targets.map(function (id) { return sendPacket("router-" + id, true, 700, true); }));
    if (!alive()) return;

    for (var i = 0; i < targets.length; i++) {
      var n = NODE_BY_ID[targets[i]];
      var msg = cmd.reply(n.name);
      var li = document.createElement("li");
      li.innerHTML = "<b>" + escapeHtml(n.name) + "</b><br>" + escapeHtml(msg.slice(n.name.length + 2));
      $("responses").appendChild(li);
      addLog(msg, "ok");
      await wait(150);
      if (!alive()) return;
    }

    await sendPacket("c2-router", true, 500, true);
    if (!alive()) return;
    await sendPacket("bm-c2", true, 600, true);
    if (!alive()) return;

    state.commands++;
    addLog(targets.length === 6 ? "Barcha test botlar javob berdi." : targets.length + " ta faol bot javob berdi.", "ok");
    state.busy = false;
    $("btn-send").disabled = false;
    renderStats();
  }

  /* ====================== NAVIGATSIYA ====================== */
  var TITLES = {
    home: "Bosh sahifa",
    arch: "Botnet arxitekturasi",
    sim: "Simulyatsiya",
    log: "Hodisalar jurnali",
    about: "Botnet haqida"
  };

  function showSection(name) {
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    $("view-" + name).classList.add("active");
    document.querySelectorAll(".nav-item").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-section") === name);
    });
    $("page-title").textContent = TITLES[name];
    document.body.classList.remove("menu-open");
    window.scrollTo({ top: 0 });
    if (name === "log") { var f = $("log-full"); f.scrollTop = f.scrollHeight; }
  }

  /* ====================== ISHGA TUSHIRISH ====================== */
  function init() {
    buildDiagram($("diagram-arch"), $("info-arch"));
    buildDiagram($("diagram-sim"), $("info-sim"));

    document.querySelectorAll(".nav-item").forEach(function (b) {
      b.addEventListener("click", function () { showSection(b.getAttribute("data-section")); });
    });
    document.querySelectorAll("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { showSection(b.getAttribute("data-goto")); });
    });

    $("menu-btn").addEventListener("click", function () { document.body.classList.toggle("menu-open"); });
    $("overlay").addEventListener("click", function () { document.body.classList.remove("menu-open"); });

    $("btn-start").addEventListener("click", startSim);
    $("btn-pause").addEventListener("click", pauseSim);
    $("btn-resume").addEventListener("click", resumeSim);
    $("btn-reset").addEventListener("click", function () { resetSim(true); });
    $("btn-send").addEventListener("click", sendCommand);
    $("btn-clear-log").addEventListener("click", function () { state.log = []; renderLog(); });

    renderLog();
    renderAll();
  }

  init();
})();
