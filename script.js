const accounts = [];
const userStore = {};
let currentUser = null;

const DEV_USERNAME = 'jake';
function isDev(){ return !!currentUser && currentUser.toLowerCase() === DEV_USERNAME; }

function ensureUserData(username){
  if(!userStore[username]){
    userStore[username] = { favorites:new Set(['iphone','ipad','mac']), bio:'', searchHistory:[], feedback:[], activity:[], videoProgress:{} };
    restoreUserData(username);
  }
  return userStore[username];
}
function getUserData(){ return userStore[currentUser]; }

// Hindi na sine-save sa localStorage.
// Memory lang ang history, kaya mawawala pag nag-refresh o umalis sa web app.
function persistUserData(){}

// Binubura ang mga lumang history na na-save ng dating version.
function restoreUserData(username){
  try{
    Object.keys(localStorage)
      .filter(function(k){ return k.indexOf('techvault_') === 0; })
      .forEach(function(k){ localStorage.removeItem(k); });
  }catch(e){}
}

function pushActivity(type, name, id){
  const ud = getUserData();
  if(!ud.activity) ud.activity = [];
  ud.activity = ud.activity.filter(a => !(a.type === type && a.name === name));
  ud.activity.unshift({ type, name, id, ts: Date.now() });
  if(ud.activity.length > 30) ud.activity.length = 30;
  persistUserData();
}

function progressKey(leafId, url){ return leafId + '::' + url; }
function saveVideoProgress(key, time, duration){
  const ud = getUserData();
  if(!ud.videoProgress) ud.videoProgress = {};
  ud.videoProgress[key] = { time, duration, ts: Date.now() };
  persistUserData();
}
function getVideoProgress(key){
  const ud = getUserData();
  return (ud.videoProgress && ud.videoProgress[key]) || null;
}

let players = [];
let autoResume = false;

function formatTime(s){
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const rr = (r < 10 ? '0' : '') + r;
  if(h) return h + ':' + (m < 10 ? '0' : '') + m + ':' + rr;
  return m + ':' + rr;
}
function embedProgressKey(leafId, embed, i){
  return progressKey(leafId, 'yt:' + youtubeIdFromEmbed(embed) + ':' + i);
}
function bestEmbedProgress(leafId){
  const vids = sharedVideos[leafId] || [];
  let best = null;
  vids.forEach((v, i)=>{
    if(!v.embed) return;
    const p = getVideoProgress(embedProgressKey(leafId, v.embed, i));
    if(p && p.time > 0 && (!best || (p.ts || 0) > (best.ts || 0))) best = p;
  });
  return best;
}

let ytCallbacks = [];
let ytLoading = false;
function whenYouTubeReady(cb){
  if(window.YT && window.YT.Player){ cb(); return; }
  ytCallbacks.push(cb);
  if(ytLoading) return;
  ytLoading = true;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function(){
    if(typeof prev === 'function'){ try{ prev(); }catch(e){} }
    ytCallbacks.splice(0).forEach(f => f());
  };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}

function saveWatchProgress(rec, ended){
  // skip until the video has actually played so saved progress is not overwritten
  if(!rec.touched) return;
  try{
    const d = rec.player.getDuration();
    if(!d) return;
    const t = ended ? d : rec.player.getCurrentTime();
    saveVideoProgress(rec.key, t, d);
  }catch(e){}
}
function saveAllWatchProgress(){
  players.forEach(r => { if(r.iframe.isConnected) saveWatchProgress(r, false); });
}
setInterval(()=>{
  players = players.filter(r => r.iframe.isConnected);
  players.forEach(r => { if(r.playing) saveWatchProgress(r, false); });
}, 2000);

function attachPlayer(iframe, key){
  whenYouTubeReady(()=>{
    if(!iframe.isConnected) return;
    const rec = { player:null, iframe, key, playing:false, touched:false };
    rec.player = new YT.Player(iframe, {
      events:{
        onStateChange:(e)=>{
          rec.playing = (e.data === 1);
          if(e.data === 1) stopMusic();
          if(e.data === 1) rec.touched = true;
          if(e.data === 1 || e.data === 2 || e.data === 0) saveWatchProgress(rec, e.data === 0);
        }
      }
    });
    players.push(rec);
  });
}
function prepareEmbed(embed, leafId, i){
  const prog = getVideoProgress(embedProgressKey(leafId, embed, i));
  let start = 0;
  if(prog && prog.time > 2 && (!prog.duration || prog.time < prog.duration - 3)) start = Math.floor(prog.time);
  return embed.replace(/src="([^"]+)"/, (m, src)=>{
    let u;
    try{ u = new URL(src, location.href); }catch(e){ return m; }
    u.searchParams.set('enablejsapi', '1');
    if(/^https?:$/.test(location.protocol)) u.searchParams.set('origin', location.origin);
    if(start){
      u.searchParams.set('start', start);
      if(autoResume){ u.searchParams.set('autoplay', '1'); autoResume = false; }
    }
    return 'src="' + u.toString() + '"';
  });
}
function attachEmbedPlayers(leafId){
  const list = sharedVideos[leafId] || [];
  videoGrid.querySelectorAll('.slot:not(.pdf-slot)').forEach((slot, i)=>{
    const v = list[i];
    const iframe = slot.querySelector('iframe');
    if(!iframe || !v || !v.embed) return;
    attachPlayer(iframe, embedProgressKey(leafId, v.embed, i));
  });
}

function logInAs(u){
  currentUser = u;
  ensureUserData(u);
  document.getElementById('topBar').style.display = 'flex';
  renderDevicePanel();
  showCategories();
}
function logOff(){
  currentUser = null;
  document.getElementById('devicePanel').classList.remove('open');
  logInAs('Guest');
}

const devices = [
  { id:'web', name:'Normal Screen', icon:'<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 20h8M12 17v3"/>' },
  { id:'iphone', name:'iPhone', icon:'<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M10.5 5h3"/>' },
  { id:'android', name:'Android', icon:'<rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="9.2" cy="4.4" r=".6" fill="currentColor" stroke="none"/><circle cx="14.8" cy="4.4" r=".6" fill="currentColor" stroke="none"/>' },
  { id:'ipad', name:'iPad', icon:'<rect x="5" y="3" width="14" height="18" rx="2"/>' },
  { id:'mac', name:'Mac', icon:'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8"/>' },
  { id:'windows', name:'Windows', icon:'<rect x="3" y="3" width="7.5" height="7.5"/><rect x="13.5" y="3" width="7.5" height="7.5"/><rect x="3" y="13.5" width="7.5" height="7.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5"/>' },
  { id:'vision', name:'Vision', icon:'<path d="M2 12c0-3 2.5-4.5 5-4.5s4 1.2 5 2.4c1-1.2 2.5-2.4 5-2.4s5 1.5 5 4.5-2.5 4.5-5 4.5c-2.5 0-4-1.2-5-2.4-1 1.2-2.5 2.4-5 2.4S2 15 2 12z"/>' },
  { id:'watch', name:'Watch', icon:'<rect x="7" y="6" width="10" height="12" rx="4"/><path d="M9 3h6M9 21h6"/>' },
  { id:'tv', name:'TV', icon:'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>' },
];
let currentDevice = 'web';
const deviceTrigger = document.getElementById('deviceTrigger');
const devicePanel = document.getElementById('devicePanel');
const deviceFrame = document.getElementById('deviceFrame');
const stage = document.getElementById('stage');

let dpEditing = false;
let dpDraftFavs = null;

function dpItemHTML(d, isFav){
  const star = dpEditing ? `<span class="dp-star ${isFav?'active':''}" data-star="${d.id}">&#9733;</span>` : '';
  return `<div class="dp-item" data-id="${d.id}">
    <span class="dp-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d.icon}</svg></span>
    <span class="dp-label">${d.name}</span>
    ${star}
  </div>`;
}
function renderDevicePanel(){
  if(!currentUser) return;
  const ud = getUserData();
  const favSet = dpEditing ? dpDraftFavs : ud.favorites;
  const favItems = devices.filter(d => favSet.has(d.id));
  const otherItems = devices.filter(d => !favSet.has(d.id));

  document.getElementById('dpFavGrid').innerHTML = favItems.map(d=>dpItemHTML(d,true)).join('') || `<p style="grid-column:1/-1; font-size:.76rem; color:var(--ink-soft); margin:0;">No favorites yet — tap the pencil to add some.</p>`;
  document.getElementById('dpMoreGrid').innerHTML = otherItems.map(d=>dpItemHTML(d,false)).join('') || `<p style="grid-column:1/-1; font-size:.76rem; color:var(--ink-soft); margin:0;">Everything's in your favorites.</p>`;
  document.getElementById('dpSaveBtn').style.display = dpEditing ? 'flex' : 'none';
  document.getElementById('dpEditBtn').style.display = dpEditing ? 'none' : 'flex';

  devicePanel.querySelectorAll('.dp-item[data-id]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.id;
      if(dpEditing){
        if(dpDraftFavs.has(id)) dpDraftFavs.delete(id); else dpDraftFavs.add(id);
        renderDevicePanel();
      } else {
        setDevice(id);
      }
    });
  });
}
document.getElementById('dpEditBtn').addEventListener('click', ()=>{
  dpEditing = true;
  dpDraftFavs = new Set(getUserData().favorites);
  renderDevicePanel();
});
function showToast(msg){
  const t = document.getElementById('saveToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._h);
  showToast._h = setTimeout(()=> t.classList.remove('show'), 1800);
}
document.getElementById('dpSaveBtn').addEventListener('click', ()=>{
  getUserData().favorites = new Set(dpDraftFavs);
  dpEditing = false;
  renderDevicePanel();
  showToast('Favorites saved');
});

const musicPopup = document.getElementById('musicPopup');
const globalSaveBtn = document.getElementById('globalSaveBtn');

function openMusicPopup(){
  musicPopup.classList.add('open');
  renderSongList();
}
function closeMusicPopup(){
  musicPopup.classList.remove('open');
}
function toggleMusicPopup(){
  musicPopup.classList.contains('open') ? closeMusicPopup() : openMusicPopup();
}

globalSaveBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  if(dpEditing){
    getUserData().favorites = new Set(dpDraftFavs);
    dpEditing = false;
    renderDevicePanel();
  }
  devicePanel.classList.remove('open');
  toggleMusicPopup();
});

function setDevice(id){
  currentDevice = id;
  deviceFrame.setAttribute('data-device', id);
  stage.classList.toggle('framed', id !== 'web');
}
document.getElementById('deviceReset').addEventListener('click', ()=> setDevice('web'));
deviceTrigger.addEventListener('click', (e)=>{
  e.stopPropagation();
  closeMusicPopup();
  devicePanel.classList.toggle('open');
});
document.addEventListener('click', (e)=>{
  if(!devicePanel.contains(e.target) && !deviceTrigger.contains(e.target)) devicePanel.classList.remove('open');
  if(!musicPopup.contains(e.target) && !globalSaveBtn.contains(e.target)) closeMusicPopup();
});
renderDevicePanel();

document.getElementById('darkThemeSwitch').addEventListener('change', e=>{
  document.body.style.filter = e.target.checked ? 'invert(1) hue-rotate(180deg)' : 'none';
});

const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const hamburgerBtn = document.getElementById('hamburgerBtn');
function openSidebar(){ sidebar.classList.add('open'); sidebarBackdrop.classList.add('show'); }
function closeSidebar(){ sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show'); }
function toggleSidebar(){ sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); }
hamburgerBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleSidebar(); });
sidebarBackdrop.addEventListener('click', closeSidebar);
window.addEventListener('resize', ()=> updateFeedArrows());

let lastMainView = 'categoriesView';

function stopAllVideos(){
  document.querySelectorAll('#videoGrid video').forEach(v => { if(!v.paused) v.pause(); });
}
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){ stopAllVideos(); saveAllWatchProgress(); }
});
window.addEventListener('pagehide', saveAllWatchProgress);

function stopEmbeds(){
  saveAllWatchProgress();
  document.querySelectorAll('#videoGrid .slot:not(.pdf-slot) iframe').forEach(f => {
    try { f.src = 'about:blank'; } catch(e){}
  });
  players = [];
}

function showView(id){
  if(id !== 'detailView'){ stopAllVideos(); stopEmbeds(); }
  if(id === 'categoriesView' || id === 'sectionView') returnStack = [];
  if(id !== 'detailView' && expandedSections.size){
    expandedSections.clear();
    renderSidebar();
  }
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  if(id === 'categoriesView') lastMainView = id;
}

