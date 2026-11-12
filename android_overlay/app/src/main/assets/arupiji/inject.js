/*
 * ArupijiPlay - skrip yang disuntik otomatis ke halaman game.
 * Isinya: kontrol layar yang bisa diatur, menu overlay, log debug, dan terjemahan langsung (opsional).
 */
(function () {
  'use strict';
  if (window.__arupijiLoaded || !window.ArupijiNative) return;
  window.__arupijiLoaded = true;

  var N = window.ArupijiNative;
  var prefs = { translate: false, gamepad: true, opacity: 0.55, hasKey: false, lang: 'Indonesian', title: '', debug: false, cursor: false, cursorSpeed: 1.6, audioExt: '',
    cheat: true, fps: false, appLang: 'id', btnScale: 1 };
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

  // Game hasil deploy PC biasanya hanya punya .ogg, engine di HP meminta .m4a. Samakan dengan file yang ada.
  function hookAudio() {
    if (!prefs.audioExt || !window.AudioManager || AudioManager.__arpExt) return;
    AudioManager.__arpExt = true;
    AudioManager.audioFileExt = function () { return prefs.audioExt; };
  }
  hookAudio();

  /* ---------- save ke file di folder game ---------- */

  // Save RPG Maker dialihkan dari penyimpanan browser ke file save/ di folder game,
  // dengan nama dan isi yang sama seperti versi PC. Kalau gagal, otomatis kembali ke cara lama.
  function u8ToB64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToU8(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function refreshTitleWindow() {
    try {
      var sc = window.SceneManager && SceneManager._scene;
      if (sc && sc._commandWindow && sc._commandWindow.refresh) sc._commandWindow.refresh();
    } catch (e) {}
  }
  function reloadAfterStorage(isMZ) {
    try {
      if (window.ConfigManager && ConfigManager.load) {
        var r = ConfigManager.load();
        if (r && r.catch) r.catch(function () {});
      }
    } catch (e) {}
    try {
      if (isMZ && window.DataManager && DataManager.loadGlobalInfo) {
        var g = DataManager.loadGlobalInfo();
        if (g && g.then) g.then(refreshTitleWindow, function () {});
      }
    } catch (e) {}
  }
  function installStorage() {
    var SM = window.StorageManager;
    if (!SM || SM.__arpStore || !window.ArupijiNative || !N.saveWrite) return false;

    // RPG Maker MV: isi file = LZString base64, sama dengan file .rpgsave versi PC
    if (SM.saveToWebStorage && SM.loadFromWebStorage && window.LZString) {
      SM.__arpStore = true;
      var o = { save: SM.saveToWebStorage, load: SM.loadFromWebStorage, exists: SM.webStorageExists, remove: SM.removeWebStorage };
      var fname = function (id) { return id < 0 ? 'config.rpgsave' : (id === 0 ? 'global.rpgsave' : 'file' + id + '.rpgsave'); };
      SM.saveToWebStorage = function (id, json) {
        var ok = false;
        try { ok = N.saveWrite(fname(id), LZString.compressToBase64(json), false); } catch (e) {}
        if (!ok) { nlog('W', 'Save ke file gagal, memakai penyimpanan browser'); o.save.call(this, id, json); }
      };
      SM.loadFromWebStorage = function (id) {
        var data = '';
        try { data = N.saveRead(fname(id), false); } catch (e) {}
        if (data) return LZString.decompressFromBase64(data);
        return o.load.call(this, id);
      };
      SM.webStorageExists = function (id) {
        try { if (N.saveExists(fname(id))) return true; } catch (e) {}
        return o.exists.call(this, id);
      };
      SM.removeWebStorage = function (id) {
        try { N.saveDelete(fname(id)); } catch (e) {}
        return o.remove.call(this, id);
      };
      // pindahkan save lama dari penyimpanan browser ke file (sekali saja)
      try {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        keys.forEach(function (k) {
          var m = /^RPG (Config|Global|File(\d+))$/.exec(k);
          if (!m) return;
          var name = m[1] === 'Config' ? 'config.rpgsave' : (m[1] === 'Global' ? 'global.rpgsave' : 'file' + m[2] + '.rpgsave');
          if (!N.saveExists(name)) { var v = localStorage.getItem(k); if (v) N.saveWrite(name, v, false); }
        });
      } catch (e) { nlog('W', 'Migrasi save lama: ' + e); }
      reloadAfterStorage(false);
      return true;
    }

    // RPG Maker MZ: isi file = data zip (pako), disimpan sebagai berkas biner .rmmzsave
    if (SM.saveZip && SM.loadZip) {
      SM.__arpStore = true;
      var z = { save: SM.saveZip, load: SM.loadZip, exists: SM.exists, remove: SM.remove };
      var zname = function (n) { return String(n).replace(/[^A-Za-z0-9._-]/g, '_') + '.rmmzsave'; };
      SM.saveZip = function (saveName, zip) {
        var self = this;
        return new Promise(function (resolve, reject) {
          var ok = false;
          try { ok = N.saveWrite(zname(saveName), u8ToB64(new Uint8Array(zip.buffer ? zip.buffer : zip, zip.byteOffset || 0, zip.byteLength)), true); } catch (e) {}
          if (ok) resolve(); else z.save.call(self, saveName, zip).then(resolve, reject);
        });
      };
      SM.loadZip = function (saveName) {
        var b64 = '';
        try { b64 = N.saveRead(zname(saveName), true); } catch (e) {}
        if (b64) return Promise.resolve(b64ToU8(b64));
        return z.load.call(this, saveName);
      };
      SM.exists = function (saveName) {
        try { if (N.saveExists(zname(saveName))) return true; } catch (e) {}
        return z.exists.call(this, saveName);
      };
      SM.remove = function (saveName) {
        try { N.saveDelete(zname(saveName)); } catch (e) {}
        return z.remove.call(this, saveName);
      };
      reloadAfterStorage(true);
      return true;
    }
    return false;
  }
  installStorage();

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
    '#arp-cursor-layer{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:auto;touch-action:none;display:none}',
    '#arp-fps{position:absolute;top:calc(6px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));padding:2px 7px;border-radius:8px;background:rgba(0,0,0,.55);font:700 12px monospace;display:none;pointer-events:none}',
    '#arp-cursor{position:absolute;left:0;top:0;width:24px;height:24px;margin:-2px 0 0 -3px;pointer-events:none;display:none;z-index:5}',
    '.arp-log{font-family:monospace;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-all;background:#fff;color:#37474f;border-radius:8px;padding:8px;max-height:55vh;overflow:auto;touch-action:pan-y}',
    '.arp-log .e{color:#d50000;font-weight:700}.arp-log .w{color:#e65100}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- bahasa tampilan overlay (id / en) ---------- */

  var LANG = (prefs.appLang === 'en') ? 'en' : 'id';
  var EN = {
    'Atur posisi dan ukuran tombol': 'Edit button position and size',
    'Cheat (mirip MTools)': 'Cheat',
    'Keluar ke launcher': 'Exit to launcher',
    'Geser tombol untuk memindah. Ukuran:': 'Drag a button to move it. Size:',
    'Tambah': 'Add', 'Hapus': 'Delete', 'Reset': 'Reset', 'Selesai': 'Done', 'Batal': 'Cancel', 'Tutup': 'Close',
    'Mode atur tombol: geser untuk memindah, atur ukuran lewat slider': 'Edit mode: drag to move, use the slider to resize',
    'Tulisan tombol': 'Button label', 'Fungsi (tombol keyboard)': 'Function (keyboard key)',
    'Tulisan di tombol, mis. D': 'Button label, e.g. D', 'Item / Inventory (shortcut)': 'Items / Inventory (shortcut)',
    'Tombol ditambahkan. Geser ke tempat yang kamu mau': 'Button added. Drag it where you want',
    '<b>Cheat</b> <span class="ch-sub">mirip MTools, hanya untuk game yang sedang berjalan</span>': '<b>Cheat</b> <span class="ch-sub">MTools-style, only for the running game</span>',
    'Mulai game baru atau muat save dulu, baru cheat bisa dipakai': 'Start a new game or load a save first, then cheats work',
    'Umum': 'General', 'Item': 'Items', 'Senjata': 'Weapons', 'Armor': 'Armor', 'Switch': 'Switches', 'Variabel': 'Variables',
    'Aktor': 'Actors', 'Teleport': 'Teleport', 'Data': 'Data', 'Event': 'Events', 'Save': 'Save', 'Konsol': 'Console',
    'GOLD': 'GOLD', 'Gold': 'Gold', 'PARTY': 'PARTY', 'BATTLE': 'BATTLE', 'CHEAT AKTIF': 'ACTIVE CHEATS',
    'Set': 'Set', 'Max': 'Max', 'Salin': 'Copy', 'Muat': 'Load', 'Ekspor': 'Export', 'Edit': 'Edit', 'Jalankan': 'Run',
    'Pulihkan semua anggota': 'Heal all members', 'Isi TP penuh': 'Fill TP', 'Party pulih penuh': 'Party fully healed', 'TP penuh': 'TP filled',
    'Level maksimal semua': 'Max level for all', 'Semua anggota level maksimal': 'All members at max level',
    'Stat besar semua (9999)': 'Big stats for all (9999)', 'Stat semua anggota dinaikkan': 'All members\' stats raised',
    'Izinkan save dan menu': 'Allow save and menu', 'Save dan menu diizinkan': 'Save and menu allowed', 'Langkah': 'Steps',
    'Jumlah langkah diubah': 'Step count changed',
    'Bunuh semua musuh': 'Kill all enemies', 'Kabur dari battle': 'Escape battle',
    'Hanya bisa saat sedang battle': 'Only works during a battle', 'Semua musuh dikalahkan': 'All enemies defeated',
    'Kebal (HP party tidak berkurang)': 'Invincible (party HP does not drop)', 'Sekali pukul (musuh langsung mati)': 'One-hit kill',
    'Tembus tembok': 'Walk through walls', 'Tanpa pertemuan musuh': 'No random encounters', 'Skill tanpa biaya MP/TP': 'Skills cost no MP/TP',
    'Item tidak berkurang saat dipakai': 'Items are not consumed', 'Batas item 9999': 'Item limit 9999',
    'Aksi dua kali per giliran': 'Double action per turn', 'Serangan selalu critical': 'Attacks always critical',
    'Serangan selalu kena (tidak meleset)': 'Attacks always hit', 'HP, MP, TP penuh tiap giliran': 'HP, MP, TP full every turn',
    'Kecepatan jalan': 'Walk speed', 'Kecepatan game': 'Game speed', 'Pengali EXP': 'EXP multiplier',
    'Pengali Gold dari musuh': 'Enemy gold multiplier', 'Peluang drop item musuh': 'Enemy item drop chance',
    'Normal': 'Normal', 'Selalu drop': 'Always drop',
    'Cari nama atau ID': 'Search name or ID', 'Beri semua \u00d799': 'Give all \u00d799', 'Kosongkan semua': 'Clear all',
    'Semua diisi 99': 'All set to 99', 'Semua dikosongkan': 'All cleared',
    'Hanya yang punya nama': 'Named only', 'Tampilkan semua (termasuk tanpa nama): ON': 'Show all (including unnamed): ON',
    '(tanpa nama)': '(unnamed)',
    'Level': 'Level', 'EXP': 'EXP', 'HP': 'HP', 'MP': 'MP', 'TP': 'TP',
    'Pulihkan penuh': 'Heal fully', 'Level maksimal': 'Max level', 'Keluarkan dari party': 'Remove from party', 'Masukkan ke party': 'Add to party',
    'NAMA DAN KELAS': 'NAME AND CLASS', 'Nama': 'Name', 'Nama diubah': 'Name changed', 'Ganti kelas (EXP dipertahankan)': 'Change class (keep EXP)',
    'Kelas diganti': 'Class changed', 'EQUIP': 'EQUIP', 'Pasang': 'Equip', 'Equip diganti': 'Equipment changed', 'STATE': 'STATES',
    'Aktif': 'Active', 'Tidak aktif': 'Inactive', 'SKILL': 'SKILLS', 'Pelajari semua skill': 'Learn all skills',
    'Semua skill dipelajari': 'All skills learned', 'Dipelajari': 'Learned', 'Belum': 'Not yet',
    'Tidak ada data aktor.': 'No actor data.', 'Aktor tidak tersedia.': 'Actor unavailable.',
    'POSISI SEKARANG': 'CURRENT POSITION', 'PINDAH KE': 'MOVE TO', 'Pindah sekarang': 'Move now',
    'Tidak bisa pindah saat battle': 'Cannot move during battle', 'Peta belum dimuat.': 'Map not loaded yet.',
    'Pilih entri lalu ubah isinya. Perubahan langsung berlaku di game yang sedang jalan. ': 'Pick an entry and edit it. Changes apply immediately in the running game. ',
    'Tekan Simpan permanen supaya tetap ada setelah game ditutup (file asli dicadangkan).': 'Press Save permanently to keep changes after the game closes (the original file is backed up).',
    'Simpan semua permanen': 'Save all permanently', 'Hapus semua perubahan permanen': 'Remove all permanent changes',
    'Simpan permanen entri ini': 'Save this entry permanently', '< Kembali ke daftar': '< Back to list',
    'Diubah, langsung berlaku di game': 'Changed, applied in game now', 'Tersimpan permanen': 'Saved permanently',
    'Belum ada perubahan': 'No changes yet', 'Belum ada perubahan data untuk disimpan': 'No data changes to save',
    'Gagal menyimpan': 'Failed to save', 'Isi dengan angka': 'Enter a number', 'Format JSON tidak valid': 'Invalid JSON format',
    'Semua isi harus angka, pisahkan dengan koma': 'All values must be numbers, separated by commas',
    'Data dikembalikan ke asli. Mulai ulang game agar berlaku. Terapkan ulang terjemahan dari Studio bila perlu.': 'Data restored to original. Restart the game to apply.',
    'Gagal mengembalikan data': 'Failed to restore data', 'Entri tidak ditemukan.': 'Entry not found.',
    'Nama': 'Name', 'Deskripsi': 'Description', 'Harga': 'Price', 'Habis setelah dipakai': 'Consumed on use', 'Sasaran': 'Scope',
    'Kapan bisa dipakai': 'Usable when', 'Kecepatan': 'Speed', 'Peluang berhasil': 'Success rate', 'Pengulangan': 'Repeats',
    'TP didapat': 'TP gain', 'Rumus damage': 'Damage formula', 'Variasi damage': 'Damage variance', 'Bisa critical': 'Can crit',
    'Elemen': 'Element', 'Biaya MP': 'MP cost', 'Biaya TP': 'TP cost', 'EXP dari musuh': 'EXP from enemy', 'Gold dari musuh': 'Gold from enemy',
    'Catatan': 'Notes', 'Tipe senjata': 'Weapon type', 'Tipe armor': 'Armor type', 'Tipe slot equip': 'Equip slot type',
    'Tipe item (2 = key item)': 'Item type (2 = key item)', 'Level awal': 'Initial level', 'Julukan': 'Nickname', 'Profil': 'Profile',
    'Efek (JSON)': 'Effects (JSON)', 'Sifat (JSON)': 'Traits (JSON)', 'Drop item (JSON)': 'Drop items (JSON)',
    'Aksi musuh (JSON)': 'Enemy actions (JSON)', 'Skill per level (JSON)': 'Skills per level (JSON)', 'Parameter EXP': 'EXP parameters',
    'Stat [MHP, MMP, ATK, DEF, MAT, MDF, AGI, LUK]': 'Stats [MHP, MMP, ATK, DEF, MAT, MDF, AGI, LUK]',
    'Tipe damage (0 tidak ada, 1 HP, 2 MP, 3 serap HP, 4 serap MP, 5 dan 6 pulih)': 'Damage type (0 none, 1 HP, 2 MP, 3 drain HP, 4 drain MP, 5 and 6 recover)',
    'Musuh': 'Enemies', 'Kelas': 'Classes',
    'Jalankan, pindahkan, atau hapus event. Hapus dan pindah biasa hanya berlaku sampai peta dimuat ulang. ': 'Run, move, or delete events. Normal delete and move last until the map reloads. ',
    'Tombol permanen menulis perubahan ke file peta.': 'Permanent buttons write the change to the map file.',
    'EVENT UMUM': 'COMMON EVENTS', 'Ke sana': 'Go there', 'Tarik ke depanku': 'Pull in front of me', 'Simpan posisi': 'Save position',
    'Hapus permanen': 'Delete permanently', 'Event dipindah ke depanmu': 'Event moved in front of you', 'Event dihapus sementara': 'Event deleted for now',
    'Event dihapus permanen': 'Event deleted permanently', 'Posisi disimpan permanen': 'Position saved permanently', 'Event dijalankan': 'Event started',
    'Cara edit save: Muat slot, ubah isinya lewat tab Umum, Item, Aktor, Switch, Variabel, lalu Simpan ke slot. ': 'To edit a save: load a slot, change things with the General, Items, Actors, Switches, Variables tabs, then Save to slot. ',
    'Simpan di sini tidak dibatasi menu game. File ekspor ada di folder Android/data/com.arupiji.play/files/saves.': 'Saving here ignores the game\'s menu limits. Exported files are in Android/data/com.arupiji.play/files/saves.',
    'KONDISI SEKARANG': 'CURRENT STATE', 'Ekspor ke file': 'Export to file', 'SLOT SAVE': 'SAVE SLOTS', 'Simpan ke sini': 'Save here',
    'IMPOR DARI FILE': 'IMPORT FROM FILE', 'Belum ada file ekspor.': 'No exported files yet.', 'Muat ke game': 'Load into game',
    'File kosong atau tidak terbaca': 'File is empty or unreadable', 'File save tidak valid': 'Invalid save file',
    'Save dimuat dari file. Simpan ke slot bila ingin menyimpannya.': 'Save loaded from file. Save to a slot to keep it.',
    'Fitur save tidak tersedia di game ini.': 'Save features are not available in this game.',
    'Gagal membaca slot': 'Failed to read slot', 'Gagal memuat slot': 'Failed to load slot', 'Gagal menghapus slot': 'Failed to delete slot',
    'Gagal mengekspor': 'Failed to export', 'Gagal menulis file': 'Failed to write file',
    'Jalankan JavaScript langsung di game. Contoh: $gameParty.gainGold(1000)  atau  $gameVariables.setValue(5, 10)  atau  $gameParty.leader().name()': 'Run JavaScript directly in the game. Example: $gameParty.gainGold(1000)  or  $gameVariables.setValue(5, 10)  or  $gameParty.leader().name()',
    'Tulis kode di sini': 'Write code here', 'Hasil akan tampil di sini.': 'Results will appear here.', 'Bersihkan hasil': 'Clear results',
    'Tab ini gagal dibuka: ': 'This tab failed to open: ',
    '<span class="ch-sub">kosong</span>': '<span class="ch-sub">empty</span>',
    'Disimpan: ': 'Saved: ', 'Tersimpan di slot ': 'Saved to slot ', 'Slot ': 'Slot ', 'Berpindah ke map #': 'Moved to map #',
    ' dihapus': ' deleted', ' dimuat': ' loaded', ' entri disimpan permanen': ' entries saved permanently'
  };
  var EN_PREFIX = Object.keys(EN).filter(function (k) { return /[:#] $|#$| $/.test(k) && k.length > 3; });
  function T(s) {
    if (LANG !== 'en' || typeof s !== 'string') return s;
    if (EN[s] !== undefined) return EN[s];
    for (var i = 0; i < EN_PREFIX.length; i++) {
      var k = EN_PREFIX[i];
      if (s.indexOf(k) === 0 && EN[k] !== k) return EN[k] + s.slice(k.length);
    }
    return s;
  }

  function el(tag, id, cls, html) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = T(html);
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
    toastEl.textContent = T(msg);
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
    hookAudio();
    installStorage();
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

  /* ---------- kursor seperti mouse ---------- */
  // Seluruh layar jadi touchpad: satu jari menggeser kursor di mana saja.
  // Jari lain yang menyentuh bagian kiri layar = klik kiri, bagian kanan layar = klik kanan.

  var cur = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  var heldMask = 0;
  var cursorLayer = el('div', 'arp-cursor-layer');
  root.appendChild(cursorLayer);
  var cursorEl = el('div', 'arp-cursor', null,
    '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 2l16 9-7 2 4 8-3 1.5-4-8-5 5z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  root.appendChild(cursorEl);

  function gameTarget() {
    return document.getElementById('GameCanvas') || document.getElementById('gameCanvas') || document.querySelector('canvas') || document;
  }
  function sendMouse(type, button) {
    var bit = button === 2 ? 2 : 1;
    if (type === 'mousedown') heldMask |= bit;
    var ev;
    try {
      ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cur.x, clientY: cur.y,
        screenX: cur.x, screenY: cur.y, button: button, buttons: heldMask, detail: 1 });
    } catch (e) { return; }
    gameTarget().dispatchEvent(ev);
    if (type === 'mouseup') heldMask &= ~bit;
  }
  function moveCursorTo(x, y) {
    cur.x = Math.max(0, Math.min(window.innerWidth - 1, x));
    cur.y = Math.max(0, Math.min(window.innerHeight - 1, y));
    cursorEl.style.left = cur.x + 'px';
    cursorEl.style.top = cur.y + 'px';
    sendMouse('mousemove', 0);
  }
  function clickAt(button) {
    sendMouse('mousedown', button);
    setTimeout(function () { sendMouse('mouseup', button); if (button === 0) sendMouse('click', 0); }, 60);
  }
  cursorEl.style.left = cur.x + 'px';
  cursorEl.style.top = cur.y + 'px';

  var movePid = null, mlx = 0, mly = 0, mt0 = 0, mmoved = 0, extraBtn = {};
  cursorLayer.addEventListener('pointerdown', function (e) {
    if (!prefs.cursor || editing) return;
    try { cursorLayer.setPointerCapture(e.pointerId); } catch (x) {}
    if (movePid === null) {
      movePid = e.pointerId; mlx = e.clientX; mly = e.clientY; mt0 = Date.now(); mmoved = 0;
    } else {
      var btn = e.clientX < window.innerWidth / 2 ? 0 : 2;   // sisi kiri layar = klik kiri, sisi kanan = klik kanan
      extraBtn[e.pointerId] = btn;
      sendMouse('mousedown', btn);
    }
    e.preventDefault();
  });
  cursorLayer.addEventListener('pointermove', function (e) {
    if (e.pointerId !== movePid) return;
    var dx = e.clientX - mlx, dy = e.clientY - mly;
    mlx = e.clientX; mly = e.clientY;
    mmoved += Math.abs(dx) + Math.abs(dy);
    var sp = prefs.cursorSpeed || 1.6;
    moveCursorTo(cur.x + dx * sp, cur.y + dy * sp);
  });
  function cursorEnd(e) {
    if (e.pointerId === movePid) {
      movePid = null;
      if (Date.now() - mt0 < 220 && mmoved < 8) clickAt(0);   // ketuk cepat satu jari = klik kiri
    } else if (extraBtn[e.pointerId] !== undefined) {
      var b = extraBtn[e.pointerId];
      delete extraBtn[e.pointerId];
      sendMouse('mouseup', b);
      if (b === 0) sendMouse('click', 0);
    }
  }
  cursorLayer.addEventListener('pointerup', cursorEnd);
  cursorLayer.addEventListener('pointercancel', cursorEnd);
  cursorLayer.addEventListener('lostpointercapture', cursorEnd);
  function releaseCursor() {
    movePid = null;
    extraBtn = {};
    if (heldMask) { sendMouse('mouseup', 0); sendMouse('mouseup', 2); heldMask = 0; }
  }

  function loadLayout() {
    var raw = '';
    try { raw = N.getControls(); } catch (e) {}
    if (raw) {
      try {
        var l = JSON.parse(raw);
        if (Array.isArray(l)) {
          // kontrol kursor lama (kotak KURSOR, tombol Kiri dan Kanan) sudah diganti touchpad layar penuh
          l = l.filter(function (c) { return c.type !== 'cpad' && c.type !== 'click'; });
          if (l.length) return l;
        }
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
  function baseSize() { return Math.max(38, Math.min(96, window.innerHeight / 360 * 60 * (prefs.btnScale || 1))); }

  function place(c) {
    var n = nodes[c.id];
    if (!n) return;
    var u = baseSize() * c.s, w = u, h = u;
    if (c.type === 'stick') { w = h = u * 2.1; }
    else if (c.type === 'cpad') { w = u * 2.6; h = u * 1.8; }
    else if (c.type === 'click') { w = u * 1.5; h = u * 0.9; }
    n.style.width = w + 'px';
    n.style.height = h + 'px';
    n.style.left = (c.x * window.innerWidth - w / 2) + 'px';
    n.style.top = (c.y * window.innerHeight - h / 2) + 'px';
    var mn = Math.min(w, h);
    n.style.fontSize = (c.type === 'cpad' ? Math.max(10, mn * 0.16)
      : Math.max(11, mn * (String(c.label || '').length > 2 ? 0.3 : 0.38))) + 'px';
    if (n._thumb) {
      var ts = w * 0.42;
      n._thumb.style.width = ts + 'px';
      n._thumb.style.height = ts + 'px';
      n._thumb.style.left = ((w - ts) / 2 - 2) + 'px';
      n._thumb.style.top = ((h - ts) / 2 - 2) + 'px';
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
    applyCursorVis();
  }

  function applyCursorVis() {
    var on = !!prefs.cursor && !editing;
    cursorLayer.style.display = on ? 'block' : 'none';
    cursorEl.style.display = on ? 'block' : 'none';
    if (!on) releaseCursor();
  }

  function applyPadPrefs() {
    ctlLayer.style.display = (prefs.gamepad || editing) ? 'block' : 'none';
    ctlLayer.style.opacity = editing ? 1 : prefs.opacity;
    if (!prefs.gamepad) applyDir({});
    applyCursorVis();
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

  var fpsEl = el('div', 'arp-fps');
  root.appendChild(fpsEl);
  (function () {
    if (!prefs.fps) return;
    fpsEl.style.display = 'block';
    var frames = 0, last = performance.now();
    function loop(t) {
      frames++;
      if (t - last >= 500) {
        var f = Math.round(frames * 1000 / (t - last));
        fpsEl.textContent = f + ' FPS';
        fpsEl.style.color = f >= 50 ? '#7ee787' : (f >= 30 ? '#ffd54f' : '#ff6b6b');
        frames = 0; last = t;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();

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
    var b = el('button', null, 'arp-row', '<span>' + T(label) + '</span>' + (tag ? '<span class="arp-tag' + (red ? ' red' : '') + '">' + tag + '</span>' : ''));
    b.addEventListener('click', fn);
    return b;
  }

  function renderPanel() {
    panel.innerHTML = '';
    panel.appendChild(el('div', null, 'arp-title', esc((prefs.title || 'GAME').toUpperCase())));
    panel.appendChild(row('Atur posisi dan ukuran tombol', '', enterEdit));
    if (prefs.cheat !== false) {
      panel.appendChild(row('Cheat (mirip MTools)', '', function () { panel.style.display = 'none'; openCheat(); }));
    }
    panel.appendChild(row('Keluar ke launcher', '', function () { N.exitGame(); }));
  }

  menuBtn.addEventListener('click', function () {
    if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
    renderPanel();
    panel.style.display = 'block';
  });

  /* ---------- cheat (mirip MTools) ---------- */

  (function () {
    var c = [
      '.ch-box{display:flex;flex-direction:column;overflow:hidden;width:min(760px,96vw);height:min(94vh,540px);padding:10px}',
      '.ch-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}.ch-head b{color:#8fd0f7;font-size:15px}',
      '.ch-sub{color:#8aa0b4;font-size:11px}.ch-head .ch-close{margin-left:auto}',
      '.ch-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;touch-action:pan-x}',
      '.ch-tab{flex:0 0 auto;padding:7px 12px;border-radius:8px;border:0;background:#222a36;color:#c9d6e2;font-size:13px}',
      '.ch-tab.on{background:#5bb8f0;color:#06222f;font-weight:700}',
      '.ch-body{flex:1;overflow-y:auto;touch-action:pan-y;padding-right:2px}',
      '.ch-sec{color:#8aa0b4;font-size:11px;letter-spacing:.5px;margin:12px 2px 6px}',
      '.ch-row{display:flex;justify-content:space-between;align-items:center;width:100%;margin:0 0 6px;padding:10px 12px;border:0;border-radius:9px;background:#222a36;color:#e8eef5;font-size:13px;text-align:left}',
      '.ch-tag{font-size:11px;color:#8aa0b4;font-weight:700}.ch-tag.on{color:#7ee787}',
      '.ch-btn{padding:7px 10px;border-radius:7px;border:0;background:#2a3442;color:#fff;font-size:12px;margin:2px}',
      '.ch-btn.on{background:#2e7d32}',
      '.ch-field{display:flex;align-items:center;gap:6px;margin:5px 0;flex-wrap:wrap}',
      '.ch-fl{min-width:56px;font-size:12px;color:#c9d6e2}',
      '.ch-in{width:110px;background:#0e1218;color:#fff;border:1px solid #2c3644;border-radius:7px;padding:7px;font-size:13px}',
      '.ch-search{width:100%;background:#0e1218;color:#fff;border:1px solid #2c3644;border-radius:8px;padding:8px;font-size:13px;margin-bottom:6px}',
      '.ch-bar{display:flex;align-items:center;gap:6px;margin-bottom:6px}.ch-bar .ch-search{margin:0;flex:1}',
      '.ch-item{background:#1b222d;border-radius:9px;padding:8px 10px;margin-bottom:6px}',
      '.ch-name{font-size:13px;margin-bottom:4px}.ch-id{color:#8aa0b4;font-size:11px}',
      '.ch-acts{display:flex;align-items:center;flex-wrap:wrap;gap:2px}.ch-cnt{color:#ffd54f;font-size:12px;min-width:54px}'
    ].join('');
    // awalan kelas supaya menang atas aturan umum .arp-modal button / input
    c = c.replace(/(^|\})(\.ch-(?!box))/g, '$1.arp-modal .ch-box $2');
    var s2 = document.createElement('style');
    s2.textContent = c;
    document.head.appendChild(s2);
  })();


  var cheat = { god: false, oneHit: false, noclip: false, noEncounter: false, noCost: false, keepItems: false,
    bigStack: false, walkBonus: 0, gameSpeed: 1, expMul: 1, goldMul: 1,
    doubleAction: false, alwaysCrit: false, alwaysHit: false, infStats: false, dropMul: 1 };
  (function () {
    if (prefs.cheat === false) return;
    try {
      var cs = JSON.parse(N.getCheats() || '{}');
      Object.keys(cs).forEach(function (k) { if (k in cheat) cheat[k] = cs[k]; });
    } catch (e) {}
  })();
  function saveCheat() { try { N.setCheats(JSON.stringify(cheat)); } catch (e) {} }

  function wrapM(proto, name, fn) {
    var o = proto[name];
    if (typeof o !== 'function') return;
    proto[name] = function () { return fn.call(this, o, Array.prototype.slice.call(arguments)); };
  }

  function hookCheats() {
    if (prefs.cheat === false) return true;   // cheat dimatikan di Pengaturan, tidak ada yang dipasang
    if (!window.Game_Action || !window.Game_Player || !window.Game_Party || !window.Game_Troop ||
        !window.Game_Battler || !window.Game_BattlerBase || !window.SceneManager) return false;
    if (Game_Player.prototype.__arpCheat) return true;
    Game_Player.prototype.__arpCheat = true;

    // kebal: HP anggota party tidak berkurang (serangan, racun, lantai damage)
    wrapM(Game_Battler.prototype, 'gainHp', function (o, a) {
      if (cheat.god && a[0] < 0 && this.isActor && this.isActor()) return;
      return o.apply(this, a);
    });
    // sekali pukul: damage ke musuh dibuat sangat besar
    wrapM(Game_Action.prototype, 'executeDamage', function (o, a) {
      if (cheat.oneHit && a[1] > 0 && a[0] && a[0].isEnemy && a[0].isEnemy()) a[1] = 99999999;
      return o.apply(this, a);
    });
    // tembus tembok
    wrapM(Game_Player.prototype, 'canPass', function (o, a) {
      if (cheat.noclip && window.$gameMap) {
        var x2 = $gameMap.roundXWithDirection(a[0], a[2]), y2 = $gameMap.roundYWithDirection(a[1], a[2]);
        if ($gameMap.isValid(x2, y2)) return true;
      }
      return o.apply(this, a);
    });
    wrapM(Game_Player.prototype, 'realMoveSpeed', function (o, a) { return o.apply(this, a) + cheat.walkBonus; });
    wrapM(Game_Player.prototype, 'canEncounter', function (o, a) { return cheat.noEncounter ? false : o.apply(this, a); });
    wrapM(Game_BattlerBase.prototype, 'paySkillCost', function (o, a) {
      if (cheat.noCost && this.isActor && this.isActor()) return;
      return o.apply(this, a);
    });
    wrapM(Game_Party.prototype, 'consumeItem', function (o, a) { if (cheat.keepItems) return; return o.apply(this, a); });
    wrapM(Game_Party.prototype, 'maxItems', function (o, a) { return cheat.bigStack ? 9999 : o.apply(this, a); });
    wrapM(Game_Troop.prototype, 'expTotal', function (o, a) { return Math.floor(o.apply(this, a) * cheat.expMul); });
    wrapM(Game_Troop.prototype, 'goldTotal', function (o, a) { return Math.floor(o.apply(this, a) * cheat.goldMul); });
    // aksi dua kali per giliran untuk anggota party
    wrapM(Game_Battler.prototype, 'makeActionTimes', function (o, a) {
      var n = o.apply(this, a);
      return (cheat.doubleAction && this.isActor && this.isActor()) ? n + 1 : n;
    });
    // serangan party selalu critical dan selalu kena
    wrapM(Game_Action.prototype, 'itemCri', function (o, a) {
      if (cheat.alwaysCrit && this.subject() && this.subject().isActor()) return 1;
      return o.apply(this, a);
    });
    wrapM(Game_Action.prototype, 'itemHit', function (o, a) {
      if (cheat.alwaysHit && this.subject() && this.subject().isActor()) return 1;
      return o.apply(this, a);
    });
    wrapM(Game_Action.prototype, 'itemEva', function (o, a) {
      if (cheat.alwaysHit && this.subject() && this.subject().isActor()) return 0;
      return o.apply(this, a);
    });
    // HP, MP, TP party penuh lagi di akhir tiap giliran
    wrapM(Game_Battler.prototype, 'onTurnEnd', function (o, a) {
      var r = o.apply(this, a);
      if (cheat.infStats && this.isActor && this.isActor()) {
        this.setHp(this.mhp); this.setMp(this.mmp); this.setTp(this.maxTp ? this.maxTp() : 100);
      }
      return r;
    });
    // peluang drop item
    if (window.Game_Enemy) {
      wrapM(Game_Enemy.prototype, 'dropItemRate', function (o, a) { return o.apply(this, a) * cheat.dropMul; });
    }
    // kecepatan game: update scene diulang beberapa kali per frame
    var ou = SceneManager.updateScene;
    if (typeof ou === 'function') {
      SceneManager.updateScene = function () {
        ou.call(this);
        for (var i = 1; i < (cheat.gameSpeed | 0); i++) ou.call(this);
      };
    }
    return true;
  }
  var cheatTries = 0;
  var cheatTimer = setInterval(function () {
    cheatTries++;
    if (hookCheats() || cheatTries > 120) clearInterval(cheatTimer);
  }, 700);

  /* ---- tampilan ---- */

  var chModal = el('div', 'arp-cheat', 'arp-modal arp-hit');
  var chBox = el('div', null, 'box ch-box');
  chModal.appendChild(chBox);
  root.appendChild(chModal);
  guardKeys(chModal);

  var CH_TABS = [['Umum', 'general'], ['Item', 'items'], ['Senjata', 'weapons'], ['Armor', 'armors'],
    ['Switch', 'switches'], ['Variabel', 'vars'], ['Aktor', 'actors'], ['Teleport', 'tp'],
    ['Data', 'data'], ['Event', 'event'], ['Save', 'save'], ['Konsol', 'console']];
  var chTab = 'general', chActor = 0, chShowAll = false;

  function gameReady() {
    return !!(window.$gameParty && window.$gameSwitches && window.$gameVariables && window.$gameActors && window.$dataSystem);
  }
  function openCheat() {
    if (!gameReady()) { toast('Mulai game baru atau muat save dulu, baru cheat bisa dipakai'); return; }
    renderCheat();
    chModal.style.display = 'flex';
  }
  function mkBtn(text, fn, cls) {
    var b = el('button', null, 'ch-btn' + (cls ? ' ' + cls : ''), text);
    b.addEventListener('click', fn);
    return b;
  }
  function numBox(v) {
    var i = document.createElement('input');
    i.type = 'text';
    i.setAttribute('inputmode', 'numeric');
    i.className = 'ch-in';
    i.value = String(v);
    return i;
  }

  function renderCheat() {
    chBox.innerHTML = '';
    var head = el('div', null, 'ch-head', '<b>Cheat</b> <span class="ch-sub">mirip MTools, hanya untuk game yang sedang berjalan</span>');
    head.appendChild(mkBtn('Tutup', function () { chModal.style.display = 'none'; }, 'ch-close'));
    var tabs = el('div', null, 'ch-tabs');
    CH_TABS.forEach(function (t) {
      var b = el('button', null, 'ch-tab' + (chTab === t[1] ? ' on' : ''), t[0]);
      b.addEventListener('click', function () { chTab = t[1]; renderCheat(); });
      tabs.appendChild(b);
    });
    var body = el('div', null, 'ch-body');
    chBox.appendChild(head);
    chBox.appendChild(tabs);
    chBox.appendChild(body);
    try {
      ({ general: tabGeneral, items: tabItems, weapons: tabWeapons, armors: tabArmors,
        switches: tabSwitches, vars: tabVars, actors: tabActors, tp: tabTeleport,
        data: tabData, event: tabEvents, save: tabSave, console: tabConsole })[chTab](body);
    } catch (e) {
      nlog('E', 'Cheat: ' + (e && e.stack || e));
      body.appendChild(el('div', null, 'ch-sub', 'Tab ini gagal dibuka: ' + esc(e && e.message || e)));
    }
  }

  function section(body, title) { body.appendChild(el('div', null, 'ch-sec', title)); }

  function toggleRow(body, label, key) {
    var b = el('button', null, 'ch-row', '<span>' + T(label) + '</span><span class="ch-tag' + (cheat[key] ? ' on' : '') + '">' + (cheat[key] ? 'ON' : 'OFF') + '</span>');
    b.addEventListener('click', function () { cheat[key] = !cheat[key]; saveCheat(); renderCheat(); });
    body.appendChild(b);
  }
  function cycleRow(body, label, key, values, fmt) {
    var cur = fmt ? fmt(cheat[key]) : cheat[key];
    var b = el('button', null, 'ch-row', '<span>' + T(label) + '</span><span class="ch-tag on">' + cur + '</span>');
    b.addEventListener('click', function () {
      var i = values.indexOf(cheat[key]);
      cheat[key] = values[(i + 1) % values.length];
      saveCheat();
      renderCheat();
    });
    body.appendChild(b);
  }

  function tabGeneral(body) {
    section(body, 'GOLD');
    var gold = numBox($gameParty.gold());
    var gr = el('div', null, 'ch-field');
    gr.appendChild(el('span', null, 'ch-fl', 'Gold'));
    gr.appendChild(gold);
    gr.appendChild(mkBtn('Set', function () { var v = Math.floor(Number(gold.value)); if (!isNaN(v)) { $gameParty.gainGold(v - $gameParty.gold()); gold.value = $gameParty.gold(); } }));
    gr.appendChild(mkBtn('Tambah', function () { var v = Math.floor(Number(gold.value)); if (!isNaN(v)) { $gameParty.gainGold(v); gold.value = $gameParty.gold(); } }));
    gr.appendChild(mkBtn('Max', function () { $gameParty.gainGold(99999999); gold.value = $gameParty.gold(); }));
    body.appendChild(gr);

    section(body, 'PARTY');
    var pr = el('div', null, 'ch-acts');
    pr.appendChild(mkBtn('Pulihkan semua anggota', function () { $gameParty.members().forEach(function (m) { m.recoverAll(); }); toast('Party pulih penuh'); }));
    pr.appendChild(mkBtn('Isi TP penuh', function () { $gameParty.members().forEach(function (m) { m.setTp(m.maxTp ? m.maxTp() : 100); }); toast('TP penuh'); }));
    pr.appendChild(mkBtn('Level maksimal semua', function () {
      $gameParty.members().forEach(function (m) { m.changeLevel(m.maxLevel(), false); });
      toast('Semua anggota level maksimal');
    }));
    pr.appendChild(mkBtn('Stat besar semua (9999)', function () {
      $gameParty.members().forEach(function (m) {
        for (var i = 0; i < 8; i++) m.addParam(i, (i < 2 ? 99999 : 9999) - m.param(i));
        m.recoverAll();
      });
      toast('Stat semua anggota dinaikkan');
    }));
    pr.appendChild(mkBtn('Izinkan save dan menu', function () {
      if ($gameSystem.enableSave) $gameSystem.enableSave();
      if ($gameSystem.enableMenu) $gameSystem.enableMenu();
      toast('Save dan menu diizinkan');
    }));
    body.appendChild(pr);

    var stepsRow = el('div', null, 'ch-field');
    stepsRow.appendChild(el('span', null, 'ch-fl', 'Langkah'));
    var stepsIn = numBox($gameParty.steps ? $gameParty.steps() : 0);
    stepsRow.appendChild(stepsIn);
    stepsRow.appendChild(mkBtn('Set', function () {
      var v = Math.floor(Number(stepsIn.value));
      if (!isNaN(v) && v >= 0) { $gameParty._steps = v; toast('Jumlah langkah diubah'); }
    }));
    body.appendChild(stepsRow);

    section(body, 'BATTLE');
    var br = el('div', null, 'ch-acts');
    br.appendChild(mkBtn('Bunuh semua musuh', function () {
      if (!$gameParty.inBattle()) { toast('Hanya bisa saat sedang battle'); return; }
      $gameTroop.members().forEach(function (e) { e.setHp(0); });
      toast('Semua musuh dikalahkan');
    }));
    br.appendChild(mkBtn('Kabur dari battle', function () {
      if (!$gameParty.inBattle()) { toast('Hanya bisa saat sedang battle'); return; }
      chModal.style.display = 'none';
      BattleManager.processAbort();
    }));
    body.appendChild(br);

    section(body, 'CHEAT AKTIF');
    toggleRow(body, 'Kebal (HP party tidak berkurang)', 'god');
    toggleRow(body, 'Sekali pukul (musuh langsung mati)', 'oneHit');
    toggleRow(body, 'Tembus tembok', 'noclip');
    toggleRow(body, 'Tanpa pertemuan musuh', 'noEncounter');
    toggleRow(body, 'Skill tanpa biaya MP/TP', 'noCost');
    toggleRow(body, 'Item tidak berkurang saat dipakai', 'keepItems');
    toggleRow(body, 'Batas item 9999', 'bigStack');
    toggleRow(body, 'Aksi dua kali per giliran', 'doubleAction');
    toggleRow(body, 'Serangan selalu critical', 'alwaysCrit');
    toggleRow(body, 'Serangan selalu kena (tidak meleset)', 'alwaysHit');
    toggleRow(body, 'HP, MP, TP penuh tiap giliran', 'infStats');
    cycleRow(body, 'Kecepatan jalan', 'walkBonus', [0, 1, 2, 3], function (v) { return v === 0 ? 'Normal' : '+' + v; });
    cycleRow(body, 'Kecepatan game', 'gameSpeed', [1, 2, 3, 5], function (v) { return v + 'x'; });
    cycleRow(body, 'Pengali EXP', 'expMul', [1, 2, 5, 10, 50], function (v) { return v + 'x'; });
    cycleRow(body, 'Pengali Gold dari musuh', 'goldMul', [1, 2, 5, 10, 50], function (v) { return v + 'x'; });
    cycleRow(body, 'Peluang drop item musuh', 'dropMul', [1, 2, 5, 100], function (v) { return v >= 100 ? 'Selalu drop' : v + 'x'; });
  }

  // daftar dengan pencarian dan halaman
  function listTab(body, entries, makeRow) {
    var q = '', page = 0, per = 30;
    var bar = el('div', null, 'ch-bar');
    var inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'ch-search'; inp.placeholder = T('Cari nama atau ID');
    bar.appendChild(inp);
    var prev = mkBtn('<', function () { if (page > 0) { page--; draw(); } });
    var next = mkBtn('>', function () { page++; draw(); });
    var info = el('span', null, 'ch-sub');
    [prev, info, next].forEach(function (n) { bar.appendChild(n); });
    var list = el('div', null, 'ch-list');
    function filtered() {
      var s = q.toLowerCase();
      return entries.filter(function (e) { return !s || String(e.id) === s || String(e.name || '').toLowerCase().indexOf(s) >= 0; });
    }
    function draw() {
      var f = filtered();
      var pages = Math.max(1, Math.ceil(f.length / per));
      if (page >= pages) page = pages - 1;
      list.innerHTML = '';
      f.slice(page * per, page * per + per).forEach(function (e) { list.appendChild(makeRow(e)); });
      info.textContent = (page + 1) + '/' + pages + ' (' + f.length + ')';
    }
    inp.addEventListener('input', function () { q = inp.value.trim(); page = 0; draw(); });
    body.appendChild(bar);
    body.appendChild(list);
    draw();
  }

  function validData(arr) {
    var out = [];
    (arr || []).forEach(function (d) { if (d && d.name) out.push(d); });
    return out;
  }

  function itemRow(item) {
    var r = el('div', null, 'ch-item');
    var tag = item.itypeId === 2 ? ' <span class="ch-tag">KEY</span>' : '';
    r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + item.id + '</span> ' + esc(item.name) + tag));
    var cnt = el('span', null, 'ch-cnt');
    function upd() { cnt.textContent = '\u00d7 ' + $gameParty.numItems(item); }
    var acts = el('div', null, 'ch-acts');
    acts.appendChild(cnt);
    [['-1', -1], ['+1', 1], ['+10', 10], ['+99', 99]].forEach(function (p) {
      acts.appendChild(mkBtn(p[0], function () { $gameParty.gainItem(item, p[1], false); upd(); }));
    });
    acts.appendChild(mkBtn('Max', function () { $gameParty.gainItem(item, $gameParty.maxItems(item) - $gameParty.numItems(item), false); upd(); }));
    acts.appendChild(mkBtn('0', function () { $gameParty.gainItem(item, -$gameParty.numItems(item), false); upd(); }));
    r.appendChild(acts);
    upd();
    return r;
  }
  function bulkTab(body, arr) {
    var r = el('div', null, 'ch-acts');
    r.appendChild(mkBtn('Beri semua \u00d799', function () {
      arr.forEach(function (i) { $gameParty.gainItem(i, 99 - $gameParty.numItems(i), false); });
      toast('Semua diisi 99');
      renderCheat();
    }, 'on'));
    r.appendChild(mkBtn('Kosongkan semua', function () {
      arr.forEach(function (i) { $gameParty.gainItem(i, -$gameParty.numItems(i), false); });
      toast('Semua dikosongkan');
      renderCheat();
    }, 'del'));
    body.appendChild(r);
    listTab(body, arr, itemRow);
  }
  function tabItems(body) { bulkTab(body, validData(window.$dataItems)); }
  function tabWeapons(body) { bulkTab(body, validData(window.$dataWeapons)); }
  function tabArmors(body) { bulkTab(body, validData(window.$dataArmors)); }

  function allCheck(body) {
    var r = el('div', null, 'ch-acts');
    var b = mkBtn(chShowAll ? 'Tampilkan semua (termasuk tanpa nama): ON' : 'Hanya yang punya nama', function () { chShowAll = !chShowAll; renderCheat(); });
    r.appendChild(b);
    body.appendChild(r);
  }

  function tabSwitches(body) {
    allCheck(body);
    var names = $dataSystem.switches || [];
    var entries = [];
    for (var i = 1; i < names.length; i++) if (chShowAll || names[i]) entries.push({ id: i, name: names[i] || '' });
    listTab(body, entries, function (e) {
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + e.id + '</span> ' + esc(e.name || '(tanpa nama)')));
      var b = el('button', null, 'ch-btn', '');
      function upd() { var v = $gameSwitches.value(e.id); b.textContent = v ? 'ON' : 'OFF'; b.className = 'ch-btn' + (v ? ' on' : ''); }
      b.addEventListener('click', function () { $gameSwitches.setValue(e.id, !$gameSwitches.value(e.id)); upd(); });
      upd();
      r.appendChild(b);
      return r;
    });
  }

  function tabVars(body) {
    allCheck(body);
    var names = $dataSystem.variables || [];
    var entries = [];
    for (var i = 1; i < names.length; i++) if (chShowAll || names[i]) entries.push({ id: i, name: names[i] || '' });
    listTab(body, entries, function (e) {
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + e.id + '</span> ' + esc(e.name || '(tanpa nama)')));
      var acts = el('div', null, 'ch-acts');
      var inp = numBox($gameVariables.value(e.id));
      function setFrom(text) {
        var s = String(text).trim(), n = Number(s);
        $gameVariables.setValue(e.id, (s !== '' && !isNaN(n)) ? n : s);
        inp.value = $gameVariables.value(e.id);
      }
      acts.appendChild(inp);
      acts.appendChild(mkBtn('Set', function () { setFrom(inp.value); }));
      acts.appendChild(mkBtn('-1', function () { setFrom((Number($gameVariables.value(e.id)) || 0) - 1); }));
      acts.appendChild(mkBtn('+1', function () { setFrom((Number($gameVariables.value(e.id)) || 0) + 1); }));
      acts.appendChild(mkBtn('+100', function () { setFrom((Number($gameVariables.value(e.id)) || 0) + 100); }));
      r.appendChild(acts);
      return r;
    });
  }

  function tabActors(body) {
    var inParty = {};
    $gameParty.allMembers().forEach(function (m) { inParty[m.actorId()] = true; });
    var actors = validData(window.$dataActors).sort(function (a, b) {
      return (inParty[b.id] ? 1 : 0) - (inParty[a.id] ? 1 : 0) || a.id - b.id;
    });
    if (!actors.length) { body.appendChild(el('div', null, 'ch-sub', 'Tidak ada data aktor.')); return; }
    if (!chActor || !actors.some(function (a) { return a.id === chActor; })) chActor = actors[0].id;

    var sel = document.createElement('select');
    sel.className = 'ch-search';
    actors.forEach(function (a) {
      var o = document.createElement('option');
      o.value = String(a.id);
      o.textContent = (inParty[a.id] ? '\u2605 ' : '') + a.name + ' (#' + a.id + ')';
      sel.appendChild(o);
    });
    sel.value = String(chActor);
    sel.addEventListener('change', function () { chActor = parseInt(sel.value, 10); renderCheat(); });
    body.appendChild(sel);

    var actor = $gameActors.actor(chActor);
    if (!actor) { body.appendChild(el('div', null, 'ch-sub', 'Aktor tidak tersedia.')); return; }

    function field(label, get, set) {
      var r = el('div', null, 'ch-field');
      r.appendChild(el('span', null, 'ch-fl', label));
      var inp = numBox(get());
      r.appendChild(inp);
      r.appendChild(mkBtn('Set', function () {
        var v = Math.floor(Number(inp.value));
        if (isNaN(v)) return;
        set(v);
        inp.value = get();
      }));
      body.appendChild(r);
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    section(body, actor.name().toUpperCase());
    var q = el('div', null, 'ch-acts');
    q.appendChild(mkBtn('Pulihkan penuh', function () { actor.recoverAll(); renderCheat(); }));
    q.appendChild(mkBtn('Level maksimal', function () { actor.changeLevel(actor.maxLevel(), false); renderCheat(); }));
    q.appendChild(mkBtn(inParty[chActor] ? 'Keluarkan dari party' : 'Masukkan ke party', function () {
      if (inParty[chActor]) $gameParty.removeActor(chActor); else $gameParty.addActor(chActor);
      renderCheat();
    }));
    body.appendChild(q);

    field('Level', function () { return actor.level; }, function (v) { actor.changeLevel(clamp(v, 1, actor.maxLevel()), false); });
    field('EXP', function () { return actor.currentExp(); }, function (v) { actor.changeExp(Math.max(0, v), false); });
    field('HP', function () { return actor.hp; }, function (v) { actor.setHp(Math.max(0, v)); });
    field('MP', function () { return actor.mp; }, function (v) { actor.setMp(Math.max(0, v)); });
    field('TP', function () { return actor.tp; }, function (v) { actor.setTp(Math.max(0, v)); });
    ['MHP', 'MMP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'].forEach(function (n, i) {
      field(n, function () { return actor.param(i); }, function (v) { actor.addParam(i, v - actor.param(i)); });
    });

    section(body, 'NAMA DAN KELAS');
    var nameRow = el('div', null, 'ch-field');
    nameRow.appendChild(el('span', null, 'ch-fl', 'Nama'));
    var nameIn = document.createElement('input');
    nameIn.type = 'text'; nameIn.className = 'ch-in'; nameIn.style.width = '160px'; nameIn.value = actor.name();
    nameRow.appendChild(nameIn);
    nameRow.appendChild(mkBtn('Set', function () { actor.setName(nameIn.value); toast('Nama diubah'); renderCheat(); }));
    body.appendChild(nameRow);

    var classes = validData(window.$dataClasses);
    if (classes.length) {
      var csel = document.createElement('select');
      csel.className = 'ch-search';
      classes.forEach(function (c) {
        var o = document.createElement('option');
        o.value = String(c.id); o.textContent = '#' + c.id + ' ' + c.name;
        csel.appendChild(o);
      });
      try { csel.value = String(actor.currentClass().id); } catch (e) {}
      body.appendChild(csel);
      var cacts = el('div', null, 'ch-acts');
      cacts.appendChild(mkBtn('Ganti kelas (EXP dipertahankan)', function () {
        actor.changeClass(parseInt(csel.value, 10), true);
        toast('Kelas diganti');
        renderCheat();
      }));
      body.appendChild(cacts);
    }

    if (actor.equipSlots) {
      section(body, 'EQUIP');
      var eslots = actor.equipSlots(), equips = actor.equips();
      eslots.forEach(function (etype, idx) {
        var cands = etype === 1 ? validData(window.$dataWeapons)
          : validData(window.$dataArmors).filter(function (a) { return a.etypeId === etype; });
        var er = el('div', null, 'ch-field');
        er.appendChild(el('span', null, 'ch-fl', 'Slot ' + (idx + 1)));
        var esel = document.createElement('select');
        esel.className = 'ch-in'; esel.style.width = '210px';
        var none = document.createElement('option');
        none.value = '0'; none.textContent = '(kosong)';
        esel.appendChild(none);
        cands.forEach(function (c) {
          var o = document.createElement('option');
          o.value = String(c.id); o.textContent = '#' + c.id + ' ' + c.name;
          esel.appendChild(o);
        });
        esel.value = equips[idx] ? String(equips[idx].id) : '0';
        er.appendChild(esel);
        er.appendChild(mkBtn('Pasang', function () {
          var id = parseInt(esel.value, 10);
          var obj = id ? (etype === 1 ? $dataWeapons[id] : $dataArmors[id]) : null;
          actor.forceChangeEquip(idx, obj);
          toast('Equip diganti');
          renderCheat();
        }));
        body.appendChild(er);
      });
    }

    section(body, 'STATE');
    listTab(body, validData(window.$dataStates), function (st) {
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + st.id + '</span> ' + esc(st.name)));
      var b = el('button', null, 'ch-btn', '');
      function upd() { var v = actor.isStateAffected(st.id); b.textContent = v ? 'Aktif' : 'Tidak aktif'; b.className = 'ch-btn' + (v ? ' on' : ''); }
      b.addEventListener('click', function () {
        if (actor.isStateAffected(st.id)) actor.removeState(st.id); else actor.addState(st.id);
        upd();
      });
      upd();
      r.appendChild(b);
      return r;
    });

    section(body, 'SKILL');
    var sr = el('div', null, 'ch-acts');
    sr.appendChild(mkBtn('Pelajari semua skill', function () {
      validData(window.$dataSkills).forEach(function (s) { actor.learnSkill(s.id); });
      toast('Semua skill dipelajari');
      renderCheat();
    }));
    body.appendChild(sr);
    listTab(body, validData(window.$dataSkills), function (s) {
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + s.id + '</span> ' + esc(s.name)));
      var b = el('button', null, 'ch-btn', '');
      function upd() { var v = actor.isLearnedSkill(s.id); b.textContent = v ? 'Dipelajari' : 'Belum'; b.className = 'ch-btn' + (v ? ' on' : ''); }
      b.addEventListener('click', function () {
        if (actor.isLearnedSkill(s.id)) actor.forgetSkill(s.id); else actor.learnSkill(s.id);
        upd();
      });
      upd();
      r.appendChild(b);
      return r;
    });
  }

  function tabTeleport(body) {
    var maps = validData(window.$dataMapInfos);
    section(body, 'POSISI SEKARANG');
    body.appendChild(el('div', null, 'ch-sub', 'Map #' + $gameMap.mapId() + ', x ' + $gamePlayer.x + ', y ' + $gamePlayer.y));
    section(body, 'PINDAH KE');
    var sel = document.createElement('select');
    sel.className = 'ch-search';
    maps.forEach(function (m) {
      var o = document.createElement('option');
      o.value = String(m.id);
      o.textContent = '#' + m.id + ' ' + m.name;
      sel.appendChild(o);
    });
    sel.value = String($gameMap.mapId());
    body.appendChild(sel);
    var r = el('div', null, 'ch-field');
    var xi = numBox($gamePlayer.x), yi = numBox($gamePlayer.y);
    r.appendChild(el('span', null, 'ch-fl', 'X'));
    r.appendChild(xi);
    r.appendChild(el('span', null, 'ch-fl', 'Y'));
    r.appendChild(yi);
    body.appendChild(r);
    var go = el('div', null, 'ch-acts');
    go.appendChild(mkBtn('Pindah sekarang', function () {
      if ($gameParty.inBattle()) { toast('Tidak bisa pindah saat battle'); return; }
      var id = parseInt(sel.value, 10), x = Math.floor(Number(xi.value)), y = Math.floor(Number(yi.value));
      if (isNaN(id) || isNaN(x) || isNaN(y)) return;
      $gamePlayer.reserveTransfer(id, x, y, $gamePlayer.direction(), 0);
      chModal.style.display = 'none';
      toast('Berpindah ke map #' + id);
    }, 'on'));
    body.appendChild(go);
  }

  /* ---------- editor data, event, save, konsol ---------- */

  (function () {
    var c = [
      '.ch-btn.del{background:#c62828}',
      '.ch-log{font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;background:#0e1218;border-radius:8px;padding:8px;margin-top:8px;max-height:150px;overflow:auto;color:#9ad1a0}',
      '.ch-log .bad{color:#ff6b6b}',
      '.ch-note{color:#8aa0b4;font-size:11px;line-height:1.4;margin:4px 2px 8px}'
    ].join('');
    c = c.replace(/(^|\})(\.ch-)/g, '$1.arp-modal .ch-box $2');
    var s3 = document.createElement('style');
    s3.textContent = c;
    document.head.appendChild(s3);
  })();

  function note(body, text) { body.appendChild(el('div', null, 'ch-note', text)); }
  function fmtVal(r) {
    if (r === undefined) return 'undefined';
    if (r !== null && typeof r === 'object') { try { return JSON.stringify(r); } catch (e) { return String(r); } }
    return String(r);
  }

  /* ---- editor data game ---- */

  var DATA_SETS = [
    ['Item', '$dataItems', 'Items.json'], ['Senjata', '$dataWeapons', 'Weapons.json'], ['Armor', '$dataArmors', 'Armors.json'],
    ['Skill', '$dataSkills', 'Skills.json'], ['Musuh', '$dataEnemies', 'Enemies.json'], ['Kelas', '$dataClasses', 'Classes.json'],
    ['State', '$dataStates', 'States.json'], ['Aktor', '$dataActors', 'Actors.json']
  ];
  var LABELS = {
    name: 'Nama', description: 'Deskripsi', price: 'Harga', consumable: 'Habis setelah dipakai', scope: 'Sasaran',
    occasion: 'Kapan bisa dipakai', speed: 'Kecepatan', successRate: 'Peluang berhasil', repeats: 'Pengulangan',
    tpGain: 'TP didapat', 'damage.type': 'Tipe damage (0 tidak ada, 1 HP, 2 MP, 3 serap HP, 4 serap MP, 5 dan 6 pulih)',
    'damage.formula': 'Rumus damage', 'damage.variance': 'Variasi damage', 'damage.critical': 'Bisa critical',
    'damage.elementId': 'Elemen', params: 'Stat [MHP, MMP, ATK, DEF, MAT, MDF, AGI, LUK]', mpCost: 'Biaya MP', tpCost: 'Biaya TP',
    exp: 'EXP dari musuh', gold: 'Gold dari musuh', note: 'Catatan', wtypeId: 'Tipe senjata', atypeId: 'Tipe armor',
    etypeId: 'Tipe slot equip', itypeId: 'Tipe item (2 = key item)', initialLevel: 'Level awal', maxLevel: 'Level maksimal',
    nickname: 'Julukan', profile: 'Profil', effects: 'Efek (JSON)', traits: 'Sifat (JSON)', dropItems: 'Drop item (JSON)',
    actions: 'Aksi musuh (JSON)', learnings: 'Skill per level (JSON)', expParams: 'Parameter EXP'
  };
  var chDataSet = 0, chDataEdit = null, dataPending = {};

  function labelOf(path) { return LABELS[path] ? LABELS[path] + ' [' + path + ']' : path; }
  function getPath(o, p) {
    var s = p.split('.'), c = o;
    for (var i = 0; i < s.length; i++) { if (c == null) return undefined; c = c[s[i]]; }
    return c;
  }
  function setPathJS(o, p, v) {
    var s = p.split('.'), c = o;
    for (var i = 0; i < s.length - 1; i++) {
      if (c[s[i]] == null || typeof c[s[i]] !== 'object') c[s[i]] = {};
      c = c[s[i]];
    }
    c[s[s.length - 1]] = v;
  }
  function flatten(obj, prefix, out) {
    Object.keys(obj).forEach(function (k) {
      if (!prefix && k === 'id') return;
      var v = obj[k], p = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out); else out.push(p);
    });
    return out;
  }
  function isPrimArray(v) {
    return Array.isArray(v) && v.every(function (x) { return typeof x === 'number' || typeof x === 'string'; });
  }

  function savePending(key) {
    var p = dataPending[key];
    if (!p || !Object.keys(p.changes).length) return 0;
    var ok = false;
    try { ok = N.savePatch(JSON.stringify({ kind: 'fields', file: p.file, id: p.id, changes: p.changes })); } catch (e) {}
    if (ok) delete dataPending[key];
    return ok ? 1 : -1;
  }
  function saveAllPending() {
    var keys = Object.keys(dataPending), saved = 0, fail = 0;
    keys.forEach(function (k) { var r = savePending(k); if (r === 1) saved++; else if (r === -1) fail++; });
    if (!keys.length) toast('Belum ada perubahan data untuk disimpan');
    else toast(fail ? 'Gagal menyimpan ' + fail + ' entri' : saved + ' entri disimpan permanen');
  }

  function tabData(body) {
    if (chDataEdit) { renderDataEditor(body); return; }
    var sel = document.createElement('select');
    sel.className = 'ch-search';
    DATA_SETS.forEach(function (d, i) {
      var o = document.createElement('option');
      o.value = String(i); o.textContent = d[0];
      sel.appendChild(o);
    });
    sel.value = String(chDataSet);
    sel.addEventListener('change', function () { chDataSet = parseInt(sel.value, 10); renderCheat(); });
    body.appendChild(sel);

    note(body, 'Pilih entri lalu ubah isinya. Perubahan langsung berlaku di game yang sedang jalan. ' +
      'Tekan Simpan permanen supaya tetap ada setelah game ditutup (file asli dicadangkan).');
    var acts = el('div', null, 'ch-acts');
    acts.appendChild(mkBtn('Simpan semua permanen', saveAllPending, 'on'));
    acts.appendChild(mkBtn('Hapus semua perubahan permanen', function () {
      var n = -1;
      try { n = N.resetPatches(); } catch (e) {}
      dataPending = {};
      toast(n < 0 ? 'Gagal mengembalikan data' : 'Data dikembalikan ke asli. Mulai ulang game agar berlaku. Terapkan ulang terjemahan dari Studio bila perlu.');
    }, 'del'));
    body.appendChild(acts);

    var set = DATA_SETS[chDataSet];
    var arr = window[set[1]];
    if (!arr) { note(body, 'Data ' + set[0] + ' belum dimuat.'); return; }
    listTab(body, validData(arr), function (e) {
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + e.id + '</span> ' + esc(e.name)));
      var a = el('div', null, 'ch-acts');
      a.appendChild(mkBtn('Edit', function () { chDataEdit = { set: chDataSet, id: e.id }; renderCheat(); }, 'on'));
      r.appendChild(a);
      return r;
    });
  }

  function renderDataEditor(body) {
    var set = DATA_SETS[chDataEdit.set];
    var entry = (window[set[1]] || [])[chDataEdit.id];
    body.appendChild(mkBtn('< Kembali ke daftar', function () { chDataEdit = null; renderCheat(); }));
    if (!entry) { note(body, 'Entri tidak ditemukan.'); return; }
    var key = set[2] + '#' + entry.id;
    section(body, set[0].toUpperCase() + ' #' + entry.id + '  ' + esc(entry.name || ''));
    var acts = el('div', null, 'ch-acts');
    acts.appendChild(mkBtn('Simpan permanen entri ini', function () {
      var r = savePending(key);
      toast(r === 1 ? 'Tersimpan permanen' : (r === -1 ? 'Gagal menyimpan' : 'Belum ada perubahan'));
    }, 'on'));
    body.appendChild(acts);
    flatten(entry, '', []).forEach(function (path) { body.appendChild(dataField(entry, set, path, key)); });
  }

  function dataField(entry, set, path, key) {
    var v = getPath(entry, path);
    var r = el('div', null, 'ch-item');
    r.appendChild(el('div', null, 'ch-name', esc(labelOf(path))));
    var acts = el('div', null, 'ch-acts');

    function commit(nv) {
      setPathJS(entry, path, nv);
      if (!dataPending[key]) dataPending[key] = { file: set[2], id: entry.id, changes: {} };
      dataPending[key].changes[path] = nv;
      toast('Diubah, langsung berlaku di game');
    }

    if (typeof v === 'boolean') {
      var b = mkBtn(v ? 'ON' : 'OFF', function () {
        var nv = !getPath(entry, path);
        commit(nv);
        b.textContent = nv ? 'ON' : 'OFF';
        b.className = 'ch-btn' + (nv ? ' on' : '');
      }, v ? 'on' : '');
      acts.appendChild(b);
    } else if (typeof v === 'number') {
      var ni = numBox(v);
      acts.appendChild(ni);
      acts.appendChild(mkBtn('Set', function () {
        var n = Number(ni.value);
        if (ni.value.trim() === '' || isNaN(n)) { toast('Isi dengan angka'); return; }
        commit(n);
      }));
    } else if (isPrimArray(v)) {
      var ai = document.createElement('input');
      ai.type = 'text'; ai.className = 'ch-search'; ai.value = v.join(', ');
      var allNum = v.every(function (x) { return typeof x === 'number'; });
      acts.appendChild(ai);
      acts.appendChild(mkBtn('Set', function () {
        var parts = ai.value.split(',').map(function (x) { return x.trim(); });
        var out = parts.map(function (x) { return allNum ? Number(x) : x; });
        if (allNum && out.some(function (x) { return isNaN(x); })) { toast('Semua isi harus angka, pisahkan dengan koma'); return; }
        commit(out);
      }));
    } else {
      var ta = document.createElement('textarea');
      ta.className = 'ch-search';
      ta.rows = (typeof v === 'string' && v.length < 60) ? 2 : 4;
      var asJson = typeof v !== 'string';
      ta.value = asJson ? JSON.stringify(v) : v;
      acts.appendChild(ta);
      acts.appendChild(mkBtn('Set', function () {
        if (!asJson) { commit(ta.value); return; }
        try { commit(JSON.parse(ta.value)); } catch (e) { toast('Format JSON tidak valid'); }
      }));
    }
    r.appendChild(acts);
    return r;
  }

  /* ---- event ---- */

  function patchEvent(obj) {
    var ok = false;
    try { ok = N.savePatch(JSON.stringify(obj)); } catch (e) {}
    return ok;
  }

  function tabEvents(body) {
    if (!window.$gameMap || !$gameMap.events) { note(body, 'Peta belum dimuat.'); return; }
    var mapId = $gameMap.mapId();
    section(body, 'EVENT DI PETA INI (MAP #' + mapId + ')');
    note(body, 'Jalankan, pindahkan, atau hapus event. Hapus dan pindah biasa hanya berlaku sampai peta dimuat ulang. ' +
      'Tombol permanen menulis perubahan ke file peta.');
    var evs = $gameMap.events().map(function (ev) {
      var d = ev.event ? ev.event() : null;
      return { id: ev.eventId(), name: (d && d.name) || ('EV' + ev.eventId()), ev: ev };
    });
    listTab(body, evs, function (e) {
      var ev = e.ev;
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + e.id + '</span> ' + esc(e.name) +
        ' <span class="ch-sub">(' + ev.x + ', ' + ev.y + ')</span>'));
      var a = el('div', null, 'ch-acts');
      a.appendChild(mkBtn('Jalankan', function () { ev.start(); chModal.style.display = 'none'; toast('Event dijalankan'); }, 'on'));
      a.appendChild(mkBtn('Ke sana', function () { $gamePlayer.locate(ev.x, ev.y); chModal.style.display = 'none'; }));
      a.appendChild(mkBtn('Tarik ke depanku', function () {
        var d = $gamePlayer.direction();
        ev.locate($gameMap.roundXWithDirection($gamePlayer.x, d), $gameMap.roundYWithDirection($gamePlayer.y, d));
        toast('Event dipindah ke depanmu');
        renderCheat();
      }));
      a.appendChild(mkBtn('Simpan posisi', function () {
        toast(patchEvent({ kind: 'event', map: mapId, id: e.id, op: 'move', x: ev.x, y: ev.y }) ? 'Posisi disimpan permanen' : 'Gagal menyimpan');
      }));
      a.appendChild(mkBtn('Hapus', function () { ev.erase(); toast('Event dihapus sementara'); renderCheat(); }));
      a.appendChild(mkBtn('Hapus permanen', function () {
        ev.erase();
        toast(patchEvent({ kind: 'event', map: mapId, id: e.id, op: 'remove' }) ? 'Event dihapus permanen' : 'Gagal menyimpan');
        renderCheat();
      }, 'del'));
      ['A', 'B', 'C', 'D'].forEach(function (sw) {
        var k = [mapId, e.id, sw];
        var on = $gameSelfSwitches.value(k);
        a.appendChild(mkBtn('Self ' + sw, function () { $gameSelfSwitches.setValue(k, !$gameSelfSwitches.value(k)); renderCheat(); }, on ? 'on' : ''));
      });
      r.appendChild(a);
      return r;
    });

    section(body, 'EVENT UMUM');
    listTab(body, validData(window.$dataCommonEvents), function (e) {
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">#' + e.id + '</span> ' + esc(e.name)));
      var a = el('div', null, 'ch-acts');
      a.appendChild(mkBtn('Jalankan', function () {
        $gameTemp.reserveCommonEvent(e.id);
        chModal.style.display = 'none';
        toast('Event umum #' + e.id + ' dijalankan');
      }, 'on'));
      r.appendChild(a);
      return r;
    });
  }

  /* ---- editor save ---- */

  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function afterLoad() {
    try { $gameSystem.onAfterLoad(); } catch (e) {}
    try { Scene_Load.prototype.reloadMapIfUpdated.call({}); } catch (e) {}
    SceneManager.goto(Scene_Map);
    chModal.style.display = 'none';
  }
  function loadSlot(id) {
    var r;
    try { r = DataManager.loadGame(id); } catch (e) { nlog('E', 'Muat slot: ' + e); toast('Gagal memuat slot'); return; }
    if (r && typeof r.then === 'function') r.then(function () { afterLoad(); toast('Slot ' + id + ' dimuat'); }, function () { toast('Gagal memuat slot'); });
    else if (r) { afterLoad(); toast('Slot ' + id + ' dimuat'); }
    else toast('Gagal memuat slot');
  }
  function saveSlot(id) {
    try {
      $gameSystem.onBeforeSave();
      var r = DataManager.saveGame(id);
      if (r && typeof r.then === 'function') r.then(function () { toast('Tersimpan di slot ' + id); renderCheat(); }, function () { toast('Gagal menyimpan'); });
      else { toast(r ? 'Tersimpan di slot ' + id : 'Gagal menyimpan'); renderCheat(); }
    } catch (e) { nlog('E', 'Simpan slot: ' + e); toast('Gagal menyimpan'); }
  }
  function removeSlot(id) {
    try {
      if (DataManager.makeSavename) {
        StorageManager.remove(DataManager.makeSavename(id));
        if (DataManager._globalInfo) { DataManager._globalInfo[id] = null; DataManager.saveGlobalInfo(); }
      } else {
        StorageManager.remove(id);
        var gi = DataManager.loadGlobalInfo();
        if (gi) { gi[id] = null; DataManager.saveGlobalInfo(gi); }
      }
      toast('Slot ' + id + ' dihapus');
      renderCheat();
    } catch (e) { nlog('E', 'Hapus slot: ' + e); toast('Gagal menghapus slot'); }
  }
  function readSlotJson(id, cb) {
    try {
      if (window.StorageManager && StorageManager.loadObject && DataManager.makeSavename) {
        StorageManager.loadObject(DataManager.makeSavename(id)).then(cb, function () { toast('Gagal membaca slot'); });
      } else cb(StorageManager.load(id));
    } catch (e) { nlog('E', 'Baca slot: ' + e); toast('Gagal membaca slot'); }
  }
  function exportText(name, text) {
    try { toast('Disimpan: ' + N.writeExport(name, text)); } catch (e) { toast('Gagal menulis file'); }
  }
  function applySaveText(text) {
    try {
      var contents = JsonEx.parse(text);
      DataManager.createGameObjects();
      DataManager.extractSaveContents(contents);
      afterLoad();
      toast('Save dimuat dari file. Simpan ke slot bila ingin menyimpannya.');
    } catch (e) { nlog('E', 'Impor save: ' + e); toast('File save tidak valid'); }
  }

  function tabSave(body) {
    if (!window.DataManager || !DataManager.maxSavefiles) { note(body, 'Fitur save tidak tersedia di game ini.'); return; }
    note(body, 'Cara edit save: Muat slot, ubah isinya lewat tab Umum, Item, Aktor, Switch, Variabel, lalu Simpan ke slot. ' +
      'Simpan di sini tidak dibatasi menu game. File ekspor ada di folder Android/data/com.arupiji.play/files/saves.');

    section(body, 'KONDISI SEKARANG');
    var top = el('div', null, 'ch-acts');
    top.appendChild(mkBtn('Ekspor ke file', function () {
      try { exportText('save_' + stamp() + '.json', JsonEx.stringify(DataManager.makeSaveContents())); } catch (e) { toast('Gagal mengekspor'); }
    }, 'on'));
    body.appendChild(top);

    section(body, 'SLOT SAVE');
    var max = DataManager.maxSavefiles();
    for (var i = 1; i <= max; i++) (function (id) {
      var exists = false, title = '';
      try { exists = DataManager.isThisGameFile(id); } catch (e) {}
      if (exists) {
        try {
          var info = DataManager.loadSavefileInfo ? DataManager.loadSavefileInfo(id) : (DataManager.savefileInfo ? DataManager.savefileInfo(id) : null);
          if (info) title = (info.title ? info.title + '  ' : '') + (info.timestamp ? new Date(info.timestamp).toLocaleString() : '');
        } catch (e) {}
      }
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', '<span class="ch-id">Slot ' + id + '</span> ' + (exists ? esc(title || 'terisi') : '<span class="ch-sub">kosong</span>')));
      var a = el('div', null, 'ch-acts');
      if (exists) {
        a.appendChild(mkBtn('Muat', function () { loadSlot(id); }, 'on'));
        a.appendChild(mkBtn('Ekspor', function () { readSlotJson(id, function (t) { exportText('slot' + id + '_' + stamp() + '.json', t); }); }));
      }
      a.appendChild(mkBtn('Simpan ke sini', function () { saveSlot(id); }));
      if (exists) a.appendChild(mkBtn('Hapus', function () { removeSlot(id); }, 'del'));
      r.appendChild(a);
      body.appendChild(r);
    })(i);

    section(body, 'IMPOR DARI FILE');
    var files = [];
    try { files = JSON.parse(N.listExports()); } catch (e) {}
    if (!files.length) note(body, 'Belum ada file ekspor.');
    files.forEach(function (name) {
      var r = el('div', null, 'ch-item');
      r.appendChild(el('div', null, 'ch-name', esc(name)));
      var a = el('div', null, 'ch-acts');
      a.appendChild(mkBtn('Muat ke game', function () {
        var t = '';
        try { t = N.readExport(name); } catch (e) {}
        if (!t) { toast('File kosong atau tidak terbaca'); return; }
        applySaveText(t);
      }, 'on'));
      r.appendChild(a);
      body.appendChild(r);
    });
  }

  /* ---- konsol ---- */

  var chConsoleText = '', chConsoleOut = [];
  function tabConsole(body) {
    note(body, 'Jalankan JavaScript langsung di game. Contoh: $gameParty.gainGold(1000)  atau  $gameVariables.setValue(5, 10)  atau  $gameParty.leader().name()');
    var ta = document.createElement('textarea');
    ta.className = 'ch-search'; ta.rows = 4; ta.placeholder = 'Tulis kode di sini'; ta.value = chConsoleText;
    ta.addEventListener('input', function () { chConsoleText = ta.value; });
    body.appendChild(ta);
    var out = el('div', null, 'ch-log');
    function draw() {
      out.innerHTML = chConsoleOut.length ? chConsoleOut.map(function (o) {
        return '<div class="' + (o.ok ? '' : 'bad') + '">' + (o.ok ? '&gt; ' : '! ') + esc(o.text) + '</div>';
      }).join('') : 'Hasil akan tampil di sini.';
    }
    var acts = el('div', null, 'ch-acts');
    acts.appendChild(mkBtn('Jalankan', function () {
      var res;
      try { res = { ok: true, text: fmtVal((0, eval)(ta.value)) }; }
      catch (e) { res = { ok: false, text: String(e) }; nlog('E', 'Konsol: ' + e); }
      chConsoleOut.unshift(res);
      if (chConsoleOut.length > 20) chConsoleOut.pop();
      draw();
    }, 'on'));
    acts.appendChild(mkBtn('Bersihkan hasil', function () { chConsoleOut = []; draw(); }));
    body.appendChild(acts);
    body.appendChild(out);
    draw();
  }

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
