/* TechVault admin + updates (Supabase). I-load pagkatapos ng script.js */
(function () {
  'use strict';

  // ====== I-PASTE DITO ANG SUPABASE PROJECT URL AT ANON KEY MO ======
  var SUPABASE_URL = 'https://riqzumvirkdlltimvplj.supabase.co/rest/v1/';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcXp1bXZpcmtkbGx0aW12cGxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MTIwODIsImV4cCI6MjExMTA4ODA4Mn0.u5JVohHldsChZlFk4ZgaintS3soIHFFqHaPOG1t6TPQ';
  // ==================================================================

  var configured = SUPABASE_URL.indexOf('PASTE') !== 0 && window.supabase;
  var sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  window.TV_ADMIN = false;
  var TV = window.TV = {};
  var updates = [];
  var SEEN_KEY = 'tv_seen_update';

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(iso) {
    return new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function dbErr(r) { if (r && r.error) throw new Error(r.error.message); return r; }
  function getSeen() { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch (e) { return 0; } }
  function setSeen(t) { try { localStorage.setItem(SEEN_KEY, String(t)); } catch (e) {} }

  // ---------- styles ----------
  var css = document.createElement('style');
  css.textContent = [
    '.tv-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;}',
    '.tv-box{background:#fff;color:#1D1D1F;border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow:auto;padding:20px 22px;box-shadow:0 20px 50px rgba(0,0,0,.3);}',
    '.tv-box h3{margin:0 0 12px;font-size:1.05rem;}',
    '.tv-box label{display:block;font-size:.76rem;color:#6E6E73;margin:10px 0 4px;}',
    '.tv-box input,.tv-box textarea{width:100%;padding:10px 12px;border:1px solid rgba(0,0,0,.15);border-radius:9px;font:inherit;font-size:.86rem;box-sizing:border-box;}',
    '.tv-box input:focus,.tv-box textarea:focus{outline:none;border-color:#0071E3;}',
    '.tv-err{color:#C0392B;font-size:.78rem;margin-top:8px;min-height:1em;}',
    '.tv-muted{font-size:.8rem;color:#6E6E73;line-height:1.5;margin:0 0 12px;}',
    '.tv-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;}',
    '.tv-btn{background:#F1F1F3;color:#1D1D1F;border:none;border-radius:10px;padding:9px 16px;font-size:.82rem;font-weight:700;cursor:pointer;}',
    '.tv-btn.pri{background:#0071E3;color:#fff;}',
    '.tv-btn.dng{background:#FDEDEC;color:#C0392B;}',
    '.tv-btn.sm{padding:6px 12px;font-size:.74rem;margin:8px 6px 0 0;}',
    '.tv-btn:disabled{opacity:.5;cursor:default;}',
    '.tv-grid{display:grid;gap:8px;}',
    '.tv-grid .tv-btn{text-align:left;padding:12px 14px;}',
    '.tv-upd{border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:12px 14px;margin-bottom:10px;}',
    '.tv-upd.new{border-color:#0071E3;background:#F2F8FF;}',
    '.tv-upd-top{display:flex;align-items:center;gap:8px;}',
    '.tv-new{background:#0071E3;color:#fff;font-size:.6rem;font-weight:800;border-radius:6px;padding:2px 6px;}',
    '.tv-upd-date{font-size:.72rem;color:#6E6E73;margin:2px 0 6px;}',
    '.tv-upd p{margin:0;font-size:.86rem;line-height:1.5;white-space:pre-wrap;}',
    '.tv-pop{position:fixed;right:16px;bottom:16px;z-index:350;display:flex;align-items:center;gap:12px;background:#fff;color:#1D1D1F;border:1px solid #0071E3;border-radius:14px;padding:12px 14px;max-width:340px;box-shadow:0 12px 30px rgba(0,0,0,.25);animation:popIn .2s ease;}',
    '.tv-pop b{display:block;font-size:.84rem;}',
    '.tv-pop span.t{display:block;font-size:.76rem;color:#6E6E73;margin-top:2px;}',
    '.tv-pop .x{background:none;border:none;font-size:1rem;cursor:pointer;color:#6E6E73;}',
    '@media(max-width:640px){.tv-pop{left:12px;right:12px;max-width:none;}}',
    '.tv-dot{position:absolute;top:0;right:0;min-width:16px;height:16px;border-radius:8px;background:#D40000;color:#fff;font-size:.62rem;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 4px;}',
    '.tv-admin-badge{background:#16A34A;color:#fff;border:none;border-radius:999px;padding:6px 12px;font-size:.74rem;font-weight:800;cursor:pointer;flex-shrink:0;}',
    '.tv-admin-link{display:flex;justify-content:center;margin:26px 0 6px;}',
    '.tv-admin-link button{background:none;border:none;color:#6E6E73;font-size:.74rem;cursor:pointer;text-decoration:underline;}'
  ].join('\n');
  document.head.appendChild(css);

  // ---------- modal + form ----------
  function modal(html) {
    var o = document.createElement('div');
    o.className = 'tv-ov';
    o.innerHTML = '<div class="tv-box">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('mousedown', function (e) { if (e.target === o) o.remove(); });
    return o;
  }

  function form(title, fields, okLabel, onSubmit, intro) {
    var rows = fields.map(function (f) {
      var v = esc(f.value || ''), id = 'tvf_' + f.id, inp;
      if (f.type === 'area') inp = '<textarea id="' + id + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.ph || '') + '">' + v + '</textarea>';
      else if (f.type === 'file') inp = '<input id="' + id + '" type="file" accept="' + (f.accept || '') + '">';
      else inp = '<input id="' + id + '" type="' + (f.type || 'text') + '" value="' + v + '" placeholder="' + esc(f.ph || '') + '">';
      return '<label>' + esc(f.label) + '</label>' + inp;
    }).join('');
    var o = modal('<h3>' + esc(title) + '</h3>' + (intro ? '<p class="tv-muted">' + esc(intro) + '</p>' : '') + rows +
      '<div class="tv-err"></div><div class="tv-actions"><button class="tv-btn" data-x type="button">Cancel</button><button class="tv-btn pri" data-ok type="button">' + esc(okLabel) + '</button></div>');
    var err = o.querySelector('.tv-err'), ok = o.querySelector('[data-ok]');
    o.querySelector('[data-x]').addEventListener('click', function () { o.remove(); });
    function submit() {
      var vals = {};
      fields.forEach(function (f) {
        var el = o.querySelector('#tvf_' + f.id);
        vals[f.id] = f.type === 'file' ? (el.files && el.files[0]) : el.value.trim();
      });
      ok.disabled = true; err.textContent = '';
      Promise.resolve().then(function () { return onSubmit(vals); })
        .then(function () { o.remove(); })
        .catch(function (e) { err.textContent = e.message || String(e); ok.disabled = false; });
    }
    ok.addEventListener('click', submit);
    o.querySelectorAll('input:not([type=file])').forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
    var first = o.querySelector('input,textarea'); if (first) first.focus();
    return o;
  }

  function toEmbed(s) {
    var m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/.exec(s || '');
    if (!m) throw new Error('Maglagay ng valid na YouTube link o embed code.');
    return '<iframe width="560" height="315" src="https://www.youtube.com/embed/' + m[1] +
      '" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  }

  // ---------- data ----------
  async function loadAll() {
    if (!sb) return;
    var r = await Promise.all([
      sb.from('videos').select('*').order('created_at'),
      sb.from('songs').select('*').order('created_at')
    ]);
    if (!r[0].error && r[0].data.length) {
      LEAVES.forEach(function (l) { sharedVideos[l.id] = []; });
      r[0].data.forEach(function (x) {
        (sharedVideos[x.leaf_id] = sharedVideos[x.leaf_id] || []).push({ id: x.id, name: x.name, url: '', embed: x.embed || '' });
      });
    }
    if (!r[1].error && r[1].data.length) {
      sharedSongs.length = 0;
      r[1].data.forEach(function (x) { sharedSongs.push({ id: x.id, name: x.name, url: x.url, path: x.path }); });
    }
  }
  async function fetchUpdates() {
    var r = await sb.from('updates').select('*').order('created_at', { ascending: false }).limit(60);
    updates = r.error ? updates : r.data;
    renderBadge();
  }
  async function post(title, desc, kind, leaf) {
    dbErr(await sb.from('updates').insert({ title: title, description: desc || '', kind: kind || 'general', leaf_id: leaf || null }));
    await fetchUpdates();
  }

  function softRefresh() {
    var a = document.querySelector('.view.active'), id = a && a.id;
    if (id === 'categoriesView') { renderTodayGrid(topSearch.value); renderHomeFeed(); }
    else if (id === 'sectionView') renderSectionGrid();
    renderSongList();
  }
  function fullRefresh() {
    var a = document.querySelector('.view.active');
    if (a && a.id === 'detailView' && currentCat) { renderVideoGrid(); renderSectionGrid(); renderSongList(); }
    else softRefresh();
  }
  async function afterChange() { await loadAll(); fullRefresh(); showToast('Na-save na'); }

  // ---------- admin: videos ----------
  function needImport(v) {
    if (v && v.id) return false;
    throw new Error('I-import muna ang existing videos (Admin panel > Import).');
  }
  TV.addVideo = function (leaf) {
    var L = findLeaf(leaf);
    form('Magdagdag ng video: ' + L.name, [
      { id: 'name', label: 'Pamagat ng video', value: L.name },
      { id: 'link', label: 'YouTube link o embed code', type: 'area', ph: 'https://youtu.be/...' },
      { id: 'desc', label: 'Description ng update (makikita ng users)', type: 'area', value: 'Nagdagdag ng bagong video sa "' + L.name + '".' }
    ], 'Add', async function (v) {
      if (!v.name) throw new Error('Lagyan ng pamagat.');
      var embed = toEmbed(v.link);
      dbErr(await sb.from('videos').insert({ leaf_id: leaf, name: v.name, embed: embed }));
      await post('Bagong video: ' + v.name, v.desc, 'video', leaf);
      await afterChange();
    });
  };
  TV.editVideo = function (leaf, i) {
    var cur = sharedVideos[leaf][i];
    try { needImport(cur); } catch (e) { showToast(e.message); return; }
    form('I-edit ang video', [
      { id: 'name', label: 'Pamagat ng video', value: cur.name },
      { id: 'link', label: 'YouTube link o embed code (iwan kung hindi papalitan)', type: 'area', value: youtubeIdFromEmbed(cur.embed) ? 'https://youtu.be/' + youtubeIdFromEmbed(cur.embed) : '' },
      { id: 'desc', label: 'Description ng update (makikita ng users)', type: 'area', value: 'Binago ang video na "' + cur.name + '".' }
    ], 'Save', async function (v) {
      if (!v.name) throw new Error('Lagyan ng pamagat.');
      var embed = v.link ? toEmbed(v.link) : cur.embed;
      dbErr(await sb.from('videos').update({ name: v.name, embed: embed }).eq('id', cur.id));
      await post('Na-update ang video: ' + v.name, v.desc, 'video', leaf);
      await afterChange();
    });
  };
  TV.removeVideo = function (leaf, i) {
    var cur = sharedVideos[leaf][i];
    try { needImport(cur); } catch (e) { showToast(e.message); return; }
    form('Tanggalin ang "' + cur.name + '"?', [
      { id: 'desc', label: 'Description ng update (makikita ng users)', type: 'area', value: 'Tinanggal ang video na "' + cur.name + '".' }
    ], 'Remove', async function (v) {
      dbErr(await sb.from('videos').delete().eq('id', cur.id));
      await post('Tinanggal ang video: ' + cur.name, v.desc, 'video', leaf);
      await afterChange();
    });
  };

  // ---------- admin: songs ----------
  TV.addSong = function () {
    form('Magdagdag ng kanta', [
      { id: 'file', label: 'MP3 / audio file (max 50 MB)', type: 'file', accept: 'audio/*' },
      { id: 'name', label: 'Pamagat (optional, kukunin sa filename kung blangko)' },
      { id: 'desc', label: 'Description ng update (makikita ng users)', type: 'area', value: 'Nagdagdag ng bagong kanta sa Music.' }
    ], 'Upload', async function (v) {
      var f = v.file;
      if (!f) throw new Error('Pumili ng audio file.');
      if (f.size > 50 * 1024 * 1024) throw new Error('Masyadong malaki (max 50 MB).');
      var path = 'songs/' + Date.now() + '-' + f.name.replace(/[^\w.\-]+/g, '_');
      dbErr(await sb.storage.from('media').upload(path, f, { contentType: f.type || 'audio/mpeg' }));
      var url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
      var name = v.name || f.name.replace(/\.[^.]+$/, '');
      dbErr(await sb.from('songs').insert({ name: name, url: url, path: path }));
      await post('Bagong kanta: ' + name, v.desc, 'song');
      await afterChange();
    });
  };
  TV.removeSong = function (i) {
    var s = sharedSongs[i];
    if (!s.id) { showToast('I-import muna ang existing songs (Admin panel > Import).'); return; }
    form('Tanggalin ang kanta?', [
      { id: 'desc', label: 'Description ng update (makikita ng users)', type: 'area', value: 'Tinanggal ang kantang "' + s.name + '".' }
    ], 'Remove', async function (v) {
      if (playingIndex === i) { audioEl.pause(); playingIndex = null; }
      dbErr(await sb.from('songs').delete().eq('id', s.id));
      if (s.path) await sb.storage.from('media').remove([s.path]);
      await post('Tinanggal ang kanta: ' + s.name, v.desc, 'song');
      await afterChange();
    }, s.name);
  };

  // ---------- admin: announcement / import / panel ----------
  TV.announce = function () {
    form('Mag-post ng announcement', [
      { id: 'title', label: 'Title' },
      { id: 'desc', label: 'Description', type: 'area', rows: 4 }
    ], 'Post', async function (v) {
      if (!v.title) throw new Error('Lagyan ng title.');
      await post(v.title, v.desc, 'general');
      showToast('Na-post na ang update');
    });
  };
  TV.importExisting = function () {
    form('I-import ang existing videos at songs', [], 'Import', async function () {
      var cv = await sb.from('videos').select('id', { count: 'exact', head: true });
      var cs = await sb.from('songs').select('id', { count: 'exact', head: true });
      if ((cv.count || 0) > 0 || (cs.count || 0) > 0) throw new Error('May laman na ang database. Hindi na kailangan mag-import.');
      var t = Date.now(), vids = [], songs = [];
      Object.keys(VIDEO_LIBRARY).forEach(function (leaf) {
        VIDEO_LIBRARY[leaf].forEach(function (v) {
          if (v.embed) vids.push({ leaf_id: leaf, name: v.name, embed: v.embed, created_at: new Date(t++).toISOString() });
        });
      });
      SONG_LIBRARY.forEach(function (s) {
        if (s.name && s.src) songs.push({ name: s.name, url: s.src, created_at: new Date(t++).toISOString() });
      });
      if (vids.length) dbErr(await sb.from('videos').insert(vids));
      if (songs.length) dbErr(await sb.from('songs').insert(songs));
      await afterChange();
    }, 'Kokopyahin nito ang lahat ng videos at songs na nasa script.js papunta sa database para ma-edit/ma-remove mo na sa admin. Isang beses lang ito gagawin.');
  };
  TV.panel = function () {
    var o = modal('<h3>Admin panel</h3><p class="tv-muted">Para mag-add / edit / remove ng video: buksan ang topic at gamitin ang mga button doon. Para sa kanta: Music popup.</p>' +
      '<div class="tv-grid"><button class="tv-btn" data-a="announce">Mag-post ng announcement</button>' +
      '<button class="tv-btn" data-a="song">Magdagdag ng kanta</button>' +
      '<button class="tv-btn" data-a="import">I-import ang existing videos at songs</button>' +
      '<button class="tv-btn dng" data-a="out">Log out</button></div>' +
      '<div class="tv-actions"><button class="tv-btn" data-x>Close</button></div>');
    o.querySelector('[data-x]').addEventListener('click', function () { o.remove(); });
    o.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.a; o.remove();
        if (a === 'announce') TV.announce();
        if (a === 'song') TV.addSong();
        if (a === 'import') TV.importExisting();
        if (a === 'out') sb.auth.signOut();
      });
    });
  };
  TV.login = function () {
    if (!sb) { showToast('Hindi pa naka-set ang Supabase sa admin.js'); return; }
    form('Admin login', [
      { id: 'email', label: 'Email', type: 'email' },
      { id: 'pw', label: 'Password', type: 'password' }
    ], 'Log in', async function (v) {
      var r = await sb.auth.signInWithPassword({ email: v.email, password: v.pw });
      if (r.error) throw new Error('Mali ang email o password.');
      showToast('Naka-login ka bilang admin');
    });
  };

  // ---------- user side: updates ----------
  var dot = document.getElementById('updDot');
  function renderBadge() {
    if (!dot) return;
    var seen = getSeen();
    var n = window.TV_ADMIN ? 0 : updates.filter(function (u) { return Date.parse(u.created_at) > seen; }).length;
    dot.style.display = n ? 'flex' : 'none';
    dot.textContent = n > 9 ? '9+' : n;
  }
  function showPopup(u) {
    var old = document.getElementById('tvPop'); if (old) old.remove();
    var p = document.createElement('div');
    p.className = 'tv-pop'; p.id = 'tvPop';
    p.innerHTML = '<div style="flex:1;min-width:0"><b>May bagong update</b><span class="t">' + esc(u.title) + '</span></div>' +
      '<button class="tv-btn pri sm" style="margin:0" data-v>Tingnan</button><button class="x" data-c aria-label="Close">&times;</button>';
    document.body.appendChild(p);
    p.querySelector('[data-c]').addEventListener('click', function () { p.remove(); });
    p.querySelector('[data-v]').addEventListener('click', function () { p.remove(); TV.openUpdates(); });
  }
  TV.openUpdates = function () {
    var seen = getSeen();
    var items = updates.length ? updates.map(function (u) {
      var isNew = Date.parse(u.created_at) > seen;
      return '<div class="tv-upd' + (isNew ? ' new' : '') + '"><div class="tv-upd-top"><b>' + esc(u.title) + '</b>' + (isNew ? '<span class="tv-new">NEW</span>' : '') + '</div>' +
        '<div class="tv-upd-date">' + esc(fmt(u.created_at)) + '</div>' +
        (u.description ? '<p>' + esc(u.description) + '</p>' : '') +
        (u.leaf_id && findLeaf(u.leaf_id) ? '<button class="tv-btn sm" data-open="' + esc(u.leaf_id) + '">Buksan ang topic</button>' : '') +
        (window.TV_ADMIN ? '<button class="tv-btn sm dng" data-del="' + esc(u.id) + '">Delete</button>' : '') + '</div>';
    }).join('') : '<p class="tv-muted">Wala pang update.</p>';
    var o = modal('<h3>Mga Update</h3>' + items + '<div class="tv-actions"><button class="tv-btn" data-x>Close</button></div>');
    o.querySelector('[data-x]').addEventListener('click', function () { o.remove(); });
    o.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { o.remove(); openCategory(b.dataset.open); });
    });
    o.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        await sb.from('updates').delete().eq('id', b.dataset.del);
        await fetchUpdates(); o.remove(); TV.openUpdates();
      });
    });
    if (updates.length) setSeen(Math.max.apply(null, updates.map(function (u) { return Date.parse(u.created_at); })));
    renderBadge();
  };
  var bell = document.getElementById('updatesBtn');
  if (bell) bell.addEventListener('click', function () {
    if (!sb) { showToast('Hindi pa naka-set ang Supabase'); return; }
    TV.openUpdates();
  });

  // ---------- admin entry points ----------
  var settingsBtn = document.getElementById('settingsBtn');
  var badge = document.createElement('button');
  badge.className = 'tv-admin-badge'; badge.textContent = 'Admin'; badge.style.display = 'none';
  if (settingsBtn) settingsBtn.parentNode.insertBefore(badge, settingsBtn);
  badge.addEventListener('click', TV.panel);

  var sp = document.querySelector('#settingsView .screen-pad');
  if (sp) {
    var w = document.createElement('div');
    w.className = 'tv-admin-link';
    w.innerHTML = '<button type="button">Admin</button>';
    sp.appendChild(w);
    w.firstChild.addEventListener('click', function () { window.TV_ADMIN ? TV.panel() : TV.login(); });
  }

  function applyAuth(session) {
    window.TV_ADMIN = !!session;
    badge.style.display = session ? 'inline-block' : 'none';
    renderBadge();
    fullRefresh();
  }

  // ---------- start ----------
  async function init() {
    if (!sb) { console.warn('TechVault: i-set ang SUPABASE_URL at SUPABASE_KEY sa admin.js'); return; }
    await loadAll();
    await fetchUpdates();

    // First-time visitor: huwag i-popup ang mga lumang update
    if (localStorage.getItem(SEEN_KEY) === null) {
      setSeen(updates.length ? Math.max.apply(null, updates.map(function (u) { return Date.parse(u.created_at); })) : 0);
      renderBadge();
    } else {
      var fresh = updates.filter(function (u) { return Date.parse(u.created_at) > getSeen(); });
      if (fresh.length) showPopup(fresh[0]);
    }
    softRefresh();

    // Realtime: kusang lalabas ang pop-up kapag may in-add ang admin
    sb.channel('tv-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'updates' }, async function (p) {
      await fetchUpdates();
      if (p.eventType === 'INSERT' && !window.TV_ADMIN) {
        await loadAll();
        softRefresh();
        showPopup(p.new);
      }
    }).subscribe();

    sb.auth.getSession().then(function (r) { applyAuth(r.data.session); });
    sb.auth.onAuthStateChange(function (_e, s) { applyAuth(s); });
  }
  init();
})();
