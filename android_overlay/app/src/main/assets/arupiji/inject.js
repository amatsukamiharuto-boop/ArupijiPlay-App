/*
 * ArupijiPlay - skrip yang disuntik otomatis ke halaman game.
 * Isinya: kontrol layar yang bisa diatur, menu overlay, log debug, dan terjemahan langsung (opsional).
 */
(function () {
  'use strict';
  if (window.__arupijiLoaded || !window.ArupijiNative) return;
  window.__arupijiLoaded = true;

  var N = window.ArupijiNative;
  var prefs = { translate: false, gamepad: true, opacity: 0.55, hasKey: false, lang: 'Indonesian', title: '', debug: false };
  try { prefs = JSON.parse(N.getPrefs()); } catch (e) {}

  function savePref(k, v) {
    prefs[k] = v;
    try { N.setPref(k, String(v)); } catch (e) {}
  }

  /* ---------- log error ---------- */

  var jsErrors = [];
  function nlog(level, msg) {
    msg = String(msg);
    try { N.log(level, msg); } catch (e) {}
    if (level === 'E') {
      jsErrors.unshift(msg);
      if (jsErrors.length > 50) jsErrors.pop();
      updateBadge();
    }
  }
  window.addEventListener('error', function (e) {
    var m = e.message
      ? e.message + ' (' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0) + ')'
      : 'Gagal memuat: ' + ((e.target && (e.target.src || e.target.href)) || '?');
    nlog('E', m);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    nlog('E', 'Promise: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });
  (function () {
    var oe = console.error, ow = console.warn;
    console.error = function () { nlog('E', Array.prototype.join.call(arguments, ' ')); oe.apply(console, arguments); };
    console.warn = function () { nlog('W', Array.prototype.join.call(arguments, ' ')); ow.apply(console, arguments); };
  })();

  function hookLoadError() {
    if (!window.Graphics || !Graphics.printLoadingError || Graphics.__arpLE) return;
    Graphics.__arpLE = true;
    var o = Graphics.printLoadingError;
    Graphics.printLoadingError = function (url) {
      nlog('E', 'Gagal memuat file game: ' + url);
      return o.apply(this, arguments);
    };
  }

  /* ---------- tampilan dasar ---------- */

  if (!document.querySelector('meta[name=viewport]')) {
    var vp = document.createElement('meta');
    vp.name = 'viewport';
    vp.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
    document.head.appendChild(vp);
  }

  var css = [
    'html,body{margin:0;padding:0;background:#000;overflow:hidden}',
    '#arp-root{position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2147483000;',
    'font-family:sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',
    '#arp-root *{box-sizing:border-box}',
    '.arp-hit{pointer-events:auto}',
    '#arp-menu-btn{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));left:calc(8px + env(safe-area-inset-left,0px));',
    'width:40px;height:40px;border-radius:12px;background:rgba(20,24,32,.72);color:#8fd0f7;',
    'border:1px solid rgba(255,255,255,.2);font-size:20px;line-height:38px;text-align:center;touch-action:manipulation}',
    '#arp-badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#e53935;color:#fff;',
    'font-size:11px;line-height:18px;text-align:center;display:none;padding:0 4px;font-weight:700}',
    '#arp-panel{position:absolute;top:calc(54px + env(safe-area-inset-top,0px));left:calc(8px + env(safe-area-inset-left,0px));',
    'width:min(300px,74vw);max-height:calc(100% - 70px);overflow-y:auto;background:rgba(18,22,30,.96);',
    'border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:8px;display:none;touch-action:pan-y}',
    '.arp-row{display:flex;justify-content:space-between;align-items:center;width:100%;margin:0 0 6px;padding:11px 12px;',
    'border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#e8eef5;font-size:14px;text-align:left}',
    '.arp-row:active{background:rgba(255,255,255,.18)}',
    '.arp-tag{font-size:12px;color:#8fd0f7;font-weight:700}',
    '.arp-tag.red{color:#ff6b6b}',
    '.arp-title{color:#8aa0b4;font-size:11px;margin:2px 4px 8px;letter-spacing:.4px}',
    '#arp-panel input[type=range]{width:100%;margin:2px 0 10px}',
    '#arp-toast{position:absolute;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);',
    'background:rgba(18,22,30,.92);color:#fff;padding:8px 14px;border-radius:20px;font-size:13px;opacity:0;transition:opacity .25s;max-width:70vw;text-align:center}',
    '#arp-ctls{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none}',
    '.arp-ctl{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;',
    'background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.38);color:#fff;font-weight:700;touch-action:none}',
    '.arp-ctl.on{background:rgba(143,208,247,.55)}',
    '.arp-stick{background:rgba(255,255,255,.1)}',
    '.arp-thumb{position:absolute;border-radius:50%;background:rgba(143,208,247,.5);border:2px solid rgba(255,255,255,.55)}',
    '.arp-editing .arp-ctl{border-style:dashed}',
    '.arp-ctl.sel{outline:3px solid #ffd54f}',
    '#arp-editbar{position:absolute;left:50%;top:calc(8px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:none;',
    'align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;background:rgba(18,22,30,.96);border:1px solid rgba(255,255,255,.2);',
    'border-radius:12px;padding:8px 10px;color:#e8eef5;font-size:12px;max-width:80vw}',
    '#arp-editbar button{padding:7px 12px;border-radius:8px;border:0;background:#2a3442;color:#fff;font-size:12px}',
    '#arp-editbar button.pri{background:#5bb8f0;color:#06222f;font-weight:700}',
    '#arp-editbar button.del{background:#c62828}',
    '#arp-editbar input[type=range]{width:130px}',
    '.arp-modal{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center}',
    '.arp-modal .box{width:min(580px,92vw);max-height:92%;overflow:auto;background:#161b24;border-radius:14px;padding:14px;color:#e8eef5;touch-action:pan-y}',
    '.arp-modal label{display:block;font-size:12px;color:#8aa0b4;margin:8px 0 4px}',
    '.arp-modal textarea,.arp-modal select,.arp-modal input[type=text]{width:100%;background:#0e1218;color:#fff;border:1px solid #2c3644;border-radius:8px;padding:8px;font-size:14px}',
    '.arp-modal textarea{min-height:70px;resize:vertical;font-family:inherit}',
    '.arp-modal .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}',
    '.arp-modal button{padding:9px 16px;border-radius:8px;border:0;font-size:14px;background:#2a3442;color:#fff}',
    '.arp-modal button.pri{background:#5bb8f0;color:#06222f;font-weight:700}',
    '.arp-log{font-family:monospace;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-all;background:#fff;color:#37474f;border-radius:8px;padding:8px;max-height:55vh;overflow:auto;touch-action:pan-y}',
    '.arp-log .e{color:#d50000;font-weight:700}.arp-log .w{color:#e65100}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function el(tag, id, cls, html) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  var root = el('div', 'arp-root');
  document.body.appendChild(root);

  // Sentuhan di overlay tidak boleh dianggap klik ke layar game
  ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mousemove', 'mouseup', 'click', 'wheel']
    .forEach(function (t) {
      root.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
    });

  /* ---------- kirim tombol keyboard ke RPG Maker ---------- */

  var KEYNAME = { 13: 'Enter', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 27: 'Escape', 16: 'Shift', 17: 'Control', 18: 'Alt', 32: ' ', 9: 'Tab', 8: 'Backspace', 33: 'PageUp', 34: 'PageDown' };
  var held = {};

  function fire(type, code) {
    var key = KEYNAME[code] || (code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : (code >= 48 && code <= 57 ? String.fromCharCode(code) : ''));
    var e;
    try {
      e = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: key, keyCode: code, which: code });
    } catch (err) {
      e = document.createEvent('Event');
      e.initEvent(type, true, true);
    }
    try {
      Object.defineProperty(e, 'keyCode', { get: function () { return code; } });
      Object.defineProperty(e, 'which', { get: function () { return code; } });
    } catch (err) {}
    document.dispatchEvent(e);
  }
  function press(code) { if (!held[code]) { held[code] = true; fire('keydown', code); } }
  function release(code) { if (held[code]) { held[code] = false; fire('keyup', code); } }

  /* ---------- toast ---------- */

  var toastEl = el('div', 'arp-toast');
  root.appendChild(toastEl);
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 2600);
  }

  /* ---------- terjemahan ---------- */

  var pending = {}, pendingB = {}, seq = 0, history = [], uiHistory = [], lastErrAt = 0;
  var tmap = {}, done = {}, bad = {}, queue = {}, inflight = {};
  var flushTimer = null, refreshTimer = null, actorNames = null;

  // kode kontrol RPG Maker, penanda {n}, atau angka
  var TOKEN_RE = /\\[A-Za-z$.|!><^{}]+(?:\[\d+\])?|\{\d+\}|\d+(?:[.,]\d+)?/g;
  var CODE_RE = /\\[A-Za-z$.|!><^{}]+(?:\[\d+\])?/g;
  var LETTER_RE = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

  window.__arupiji = {
    onResult: function (id, text, source) {
      var cb = pending[id];
      if (cb) { delete pending[id]; cb(text, source); }
    },
    onBatch: function (id, textsJson, sourcesJson) {
      var keys = pendingB[id];
      if (!keys) return;
      delete pendingB[id];
      var texts = [], srcs = [];
      try { texts = JSON.parse(textsJson); srcs = JSON.parse(sourcesJson); } catch (e) {}
      var bump = false;
      keys.forEach(function (k, i) {
        delete inflight[k];
        var v = texts[i], s = srcs[i];
        if (typeof v !== 'string' || !s || s === 'error' || s === 'nokey' || s === 'timeout') {
          bad[k] = Date.now();
          if (s) note(s);
          return;
        }
        var need = k.match(/\{\d+\}/g) || [];
        for (var j = 0; j < need.length; j++) {
          if (v.indexOf(need[j]) < 0) { v = k; break; }
        }
        tmap[k] = v;
        done[v] = true;
        uiHistory.unshift({ original: k, translated: v, ui: true });
        bump = true;
      });
      if (uiHistory.length > 40) uiHistory.length = 40;
      if (bump) scheduleRefresh();
    }
  };

  // Angka diganti {0}, {1}, ... supaya "Lv 5" dan "Lv 6" memakai satu terjemahan yang sama
  function tokenize(text) {
    var nums = [];
    var key = text.replace(TOKEN_RE, function (m) {
      var c = m.charAt(0);
      if (c === '\\' || c === '{') return m;
      nums.push(m);
      return '{' + (nums.length - 1) + '}';
    });
    return { key: key, nums: nums };
  }
  function fill(tpl, nums) {
    return tpl.replace(/\{(\d+)\}/g, function (m, i) { return nums[i] !== undefined ? nums[i] : m; });
  }
  function worth(key) {
    if (key.length > 800) return false;
    var s = key.replace(CODE_RE, '').replace(/\{\d+\}/g, '').trim();
    return s.length >= 2 && LETTER_RE.test(s);
  }
  function isActorName(text) {
    if (actorNames === null) {
      if (!window.$dataActors) return false;
      actorNames = {};
      window.$dataActors.forEach(function (a) { if (a && a.name) actorNames[a.name] = true; });
    }
    if (actorNames[text]) return true;
    var d = window.$gameActors && $gameActors._data;
    if (d) {
      for (var i = 0; i < d.length; i++) { if (d[i] && d[i]._name === text) return true; }
    }
    return false;
  }
  function markDone(text) { done[tokenize(text).key] = true; }

  // Dipanggil saat teks digambar. Harus sinkron: kalau belum ada terjemahan,
  // kembalikan teks asli dan antrekan permintaan, jendela di-refresh saat hasilnya datang.
  function tr(text) {
    if (!prefs.translate || typeof text !== 'string' || text.length < 2) return text;
    var t = tokenize(text), key = t.key;
    var hit = tmap[key];
    if (hit !== undefined) return fill(hit, t.nums);
    if (done[key] || inflight[key] || queue[key]) return text;
    if (bad[key] && Date.now() - bad[key] < 30000) return text;
    if (!worth(key) || isActorName(text)) return text;
    queue[key] = true;
    scheduleFlush();
    return text;
  }

  function scheduleFlush() { if (!flushTimer) flushTimer = setTimeout(flush, 200); }
  function flush() {
    flushTimer = null;
    var keys = Object.keys(queue);
    queue = {};
    for (var i = 0; i < keys.length; i += 30) sendBatch(keys.slice(i, i + 30));
  }
  function sendBatch(keys) {
    var id = ++seq;
    keys.forEach(function (k) { inflight[k] = true; });
    pendingB[id] = keys;
    setTimeout(function () { failBatch(id); }, 70000);
    try { N.translateBatch(id, JSON.stringify(keys)); } catch (e) { failBatch(id); }
  }
  function failBatch(id) {
    var keys = pendingB[id];
    if (!keys) return;
    delete pendingB[id];
    keys.forEach(function (k) { delete inflight[k]; bad[k] = Date.now(); });
  }

  var SKIP = ['Window_Message', 'Window_ChoiceList', 'Window_NumberInput', 'Window_EventItem',
    'Window_ScrollText', 'Window_NameBox', 'Window_NameEdit', 'Window_NameInput'];
  function skipWindow(w) {
    for (var i = 0; i < SKIP.length; i++) {
      var C = window[SKIP[i]];
      if (C && w instanceof C) return true;
    }
    return false;
  }
  function scheduleRefresh() { if (!refreshTimer) refreshTimer = setTimeout(refreshWindows, 250); }
  function refreshWindows() {
    refreshTimer = null;
    try {
      var sc = window.SceneManager && SceneManager._scene;
      var layer = sc && sc._windowLayer;
      if (!layer) return;
      layer.children.forEach(function (w) {
        if (!w || !w.visible || typeof w.refresh !== 'function' || !w.contents) return;
        if (w.openness !== undefined && w.openness <= 0) return;
        if (skipWindow(w)) return;
        try { w.refresh(); } catch (e) {}
      });
    } catch (e) {}
  }

  // Terjemahan satu teks panjang (dialog, teks scroll)
  function translate(text) {
    return new Promise(function (resolve) {
      var id = ++seq;
      var t = setTimeout(function () {
        if (pending[id]) { delete pending[id]; resolve({ text: text, source: 'timeout' }); }
      }, 45000);
      pending[id] = function (tr2, src) { clearTimeout(t); resolve({ text: tr2, source: src }); };
      try { N.translate(id, text); } catch (e) { clearTimeout(t); delete pending[id]; resolve({ text: text, source: 'error' }); }
    });
  }

  function note(source) {
    var now = Date.now();
    if (source === 'nokey' && now - lastErrAt > 15000) { lastErrAt = now; toast('API key belum diisi di Pengaturan'); }
    else if ((source === 'error' || source === 'timeout') && now - lastErrAt > 8000) { lastErrAt = now; toast('Terjemahan gagal, teks asli ditampilkan'); }
  }

  // Dialog, pilihan, dan teks scroll (credits): ditahan sampai terjemahan siap
  function hookMessages() {
    var WM = window.Window_Message, GM = window.Game_Message;
    if (!WM || !GM) return false;
    if (WM.prototype.__arupijiHooked) return true;
    WM.prototype.__arupijiHooked = true;

    var origAll = GM.prototype.allText;
    GM.prototype.allText = function () {
      if (typeof this._arupijiText === 'string') return this._arupijiText;
      return origAll.call(this);
    };

    var origLoading = WM.prototype.updateLoading;
    WM.prototype.updateLoading = function () {
      if (this._arupijiPending) return true;
      return origLoading.call(this);
    };

    var origStart = WM.prototype.startMessage;
    WM.prototype.startMessage = function () {
      if (this._arupijiReady || !prefs.translate) {
        this._arupijiReady = false;
        var r = origStart.call(this);
        $gameMessage._arupijiText = null;
        return r;
      }
      var raw = origAll.call($gameMessage);
      if (!raw || !raw.trim()) return origStart.call(this);

      var self = this;
      var choices = ($gameMessage.choices && $gameMessage.choices()) ? $gameMessage.choices().slice() : [];
      this._arupijiPending = true;
      Promise.all([translate(raw)].concat(choices.map(translate))).then(function (rs) {
        $gameMessage._arupijiText = rs[0].text;
        if (choices.length) $gameMessage._choices = rs.slice(1).map(function (x) { return x.text; });
        note(rs[0].source);
        history.unshift({ original: raw, translated: rs[0].text });
        if (history.length > 15) history.pop();
        self._arupijiPending = false;
        self._arupijiReady = true;
      });
    };

    var WS = window.Window_ScrollText;
    if (WS && !WS.prototype.__arupijiHooked) {
      WS.prototype.__arupijiHooked = true;
      var sStart = WS.prototype.startMessage, sUpdate = WS.prototype.update;
      WS.prototype.update = function () {
        if (this._arupijiPending) { Window_Base.prototype.update.call(this); return; }
        return sUpdate.call(this);
      };
      WS.prototype.startMessage = function () {
        if (this._arupijiReady || !prefs.translate) {
          this._arupijiReady = false;
          var r = sStart.call(this);
          $gameMessage._arupijiText = null;
          return r;
        }
        var raw = origAll.call($gameMessage);
        if (!raw || !raw.trim()) return sStart.call(this);
        var self = this;
        this._arupijiPending = true;
        translate(raw).then(function (res) {
          $gameMessage._arupijiText = res.text;
          markDone(res.text);
          note(res.source);
          history.unshift({ original: raw, translated: res.text });
          if (history.length > 15) history.pop();
          self._arupijiPending = false;
          self._arupijiReady = true;
        });
      };
    }
    return true;
  }

  // Menu, item, skill, status, deskripsi, battle log: lewat drawText dan drawTextEx
  function hookUI() {
    var WB = window.Window_Base;
    if (!WB) return false;
    if (WB.prototype.__arupijiUI) return true;
    WB.prototype.__arupijiUI = true;

    function skipThis(w) {
      return (window.Window_NameBox && w instanceof Window_NameBox) ||
        (window.Window_NameInput && w instanceof Window_NameInput) ||
        (window.Window_NameEdit && w instanceof Window_NameEdit);
    }

    var oText = WB.prototype.drawText, oEx = WB.prototype.drawTextEx;
    WB.prototype.drawText = function () {
      var a = Array.prototype.slice.call(arguments);
      if (!skipThis(this)) a[0] = tr(a[0]);
      return oText.apply(this, a);
    };
    WB.prototype.drawTextEx = function () {
      var a = Array.prototype.slice.call(arguments);
      if (!skipThis(this)) a[0] = tr(a[0]);
      return oEx.apply(this, a);
    };

    var BL = window.Window_BattleLog;
    if (BL && BL.prototype.addText) {
      var oAdd = BL.prototype.addText;
      BL.prototype.addText = function (text) {
        var a = Array.prototype.slice.call(arguments);
        a[0] = tr(a[0]);
        return oAdd.apply(this, a);
      };
    }
    return true;
  }

  var tries = 0;
  var hookTimer = setInterval(function () {
    tries++;
    var a = hookMessages(), b = hookUI();
    hookLoadError();
    if ((a && b) || tries > 120) {
      clearInterval(hookTimer);
      try {
        if (window.Graphics) {
          Graphics._stretchEnabled = true;
          if (Graphics._updateAllElements) Graphics._updateAllElements();
        }
        window.dispatchEvent(new Event('resize'));
      } catch (e) {}
    }
  }, 500);

  /* ---------- kontrol layar (bisa diatur) ---------- */

  var KEYS = [['Enter', 13], ['Esc', 27], ['Spasi', 32], ['Shift', 16], ['Ctrl', 17], ['Alt', 18], ['Tab', 9], ['Backspace', 8],
    ['Panah Atas', 38], ['Panah Bawah', 40], ['Panah Kiri', 37], ['Panah Kanan', 39], ['PageUp', 33], ['PageDown', 34]];
  var ki;
  for (ki = 65; ki <= 90; ki++) KEYS.push([String.fromCharCode(ki), ki]);
  for (ki = 0; ki <= 9; ki++) KEYS.push([String(ki), 48 + ki]);
  for (ki = 1; ki <= 12; ki++) KEYS.push(['F' + ki, 111 + ki]);

  var DEFAULT_LAYOUT = [
    { id: 'stick', type: 'stick', x: 0.14, y: 0.70, s: 1 },
    { id: 'e', type: 'key', label: 'E', code: 13, x: 0.91, y: 0.78, s: 1 },
    { id: 'x', type: 'key', label: 'X', code: 88, x: 0.80, y: 0.86, s: 1 },
    { id: 'shift', type: 'key', label: 'Shift', code: 16, x: 0.91, y: 0.54, s: 0.9 },
    { id: 'i', type: 'action', action: 'inventory', label: 'I', x: 0.80, y: 0.62, s: 0.9 }
  ];

  function loadLayout() {
    var raw = '';
    try { raw = N.getControls(); } catch (e) {}
    if (raw) {
      try {
        var l = JSON.parse(raw);
        if (Array.isArray(l) && l.length) return l;
      } catch (e) {}
    }
    return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  }
  function saveLayout() { try { N.setControls(JSON.stringify(layout)); } catch (e) {} }

  var layout = loadLayout();
  var nodes = {};
  var editing = false, selId = null;
  var ctlLayer = el('div', 'arp-ctls');
  root.appendChild(ctlLayer);

  function findCtl(id) {
    for (var i = 0; i < layout.length; i++) if (layout[i].id === id) return layout[i];
    return null;
  }
  function baseSize() { return Math.max(42, Math.min(80, window.innerHeight / 360 * 60)); }

  function place(c) {
    var n = nodes[c.id];
    if (!n) return;
    var size = baseSize() * c.s * (c.type === 'stick' ? 2.1 : 1);
    n.style.width = size + 'px';
    n.style.height = size + 'px';
    n.style.left = (c.x * window.innerWidth - size / 2) + 'px';
    n.style.top = (c.y * window.innerHeight - size / 2) + 'px';
    n.style.fontSize = Math.max(11, size * (String(c.label || '').length > 2 ? 0.25 : 0.38)) + 'px';
    if (n._thumb) {
      var ts = size * 0.42;
      n._thumb.style.width = ts + 'px';
      n._thumb.style.height = ts + 'px';
      n._thumb.style.left = ((size - ts) / 2 - 2) + 'px';
      n._thumb.style.top = ((size - ts) / 2 - 2) + 'px';
    }
  }

  function dirFrom(dx, dy, rad) {
    var res = {}, dead = rad * 0.2, ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < dead && ay < dead) return res;
    var ratio = ax / (ay || 0.001);
    if (ratio > 2) res.h = dx < 0 ? 37 : 39;
    else if (ratio < 0.5) res.v = dy < 0 ? 38 : 40;
    else { res.h = dx < 0 ? 37 : 39; res.v = dy < 0 ? 38 : 40; }
    return res;
  }
  function applyDir(d) {
    var want = {};
    if (d.h) want[d.h] = 1;
    if (d.v) want[d.v] = 1;
    [37, 38, 39, 40].forEach(function (c) { if (want[c]) press(c); else release(c); });
  }

  function openInventory() {
    try {
      var sm = window.SceneManager, sc = sm && sm._scene;
      if (!sc) { press(73); setTimeout(function () { release(73); }, 60); return; }
      if (window.Scene_Item && sc instanceof Scene_Item) { sm.pop(); return; }
      if (window.Scene_Map && window.Scene_Item && sc instanceof Scene_Map && !(window.$gameMessage && $gameMessage.isBusy())) {
        if (window.SoundManager && SoundManager.playOk) SoundManager.playOk();
        sm.push(Scene_Item);
        return;
      }
      press(73);
      setTimeout(function () { release(73); }, 60);
    } catch (e) { nlog('E', 'Inventory: ' + e); }
  }

  function startDrag(e, c, n) {
    select(c.id);
    var sx = e.clientX, sy = e.clientY, ox = c.x * window.innerWidth, oy = c.y * window.innerHeight;
    var pid = e.pointerId;
    try { n.setPointerCapture(pid); } catch (x) {}
    function mv(ev) {
      if (ev.pointerId !== pid) return;
      c.x = Math.min(0.98, Math.max(0.02, (ox + ev.clientX - sx) / window.innerWidth));
      c.y = Math.min(0.98, Math.max(0.02, (oy + ev.clientY - sy) / window.innerHeight));
      place(c);
    }
    function up(ev) {
      if (ev.pointerId !== pid) return;
      n.removeEventListener('pointermove', mv);
      n.removeEventListener('pointerup', up);
      n.removeEventListener('pointercancel', up);
      saveLayout();
    }
    n.addEventListener('pointermove', mv);
    n.addEventListener('pointerup', up);
    n.addEventListener('pointercancel', up);
    e.preventDefault();
  }

  function makeBtn(c) {
    var n = el('div', null, 'arp-ctl arp-hit', c.label || '?');
    var pid = null;
    n.addEventListener('pointerdown', function (e) {
      if (editing) { startDrag(e, c, n); return; }
      if (pid !== null) return;
      pid = e.pointerId;
      try { n.setPointerCapture(pid); } catch (x) {}
      n.classList.add('on');
      if (c.type === 'action') { if (c.action === 'inventory') openInventory(); }
      else press(c.code);
      e.preventDefault();
    });
    function end(e) {
      if (editing || e.pointerId !== pid) return;
      pid = null;
      n.classList.remove('on');
      if (c.type === 'key') release(c.code);
    }
    n.addEventListener('pointerup', end);
    n.addEventListener('pointercancel', end);
    n.addEventListener('lostpointercapture', end);
    return n;
  }

  function makeStick(c) {
    var n = el('div', null, 'arp-ctl arp-stick arp-hit');
    var th = el('div', null, 'arp-thumb');
    n.appendChild(th);
    n._thumb = th;
    var pid = null;
    function upd(e) {
      var r = n.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), rad = r.width / 2;
      applyDir(dirFrom(dx, dy, rad));
      var m = Math.sqrt(dx * dx + dy * dy), k = m > rad * 0.55 ? (rad * 0.55) / m : 1;
      th.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
    }
    n.addEventListener('pointerdown', function (e) {
      if (editing) { startDrag(e, c, n); return; }
      if (pid !== null) return;
      pid = e.pointerId;
      try { n.setPointerCapture(pid); } catch (x) {}
      upd(e);
      e.preventDefault();
    });
    n.addEventListener('pointermove', function (e) { if (!editing && e.pointerId === pid) upd(e); });
    function end(e) {
      if (editing || e.pointerId !== pid) return;
      pid = null;
      applyDir({});
      th.style.transform = 'translate(0,0)';
    }
    n.addEventListener('pointerup', end);
    n.addEventListener('pointercancel', end);
    n.addEventListener('lostpointercapture', end);
    return n;
  }

  function buildControls() {
    ctlLayer.innerHTML = '';
    nodes = {};
    layout.forEach(function (c) {
      var n = c.type === 'stick' ? makeStick(c) : makeBtn(c);
      nodes[c.id] = n;
      ctlLayer.appendChild(n);
      place(c);
    });
    if (selId) select(selId);
  }

  function applyPadPrefs() {
    ctlLayer.style.display = (prefs.gamepad || editing) ? 'block' : 'none';
    ctlLayer.style.opacity = editing ? 1 : prefs.opacity;
    if (!prefs.gamepad) applyDir({});
  }
  window.addEventListener('resize', function () { layout.forEach(place); });
  buildControls();
  applyPadPrefs();

  /* ---------- mode atur tombol ---------- */

  var editBar = el('div', 'arp-editbar', 'arp-hit');
  var editHint = el('span', null, null, 'Geser tombol untuk memindah. Ukuran:');
  var scaleIn = document.createElement('input');
  scaleIn.type = 'range'; scaleIn.min = '0.5'; scaleIn.max = '2.5'; scaleIn.step = '0.05'; scaleIn.value = '1';
  var bAdd = el('button', null, null, 'Tambah');
  var bDel = el('button', null, 'del', 'Hapus');
  var bReset = el('button', null, null, 'Reset');
  var bDone = el('button', null, 'pri', 'Selesai');
  [editHint, scaleIn, bAdd, bDel, bReset, bDone].forEach(function (n) { editBar.appendChild(n); });
  root.appendChild(editBar);

  function select(id) {
    selId = id;
    Object.keys(nodes).forEach(function (k) { nodes[k].classList.toggle('sel', k === id); });
    var c = findCtl(id);
    if (c) scaleIn.value = c.s;
  }
  scaleIn.addEventListener('input', function () {
    var c = findCtl(selId);
    if (!c) return;
    c.s = parseFloat(scaleIn.value);
    place(c);
  });
  scaleIn.addEventListener('change', saveLayout);

  function enterEdit() {
    editing = true;
    applyDir({});
    root.classList.add('arp-editing');
    editBar.style.display = 'flex';
    menuBtn.style.display = 'none';
    panel.style.display = 'none';
    applyPadPrefs();
    if (layout.length) select(layout[0].id);
    toast('Mode atur tombol: geser untuk memindah, atur ukuran lewat slider');
  }
  function exitEdit() {
    editing = false;
    root.classList.remove('arp-editing');
    editBar.style.display = 'none';
    menuBtn.style.display = 'block';
    applyPadPrefs();
    saveLayout();
  }
  bDone.addEventListener('click', exitEdit);
  bDel.addEventListener('click', function () {
    if (!selId) return;
    layout = layout.filter(function (c) { return c.id !== selId; });
    selId = null;
    buildControls();
    saveLayout();
    if (layout.length) select(layout[0].id);
  });
  bReset.addEventListener('click', function () {
    layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    selId = null;
    buildControls();
    saveLayout();
    select(layout[0].id);
  });

  /* ---------- dialog tambah tombol ---------- */

  function guardKeys(m) {
    ['keydown', 'keyup', 'keypress'].forEach(function (t) {
      m.addEventListener(t, function (e) { e.stopPropagation(); }, true);
    });
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var addModal = el('div', null, 'arp-modal arp-hit');
  var addBox = el('div', null, 'box');
  addModal.appendChild(addBox);
  root.appendChild(addModal);
  guardKeys(addModal);

  bAdd.addEventListener('click', function () {
    addBox.innerHTML = '';
    var lbl = document.createElement('input');
    lbl.type = 'text'; lbl.maxLength = 4; lbl.placeholder = 'Tulisan di tombol, mis. D';
    var sel = document.createElement('select');
    KEYS.forEach(function (k, i) {
      var o = document.createElement('option');
      o.value = String(i); o.textContent = k[0];
      sel.appendChild(o);
    });
    var inv = document.createElement('option');
    inv.value = 'inv'; inv.textContent = 'Item / Inventory (shortcut)';
    sel.appendChild(inv);
    sel.addEventListener('change', function () {
      if (lbl.value) return;
      lbl.value = sel.value === 'inv' ? 'I' : KEYS[parseInt(sel.value, 10)][0].slice(0, 4);
    });
    var acts = el('div', null, 'acts');
    var cancel = el('button', null, null, 'Batal');
    var save = el('button', null, 'pri', 'Tambah');
    cancel.addEventListener('click', function () { addModal.style.display = 'none'; });
    save.addEventListener('click', function () {
      var c = { id: 'c' + Date.now(), x: 0.5, y: 0.5, s: 1, label: (lbl.value || '?').slice(0, 4) };
      if (sel.value === 'inv') { c.type = 'action'; c.action = 'inventory'; }
      else { c.type = 'key'; c.code = KEYS[parseInt(sel.value, 10)][1]; }
      layout.push(c);
      buildControls();
      select(c.id);
      saveLayout();
      addModal.style.display = 'none';
      toast('Tombol ditambahkan. Geser ke tempat yang kamu mau');
    });
    acts.appendChild(cancel);
    acts.appendChild(save);
    [el('label', null, null, 'Tulisan tombol'), lbl, el('label', null, null, 'Fungsi (tombol keyboard)'), sel, acts]
      .forEach(function (n) { addBox.appendChild(n); });
    addModal.style.display = 'flex';
  });

  /* ---------- log error ---------- */

  var logModal = el('div', null, 'arp-modal arp-hit');
  var logBox = el('div', null, 'box');
  logModal.appendChild(logBox);
  root.appendChild(logModal);

  function openLog() {
    var raw = '';
    try { raw = N.readLog(); } catch (e) {}
    logBox.innerHTML = '';
    var head = el('div', null, null, '<b style="color:#ff6b6b">Log game</b> <span style="color:#8aa0b4;font-size:12px">merah = error, oranye = peringatan</span>');
    var view = el('div', null, 'arp-log');
    var lines = raw ? raw.split('\n') : [];
    var html = lines.map(function (l) {
      var p = l.split('|');
      var lvl = p[1];
      var msg = p.slice(3).join('|').replace(/\u0001/g, '\n');
      var cls = lvl === 'E' ? 'e' : (lvl === 'W' ? 'w' : '');
      return '<div class="' + cls + '">' + esc(p[0] + '  [' + p[2] + ']  ' + msg) + '</div>';
    }).join('');
    view.innerHTML = html || 'Belum ada log.';
    var acts = el('div', null, 'acts');
    var bCopy = el('button', null, null, 'Salin');
    var bClear = el('button', null, null, 'Bersihkan');
    var bClose = el('button', null, 'pri', 'Tutup');
    bCopy.addEventListener('click', function () { try { N.copyText(raw); toast('Log disalin'); } catch (e) {} });
    bClear.addEventListener('click', function () { try { N.clearLog(); } catch (e) {} jsErrors = []; updateBadge(); view.innerHTML = 'Belum ada log.'; });
    bClose.addEventListener('click', function () { logModal.style.display = 'none'; });
    [bCopy, bClear, bClose].forEach(function (b) { acts.appendChild(b); });
    logBox.appendChild(head);
    logBox.appendChild(view);
    logBox.appendChild(acts);
    logModal.style.display = 'flex';
    view.scrollTop = view.scrollHeight;
  }

  /* ---------- menu overlay ---------- */

  var menuBtn = el('div', 'arp-menu-btn', 'arp-hit', '&#9776;');
  var badge = el('div', 'arp-badge');
  menuBtn.appendChild(badge);
  var panel = el('div', 'arp-panel', 'arp-hit');
  root.appendChild(menuBtn);
  root.appendChild(panel);

  function updateBadge() {
    if (!badge) return;
    badge.textContent = String(jsErrors.length);
    badge.style.display = (prefs.debug && jsErrors.length) ? 'block' : 'none';
  }
  updateBadge();

  function row(label, tag, fn, red) {
    var b = el('button', null, 'arp-row', '<span>' + label + '</span>' + (tag ? '<span class="arp-tag' + (red ? ' red' : '') + '">' + tag + '</span>' : ''));
    b.addEventListener('click', fn);
    return b;
  }

  function renderPanel() {
    panel.innerHTML = '';
    panel.appendChild(el('div', null, 'arp-title', esc((prefs.title || 'GAME').toUpperCase())));

    panel.appendChild(row('Terjemahan langsung (' + esc(prefs.lang) + ')', prefs.translate ? 'ON' : 'OFF', function () {
      if (!prefs.translate && !prefs.hasKey) { toast('API key belum diisi di Pengaturan'); return; }
      savePref('translate', !prefs.translate);
      toast(prefs.translate ? 'Terjemahan aktif' : 'Terjemahan dimatikan');
      scheduleRefresh();
      renderPanel();
    }));
    panel.appendChild(row('Tombol di layar', prefs.gamepad ? 'ON' : 'OFF', function () {
      savePref('gamepad', !prefs.gamepad);
      applyPadPrefs();
      renderPanel();
    }));
    panel.appendChild(row('Atur posisi dan ukuran tombol', '', enterEdit));

    panel.appendChild(el('div', null, 'arp-title', 'TRANSPARANSI TOMBOL'));
    var sl = document.createElement('input');
    sl.type = 'range'; sl.min = '0.15'; sl.max = '1'; sl.step = '0.05'; sl.value = prefs.opacity;
    sl.addEventListener('input', function () { prefs.opacity = parseFloat(sl.value); applyPadPrefs(); });
    sl.addEventListener('change', function () { savePref('opacity', parseFloat(sl.value)); });
    panel.appendChild(sl);

    panel.appendChild(row('Edit terjemahan langsung', '', function () { panel.style.display = 'none'; openStudio(); }));
    panel.appendChild(row('Log dan error', jsErrors.length ? jsErrors.length + ' error' : '', function () { panel.style.display = 'none'; openLog(); }, true));
    panel.appendChild(row('Keluar ke launcher', '', function () { N.exitGame(); }));
  }

  menuBtn.addEventListener('click', function () {
    if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
    renderPanel();
    panel.style.display = 'block';
  });

  /* ---------- edit studio ---------- */

  var modal = el('div', 'arp-modal-old', 'arp-modal arp-hit');
  var box = el('div', null, 'box');
  modal.appendChild(box);
  root.appendChild(modal);

  // Keyboard di dalam modal tidak boleh bocor ke input RPG Maker
  ['keydown', 'keyup', 'keypress'].forEach(function (t) {
    modal.addEventListener(t, function (e) { e.stopPropagation(); }, true);
  });

  function openStudio() {
    var all = history.concat(uiHistory);
    if (!all.length) { toast('Belum ada teks yang diterjemahkan'); return; }
    box.innerHTML = '';
    var pick = document.createElement('select');
    all.forEach(function (h, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = (h.ui ? '[Menu] ' : '[Dialog] ') + h.original.replace(/\s+/g, ' ').slice(0, 46);
      pick.appendChild(o);
    });
    var orig = document.createElement('textarea');
    orig.readOnly = true;
    var edit = document.createElement('textarea');

    function load() {
      var h = all[pick.value];
      orig.value = h.original;
      edit.value = h.translated;
    }
    pick.addEventListener('change', load);
    load();

    var l1 = el('label', null, null, 'Teks terakhir (pilih salah satu)');
    var l2 = el('label', null, null, 'Teks asli (tanda {0} {1} adalah angka, jangan dihapus)');
    var l3 = el('label', null, null, 'Terjemahan kamu');
    var acts = el('div', null, 'acts');
    var cancel = el('button', null, null, 'Batal');
    var save = el('button', null, 'pri', 'Simpan');
    cancel.addEventListener('click', function () { modal.style.display = 'none'; });
    save.addEventListener('click', function () {
      var h = all[pick.value];
      var v = edit.value;
      if (!v.trim()) { toast('Terjemahan tidak boleh kosong'); return; }
      try { N.saveOverride(h.original, v); } catch (e) {}
      h.translated = v;
      if (h.ui) {
        tmap[h.original] = v;
        done[v] = true;
        scheduleRefresh();
        toast('Tersimpan dan langsung dipakai');
      } else {
        toast('Tersimpan. Dipakai setiap kali dialog ini muncul lagi');
      }
      modal.style.display = 'none';
    });
    acts.appendChild(cancel);
    acts.appendChild(save);
    [l1, pick, l2, orig, l3, edit, acts].forEach(function (n) { box.appendChild(n); });
    modal.style.display = 'flex';
  }
})();
