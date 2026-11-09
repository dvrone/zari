/* Botnet Architecture Visualizer
 * Muallif: Zarnigor Shamuratova, KX 109-23 UZB
 *
 * Muhim: bu butunlay virtual simulyatsiya. Terminal faqat o'rnatilgan
 * ta'limiy buyruqlarni taniydi; hech qanday tizim buyrug'i bajarilmaydi
 * va tarmoqqa hech narsa yuborilmaydi.
 */
(function () {
  "use strict";

  /* ====================== MA'LUMOTLAR ====================== */
  var NODES = [
    { id: "botmaster", kind: "master", name: "Botmaster", img: "img/hacker.png", glyph: "BM", x: 95, y: 308, big: true, ip: "10.10.0.2",
      role: "Buyruq beruvchi (operator)",
      desc: "Botmaster botnetni boshqaruvchi shaxs yoki tizim. Bu loyihada u faqat virtual va ta’limiy maqsadda ko‘rsatilgan: buyruqlar C2 server orqali botlarga yuboriladi." },
    { id: "c2", kind: "c2", name: "C2 Server", img: "img/data-center.png", glyph: "C2", x: 300, y: 308, big: true, ip: "10.10.0.5",
      role: "Boshqaruv markazi (Command & Control)",
      desc: "C2 server botlar bilan aloqa o‘rnatadigan va buyruqlarni tarqatadigan markaziy tugun. Botlar unga ulanib, yangi ko‘rsatmalarni oladi va hisobot qaytaradi." },
    { id: "router", kind: "router", name: "Router", img: "img/router.png", glyph: "R", x: 505, y: 308, big: true, ip: "10.10.0.1",
      role: "Tarmoq yo‘naltirgichi",
      desc: "Router tarmoq trafigini C2 serverdan botlarga va aksincha yo‘naltiradi. Real tarmoqlarda g‘ayrioddiy trafikni aniqlash aynan shu yerda amalga oshiriladi." }
  ];
  for (var i = 0; i < 6; i++) {
    NODES.push({
      id: "bot" + (i + 1), kind: "bot", name: "BOT-0" + (i + 1), img: "img/computer.png", glyph: "PC",
      x: 730, y: 78 + i * 92, big: false, bot: true, ip: "10.10.0." + (11 + i),
      role: "Virtual yuqtirilgan qurilma (simulyatsiya)",
      desc: "Bot — botnet tarkibidagi qurilma. Bu yerda u faqat virtual obyekt bo‘lib, haqiqiy qurilmaga yoki tarmoqqa hech qanday ta’sir ko‘rsatmaydi. U C2 serverga ulanib, buyruq kutadi."
    });
  }
  NODES.push({
    id: "target", kind: "target", name: "Nishon server", img: "img/world-wide-web.png", glyph: "WWW", x: 1090, y: 215, big: true, ip: "203.0.113.10",
    role: "Virtual nishon (veb-server)",
    desc: "Bu hujum nishoni bo‘lgan virtual veb-server. Haddan tashqari ko‘p so‘rov kelsa, uning “sog‘ligi” pasayadi va u foydalanuvchilarga javob bera olmay qoladi (DDoS). Firewall yoqilsa, zararli trafik bloklanadi."
  });
  NODES.push({
    id: "db", kind: "db", name: "Ma’lumotlar bazasi", img: "img/database.png", glyph: "DB", x: 1090, y: 440, big: true, ip: "203.0.113.20",
    role: "Nishon serverning virtual bazasi",
    desc: "Veb-server orqasidagi virtual ma’lumotlar bazasi. Server ishdan chiqsa, unga bog‘liq xizmatlar ham xavf ostida qoladi."
  });

  var NODE_BY_ID = {};
  NODES.forEach(function (n) { NODE_BY_ID[n.id] = n; });

  var BOT_IDS = ["bot1", "bot2", "bot3", "bot4", "bot5", "bot6"];
  var BOTNET_KINDS = { master: 1, c2: 1, router: 1, bot: 1 };

  var EDGES = [
    { id: "bm-c2", from: "botmaster", to: "c2" },
    { id: "c2-router", from: "c2", to: "router" }
  ];
  BOT_IDS.forEach(function (b) { EDGES.push({ id: "router-" + b, from: "router", to: b }); });
  BOT_IDS.forEach(function (b) { EDGES.push({ id: "atk-" + b, from: b, to: "target", atk: true }); });
  EDGES.push({ id: "t-db", from: "target", to: "db" });
  var EDGE_BY_ID = {};
  EDGES.forEach(function (e) { EDGE_BY_ID[e.id] = e; });

  var KIND_TEXT = {
    def: { offline: "Ulanmagan", pending: "Kutilmoqda", active: "Faol" },
    target: { offline: "Ishdan chiqdi", pending: "Hujum ostida", active: "Barqaror" },
    db: { offline: "Buzilgan", pending: "Xavf ostida", active: "Xavfsiz" }
  };
  function stText(n, s) { return (KIND_TEXT[n.kind] || KIND_TEXT.def)[s]; }

  var TICK_MS = 1000;
  var TOTAL_TICKS = 10;

  /* ====================== HOLAT ====================== */
  var state = {
    sim: "idle",       // idle | running | done
    paused: false,
    tick: 0,
    timer: null,
    epoch: 0,
    busy: false,
    commands: 0,
    selected: "botmaster",
    status: {},
    log: []
  };
  var atk = { on: false, fw: false, health: 100, down: false, rps: 0, blocked: 0, total: 0, hist: [], m70: false, m30: false, n: 0 };
  var instances = [];
  var parts = [];

  function resetStatuses() {
    NODES.forEach(function (n) {
      state.status[n.id] = (n.kind === "target" || n.kind === "db") ? "active" : "offline";
    });
  }
  resetStatuses();

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
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }
  function activeBots() { return BOT_IDS.filter(function (id) { return state.status[id] === "active"; }); }
  function isVis(inst) { return inst.wrap.offsetParent !== null; }
  function currentSection() {
    var a = document.querySelector(".view.active");
    return a ? a.id.replace("view-", "") : "home";
  }

  /* ====================== DIAGRAMMA ====================== */
  function buildDiagram(container, infoEl) {
    var svg = svgEl("svg", { viewBox: "0 0 1240 670", "class": "diagram", role: "img", "aria-label": "Botnet arxitekturasi diagrammasi" }, null);

    [[95, 30, "Botmaster"], [300, 30, "C2 server"], [505, 30, "Router"], [730, 30, "Virtual botlar"], [1090, 30, "Nishon"]].forEach(function (l) {
      var t = svgEl("text", { x: l[0], y: l[1], "class": "col-label" }, svg);
      t.textContent = l[2];
    });

    var inst = { svg: svg, wrap: container, edges: {}, nodes: {}, packets: null, partLayer: null, pool: [], info: infoEl };

    var edgeLayer = svgEl("g", {}, svg);
    EDGES.forEach(function (e) {
      var a = NODE_BY_ID[e.from], c = NODE_BY_ID[e.to];
      var g = svgEl("g", { "class": "edge off" }, edgeLayer);
      svgEl("line", { x1: a.x, y1: a.y, x2: c.x, y2: c.y, "class": "edge-base" }, g);
      svgEl("line", { x1: a.x, y1: a.y, x2: c.x, y2: c.y, "class": "edge-flow" }, g);
      inst.edges[e.id] = g;
    });

    inst.partLayer = svgEl("g", {}, svg);
    inst.packets = svgEl("g", {}, svg);

    var nodeLayer = svgEl("g", {}, svg);
    NODES.forEach(function (n) {
      var g = svgEl("g", { "class": "node offline", transform: "translate(" + n.x + "," + n.y + ")", tabindex: "0", role: "button", "aria-label": n.name }, nodeLayer);
      var r = n.big ? 44 : 31;
      var imgSize = n.big ? 58 : 40;

      var fx = svgEl("g", {}, g);

      if (n.kind === "target") {
        svgEl("circle", { r: r + 22, "class": "fw-fill" }, g);
        svgEl("circle", { r: r + 22, "class": "fw-ring" }, g);
        var ft = svgEl("text", { x: 0, y: -(r + 30), "class": "fw-text" }, g);
        ft.textContent = "FIREWALL";
      }

      var body = svgEl("g", { "class": "body" }, g);
      svgEl("circle", { r: r, "class": "bg" }, body);
      svgEl("circle", { r: r + 6, "class": "halo" }, body);

      var glyph = svgEl("text", { "class": "fallback-glyph", style: "display:none" }, body);
      glyph.textContent = n.glyph;
      var img = svgEl("image", { href: n.img, x: -imgSize / 2, y: -imgSize / 2, width: imgSize, height: imgSize, preserveAspectRatio: "xMidYMid meet" }, body);
      img.addEventListener("error", function () { img.style.display = "none"; glyph.style.display = ""; });

      if (n.kind === "bot") {
        addBadge(g, "badge-skull", 25, -25, 13, "img/sign.png", "☠");
      }
      if (n.kind === "target") {
        addBadge(g, "badge-warn", 36, -36, 15, "img/warning.png", "!");
        var dt = svgEl("text", { x: 0, y: 10, "class": "down-text" }, g);
        dt.textContent = "503";
      }

      var name, st;
      if (n.big) {
        var off = n.kind === "target" ? 36 : 30;
        name = svgEl("text", { x: 0, y: r + off, "class": "node-name center" }, g);
        st = svgEl("text", { x: 0, y: r + off + 20, "class": "node-status center" }, g);
      } else {
        name = svgEl("text", { x: r + 16, y: -2, "class": "node-name" }, g);
        st = svgEl("text", { x: r + 16, y: 18, "class": "node-status" }, g);
      }
      name.textContent = n.name;
      st.textContent = stText(n, "offline");

      g.addEventListener("click", function () { selectNode(n.id); });
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectNode(n.id); }
      });
      inst.nodes[n.id] = { g: g, st: st, fx: fx };
    });

    // banner
    var banner = document.createElement("div");
    banner.className = "alert-banner";
    banner.innerHTML = '<img src="img/sign.png" alt="" onerror="this.style.display=\'none\'"><span class="ab-text">VIRTUAL HUJUM FAOL</span><img src="img/warning.png" alt="" onerror="this.style.display=\'none\'">';
    container.appendChild(banner);
    inst.banner = banner.querySelector(".ab-text");

    container.appendChild(svg);
    instances.push(inst);
    return inst;
  }

  function addBadge(g, cls, x, y, r, src, glyphText) {
    var b = svgEl("g", { "class": cls }, g);
    var inner = svgEl("g", { transform: "translate(" + x + "," + y + ")" }, b);
    svgEl("circle", { r: r }, inner);
    var gl = svgEl("text", { "class": "badge-glyph", style: "display:none" }, inner);
    gl.textContent = glyphText;
    var s = r * 1.35;
    var im = svgEl("image", { href: src, x: -s / 2, y: -s / 2, width: s, height: s, preserveAspectRatio: "xMidYMid meet" }, inner);
    im.addEventListener("error", function () { im.style.display = "none"; gl.style.display = ""; });
  }

  function edgeState(e) {
    var s = state.status[e.from], d = state.status[e.to];
    if (e.atk) {
      if (atk.on && s === "active") return atk.fw ? "atk blocked" : "atk fire";
      return "atk off";
    }
    if (d === "pending" && s !== "offline") return "pending";
    if (s === "active" && d === "active") return "active";
    return "off";
  }

  function renderDiagrams() {
    var hit = atk.on && !atk.fw && !atk.down && activeBots().length > 0;
    instances.forEach(function (inst) {
      if (!isVis(inst)) return;
      NODES.forEach(function (n) {
        var ref = inst.nodes[n.id];
        var s = state.status[n.id];
        var cls = "node " + s;
        if (state.selected === n.id) cls += " selected";
        if (n.kind === "bot" && atk.on && s === "active") cls += " attacking";
        if (n.kind === "target") {
          if (hit) cls += " hit";
          if (atk.fw) cls += " fw";
          if (atk.down) cls += " down";
        }
        ref.g.setAttribute("class", cls);
        ref.st.textContent = (n.kind === "target" && s === "active" && atk.on && atk.fw) ? "Himoyalangan" : stText(n, s);
      });
      EDGES.forEach(function (e) {
        inst.edges[e.id].setAttribute("class", "edge " + edgeState(e));
      });
      inst.svg.setAttribute("class", "diagram" + (state.paused ? " paused" : ""));
      inst.wrap.classList.toggle("under-attack", atk.on);
      inst.wrap.classList.toggle("fw-on", atk.fw);
      inst.banner.textContent = atk.fw ? "HUJUM FIREWALL BILAN BLOKLANMOQDA" : "VIRTUAL HUJUM FAOL";
      renderInfo(inst);
    });
  }

  function renderInfo(inst) {
    var n = NODE_BY_ID[state.selected];
    if (!n) { inst.info.innerHTML = ""; return; }
    var s = state.status[n.id];
    var extra = "";
    if (n.kind === "bot") {
      extra = "<dt>Faoliyat</dt><dd>" + (s !== "active" ? "—" : atk.on ? "Virtual hujumda ishtirok etmoqda" : "Buyruq kutmoqda") + "</dd>";
    } else if (n.kind === "target") {
      extra = "<dt>Sog‘ligi</dt><dd>" + Math.round(atk.health) + "% " + (atk.fw ? "(firewall yoqilgan)" : "") + "</dd>";
    }
    inst.info.innerHTML =
      '<div class="ni-title"><h4>' + esc(n.name) + '</h4><span class="pill ' + s + '">' + stText(n, s) + "</span></div>" +
      "<dl><dt>Nomi</dt><dd>" + esc(n.name) + "</dd>" +
      "<dt>Roli</dt><dd>" + esc(n.role) + "</dd>" +
      "<dt>Holati</dt><dd>" + stText(n, s) + "</dd>" +
      "<dt>IP (virtual)</dt><dd>" + esc(n.ip) + "</dd>" + extra +
      "<dt>Izoh</dt><dd>" + esc(n.desc) + "</dd></dl>";
  }

  function selectNode(id) {
    state.selected = id;
    renderDiagrams();
  }

  function ripple(id, color, r) {
    instances.forEach(function (inst) {
      if (!isVis(inst)) return;
      var fx = inst.nodes[id].fx;
      var c = svgEl("circle", { r: r || 40, "class": "ripple " + color }, fx);
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 1000);
    });
  }

  /* Buyruq paketi: barcha diagrammalarda bir vaqtda */
  function sendPacket(edgeId, reverse, duration, back) {
    var e = EDGE_BY_ID[edgeId];
    var a = NODE_BY_ID[reverse ? e.to : e.from];
    var c = NODE_BY_ID[reverse ? e.from : e.to];
    var dots = instances.map(function (inst) {
      return svgEl("circle", { r: 7, cx: a.x, cy: a.y, "class": "packet" + (back ? " back" : "") }, inst.packets);
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

  /* ====================== ZARRACHALAR (hujum effekti) ====================== */
  function spawnPart(botId, kind, blocked) {
    var a = NODE_BY_ID[botId], b = NODE_BY_ID.target;
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    parts.push({
      a: a, b: b, t: 0, kind: kind,
      dur: rnd(0.8, 1.35),
      end: blocked ? Math.max(.2, 1 - 90 / len) : 1,
      blocked: blocked,
      nx: -dy / len, ny: dx / len,
      jit: rnd(-9, 9)
    });
  }

  var lastRip = { red: 0, cyan: 0 };
  function onArrive(p) {
    var now = performance.now();
    if (p.kind === "atk" && p.blocked) {
      if (now - lastRip.cyan > 260) { lastRip.cyan = now; ripple("target", "cyan", 66); }
    } else if (p.kind === "atk") {
      if (now - lastRip.red > 200) { lastRip.red = now; ripple("target", "red", 46); }
    } else if (p.kind === "scan") {
      if (now - lastRip.cyan > 260) { lastRip.cyan = now; ripple("target", "cyan", 46); }
    }
  }

  function renderParticles() {
    var n = parts.length;
    instances.forEach(function (inst) {
      if (!isVis(inst)) return;
      var pool = inst.pool;
      while (pool.length < n) pool.push(svgEl("circle", { r: 4 }, inst.partLayer));
      for (var i = 0; i < pool.length; i++) {
        var c = pool[i];
        if (i < n) {
          var p = parts[i];
          var x = p.a.x + (p.b.x - p.a.x) * p.t + p.nx * p.jit;
          var y = p.a.y + (p.b.y - p.a.y) * p.t + p.ny * p.jit;
          c.setAttribute("cx", x.toFixed(1));
          c.setAttribute("cy", y.toFixed(1));
          c.setAttribute("class", "pt " + p.kind);
          c.style.display = "";
        } else if (c.style.display !== "none") {
          c.style.display = "none";
        }
      }
    });
  }

  var lastFrame = performance.now(), spawnAcc = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!state.paused) {
      if (atk.on) {
        var act = activeBots();
        if (act.length) {
          spawnAcc += dt * 7 * act.length;
          while (spawnAcc >= 1 && parts.length < 240) {
            spawnAcc -= 1;
            spawnPart(act[(Math.random() * act.length) | 0], "atk", atk.fw);
          }
        }
      } else { spawnAcc = 0; }
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.t += dt / p.dur;
        if (p.t >= p.end) { onArrive(p); parts.splice(i, 1); }
      }
    }
    renderParticles();
    requestAnimationFrame(loop);
  }

  /* ====================== NISHON / HUD ====================== */
  function targetStatus() {
    if (atk.down) return "offline";
    if (atk.health < 85 || (atk.on && !atk.fw && activeBots().length)) return "pending";
    return "active";
  }
  function syncTarget() {
    state.status.target = targetStatus();
    state.status.db = (atk.down || atk.health < 40) ? "pending" : "active";
  }

  function hudHTML() {
    return '<div class="hud">' +
      '<div class="hud-left">' +
        '<div class="hud-top"><b>Nishon sog‘ligi: <span data-hud="health">100%</span></b><span class="pill active" data-hud="status">Barqaror</span></div>' +
        '<div class="hbar"><i data-hud="bar"></i></div>' +
        '<div class="hud-nums">' +
          '<div class="hud-num"><span>So‘rovlar / s</span><b data-hud="rps">0</b></div>' +
          '<div class="hud-num"><span>Jami so‘rovlar</span><b data-hud="total">0</b></div>' +
          '<div class="hud-num"><span>Bloklangan</span><b data-hud="blocked">0</b></div>' +
          '<div class="hud-num"><span>Firewall</span><b data-hud="fw">O‘CHIQ</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="hud-right"><span>Trafik (so‘rov/s)</span>' +
        '<svg class="spark calm" viewBox="0 0 200 40" preserveAspectRatio="none" data-hud="spark"><path class="area"/><path class="line"/></svg>' +
      '</div>' +
    '</div>';
  }

  function setAll(key, fn) {
    document.querySelectorAll('[data-hud="' + key + '"]').forEach(fn);
  }

  function renderHud() {
    var pct = Math.round(atk.health);
    var ts = state.status.target;
    var txt = ts === "offline" ? "Ishdan chiqdi (503)" : ts === "pending" ? "Hujum ostida" : (atk.on && atk.fw ? "Himoyalangan" : "Barqaror");
    setAll("health", function (el) { el.textContent = pct + "%"; });
    setAll("bar", function (el) {
      el.style.width = pct + "%";
      el.className = pct > 60 ? "" : pct > 30 ? "warn" : "crit";
    });
    setAll("status", function (el) { el.textContent = txt; el.className = "pill " + ts; });
    setAll("rps", function (el) { el.textContent = fmt(atk.rps); });
    setAll("total", function (el) { el.textContent = fmt(atk.total); });
    setAll("blocked", function (el) { el.textContent = fmt(atk.blocked); });
    setAll("fw", function (el) { el.textContent = atk.fw ? "YOQIQ" : "O‘CHIQ"; });

    var h = atk.hist, N = 40, mx = 100;
    h.forEach(function (v) { if (v > mx) mx = v; });
    var line = "", area = "";
    for (var i = 0; i < h.length; i++) {
      var x = h.length > 1 ? (i * 200 / (N - 1)) : 0;
      var y = 38 - (h[i] / mx) * 34;
      line += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
    if (h.length) {
      var lastX = ((h.length - 1) * 200 / (N - 1)).toFixed(1);
      area = line + "L" + lastX + " 40 L0 40 Z";
    }
    setAll("spark", function (svg) {
      svg.querySelector(".line").setAttribute("d", line);
      svg.querySelector(".area").setAttribute("d", area);
      svg.setAttribute("class", "spark" + (atk.on ? "" : " calm"));
    });
  }

  function atkTick() {
    if (state.paused) return;
    var bots = activeBots().length;
    if (atk.on && bots === 0) {
      atk.on = false;
      addLog("Faol botlar qolmadi: hujum to‘xtadi.", "warn");
      tprint("[~] No active bots left: attack stopped.", "warn");
    }
    if (atk.on) {
      atk.rps = Math.round(bots * rnd(850, 1350));
      atk.total += Math.round(atk.rps / 2);
      if (atk.fw) {
        atk.blocked += Math.round(atk.rps / 2 * 0.97);
        atk.health = Math.min(100, atk.health + 4);
      } else {
        atk.health = Math.max(0, atk.health - bots * rnd(0.9, 1.4));
      }
    } else {
      atk.rps = Math.round(rnd(35, 60));
      atk.health = Math.min(100, atk.health + 2.5);
    }

    if (!atk.down && atk.health <= 0) {
      atk.down = true;
      addLog("Nishon server ishdan chiqdi (503 Service Unavailable)!", "alert");
      tprint("[!] TARGET DOWN: 503 Service Unavailable", "err");
    } else if (atk.down && atk.health >= 40) {
      atk.down = false;
      addLog("Nishon server tiklandi.", "ok");
      tprint("[+] TARGET RECOVERED: service is back online.", "ok");
    }
    if (atk.on && !atk.fw) {
      if (!atk.m70 && atk.health < 70) { atk.m70 = true; addLog("Nishon serverda yuklama keskin oshdi.", "alert"); }
      if (!atk.m30 && atk.health < 30) { atk.m30 = true; addLog("Nishon server kritik holatda!", "alert"); }
    }
    if (atk.health >= 95) { atk.m70 = false; atk.m30 = false; }

    atk.hist.push(atk.rps);
    if (atk.hist.length > 40) atk.hist.shift();

    if (atk.on && (++atk.n % 6) === 0) {
      tprint("[ATTACK] " + fmt(atk.rps) + " req/s | target health " + Math.round(atk.health) + "%" + (atk.fw ? " | firewall blocking" : ""), atk.fw ? "info" : "atk");
    }
    syncTarget();
    renderAll();
  }

  /* ====================== STATISTIKA / HOLAT ====================== */
  function setStat(id, value) {
    var el = $(id);
    if (el.textContent !== String(value)) {
      el.textContent = value;
      el.classList.add("bump");
      setTimeout(function () { el.classList.remove("bump"); }, 200);
    }
  }

  function renderStats() {
    var botsActive = activeBots().length;
    var connected = NODES.filter(function (n) { return BOTNET_KINDS[n.kind] && state.status[n.id] === "active"; }).length;
    setStat("stat-total", NODES.length);
    setStat("stat-bots", botsActive);
    setStat("stat-connected", connected);
    setStat("stat-commands", state.commands);
    $("stat-bots-hint").textContent = "6 tadan " + botsActive + " tasi";

    $("bot-list").innerHTML = BOT_IDS.map(function (id) {
      var s = state.status[id];
      var dot = s === "active" ? "green" : s === "pending" ? "orange" : "red";
      var attacking = atk.on && s === "active";
      return '<li class="' + (attacking ? "atk" : "") + '"><span class="dot ' + (attacking ? "red" : dot) + '"></span>' + NODE_BY_ID[id].name +
        '<span class="st">' + (attacking ? "Hujumda" : stText(NODE_BY_ID[id], s)) + "</span></li>";
    }).join("");
  }

  function renderBadge() {
    var b = $("sim-badge");
    var dot, text, cls = "sim-badge";
    if (state.paused) { dot = "orange"; text = "Pauzada"; }
    else if (atk.on) { dot = "red"; text = atk.fw ? "Hujum bloklanmoqda" : "Hujum faol"; cls += atk.fw ? " shielded" : " attack"; }
    else if (state.sim === "idle") { dot = "red"; text = "To‘xtatilgan"; }
    else if (state.sim === "running") { dot = "green"; text = "Ulanmoqda"; }
    else { dot = "green"; text = "Tarmoq tayyor"; }
    b.className = cls;
    b.innerHTML = '<span class="dot ' + dot + '"></span><span>' + text + "</span>";

    $("btn-start").disabled = state.sim !== "idle";
    $("btn-pause").disabled = state.sim === "idle" || state.paused;
    $("btn-resume").disabled = !state.paused;

    var pct = Math.round((state.tick / TOTAL_TICKS) * 100);
    $("progress-bar").style.width = pct + "%";
    var text2;
    if (state.paused) text2 = "Simulyatsiya pauzada.";
    else if (state.sim === "idle") text2 = "Simulyatsiya hali boshlanmagan.";
    else if (state.sim === "running") text2 = "Botlar ulanmoqda… " + pct + "%";
    else text2 = "Barcha virtual botlar ulandi. Endi buyruq yuborishingiz yoki hujumni sinab ko‘rishingiz mumkin.";
    $("progress-text").textContent = text2;

    var fw = $("btn-fw");
    fw.textContent = "🛡 Firewall: " + (atk.fw ? "yoqilgan" : "o‘chiq");
    fw.classList.toggle("on", atk.fw);
    $("btn-attack").disabled = atk.on;
    $("atk-nav-badge").hidden = !atk.on;
  }

  function renderAll() {
    renderDiagrams();
    renderStats();
    renderBadge();
    renderHud();
  }

  /* ====================== JURNAL ====================== */
  var ECHO_PREFIX = { ok: "[+] ", warn: "[~] ", err: "[-] ", alert: "[!] ", cmd: "[>] ", info: "[*] " };
  function addLog(text, type, echo) {
    type = type || "info";
    state.log.push({ time: timeStamp(), text: text, type: type });
    renderLog();
    if (echo) tprint((ECHO_PREFIX[type] || "[*] ") + text, type === "alert" ? "atk" : type);
  }

  function logItem(e) {
    var ico = e.type === "alert" ? '<img class="log-ico" src="img/warning.png" alt="" onerror="this.style.display=\'none\'">' : "";
    return '<li class="' + e.type + '"><span class="log-time">[' + e.time + "]</span>" + ico + '<span class="log-msg">' + esc(e.text) + "</span></li>";
  }

  function renderLog() {
    var full = $("log-full"), prev = $("log-preview");
    if (!state.log.length) {
      full.innerHTML = '<li class="log-empty">Jurnal bo‘sh. Simulyatsiyani boshlang.</li>';
      prev.innerHTML = '<li class="log-empty">Hozircha hodisalar yo‘q.</li>';
    } else {
      if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
      full.innerHTML = state.log.map(logItem).join("");
      prev.innerHTML = state.log.slice(-6).map(logItem).join("");
      full.scrollTop = full.scrollHeight;
    }
    $("log-badge").textContent = state.log.length;
  }

  /* ====================== SIMULYATSIYA ====================== */
  function step() {
    var t = state.tick;
    if (t === 0) {
      state.status.botmaster = "active";
      addLog("Botmaster virtual boshqaruv paneli ishga tushdi.", "ok", true);
    } else if (t === 1) {
      state.status.c2 = "pending";
      addLog("C2 server ishga tushirilmoqda…", "warn", true);
    } else if (t === 2) {
      state.status.c2 = "active";
      addLog("C2 server tayyor va Botmaster bilan ulandi.", "ok", true);
      state.status.router = "active";
      addLog("Router tarmoq trafigini yo‘naltirishga tayyor.", "ok", true);
    } else if (t >= 3 && t <= 8) {
      var idx = t - 3;
      if (idx > 0) {
        var prev = BOT_IDS[idx - 1];
        state.status[prev] = "active";
        ripple(prev, "green", 34);
        addLog(NODE_BY_ID[prev].name + " C2 serverga ulandi.", "ok", true);
      }
      var cur = BOT_IDS[idx];
      state.status[cur] = "pending";
      addLog(NODE_BY_ID[cur].name + " ulanishga urinmoqda…", "warn", true);
    } else if (t === 9) {
      var last = BOT_IDS[5];
      state.status[last] = "active";
      ripple(last, "green", 34);
      addLog(NODE_BY_ID[last].name + " C2 serverga ulandi.", "ok", true);
      addLog("Barcha virtual botlar ulandi. Tarmoq tayyor.", "ok", true);
      tprint("    Network ready. Try: ping all | scan target | attack start", "dim");
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
    if (state.sim !== "idle") return false;
    state.sim = "running";
    addLog("Simulyatsiya boshlandi.", "info", true);
    renderAll();
    startTimer();
    return true;
  }

  function pauseSim() {
    if (state.sim === "idle" || state.paused) return false;
    clearInterval(state.timer);
    state.timer = null;
    state.paused = true;
    addLog("Simulyatsiya pauzaga qo‘yildi.", "warn", true);
    renderAll();
    return true;
  }

  function resumeSim() {
    if (!state.paused) return false;
    state.paused = false;
    addLog("Simulyatsiya davom ettirildi.", "info", true);
    if (state.sim === "running") startTimer();
    renderAll();
    return true;
  }

  function resetSim(autoStart) {
    clearInterval(state.timer);
    state.timer = null;
    state.epoch++;
    state.busy = false;
    state.tick = 0;
    state.commands = 0;
    state.sim = "idle";
    state.paused = false;
    resetStatuses();
    atk.on = false; atk.fw = false; atk.health = 100; atk.down = false;
    atk.rps = 0; atk.blocked = 0; atk.total = 0; atk.hist = []; atk.m70 = false; atk.m30 = false; atk.n = 0;
    parts.length = 0;
    resetResponses();
    instances.forEach(function (inst) { inst.packets.innerHTML = ""; });
    addLog("Simulyatsiya qayta o‘rnatildi. Barcha qurilmalar ulanmagan holatga qaytdi.", "err", true);
    renderAll();
    if (autoStart) startSim();
  }

  /* ====================== JAVOBLAR RO'YXATI ====================== */
  function resetResponses() {
    $("responses").innerHTML = '<li class="muted">Hozircha javoblar yo‘q. Simulyatsiyani boshlab, buyruq yuboring.</li>';
  }
  function clearResponses() { $("responses").innerHTML = ""; }
  function addResponse(name, text) {
    var li = document.createElement("li");
    li.innerHTML = "<b>" + esc(name) + "</b><br>" + esc(text);
    $("responses").appendChild(li);
  }

  /* ====================== TOAST ====================== */
  function showToast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  /* ====================== TERMINAL ====================== */
  var termOut = $("term-out"), termIn = $("term-input"), termBody = $("term-body");
  var history = [], hIdx = -1;

  function tprint(text, cls) {
    var d = document.createElement("div");
    d.className = "tl-line " + (cls || "");
    d.textContent = text;
    termOut.appendChild(d);
    while (termOut.childNodes.length > 500) termOut.removeChild(termOut.firstChild);
    termBody.scrollTop = termBody.scrollHeight;
    if (cls === "err" && currentSection() !== "term") showToast(text.replace(/^\[.\]\s*/, ""));
  }
  function techo(line) {
    var d = document.createElement("div");
    d.className = "tl-line cmd";
    var p = document.createElement("span");
    p.className = "p";
    p.textContent = "botmaster@c2-sim:~$ ";
    d.appendChild(p);
    d.appendChild(document.createTextNode(line));
    termOut.appendChild(d);
    termBody.scrollTop = termBody.scrollHeight;
  }
  function say(t, c) { tprint(t, c || "dim"); }

  function parseTargets(arg) {
    if (!arg || arg.toLowerCase() === "all") return BOT_IDS.slice();
    var m = /^(?:bot-?)?0?([1-6])$/i.exec(arg);
    return m ? ["bot" + m[1]] : null;
  }

  async function dispatchTo(targets, ep) {
    say("[*] Botmaster -> C2 server (10.10.0.5)");
    await sendPacket("bm-c2", false, 650);
    if (ep !== state.epoch) return false;
    say("[*] C2 server -> router (10.10.0.1)");
    await sendPacket("c2-router", false, 550);
    if (ep !== state.epoch) return false;
    say("[*] Router -> " + targets.length + " bot(s)");
    await Promise.all(targets.map(function (id) { return sendPacket("router-" + id, false, 800); }));
    if (ep !== state.epoch) return false;
    targets.forEach(function (id) { ripple(id, "green", 34); });
    return true;
  }
  async function collectFrom(targets, ep) {
    await Promise.all(targets.map(function (id) { return sendPacket("router-" + id, true, 650, true); }));
    if (ep !== state.epoch) return false;
    await sendPacket("c2-router", true, 450, true);
    if (ep !== state.epoch) return false;
    await sendPacket("bm-c2", true, 500, true);
    return ep === state.epoch;
  }

  function needBots() {
    var b = activeBots();
    if (!b.length) { tprint("[-] No active bots. Run 'connect' first and wait for bots to come online.", "err"); return null; }
    return b;
  }

  var NET_KINDS = {
    link: { label: "Ulanish holatini tekshirish" },
    status: { label: "Holatni tekshirish" },
    message: { label: "Test xabarini yuborish" }
  };

  async function netCmd(kind, arg, extra, ep) {
    var want = parseTargets(arg);
    if (!want) { tprint("[-] Unknown target '" + arg + "'. Use: all | bot1 ... bot6", "err"); return; }
    var targets = want.filter(function (id) { return state.status[id] === "active"; });
    var down = want.filter(function (id) { return state.status[id] !== "active"; });
    if (!targets.length) { tprint("[-] No reachable bots. Run 'connect' first.", "err"); return; }

    clearResponses();
    addLog("Virtual buyruq yuborildi: “" + NET_KINDS[kind].label + "”.", "cmd");
    if (!(await dispatchTo(targets, ep))) return;
    down.forEach(function (id) { tprint(NODE_BY_ID[id].name + ": Destination host unreachable", "err"); });

    var seq = 0;
    for (var i = 0; i < targets.length; i++) {
      var n = NODE_BY_ID[targets[i]];
      seq++;
      if (kind === "link") {
        var ms = rnd(12, 70).toFixed(1);
        tprint("64 bytes from " + n.name + " (" + n.ip + "): icmp_seq=" + seq + " ttl=64 time=" + ms + " ms", "ok");
        addResponse(n.name, "C2 server bilan ulanish barqaror, kechikish " + Math.round(ms) + " ms.");
      } else if (kind === "status") {
        var cpu = Math.round(rnd(4, 38)), mem = Math.round(rnd(20, 62));
        tprint(n.name + " (" + n.ip + "): status=ACTIVE cpu=" + cpu + "% mem=" + mem + "% waiting_for_command", "ok");
        addResponse(n.name, "Holat: faol, CPU " + cpu + "%, RAM " + mem + "%.");
      } else {
        tprint(n.name + " (" + n.ip + '): message received -> "' + extra + '"', "ok");
        addResponse(n.name, "Test xabari qabul qilindi va tasdiqlandi.");
      }
      await wait(110);
      if (ep !== state.epoch) return;
    }
    if (!(await collectFrom(targets, ep))) return;

    if (kind === "link") tprint("--- " + targets.length + " packets transmitted, " + targets.length + " received, 0% packet loss ---", "dim");
    state.commands++;
    addLog(targets.length === 6 ? "Barcha test botlar javob berdi." : targets.length + " ta faol bot javob berdi.", "ok");
    renderStats();
  }

  async function cmdScan(args, ep) {
    if ((args[0] || "").toLowerCase() !== "target") { tprint("Usage: scan target", "warn"); return; }
    var bots = needBots(); if (!bots) return;
    addLog("Virtual buyruq yuborildi: “Nishonni skanerlash”.", "cmd");
    say("Starting simulated port scan on TARGET (203.0.113.10) ...", "info");
    if (!(await dispatchTo(bots, ep))) return;

    for (var k = 0; k < 14; k++) {
      spawnPart(bots[(Math.random() * bots.length) | 0], "scan", false);
      await wait(110);
      if (ep !== state.epoch) return;
    }
    await wait(900);
    if (ep !== state.epoch) return;

    var rows = [
      ["PORT", "STATE", "SERVICE"],
      ["22/tcp", "closed", "ssh"],
      ["80/tcp", "open", "http"],
      ["443/tcp", "open", "https"],
      ["3306/tcp", "filtered", "mysql"]
    ];
    for (var r = 0; r < rows.length; r++) {
      var line = pad2(rows[r][0], 10) + pad2(rows[r][1], 10) + rows[r][2];
      tprint(line, r === 0 ? "head" : rows[r][1] === "open" ? "ok" : "dim");
      await wait(150);
      if (ep !== state.epoch) return;
    }
    tprint("Scan complete (simulated data). Open services widen the attack surface.", "dim");
    if (!(await collectFrom(bots, ep))) return;
    state.commands++;
    addLog("Virtual skanerlash yakunlandi: 80 va 443 portlar ochiq (simulyatsiya).", "ok");
    renderStats();
  }

  async function cmdAttack(args, ep) {
    var sub = (args[0] || "").toLowerCase();
    if (sub === "ddos") sub = "start";
    if (sub !== "start" && sub !== "stop") { tprint("Usage: attack start | attack stop", "warn"); return; }

    if (sub === "start") {
      if (atk.on) { tprint("[~] Attack is already running. Use 'attack stop' or 'firewall on'.", "warn"); return; }
      var bots = needBots(); if (!bots) return;
      addLog("Virtual buyruq yuborildi: “Hujumni boshlash (DDoS)”.", "cmd");
      say("[*] Sending ATTACK order (simulated DDoS) ...");
      if (!(await dispatchTo(bots, ep))) return;
      atk.on = true; atk.m70 = false; atk.m30 = false; atk.n = 0;
      state.commands++;
      syncTarget();
      tprint("[!] ATTACK STARTED: " + bots.length + " bot(s) are flooding TARGET (203.0.113.10) with requests.", "atk");
      tprint("    Watch the target health bar. Enable protection with: firewall on", "dim");
      addLog("Virtual hujum boshlandi: " + bots.length + " ta bot nishon serverga so‘rov yubormoqda.", "alert");
      renderAll();
    } else {
      if (!atk.on) { tprint("[~] No attack is running.", "warn"); return; }
      addLog("Virtual buyruq yuborildi: “Hujumni to‘xtatish”.", "cmd");
      var b2 = activeBots();
      say("[*] Sending STOP order ...");
      if (b2.length && !(await dispatchTo(b2, ep))) return;
      atk.on = false;
      state.commands++;
      tprint("[+] Attack stopped. Bots are idle and waiting for commands.", "ok");
      addLog("Virtual hujum to‘xtatildi.", "ok");
      renderAll();
    }
  }

  function cmdFirewall(args) {
    var sub = (args[0] || "").toLowerCase();
    if (sub !== "on" && sub !== "off") { tprint("Usage: firewall on | firewall off", "warn"); return; }
    var on = sub === "on";
    if (atk.fw === on) { tprint("[~] Firewall is already " + (on ? "enabled" : "disabled") + ".", "warn"); return; }
    atk.fw = on;
    if (on) {
      tprint("[+] Firewall enabled: rate limiting and SYN-flood filtering are active (simulated).", "ok");
      addLog("Firewall yoqildi: zararli trafik bloklanmoqda.", "ok");
      if (atk.on) tprint("    Malicious traffic is being dropped; target will recover.", "dim");
    } else {
      tprint("[!] Firewall disabled: target is exposed.", "warn");
      addLog("Firewall o‘chirildi: nishon himoyasiz.", "warn");
    }
    syncTarget();
    renderAll();
  }

  function pad2(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

  function cmdStatus() {
    var ts = state.status.target;
    var simTxt = state.paused ? "paused" : state.sim === "idle" ? "stopped" : state.sim === "running" ? "connecting" : "ready";
    tprint("SIMULATION  : " + simTxt, "info");
    tprint("C2 SERVER   : " + (state.status.c2 === "active" ? "online" : state.status.c2 === "pending" ? "starting" : "offline"), "info");
    tprint("BOTS ACTIVE : " + activeBots().length + "/6", "info");
    tprint("TARGET      : " + (ts === "offline" ? "DOWN (503)" : ts === "pending" ? "UNDER ATTACK" : "stable") + "  health " + Math.round(atk.health) + "%", ts === "active" ? "ok" : "err");
    tprint("ATTACK      : " + (atk.on ? "ACTIVE (" + fmt(atk.rps) + " req/s)" : "idle"), atk.on ? "atk" : "dim");
    tprint("FIREWALL    : " + (atk.fw ? "enabled" : "disabled"), atk.fw ? "ok" : "dim");
    tprint("COMMANDS    : " + state.commands + " sent", "dim");
  }

  function cmdBots() {
    tprint(pad2("NAME", 9) + pad2("IP (virtual)", 15) + "STATE", "head");
    BOT_IDS.forEach(function (id) {
      var n = NODE_BY_ID[id], s = state.status[id];
      var label = atk.on && s === "active" ? "ATTACKING" : s === "active" ? "ONLINE" : s === "pending" ? "CONNECTING" : "OFFLINE";
      tprint(pad2(n.name, 9) + pad2(n.ip, 15) + label, atk.on && s === "active" ? "atk" : s === "active" ? "ok" : s === "pending" ? "warn" : "dim");
    });
  }

  function cmdHelp() {
    var rows = [
      ["connect", "bring the virtual bots online"],
      ["status", "show network overview"],
      ["bots", "list bots and their state"],
      ["ping <all|bot1..bot6>", "check link to bots (via C2)"],
      ["report <all|bot1..bot6>", "ask bots for their status"],
      ["broadcast <message>", "send a harmless test message to all bots"],
      ["scan target", "run a simulated port scan on the target"],
      ["attack start | stop", "start/stop the simulated DDoS"],
      ["firewall on | off", "toggle the target's protection"],
      ["pause | resume | reset", "control the simulation"],
      ["clear", "clear the screen"]
    ];
    tprint("Available commands:", "head");
    rows.forEach(function (r) { tprint("  " + pad2(r[0], 26) + r[1], "info"); });
    tprint("Tip: Tab completes, arrow keys browse history. Everything here is simulated.", "dim");
  }

  var HANDLERS = {
    help: { run: function () { cmdHelp(); } },
    connect: {
      run: function () {
        if (state.sim !== "idle") { tprint("[~] Network already initialized. Use 'reset' to start over.", "warn"); return; }
        startSim();
      }
    },
    status: { run: function () { cmdStatus(); } },
    bots: { run: function () { cmdBots(); } },
    ping: { net: true, run: function (a, ep) { return netCmd("link", a[0], "", ep); } },
    report: { net: true, run: function (a, ep) { return netCmd("status", a[0], "", ep); } },
    broadcast: {
      net: true,
      run: function (a, ep) {
        var msg = a.join(" ").slice(0, 60);
        if (!msg) { tprint('Usage: broadcast <message>   e.g. broadcast hello', "warn"); return; }
        return netCmd("message", "all", msg, ep);
      }
    },
    scan: { net: true, run: function (a, ep) { return cmdScan(a, ep); } },
    attack: { net: true, run: function (a, ep) { return cmdAttack(a, ep); } },
    firewall: { run: function (a) { cmdFirewall(a); } },
    pause: { run: function () { if (!pauseSim()) tprint("[~] Nothing to pause.", "warn"); } },
    resume: { run: function () { if (!resumeSim()) tprint("[~] Simulation is not paused.", "warn"); } },
    reset: {
      run: function () {
        resetSim(false);
      }
    },
    clear: { run: function () { termOut.innerHTML = ""; } },
    whoami: { run: function () { tprint("botmaster (virtual user, training mode)", "info"); } }
  };

  async function execute(raw) {
    var line = String(raw).trim();
    if (!line) { techo(""); return; }
    techo(line);
    history.push(line);
    if (history.length > 100) history.shift();
    hIdx = history.length;

    if (state.busy) { tprint("[!] Previous command is still running, please wait.", "warn"); return; }

    var parts_ = line.match(/"[^"]*"|\S+/g) || [];
    var cmd = parts_[0].toLowerCase();
    var args = parts_.slice(1).map(function (s) { return s.replace(/^"|"$/g, ""); });
    var h = Object.prototype.hasOwnProperty.call(HANDLERS, cmd) ? HANDLERS[cmd] : null;

    if (!h) {
      tprint(cmd.slice(0, 40) + ": command not found. Type 'help' to see available commands.", "err");
      tprint("(This is a simulated terminal: real system commands are never executed.)", "dim");
      addLog("Noma’lum buyruq kiritildi: " + cmd.slice(0, 30), "warn");
      return;
    }
    if (h.net && state.paused) { tprint("[!] Simulation is paused. Type 'resume' first.", "warn"); return; }

    var ep = state.epoch;
    state.busy = true;
    try {
      await h.run(args, ep);
    } catch (err) {
      tprint("[!] Internal error while running command.", "err");
      if (window.console) console.error(err);
    } finally {
      if (ep === state.epoch) state.busy = false;
    }
  }

  function guiRun(cmd) {
    if (state.busy) { showToast("Oldingi buyruq hali bajarilmoqda, biroz kuting."); return; }
    execute(cmd);
  }

  var SUBS = {
    attack: ["start", "stop"], firewall: ["on", "off"], scan: ["target"],
    ping: ["all"].concat(BOT_IDS), report: ["all"].concat(BOT_IDS)
  };
  function complete() {
    var v = termIn.value, m = /^(\S*)(\s+)?(\S*)$/.exec(v.replace(/^\s+/, ""));
    if (!m) return;
    var list, prefix, head = "";
    if (m[2] === undefined) { list = Object.keys(HANDLERS); prefix = m[1]; }
    else { list = SUBS[m[1].toLowerCase()] || []; prefix = m[3]; head = m[1] + " "; }
    var hits = list.filter(function (x) { return x.indexOf(prefix.toLowerCase()) === 0; });
    if (hits.length === 1) termIn.value = head + hits[0] + " ";
    else if (hits.length > 1) { techo(v); tprint(hits.join("   "), "dim"); }
  }

  function initTerminal() {
    termIn.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var v = termIn.value;
        termIn.value = "";
        execute(v);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (hIdx > 0) { hIdx--; termIn.value = history[hIdx]; }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (hIdx < history.length - 1) { hIdx++; termIn.value = history[hIdx]; } else { hIdx = history.length; termIn.value = ""; }
      } else if (e.key === "Tab") {
        e.preventDefault();
        complete();
      } else if (e.key.toLowerCase() === "l" && e.ctrlKey) {
        e.preventDefault();
        termOut.innerHTML = "";
      }
    });
    termBody.addEventListener("click", function () {
      if (!window.getSelection || window.getSelection().toString() === "") termIn.focus();
    });
    $("term-clear").addEventListener("click", function () { termOut.innerHTML = ""; termIn.focus(); });

    var chips = [
      ["help", "help", ""], ["connect", "connect", ""], ["status", "status", ""], ["bots", "bots", ""],
      ["ping all", "ping all", ""], ["report all", "report all", ""], ["broadcast hello", "broadcast hello", ""],
      ["scan target", "scan target", ""], ["attack start", "attack start", "dng"],
      ["firewall on", "firewall on", "shd"], ["firewall off", "firewall off", ""], ["attack stop", "attack stop", ""]
    ];
    var box = $("term-chips");
    chips.forEach(function (c) {
      var b = document.createElement("button");
      b.className = "chip " + c[2];
      b.textContent = c[0];
      b.addEventListener("click", function () { guiRun(c[1]); termIn.focus(); });
      box.appendChild(b);
    });

    tprint("Botnet Simulator v1.0 — virtual training terminal", "head");
    tprint("All commands are SIMULATED. Nothing leaves your browser.", "dim");
    tprint("Type 'help' to list commands. Start with: connect", "info");
    tprint("", "");
  }

  /* ====================== NAVIGATSIYA ====================== */
  var TITLES = {
    home: "Bosh sahifa", arch: "Botnet arxitekturasi", sim: "Simulyatsiya",
    term: "Terminal", log: "Hodisalar jurnali", about: "Botnet haqida"
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
    renderAll();
    if (name === "log") { var f = $("log-full"); f.scrollTop = f.scrollHeight; }
    if (name === "term") { termBody.scrollTop = termBody.scrollHeight; setTimeout(function () { termIn.focus(); }, 50); }
  }

  /* ====================== ISHGA TUSHIRISH ====================== */
  function init() {
    buildDiagram($("diagram-arch"), $("info-arch"));
    buildDiagram($("diagram-sim"), $("info-sim"));
    buildDiagram($("diagram-term"), document.createElement("div"));

    document.querySelectorAll(".hud-slot").forEach(function (s) { s.innerHTML = hudHTML(); });

    document.querySelectorAll(".nav-item").forEach(function (b) {
      b.addEventListener("click", function () { showSection(b.getAttribute("data-section")); });
    });
    document.querySelectorAll("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { showSection(b.getAttribute("data-goto")); });
    });

    $("menu-btn").addEventListener("click", function () { document.body.classList.toggle("menu-open"); });
    $("overlay").addEventListener("click", function () { document.body.classList.remove("menu-open"); });

    $("btn-start").addEventListener("click", function () { startSim(); });
    $("btn-pause").addEventListener("click", pauseSim);
    $("btn-resume").addEventListener("click", resumeSim);
    $("btn-reset").addEventListener("click", function () { resetSim(true); });
    $("btn-send").addEventListener("click", function () { guiRun($("cmd-select").value); });
    $("btn-attack").addEventListener("click", function () { guiRun("attack start"); });
    $("btn-attack-stop").addEventListener("click", function () { guiRun("attack stop"); });
    $("btn-fw").addEventListener("click", function () { guiRun("firewall " + (atk.fw ? "off" : "on")); });
    $("btn-clear-log").addEventListener("click", function () { state.log = []; renderLog(); });

    // ikonkalar foni
    var tog = $("icon-bg-toggle");
    try { if (localStorage.getItem("botnet-icons-dark") === "1") document.body.classList.add("icons-dark"); } catch (e) { /* ignore */ }
    tog.addEventListener("click", function () {
      var dark = document.body.classList.toggle("icons-dark");
      try { localStorage.setItem("botnet-icons-dark", dark ? "1" : "0"); } catch (e) { /* ignore */ }
    });

    initTerminal();
    renderLog();
    renderAll();
    setInterval(atkTick, 500);
    requestAnimationFrame(loop);
  }

  init();
})();