const SECTIONS = [
  { id:'hw', name:'Hardware', eyebrow:'Hands-on Fixes', grad:'linear-gradient(135deg,#4B5B6B,#1F2933)',
    img:'assets/01_Hardware.png',
    icon:'<path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><rect x="7" y="7" width="10" height="10" rx="1.5"/>',
    items:[
      {id:'hw-01', code:'HW-01', name:'System Unit Assembly'},
      {id:'hw-02', code:'HW-02', name:'System Unit Disassembly'},
      {id:'hw-03', code:'HW-03', name:'Function of Motherboard'},
      {id:'hw-04', code:'HW-04', name:'Parts of System Unit'},
    ]},
  { id:'net', name:'Networking', eyebrow:'Get Back Online', grad:'linear-gradient(135deg,#12B3A8,#0A5C56)',
    img:'assets/02_Networking.png',
    icon:'<path d="M12 20h.01M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 14 0M2 8.5a15 15 0 0 1 20 0"/>',
    items:[
      {id:'net-01', code:'NET-01', name:'Creating a Straight-Through Cable'},
      {id:'net-02', code:'NET-02', name:'Creating a Crossover Cable'},
      {id:'net-03', code:'NET-03', name:'RJ45 Crimping'},
      {id:'net-06', code:'NET-06', name:'Router Configuration'},
      {id:'net-07', code:'NET-07', name:'IP Address Configuration'},
      {id:'net-08', code:'NET-08', name:'Basic Network Troubleshooting'},
    ]},
  { id:'sw', name:'Software', eyebrow:'App Fixes', grad:'linear-gradient(135deg,#4F46E5,#241C7A)',
    img:'assets/03_Software.png',
    icon:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    items:[
      {id:'sw-01', code:'SW-01', name:'Windows Installation'},
      {id:'sw-02', code:'SW-02', name:'Creating a Bootable USB'},
      {id:'sw-03', code:'SW-03', name:'Software Installation'},
      {id:'sw-04', code:'SW-04', name:'Driver Installation'},
      {id:'sw-05', code:'SW-05', name:'Antivirus Installation'},
      {id:'sw-06', code:'SW-06', name:'Basic Windows Troubleshooting'},
    ]},
  { id:'prog', name:'Programming', eyebrow:'Code It Up', grad:'linear-gradient(135deg,#FF9142,#B85A12)',
    img:'assets/04_Programming.png',
    icon:'<path d="m8 9-4 3 4 3M16 9l4 3-4 3M13 6l-2 12"/>',
    items:[
      {id:'prog-01', code:'PROG-01', name:'HTML Basics'},
      {id:'prog-02', code:'PROG-02', name:'CSS Basics'},
      {id:'prog-03', code:'PROG-03', name:'JavaScript Basics'},
      {id:'prog-04', code:'PROG-04', name:'Creating a Simple Website'},
      {id:'prog-05', code:'PROG-05', name:'Basic Programming Concepts'},
    ]},
  { id:'maint', name:'IT Maintenance & Safety', eyebrow:'Stay Protected', grad:'linear-gradient(135deg,#E1435A,#7A1424)',
    img:'assets/05_IT_Maintenance_Safety.png',
    icon:'<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/>',
    items:[
      {id:'maint-01', code:'MAINT-01', name:'Preventive Computer Maintenance'},
      {id:'maint-02', code:'MAINT-02', name:'Proper Cable Management'},
      {id:'maint-03', code:'MAINT-03', name:'ESD Safety'},
      {id:'maint-05', code:'MAINT-05', name:'Data Backup'},
      {id:'maint-06', code:'MAINT-06', name:'Basic Troubleshooting Steps'},
      {id:'maint-07', code:'MAINT-07', name:'Occupational Health and Safety'},
      {id:'maint-08', code:'MAINT-08', name:'5s'},
    ]},
  { id:'word', name:'Microsoft Word', short:'Word', group:'office',
    cardName:'Microsoft Office Tools', cardEyebrow:'Office Skills', eyebrow:'Office Skills', grad:'linear-gradient(135deg,#2B7CD3,#123C78)',
    img:'assets/06_MS_Word.svg',
    flip:true,
    noVideos:true,
    pdf:'pdf/MS_Word_for_Beginners.pdf',
    pdfTitle:'Microsoft Word for Beginners',
    pdfMeta:'1.5 hours • 10 lessons',
    tips:[
      ['Ctrl + S','Save'],
      ['F12','Save As'],
      ['Ctrl + Z','Undo'],
      ['Ctrl + C / X / V','Copy / Cut / Paste'],
      ['Ctrl + B / I / U','Bold / Italic / Underline'],
      ['Ctrl + P','Print'],
    ],
    icon:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13l1.5 5 2.5-5 2.5 5L16 13"/>',
    items:[
      {id:'word-01', code:'WORD-01', name:'Navigating with the Keyboard', page:3},
      {id:'word-02', code:'WORD-02', name:'Navigating with the Mouse and Zoom Slider', page:4},
      {id:'word-03', code:'WORD-03', name:'Common Shortcut Keys', page:5},
      {id:'word-04', code:'WORD-04', name:'Saving a Document', page:7},
      {id:'word-05', code:'WORD-05', name:'Closing a Document', page:8},
      {id:'word-06', code:'WORD-06', name:'Undo, Redo and Repeat', page:8},
      {id:'word-07', code:'WORD-07', name:'Cut, Copy and Paste', page:9},
      {id:'word-08', code:'WORD-08', name:'Format Font', page:10},
      {id:'word-09', code:'WORD-09', name:'Formatting Paragraphs', page:12},
      {id:'word-10', code:'WORD-10', name:'Spelling and Grammar', page:15},
    ]},
  { id:'excel', name:'Microsoft Excel', short:'Excel', group:'office', hidden:true,
    eyebrow:'Office Skills', grad:'linear-gradient(135deg,#21A366,#0B5D36)',
    img:'assets/06_MS_Word.svg',
    noVideos:true,
    pdf:'pdf/MS_Excel_for_Beginners.pdf',
    pdfTitle:'Microsoft Excel for Beginners',
    icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    items:[
      {id:'excel-01', code:'EXCEL-01', name:'Excel Interface and Basics', tables:[
        {title:'Workbook & File', rows:[['Ctrl + N','New workbook'],['Ctrl + O','Open'],['Ctrl + S','Save'],['F12','Save As'],['Ctrl + P','Print'],['Ctrl + W','Close workbook']]},
        {title:'Navigation', rows:[['Ctrl + Arrow','Jump to edge of data region'],['Ctrl + Home','Go to A1 (top-left)'],['Ctrl + End','Go to last used cell'],['Page Up / Page Down','Move one screen up/down'],['Alt + Page Up / Down','Move one screen left/right'],['Ctrl + G or F5','Go To dialog']]}
      ]},
      {id:'excel-02', code:'EXCEL-02', name:'Selecting and Editing Cells', tables:[
        {title:'Selection', rows:[['Shift + Arrow','Extend selection by one cell'],['Ctrl + Shift + Arrow','Select to edge of data region'],['Ctrl + A','Select current region / entire sheet'],['Shift + Space','Select entire row'],['Ctrl + Space','Select entire column']]},
        {title:'Editing', rows:[['F2','Edit active cell'],['Ctrl + Z','Undo'],['Ctrl + Y','Redo'],['Ctrl + X / C / V','Cut / Copy / Paste'],['Ctrl + D','Fill down'],['Ctrl + R','Fill right'],['Alt + Enter','New line in cell']]}
      ]},
      {id:'excel-03', code:'EXCEL-03', name:'Formatting Data', tables:[
        {title:'Formatting', rows:[['Ctrl + B','Bold'],['Ctrl + I','Italic'],['Ctrl + U','Underline'],['Ctrl + 1','Format Cells dialog'],['Ctrl + Shift + $','Currency format'],['Ctrl + Shift + %','Percentage format'],['Ctrl + Shift + #','Date format']]}
      ]},
      {id:'excel-04', code:'EXCEL-04', name:'Rows and Columns', tables:[
        {title:'Rows & Columns', rows:[['Ctrl + Shift + +','Insert row/column'],['Ctrl + -','Delete row/column'],['Ctrl + 9','Hide row'],['Ctrl + Shift + 9','Unhide row'],['Ctrl + 0','Hide column'],['Ctrl + Shift + 0','Unhide column']]}
      ]},
      {id:'excel-05', code:'EXCEL-05', name:'Basic Formulas and Functions', tables:[
        {title:'Formulas', rows:[['=','Start formula'],['Alt + =','AutoSum'],['F4','Toggle absolute/relative reference'],['Ctrl + `','Show/Hide formulas'],['Shift + F3','Insert Function dialog']]}
      ]},
      {id:'excel-06', code:'EXCEL-06', name:'Data and Tables', tables:[
        {title:'Data & Tables', rows:[['Ctrl + T','Create table'],['Ctrl + Shift + L','Toggle filters'],['Alt + Down Arrow','Open filter menu'],['Ctrl + Shift + K','Insert hyperlink']]}
      ]},
    ]},
  { id:'ppt', name:'Microsoft PowerPoint', short:'PowerPoint', group:'office', hidden:true,
    eyebrow:'Office Skills', grad:'linear-gradient(135deg,#D24726,#7A230E)',
    img:'assets/06_MS_Word.svg',
    noVideos:true,
    pdf:'pdf/MS_PowerPoint_for_Beginners.pdf',
    pdfTitle:'Microsoft PowerPoint for Beginners',
    icon:'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    items:[
      {id:'ppt-01', code:'PPT-01', name:'PowerPoint Interface and Basics', tables:[
        {title:'Helpful Shortcut Keys', rows:[['CTRL+S','Save a presentation'],['CTRL+P','Print a presentation'],['CTRL+O','Open a presentation'],['CTRL+N','Create a new presentation'],['CTRL+M','New slide'],['CTRL+D','Duplicate'],['CTRL+X / C / V','Cut / Copy / Paste'],['CTRL+Z','Undo'],['CTRL+Y or F4','Redo / repeat'],['CTRL+A','Select all'],['CTRL+W or CTRL+F4','Close active presentation'],['CTRL+Q or ALT+F4','Close PowerPoint']]},
        {title:'Moving In a Presentation', rows:[['CTRL+HOME','First slide'],['CTRL+END','Last slide'],['PAGE DOWN','Next slide'],['PAGE UP','Previous slide'],['F6','Move from pane to pane']]}
      ]},
      {id:'ppt-02', code:'PPT-02', name:'Creating and Designing Slides', tables:[
        {title:'Formatting In a Presentation', rows:[['CTRL+L','Align left'],['CTRL+R','Align right'],['CTRL+E','Center'],['CTRL+B','Bold text'],['CTRL+K','Insert hyperlink']]},
        {title:'Creating and Selecting Objects', rows:[['Hold SHIFT + drag','Draw a perfect shape'],['SHIFT+ALT+F9','Show/Hide ruler'],['SHIFT+F9','Show/Hide gridlines'],['ALT+F9','Show/Hide guides'],['Hold SHIFT and click','Select multiple objects'],['TAB / SHIFT+TAB','Select an object'],['CTRL+A','Select all objects']]},
        {title:'Deleting and Copying', rows:[['CTRL+D','Copy a shape'],['CTRL+SHIFT + drag','Copy a shape and align with original'],['BACKSPACE','Delete one character to the left'],['CTRL+BACKSPACE','Delete one word to the left'],['DELETE','Delete one character to the right'],['CTRL+DELETE','Delete one word to the right']]}
      ]},
      {id:'ppt-03', code:'PPT-03', name:'Working with Text and Outline', tables:[
        {title:'Moving Around In Text', rows:[['CTRL + ← / →','One word left / right'],['HOME / END','Beginning / end of a line'],['CTRL + ↑ / ↓','Up / down one paragraph'],['CTRL+HOME / END','Beginning / end of a text box'],['CTRL+ENTER','Next title or body placeholder'],['CTRL+F or F4','Find'],['SHIFT+F4','Repeat last Find']]},
        {title:'Working In an Outline', rows:[['CTRL+SHIFT+TAB','Switch Outline / Slides pane'],['SHIFT+TAB','Promote a paragraph'],['TAB','Demote a paragraph'],['ALT+SHIFT+↑ / ↓','Move selected paragraphs up / down'],['ALT+SHIFT+1','Show heading level 1'],['ALT+SHIFT+PLUS','Expand text below a heading'],['ALT+SHIFT+MINUS','Collapse text below a heading'],['ALT+SHIFT+A','Show all text or headings']]}
      ]},
      {id:'ppt-04', code:'PPT-04', name:'Running a Slide Show', tables:[
        {title:'Running & Navigating', rows:[['F5','Run from the beginning'],['SHIFT+F5','Run from the current slide'],['ALT+F5','Run with Presenter View'],['→ ↓ N ENTER SPACEBAR','Next slide'],['← ↑ P BACKSPACE','Previous slide'],['<number>+ENTER','Go to slide number'],['HOME','Return to first slide'],['END','Go to last slide'],['CTRL+S','Open the Slide Selector'],['G','See all slides'],['ESC','End a slide show']]},
        {title:'Displaying & Annotating', rows:[['B or PERIOD','Black screen'],['W or COMMA','White screen'],['CTRL+P','Pointer to pen'],['CTRL+A or CTRL+U','Pointer to arrow'],['CTRL+E','Pointer to eraser'],['CTRL+I','Pointer to highlighter'],['E','Erase on-screen ink'],['CTRL+L','Laser pointer'],['CTRL+M','Show/hide ink markups'],['CTRL+H','Hide pointer and buttons'],['+ / -','Zoom in / out'],['J','Subtitles on/off']]}
      ]},
      {id:'ppt-05', code:'PPT-05', name:'Presenter View, Rehearsing and Media', tables:[
        {title:'Presenter View', rows:[['ALT+F5','Start Presenter View'],['F6','Cycle between regions'],['TAB','Cycle through tools'],['ALT+W','Read the elapsed time'],['CTRL+PAGE DOWN / UP','Scroll Notes pane']]},
        {title:'Rehearsing & Hyperlinks', rows:[['T','Set new timings while rehearsing'],['R','Re-record narration and timing'],['TAB / SHIFT+TAB','Next / previous hyperlink'],['ENTER','Run selected hyperlink']]},
        {title:'Working with Media', rows:[['ALT+P','Play/pause'],['ALT+Q','Stop playback'],['ALT+DOWN / UP','Volume down / up'],['ALT+U','Mute/unmute']]},
        {title:'Getting Help', rows:[['F1','Help during slide show'],['CTRL+T','View task bar'],['SHIFT+F10','Display the shortcut menu']]}
      ]},
    ]},
];
const MUSIC_CAT = { id:'music', code:'MUS-01', name:'Music', eyebrow:'While You Watch', grad:'linear-gradient(135deg,#C471ED,#7B2FF7)', isMusic:true,
  img:'assets/06_Media.png',
  icon:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' };

const LEAVES = [];
SECTIONS.forEach(sec => sec.items.forEach(it => LEAVES.push({...it, sectionId:sec.id, sectionName:sec.name, grad:sec.grad, icon:sec.icon})));
function findLeaf(id){ return LEAVES.find(l=>l.id===id); }
function findSection(id){ return SECTIONS.find(s=>s.id===id); }

const VIDEO_LIBRARY = {
  'hw-01': [{name:'System Unit Assembly', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/aIsmvS4EJ7M?si=aPetKzIM_8IaX9ey" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'hw-02': [{name:'System Unit Disassembly', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/Egp8K9iObNM?si=z0nObAJxmYfwpwo6" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'hw-03': [{name:'Function of Motherboard', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/DCcJ5U9dGTs?si=A3RfEk5NBRjziJ1x" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'hw-04': [{name:'Parts of System Unit', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/_Ew68nD1siE?si=c35kV2nZTOQsLX77" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],

  'net-01': [{name:'Creating a Straight-Through Cable', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/j85IqRQlJDs?si=7mBPf7rYe9MgDpnq" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'net-02': [{name:'Creating a Crossover Cable', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/LKxzJk08Ma8?si=oSC5m-oXJ1b5RgiD" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'net-03': [{name:'RJ45 Crimping', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/QMpWkkqX1eM?si=tYlgVzyVLvmOCrcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'net-06': [{name:'Router Configuration', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/ag7O4Of1geE?si=AYbOS9LSJdPi4EwE" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'net-07': [{name:'IP Address Configuration', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/zZ02fvBXNAI?si=6CLGhZCPHT41pNwW" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'net-08': [{name:'Basic Network Troubleshooting', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/JSte0MkHjNQ?si=gNX5Q3sOnMn-A5XT" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],

  'sw-01': [
    {name:'Windows Installation - Part 1', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/v4hHQrivf-k?si=TRM_kWGR03ugUPQb" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'},
    {name:'Windows Installation - Part 2', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/h7KrsciBT4c?si=BzRnPT8c80UofD64" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}
  ],
  'sw-02': [
    {name:'Creating a Bootable USB - Part 1', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/Pw6xZuR_yE8?si=fzk62eQlNfVahVP5" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'},
    {name:'Creating a Bootable USB - Part 2', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/Pw6xZuR_yE8?si=zPVvsbSBeF-fI77C" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}
  ],
  'sw-03': [{name:'Software Installation', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/RoADWry3evU?si=6P4TH3Jwx6iaYWfr" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'sw-04': [{name:'Driver Installation', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/Pw6xZuR_yE8?si=ZX5Mp7l6GEKgvonx" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'sw-05': [{name:'Antivirus Installation', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/05Gy9f8Wqvc?si=re6cHsKeBVelIZcO" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'sw-06': [{name:'Basic Windows Troubleshooting', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/JSte0MkHjNQ?si=wEFhxvPCVOomhld_" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],

  'prog-01': [{name:'HTML Basics', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/WSHTbyVbQMI?si=qNzMvEYvahJVS9Bt" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'prog-02': [{name:'CSS Basics', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/Z4pCqK-V_Wo?si=f4WPGY-JapLnUkgD" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'prog-03': [{name:'JavaScript Basics', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/xKOyDDuQSVY?si=oDQKI7tcNraFUHnH" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'prog-04': [{name:'Creating a Simple Website', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/9z8FP8ear2Y?si=Xj3dHnlCGv0oZbb7" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'prog-05': [{name:'Basic Programming Concepts', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/7XnAp8s25mI?si=CJr8KMoWgtHO-32P" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],

  'maint-01': [{name:'Preventive Computer Maintenance', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/ZYGND_SLqUQ?si=mfld4ZRklXFuSXcg" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'maint-02': [{name:'Proper Cable Management', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/zGPOT11y3qw?si=tUZJ5CSCyX3S0DTv" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'maint-03': [{name:'ESD Safety', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/rK9bqZgxOMs?si=Kt84M4q-TMyt2EJD" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'maint-05': [{name:'Data Backup', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/MIGVnyXm1mk?si=JfdyyL3W9vS8oe1E" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'maint-06': [{name:'Basic Troubleshooting Steps', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/HgeURynWn_w?si=Obk0cZ-TY2Qq0apf" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'maint-07': [{name:'Occupational Health and Safety', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/m5gxAICpKps?si=rmaDkAer-ZkunV8b" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],
  'maint-08': [{name:'5S', embed:'<iframe width="560" height="315" src="https://www.youtube.com/embed/5-Vx76AVLao?si=uv0UFeMmR2SCmyZE" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'}],

  'word-01': [], 'word-02': [], 'word-03': [], 'word-04': [], 'word-05': [],
  'word-06': [], 'word-07': [], 'word-08': [], 'word-09': [], 'word-10': [],
  'excel-01': [], 'excel-02': [], 'excel-03': [], 'excel-04': [], 'excel-05': [], 'excel-06': [],
  'ppt-01': [], 'ppt-02': [], 'ppt-03': [], 'ppt-04': [], 'ppt-05': [],
};

const SONG_LIBRARY = [
 
];

const sharedVideos = {};
LEAVES.forEach(l => { sharedVideos[l.id] = (VIDEO_LIBRARY[l.id] || []).map(v => ({ name:v.name, url:v.src || '', embed:v.embed || '' })); });
let sharedSongs = SONG_LIBRARY.map(s => ({ name:s.name, url:s.src }));

let returnStack = [];
let returningBack = false;

let currentCat = null;
let currentSection = null;
let playingIndex = null;
const audioEl = new Audio();

function stopMusic(){
  try{
    if(!audioEl.paused) audioEl.pause();
    if(playingIndex !== null){ playingIndex = null; renderSongList(); }
  }catch(e){}
}

const detailTitle = document.getElementById('detailTitle');
const detailCode = document.getElementById('detailCode');
const videoGrid = document.getElementById('videoGrid');
const videoInput = document.getElementById('videoInput');
const sideCatList = document.getElementById('sideCatList');
const todayGrid = document.getElementById('todayGrid');

let expandedSections = new Set();
const CHEVRON = '<path d="m9 18 6-6-6-6"/>';

function renderSidebar(){
  let html = '';
  SECTIONS.forEach(sec => {
    const isOpen = expandedSections.has(sec.id);
    html += `<div class="side-group toggle" data-toggle="${sec.id}">
      <span class="side-group-label"><svg class="side-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${sec.icon}</svg>${sec.name}</span>
      <svg class="side-chevron ${isOpen?'open':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CHEVRON}</svg>
    </div>`;
    html += `<div class="side-items ${isOpen?'open':''}" id="items-${sec.id}"><div class="side-items-inner">`;
    html += sec.items.map(it => `
      <div class="nav-row ${currentCat===it.id?'selected':''}" data-id="${it.id}">
        ${it.name}
      </div>
    `).join('');
    html += `</div></div>`;
  });
  sideCatList.innerHTML = html;
  sideCatList.querySelectorAll('.nav-row').forEach(el=>{
    el.addEventListener('click', ()=>{ openCategory(el.dataset.id, true); closeSidebar(); });
  });
  sideCatList.querySelectorAll('.side-group.toggle').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.toggle;
      if(expandedSections.has(id)) expandedSections.delete(id); else expandedSections.add(id);
      renderSidebar();
    });
  });
}

const feedArrowLeft = document.getElementById('feedArrowLeft');
const feedArrowRight = document.getElementById('feedArrowRight');
function scrollHomeFeed(dir){
  const feed = document.getElementById('homeFeed');
  if(!feed) return;
  feed.scrollBy({ left: dir * 250, behavior:'smooth' });
}
function updateFeedArrows(){
  const feed = document.getElementById('homeFeed');
  if(!feed || !feedArrowLeft || !feedArrowRight) return;
  const canScroll = feed.scrollWidth > feed.clientWidth + 2;
  feedArrowLeft.classList.toggle('hidden', !canScroll || feed.scrollLeft <= 2);
  feedArrowRight.classList.toggle('hidden', !canScroll || feed.scrollLeft + feed.clientWidth >= feed.scrollWidth - 2);
}
if(feedArrowLeft) feedArrowLeft.addEventListener('click', ()=> scrollHomeFeed(-1));
if(feedArrowRight) feedArrowRight.addEventListener('click', ()=> scrollHomeFeed(1));
document.getElementById('homeFeed') && document.getElementById('homeFeed').addEventListener('scroll', updateFeedArrows);

function youtubeIdFromEmbed(embed){
  const m = /youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/.exec(embed || '');
  return m ? m[1] : '';
}

function renderHomeFeed(){
  const feed = document.getElementById('homeFeed');
  if(!feed) return;
  const activity = ((getUserData() && getUserData().activity) || []).filter(a=>{
    if(a.type !== 'watch' || !a.id) return true;
    const lf = findLeaf(a.id);
    const sc = lf && findSection(lf.sectionId);
    return !(sc && sc.noVideos);
  });
  if(!activity.length){
    feed.innerHTML = `<div class="home-feed-empty">Nothing yet — topics you watch and things you search for will show up here.</div>`;
    feedArrowLeft && feedArrowLeft.classList.add('hidden');
    feedArrowRight && feedArrowRight.classList.add('hidden');
    return;
  }
  const WATCH_ICON = '<path d="M7 5v14l12-7z"/>';
  const SEARCH_ICON = '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>';
  feed.innerHTML = activity.slice(0,20).map((a,i)=>{
    let thumbHTML = '';
    let subText = a.type === 'watch' ? 'Watched' : 'Searched';
    if(a.type === 'watch' && a.id){
      const leaf = findLeaf(a.id);
      const sec = leaf && findSection(leaf.sectionId);
      const vids = sharedVideos[a.id] || [];

      let pick = vids[0] || null;
      let prog = null;
      for(const v of vids){
        const p = getVideoProgress(progressKey(a.id, v.url));
        if(p && p.time > 0){ pick = v; prog = p; break; }
      }
      let percent = 0;
      if(prog && prog.duration > 0) percent = Math.min(100, Math.max(0, Math.round((prog.time / prog.duration) * 100)));

      const ep = bestEmbedProgress(a.id);
      if(ep){
        percent = ep.duration > 0 ? Math.min(100, Math.max(0, Math.round((ep.time / ep.duration) * 100))) : 0;
        subText = percent >= 97 ? 'Watched • Finished' : 'Watched • ' + formatTime(ep.time) + ' / ' + formatTime(ep.duration);
      }

      const frameAt = prog && prog.time > 0 ? prog.time.toFixed(1) : '0.5';
      const ytId = (pick && pick.embed) ? youtubeIdFromEmbed(pick.embed) : '';
      const bgUrl = ytId
        ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
        : (sec && sec.img ? sec.img : '');
      const imgStyle = bgUrl ? `style="background-image:url('${bgUrl}')"` : '';
      const videoTag = (pick && pick.url && !pick.embed)
        ? `<video src="${pick.url}#t=${frameAt}" preload="metadata" muted playsinline tabindex="-1"></video>`
        : '';
      const progressHTML = ytId
        ? (ep ? `<span class="hr-progress-track"><span class="hr-progress-fill" style="width:${percent}%;background:#f00"></span></span>` : '')
        : `<span class="hr-progress-track"><span class="hr-progress-fill" style="width:${percent}%"></span></span>`;

      thumbHTML = `<span class="hr-thumb" ${imgStyle}>
        ${videoTag}
        ${progressHTML}
      </span>`;
    }
    return `
    <div class="home-row" data-i="${i}">
      <span class="hr-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.type==='watch'?WATCH_ICON:SEARCH_ICON}</svg></span>
      <span class="hr-main">
        <div class="hr-name">${a.name}</div>
        <div class="hr-sub">${subText}</div>
      </span>
      ${thumbHTML}
    </div>
  `;
  }).join('');
  feed.querySelectorAll('.home-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const a = activity[+row.dataset.i];
      if(!a) return;
      if(a.type === 'watch' && a.id){
        autoResume = true;
        openCategory(a.id);
        autoResume = false;
      }
      else runSearch(a.name);
    });
  });
  feed.scrollLeft = 0;
  updateFeedArrows();
}

const CARD_OPACITY = 0.6;

function renderTodayGrid(filterText){
  const q = (filterText||'').trim().toLowerCase();
  todayGrid.style.setProperty('--card-opacity', CARD_OPACITY);
  const cards = SECTIONS.filter(s => !s.hidden);
  const list = cards.filter(c => c.name.toLowerCase().includes(q) || (c.cardName||'').toLowerCase().includes(q));
  todayGrid.innerHTML = list.map(c => {
    const count = c.group
      ? SECTIONS.filter(s => s.group === c.group).reduce((a,s)=>a+s.items.length,0) + ' lessons • Word, Excel, PowerPoint'
      : (c.noVideos
          ? c.items.length + ' lessons • PDF'
          : c.items.reduce((a,it)=>a+sharedVideos[it.id].length,0) + ' videos • ' + c.items.length + ' topics');
    if(c.flip){
      const tips = (c.tips||[]).map(t => `<div class="fb-tip"><kbd>${t[0]}</kbd><span>${t[1]}</span></div>`).join('');
      return `
    <div class="today-card flip-card" data-id="${c.id}">
      <div class="flip-inner">
        <div class="flip-face flip-front">
          <div class="card-bg" style="background:${c.grad}"></div>
          ${c.img ? `<div class="card-art" style="background:url('${c.img}') center/cover no-repeat"></div>` : ''}
          <div class="card-content">
            <div class="card-eyebrow">${c.cardEyebrow || c.eyebrow}</div>
            <h3 class="card-headline">${c.cardName || c.name}</h3>
            <div class="card-count">${count}</div>
          </div>
        </div>
        <div class="flip-face flip-back">
          <div class="card-bg" style="background:${c.grad}"></div>
          <div class="fb-head"><strong>${c.cardName || c.pdfTitle}</strong><span>Word • Excel • PowerPoint</span></div>
          <div class="fb-tips">${tips}</div>
          <a class="fb-pdf" href="${c.pdf}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open Word PDF</a>
        </div>
      </div>
    </div>`;
    }
    return `
    <div class="today-card" data-id="${c.id}">
      <div class="card-bg" style="background:${c.grad}"></div>
          ${c.img ? `<div class="card-art" style="background:url('${c.img}') center/cover no-repeat"></div>` : ''}
      <div class="card-content">
        <div class="card-eyebrow">${c.cardEyebrow || c.eyebrow}</div>
        <h3 class="card-headline">${c.cardName || c.name}</h3>
        <div class="card-count">${count}</div>
      </div>
    </div>`;
  }).join('') || `<p style="color:var(--ink-soft);">No match for "${q}".</p>`;
  todayGrid.querySelectorAll('.today-card').forEach(el=>{
    el.addEventListener('click', ()=>{
      el.classList.add('pressed');
      setTimeout(()=> openSection(el.dataset.id), 220);
    });
  });
}

function renderOfficeSwitch(){
  const box = document.getElementById('officeSwitch');
  if(!box) return;
  const sec = findSection(currentSection);
  if(!sec || !sec.group){ box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'flex';
  box.innerHTML = SECTIONS.filter(s => s.group === sec.group).map(s =>
    `<button class="os-btn ${s.id===currentSection?'active':''}" data-id="${s.id}">${s.short}</button>`
  ).join('');
  box.querySelectorAll('.os-btn').forEach(b => {
    b.addEventListener('click', ()=>{ if(b.dataset.id !== currentSection) openSection(b.dataset.id); });
  });
}

function openSection(id){
  currentSection = id;
  const sec = findSection(id);
  document.getElementById('sectionTitle').textContent = sec.name;
  renderSectionGrid();
  renderOfficeSwitch();
  showView('sectionView');
}
function renderSectionGrid(){
  const sec = findSection(currentSection);
  const grid = document.getElementById('sectionGrid');
  grid.innerHTML = sec.items.map(it => {
    const n = sharedVideos[it.id].length;
    return `<div class="topic-row" data-id="${it.id}">
      <div>
        <div class="t-name">${it.name}</div>
        <div class="t-code">${it.code}</div>
      </div>
      <div class="t-count">${sec.noVideos ? 'PDF lesson' : n + ' video' + (n===1?'':'s')}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.topic-row').forEach(el=>{
    el.addEventListener('click', ()=> openCategory(el.dataset.id));
  });
}
document.getElementById('backBtnSection').addEventListener('click', ()=>showCategories());

function openCategory(id, fromSidebar){
  if(id === 'music'){ openMusicPopup(); return; }
  const c = findLeaf(id);
  if(!c) return;
  { const _sec = findSection(c.sectionId); if(!(_sec && _sec.noVideos)) stopMusic(); }

  if(fromSidebar && !returningBack && currentCat && currentCat !== id
     && document.getElementById('detailView').classList.contains('active')){
    returnStack.push({ id: currentCat, scroll: document.getElementById('frameScreen').scrollTop });
  }

  currentCat = id;
  currentSection = c.sectionId;
  const secForHistory = findSection(c.sectionId);
  if(!(secForHistory && secForHistory.noVideos)) pushActivity('watch', c.name, id);
  detailTitle.textContent = c.name;
  detailCode.textContent = c.code;
  videoGrid.setAttribute('data-section', c.sectionId);
  showView('detailView');
  renderSidebar();
  renderVideoGrid();
}
function showCategories(q){
  currentCat = null;
  currentSection = null;

  if(!(q && q.trim())){
    topSearch.value = '';
    searchSuggest.classList.remove('open');
    searchSuggest.innerHTML = '';
    updateSearchClearBtn();
  }

  if(q && q.trim()){
    const hist = getUserData().searchHistory;
    const clean = q.trim();
    const i = hist.indexOf(clean);
    if(i !== -1) hist.splice(i,1);
    hist.unshift(clean);
    if(hist.length > 12) hist.length = 12;
    pushActivity('search', clean);
  }
  showView('categoriesView');
  renderSidebar();
  renderTodayGrid(q||'');
  renderHomeFeed();
}
document.getElementById('backBtn').addEventListener('click', ()=>{
  if(returnStack.length){
    const prev = returnStack.pop();
    returningBack = true;
    openCategory(prev.id);
    returningBack = false;
    requestAnimationFrame(()=>{ document.getElementById('frameScreen').scrollTop = prev.scroll; });
    return;
  }
  if(currentSection) openSection(currentSection); else showCategories();
});
document.getElementById('homeNav').addEventListener('click', ()=>{ showCategories(); closeSidebar(); });
document.getElementById('todayNav').addEventListener('click', ()=>{ showCategories(); closeSidebar(); });

function renderVideoGrid(){
  saveAllWatchProgress();
  const list = sharedVideos[currentCat];
  videoGrid.classList.toggle('single-video', list.length === 1);
  let html = list.map((v,i)=>`
    <div class="slot">
      ${v.embed ? prepareEmbed(v.embed, currentCat, i) : `<video src="${v.url}" controls></video>`}
      <div class="slot-meta">
        <span class="fname">${v.name}</span>
        ${isDev() ? `<button data-i="${i}" class="remove-video">Remove</button>` : ''}
      </div>
    </div>
  `).join('');
  autoResume = false;
  if(isDev()){
    html += `
      <div class="slot-empty" id="addVideoSlot">
        <span class="plus">+</span>
        <span class="lbl">Add video</span>
      </div>
    `;
  } else if(!list.length){
    html = `<p style="color:var(--ink-soft);">No videos uploaded for this topic yet.</p>`;
  }
  const leafInfo = findLeaf(currentCat);
  const secInfo = leafInfo && findSection(leafInfo.sectionId);
  if(secInfo && secInfo.noVideos) html = '';
  if(secInfo && secInfo.pdf && leafInfo.tables){
    html += `
      <div class="slot pdf-slot">
        <div class="pdf-head">${secInfo.pdfTitle} — ${leafInfo.name}</div>
        ${leafInfo.tables.map(t => `
          <div class="lt-block">
            <div class="lt-title">${t.title}</div>
            <table class="lt-table">
              <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
              <tbody>${t.rows.map(r => `<tr><td><kbd>${r[0]}</kbd></td><td>${r[1]}</td></tr>`).join('')}</tbody>
            </table>
          </div>`).join('')}
        <div class="slot-meta">
          <span class="fname">${secInfo.pdfTitle}.pdf</span>
          <a class="pdf-open" href="${secInfo.pdf}" target="_blank" rel="noopener">Open full PDF</a>
        </div>
      </div>
    `;
  }
  if(secInfo && secInfo.pdf && leafInfo.page && !leafInfo.tables){
    const pdfUrl = `${secInfo.pdf}#page=${leafInfo.page}`;
    html += `
      <div class="slot pdf-slot">
        <div class="pdf-head">${secInfo.pdfTitle} — lesson notes</div>
        <iframe src="${pdfUrl}" title="${leafInfo.name}"></iframe>
        <div class="slot-meta">
          <span class="fname">${secInfo.pdfTitle}.pdf</span>
          <a class="pdf-open" href="${secInfo.pdf}" target="_blank" rel="noopener">Open full PDF</a>
        </div>
      </div>
    `;
  }
  videoGrid.innerHTML = html;
  attachEmbedPlayers(currentCat);

  const leafId = currentCat;
  videoGrid.querySelectorAll('.slot video').forEach((vidEl)=>{
    const v = list.find(x => !x.embed && x.url === vidEl.getAttribute('src'));
    if(!v) return;
    const key = progressKey(leafId, v.url);
    vidEl.addEventListener('loadedmetadata', ()=>{
      const prog = getVideoProgress(key);
      if(prog && prog.time > 2 && prog.duration > 0 && prog.time < prog.duration - 3){
        vidEl.currentTime = prog.time;
      }
    });
    let lastSave = 0;
    vidEl.addEventListener('timeupdate', ()=>{
      const now = Date.now();
      if(now - lastSave > 2000 && vidEl.duration){
        lastSave = now;
        saveVideoProgress(key, vidEl.currentTime, vidEl.duration);
      }
    });
    vidEl.addEventListener('pause', ()=>{
      if(vidEl.duration) saveVideoProgress(key, vidEl.currentTime, vidEl.duration);
    });
  });

  if(isDev()){
    const addSlot = document.getElementById('addVideoSlot');
    if(addSlot) addSlot.addEventListener('click', ()=> videoInput.click());
    videoGrid.querySelectorAll('.remove-video').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const i = +btn.dataset.i;
        if(list[i].url) URL.revokeObjectURL(list[i].url);
        list.splice(i,1);
        renderVideoGrid();
        renderSectionGrid();
      });
    });
  }
}

function triggerDownload(file, filename){
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 4000);
}
function showSaveHelper(kind, codeText){
  const label = kind === 'video' ? 'video' : 'song';
  const folder = kind === 'video' ? 'videos/' : 'songs/';
  const libraryName = kind === 'video' ? 'VIDEO_LIBRARY' : 'SONG_LIBRARY';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;max-width:520px;width:100%;padding:22px 24px;font-family:inherit;box-shadow:0 20px 50px rgba(0,0,0,.3);';
  box.innerHTML = `
    <h3 style="margin:0 0 10px;font-size:1.05rem;">The ${label} was downloaded. To make it permanent:</h3>
    <p style="font-size:.83rem;color:#6E6E73;margin:0 0 12px;line-height:1.6;">
      1. Move the downloaded file into your <b>${folder}</b> folder (next to the HTML file).<br>
      2. Paste this code inside <b>${libraryName}</b> in script.js:
    </p>
    <textarea readonly style="width:100%;min-height:110px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem;padding:10px;border:1px solid #ddd;border-radius:9px;resize:vertical;box-sizing:border-box;">${codeText}</textarea>
    <p style="font-size:.76rem;color:#6E6E73;margin:10px 0 0;">3. Save the file and refresh. It is now permanent.</p>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
      <button id="saveHelperCopy" style="background:#0071E3;color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:.82rem;font-weight:700;cursor:pointer;">Copy code</button>
      <button id="saveHelperClose" style="background:#F1F1F3;border:none;border-radius:10px;padding:9px 16px;font-size:.82rem;font-weight:700;cursor:pointer;">Close</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  box.querySelector('#saveHelperCopy').addEventListener('click', ()=>{
    navigator.clipboard.writeText(codeText).then(()=> showToast('Code copied!'));
  });
  box.querySelector('#saveHelperClose').addEventListener('click', ()=> overlay.remove());
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
}

videoInput.addEventListener('change', ()=>{
  const f = videoInput.files[0];
  if(!f || !isDev()) return;
  sharedVideos[currentCat].push({ name:f.name, url:URL.createObjectURL(f), embed:'' });
  videoInput.value = '';
  renderVideoGrid();

  triggerDownload(f, f.name);
  const titleGuess = f.name.replace(/\.[^.]+$/, '');
  const code = `  { name:'${titleGuess}', src:'videos/${f.name}' },`;
  showSaveHelper('video', code);
});

const topSearch = document.getElementById('topSearch');
const searchSuggest = document.getElementById('searchSuggest');
const CLOCK_ICON = '<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/>';
const SEARCH_ICON = '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>';

function runSearch(q){
  showCategories(q);
  searchSuggest.classList.remove('open');
  updateSearchClearBtn();
}
function pickLeaf(leaf){
  topSearch.value = leaf.name;
  openCategory(leaf.id, true);
  searchSuggest.classList.remove('open');
  updateSearchClearBtn();
}
function renderSuggestions(){
  const q = topSearch.value.trim().toLowerCase();
  if(!q){ searchSuggest.classList.remove('open'); searchSuggest.innerHTML=''; return; }
  const hist = (getUserData() ? getUserData().searchHistory : []) || [];
  const histMatches = hist.filter(h => h.toLowerCase().includes(q)).slice(0,5);
  const usedNames = new Set(histMatches.map(h=>h.toLowerCase()));
  const leafMatches = LEAVES.filter(l => l.name.toLowerCase().includes(q) && !usedNames.has(l.name.toLowerCase())).slice(0,8);
  if(!histMatches.length && !leafMatches.length){ searchSuggest.classList.remove('open'); searchSuggest.innerHTML=''; return; }
  let html = '';
  histMatches.forEach(h => {
    html += `<div class="suggest-item" data-hist="${h.replace(/"/g,'&quot;')}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CLOCK_ICON}</svg>
      <span>${h}</span>
    </div>`;
  });
  leafMatches.forEach(l => {
    html += `<div class="suggest-item" data-leaf="${l.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SEARCH_ICON}</svg>
      <span>${l.name}</span>
    </div>`;
  });
  searchSuggest.innerHTML = html;
  searchSuggest.classList.add('open');
  searchSuggest.querySelectorAll('[data-hist]').forEach(el=>{
    el.addEventListener('click', ()=>{ topSearch.value = el.dataset.hist; runSearch(el.dataset.hist); });
  });
  searchSuggest.querySelectorAll('[data-leaf]').forEach(el=>{
    el.addEventListener('click', ()=> pickLeaf(findLeaf(el.dataset.leaf)));
  });
}
const topSearchClear = document.getElementById('topSearchClear');
function updateSearchClearBtn(){
  topSearchClear.style.display = topSearch.value ? 'flex' : 'none';
}
topSearch.addEventListener('input', ()=>{
  if(document.getElementById('categoriesView').classList.contains('active')){
    renderTodayGrid(topSearch.value);
  }
  renderSuggestions();
  updateSearchClearBtn();
});
topSearch.addEventListener('focus', renderSuggestions);
topSearch.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') runSearch(topSearch.value); });
document.getElementById('topSearchBtn').addEventListener('click', ()=> runSearch(topSearch.value));
topSearchClear.addEventListener('click', ()=>{
  topSearch.value = '';
  updateSearchClearBtn();
  renderSuggestions();
  if(document.getElementById('categoriesView').classList.contains('active')) renderTodayGrid('');
  topSearch.focus();
});
document.addEventListener('click', (e)=>{
  if(!topSearch.contains(e.target) && !searchSuggest.contains(e.target)) searchSuggest.classList.remove('open');
});

const addSongBtn = document.getElementById('addSongBtn');
const songInput = document.getElementById('songInput');
const songList = document.getElementById('songList');
const songSearch = document.getElementById('songSearch');

addSongBtn.addEventListener('click', ()=>{ if(isDev()) songInput.click(); });
songInput.addEventListener('change', ()=>{
  if(!isDev()) return;
  const codeLines = [];
  Array.from(songInput.files).forEach(f=>{
    sharedSongs.push({ name:f.name, url:URL.createObjectURL(f) });
    triggerDownload(f, f.name);
    const titleGuess = f.name.replace(/\.[^.]+$/, '');
    codeLines.push(`  { name:'${titleGuess}', src:'songs/${f.name}' },`);
  });
  songInput.value = '';
  renderSongList();
  if(codeLines.length) showSaveHelper('song', codeLines.join('\n'));
});
songSearch.addEventListener('input', renderSongList);
songSearch.addEventListener('click', (e)=> e.stopPropagation());
addSongBtn.addEventListener('click', (e)=> e.stopPropagation());

function renderSongList(){
  addSongBtn.style.display = isDev() ? 'inline-flex' : 'none';
  const songs = sharedSongs;
  const q = songSearch.value.trim().toLowerCase();
  const filtered = songs.map((s,i)=>({...s, i})).filter(s => s.name.toLowerCase().includes(q));
  if(!songs.length){ songList.innerHTML = `<div class="song-empty">${isDev() ? 'No songs yet. Tap + Add song to attach local audio files.' : 'No songs added yet.'}</div>`; return; }
  if(!filtered.length){ songList.innerHTML = `<div class="song-empty">No match for "${q}".</div>`; return; }
  songList.innerHTML = filtered.map(s => `
    <div class="song-row ${playingIndex===s.i?'playing':''}" data-i="${s.i}">
      <span class="play-dot">
        ${playingIndex===s.i
          ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>'}
      </span>
      <span class="song-info">
        <div class="song-name">${s.name}</div>
        <div class="song-status">${playingIndex===s.i ? 'Playing' : 'Tap to play'}</div>
      </span>
      ${isDev() ? `<button data-remove="${s.i}" class="remove-song" style="background:none;border:none;color:var(--ink-soft);cursor:pointer;font-size:.75rem;">Remove</button>` : ''}
    </div>
  `).join('');
  songList.querySelectorAll('.song-row').forEach(row=>{
    row.addEventListener('click', (e)=>{
      if(e.target.closest('.remove-song')) return;
      toggleSong(+row.dataset.i);
    });
  });
  if(isDev()){
    songList.querySelectorAll('.remove-song').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const i = +btn.dataset.remove;
        if(playingIndex===i){ audioEl.pause(); playingIndex=null; }
        else if(playingIndex!==null && playingIndex>i){ playingIndex--; }
        URL.revokeObjectURL(sharedSongs[i].url);
        sharedSongs.splice(i,1);
        renderSongList();
      });
    });
  }
}
function toggleSong(i){
  if(playingIndex === i){ audioEl.pause(); playingIndex = null; }
  else { audioEl.src = sharedSongs[i].url; audioEl.play(); playingIndex = i; }
  renderSongList();
}
audioEl.addEventListener('ended', ()=>{ playingIndex = null; renderSongList(); });

function pauseMusicForVideo(e){
  if(e.target && e.target.tagName === 'VIDEO' && !audioEl.paused){
    audioEl.pause();
    playingIndex = null;
    renderSongList();
  }
}
document.addEventListener('play', pauseMusicForVideo, true);
document.addEventListener('playing', pauseMusicForVideo, true);

document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('backBtnSettings').addEventListener('click', ()=> showView(lastMainView));
document.getElementById('backBtnAbout').addEventListener('click', ()=> showView(lastMainView));
document.querySelectorAll('.about-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.about-tab').forEach(t=>t.classList.toggle('active', t===tab));
    const map = {products:'aboutProducts', company:'aboutCompany', news:'aboutNews'};
    document.querySelectorAll('.about-panel').forEach(p=>{
      p.classList.toggle('active', p.id === map[tab.dataset.tab]);
    });
  });
});
function openSettings(){
  showView('settingsView');
}
document.querySelectorAll('.gs-row[data-row]').forEach(row=>{
  row.querySelector('.gs-row-head').addEventListener('click', ()=>{
    row.classList.toggle('open');
  });
});

const BG_IMAGES = [
  'assets/bg-photo-1.jpg',
  'assets/bg-photo-2.jpg',
  'assets/bg-photo-3.jpg',
  'assets/bg-photo-4.jpg',
  'assets/bg-photo-5.jpg',
  'assets/bg-photo-6.jpg',
];
const BG_INTERVAL = 6000;
let bgIndex = 0;
let bgShowingA = true;
let bgTimer = null;
let bgHideTimer = null;
const bgSlideA = document.getElementById('catBgSlideA');
const bgSlideB = document.getElementById('catBgSlideB');
const bgProgressFill = document.getElementById('bgProgressFill');

function resetBgProgress(){
  if(!bgProgressFill) return;
  bgProgressFill.style.transition = 'none';
  bgProgressFill.style.width = '0%';
  void bgProgressFill.offsetWidth;
  bgProgressFill.style.transition = `width ${BG_INTERVAL}ms linear`;
  bgProgressFill.style.width = '100%';
}

function goToBg(i){
  if(!BG_IMAGES.length) return;
  bgIndex = (i + BG_IMAGES.length) % BG_IMAGES.length;
  const img = BG_IMAGES[bgIndex];
  const nextEl = bgShowingA ? bgSlideB : bgSlideA;
  const curEl = bgShowingA ? bgSlideA : bgSlideB;
  nextEl.style.backgroundImage = `url('${img}')`;
  nextEl.style.zIndex = 2;
  curEl.style.zIndex = 1;
  void nextEl.offsetWidth;
  nextEl.classList.add('active');
  clearTimeout(bgHideTimer);
  bgHideTimer = setTimeout(()=> curEl.classList.remove('active'), 1200);
  bgShowingA = !bgShowingA;
}
function startBgAuto(){
  clearInterval(bgTimer);
  resetBgProgress();
  bgTimer = setInterval(()=>{ goToBg(bgIndex + 1); resetBgProgress(); }, BG_INTERVAL);
}
if(bgSlideA && bgSlideB && BG_IMAGES.length){
  bgSlideA.style.backgroundImage = `url('${BG_IMAGES[0]}')`;
  document.getElementById('bgArrowLeft').addEventListener('click', ()=>{ goToBg(bgIndex - 1); startBgAuto(); });
  document.getElementById('bgArrowRight').addEventListener('click', ()=>{ goToBg(bgIndex + 1); startBgAuto(); });
  startBgAuto();
}

const FLIP_INTERVAL = 6000;
setInterval(()=>{
  const card = document.querySelector('.flip-card');
  const home = document.getElementById('categoriesView');
  if(!card || !home || !home.classList.contains('active')) return;
  if(card.matches(':hover')) return;
  card.classList.toggle('flipped');
}, FLIP_INTERVAL);

logInAs('Guest');

(function () {
  var EXT = 'svg';
  var COUNT = 6;
  var CARDS = 12;
  var AUTO_SPEED = 0.06;

  var KEYS = {
    'Hardware': 'hw',
    'Networking': 'net',
    'Software': 'sw',
    'Programming': 'prog',
    'IT Maintenance & Safety': 'maint',
    'Microsoft Word': 'word',
    'Microsoft Excel': 'word',
    'Microsoft PowerPoint': 'word'
  };

  function ph() {
    var a = [];
    for (var i = 1; i <= 6; i++) a.push({ name: 'Name ' + i, desc: 'Description ' + i });
    return a;
  }
  var INFO = {
    hw: [
      { name: 'Processor (CPU)',     desc: 'The brain of the computer. It carries out instructions and does the calculations.' },
      { name: 'Memory (RAM)',        desc: 'Temporary memory that holds the data and programs currently in use. It is cleared when the power is off.' },
      { name: 'Cooling Fan',         desc: 'A cooling fan prevents overheating by circulating air and keeping computer components cool.' },
      { name: 'Motherboard',         desc: 'The main circuit board that connects the CPU, RAM, storage, and all other components.' },
      { name: 'Power Supply',        desc: 'Converts power from the wall outlet into the voltages the computer parts need.' },
      { name: 'Storage Drive',       desc: 'Stores your files, programs, and the operating system permanently.' }
    ],
    net: [
      { name: 'Router',               desc: 'Connects your network to the internet and directs data between devices. It also assigns IP addresses to connected devices.' },
      { name: 'Network Switch',       desc: 'Connects multiple wired devices in a local network and sends data only to the device that needs it.' },
      { name: 'Ethernet Cable',       desc: 'A twisted-pair cable (UTP) that carries network data between computers, switches, and routers.' },
      { name: 'RJ45 Connector',       desc: 'The plug at the end of an Ethernet cable. Wires are arranged in the T568A or T568B order and crimped into it.' },
      { name: 'Modem',                desc: 'Converts the signal from your internet provider into data your router and devices can use.' },
      { name: 'Wireless Access Point', desc: 'Provides Wi-Fi so laptops, phones, and other devices can join the network without cables.' }
    ],
    sw: [
      { name: 'Operating System',     desc: 'The main software that manages the hardware and lets you run programs. Windows is a common example.' },
      { name: 'Bootable USB',         desc: 'A flash drive prepared with an installer so a computer can start from it and install or repair an operating system.' },
      { name: 'Application Software', desc: 'Programs you use for tasks such as writing documents, browsing the web, or editing photos.' },
      { name: 'Device Driver',        desc: 'Small software that lets the operating system communicate with hardware such as the printer, graphics card, or sound card.' },
      { name: 'Antivirus',            desc: 'Protects the computer by detecting, blocking, and removing viruses and other malware.' },
      { name: 'Windows Troubleshooting', desc: 'Tools and steps used to find and fix common problems such as slow performance, errors, and startup failures.' }
    ],
    prog: [
      { name: 'HTML',                 desc: 'The markup language that builds the structure and content of a web page: headings, paragraphs, images, and links.' },
      { name: 'CSS',                  desc: 'Controls how a web page looks, including colors, fonts, spacing, and layout.' },
      { name: 'JavaScript',           desc: 'Adds behavior to a web page, such as buttons that respond, menus, and interactive features.' },
      { name: 'Code Editor',          desc: 'A program for writing and editing code. It helps with color-coded syntax, suggestions, and finding mistakes.' },
      { name: 'Programming Concepts', desc: 'Basic building blocks of code: variables, conditions, loops, and functions.' },
      { name: 'Website',              desc: 'The finished result: HTML, CSS, and JavaScript working together and shown in a web browser.' }
    ],
    maint: [
      { name: 'Preventive Maintenance', desc: 'Regular cleaning and checking of the computer, such as removing dust, to prevent overheating and breakdowns.' },
      { name: 'Cable Management',     desc: 'Organizing and securing cables so they are tidy, safe to walk around, and do not block airflow.' },
      { name: 'ESD Safety',           desc: 'Static electricity can damage components. Use an anti-static wrist strap and mat when handling parts.' },
      { name: 'Data Backup',          desc: 'Keeping extra copies of your files on another drive or in the cloud so you can recover them if something fails.' },
      { name: 'Occupational Health and Safety', desc: 'Safe work practices that protect you from injury, such as proper posture, safe tools, and electrical safety.' },
      { name: '5S',                   desc: 'A workplace method: Sort, Set in order, Shine, Standardize, and Sustain. It keeps the work area clean and efficient.' }
    ],
    word: ph()
  };

  var view   = document.getElementById('sectionView');
  var title  = document.getElementById('sectionTitle');
  var block  = document.getElementById('ringBlock');
  var wrap   = document.getElementById('ringWrap');
  var ring   = document.getElementById('ring');
  var frame  = document.getElementById('frameScreen');
  var deviceFrame = document.getElementById('deviceFrame');
  if (!view || !title || !block || !wrap || !ring) return;

  var cards = [], current = null;
  var W = 1000, H = 400, CW = 130, CH = 170;
  var rot = 0, target = 0, dragging = false, dragX = 0, dragT = 0, downX = 0, downY = 0;
  var RAD = Math.PI / 180, SLOT = 360 / CARDS;

  function rng(seed) { var s = seed * 9301 + 49297; return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  function build(key) {
    ring.innerHTML = ''; cards = [];
    var order = [];
    for (var i = 0; i < CARDS; i++) order.push(((i < COUNT ? i : i + 3) % COUNT) + 1);
    for (var j = 0; j < CARDS; j++) {
      var el = document.createElement('div');
      el.className = 'ring-card';
      el.dataset.key = key;
      el.dataset.n = order[j];
      var art = document.createElement('div');
      art.className = 'ring-art';
      art.style.backgroundImage = "url('assets/ring/" + key + '-' + order[j] + '.' + EXT + "')";
      el.appendChild(art);
      ring.appendChild(el);
      var r = rng(j + 40);
      cards.push({ el: el, art: art, a: j * SLOT, y: (r() - .5) * .16, s: .86 + r() * .26, tilt: (r() - .5) * 8 });
    }
    size();
  }

  function size() {
    var b = wrap.getBoundingClientRect();
    W = b.width || 1000; H = b.height || 400;
    CH = Math.max(110, Math.min(H * 0.36, W * 0.22, 240));
    CW = CH * 0.77;
    cards.forEach(function (c) {
      c.el.style.width = CW + 'px'; c.el.style.height = CH + 'px';
      c.el.style.marginLeft = (-CW / 2) + 'px'; c.el.style.marginTop = (-CH / 2) + 'px';
    });
  }
  window.addEventListener('resize', size);

  function sync() {
    if (!view.classList.contains('active')) return;
    var key = KEYS[(title.textContent || '').trim()];
    if (key && key !== current) { current = key; build(key); }
  }
  new MutationObserver(sync).observe(title, { childList: true, characterData: true, subtree: true });
  new MutationObserver(sync).observe(view, { attributes: true, attributeFilter: ['class'] });

  if (!document.getElementById('ringInfoCss')) {
    var cs = document.createElement('style');
    cs.id = 'ringInfoCss';
    cs.textContent = [
      '.ring-card{cursor:pointer;}',
      '.ring-info{position:absolute;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
      '.ring-info.open{display:flex;animation:popIn .18s ease;}',
      '.ring-info-box{position:relative;width:100%;max-width:380px;background:#fff;border:1px solid var(--line);border-radius:22px;padding:22px 22px 24px;text-align:center;box-shadow:0 20px 50px rgba(30,50,120,.25);}',
      '.ring-info-img{width:100%;aspect-ratio:1/1;max-height:260px;margin:0 auto 14px;border-radius:14px;background-color:#F1F4F9;background-size:contain;background-position:center;background-repeat:no-repeat;}',
      '.ring-info-name{margin:0 0 6px;font-size:1.25rem;font-weight:800;color:var(--ink);}',
      '.ring-info-desc{margin:0;font-size:.9rem;line-height:1.55;color:var(--ink-soft);}',
      '.ring-info-x{position:absolute;top:10px;right:10px;width:32px;height:32px;border:none;border-radius:50%;background:var(--pill-bg);color:var(--ink);font-size:1.1rem;line-height:1;cursor:pointer;}',
      '.ring-info-x:hover{background:var(--active-bg);}',
      'body[data-theme="dark"] .ring-info-img{filter:invert(1) hue-rotate(180deg);}',
      'body[data-theme="dim"] .ring-info-img{filter:contrast(1.1765) invert(1) hue-rotate(180deg);}'
    ].join('\n');
    document.head.appendChild(cs);
  }

  var info = document.createElement('div');
  info.className = 'ring-info';
  info.innerHTML =
    '<div class="ring-info-box">' +
      '<button class="ring-info-x" type="button" aria-label="Close">&times;</button>' +
      '<div class="ring-info-img"></div>' +
      '<h3 class="ring-info-name"></h3>' +
      '<p class="ring-info-desc"></p>' +
    '</div>';
  (deviceFrame || document.body).appendChild(info);

  function openInfo(cardEl) {
    var key = cardEl.dataset.key, n = +cardEl.dataset.n;
    var d = (INFO[key] && INFO[key][n - 1]) || { name: (title.textContent || '').trim() + ' ' + n, desc: '' };
    info.querySelector('.ring-info-img').style.backgroundImage = "url('assets/ring/" + key + '-' + n + '.' + EXT + "')";
    info.querySelector('.ring-info-name').textContent = d.name;
    info.querySelector('.ring-info-desc').textContent = d.desc;
    info.classList.add('open');
  }
  function closeInfo() { info.classList.remove('open'); }

  info.addEventListener('click', function (e) { if (e.target === info) closeInfo(); });
  info.querySelector('.ring-info-x').addEventListener('click', closeInfo);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeInfo(); });
  new MutationObserver(function () {
    if (!view.classList.contains('active')) closeInfo();
  }).observe(view, { attributes: true, attributeFilter: ['class'] });

  function pagePuwedeMagScroll() { return frame && frame.scrollHeight > frame.clientHeight + 2; }

  block.addEventListener('wheel', function (e) {
    if (pagePuwedeMagScroll()) return;
    e.preventDefault();
    target += Math.max(-120, Math.min(120, e.deltaY + e.deltaX)) * 0.15;
  }, { passive: false });

  block.addEventListener('pointerdown', function (e) {
    dragging = true; dragX = e.clientX; dragT = target;
    downX = e.clientX; downY = e.clientY;
    block.classList.add('dragging');
    try { block.setPointerCapture(e.pointerId); } catch (_) {}
  });
  block.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    target = dragT - (e.clientX - dragX) * 0.3;
  });
  function endDrag() { dragging = false; block.classList.remove('dragging'); }
  block.addEventListener('pointerup', function (e) {
    var moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    endDrag();
    if (moved < 6) {
      var els = document.elementsFromPoint(e.clientX, e.clientY);
      for (var i = 0; i < els.length; i++) {
        if (els[i].classList && els[i].classList.contains('ring-card')) { openInfo(els[i]); break; }
      }
    }
  });
  block.addEventListener('pointercancel', endDrag);

  function frameLoop() {
    if (view.classList.contains('active') && cards.length) {
      if (!dragging && !info.classList.contains('open')) target += AUTO_SPEED;
      rot += (target - rot) * 0.08;
      var Rx = W * 0.46, Ry = H * 0.30, Rz = Math.min(W, H) * 0.5;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var th = (c.a - rot) * RAD;
        var depth = Math.cos(th);
        var x = Math.sin(th) * Rx;
        var y = depth * Ry + c.y * H * 0.3;
        var z = depth * Rz;
        c.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,' + z + 'px) rotateY(' + (th / RAD * 0.45) + 'deg) rotateZ(' + c.tilt + 'deg) scale(' + c.s + ')';
        var far = (1 - depth) / 2;
        c.el.style.opacity = (1 - far * 0.55).toFixed(3);
        c.art.style.setProperty('--blur', (far * far * 2.6).toFixed(2) + 'px');
      }
    }
    requestAnimationFrame(frameLoop);
  }
  frameLoop();
  sync();
})();

(function(){
  var frame = document.getElementById('deviceFrame');
  var sb = document.getElementById('sidebar');
  var bd = document.getElementById('sidebarBackdrop');
  if(!frame) return;

  if(!document.getElementById('teamYeyCss')){
    var st = document.createElement('style');
    st.id = 'teamYeyCss';
    st.textContent = [
      '.copyright-mark{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:.75rem;font-weight:400;color:#fff;letter-spacing:.01em;white-space:nowrap;background:rgba(0,0,0,.45);padding:5px 16px;border-radius:999px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);text-shadow:0 1px 4px rgba(0,0,0,.55);user-select:none;-webkit-user-select:none;}',
      'body[data-theme="dark"] .copyright-mark{filter:invert(1) hue-rotate(180deg);}',
      'body[data-theme="dim"] .copyright-mark{filter:contrast(1.1765) invert(1) hue-rotate(180deg);}',
      '.device-frame[data-device="watch"] .copyright-mark{font-size:.5rem;padding:3px 8px;}',
      '@media(max-width:640px){.device-frame > .sidebar{position:absolute;width:100%;}.device-frame > .sidebar-backdrop{position:absolute;}}',
      '.lt-block{margin:6px 2px 16px;}',
      '.lt-title{font-size:.9rem;font-weight:800;margin:0 0 8px;color:var(--ink);}',
      '.lt-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:.82rem;}',
      '.lt-table th{background:var(--blue);color:#fff;text-align:left;padding:9px 14px;font-size:.76rem;letter-spacing:.02em;}',
      '.lt-table td{padding:9px 14px;border-top:1px solid var(--line);color:var(--ink);}',
      '.lt-table tr:nth-child(even) td{background:var(--pill-bg);}',
      '.lt-table td:first-child{width:42%;}',
      '.lt-table kbd{background:#fff;border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:2px 7px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.76rem;font-weight:700;white-space:nowrap;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  if(sb && bd){ frame.appendChild(bd); frame.appendChild(sb); }

  var _showView = showView;
  showView = function(id){ closeSidebar(); _showView(id); };

  var TEXT  = 'Copyright \u2022 2026 TEAM YEY';
  var STYLE = 'position:absolute!important;left:50%!important;bottom:10px!important;' +
              'transform:translateX(-50%)!important;z-index:2147483647!important;' +
              'display:block!important;visibility:visible!important;opacity:1!important;' +
              'pointer-events:none!important;';
  var elObs = new MutationObserver(ensure);

  function ensure(){
    var el = document.getElementById('teamYeyCopyright');
    var home = document.getElementById('categoriesView');
    if(!home || !home.classList.contains('active')){
      if(el){ elObs.disconnect(); el.remove(); }
      return;
    }
    if(!el || el.parentNode !== frame){
      if(el) el.remove();
      el = document.createElement('div');
      el.id = 'teamYeyCopyright';
      frame.appendChild(el);
    }
    if(el.className !== 'copyright-mark') el.className = 'copyright-mark';
    if(el.textContent !== TEXT) el.textContent = TEXT;
    if(el.getAttribute('style') !== STYLE) el.setAttribute('style', STYLE);
    if(!document.getElementById('teamYeyCss') && st0) document.head.appendChild(st0);
    elObs.disconnect();
    elObs.observe(el, { attributes:true, childList:true, characterData:true, subtree:true });
  }
  var st0 = document.getElementById('teamYeyCss');
  ensure();
  var homeEl = document.getElementById('categoriesView');
  if(homeEl) new MutationObserver(ensure).observe(homeEl, { attributes:true, attributeFilter:['class'] });
  new MutationObserver(ensure).observe(frame, { childList:true });
  setInterval(ensure, 500);
})();

(function(){
  var DEVELOPERS = [
    { name:'Jake A. Ravano',         role:'Developer', photo:'assets/devs/jake.jpg', pos:'45%',     gmail:'jakeravano6@gmail.com', facebook:'https://www.facebook.com/jakeravano09' },
    { name:'Khea W. Sta. Maria',     role:'UI Designer', photo:'assets/devs/khea.jpg', pos:'15%',     gmail:'stamariakhea@gmail.com', facebook:'https://www.facebook.com/stamariakhea' },
    { name:'Diane M. Villanueva',    role:'Content Researcher', photo:'assets/devs/diane.jpg', pos:'20%',    gmail:'dianevillanueva135@gmail.com', facebook:'https://www.facebook.com/DianeMorenoVillanueva18' },
    { name:'Cecilio D. Caponpon Jr.',role:'Tester and Developer Support', photo:'assets/devs/caponpon.jpg', pos:'15%', gmail:'ceciliocaponpon01@gmail.com', facebook:'https://www.facebook.com/share/1GnykFHhZA/' },
    { name:'Jewel C. Cejo',          role:'Content Researcher', photo:'assets/devs/jewel.jpg', pos:'15%',    gmail:'jewelccejo@slsu.edu.ph', facebook:'https://www.facebook.com/share/16GHN2kM6mW/' }
  ];

  var GMAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3" stroke="#EA4335"/><path d="m3 7 9 6.5L21 7" stroke="#EA4335"/></svg>';
  var FB_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path d="M13.4 21v-7h2.4l.4-2.8h-2.8V9.5c0-.8.3-1.4 1.4-1.4h1.5V5.6c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.6v2.1H8.2V14h2.4v7z" fill="#fff"/></svg>';

  var btn    = document.getElementById('devToggleBtn');
  var panel  = document.getElementById('devPanel');
  var arches = document.getElementById('devArches');
  if(!btn || !panel || !arches) return;

  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function initials(n){ return n.replace(/\./g,'').split(/\s+/).filter(function(w){ return /^[A-Za-z]/.test(w) && w !== 'Jr'; }).slice(0,2).map(function(w){ return w[0].toUpperCase(); }).join(''); }

  var TOL = 42, STEP = 14, HALO = 75;

  function dist(d, i, r){
    return Math.max(Math.abs(d[i] - r[0]), Math.abs(d[i+1] - r[1]), Math.abs(d[i+2] - r[2]));
  }
  function avg(d, w, x0, y0, bw, bh){
    var r = 0, g = 0, b = 0, c = 0;
    for(var y = y0; y < y0 + bh; y++){
      for(var x = x0; x < x0 + bw; x++){
        var i = (y * w + x) * 4;
        r += d[i]; g += d[i+1]; b += d[i+2]; c++;
      }
    }
    return [r / c, g / c, b / c];
  }
  function removeBackground(d, w, h){
    var n = w * h;
    var bs = Math.max(4, Math.round(Math.min(w, h) * 0.04));
    var my = Math.round(h / 2);
    var refs = [avg(d, w, 0, 0, bs, bs), avg(d, w, w - bs, 0, bs, bs), avg(d, w, 0, my, bs, bs), avg(d, w, w - bs, my, bs, bs)];
    function near(i, tol){
      for(var k = 0; k < refs.length; k++){ if(dist(d, i, refs[k]) <= tol) return true; }
      return false;
    }
    var bg = new Uint8Array(n), q = new Int32Array(n), qh = 0, qt = 0;
    function seed(p){ if(!bg[p] && near(p * 4, TOL)){ bg[p] = 1; q[qt++] = p; } }
    var x, y;
    for(x = 0; x < w; x++){ seed(x); }
    for(y = 0; y < h; y++){ seed(y * w); seed(y * w + w - 1); }
    function step(p, nx, ny){
      if(nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      var ni = ny * w + nx;
      if(bg[ni]) return;
      var a = p * 4, b = ni * 4;
      if(!near(b, TOL)) return;
      if(Math.max(Math.abs(d[a] - d[b]), Math.abs(d[a+1] - d[b+1]), Math.abs(d[a+2] - d[b+2])) > STEP) return;
      bg[ni] = 1; q[qt++] = ni;
    }
    while(qh < qt){
      var p = q[qh++];
      x = p % w; y = (p - x) / w;
      step(p, x - 1, y); step(p, x + 1, y); step(p, x, y - 1); step(p, x, y + 1);
    }
    function edge(p){
      var px = p % w, py = (p - px) / w;
      return (px > 0 && bg[p - 1]) || (px < w - 1 && bg[p + 1]) || (py > 0 && bg[p - w]) || (py < h - 1 && bg[p + w]);
    }
    for(var pass = 0; pass < 2; pass++){
      var add = [];
      for(var p2 = 0; p2 < n; p2++){
        if(!bg[p2] && edge(p2) && near(p2 * 4, HALO)) add.push(p2);
      }
      for(var k = 0; k < add.length; k++) bg[add[k]] = 1;
    }
    var removed = 0, cols = new Int32Array(w), rows = new Int32Array(h);
    for(var p3 = 0; p3 < n; p3++){
      var px = p3 % w, py = (p3 - px) / w;
      if(bg[p3]){ d[p3 * 4 + 3] = 0; removed++; }
      else {
        d[p3 * 4 + 3] = edge(p3) ? 170 : 255;
        cols[px]++; rows[py]++;
      }
    }
    var frac = removed / n;
    if(frac < 0.04 || frac > 0.85) return null;
    var minC = Math.max(3, Math.round(w * 0.01)), minR = Math.max(3, Math.round(h * 0.01));
    var x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1;
    while(x0 < w && cols[x0] < minR) x0++;
    while(x1 > x0 && cols[x1] < minR) x1--;
    while(y0 < h && rows[y0] < minC) y0++;
    while(y1 > y0 && rows[y1] < minC) y1--;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function cutout(img){
    var S = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.round(img.naturalWidth * S), h = Math.round(img.naturalHeight * S);
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, w, h);
    var id = cx.getImageData(0, 0, w, h);
    var box = removeBackground(id.data, w, h);
    if(!box) return null;
    cx.putImageData(id, 0, 0);
    var pad = 2;
    var sx = Math.max(0, box.x0 - pad), sy = Math.max(0, box.y0 - pad);
    var sw = Math.min(w, box.x1 + pad + 1) - sx, sh = Math.min(h, box.y1 + pad + 1) - sy;
    var out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
    return out.toDataURL('image/png');
  }
  function loadPhoto(el, src, pos){
    var arch = el.parentNode;
    var im = new Image();
    im.onload = function(){
      var url = null;
      try { url = cutout(im); } catch(e){ url = null; }
      if(url){ el.src = url; }
      else { el.src = src; el.classList.add('raw'); if(pos) el.style.objectPosition = 'center ' + pos; }
      el.classList.add('ready');
    };
    im.onerror = function(){ arch.classList.add('noimg'); el.remove(); };
    im.src = src;
  }

  function link(icon, value, kind, label){
    if(!value) return '';
    var href = kind === 'mail' ? 'mailto:' + value : value;
    return '<a class="dev-ico" href="' + esc(href) + '" target="_blank" rel="noopener" aria-label="' + label + '">' + icon + '</a>';
  }

  arches.innerHTML = DEVELOPERS.map(function(d){
    return '<div class="dev-card">' +
      '<div class="dev-arch' + (d.photo ? '' : ' noimg') + '">' +
        '<div class="dev-initials">' + esc(initials(d.name)) + '</div>' +
        (d.photo ? '<img class="dev-img" alt="' + esc(d.name) + '">' : '') +
      '</div>' +
      '<div class="dev-meta"><div class="dev-name">' + esc(d.name) + '</div><div class="dev-role">' + esc(d.role) + '</div></div>' +
      '<div class="dev-links">' + link(GMAIL_ICON, d.gmail, 'mail', 'Email') + link(FB_ICON, d.facebook, 'url', 'Facebook') + '</div>' +
    '</div>';
  }).join('');
  Array.prototype.forEach.call(arches.querySelectorAll('.dev-img'), function(el, i){
    loadPhoto(el, DEVELOPERS[i].photo, DEVELOPERS[i].pos);
  });

  var btnLabel = btn.querySelector('.dev-toggle-label');
  btn.addEventListener('click', function(){
    var open = panel.classList.toggle('open');
    btnLabel.textContent = open ? 'Hide Creators' : 'Meet the Creators';
    var settings = document.getElementById('settingsView');
    if(settings) settings.classList.toggle('creators-only', open);
    var frame = document.getElementById('frameScreen');
    if(frame) frame.scrollTop = 0;
  });

  var arrow = btn.querySelector('.dev-toggle-arrow');
  var RANGE = 90, PULL = 0.35;
  function resetMagnet(){
    btn.classList.remove('magnet');
    btn.style.transform = '';
    btnLabel.style.transform = '';
    arrow.style.transform = '';
  }
  document.addEventListener('mousemove', function(e){
    if(!btn.offsetParent) return;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width/2, cy = r.top + r.height/2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var nearX = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
    var nearY = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    if(Math.hypot(nearX, nearY) > RANGE){ resetMagnet(); return; }
    btn.classList.add('magnet');
    btn.style.transform = 'translate(' + (dx*PULL) + 'px,' + (dy*PULL) + 'px)';
    btnLabel.style.transform = 'translate(' + (dx*0.12) + 'px,' + (dy*0.12) + 'px)';
    arrow.style.transform = 'translate(' + (dx*0.18) + 'px,' + (dy*0.18) + 'px)';
  });
  document.addEventListener('mouseleave', resetMagnet);
})();

(function () {
  'use strict';

  var synth = window.speechSynthesis;
  var grid = document.getElementById('videoGrid');
  var detail = document.getElementById('detailView');
  var titleEl = document.getElementById('detailTitle');
  var bar = document.getElementById('raBar');
  var frame = document.getElementById('frameScreen');
  if (!grid || !detail || !bar || !frame) return;

  var OFFICE = { word: 1, excel: 1, ppt: 1 };

  // local copy first, CDN as fallback
  var CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/';
  var PDF_SRC = [
    { js: 'lib/pdf.min.mjs', worker: 'lib/pdf.worker.min.mjs' },
    { js: CDN + 'pdf.min.mjs', worker: CDN + 'pdf.worker.min.mjs' }
  ];
  function absUrl(u) { return new URL(u, document.baseURI).href; }

  if (!document.getElementById('raPdfCss')) {
    var st = document.createElement('style');
    st.id = 'raPdfCss';
    st.textContent = [
      '.pv-wrap{height:560px;overflow:auto;background:#E9ECF1;border-radius:10px;padding:10px;position:relative;font-size:.85rem;color:#6E6E73;}',
      '.pv-page{position:relative;margin:0 auto 10px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.18);}',
      '.pv-page canvas{display:block;width:100%;height:100%;}',
      '.textLayer{position:absolute;inset:0;overflow:hidden;line-height:1;text-size-adjust:none;-webkit-text-size-adjust:none;mix-blend-mode:multiply;}',
      '.textLayer span,.textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%;-webkit-user-select:text;user-select:text;}',
      '.textLayer{--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size));}',
      '.textLayer > :not(.markedContent),.textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor) * var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));}',
      '.textLayer .markedContent{display:contents;}',
      '.textLayer ::selection{background:#C8C8C8;}',
      '.textLayer span::selection{background:#C8C8C8;color:transparent;}',
      '.ra-fab{position:absolute;z-index:60;display:none;align-items:center;gap:6px;border:none;cursor:pointer;',
      'background:#0071E3;color:#fff;font-weight:700;font-size:.8rem;padding:9px 14px;border-radius:999px;',
      'box-shadow:0 6px 18px rgba(0,0,0,.28);user-select:none;-webkit-user-select:none;}',
      '.ra-fab svg{width:16px;height:16px;}',
      '.ra-hint{font-size:.74rem;color:var(--ink-soft);padding:0 6px;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  var I = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>',
    spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
  };

  var $ = function (id) { return document.getElementById(id); };
  var $play = $('raPlay'), $lbl = $('raPlayLbl'), $ico = $('raIco');
  var $prev = $('raPrev'), $next = $('raNext'), $stop = $('raStop');
  var $count = $('raCount'), $rate = $('raRate'), $voice = $('raVoice');

  function removeOldSummary() {
    var old = grid.querySelectorAll('.ra-text-card');
    for (var i = 0; i < old.length; i++) old[i].remove();
  }

  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    var inApp = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|Snapchat|TikTok/i.test(navigator.userAgent);
    var isAndroid = /Android/i.test(navigator.userAgent);
    var pageUrl = location.href;
    var chromeIntent = 'intent://' + location.host + location.pathname + location.search +
      '#Intent;scheme=' + location.protocol.replace(':', '') + ';package=com.android.chrome;end';
    bar.innerHTML =
      '<span class="ra-note" style="flex:1;min-width:200px;">' +
      (inApp
        ? 'Read Aloud does not work inside the Messenger/Facebook browser. Please open this link in Chrome or Safari.'
        : 'Read Aloud is not supported in this browser. Please try Chrome, Edge or Safari.') +
      '</span>' +
      (isAndroid && inApp ? '<a class="ra-btn ra-main" style="text-decoration:none;" href="' + chromeIntent + '">Open in Chrome</a>' : '') +
      '<button type="button" class="ra-btn" id="raCopyLink">Copy link</button>';
    var copyBtn = document.getElementById('raCopyLink');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      function done() { if (typeof showToast === 'function') showToast('Link copied'); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pageUrl).then(done, function () { window.prompt('Copy this link:', pageUrl); });
      } else { window.prompt('Copy this link:', pageUrl); }
    });
    // Kahit walang speech, dapat lumabas pa rin ang PDF sa lahat ng device
    function mountAll() {
      var on = !!OFFICE[grid.getAttribute('data-section')];
      bar.classList.toggle('show', on);
      if (!on) return;
      var slots = grid.querySelectorAll('.pdf-slot');
      for (var i = 0; i < slots.length; i++) mountViewer(slots[i]);
    }
    new MutationObserver(mountAll).observe(grid, { childList: true, attributes: true, attributeFilter: ['data-section'] });
    mountAll();
    return;
  }

  var voices = [];
  function loadVoices() {
    var all = synth.getVoices() || [];
    var en = all.filter(function (v) { return /^en/i.test(v.lang); });
    voices = en.length ? en : all;
    var prev = $voice.value;
    $voice.innerHTML = voices.map(function (v, i) {
      return '<option value="' + i + '">' + v.name.replace(/</g, '&lt;') + '</option>';
    }).join('');
    if (!voices.length) return;
    if (prev && voices[+prev]) { $voice.value = prev; return; }
    var best = 0;
    voices.forEach(function (v, i) {
      if (/natural|google us english|aria|jenny|samantha/i.test(v.name) && best === 0) best = i;
    });
    $voice.value = String(best);
  }
  loadVoices();
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
  // may phone na huli lumalabas ang listahan ng voices
  setTimeout(loadVoices, 800);
  setTimeout(loadVoices, 2500);

  var SYM = { '+': 'plus', '-': 'minus', '=': 'equals', '`': 'backtick', '$': 'dollar sign', '%': 'percent', '#': 'number sign',
              '←': 'left arrow', '→': 'right arrow', '↑': 'up arrow', '↓': 'down arrow', '<': 'less than', '>': 'greater than' };
  function spoken(s) {
    s = String(s)
      .replace(/\.{3,}/g, ' ')
      .replace(/\s\+\s/g, ' plus ')
      .replace(/([A-Za-z0-9])\+(?=[A-Za-z0-9←→↑↓<])/g, '$1 plus ')
      .replace(/\s\/\s/g, ' or ')
      .replace(/&amp;|&/g, ' and ')
      .replace(/\bCtrl\b/gi, 'Control')
      .replace(/\bEsc\b/gi, 'Escape')
      .replace(/\bDel\b/gi, 'Delete')
      .replace(/\bPgUp\b/gi, 'Page Up')
      .replace(/\bPgDn\b/gi, 'Page Down');
    s = s.split(' ').map(function (w) { return SYM.hasOwnProperty(w) ? SYM[w] : w; }).join(' ');
    s = s.replace(/[←→↑↓]/g, function (c) { return ' ' + SYM[c] + ' '; });
    return s.replace(/\s+/g, ' ').trim();
  }

  // split into short pieces because Chrome cuts off long utterances
  function chunk(text) {
    text = String(text).replace(/\s+/g, ' ').trim();
    if (!text) return [];
    var sentences = text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) || [text];
    var out = [];
    sentences.forEach(function (s) {
      s = s.trim();
      while (s.length > 220) {
        var cut = s.lastIndexOf(' ', 200);
        if (cut < 80) cut = 200;
        out.push(s.slice(0, cut));
        s = s.slice(cut).trim();
      }
      if (s) out.push(s);
    });
    return out;
  }

  var pdfReady = null;
  function loadPdfJs() {
    if (pdfReady) return pdfReady;
    pdfReady = new Promise(function (res, rej) {
      var errors = [];
      (function tryLoad(i) {
        if (i >= PDF_SRC.length) {
          var e = new Error('PDF.js not found');
          e.code = 'NOLIB'; e.details = errors.join(' | ');
          return rej(e);
        }
        import(absUrl(PDF_SRC[i].js)).then(function (lib) {
          lib.GlobalWorkerOptions.workerSrc = absUrl(PDF_SRC[i].worker);
          res(lib);
        }).catch(function (err) {
          errors.push(PDF_SRC[i].js + ': ' + (err && err.message || err));
          tryLoad(i + 1);
        });
      })(0);
    });
    pdfReady.catch(function () { pdfReady = null; });
    return pdfReady;
  }

  function lessonRange(numPages) {
    var start = 1, end = numPages;
    try {
      var leaf = findLeaf(currentCat), sec = findSection(leaf.sectionId);
      start = leaf.page || 1;
      var later = sec.items.map(function (it) { return it.page || 0; })
        .filter(function (p) { return p > start; }).sort(function (a, b) { return a - b; });
      end = later.length ? Math.max(start, later[0] - 1) : numPages;
    } catch (e) {}
    return { start: Math.min(start, numPages), end: Math.min(end, numPages) };
  }

  function mountViewer(slot) {
    var ifr = slot.querySelector('iframe');
    if (!ifr || slot._pv) return;
    slot._pv = true;

    var raw = ifr.getAttribute('src') || '';
    var m = /^(.*?)#page=(\d+)/.exec(raw);
    var url = m ? m[1] : raw;
    var targetPage = m ? +m[2] : 1;

    var wrap = document.createElement('div');
    wrap.className = 'pv-wrap';
    wrap.textContent = 'Loading PDF…';
    ifr.replaceWith(wrap);

    var pdfDoc = null, lib = null;

    loadPdfJs().then(function (l) {
      lib = l;
      return lib.getDocument({ url: url }).promise;
    }).then(function (pdf) {
      pdfDoc = pdf;
      var rng = lessonRange(pdf.numPages);
      slot._getText = function () {
        var parts = [], p = Promise.resolve();
        for (var n = rng.start; n <= rng.end; n++) {
          (function (n) {
            p = p.then(function () { return pdf.getPage(n); })
                 .then(function (pg) { return pg.getTextContent(); })
                 .then(function (tc) { parts.push(tc.items.map(function (it) { return it.str; }).join(' ')); });
          })(n);
        }
        return p.then(function () { return parts.join(' '); });
      };

      wrap.textContent = '';
      var width = (wrap.clientWidth || 800) - 20;
      var pages = [];
      var chain = Promise.resolve();
      for (var n = 1; n <= pdf.numPages; n++) {
        (function (n) {
          chain = chain.then(function () { return pdf.getPage(n); }).then(function (pg) {
            var v0 = pg.getViewport({ scale: 1 });
            var vp = pg.getViewport({ scale: width / v0.width });
            var div = document.createElement('div');
            div.className = 'pv-page';
            div.style.width = vp.width + 'px';
            div.style.height = vp.height + 'px';
            div.style.setProperty('--scale-factor', vp.scale);
            div.style.setProperty('--user-unit', 1);
            div.style.setProperty('--total-scale-factor', vp.scale);
            div.style.setProperty('--scale-round-x', '1px');
            div.style.setProperty('--scale-round-y', '1px');
            div._pg = pg; div._vp = vp; div._done = false;
            wrap.appendChild(div);
            pages.push(div);
          });
        })(n);
      }
      return chain.then(function () { return pages; });
    }).then(function (pages) {
      function renderPage(div) {
        if (div._done) return;
        div._done = true;
        var pg = div._pg, vp = div._vp;
        var dpr = window.devicePixelRatio || 1;
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        div.appendChild(canvas);
        pg.render({
          canvasContext: canvas.getContext('2d'),
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
        });
        pg.getTextContent().then(function (tc) {
          var tl = document.createElement('div');
          tl.className = 'textLayer';
          div.appendChild(tl);
          new lib.TextLayer({ textContentSource: tc, container: tl, viewport: vp }).render();
        });
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) renderPage(e.target); });
      }, { root: wrap, rootMargin: '600px 0px' });
      pages.forEach(function (d) { io.observe(d); });

      var t = pages[targetPage - 1];
      if (t) { renderPage(t); wrap.scrollTop = Math.max(0, t.offsetTop - 10); }
    }).catch(function (err) {
      console.error('PDF viewer failed:', err, err && err.details);
      wrap.replaceWith(ifr);
      var why;
      if (location.protocol === 'file:') {
        why = 'This page was opened using file://. Please run it on a local server (e.g. Live Server) instead of double-clicking the file.';
      } else if (err && err.code === 'NOLIB') {
        why = 'PDF.js could not be found. Put the lib/ folder (pdf.min.mjs and pdf.worker.min.mjs) next to index.html, or go online.';
      } else {
        why = 'Could not open the PDF: ' + ((err && err.message) || err) + '. Make sure the file is inside the pdf/ folder.';
      }
      var note = document.createElement('div');
      note.className = 'ra-note';
      note.style.padding = '6px 2px';
      note.textContent = why + ' (Select-and-read will not work until this is fixed.)';
      ifr.parentNode.insertBefore(note, ifr);
      var openLink = document.createElement('a');
      openLink.href = url; openLink.target = '_blank'; openLink.rel = 'noopener';
      openLink.className = 'pdf-open';
      openLink.style.cssText = 'display:inline-block;margin:0 0 8px 2px;';
      openLink.textContent = 'Open PDF';
      ifr.parentNode.insertBefore(openLink, ifr);
    });
  }

  var lastSel = '';

  function getSel() {
    var s = window.getSelection();
    if (!s || !s.rangeCount || s.isCollapsed) return '';
    var n = s.getRangeAt(0).commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    if (!grid.contains(n)) return '';
    return s.toString().replace(/\s+/g, ' ').trim();
  }

  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ra-fab';
  fab.innerHTML = I.spk + '<span>Read selection</span>';
  frame.appendChild(fab);

  function hideFab() { fab.style.display = 'none'; }
  function placeFab() {
    var s = window.getSelection();
    if (!s || !s.rangeCount) return hideFab();
    var r = s.getRangeAt(0);
    var rects = r.getClientRects();
    var last = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    var fr = frame.getBoundingClientRect();
    fab.style.display = 'inline-flex';
    var left = last.right - fr.left + frame.scrollLeft;
    var top = last.bottom - fr.top + frame.scrollTop + 8;
    left = Math.max(8, Math.min(left, frame.clientWidth - fab.offsetWidth - 8));
    fab.style.left = left + 'px';
    fab.style.top = top + 'px';
  }
  function isOfficeLesson() {
    return detail.classList.contains('active') && !!OFFICE[grid.getAttribute('data-section')];
  }
  function checkSelection() {
    if (!isOfficeLesson()) return hideFab();
    var s = getSel();
    if (s) { lastSel = s; placeFab(); } else hideFab();
  }

  fab.addEventListener('mousedown', function (e) { e.preventDefault(); });
  fab.addEventListener('click', function (e) {
    e.stopPropagation();
    var s = getSel() || lastSel;
    hideFab();
    if (s) beginSelection(s);
  });

  document.addEventListener('mouseup', function () { setTimeout(checkSelection, 10); });
  document.addEventListener('touchend', function () { setTimeout(checkSelection, 350); });
  document.addEventListener('keyup', function (e) { if (e.shiftKey || /Arrow/.test(e.key)) setTimeout(checkSelection, 10); });
  var selTimer = null;
  document.addEventListener('selectionchange', function () {
    clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      var s = window.getSelection();
      if (!s) return;
      var txt = getSel();
      if (txt) { lastSel = txt; return; }
      var ae = document.activeElement;
      if (ae && (bar.contains(ae) || ae === fab)) return;
      lastSel = ''; hideFab();
    }, 120);
  });
  grid.addEventListener('scroll', hideFab, true);

  var queue = [], queueSource = '', idx = -1;
  var playing = false, paused = false, token = 0, timer = null;

  function updateUI() {
    $lbl.textContent = playing ? 'Pause' : (paused ? 'Resume' : 'Read aloud');
    $ico.innerHTML = playing ? I.pause : (paused ? I.play : I.spk);
    $count.textContent = queue.length && idx >= 0 ? (idx + 1) + ' / ' + queue.length : '';
    $prev.disabled = $next.disabled = $stop.disabled = !queue.length;
    $play.disabled = false;
  }

  function pauseMusic() {
    try {
      if (typeof audioEl !== 'undefined' && !audioEl.paused) {
        audioEl.pause();
        playingIndex = null;
        if (typeof renderSongList === 'function') renderSongList();
      }
    } catch (e) {}
  }

  function speak(i) {
    if (!queue.length) return;
    if (i < 0) i = 0;
    if (i >= queue.length) { stop(); return; }
    pauseMusic();
    clearTimeout(timer);
    synth.cancel();
    token++;
    var my = token;
    idx = i; playing = true; paused = false;
    updateUI();
    timer = setTimeout(function () {
      if (my !== token) return;
      var u = new SpeechSynthesisUtterance(queue[i]);
      window.raUtter = u; // iwas mawala ang utterance bago matapos (Chrome/Android)
      u.rate = +$rate.value || 1;
      var v = voices[+$voice.value];
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
      u.onend = function () { if (my === token && playing) speak(idx + 1); };
      u.onerror = function (e) {
        if (my !== token) return;
        if (e && (e.error === 'canceled' || e.error === 'interrupted')) return;
        stop();
      };
      synth.speak(u);
    }, 40);
  }
  function pauseSpeech() {
    playing = false; paused = true; token++;
    clearTimeout(timer); synth.cancel(); updateUI();
  }
  function stop() {
    playing = false; paused = false; token++; idx = -1; queue = []; queueSource = '';
    clearTimeout(timer); synth.cancel(); updateUI();
  }

  function begin(list, source) {
    stop();
    queue = list; queueSource = source || '';
    if (!queue.length) { updateUI(); return; }
    speak(0);
  }
  function beginSelection(text) { begin(chunk(spoken(text)), text); }

  function lessonText() {
    var title = titleEl ? titleEl.textContent.trim() : '';
    var head = title ? title + '. ' : '';
    var slot = grid.querySelector('.pdf-slot');
    if (slot && slot._getText) {
      return slot._getText().then(function (t) { return spoken(head + t); });
    }
    var out = [];
    var blocks = grid.querySelectorAll('.lt-block');
    for (var b = 0; b < blocks.length; b++) {
      var ttl = blocks[b].querySelector('.lt-title');
      if (ttl) out.push(spoken(ttl.textContent) + '.');
      var rows = blocks[b].querySelectorAll('tbody tr');
      for (var r = 0; r < rows.length; r++) {
        var td = rows[r].querySelectorAll('td');
        if (td.length >= 2) out.push(spoken(td[0].textContent) + ': ' + spoken(td[1].textContent) + '.');
      }
    }
    return Promise.resolve(head + out.join(' '));
  }

  $play.addEventListener('click', function () {
    // i-unlock ang speech sa mismong tap (kailangan sa phone browsers)
    try { var u0 = new SpeechSynthesisUtterance(' '); u0.volume = 0; synth.speak(u0); } catch (e) {}
    var sel = getSel() || lastSel;
    if (playing) { pauseSpeech(); return; }
    if (paused && idx >= 0 && (!sel || sel === queueSource)) { speak(idx); return; }
    if (sel) { hideFab(); beginSelection(sel); return; }
    $lbl.textContent = 'Loading…';
    lessonText().then(function (t) { begin(chunk(t), ''); });
  });
  $next.addEventListener('click', function () { speak(idx < 0 ? 0 : idx + 1); });
  $prev.addEventListener('click', function () { speak(idx <= 0 ? 0 : idx - 1); });
  $stop.addEventListener('click', stop);
  $rate.addEventListener('change', function () { if (playing) speak(idx); });
  $voice.addEventListener('change', function () { if (playing) speak(idx); });

  function build() {
    stop();
    hideFab();
    lastSel = '';
    var sec = grid.getAttribute('data-section');
    var isOffice = !!OFFICE[sec];
    bar.classList.toggle('show', isOffice);
    if (!isOffice) return;

    removeOldSummary();
    var backRow = detail.querySelector('.back-row');
    bar.style.top = (backRow ? backRow.offsetHeight : 64) + 'px';

    var slots = grid.querySelectorAll('.pdf-slot');
    for (var i = 0; i < slots.length; i++) mountViewer(slots[i]);
  }

  new MutationObserver(build).observe(grid, { childList: true, attributes: true, attributeFilter: ['data-section'] });

  new MutationObserver(function () {
    if (!detail.classList.contains('active')) { stop(); hideFab(); bar.classList.remove('show'); }
  }).observe(detail, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('visibilitychange', function () { if (document.hidden && playing) pauseSpeech(); });
  window.addEventListener('beforeunload', function () { try { synth.cancel(); } catch (e) {} });

  build();
})();