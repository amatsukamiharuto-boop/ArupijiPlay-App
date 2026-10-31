/*
 * ArupijiPlay - skrip yang disuntik otomatis ke halaman game.
 * Isinya: gamepad virtual, menu overlay, dan hook terjemahan untuk RPG Maker MV/MZ.
 */
(function () {
  'use strict';
  if (window.__arupijiLoaded || !window.ArupijiNative) return;
  window.__arupijiLoaded = true;

  var N = window.ArupijiNative;
  var prefs = { translate: false, gamepad: true, opacity: 0.55, hasKey: false, lang: 'Indonesian', title: '' };
  try { prefs = JSON.parse(N.getPrefs()); } catch (e) {}

  function savePref(k, v) {
    prefs[k] = v;
    try { N.setPref(k, String(v)); } catch (e) {}
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
    '#arp-panel{position:absolute;top:calc(54px + env(safe-area-inset-top,0px));left:calc(8px + env(safe-area-inset-left,0px));',
    'width:min(290px,72vw);max-height:calc(100% - 70px);overflow-y:auto;background:rgba(18,22,30,.96);',
    'border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:8px;display:none;touch-action:pan-y}',
    '.arp-row{display:flex;justify-content:space-between;align-items:center;width:100%;margin:0 0 6px;padding:11px 12px;',
    'border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#e8eef5;font-size:14px;text-align:left}',
    '.arp-row:active{background:rgba(255,255,255,.18)}',
    '.arp-tag{font-size:12px;color:#8fd0f7;font-weight:700}',
    '.arp-title{color:#8aa0b4;font-size:11px;margin:2px 4px 8px;letter-spacing:.4px}',
    '#arp-panel input[type=range]{width:100%;margin:2px 0 10px}',
    '#arp-toast{position:absolute;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);',
    'background:rgba(18,22,30,.92);color:#fff;padding:8px 14px;border-radius:20px;font-size:13px;opacity:0;transition:opacity .25s;max-width:70vw;text-align:center}',
    '#arp-pad-left,#arp-pad-right{position:absolute;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:scale(var(--sc,1))}',
    '#arp-pad-left{left:calc(20px + env(safe-area-inset-left,0px));width:150px;height:190px;transform-origin:left bottom}',
    '#arp-pad-right{right:calc(20px + env(safe-area-inset-right,0px));width:240px;height:170px;transform-origin:right bottom}',
    '#arp-dpad{position:absolute;left:0;bottom:0;width:150px;height:150px;border-radius:50%;',
    'background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.28);touch-action:none}',
    '#arp-dpad i{position:absolute;color:rgba(255,255,255,.55);font-style:normal;font-size:20px}',
    '#arp-thumb{position:absolute;left:50px;top:50px;width:50px;height:50px;border-radius:50%;background:rgba(143,208,247,.45);',
    'border:2px solid rgba(255,255,255,.45)}',
    '.arp-b{position:absolute;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.3);',
    'color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;touch-action:none}',
    '.arp-b.on{background:rgba(143,208,247,.5)}',
    '.arp-pill{border-radius:10px}',
    '#arp-modal{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center}',
    '#arp-modal .box{width:min(560px,92vw);max-height:92%;overflow:auto;background:#161b24;border-radius:14px;padding:14px;color:#e8eef5;touch-action:pan-y}',
    '#arp-modal label{display:block;font-size:12px;color:#8aa0b4;margin:8px 0 4px}',
    '#arp-modal textarea,#arp-modal select{width:100%;background:#0e1218;color:#fff;border:1px solid #2c3644;border-radius:8px;padding:8px;font-size:14px}',
    '#arp-modal textarea{min-height:70px;resize:vertical;font-family:inherit}',
    '#arp-modal .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}',
    '#arp-modal button{padding:9px 16px;border-radius:8px;border:0;font-size:14px;background:#2a3442;color:#fff}',
    '#arp-modal button.pri{background:#5bb8f0;color:#06222f;font-weight:700}'
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

  // Supaya sentuhan di overlay tidak dianggap klik ke layar game
  ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mousemove', 'mouseup', 'click', 'wheel']
    .forEach(function (t) {
      root.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
    });

  /* ---------- kirim tombol keyboard ke RPG Maker ---------- */

  var KEYNAME = { 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 90: 'z', 88: 'x', 27: 'Escape', 16: 'Shift', 33: 'PageUp', 34: 'PageDown' };
  var held = {};

  function fire(type, code) {
    var e;
    try {
      e = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: KEYNAME[code] || '', keyCode: code, which: code });
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

  /* ---------- gamepad ---------- */

  var gamepad = el('div', 'arp-gamepad');
  var left = el('div', 'arp-pad-left', 'arp-hit');
  var right = el('div', 'arp-pad-right', 'arp-hit');
  var dpad = el('div', 'arp-dpad', 'arp-hit',
    '<i style="left:62px;top:6px">&#9650;</i><i style="left:62px;bottom:6px">&#9660;</i>' +
    '<i style="left:8px;top:61px">&#9664;</i><i style="right:8px;top:61px">&#9654;</i>');
  var thumb = el('div', 'arp-thumb');
  dpad.appendChild(thumb);
  left.appendChild(dpad);

  function mkBtn(label, code, cls, style) {
    var b = el('div', null, 'arp-b arp-hit ' + (cls || ''), label);
    b.style.cssText = style;
    bindBtn(b, code);
    return b;
  }
  function bindBtn(node, code) {
    var pid = null;
    node.addEventListener('pointerdown', function (e) {
      if (pid !== null) return;
      pid = e.pointerId;
      try { node.setPointerCapture(pid); } catch (x) {}
      node.classList.add('on');
      press(code);
      e.preventDefault();
    });
    function end(e) {
      if (e.pointerId !== pid) return;
      pid = null;
      node.classList.remove('on');
      release(code);
    }
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('lostpointercapture', end);
  }

  left.appendChild(mkBtn('L', 33, 'arp-pill', 'left:0;top:0;width:60px;height:32px;font-size:14px'));
  left.appendChild(mkBtn('R', 34, 'arp-pill', 'left:70px;top:0;width:60px;height:32px;font-size:14px'));
  right.appendChild(mkBtn('A', 90, '', 'right:0;bottom:0;width:72px;height:72px;font-size:24px'));
  right.appendChild(mkBtn('B', 88, '', 'right:84px;bottom:34px;width:72px;height:72px;font-size:24px'));
  right.appendChild(mkBtn('Dash', 16, '', 'right:0;bottom:84px;width:54px;height:54px;font-size:11px'));
  right.appendChild(mkBtn('Menu', 27, '', 'right:96px;bottom:114px;width:54px;height:54px;font-size:11px'));

  function dirFrom(dx, dy, rad) {
    var res = {}, dead = rad * 0.22, ax = Math.abs(dx), ay = Math.abs(dy);
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
  (function () {
    var pid = null;
    function upd(e) {
      var r = dpad.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy, rad = r.width / 2;
      applyDir(dirFrom(dx, dy, rad));
      var m = Math.sqrt(dx * dx + dy * dy), k = m > rad * 0.5 ? (rad * 0.5) / m : 1;
      var s = r.width / 150; // kompensasi skala
      thumb.style.transform = 'translate(' + (dx * k / s) + 'px,' + (dy * k / s) + 'px)';
    }
    function end(e) {
      if (e.pointerId !== pid) return;
      pid = null;
      applyDir({});
      thumb.style.transform = 'translate(0,0)';
    }
    dpad.addEventListener('pointerdown', function (e) {
      if (pid !== null) return;
      pid = e.pointerId;
      try { dpad.setPointerCapture(pid); } catch (x) {}
      upd(e);
      e.preventDefault();
    });
    dpad.addEventListener('pointermove', function (e) { if (e.pointerId === pid) upd(e); });
    dpad.addEventListener('pointerup', end);
    dpad.addEventListener('pointercancel', end);
    dpad.addEventListener('lostpointercapture', end);
  })();

  gamepad.appendChild(left);
  gamepad.appendChild(right);
  root.appendChild(gamepad);

  function layoutPad() {
    var sc = Math.max(0.7, Math.min(1.3, window.innerHeight / 360));
    root.style.setProperty('--sc', sc);
  }
  function applyPadPrefs() {
    gamepad.style.display = prefs.gamepad ? 'block' : 'none';
    gamepad.style.opacity = prefs.opacity;
    if (!prefs.gamepad) applyDir({});
  }
  window.addEventListener('resize', layoutPad);
  layoutPad();
  applyPadPrefs();

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

  var pending = {}, seq = 0, history = [], lastErrAt = 0;

  window.__arupiji = {
    onResult: function (id, text, source) {
      var cb = pending[id];
      if (cb) { delete pending[id]; cb(text, source); }
    }
  };

  function translate(text) {
    return new Promise(function (resolve) {
      var id = ++seq;
      var t = setTimeout(function () {
        if (pending[id]) { delete pending[id]; resolve({ text: text, source: 'timeout' }); }
      }, 45000);
      pending[id] = function (tr, src) { clearTimeout(t); resolve({ text: tr, source: src }); };
      try { N.translate(id, text); } catch (e) { clearTimeout(t); delete pending[id]; resolve({ text: text, source: 'error' }); }
    });
  }

  function note(source) {
    var now = Date.now();
    if (source === 'nokey' && now - lastErrAt > 15000) { lastErrAt = now; toast('API key belum diisi di Pengaturan'); }
    else if ((source === 'error' || source === 'timeout') && now - lastErrAt > 8000) { lastErrAt = now; toast('Terjemahan gagal, teks asli ditampilkan'); }
  }

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

    // updateLoading dipakai RPG Maker untuk menunggu gambar wajah. Kita ikut menahan
    // di sini selama terjemahan belum datang, jadi dialog muncul begitu teksnya siap.
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
    return true;
  }

  var tries = 0;
  var hookTimer = setInterval(function () {
    tries++;
    if (hookMessages() || tries > 120) {
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

  /* ---------- menu overlay ---------- */

  var menuBtn = el('div', 'arp-menu-btn', 'arp-hit', '&#9776;');
  var panel = el('div', 'arp-panel', 'arp-hit');
  root.appendChild(menuBtn);
  root.appendChild(panel);

  function row(label, tag, fn) {
    var b = el('button', null, 'arp-row', '<span>' + label + '</span>' + (tag ? '<span class="arp-tag">' + tag + '</span>' : ''));
    b.addEventListener('click', fn);
    return b;
  }

  function renderPanel() {
    panel.innerHTML = '';
    panel.appendChild(el('div', null, 'arp-title', (prefs.title || 'GAME').toUpperCase()));

    panel.appendChild(row('Terjemahan AI (' + prefs.lang + ')', prefs.translate ? 'ON' : 'OFF', function () {
      if (!prefs.translate && !prefs.hasKey) { toast('API key belum diisi di Pengaturan'); return; }
      savePref('translate', !prefs.translate);
      toast(prefs.translate ? 'Terjemahan aktif, berlaku di dialog berikutnya' : 'Terjemahan dimatikan');
      renderPanel();
    }));
    panel.appendChild(row('Gamepad virtual', prefs.gamepad ? 'ON' : 'OFF', function () {
      savePref('gamepad', !prefs.gamepad);
      applyPadPrefs();
      renderPanel();
    }));

    panel.appendChild(el('div', null, 'arp-title', 'TRANSPARANSI GAMEPAD'));
    var sl = document.createElement('input');
    sl.type = 'range'; sl.min = '0.15'; sl.max = '1'; sl.step = '0.05'; sl.value = prefs.opacity;
    sl.addEventListener('input', function () { prefs.opacity = parseFloat(sl.value); applyPadPrefs(); });
    sl.addEventListener('change', function () { savePref('opacity', parseFloat(sl.value)); });
    panel.appendChild(sl);

    panel.appendChild(row('Edit terjemahan', '', function () { panel.style.display = 'none'; openStudio(); }));
    panel.appendChild(row('Keluar ke launcher', '', function () { N.exitGame(); }));
  }

  menuBtn.addEventListener('click', function () {
    if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
    renderPanel();
    panel.style.display = 'block';
  });

  /* ---------- edit studio ---------- */

  var modal = el('div', 'arp-modal', 'arp-hit');
  var box = el('div', null, 'box');
  modal.appendChild(box);
  root.appendChild(modal);

  // Keyboard di dalam modal tidak boleh bocor ke input RPG Maker
  ['keydown', 'keyup', 'keypress'].forEach(function (t) {
    modal.addEventListener(t, function (e) { e.stopPropagation(); }, true);
  });

  function openStudio() {
    if (!history.length) { toast('Belum ada dialog yang diterjemahkan'); return; }
    box.innerHTML = '';
    var pick = document.createElement('select');
    history.forEach(function (h, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = (i + 1) + '. ' + h.original.replace(/\s+/g, ' ').slice(0, 50);
      pick.appendChild(o);
    });
    var orig = document.createElement('textarea');
    orig.readOnly = true;
    var edit = document.createElement('textarea');

    function load() {
      var h = history[pick.value];
      orig.value = h.original;
      edit.value = h.translated;
    }
    pick.addEventListener('change', load);
    load();

    var l1 = el('label', null, null, 'Dialog terakhir (pilih salah satu)');
    var l2 = el('label', null, null, 'Teks asli');
    var l3 = el('label', null, null, 'Terjemahan kamu');
    var acts = el('div', null, 'acts');
    var cancel = el('button', null, null, 'Batal');
    var save = el('button', null, 'pri', 'Simpan');
    cancel.addEventListener('click', function () { modal.style.display = 'none'; });
    save.addEventListener('click', function () {
      var h = history[pick.value];
      var v = edit.value;
      if (!v.trim()) { toast('Terjemahan tidak boleh kosong'); return; }
      try { N.saveOverride(h.original, v); } catch (e) {}
      h.translated = v;
      modal.style.display = 'none';
      toast('Tersimpan. Dipakai setiap kali dialog ini muncul lagi');
    });
    acts.appendChild(cancel);
    acts.appendChild(save);
    [l1, pick, l2, orig, l3, edit, acts].forEach(function (n) { box.appendChild(n); });
    modal.style.display = 'flex';
  }
})();
