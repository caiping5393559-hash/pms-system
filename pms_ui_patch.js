(function(){
  const VERSION = '2026-07-02-vacancy-mail-diagnostics-v28';
  window.__PMS_PATCH_VERSION = VERSION;

  const ui = window.__pmsUnifiedUi || (window.__pmsUnifiedUi = {
    selectedPropertyIds: null,
    selectedRoomIds: null,
    selectedPropertyId: '',
    editingProperty: '',
    editingRoom: '',
    editingArea: '',
    syncResults: {},
    pendingChannels: {},
    calendarVacancyOnly: false,
    mail: {mailForwardingConfig: [], propertyMailForwarding: [], mailEvents: []},
    photoRows: {},
    booted: false,
    loading: false
  });
  ui.mail = ui.mail || {mailForwardingConfig: [], propertyMailForwarding: [], mailEvents: []};
  ui.mail.mailForwardingConfig = Array.isArray(ui.mail.mailForwardingConfig) ? ui.mail.mailForwardingConfig : [];
  ui.mail.propertyMailForwarding = Array.isArray(ui.mail.propertyMailForwarding) ? ui.mail.propertyMailForwarding : [];
  ui.mail.mailEvents = Array.isArray(ui.mail.mailEvents) ? ui.mail.mailEvents : [];
  ui.mail.statusByProperty = ui.mail.statusByProperty || {};
  ui.calendarVacancyOnly = !!ui.calendarVacancyOnly;

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function safe(value){return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'x';}
  function qs(id){return document.getElementById(id);}
  function nowIso(){return new Date().toISOString().slice(0,19);}
  function apiUrl(path){
    if(typeof withKey === 'function') return withKey(path);
    const key = new URLSearchParams(location.search).get('key') || '';
    return path + (path.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
  }

  function getRooms(){try{return Array.isArray(rooms) ? rooms : [];}catch(e){return window.rooms || [];}}
  function setRooms(value){try{rooms = value;}catch(e){} window.rooms = value;}
  function getAreas(){try{return Array.isArray(commonAreas) ? commonAreas : [];}catch(e){return window.commonAreas || [];}}
  function setAreas(value){try{commonAreas = value;}catch(e){} window.commonAreas = value;}
  function getBookings(){try{return Array.isArray(bookings) ? bookings : [];}catch(e){return window.bookings || [];}}
  function setBookings(value){try{bookings = value;}catch(e){} window.bookings = value;}
  function getManual(){try{return Array.isArray(manualChanges) ? manualChanges : [];}catch(e){return window.manualChanges || [];}}
  function setManual(value){try{manualChanges = value;}catch(e){} window.manualChanges = value;}
  function getNotes(){try{return Array.isArray(cleaningNotes) ? cleaningNotes : [];}catch(e){return window.cleaningNotes || [];}}
  function setNotes(value){try{cleaningNotes = value;}catch(e){} window.cleaningNotes = value;}
  function getRoomNotes(){try{return Array.isArray(roomDateNotes) ? roomDateNotes : [];}catch(e){return window.roomDateNotes || [];}}
  function setRoomNotes(value){try{roomDateNotes = value;}catch(e){} window.roomDateNotes = value;}
  function getSyncErrors(){try{return Array.isArray(syncErrors) ? syncErrors : [];}catch(e){return window.syncErrors || [];}}
  function setSyncErrors(value){try{syncErrors = value;}catch(e){} window.syncErrors = value;}
  function getGroups(){try{return Array.isArray(groups) ? groups : [];}catch(e){return window.groups || [];}}
  function setGroups(value){try{groups = value;}catch(e){} window.groups = value;}
  function getUsers(){try{return Array.isArray(users) ? users : [];}catch(e){return window.users || [];}}
  function setUsers(value){try{users = value;}catch(e){} window.users = value;}
  function getProperties(){try{return Array.isArray(properties) ? properties : [];}catch(e){return window.properties || [];}}
  function setProperties(value){try{properties = value;}catch(e){} window.properties = value;}
  function getPropertyCleaners(){try{return Array.isArray(propertyCleaners) ? propertyCleaners : [];}catch(e){return window.propertyCleaners || [];}}
  function setPropertyCleaners(value){try{propertyCleaners = value;}catch(e){} window.propertyCleaners = value;}
  function getChannels(){try{return Array.isArray(channelListings) ? channelListings : [];}catch(e){return window.channelListings || [];}}
  function setChannels(value){try{channelListings = value;}catch(e){} window.channelListings = value;}
  function getConfirmations(){try{return Array.isArray(cleaningTaskConfirmations) ? cleaningTaskConfirmations : [];}catch(e){return window.cleaningTaskConfirmations || [];}}
  function setConfirmations(value){try{cleaningTaskConfirmations = value;}catch(e){} window.cleaningTaskConfirmations = value;}
  function getPhotos(){try{return Array.isArray(cleaningTaskPhotos) ? cleaningTaskPhotos : [];}catch(e){return window.cleaningTaskPhotos || [];}}
  function setPhotos(value){try{cleaningTaskPhotos = value;}catch(e){} window.cleaningTaskPhotos = value;}
  function getCurrentUser(){try{return currentUser || null;}catch(e){return window.currentUser || null;}}
  function setCurrentUser(value){try{currentUser = value;}catch(e){} window.currentUser = value;}
  function getLastSync(){try{return lastSync || '';}catch(e){return window.lastSync || '';}}
  function setLastSync(value){try{lastSync = value || '';}catch(e){} window.lastSync = value || '';}

  function today(){
    try{return TODAY || new Date().toISOString().slice(0,10);}catch(e){return new Date().toISOString().slice(0,10);}
  }
  function parseDate(value){
    const parts = String(value || '').slice(0,10).split('-').map(Number);
    return new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
  }
  function fmtDate(date){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function addDay(value, count){
    const d = parseDate(value);
    d.setDate(d.getDate() + Number(count || 0));
    return fmtDate(d);
  }
  function daysBetweenSafe(a,b){return Math.round((parseDate(b) - parseDate(a)) / 86400000);}
  function dateRange(start,end){
    const out = [];
    const count = Math.max(0, daysBetweenSafe(start, addDay(end,1)));
    for(let i=0;i<count;i++) out.push(addDay(start,i));
    return out;
  }
  function monthKey(value){return String(value || '').slice(0,7);}

  function role(){
    const u = getCurrentUser() || {};
    const explicit = String(u.role || u.account_type || u.accountType || u.type || '').toLowerCase();
    if(['owner','admin','cleaner'].includes(explicit)) return explicit;
    const id = String(u.id || u.user_id || u.uid || '').toLowerCase();
    if(id.startsWith('owner_') || u.owner_id || u.ownerId || u.is_owner || u.isOwner) return 'owner';
    if(id.startsWith('cleaner_') || u.cleaner_code || u.cleanerCode || u.is_cleaner || u.isCleaner) return 'cleaner';
    if(getProperties().length || getRooms().length || getAreas().length) return 'owner';
    return location.pathname.includes('/cleaner') ? 'cleaner' : 'owner';
  }
  function isActualCleaner(){return role() === 'cleaner';}
  function isOwnerLike(){return role() === 'owner' || role() === 'admin';}
  function cleanerPath(){return location.pathname.includes('/cleaner');}
  function visibleAsCleaner(){return isActualCleaner() || (cleanerPath() && !isOwnerLike());}
  function userName(fallback){
    const u = getCurrentUser() || {};
    return u.name || u.username || fallback || '';
  }

  function groupId(){
    const p = getProperties()[0] || {};
    const u = getCurrentUser() || {};
    const ids = Array.isArray(u.group_ids) ? u.group_ids : [];
    return p.group_id || ids[0] || u.group_id || (getGroups()[0] && getGroups()[0].id) || 'group_default';
  }
  function ensureRealDefaultProperty(){
    const props = getProperties();
    if(props.length || (!getRooms().length && !getAreas().length)) return;
    const id = 'property_default';
    props.push({id, group_id: groupId(), name: '默认房源', created_at: nowIso()});
    getRooms().forEach(r => { if(!r.property_id) r.property_id = id; });
    getAreas().forEach(a => { if(!a.property_id) a.property_id = id; });
    setProperties(props);
  }
  function propList(){
    ensureRealDefaultProperty();
    return getProperties();
  }
  function propName(id){
    const p = propList().find(x => String(x.id) === String(id));
    return (p && (p.name || p.id)) || id || '未分配房源';
  }
  function roomPropId(roomId){
    const fallback = (propList()[0] && propList()[0].id) || 'property_default';
    const r = getRooms().find(x => String(x.id) === String(roomId) || String(inventoryGroupId(x)) === String(roomId));
    return (r && (r.property_id || fallback)) || fallback;
  }
  function areaPropId(areaId){
    const fallback = (propList()[0] && propList()[0].id) || 'property_default';
    const a = getAreas().find(x => String(x.id) === String(areaId));
    return (a && (a.property_id || fallback)) || fallback;
  }
  function targetPropId(id,type){return type === 'common' ? areaPropId(id) : roomPropId(id);}
  function roomName(id){
    const r = getRooms().find(x => String(x.id) === String(id));
    return (r && (r.name || r.id)) || id || '';
  }
  function normalizeRoomName(value){return String(value || '').trim().replace(/\s+/g,' ').toLowerCase();}
  function roomNameExists(propId,name,exceptId=''){
    const key = normalizeRoomName(name);
    if(!key) return false;
    return propRooms(propId).some(r => String(r.id) !== String(exceptId) && normalizeRoomName(r.name || r.id) === key);
  }
  function nextRoomName(propId){
    for(let i=1;i<500;i++){
      const name = i === 1 ? '新房间' : `新房间${i}`;
      if(!roomNameExists(propId,name)) return name;
    }
    return '新房间' + Date.now();
  }
  function targetName(id,type){
    if(type === 'common'){
      const a = getAreas().find(x => String(x.id) === String(id));
      return (a && (a.name || a.id)) || id || '';
    }
    return roomName(id);
  }
  function targetFee(id,type){
    const list = type === 'common' ? getAreas() : getRooms();
    const row = list.find(x => String(x.id) === String(id)) || {};
    return Number(row.cleaning_fee || 0);
  }
  function money(value){
    const n = Number(value || 0);
    return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2).replace(/\.00$/,'');
  }
  function signedMoney(value){
    const n = Number(value || 0);
    if(!n) return '$0';
    return (n > 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2).replace(/\.00$/,'');
  }

  function validPropIds(){return propList().map(p => p.id);}
  function ownerPropIds(){
    const valid = new Set(validPropIds());
    if(!ui.selectedPropertyIds || !Array.isArray(ui.selectedPropertyIds)){
      ui.selectedPropertyIds = validPropIds();
    }
    const ids = ui.selectedPropertyIds.filter(id => valid.has(id));
    if(!ids.length && valid.size) return validPropIds();
    return ids;
  }
  function ownerScopeAll(){return ownerPropIds().length === validPropIds().length;}
  function setOwnerPropertyIds(ids){
    const valid = new Set(validPropIds());
    ui.selectedPropertyIds = Array.from(new Set((ids || []).map(String).filter(id => valid.has(id))));
    if(!ui.selectedPropertyIds.length) ui.selectedPropertyIds = validPropIds();
    pruneSelectedRooms();
  }
  function propMatches(propId){return ownerPropIds().includes(propId);}
  function validOwnerRoomIds(){
    const props = new Set(ownerPropIds());
    return getRooms().filter(r => props.has(roomPropId(r.id))).map(r => r.id);
  }
  function pruneSelectedRooms(){
    const valid = new Set(validOwnerRoomIds());
    if(!ui.selectedRoomIds || !Array.isArray(ui.selectedRoomIds)){
      ui.selectedRoomIds = Array.from(valid);
      return;
    }
    ui.selectedRoomIds = ui.selectedRoomIds.filter(id => valid.has(id));
    if(!ui.selectedRoomIds.length && valid.size) ui.selectedRoomIds = Array.from(valid);
  }
  function ownerRoomIds(){
    pruneSelectedRooms();
    const valid = new Set(validOwnerRoomIds());
    const ids = (ui.selectedRoomIds || []).filter(id => valid.has(id));
    if(!ids.length && valid.size) return Array.from(valid);
    return ids;
  }
  function ownerRoomEntityIds(){return new Set(ownerRoomIds().map(roomEntityId));}
  function ownerRoomScopeAll(){
    const valid = validOwnerRoomIds();
    return ownerRoomIds().length === valid.length;
  }
  function setOwnerRoomIds(ids){
    const valid = new Set(validOwnerRoomIds());
    ui.selectedRoomIds = Array.from(new Set((ids || []).map(String).filter(id => valid.has(id))));
    if(!ui.selectedRoomIds.length) ui.selectedRoomIds = Array.from(valid);
  }
  function roomMatches(roomId){return propMatches(roomPropId(roomId)) && ownerRoomEntityIds().has(roomEntityId(roomId));}
  function targetMatches(targetId,type){
    if(!propMatches(targetPropId(targetId,type))) return false;
    return type === 'common' ? ownerRoomScopeAll() : roomMatches(targetId);
  }
  function ownerRooms(){return getRooms().filter(r => roomMatches(r.id));}
  function ownerAreas(){return getAreas().filter(a => targetMatches(a.id,'common'));}
  function selectedProp(){
    const id = ui.selectedPropertyId;
    return id ? propList().find(p => String(p.id) === String(id)) || null : null;
  }
  function propRooms(propId){return getRooms().filter(r => String(roomPropId(r.id)) === String(propId));}
  function propAreas(propId){return getAreas().filter(a => String(areaPropId(a.id)) === String(propId));}
  function propCleaners(propId){return getPropertyCleaners().filter(x => String(x.property_id) === String(propId));}

  function dataCount(state){
    const s = (state && state.state) || state || {};
    return ['users','properties','propertyCleaners','rooms','commonAreas','bookings','channelListings'].reduce((n,k) => n + (Array.isArray(s[k]) ? s[k].length : 0), 0);
  }
  function currentDataCount(){
    return getUsers().length + getProperties().length + getPropertyCleaners().length + getRooms().length + getAreas().length + getBookings().length + getChannels().length;
  }
  function cacheKey(state){
    const u = (state && (state.current_user || state.currentUser)) || getCurrentUser() || {};
    const id = [u.role || '', u.id || u.username || '', u.cleaner_code || ''].join('|');
    return id.replace(/\|/g,'') ? 'pms:last-good-state:' + id : '';
  }
  function snapshot(){
    const u = getCurrentUser();
    return {
      groups: getGroups(), users: getUsers(), properties: getProperties(), propertyCleaners: getPropertyCleaners(),
      rooms: getRooms(), commonAreas: getAreas(), bookings: getBookings(), channelListings: getChannels(),
      manualChanges: getManual(), cleaningNotes: getNotes(), roomDateNotes: getRoomNotes(),
      cleaningTaskConfirmations: getConfirmations(), cleaningTaskPhotos: getPhotos(), sync_errors: getSyncErrors(), last_sync: getLastSync(),
      mailForwardingConfig: ui.mail.mailForwardingConfig, propertyMailForwarding: ui.mail.propertyMailForwarding,
      mailEvents: ui.mail.mailEvents, current_user: u, currentUser: u
    };
  }
  function rememberGoodState(){
    try{
      if(!currentDataCount()) return;
      const snap = snapshot();
      const key = cacheKey(snap);
      if(key) localStorage.setItem(key, JSON.stringify({saved_at: Date.now(), state: snap}));
    }catch(e){}
  }
  function cachedGoodStateFor(state){
    try{
      const key = cacheKey(state);
      if(!key) return null;
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      return cached && cached.state && dataCount(cached.state) ? cached.state : null;
    }catch(e){return null;}
  }

  function ensureDataGate(text){
    let style = qs('pmsDataGateStyles');
    if(!style){
      style = document.createElement('style');
      style.id = 'pmsDataGateStyles';
      style.textContent = 'html.pms-waiting-data #owner,html.pms-waiting-data #cleaner{opacity:.22;pointer-events:none}#pmsDataGate{position:sticky;top:0;z-index:9998;margin:12px auto;max-width:880px;border:1px solid #99f6e4;background:#f0fdfa;color:#0f172a;border-radius:8px;padding:13px 16px;font-weight:900;box-shadow:0 10px 28px rgba(15,23,42,.12)}#pmsDataGate .small{margin-top:4px;color:#475569;font-weight:600}';
      document.head.appendChild(style);
    }
    let box = qs('pmsDataGate');
    if(!box){
      box = document.createElement('div');
      box.id = 'pmsDataGate';
      (document.querySelector('main') || document.body).prepend(box);
    }
    box.innerHTML = `${esc(text || '正在加载 PMS 数据...')}<div class="small">系统会等真实房源和房间数据返回后再显示，不先渲染 0 数据。</div>`;
    document.documentElement.classList.add('pms-waiting-data');
  }
  function clearDataGate(){
    document.documentElement.classList.remove('pms-waiting-data');
    const box = qs('pmsDataGate');
    if(box) box.remove();
  }

  function applyStateFromServerImpl(data){
    const state = (data && data.state) || data || {};
    if(state.current_user || state.currentUser) setCurrentUser(state.current_user || state.currentUser);
    const incomingEmpty = ['properties','propertyCleaners','rooms','commonAreas','bookings','channelListings'].some(k => Array.isArray(state[k])) && dataCount(state) === 0;
    if(incomingEmpty && currentDataCount()){
      rememberGoodState();
      return state;
    }
    if(incomingEmpty){
      const cached = cachedGoodStateFor(state);
      if(cached) return applyStateFromServerImpl(cached);
    }
    if(Array.isArray(state.groups)) setGroups(state.groups);
    if(Array.isArray(state.users)) setUsers(state.users);
    if(Array.isArray(state.properties)) setProperties(state.properties);
    if(Array.isArray(state.propertyCleaners)) setPropertyCleaners(state.propertyCleaners);
    if(Array.isArray(state.rooms)) setRooms(state.rooms);
    if(Array.isArray(state.commonAreas)) setAreas(state.commonAreas);
    if(Array.isArray(state.bookings)) setBookings(state.bookings);
    if(Array.isArray(state.channelListings)) setChannels(state.channelListings);
    if(Array.isArray(state.manualChanges)) setManual(state.manualChanges);
    if(Array.isArray(state.cleaningNotes)) setNotes(state.cleaningNotes);
    if(Array.isArray(state.roomDateNotes)) setRoomNotes(state.roomDateNotes);
    if(Array.isArray(state.cleaningTaskConfirmations)) setConfirmations(state.cleaningTaskConfirmations);
    if(Array.isArray(state.cleaningTaskPhotos)) setPhotos(state.cleaningTaskPhotos);
    if(Array.isArray(state.sync_errors)) setSyncErrors(state.sync_errors);
    if(state.last_sync) setLastSync(state.last_sync);
    if(Array.isArray(state.mailForwardingConfig)) ui.mail.mailForwardingConfig = state.mailForwardingConfig;
    if(Array.isArray(state.propertyMailForwarding)) ui.mail.propertyMailForwarding = state.propertyMailForwarding;
    if(Array.isArray(state.mailEvents)) ui.mail.mailEvents = state.mailEvents;
    ensureRealDefaultProperty();
    if(currentDataCount()) rememberGoodState();
    clearDataGate();
    return state;
  }

  async function loadStateImpl(){
    ui.loading = true;
    ensureDataGate('正在加载 PMS 数据...');
    let last = null;
    let lastError = null;
    for(let i=0;i<8;i++){
      try{
        const res = await fetch(apiUrl('/api/state'), {cache: 'no-store'});
        if(!res.ok) throw new Error('读取数据失败：HTTP ' + res.status);
        last = await res.json();
        applyStateFromServerImpl(last);
        if(currentDataCount() || dataCount(last)){
          ui.loading = false;
          clearDataGate();
          return last;
        }
        const cached = cachedGoodStateFor(last);
        if(cached){
          applyStateFromServerImpl(cached);
          ui.loading = false;
          clearDataGate();
          return cached;
        }
      }catch(e){
        lastError = e;
      }
      await new Promise(resolve => setTimeout(resolve, i < 2 ? 700 : 1200));
    }
    ui.loading = false;
    clearDataGate();
    if(lastError && !last) throw lastError;
    return last;
  }

  async function persistAll(btn){
    ensureRealDefaultProperty();
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = '保存中...';}
    try{
      const payload = {
        properties: getProperties(),
        propertyCleaners: getPropertyCleaners(),
        rooms: getRooms(),
        commonAreas: getAreas(),
        channelListings: getChannels(),
        manualChanges: getManual(),
        cleaningNotes: getNotes(),
        roomDateNotes: getRoomNotes(),
        cleaningTaskConfirmations: getConfirmations(),
        sync_errors: getSyncErrors(),
        last_sync: getLastSync(),
        propertyMailForwarding: ui.mail.propertyMailForwarding
      };
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 25000) : null;
      let res;
      try{
        res = await fetch(apiUrl('/api/state'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify(payload)
        });
      }finally{
        if(timeoutId) clearTimeout(timeoutId);
      }
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('保存失败 HTTP ' + res.status));
      const nextState = data && data.state ? data.state : data;
      if(nextState && (Array.isArray(nextState.properties) || Array.isArray(nextState.rooms) || Array.isArray(nextState.channelListings))){
        applyStateFromServerImpl(nextState);
      }
      return data;
    }catch(err){
      alert('保存失败：' + (err && err.message ? err.message : err));
      throw err;
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || '保存';}
    }
  }
  function scheduleSaveImpl(){
    try{clearTimeout(saveTimer);}catch(e){}
    try{saveTimer = setTimeout(() => persistAll().catch(err => console.warn(err)), 500);}catch(e){
      setTimeout(() => persistAll().catch(err => console.warn(err)), 500);
    }
  }

  function logoutImpl(){
    try{
      Object.keys(localStorage || {}).forEach(k => { if(/^pms/i.test(k) || k.includes('last-good-state')) localStorage.removeItem(k); });
      sessionStorage.clear();
      document.cookie.split(';').forEach(c => {
        const n = c.split('=')[0].trim();
        if(n) document.cookie = n + '=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      });
    }catch(e){}
    fetch('/api/logout', {method: 'POST', keepalive: true}).catch(() => {});
    location.replace('/logout?ts=' + Date.now());
  }
  function ensureLogoutButton(){
    const nav = document.querySelector('.nav') || document.querySelector('header') || document.body;
    let btn = qs('logoutBtn');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'logoutBtn';
      btn.type = 'button';
      btn.className = 'smallbtn';
      nav.appendChild(btn);
    }
    btn.textContent = '退出登录';
    btn.style.display = '';
    btn.onclick = logoutImpl;
    syncNavForRole();
    return btn;
  }
  function syncNavForRole(){
    const nav = document.querySelector('.nav');
    if(!nav) return;
    const cleanerOnly = isActualCleaner() || (cleanerPath() && !isOwnerLike());
    nav.querySelectorAll('button,a').forEach(el => {
      if(el.id === 'logoutBtn'){ el.style.display = ''; return; }
      const text = (el.textContent || '').trim();
      el.style.display = cleanerOnly && (text.includes('房东管理') || text.includes('房源管理')) ? 'none' : '';
    });
  }
  function ensureVersionBadge(){
    let style = qs('pmsVersionBadgeStyles');
    if(!style){
      style = document.createElement('style');
      style.id = 'pmsVersionBadgeStyles';
      style.textContent = '.pms-version-badge{position:fixed;right:12px;bottom:12px;z-index:999;display:inline-flex;align-items:center;justify-content:center;border:1px solid #99f6e4;background:#ecfeff;color:#0f766e;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900;line-height:1;white-space:nowrap;pointer-events:none;opacity:.88;box-shadow:0 8px 20px rgba(15,23,42,.10)}';
      document.head.appendChild(style);
    }
    let badge = qs('pmsVersionBadge');
    if(!badge){
      badge = document.createElement('span');
      badge.id = 'pmsVersionBadge';
      badge.className = 'pms-version-badge';
      document.body.appendChild(badge);
    }
    badge.textContent = 'PMS v' + VERSION;
  }
  function setHeader(view){
    const h = document.querySelector('header h1');
    const sub = document.querySelector('header h1 + .small');
    const name = userName(isActualCleaner() ? '保洁' : '房东');
    if(view === 'cleaner'){
      if(isActualCleaner()){
        if(h) h.textContent = `${name} · 保洁工作台`;
        if(sub) sub.textContent = '查看绑定房源的今日保洁、未来保洁、历史保洁和备注。';
      }else{
        if(h) h.textContent = `${name} · 保洁任务查看`;
        if(sub) sub.textContent = '房东查看当前房源范围内的保洁任务和历史记录。';
      }
      document.title = h ? h.textContent : '保洁工作台';
    }else{
      if(h) h.textContent = `${name} · 房东管理后台`;
      if(sub) sub.textContent = '管理房源、房间、公区、iCal 同步和保洁绑定。';
      document.title = h ? h.textContent : '房东管理后台';
    }
    syncNavForRole();
  }

  function removeLegacyIntroCards(){
    document.querySelectorAll('#owner > .card,#cleaner > .card').forEach(card => {
      const text = card.textContent || '';
      if(text.includes('房东可查看指定日期工作表') || text.includes('保洁只能查看绑定房源') || text.includes('保洁退房页面')) card.remove();
    });
  }
  function ensureBaseShell(){
    let main = document.querySelector('main');
    if(!main){
      main = document.createElement('main');
      document.body.appendChild(main);
    }
    if(main.dataset.pmsUnifiedShell !== '1'){
      main.innerHTML = '<section id="owner" class="section"></section><section id="cleaner" class="section"></section>';
      main.dataset.pmsUnifiedShell = '1';
    }
    ensureOwnerContainers();
    ensureCleanerContainers();
  }
  function ensureOwnerContainers(){
    const owner = qs('owner');
    if(!owner) return;
    Array.from(owner.children || []).forEach(child => {
      if(child && child.id !== 'ownerTabsCard' && child.classList && child.classList.contains('card') && child.querySelector && child.querySelector('.tabbar')) child.remove();
    });
    if(!qs('ownerMetrics')){
      const div = document.createElement('div');
      div.id = 'ownerMetrics';
      div.className = 'grid';
      owner.prepend(div);
    }
    if(!qs('ownerTabsCard')){
      const card = document.createElement('div');
      card.id = 'ownerTabsCard';
      card.className = 'card';
      card.innerHTML = `<div class="tabbar">
        <button class="active" onclick="showOwnerTab('ownerDailyWork', this)">指定日期工作表</button>
        <button onclick="showOwnerTab('ownerCalendar', this)">未来预订</button>
        <button onclick="showOwnerTab('ownerCleaning', this)">保洁费用/调整</button>
        <button onclick="showOwnerTab('ownerNotes', this)">备注管理</button>
        <button onclick="showOwnerTab('ownerRooms', this)">房间/公区设置</button>
      </div>`;
      qs('ownerMetrics').insertAdjacentElement('afterend', card);
    }
    const pane = (id, html) => {
      if(qs(id)) return;
      const div = document.createElement('div');
      div.id = id;
      div.className = 'tab-content' + (id === 'ownerDailyWork' ? ' active' : '');
      div.innerHTML = html;
      owner.appendChild(div);
    };
    pane('ownerDailyWork', `<div class="card"><h2>指定日期工作表</h2><div class="toolbar"><span class="small">日期：</span><input id="workDate" type="date" onchange="renderDailyWork()"><button class="smallbtn primary" onclick="document.getElementById('workDate').value=TODAY;renderDailyWork()">今天</button><button class="smallbtn" onclick="document.getElementById('workDate').value=addDays(document.getElementById('workDate').value||TODAY,1);renderDailyWork()">下一天</button><button class="smallbtn" onclick="document.getElementById('workDate').value=addDays(document.getElementById('workDate').value||TODAY,-1);renderDailyWork()">上一天</button></div><div id="dailyWorkMetrics" class="grid"></div></div><div id="dailyWorkContent"></div>`);
    pane('ownerCalendar', `<div class="card"><h2>未来房态总览</h2><div class="toolbar"><span class="small">默认未来 14 天，可切换 28 天，也可指定日期范围：</span><button class="smallbtn primary" data-range-preset="14" onclick="setRangePreset(14)">未来14天</button><button class="smallbtn" data-range-preset="28" onclick="setRangePreset(28)">未来28天</button><input id="rangeStart" type="date" onchange="refreshCalendarRangeViews()"><input id="rangeEnd" type="date" onchange="refreshCalendarRangeViews()"><span id="ownerRoomFilterSummary" class="badge blue"></span><button id="calendarVacancyOnlyBtn" class="smallbtn" onclick="toggleCalendarVacancyOnly()">只看空房</button><span id="calendarVacancySummary" class="badge green"></span></div><div class="scroll"><div id="calendarGrid" class="timeline"></div></div></div><div class="card"><h2 id="futureStatsTitle">当前区间每个房间预订统计</h2><div id="sixMonthStats"></div></div><div class="card"><div class="toolbar"><strong id="futureBookingsTitle">当前区间预订列表</strong><select id="platformFilter" onchange="renderOwnerBookings()"><option value="">全部平台</option><option>Airbnb</option><option>Booking</option><option>Vrbo</option><option>Other</option><option>微信直订</option></select><span id="bookingRoomFilterSummary" class="badge blue"></span></div><div id="ownerBookings"></div></div>`);
    pane('ownerCleaning', `<div id="ownerCleaningShell"></div>`);
    pane('ownerNotes', `<div id="ownerNotesShell"></div>`);
    pane('ownerRooms', `<div id="roomSettingsUnifiedShell" class="room-settings-shell"><div id="roomSettings"></div></div>`);
    ensureOwnerProfileTab();
    ensureRoomSettingsShell();
  }
  function ensureOwnerProfileTab(){
    const owner = qs('owner');
    if(!owner) return;
    const tabbar = owner.querySelector('#ownerTabsCard .tabbar') || owner.querySelector('.tabbar');
    if(tabbar && !tabbar.querySelector('[data-pms-profile-tab]')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.pmsProfileTab = '1';
      btn.textContent = '用户设置';
      btn.onclick = function(){showOwnerTabImpl('ownerProfile', this);};
      tabbar.appendChild(btn);
    }
    if(!qs('ownerProfile')){
      const div = document.createElement('div');
      div.id = 'ownerProfile';
      div.className = 'tab-content';
      owner.appendChild(div);
    }
  }
  function ensureRoomSettingsShell(){
    const pane = qs('ownerRooms');
    if(!pane) return qs('roomSettings');
    if(!qs('roomSettingsUnifiedShell')){
      pane.innerHTML = `<div id="roomSettingsUnifiedShell" class="room-settings-shell"><div id="roomSettings"></div></div>`;
    }
    return qs('roomSettings');
  }
  function ensureCleanerContainers(){
    const root = qs('cleaner');
    if(!root) return;
    if(qs('cleanerDashboardShell')){
      ensureCleanerProfileTab();
      return;
    }
    const profileTab = isActualCleaner() ? `<button data-pms-profile-tab="1" onclick="showTab('cleanerProfile', this)">用户设置</button>` : '';
    const profilePane = isActualCleaner() ? '<div id="cleanerProfile" class="tab-content"></div>' : '';
    root.innerHTML = `<div id="cleanerDashboardShell"><div id="cleanerSummary"></div><div id="cleanerMetrics" class="grid"></div><div id="cleanerTodayNotes"></div><div class="card"><div class="tabbar"><button class="active" onclick="showTab('cleanerToday', this)">今日保洁</button><button onclick="showTab('cleanerFuture', this)">未来保洁</button><button onclick="showTab('cleanerManual', this)">手动调整记录</button><button onclick="showTab('cleanerHistory', this)">历史保洁</button>${profileTab}</div></div><div id="cleanerToday" class="tab-content active"></div><div id="cleanerFuture" class="tab-content"></div><div id="cleanerManual" class="tab-content"></div><div id="cleanerHistory" class="tab-content"></div>${profilePane}</div>`;
    ensureCleanerProfileTab();
  }
  function ensureCleanerProfileTab(){
    const shell = qs('cleanerDashboardShell');
    if(!shell) return;
    const tabbar = shell.querySelector('.tabbar');
    if(!isActualCleaner()){
      const btn = tabbar && tabbar.querySelector('[data-pms-profile-tab]');
      if(btn) btn.remove();
      const pane = qs('cleanerProfile');
      if(pane){
        if(pane.classList.contains('active')){
          const todayBtn = tabbar && tabbar.querySelector('button[onclick*="cleanerToday"]');
          showTabImpl('cleanerToday', todayBtn || null);
        }
        pane.remove();
      }
      return;
    }
    if(tabbar && !tabbar.querySelector('[data-pms-profile-tab]')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.pmsProfileTab = '1';
      btn.textContent = '用户设置';
      btn.onclick = function(){showTabImpl('cleanerProfile', this);};
      tabbar.appendChild(btn);
    }
    if(!qs('cleanerProfile')){
      const pane = document.createElement('div');
      pane.id = 'cleanerProfile';
      pane.className = 'tab-content';
      shell.appendChild(pane);
    }
  }
  function ensureStyles(){
    let style = qs('pmsUnifiedStyles');
    if(style) return;
    style = document.createElement('style');
    style.id = 'pmsUnifiedStyles';
    style.textContent = `
      .card,.metric,.property-card,.property-subcard,.room-setting-card,.work-card,.note-card,.month-block,.cell,.empty-panel{border-radius:8px!important}
      .property-module{display:grid;gap:12px;border:2px solid #2dd4bf;background:#fbfffe;box-shadow:inset 5px 0 0 #0f766e,0 10px 22px rgba(15,118,110,.08)}
      .property-module-head,.property-detail-head,.property-actions,.room-head,.channel-row,.mail-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .property-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
      .property-card,.property-subcard,.room-setting-card{border:1px solid var(--line);background:#fff;padding:14px}
      .property-card{display:grid;gap:10px;align-content:space-between;min-height:145px}
      .property-card-top{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
      .property-title{font-size:18px;font-weight:900;color:#0f172a}
      .property-select{display:flex;align-items:center;gap:8px;font-weight:900;color:#0f766e}
      .property-select input,.scope-chip input{width:18px!important;height:18px;min-width:18px}
      .property-card input,.room-setting-card input,.room-setting-card select,.mail-panel input,.mail-panel textarea{width:100%;min-width:0}
      .property-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
      .scope-filter{display:grid;gap:10px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:12px;margin:10px 0}
      .scope-filter-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .scope-filter-title{font-weight:900;color:#0f172a}
      .scope-chip-list{display:flex;gap:8px;flex-wrap:wrap}
      .scope-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:13px;font-weight:900}
      .scope-chip.active{border-color:#5eead4;background:#ecfdf5;color:#0f766e}
      .scope-chip .prop-label{font-size:11px;color:#64748b;font-weight:800}
      .room-settings-shell{display:grid;gap:14px}
      #roomSettings{display:grid;gap:14px}
      #roomSettings > .property-detail-head{border:1px solid var(--line);background:#fff;border-radius:8px;padding:14px}
      #roomSettings .settings-section{border:1px solid var(--line);background:#fff;border-radius:8px;padding:14px}
      #roomSettings .settings-section .property-detail-head{padding:0 0 10px;border-bottom:1px solid var(--line);margin-bottom:10px}
      .room-setting-list{display:grid;gap:16px;margin-top:12px}
      .room-head{border:1px solid #d8e1ef;background:#f8fafc;border-radius:8px;padding:10px}
      .room-setting-card .property-subcard{border:0;background:transparent;padding:12px 0 0;margin-top:12px;border-top:1px dashed var(--line)}
      .room-setting-card .property-subcard .property-detail-head{padding:0;border:0;margin:0}
      .room-basics{display:grid;grid-template-columns:minmax(180px,1fr) minmax(120px,.45fr) auto;gap:8px;align-items:end;width:100%}
      .channel-list{display:grid;gap:10px;margin-top:10px}
      .channel-card{border:1px solid #bae6fd;background:#f8fcff;border-radius:8px;padding:10px;display:grid;gap:8px}
      .channel-grid{display:grid;grid-template-columns:130px minmax(190px,1fr) minmax(190px,1fr) minmax(140px,.8fr) auto;gap:8px;align-items:end}
      .feed-line,.readonly-line{word-break:break-all;border:1px solid #d8e1ef;background:#f8fafc;border-radius:8px;padding:8px 10px;font-size:12px;color:#475569}
      .sync-status{display:inline-flex;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:900;border:1px solid #d8e1ef;background:#f8fafc;color:#475569}
      .sync-status.ok{border-color:#86efac;background:#f0fdf4;color:#166534}.sync-status.error{border-color:#fb7185;background:#fff1f2;color:#be123c}.sync-status.warn{border-color:#fbbf24;background:#fffbeb;color:#92400e}
      #calendarGrid .cell{position:relative;overflow:hidden;min-width:64px}
      #calendarGrid .cell.head.weekend{background:#fffbeb!important;color:#92400e!important;border-color:#f59e0b!important}
      #calendarGrid .cell.head.weekend-sun{background:#fff7ed!important;color:#9a3412!important;border-color:#fb923c!important}
      #calendarGrid .cell.weekend{outline:2px solid #f59e0b!important;outline-offset:-2px}
      #calendarGrid .cell.weekend-sun{outline-color:#f97316!important}
      #calendarGrid .cell.checkout-only,#calendarGrid .cell.checkin-only,#calendarGrid .cell.turnover{background:#fff!important;border-color:#5eead4!important;color:#0f766e!important}
      #calendarGrid .cell.stay-only{display:flex;align-items:center;justify-content:center;background:#ccfbf1!important;border-color:#5eead4!important;color:#0f766e!important;text-align:center}
      #calendarGrid .cell.checkout-only:before,#calendarGrid .cell.checkin-only:before{content:"";position:absolute;inset:0;z-index:0}
      #calendarGrid .cell.checkout-only:before{background:linear-gradient(to bottom right,#ccfbf1 0 calc(50% - 1px),transparent calc(50% + 1px) 100%)}
      #calendarGrid .cell.checkin-only:before{background:linear-gradient(to bottom right,transparent 0 calc(50% - 1px),#ccfbf1 calc(50% + 1px) 100%)}
      #calendarGrid .cell.turnover{background:#ccfbf1!important;border-color:#14b8a6!important}
      #calendarGrid .cell.checkout-only:after,#calendarGrid .cell.checkin-only:after,#calendarGrid .cell.turnover:after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom right,transparent 0 calc(50% - 1.2px),#0f766e calc(50% - 1.2px) calc(50% + 1.2px),transparent calc(50% + 1.2px));opacity:.82;z-index:1}
      #calendarGrid .cell.locked{display:flex;align-items:center;justify-content:center;text-align:center;background:#fff1f2!important;border-color:#fda4af!important;color:#9f1239!important;font-weight:900}
      #calendarGrid .cell .cell-platform{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:900;position:relative;z-index:2}
      .weekend-label{display:block;font-size:11px;font-weight:900;line-height:1.1;margin-top:2px;color:#b45309}
      .work-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}
      .work-card h3{white-space:normal!important}
      .finance-section{margin-top:12px}.finance-section h3{margin:0;padding:10px 12px;background:#f8fafc;border:1px solid var(--line);border-radius:8px 8px 0 0}
      .mail-panel{border:1px solid #bae6fd;background:#f8fcff;border-radius:8px;padding:12px;display:grid;gap:10px}
      .user-profile-card{display:grid;gap:14px}
      .profile-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .profile-field{display:grid;gap:6px}
      .profile-field label{font-weight:900;color:#0f172a}
      .profile-field input{width:100%;min-width:0}
      .profile-field input[readonly]{background:#f8fafc;color:#475569}
      .profile-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .profile-status{font-size:13px;font-weight:900;color:#0f766e}
      .review-row{background:#fff7ed!important}
      .photo-cell{display:grid;gap:6px;min-width:150px}
      .photo-cell input[type=file]{display:none}
      .photo-list{display:flex;gap:6px;flex-wrap:wrap}
      .photo-list a{display:inline-flex;align-items:center;border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:900;text-decoration:none}
      .photo-expiry{font-size:11px;color:#64748b}
      @media(max-width:900px){.room-basics,.channel-grid{grid-template-columns:1fr}.property-module-head,.property-detail-head,.property-actions,.property-card-top{align-items:stretch}.property-actions>*,.property-card-top>*{width:100%}.property-card-top{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function platformBadge(platform){
    const p = String(platform || 'Airbnb');
    const cls = p === 'Airbnb' ? 'blue' : p === 'Booking' ? 'green' : p === 'Vrbo' ? 'yellow' : p === 'Other' ? 'purple' : '';
    return `<span class="badge ${cls}">${esc(p)}</span>`;
  }
  function objectBadge(type){return type === 'common' ? '<span class="badge orange">公区</span>' : '<span class="badge">房间</span>';}
  function priorityBadge(value){return value === '重要' ? '<span class="badge red">重要</span>' : '<span class="badge blue">普通</span>';}
  function changeBadge(value){return value === 'add' ? '<span class="badge green">额外增加</span>' : '<span class="badge red">取消保洁</span>';}

  function inventoryGroupId(room){
    return String((room && (room.inventory_group_id || room.inventoryGroupId)) || (room && room.id) || '');
  }
  function roomEntityId(roomId){
    const room = getRooms().find(r => String(r.id) === String(roomId));
    return inventoryGroupId(room || {id: roomId});
  }
  function isLockedBooking(b){
    if(!b) return false;
    const kind = [b.booking_type,b.kind,b.type,b.event_type,b.eventType].map(v => String(v || '').toLowerCase()).join(' ');
    const text = [kind,b.status,b.summary,b.lock_reason,b.lockReason,b.reason,b.description,b.platform,b.source,b.guest,b.title,b.name].map(v => String(v || '').toLowerCase()).join(' ');
    if(b.is_locked || b.isLocked || b.locked || b.blocked || b.is_blocked || b.isBlocked || kind.includes('lock') || kind.includes('block')) return true;
    if(/不开放|锁定|锁房|手动锁|手动关闭|关闭|不可订|不可预订|封锁|暂停开放|blocked|calendar blocked|closed|unavailable|not available|not open|manual lock|manual block|owner block|hold/.test(text)) return true;
    if(/reserved|reservation|confirmed|accepted|booked|预订|订单|入住/.test(text)) return false;
    return false;
  }
  function lockReason(b){return String((b && (b.lock_reason || b.lockReason || b.status || b.summary || b.reason)) || '手动不开放锁定');}
  function bookingStableKey(b){
    return [roomEntityId(b && b.room_id), b && b.checkin, b && b.checkout, isLockedBooking(b) ? 'lock' : 'booking'].map(x => String(x || '')).join('|');
  }
  function dedupeBookings(rows){
    const by = new Map();
    (rows || []).forEach(row => {
      if(!row || !row.checkin || !row.checkout) return;
      const key = bookingStableKey(row);
      if(!by.has(key)){
        by.set(key, {...row, _merged_count: 1, _source_labels: [row.platform || row.source || '订单'].filter(Boolean)});
        return;
      }
      const cur = by.get(key);
      cur._merged_count = Number(cur._merged_count || 1) + 1;
      const label = row.platform || row.source || '';
      cur._source_labels = Array.from(new Set([...(cur._source_labels || []), label].filter(Boolean)));
      ['guest','platform','status','summary','lock_reason','channel_listing_id'].forEach(field => { if(!cur[field] && row[field]) cur[field] = row[field]; });
    });
    return Array.from(by.values());
  }
  function bookingLabels(b){
    const labels = Array.isArray(b && b._source_labels) && b._source_labels.length ? b._source_labels : [b && (b.platform || b.source || '订单')];
    return Array.from(new Set(labels.filter(Boolean)));
  }
  function bookingSourceBadges(b){return bookingLabels(b).map(platformBadge).join(' ');}
  function bookingsForRoom(room, rows){
    const entity = inventoryGroupId(room);
    return (rows || getBookings()).filter(b => roomEntityId(b.room_id) === entity);
  }
  function ownerBookingsAll(){return getBookings().filter(b => roomMatches(b.room_id));}
  function ownerRealBookings(){return dedupeBookings(ownerBookingsAll().filter(b => !isLockedBooking(b)));}
  function ownerLockBookings(){return dedupeBookings(ownerBookingsAll().filter(isLockedBooking));}
  function realBookingsImpl(){return dedupeBookings(getBookings().filter(b => !isLockedBooking(b)));}
  function lockBookingsImpl(){return dedupeBookings(getBookings().filter(isLockedBooking));}

  function cleanTargetKey(row){
    const type = row && row.target_type === 'common' ? 'common' : 'room';
    const entity = type === 'room' ? roomEntityId(row && row.target_id) : String(row && row.target_id || '');
    return [row && row.date, type, entity].map(x => String(x || '')).join('|');
  }
  function isGeneratedCleaning(row){
    if(!row || row.finance_adjustment || row.note_task || row.type === 'manual_add' || row.cancel_review_task || row.type === 'cancel_review_task') return false;
    if((row.target_type || 'room') === 'common') return true;
    if(row.booking) return true;
    const text = [row.source,row.reason,row.platform].map(v => String(v || '')).join(' ');
    return /Airbnb|Booking|Vrbo|iCal|system|系统|退房/.test(text);
  }
  function mergeCleaning(base,row){
    const sources = new Set(String(base.source || '').split(' + ').filter(Boolean));
    const reasons = new Set(String(base.reason || '').split('；').filter(Boolean));
    if(row.source) sources.add(row.source);
    if(row.reason) reasons.add(row.reason);
    if(sources.size) base.source = Array.from(sources).join(' + ');
    if(reasons.size) base.reason = Array.from(reasons).join('；');
    if(!base.booking && row.booking) base.booking = row.booking;
    return base;
  }
  function dedupeCleaningRowsImpl(rows){
    const by = new Map();
    (rows || []).forEach(row => {
      if(!row || row.actual === false || !row.date) return;
      const type = row.target_type || 'room';
      const key = isGeneratedCleaning(row)
        ? 'generated|' + cleanTargetKey({...row,target_type:type})
        : ['manual', row.id || row.change_id || row.note_id || '', cleanTargetKey({...row,target_type:type}), row.source || '', row.reason || '', row.amount || '', row.type || '', row.created_at || ''].join('|');
      if(by.has(key)) mergeCleaning(by.get(key), row);
      else by.set(key, {...row, target_type: type});
    });
    return Array.from(by.values());
  }
  function systemCleaningRowsImpl(){
    return realBookingsImpl().map(b => ({
      date: b.checkout, target_id: b.room_id, target_type: 'room', source: b.platform || 'Airbnb',
      type: 'system', booking: b, actual: true, reason: '系统退房自动生成'
    }));
  }
  function commonAreaRowsImpl(start,end){
    const s = start || addDay(today(), -90);
    const e = end || addDay(today(), 180);
    const rows = [];
    getAreas().forEach(area => {
      if(area.daily_default !== false){
        dateRange(s,e).forEach(date => rows.push({date, target_id: area.id, target_type: 'common', source: '公区每日保洁', type: 'system_common', actual: true, reason: '公区默认每日打扫'}));
      }
    });
    return rows;
  }
  function noteTaskRows(start,end){
    return getNotes().filter(n => {
      const type = n.target_type || 'room';
      return n.date && !n.cancellation_review && (!start || n.date >= start) && (!end || n.date <= end) && targetMatches(n.target_id,type) && n.amount_present;
    }).map(n => ({date:n.date,target_id:n.target_id,target_type:n.target_type || 'room',source:'备注',type:'note_task',actual:true,reason:n.note || '',amount:Number(n.amount || 0),note_task:true,note_id:n.id || ''}));
  }
  function cancelReviewDates(note){
    if(!note) return [];
    if(note.owner_review_task_date) return [String(note.owner_review_task_date).slice(0,10)].filter(Boolean);
    if(String(note.owner_review_status || '') === 'clean_needed') return [String(note.date || '').slice(0,10)].filter(Boolean);
    const direct = Array.isArray(note.review_dates) ? note.review_dates.map(x => String(x || '').slice(0,10)).filter(Boolean) : [];
    if(direct.length) return Array.from(new Set(direct));
    const base = String(note.date || '').slice(0,10);
    if(!base) return [];
    return Array.from(new Set([base, addDay(base,1)].filter(Boolean)));
  }
  function cancelReviewTaskRows(start,end,includePending=false){
    const out = [];
    getNotes().forEach(note => {
      if(!note || !note.cancellation_review || note.inactive || note.deleted) return;
      const type = note.target_type || 'room';
      if(!targetMatches(note.target_id,type)) return;
      const status = String(note.owner_review_status || 'pending');
      if(status === 'no_cleaning' || status === 'moved_next_day') return;
      if(!includePending && status !== 'clean_needed') return;
      cancelReviewDates(note).forEach(date => {
        if((start && date < start) || (end && date > end)) return;
        out.push({
          id: 'cancel_review_task_' + safe(note.id || '') + '_' + safe(date),
          date,
          target_id: note.target_id,
          target_type: type,
          source: status === 'clean_needed' ? '房东确认退房保洁' : '订单消失待确认',
          type: 'cancel_review_task',
          actual: true,
          reason: note.note || '订单消失后的退房保洁待确认',
          cancel_review_task: true,
          review_note_id: note.id || '',
          review_status: status,
          checkin: note.checkin || '',
          checkout: note.checkout || '',
          platform: note.platform || ''
        });
      });
    });
    return out;
  }
  function actualCleaningRowsImpl(start,end){
    const rows = systemCleaningRowsImpl().concat(commonAreaRowsImpl(start,end));
    getManual().forEach(m => {
      const type = m.target_type || 'room';
      if(m.type === 'add'){
        rows.push({date:m.date,target_id:m.target_id,target_type:type,source:m.source || '手动增加',type:'manual_add',actual:true,reason:m.reason || '',amount:Number(m.amount || targetFee(m.target_id,type))});
      }else if(m.type === 'remove'){
        rows.forEach(r => {
          if(r.date === m.date && String(r.target_id) === String(m.target_id) && (r.target_type || 'room') === type){
            r.actual = false;
            r.reason = '房东取消：' + (m.reason || '');
          }
        });
      }
    });
    return dedupeCleaningRowsImpl(rows.filter(r => r.actual).concat(noteTaskRows(start,end), cancelReviewTaskRows(start,end,false)));
  }
  function scopedCleaningRows(start,end){
    return actualCleaningRowsImpl(start,end).filter(r => targetMatches(r.target_id, r.target_type));
  }
  function rowAmount(row){
    if(row.cancel_review_task && String(row.review_status || 'pending') !== 'clean_needed') return 0;
    if(row.type === 'manual_add' || row.note_task) return Number(row.amount || targetFee(row.target_id,row.target_type));
    return targetFee(row.target_id,row.target_type);
  }
  function rowFeeText(row){
    if(row.cancel_review_task && String(row.review_status || 'pending') !== 'clean_needed') return '<span class="sync-status warn">待确认</span>';
    return money(rowAmount(row));
  }
  function roomDateNoteFor(date, roomId){return getRoomNotes().filter(n => n.date === date && String(n.room_id) === String(roomId));}
  function noteFor(date,targetId,targetType){return getNotes().filter(n => n.date === date && String(n.target_id) === String(targetId) && (n.target_type || 'room') === (targetType || 'room'));}
  function inlineNotes(date,targetId,targetType){
    const all = noteFor(date,targetId,targetType).filter(n => !n.cancellation_review).concat((targetType === 'room' ? roomDateNoteFor(date,targetId).map(n => ({...n,target_id:n.room_id,target_type:'room',roomDate:true})) : []));
    if(!all.length) return '';
    return all.map(n => `<div class="note-card ${n.priority === '重要' ? 'important' : ''}"><div class="note-title">${priorityBadge(n.priority)} ${esc(targetName(n.target_id,n.target_type))} ${n.roomDate ? '日期备注' : '备注'}</div><div>${esc(n.note)}</div></div>`).join('');
  }
  function reviewNoteForRow(row){
    if(row && row.review_note_id){
      const byId = getNotes().find(n => n && n.cancellation_review && !n.inactive && !n.deleted && String(n.id || '') === String(row.review_note_id));
      if(byId) return byId;
    }
    return getNotes().find(n => n && n.cancellation_review && !n.inactive && !n.deleted && cancelReviewDates(n).includes(row.date) && String(n.target_id) === String(row.target_id) && (n.target_type || 'room') === (row.target_type || 'room')) || null;
  }
  function reviewStatus(note){
    const status = String((note && note.owner_review_status) || 'pending');
    if(status === 'clean_needed') return '房东已确认需要保洁';
    if(status === 'moved_next_day') return '房东已改到第二天';
    if(status === 'no_cleaning') return '房东已确认不需要保洁';
    return '等待房东确认';
  }
  function cleaningTaskKey(row){return encodeURIComponent([row.date,row.target_type || 'room',row.target_id,cleanTargetKey(row)].join('|'));}
  function cleaningReviewControls(row){
    if(!row || !row.cancel_review_task) return '';
    const note = reviewNoteForRow(row);
    if(!note) return '';
    if(!isOwnerLike()) return `<span class="sync-status warn">${esc(reviewStatus(note))}</span>`;
    if(note.owner_review_status && note.owner_review_status !== 'pending') return `<span class="sync-status ok">${esc(reviewStatus(note))}</span>`;
    const key = cleaningTaskKey(row);
    return `<div class="mail-actions"><span class="sync-status warn">等待房东确认</span><button class="smallbtn primary" onclick="resolveCancellationReview('${key}','keep',this)">确认需要保洁</button><button class="smallbtn" onclick="resolveCancellationReview('${key}','move_next_day',this)">改到第二天</button><button class="smallbtn" onclick="resolveCancellationReview('${key}','cancel',this)">不需要保洁</button></div>`;
  }
  function cleaningPhotoTaskKey(row){
    return [row && row.date, row && (row.target_type || 'room'), row && row.target_id, row && (row.type || ''), row && (row.source || ''), row && (row.review_note_id || row.note_id || '')].map(x => String(x || '')).join('|');
  }
  function cleaningPhotosForRow(row){
    const key = cleaningPhotoTaskKey(row);
    return getPhotos().filter(p => p && String(p.task_key || p.taskKey || '') === key);
  }
  function cleaningPhotoControls(row){
    if(!row || !row.date || !row.target_id) return '';
    const key = cleaningPhotoTaskKey(row);
    ui.photoRows[key] = {date: row.date, target_id: row.target_id, target_type: row.target_type || 'room', task_key: key};
    const cameraId = 'cleanPhotoCamera_' + safe(key);
    const fileId = 'cleanPhotoFile_' + safe(key);
    const photos = cleaningPhotosForRow(row);
    const canUpload = row.date <= today();
    const upload = canUpload ? `<div class="mail-actions"><button class="smallbtn" onclick="chooseCleaningPhoto('${encodeURIComponent(key)}','camera')">拍照</button><button class="smallbtn" onclick="chooseCleaningPhoto('${encodeURIComponent(key)}','file')">上传照片</button></div><input id="${cameraId}" type="file" accept="image/*" capture="environment" onchange="uploadCleaningPhoto('${encodeURIComponent(key)}',this)"><input id="${fileId}" type="file" accept="image/*" onchange="uploadCleaningPhoto('${encodeURIComponent(key)}',this)">` : '';
    const list = photos.length ? `<div class="photo-list">${photos.map((p,i) => {
      const href = String(p.url || '').startsWith('/') ? apiUrl(p.url) : String(p.url || '');
      return `<a href="${esc(href)}" target="_blank" rel="noopener">照片${i+1}</a>`;
    }).join('')}</div>` : '<span class="small">未上传</span>';
    const expiry = photos.length ? `<div class="photo-expiry">7天后自动删除</div>` : '';
    return `<div class="photo-cell">${upload}${list}${expiry}</div>`;
  }
  function chooseCleaningPhoto(encodedKey,mode){
    const key = decodeURIComponent(encodedKey || '');
    const input = qs((mode === 'file' ? 'cleanPhotoFile_' : 'cleanPhotoCamera_') + safe(key));
    if(input) input.click();
  }
  function fileToDataUrl(file){
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('读取照片失败'));
      reader.readAsDataURL(file);
    });
  }
  function imageFromDataUrl(dataUrl){
    return new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('照片格式无法压缩'));
      img.src = dataUrl;
    });
  }
  async function prepareCleaningPhoto(file){
    const dataUrl = await fileToDataUrl(file);
    const type = String(file.type || '').toLowerCase();
    if(!/^image\/(jpeg|jpg|png|webp)$/.test(type)) return dataUrl;
    try{
      const img = await imageFromDataUrl(dataUrl);
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
      if(scale >= 1 && file.size < 900000) return dataUrl;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.width || maxSide) * scale));
      canvas.height = Math.max(1, Math.round((img.height || maxSide) * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.78);
    }catch(e){
      return dataUrl;
    }
  }
  async function uploadCleaningPhoto(encodedKey,input){
    const key = decodeURIComponent(encodedKey || '');
    const row = ui.photoRows[key];
    const file = input && input.files && input.files[0];
    if(!row || !file) return;
    const oldTitle = document.title;
    try{
      const dataUrl = await prepareCleaningPhoto(file);
      const res = await fetch(apiUrl('/api/cleaning-photo'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...row, file_name: file.name || 'cleaning-photo.jpg', content_type: file.type || 'image/jpeg', photo_data: dataUrl})
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('上传失败 HTTP ' + res.status));
      applyStateFromServerImpl(data.state || data);
      renderAll();
    }catch(e){
      alert('上传照片失败：' + (e && e.message ? e.message : e));
    }finally{
      if(input) input.value = '';
      document.title = oldTitle;
    }
  }
  function cleaningTableScoped(items, showSource=true){
    const rows = dedupeCleaningRowsImpl(items || []).sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    if(!rows.length) return `<div class="card"><p class="small">暂无记录</p></div>`;
    const showProp = ownerPropIds().length !== 1;
    return `<div class="card"><table><tr><th>日期</th>${showProp?'<th>房源</th>':''}<th>类型</th><th>对象</th>${showSource?'<th>来源</th>':''}<th>费用</th><th>备注/任务</th><th>照片</th><th>确认</th></tr>${rows.map(row => `<tr class="${row.date === today() ? 'today-row' : ''} ${row.cancel_review_task ? 'review-row' : ''}"><td>${esc(row.date)}</td>${showProp?`<td>${esc(propName(targetPropId(row.target_id,row.target_type)))}</td>`:''}<td>${objectBadge(row.target_type)}</td><td><span class="badge ${row.target_type === 'common' ? 'orange' : ''}">${esc(targetName(row.target_id,row.target_type))}</span></td>${showSource?`<td>${esc(row.source || '')}</td>`:''}<td>${rowFeeText(row)}</td><td>${esc(row.reason || '')}${row.cancel_review_task ? '' : inlineNotes(row.date,row.target_id,row.target_type)}</td><td>${cleaningPhotoControls(row)}</td><td>${cleaningReviewControls(row)}</td></tr>`).join('')}</table></div>`;
  }

  function ensureOwnerPropertyHost(){
    const owner = qs('owner');
    if(!owner) return null;
    let host = qs('ownerPropertyHubMount');
    if(host) return host;
    host = document.createElement('div');
    host.id = 'ownerPropertyHubMount';
    host.className = 'card property-module';
    const metrics = qs('ownerMetrics');
    if(metrics) metrics.insertAdjacentElement('beforebegin', host);
    else owner.prepend(host);
    return host;
  }
  function propertyMailDigest(propertyId){
    const count = ui.mail.mailEvents.filter(e => String(e.property_id) === String(propertyId)).length;
    return `<button type="button" class="smallbtn" onclick="openPropertyMailTab('${esc(propertyId)}')">邮件提醒 ${count}</button>`;
  }
  function propertyCard(prop){
    const rooms = propRooms(prop.id);
    const areas = propAreas(prop.id);
    const cleaners = propCleaners(prop.id);
    const editing = ui.editingProperty === prop.id;
    const checked = ownerPropIds().includes(prop.id);
    const nameBlock = editing
      ? `<div class="channel-row"><input id="propertyName_${safe(prop.id)}" value="${esc(prop.name || '')}"><button class="smallbtn primary" onclick="savePropertyName('${esc(prop.id)}',this)">保存名字</button><button class="smallbtn" onclick="cancelPropertyNameEdit()">取消</button></div>`
      : `<div class="property-title">房源:${esc(prop.name || prop.id)}</div>`;
    return `<div class="property-card ${checked?'active':''}"><div><div class="property-card-top"><div>${nameBlock}<div class="property-meta"><span class="badge blue">${rooms.length} 个房间</span><span class="badge orange">${areas.length} 个公区</span><span class="badge green">${cleaners.length} 个保洁绑定</span></div></div><label class="property-select" title="纳入下面所有统计和列表"><input type="checkbox" ${checked?'checked':''} onchange="setOwnerPropertyFilter('${esc(prop.id)}',this.checked)">选择</label></div></div><div class="property-actions">${editing?'':`<button class="smallbtn" onclick="editPropertyName('${esc(prop.id)}')">修改名字</button>`}<button class="smallbtn primary" onclick="openPropertyRooms('${esc(prop.id)}')">进入房间管理</button><button class="smallbtn" onclick="setOnlyOwnerProperty('${esc(prop.id)}')">只看这个房源</button><button class="smallbtn" onclick="deletePropertyUi('${esc(prop.id)}',this)">删除房源</button>${propertyMailDigest(prop.id)}</div></div>`;
  }
  function ensureOwnerPropertyModuleVisible(){
    if(visibleAsCleaner()) return;
    const host = ensureOwnerPropertyHost();
    if(!host) return;
    const props = propList();
    const label = `已选 ${ownerPropIds().length}/${props.length} 个房源`;
    host.innerHTML = `<div class="property-module-head"><div><h2 style="margin:0">房源管理</h2><div class="small">勾选房源后，下面所有工作表、预订、保洁、备注和房间筛选都会按这个范围显示。</div></div><div class="property-actions"><span class="badge green">${esc(label)}</span><button class="smallbtn" onclick="setOwnerPropertyAll()">全部房源</button><button class="smallbtn primary" onclick="addProperty()">添加房源</button></div></div><div class="property-cards">${props.length ? props.map(propertyCard).join('') : '<div class="empty-panel">还没有房源。点“添加房源”开始配置。</div>'}</div>`;
    renderOwnerScopeFilter();
  }
  function ensureOwnerScopeFilterHost(){
    if(visibleAsCleaner()) return null;
    let host = qs('ownerScopeFilter');
    if(host) return host;
    host = document.createElement('div');
    host.id = 'ownerScopeFilter';
    host.className = 'scope-filter';
    const propHost = qs('ownerPropertyHubMount');
    if(propHost) propHost.insertAdjacentElement('afterend', host);
    return host;
  }
  function roomScopeChip(room){
    const checked = ownerRoomIds().some(id => String(id) === String(room.id));
    const showProp = ownerPropIds().length !== 1;
    return `<label class="scope-chip ${checked?'active':''}"><input type="checkbox" ${checked?'checked':''} onchange="setOwnerRoomFilter('${esc(room.id)}',this.checked)"><span>${esc(roomName(room.id))}</span>${showProp?`<span class="prop-label">${esc(propName(roomPropId(room.id)))}</span>`:''}<button type="button" class="smallbtn" onclick="event.preventDefault();event.stopPropagation();setOnlyOwnerRoom('${esc(room.id)}')">只看</button></label>`;
  }
  function renderOwnerScopeFilter(){
    const host = ensureOwnerScopeFilterHost();
    if(!host) return;
    const rooms = validOwnerRoomIds().map(id => getRooms().find(r => String(r.id) === String(id))).filter(Boolean);
    const selectedCount = ownerRoomIds().length;
    host.innerHTML = `<div class="scope-filter-head"><div><div class="scope-filter-title">房间范围</div><div class="small">先在上面勾房源，再在这里勾房间；下面所有结果统一按这个范围显示。</div></div><div class="property-actions"><span class="badge blue">已选 ${selectedCount}/${rooms.length} 个房间</span><button class="smallbtn" onclick="setOwnerRoomAll()">全部房间</button></div></div><div class="scope-chip-list">${rooms.length ? rooms.map(roomScopeChip).join('') : '<span class="small">当前房源没有房间。</span>'}</div>`;
  }

  function initSelectsImpl(){
    renderOwnerScopeFilter();
    ['ownerRoomFilterSummary','bookingRoomFilterSummary'].forEach(id => {
      const el = qs(id);
      if(el) el.textContent = `已选 ${ownerRoomIds().length}/${validOwnerRoomIds().length} 个房间`;
    });
    const roomNoteRoom = qs('roomNoteRoom'); if(roomNoteRoom) roomNoteRoom.innerHTML = ownerRooms().map(r => `<option value="${esc(r.id)}">${esc(roomName(r.id))}</option>`).join('');
    refreshManualTargetOptionsImpl();
    refreshNoteTargetOptionsImpl();
    const allTargets = `<option value="">全部对象</option>` + ownerRooms().map(r => `<option value="room:${esc(r.id)}">房间｜${esc(roomName(r.id))}</option>`).join('') + ownerAreas().map(a => `<option value="common:${esc(a.id)}">公区｜${esc(targetName(a.id,'common'))}</option>`).join('');
    const manualFilter = qs('manualFilterTarget'); if(manualFilter) manualFilter.innerHTML = allTargets;
  }
  function cleanTargetOptions(selected=''){
    return ownerRooms().map(r => `<option value="room:${esc(r.id)}" ${selected === 'room:'+r.id?'selected':''}>房间｜${esc(roomName(r.id))}</option>`).join('') + ownerAreas().map(a => `<option value="common:${esc(a.id)}" ${selected === 'common:'+a.id?'selected':''}>公区｜${esc(targetName(a.id,'common'))}</option>`).join('');
  }
  function parseTarget(value){
    const text = String(value || '');
    if(text.includes(':')){
      const parts = text.split(':');
      return {type: parts[0] || 'room', id: parts.slice(1).join(':')};
    }
    return {type: 'room', id: text};
  }
  function refreshManualTargetOptionsImpl(){const el = qs('manualTarget'); if(el) el.innerHTML = cleanTargetOptions(el.value);}
  function refreshNoteTargetOptionsImpl(){const el = qs('noteTarget'); if(el) el.innerHTML = cleanTargetOptions(el.value);}

  function renderOwnerMetricsImpl(){
    const start = qs('rangeStart') && qs('rangeStart').value || today();
    const end = qs('rangeEnd') && qs('rangeEnd').value || addDay(today(), 13);
    const endExclusive = addDay(end,1);
    const future = ownerRealBookings().filter(b => b.checkin < endExclusive && b.checkout > start);
    const nights = future.reduce((sum,b) => sum + Math.max(0, Math.min(daysBetweenSafe(start,b.checkout), daysBetweenSafe(start,endExclusive)) - Math.max(0, daysBetweenSafe(start,b.checkin))), 0);
    const cleanToday = scopedCleaningRows(today(),today()).filter(r => r.date === today()).length;
    const notesToday = getNotes().filter(n => n.date === today() && targetMatches(n.target_id,n.target_type || 'room')).length + getRoomNotes().filter(n => n.date === today() && roomMatches(n.room_id)).length;
    const el = qs('ownerMetrics');
    if(el) el.innerHTML = `<div class="metric"><div class="small">未来订单</div><div class="num">${future.length}</div></div><div class="metric"><div class="small">未来占用晚数</div><div class="num">${nights}</div></div><div class="metric"><div class="small">今日实际保洁</div><div class="num">${cleanToday}</div></div><div class="metric"><div class="small">今日备注</div><div class="num">${notesToday}</div></div>`;
  }

  function setRangePresetImpl(n){
    const days = Math.max(1, Math.min(90, Number(n) || 14));
    const s = qs('rangeStart'), e = qs('rangeEnd');
    if(s) s.value = today();
    if(e) e.value = addDay(today(), days - 1);
    refreshCalendarRangeViewsImpl();
  }
  function calendarRange(){
    const s = qs('rangeStart'), e = qs('rangeEnd');
    const start = (s && s.value) || today();
    const end = (e && e.value) || addDay(start,13);
    const dayCount = Math.max(1, Math.min(90, daysBetweenSafe(start, addDay(end,1))));
    return {start, end, endExclusive:addDay(end,1), dayCount};
  }
  function rangeLabel(range){
    const r = range || calendarRange();
    if(r.start === today() && r.dayCount === 14) return '未来14天';
    if(r.start === today() && r.dayCount === 28) return '未来28天';
    return `${r.start} 至 ${r.end}`;
  }
  function weekendClass(day){
    const d = parseDate(day).getDay();
    return d === 0 ? 'weekend weekend-sun' : d === 6 ? 'weekend weekend-sat' : '';
  }
  function weekendLabel(day){
    const d = parseDate(day).getDay();
    return d === 0 ? '周日' : d === 6 ? '周六' : '';
  }
  function updateRangePresetButtons(){
    const range = calendarRange();
    document.querySelectorAll('[data-range-preset]').forEach(btn => {
      const n = Number(btn.dataset.rangePreset || 0);
      btn.classList.toggle('primary', range.start === today() && range.dayCount === n && range.end === addDay(today(), n - 1));
    });
  }
  function roomHasEmptyCalendarCell(room, days){
    const real = dedupeBookings(bookingsForRoom(room, ownerRealBookings()));
    const locks = dedupeBookings(bookingsForRoom(room, ownerLockBookings()));
    return (days || []).some(day => {
      const checkout = real.some(x => x.checkout === day);
      const checkin = real.some(x => x.checkin === day);
      const stay = real.some(x => x.checkin < day && x.checkout > day);
      const lock = locks.some(x => x.checkin <= day && x.checkout > day);
      return !checkout && !checkin && !stay && !lock;
    });
  }
  function calendarDaysForRange(range){
    const r = range || calendarRange();
    return Array.from({length: r.dayCount}, (_,i) => addDay(r.start,i));
  }
  function selectedCalendarRooms(range){
    const rows = ownerRooms();
    if(!ui.calendarVacancyOnly) return rows;
    return rows.filter(room => roomHasEmptyCalendarCell(room, calendarDaysForRange(range)));
  }
  function updateCalendarVacancyControls(range, visibleCount){
    const total = ownerRooms().length;
    const btn = qs('calendarVacancyOnlyBtn');
    if(btn){
      btn.classList.toggle('primary', !!ui.calendarVacancyOnly);
      btn.textContent = ui.calendarVacancyOnly ? '显示全部房间' : '只看空房';
    }
    const summary = qs('calendarVacancySummary');
    if(summary){
      summary.textContent = ui.calendarVacancyOnly ? `空房 ${visibleCount}/${total} 个房间` : '';
      summary.style.display = ui.calendarVacancyOnly ? 'inline-flex' : 'none';
    }
  }
  function toggleCalendarVacancyOnly(force){
    ui.calendarVacancyOnly = typeof force === 'boolean' ? force : !ui.calendarVacancyOnly;
    refreshCalendarRangeViewsImpl();
  }
  function renderOwnerCalendarImpl(){
    const startInput = qs('rangeStart');
    if(startInput && !startInput.value){ setRangePresetImpl(14); return; }
    const range = calendarRange();
    const days = calendarDaysForRange(range);
    const rows = selectedCalendarRooms(range);
    const grid = qs('calendarGrid');
    if(!grid) return;
    if(!rows.length){
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = `<div class="cell head">${ui.calendarVacancyOnly ? '当前日期范围没有空房' : '当前房源没有房间'}</div>`;
      updateRangePresetButtons();
      updateCalendarVacancyControls(range, rows.length);
      return;
    }
    grid.style.gridTemplateColumns = `140px repeat(${days.length}, minmax(64px,1fr))`;
    let html = `<div class="cell head">房间 / 日期</div>` + days.map(day => `<div class="cell head ${weekendClass(day)}">${esc(day.slice(5))}${weekendLabel(day)?`<span class="weekend-label">${weekendLabel(day)}</span>`:''}</div>`).join('');
    rows.forEach(room => {
      const real = dedupeBookings(bookingsForRoom(room, ownerRealBookings()));
      const locks = dedupeBookings(bookingsForRoom(room, ownerLockBookings()));
      html += `<div class="cell room">${ownerPropIds().length !== 1 ? `${esc(propName(roomPropId(room.id)))}<br>` : ''}${esc(roomName(room.id))}</div>`;
      days.forEach(day => {
        const checkout = real.find(x => x.checkout === day);
        const checkin = real.find(x => x.checkin === day);
        const stay = real.find(x => x.checkin < day && x.checkout > day);
        const lock = locks.find(x => x.checkin <= day && x.checkout > day);
        const hasNote = roomDateNoteFor(day, room.id).length > 0;
        const classes = ['cell'].concat(weekendClass(day).split(' ').filter(Boolean));
        const titles = [];
        let body = '';
        if(checkout && checkin){
          classes.push('calendar-booked','turnover');
          titles.push(`退房：${bookingLabels(checkout).join('/')} ${checkout.checkin} 到 ${checkout.checkout}`, `入住：${bookingLabels(checkin).join('/')} ${checkin.checkin} 到 ${checkin.checkout}`);
        }else if(checkout){
          classes.push('calendar-booked','checkout-only');
          titles.push(`退房：${bookingLabels(checkout).join('/')} ${checkout.checkin} 到 ${checkout.checkout}`);
        }else if(checkin){
          classes.push('calendar-booked','checkin-only');
          titles.push(`入住：${bookingLabels(checkin).join('/')} ${checkin.checkin} 到 ${checkin.checkout}`);
        }else if(stay){
          classes.push('calendar-booked','stay-only');
          body = `<span class="cell-platform">${esc(bookingLabels(stay).join('/'))}</span>`;
          titles.push(`在住：${bookingLabels(stay).join('/')} ${stay.checkin} 到 ${stay.checkout}`);
        }else if(lock){
          classes.push('locked');
          body = '<span class="cell-platform">不开放锁定</span>';
          titles.push(`不开放锁定：${lock.checkin} 到 ${lock.checkout}；${lockReason(lock)}`);
        }
        if(hasNote){
          classes.push('hasnote');
          body += '<span class="cell-note">备注</span>';
          titles.push('有房东日期备注');
        }
        html += `<div class="${classes.join(' ')}" title="${esc(titles.join('；'))}">${body}</div>`;
      });
    });
    grid.innerHTML = html;
    updateRangePresetButtons();
    updateCalendarVacancyControls(range, rows.length);
  }
  function renderSixMonthStatsImpl(){
    const range = calendarRange();
    const rooms = selectedCalendarRooms(range);
    const showProp = ownerPropIds().length !== 1;
    const el = qs('sixMonthStats');
    if(!el) return;
    const title = qs('futureStatsTitle') || (el.closest('.card') && el.closest('.card').querySelector('h2'));
    if(title) title.textContent = `${rangeLabel(range)}每个房间预订统计`;
    const rows = rooms.map(room => {
      const real = dedupeBookings(bookingsForRoom(room, ownerRealBookings())).filter(b => b.checkin < range.endExclusive && b.checkout > range.start);
      const locks = dedupeBookings(bookingsForRoom(room, ownerLockBookings())).filter(b => b.checkin < range.endExclusive && b.checkout > range.start);
      const orderDays = new Set();
      const lockDays = new Set();
      real.forEach(b => dateRange(b.checkin, addDay(b.checkout,-1)).forEach(d => { if(d >= range.start && d < range.endExclusive) orderDays.add(d); }));
      locks.forEach(b => dateRange(b.checkin, addDay(b.checkout,-1)).forEach(d => { if(d >= range.start && d < range.endExclusive) lockDays.add(d); }));
      const available = Math.max(0, range.dayCount - lockDays.size);
      const rate = available ? Math.round(orderDays.size / available * 1000) / 10 + '%' : '-';
      return `<tr>${showProp?`<td>${esc(propName(roomPropId(room.id)))}</td>`:''}<td>${esc(roomName(room.id))}</td><td>${real.length}</td><td>${orderDays.size}</td><td>${lockDays.size}</td><td>${available}</td><td>${rate}</td><td>${money(targetFee(room.id,'room'))}</td></tr>`;
    }).join('');
    el.innerHTML = `<table><tr>${showProp?'<th>房源</th>':''}<th>房间</th><th>订单数</th><th>订单晚数</th><th>不开放锁定晚数</th><th>可订晚数</th><th>预订率</th><th>单次保洁费</th></tr>${rows || `<tr><td colspan="${showProp?8:7}">当前筛选没有房间</td></tr>`}</table>`;
  }
  function renderOwnerBookingsImpl(){
    const range = calendarRange();
    const title = qs('futureBookingsTitle');
    if(title) title.textContent = `${rangeLabel(range)}预订列表`;
    const pf = qs('platformFilter') && qs('platformFilter').value || '';
    const calendarRoomEntities = new Set(selectedCalendarRooms(range).map(inventoryGroupId));
    let rows = dedupeBookings(ownerBookingsAll()).filter(b => b.checkin < range.endExclusive && b.checkout > range.start);
    if(ui.calendarVacancyOnly) rows = rows.filter(b => calendarRoomEntities.has(roomEntityId(b.room_id)));
    if(pf) rows = rows.filter(b => bookingLabels(b).includes(pf) || b.platform === pf);
    rows.sort((a,b) => String(a.checkin).localeCompare(String(b.checkin)) || roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const showProp = ownerPropIds().length !== 1;
    const el = qs('ownerBookings');
    if(!el) return;
    el.innerHTML = `<table><tr><th>入住/开始</th><th>退房/结束</th>${showProp?'<th>房源</th>':''}<th>房间</th><th>来源</th><th>客人</th><th>状态</th><th>日期备注</th></tr>${rows.length ? rows.map(b => {
      const locked = isLockedBooking(b);
      return `<tr class="${locked?'lock-row':''}"><td>${esc(b.checkin)}</td><td>${esc(b.checkout)}</td>${showProp?`<td>${esc(propName(roomPropId(b.room_id)))}</td>`:''}<td><span class="badge">${esc(roomName(b.room_id))}</span></td><td>${bookingSourceBadges(b)}</td><td>${locked?'':esc(b.guest || '')}</td><td>${locked?`<span class="badge red">不开放锁定</span> ${esc(lockReason(b))}`:esc(b.status || '')}</td><td>${getRoomNotes().filter(n => n.room_id === b.room_id && n.date >= b.checkin && n.date <= b.checkout).length}</td></tr>`;
    }).join('') : `<tr><td colspan="${showProp?8:7}">当前日期范围没有预订</td></tr>`}</table>`;
  }
  function refreshCalendarRangeViewsImpl(){
    initSelectsImpl();
    renderOwnerMetricsImpl();
    renderOwnerCalendarImpl();
    renderSixMonthStatsImpl();
    renderOwnerBookingsImpl();
  }

  function dailyEmptyRooms(date, real, locks){
    return ownerRooms().filter(r => {
      const entity = inventoryGroupId(r);
      return !real.some(b => roomEntityId(b.room_id) === entity && b.checkin <= date && b.checkout > date) &&
        !locks.some(b => roomEntityId(b.room_id) === entity && b.checkin <= date && b.checkout > date);
    });
  }
  function renderDailyWorkImpl(){
    const wd = qs('workDate');
    if(wd && !wd.value) wd.value = today();
    const d = (wd && wd.value) || today();
    const real = ownerRealBookings();
    const locks = ownerLockBookings().filter(b => b.checkin <= d && b.checkout > d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const checkouts = real.filter(b => b.checkout === d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const checkins = real.filter(b => b.checkin === d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const stays = real.filter(b => b.checkin < d && b.checkout > d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const empty = dailyEmptyRooms(d, real, locks);
    const pendingReviewRows = cancelReviewTaskRows(d,d,true).filter(r => r.date === d && String(r.review_status || 'pending') !== 'clean_needed');
    const cleanRows = scopedCleaningRows(d,d).filter(r => r.date === d).concat(pendingReviewRows);
    const notes = getNotes().filter(n => !n.cancellation_review && n.date === d && targetMatches(n.target_id,n.target_type || 'room')).concat(getRoomNotes().filter(n => n.date === d && roomMatches(n.room_id)).map(n => ({...n,target_id:n.room_id,target_type:'room',roomDate:true})));
    const metrics = qs('dailyWorkMetrics');
    if(metrics) metrics.innerHTML = `<div class="metric"><div class="small">退房</div><div class="num">${checkouts.length}</div></div><div class="metric"><div class="small">入住</div><div class="num">${checkins.length}</div></div><div class="metric"><div class="small">剩余在住</div><div class="num">${stays.length}</div></div><div class="metric"><div class="small">空房</div><div class="num">${empty.length}</div></div><div class="metric"><div class="small">不开放锁定</div><div class="num">${locks.length}</div></div><div class="metric"><div class="small">保洁任务</div><div class="num">${cleanRows.length}</div></div>`;
    function bookingCards(title, rows, cls){
      return `<div class="work-card ${cls}"><h3>${title}（${rows.length}）</h3>${rows.length ? rows.map(b => {
        const left = Math.max(0, daysBetweenSafe(d,b.checkout));
        const main = cls === 'checkout' ? `退房：${esc(b.checkout)} ｜ 入住：${esc(b.checkin)}` : `还剩 ${left} 天退房 ｜ 退房：${esc(b.checkout)}`;
        return `<div class="note-card"><div class="note-title"><span class="badge">${esc(roomName(b.room_id))}</span> ${bookingSourceBadges(b)}</div><div>${main}</div><div class="small">订单：${esc(b.checkin)} → ${esc(b.checkout)}${b.guest?` ｜ 客人：${esc(b.guest)}`:''}</div>${inlineNotes(d,b.room_id,'room')}</div>`;
      }).join('') : '<p class="small">暂无</p>'}</div>`;
    }
    const content = qs('dailyWorkContent');
    if(content) content.innerHTML = `<div class="work-grid">${bookingCards('退房',checkouts,'checkout')}${bookingCards('入住',checkins,'checkin')}${bookingCards('剩余在住',stays,'stay')}<div class="work-card empty"><h3>空房（${empty.length}）</h3>${empty.length ? empty.map(r => `<div class="note-card"><div class="note-title"><span class="badge green">${esc(roomName(r.id))}</span></div><div class="small">当晚没有入住、在住或锁定记录。</div>${inlineNotes(d,r.id,'room')}</div>`).join('') : '<p class="small">暂无空房</p>'}</div><div class="work-card locked"><h3>不开放锁定（${locks.length}）</h3>${locks.length ? locks.map(b => `<div class="note-card"><div class="note-title"><span class="badge orange">${esc(roomName(b.room_id))}</span> <span class="badge red">不开放锁定</span></div><div>${esc(b.checkin)} → ${esc(b.checkout)}</div><div class="small">原因：${esc(lockReason(b))}</div></div>`).join('') : '<p class="small">暂无</p>'}</div></div><div class="card"><h2>当天保洁任务</h2>${cleaningTableScoped(cleanRows)}</div><div class="card"><h2>当天备注</h2>${notes.length ? notes.map(n => `<div class="note-card ${n.priority === '重要' ? 'important' : ''}"><div class="note-title">${priorityBadge(n.priority)} ${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))} ${n.roomDate?'日期备注':''}</div><div>${esc(n.note)}</div></div>`).join('') : '<p class="small">暂无备注</p>'}</div>`;
  }

  function renderCleaningManagerShell(){
    const root = qs('ownerCleaningShell');
    if(!root) return;
    root.innerHTML = `<div class="card"><h2>手动调整实际保洁</h2><div class="formgrid"><div><label>日期</label><input id="manualDate" type="date"></div><div><label>对象</label><select id="manualTarget"></select></div><div><label>调整类型</label><select id="manualType"><option value="add">额外增加保洁</option><option value="remove">取消系统保洁</option></select></div><div><label>调整金额</label><input id="manualAmount" type="number" step="0.01"></div><div><label>原因</label><input id="manualReason" placeholder="例如：临时加扫 / 实际没打扫"></div></div><br><button class="smallbtn primary" onclick="addManualChange()">添加调整记录</button></div><div class="card"><div class="toolbar"><h2 style="margin:0">手动调整记录</h2><input id="manualFilterStart" type="date" onchange="renderManualRecords()"><input id="manualFilterEnd" type="date" onchange="renderManualRecords()"><select id="manualFilterTarget" onchange="renderManualRecords()"></select><select id="manualFilterType" onchange="renderManualRecords()"><option value="">全部调整</option><option value="add">额外增加</option><option value="remove">取消保洁</option></select></div><div id="manualRecords"></div></div><div class="card"><div class="property-detail-head"><div><h2>保洁费用统计</h2><div class="small">按日期排序，再按房间排序；历史和将来分开显示。</div></div><div class="property-actions"><input id="cleanStart" type="date" onchange="renderCleaningFinance()"><input id="cleanEnd" type="date" onchange="renderCleaningFinance()"></div></div><div id="cleaningFinance"></div></div>`;
    const md = qs('manualDate'); if(md && !md.value) md.value = today();
    const cs = qs('cleanStart'); if(cs && !cs.value) cs.value = addDay(today(), -30);
    const ce = qs('cleanEnd'); if(ce && !ce.value) ce.value = addDay(today(), 30);
    initSelectsImpl();
  }
  function addManualChangeImpl(){
    const target = parseTarget(qs('manualTarget') && qs('manualTarget').value);
    if(!target.id) return alert('请选择对象');
    getManual().unshift({id:'manual_'+Date.now(),date:(qs('manualDate') && qs('manualDate').value) || today(),target_id:target.id,target_type:target.type,type:(qs('manualType') && qs('manualType').value) || 'add',amount:Number((qs('manualAmount') && qs('manualAmount').value) || 0),reason:(qs('manualReason') && qs('manualReason').value) || '未填写原因',created_by:userName('房东'),created_at:nowIso()});
    if(qs('manualReason')) qs('manualReason').value = '';
    if(qs('manualAmount')) qs('manualAmount').value = '';
    persistAll().then(renderAll).catch(e => alert('保存失败：' + e.message));
  }
  function renderManualRecordsImpl(){
    const fs = qs('manualFilterStart') && qs('manualFilterStart').value;
    const fe = qs('manualFilterEnd') && qs('manualFilterEnd').value;
    const ft = qs('manualFilterType') && qs('manualFilterType').value;
    const obj = qs('manualFilterTarget') && qs('manualFilterTarget').value;
    let rows = getManual().filter(m => targetMatches(m.target_id,m.target_type || 'room'));
    if(fs) rows = rows.filter(m => m.date >= fs);
    if(fe) rows = rows.filter(m => m.date <= fe);
    if(ft) rows = rows.filter(m => m.type === ft);
    if(obj){const parsed = parseTarget(obj); rows = rows.filter(m => (m.target_type || 'room') === parsed.type && String(m.target_id) === String(parsed.id));}
    rows.sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const el = qs('manualRecords');
    if(el) el.innerHTML = renderManualRecordsHTMLImpl(rows,false);
  }
  function renderManualRecordsHTMLImpl(rows, withCard=true){
    const table = `<table><tr><th>日期</th><th>对象</th><th>类型</th><th>调整金额</th><th>原因</th><th>操作人</th></tr>${(rows || []).map(m => `<tr><td>${esc(m.date)}</td><td>${objectBadge(m.target_type)} ${esc(targetName(m.target_id,m.target_type))}</td><td>${changeBadge(m.type)}</td><td>${signedMoney(m.amount)}</td><td>${esc(m.reason || '')}</td><td>${esc(m.created_by || '')}</td></tr>`).join('') || '<tr><td colspan="6">暂无记录</td></tr>'}</table>`;
    return withCard ? `<div class="card">${table}</div>` : table;
  }
  function renderCleaningFinanceImpl(){
    const cs = qs('cleanStart'), ce = qs('cleanEnd');
    if(cs && !cs.value) cs.value = addDay(today(), -30);
    if(ce && !ce.value) ce.value = addDay(today(), 30);
    const start = (cs && cs.value) || addDay(today(), -30);
    const end = (ce && ce.value) || addDay(today(), 30);
    const rows = scopedCleaningRows(start,end).filter(r => r.date >= start && r.date <= end).sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const history = rows.filter(r => r.date < today());
    const future = rows.filter(r => r.date >= today());
    const total = rows.reduce((s,r) => s + rowAmount(r), 0);
    const roomTotal = rows.filter(r => (r.target_type || 'room') === 'room').reduce((s,r) => s + rowAmount(r), 0);
    const commonTotal = rows.filter(r => r.target_type === 'common').reduce((s,r) => s + rowAmount(r), 0);
    const el = qs('cleaningFinance');
    if(!el) return;
    const section = (title, list) => `<div class="finance-section"><h3>${title}（${list.length}）</h3>${cleaningTableScoped(list)}</div>`;
    el.innerHTML = `<div class="grid"><div class="metric"><div class="small">保洁次数</div><div class="num">${rows.length}</div></div><div class="metric"><div class="small">房间费用</div><div class="num">${money(roomTotal)}</div></div><div class="metric"><div class="small">公区费用</div><div class="num">${money(commonTotal)}</div></div><div class="metric"><div class="small">合计费用</div><div class="num">${money(total)}</div></div></div>${section('历史保洁',history)}${section('将来保洁',future)}`;
  }

  function renderOwnerNotesShell(){
    const root = qs('ownerNotesShell');
    if(!root) return;
    root.innerHTML = `<div class="card"><h2>保洁备注</h2><div class="formgrid"><div><label>日期</label><input id="noteDate" type="date"></div><div><label>对象</label><select id="noteTarget"></select></div><div><label>优先级</label><select id="notePriority"><option>普通</option><option>重要</option></select></div><div><label>调整金额</label><input id="noteAmount" type="number" step="0.01" placeholder="可不填"></div></div><label style="margin-top:12px">备注内容</label><textarea id="noteText" placeholder="写给保洁看的事项"></textarea><br><br><button class="smallbtn primary" onclick="addCleaningNote()">保存保洁备注</button></div><div class="card"><h2>指定房间日期备注</h2><div class="formgrid"><div><label>日期</label><input id="roomNoteDate" type="date"></div><div><label>房间</label><select id="roomNoteRoom"></select></div><div><label>优先级</label><select id="roomNotePriority"><option>普通</option><option>重要</option></select></div></div><label style="margin-top:12px">备注内容</label><textarea id="roomNoteText" placeholder="例如：纪念日布置、婴儿床、提前放红酒"></textarea><br><br><button class="smallbtn primary" onclick="addRoomDateNote()">添加房间日期备注</button></div><div class="card"><div class="toolbar"><h2 style="margin:0">备注记录</h2><input id="noteFilterDate" type="date" onchange="renderOwnerNotes()"><select id="noteFilterTargetType" onchange="renderOwnerNotes()"><option value="">全部</option><option value="room">房间</option><option value="common">公区</option><option value="roomDate">房间日期备注</option></select></div><div id="ownerNotesList"></div></div>`;
    ['noteDate','roomNoteDate'].forEach(id => { const el = qs(id); if(el && !el.value) el.value = today(); });
    initSelectsImpl();
  }
  function addCleaningNoteImpl(){
    const target = parseTarget(qs('noteTarget') && qs('noteTarget').value);
    const text = (qs('noteText') && qs('noteText').value || '').trim();
    if(!target.id) return alert('请选择对象');
    if(!text) return alert('请先填写备注内容');
    const amountText = String(qs('noteAmount') && qs('noteAmount').value || '').trim();
    getNotes().unshift({id:'note_'+Date.now(),date:(qs('noteDate') && qs('noteDate').value) || today(),target_id:target.id,target_type:target.type,note:text,priority:(qs('notePriority') && qs('notePriority').value) || '普通',amount:amountText === '' ? 0 : Number(amountText),amount_present:amountText !== '',created_by:userName('房东'),created_at:nowIso()});
    if(qs('noteText')) qs('noteText').value = '';
    if(qs('noteAmount')) qs('noteAmount').value = '';
    persistAll().then(renderAll).catch(e => alert('保存失败：' + e.message));
  }
  function addRoomDateNoteImpl(){
    const text = (qs('roomNoteText') && qs('roomNoteText').value || '').trim();
    const roomId = qs('roomNoteRoom') && qs('roomNoteRoom').value;
    if(!roomId) return alert('请选择房间');
    if(!text) return alert('请先填写备注内容');
    getRoomNotes().unshift({id:'roomnote_'+Date.now(),date:(qs('roomNoteDate') && qs('roomNoteDate').value) || today(),room_id:roomId,note:text,priority:(qs('roomNotePriority') && qs('roomNotePriority').value) || '普通',created_by:userName('房东'),created_at:nowIso()});
    if(qs('roomNoteText')) qs('roomNoteText').value = '';
    persistAll().then(renderAll).catch(e => alert('保存失败：' + e.message));
  }
  function renderOwnerNotesImpl(){
    const fd = qs('noteFilterDate') && qs('noteFilterDate').value;
    const ft = qs('noteFilterTargetType') && qs('noteFilterTargetType').value;
    let rows = [];
    if(!ft || ft === 'room' || ft === 'common') rows = rows.concat(getNotes().map(n => ({...n,kind:'cleaning'})));
    if(!ft || ft === 'roomDate') rows = rows.concat(getRoomNotes().map(n => ({...n,date:n.date,target_id:n.room_id,target_type:'room',kind:'roomDate'})));
    rows = rows.filter(n => n.kind === 'roomDate' ? roomMatches(n.target_id) : targetMatches(n.target_id,n.target_type || 'room'));
    if(fd) rows = rows.filter(n => n.date === fd);
    if(ft === 'room' || ft === 'common') rows = rows.filter(n => (n.target_type || 'room') === ft && n.kind === 'cleaning');
    if(ft === 'roomDate') rows = rows.filter(n => n.kind === 'roomDate');
    rows.sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const el = qs('ownerNotesList');
    if(el) el.innerHTML = rows.length ? `<table><tr><th>日期</th><th>对象</th><th>类型</th><th>备注</th><th>金额</th><th>操作人</th></tr>${rows.map(n => `<tr><td>${esc(n.date)}</td><td>${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))}</td><td>${n.kind === 'roomDate' ? '<span class="badge purple">房间日期备注</span>' : priorityBadge(n.priority)}</td><td>${esc(n.note)}</td><td>${n.amount_present ? signedMoney(n.amount) : ''}</td><td>${esc(n.created_by || '')}</td></tr>`).join('')}</table>` : '<p class="small">暂无备注</p>';
  }

  function channelRows(roomId){
    return getChannels().filter(ch => String(ch.room_id) === String(roomId));
  }
  function feedUrlForRoom(room){
    return `${location.origin}/feed/${encodeURIComponent(inventoryGroupId(room))}.ics`;
  }
  function channelInputId(id,field){return `channel_${safe(id)}_${field}`;}
  function looksLikePublicListingUrl(url){
    const text = String(url || '').trim().toLowerCase();
    if(!/^https?:\/\//.test(text)) return false;
    return /airbnb\.[^/]+\/rooms\//.test(text) || /\/rooms\/[0-9a-z_-]+/.test(text) || /booking\.[^/]+\/hotel\//.test(text) || /vrbo\.[^/]+\//.test(text);
  }
  function looksLikeIcalUrl(url){
    const text = String(url || '').trim();
    if(!text) return true;
    if(!/^https?:\/\//i.test(text)) return false;
    try{
      const parsed = new URL(text);
      const combined = (parsed.pathname + '?' + parsed.search).toLowerCase();
      return combined.includes('.ics') || combined.includes('/ical') || combined.includes('ical') || combined.includes('calendar') || combined.includes('export');
    }catch(e){
      return false;
    }
  }
  function cleanChannelUrls(row, updateInputs){
    if(!row) return {ok:false, message:'没有找到这个渠道。'};
    const icalInput = qs(channelInputId(row.id,'ical'));
    const listingInput = qs(channelInputId(row.id,'listing'));
    if(looksLikePublicListingUrl(row.ical_url)){
      if(!row.listing_url) row.listing_url = row.ical_url;
      row.ical_url = '';
      if(updateInputs){
        if(icalInput) icalInput.value = '';
        if(listingInput) listingInput.value = row.listing_url || '';
      }
      return {ok:true, moved:true, message:'你填的是公开房源页面链接，已移到“公开房源链接”。订单同步还需要粘贴平台导出的 .ics iCal。'};
    }
    if(row.ical_url && !looksLikeIcalUrl(row.ical_url)){
      return {ok:false, message:'“平台导出 iCal”必须填写平台日历导出的 .ics/iCal 链接，不能填写普通网页链接。'};
    }
    return {ok:true, message:''};
  }
  function readChannelForm(id){
    const list = getChannels();
    const row = list.find(ch => String(ch.id) === String(id));
    if(!row) return null;
    row.platform = (qs(channelInputId(id,'platform')) && qs(channelInputId(id,'platform')).value) || row.platform || 'Airbnb';
    row.ical_url = (qs(channelInputId(id,'ical')) && qs(channelInputId(id,'ical')).value || '').trim();
    row.listing_url = (qs(channelInputId(id,'listing')) && qs(channelInputId(id,'listing')).value || '').trim();
    row.channel_note = (qs(channelInputId(id,'note')) && qs(channelInputId(id,'note')).value || '').trim();
    row.updated_at = nowIso();
    return row;
  }
  function renderChannel(room,ch){
    const urlIssue = cleanChannelUrls({...ch}, false);
    const status = urlIssue.moved ? `<span class="sync-status warn">${esc(urlIssue.message)}</span>` : (!urlIssue.ok ? `<span class="sync-status warn">${esc(urlIssue.message)}</span>` : (ch.sync_error ? `<span class="sync-status error">同步失败：${esc(ch.sync_error)}</span>` : (ch.last_sync ? `<span class="sync-status ok">同步：${esc(ch.last_sync)} · ${Number(ch.synced_booking_count || 0)} 条</span>` : '<span class="sync-status warn">未同步</span>')));
    return `<div class="channel-card"><div class="channel-grid"><div><label>平台</label><select id="${channelInputId(ch.id,'platform')}"><option ${ch.platform==='Airbnb'?'selected':''}>Airbnb</option><option ${ch.platform==='Booking'?'selected':''}>Booking</option><option ${ch.platform==='Vrbo'?'selected':''}>Vrbo</option><option ${ch.platform==='Other'?'selected':''}>Other</option></select></div><div><label>平台导出 iCal</label><input id="${channelInputId(ch.id,'ical')}" value="${esc(ch.ical_url || '')}" placeholder="粘贴平台导出的 .ics/iCal，不是房源页面"></div><div><label>公开房源链接</label><input id="${channelInputId(ch.id,'listing')}" value="${esc(ch.listing_url || '')}" placeholder="粘贴客人可见的公开房源页面"></div><div><label>备注</label><input id="${channelInputId(ch.id,'note')}" value="${esc(ch.channel_note || '')}" placeholder="账号/房源备注"></div><div class="property-actions"><button class="smallbtn primary" onclick="saveChannelListing('${esc(ch.id)}',this)">保存</button><button class="smallbtn" onclick="deleteChannelListing('${esc(ch.id)}',this)">删除</button></div></div><div class="channel-row"><div>${status}</div><button class="smallbtn" onclick="copyText('${esc(feedUrlForRoom(room))}')">复制防超卖 iCal</button></div><div class="feed-line">${esc(feedUrlForRoom(room))}</div></div>`;
  }
  function renderRoomCard(room){
    const editing = ui.editingRoom === room.id;
    const channels = channelRows(room.id);
    const roomHead = editing
      ? `<div class="room-basics"><div><label>房间名称</label><input id="roomName_${safe(room.id)}" value="${esc(room.name || '')}"></div><div><label>单次保洁费</label><input id="roomFee_${safe(room.id)}" type="number" value="${esc(room.cleaning_fee || 0)}"></div><div class="property-actions"><button class="smallbtn primary" onclick="saveRoomBasics('${esc(room.id)}',this)">保存</button><button class="smallbtn" onclick="cancelRoomBasics()">取消</button></div></div>`
      : `<div><strong>${esc(room.name || room.id)}</strong><div class="small">清洁费：${money(room.cleaning_fee || 0)} · ${channels.length} 个渠道</div></div><div class="property-actions"><button class="smallbtn" onclick="editRoomBasics('${esc(room.id)}')">修改</button><button class="smallbtn" onclick="deleteRoomUi('${esc(room.id)}',this)">删除</button></div>`;
    return `<div class="room-setting-card"><div class="room-head">${roomHead}</div><div class="property-subcard"><div class="property-detail-head"><div><h3 style="margin:0">渠道 / iCal</h3><div class="small">同一个真实房间只建一次；多个 Airbnb 账号或平台都作为渠道挂在这里。</div></div><button class="smallbtn primary" onclick="addChannelListing('${esc(room.id)}')">添加渠道</button></div><div class="channel-list">${channels.length ? channels.map(ch => renderChannel(room,ch)).join('') : '<div class="empty-panel">还没有渠道。点击“添加渠道”后粘贴 Airbnb/平台导出的 iCal。</div>'}</div></div></div>`;
  }
  function renderCleanerPanel(prop){
    const cleaners = propCleaners(prop.id);
    return `<div class="settings-section"><div class="property-detail-head"><div><h3 style="margin:0">保洁绑定</h3><div class="small">输入保洁编号后绑定到这个房源。</div></div></div><div class="channel-row"><input id="cleanerCode_${safe(prop.id)}" placeholder="例如 CLN-1091"><button class="smallbtn primary" onclick="bindPropertyCleanerUi('${esc(prop.id)}',this)">绑定保洁</button></div><div class="property-meta">${cleaners.length ? cleaners.map(c => `<span class="badge green">${esc(c.cleaner_code)} <button class="tiny-link" onclick="unbindPropertyCleanerUi('${esc(prop.id)}','${esc(c.cleaner_code)}',this)">删除</button></span>`).join('') : '<span class="small">还没有绑定保洁。</span>'}</div></div>`;
  }
  function renderCommonAreaPanel(prop){
    const areas = propAreas(prop.id);
    return `<div class="settings-section"><div class="property-detail-head"><div><h3 style="margin:0">公区设置</h3><div class="small">公区默认每天保洁，费用计入保洁统计。</div></div><button class="smallbtn primary" onclick="addCommonArea('${esc(prop.id)}')">添加公区</button></div><div class="channel-list">${areas.length ? areas.map(a => `<div class="channel-card"><div class="channel-grid"><div><label>名称</label><input id="areaName_${safe(a.id)}" value="${esc(a.name || '')}"></div><div><label>每日费用</label><input id="areaFee_${safe(a.id)}" type="number" value="${esc(a.cleaning_fee || 0)}"></div><div><label>是否每日保洁</label><select id="areaDaily_${safe(a.id)}"><option value="true" ${a.daily_default!==false?'selected':''}>每天打扫</option><option value="false" ${a.daily_default===false?'selected':''}>不默认</option></select></div><div></div><div class="property-actions"><button class="smallbtn primary" onclick="saveCommonAreaBasics('${esc(a.id)}',this)">保存</button><button class="smallbtn" onclick="deleteCommonAreaUi('${esc(a.id)}',this)">删除</button></div></div></div>`).join('') : '<div class="empty-panel">还没有公区。</div>'}</div></div>`;
  }
  function renderRoomSettingsImpl(){
    ensureOwnerPropertyModuleVisible();
    const root = ensureRoomSettingsShell();
    if(!root) return;
    const prop = selectedProp();
    if(!prop){
      root.innerHTML = `<div class="empty-panel"><strong>从上方房源管理进入房间管理</strong><div class="small" style="margin-top:8px">房源模块可以添加、改名、删除；进入房源后这里显示房间、公区、iCal 和保洁绑定。</div></div>`;
      return;
    }
    const rooms = propRooms(prop.id);
    const sync = ui.syncResults[prop.id];
    root.innerHTML = `<div class="property-detail-head"><div><h2 style="margin:0">${esc(prop.name || prop.id)} 房间管理</h2><div class="small">${rooms.length} 个房间 · ${propAreas(prop.id).length} 个公区 · ${propCleaners(prop.id).length} 个保洁绑定</div></div><div class="property-actions"><button class="smallbtn" onclick="backToPropertyList()">返回房源列表</button><button class="smallbtn primary" onclick="syncPropertyIcal('${esc(prop.id)}',this)">同步当前房源 iCal</button>${sync?`<span class="sync-status ${sync.kind || ''}">${esc(sync.text || '')}</span>`:''}</div></div>${renderCleanerPanel(prop)}${renderCommonAreaPanel(prop)}<div class="settings-section"><div class="property-detail-head"><div><h3 style="margin:0">房间设置</h3><div class="small">每个真实房间只建一次；重复上架用“渠道”关联在房间下方。</div></div><button class="smallbtn primary" onclick="addRoom('${esc(prop.id)}')">添加房间</button></div><div class="room-setting-list">${rooms.length ? rooms.map(renderRoomCard).join('') : '<div class="empty-panel">这个房源还没有房间。</div>'}</div></div>`;
  }

  function renderOwnerImpl(){
    ensureBaseShell();
    ensureStyles();
    removeLegacyIntroCards();
    if(!currentDataCount() && ui.loading){ensureDataGate('正在加载房源数据...'); return;}
    ensureOwnerPropertyModuleVisible();
    initSelectsImpl();
    renderOwnerMetricsImpl();
    ensureOwnerMailTab();
    ensureOwnerProfileTab();
    renderOwnerTabImpl(activeOwnerTabId());
    setHeader('owner');
    ensureLogoutButton();
    ensureVersionBadge();
  }
  function activeOwnerTabId(){const active = document.querySelector('#owner > .tab-content.active'); return active && active.id ? active.id : 'ownerDailyWork';}
  function renderOwnerTabImpl(id){
    const tab = id || activeOwnerTabId();
    if(tab === 'ownerCalendar'){renderOwnerCalendarImpl(); renderSixMonthStatsImpl(); renderOwnerBookingsImpl();}
    else if(tab === 'ownerCleaning'){renderCleaningManagerShell(); renderManualRecordsImpl(); renderCleaningFinanceImpl();}
    else if(tab === 'ownerRooms'){renderRoomSettingsImpl();}
    else if(tab === 'ownerNotes'){renderOwnerNotesShell(); renderOwnerNotesImpl();}
    else if(tab === 'ownerMail'){renderOwnerMail();}
    else if(tab === 'ownerProfile'){renderUserProfileImpl();}
    else renderDailyWorkImpl();
  }
  function showOwnerTabImpl(id,btn){
    document.querySelectorAll('#owner > .tab-content').forEach(tab => tab.classList.remove('active'));
    const pane = qs(id);
    if(pane) pane.classList.add('active');
    const bar = btn && btn.parentElement ? btn.parentElement : document.querySelector('#owner .tabbar');
    if(bar) bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    renderOwnerTabImpl(id);
    ensureOwnerPropertyModuleVisible();
  }

  function cleanerBoundPropertyIds(){
    const u = getCurrentUser() || {};
    const code = String(u.cleaner_code || '').trim().toUpperCase();
    if(!code) return new Set();
    return new Set(getPropertyCleaners().filter(x => String(x.cleaner_code || '').trim().toUpperCase() === code).map(x => x.property_id).filter(Boolean));
  }
  function cleanerCanSeeTarget(targetId,type){
    if(!isActualCleaner()) return targetMatches(targetId,type);
    const ids = cleanerBoundPropertyIds();
    if(!ids.size) return false;
    return ids.has(targetPropId(targetId,type));
  }
  function cleanerBoundProperties(){
    if(!isActualCleaner()) return propList().filter(p => ownerPropIds().includes(p.id));
    const ids = cleanerBoundPropertyIds();
    return propList().filter(p => ids.has(p.id));
  }
  function cleanerSummaryHtml(){
    const bound = cleanerBoundProperties();
    const title = userName(isActualCleaner() ? '保洁' : '房东');
    if(isActualCleaner()){
      const code = (getCurrentUser() && getCurrentUser().cleaner_code) || '-';
      return `<div class="card"><div class="property-detail-head"><div><h2>${esc(title)}</h2><div class="small">保洁编号：${esc(code)} · 已绑定房源：${esc(bound.map(p => p.name || p.id).join('、') || '还没有绑定房源')}</div></div><span class="badge green">${bound.length} 个房源</span></div></div>`;
    }
    return `<div class="card"><div class="property-detail-head"><div><h2>${esc(title)}</h2><div class="small">房东账号 · 可查看房源：${esc(bound.map(p => p.name || p.id).join('、') || '还没有房源')}</div></div><span class="badge green">${bound.length} 个房源</span></div></div>`;
  }
  function profileEmail(user){
    const direct = String((user && user.email) || '').trim();
    if(direct) return direct;
    const username = String((user && user.username) || '').trim();
    return username.includes('@') ? username : '';
  }
  function profilePhone(user){
    return String((user && (user.phone || user.mobile || user.tel || user.phone_number)) || '').trim();
  }
  function profileWechat(user){
    return String((user && (user.wechat || user.weixin || user.wx || user.wechat_id)) || '').trim();
  }
  function isCleanerProfile(user){
    const userRole = String((user && user.role) || '').trim().toLowerCase();
    return userRole === 'cleaner';
  }
  function roleLabel(value){
    const text = String(value || role() || '').toLowerCase();
    if(text === 'admin') return '管理员';
    if(text === 'owner') return '房东';
    if(text === 'cleaner') return '保洁';
    return text || '未识别';
  }
  function renderUserProfilePanel(rootId){
    const root = qs(rootId);
    if(!root) return;
    const u = getCurrentUser() || {};
    const email = profileEmail(u);
    const phone = profilePhone(u);
    const wechat = profileWechat(u);
    const cleanerCode = u.cleaner_code || u.cleanerCode || '';
    const cleanerCodeField = isCleanerProfile(u) ? `<div class="profile-field"><label>保洁编号</label><input readonly value="${esc(cleanerCode || '未生成')}"></div>` : '';
    root.innerHTML = `<div class="card user-profile-card"><div class="property-detail-head"><div><h2>用户设置</h2><div class="small">查看当前登录账号资料；这里只能修改对外显示名。</div></div><span class="badge green">${esc(roleLabel(u.role))}</span></div><div class="profile-grid"><div class="profile-field"><label>对外显示名</label><input id="${rootId}_displayName" value="${esc(u.name || '')}" placeholder="例如 zhoulimei"></div><div class="profile-field"><label>用户名</label><input readonly value="${esc(u.username || '未填写')}"></div><div class="profile-field"><label>邮箱</label><input readonly value="${esc(email || '未填写')}"></div><div class="profile-field"><label>手机号</label><input readonly value="${esc(phone || '未填写')}"></div><div class="profile-field"><label>微信号</label><input readonly value="${esc(wechat || '未填写')}"></div>${cleanerCodeField}<div class="profile-field"><label>账号类型</label><input readonly value="${esc(roleLabel(u.role))}"></div></div><div class="profile-actions"><button class="smallbtn primary" onclick="saveUserProfile('${rootId}',this)">保存显示名</button><span id="${rootId}_profileStatus" class="profile-status"></span></div></div>`;
  }
  function renderUserProfileImpl(){
    renderUserProfilePanel('ownerProfile');
    if(isActualCleaner()) renderUserProfilePanel('cleanerProfile');
    else {
      const pane = qs('cleanerProfile');
      if(pane) pane.innerHTML = '';
    }
  }
  async function saveUserProfile(rootId,btn){
    const input = qs(rootId + '_displayName');
    const name = String((input && input.value) || '').trim();
    if(!name) return alert('对外显示名不能为空。');
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = '保存中...';}
    try{
      const res = await fetch(apiUrl('/api/profile'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name})
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('保存失败 HTTP ' + res.status));
      if(data.user) setCurrentUser({...getCurrentUser(), ...data.user});
      if(data.state) applyStateFromServerImpl(data.state);
      renderUserProfileImpl();
      setHeader(isActualCleaner() ? 'cleaner' : 'owner');
      const status = qs(rootId + '_profileStatus');
      if(status) status.textContent = '已保存';
    }catch(e){
      alert('保存用户设置失败：' + (e && e.message ? e.message : e));
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || '保存显示名';}
    }
  }
  function renderCleanerNotesToday(){
    const rows = getNotes().filter(n => n.date === today() && cleanerCanSeeTarget(n.target_id,n.target_type || 'room')).concat(getRoomNotes().filter(n => n.date === today() && cleanerCanSeeTarget(n.room_id,'room')).map(n => ({...n,target_id:n.room_id,target_type:'room',roomDate:true})));
    if(!rows.length) return '';
    return `<div class="card"><h2>今日特别备注</h2>${rows.map(n => `<div class="note-card ${n.priority === '重要' ? 'important' : ''}"><div class="note-title">${priorityBadge(n.priority)} ${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))} ${n.roomDate?'日期备注':''}</div><div>${esc(n.note)}</div></div>`).join('')}</div>`;
  }
  function renderCleanerImpl(){
    ensureBaseShell();
    ensureStyles();
    const rows = actualCleaningRowsImpl(addDay(today(),-90), addDay(today(),180)).filter(r => cleanerCanSeeTarget(r.target_id,r.target_type));
    const todayRows = rows.filter(r => r.date === today()).sort((a,b) => targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const futureRows = rows.filter(r => r.date > today()).sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN')).slice(0,120);
    const historyRows = rows.filter(r => r.date < today()).sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const summary = qs('cleanerSummary'); if(summary) summary.innerHTML = cleanerSummaryHtml();
    const metrics = qs('cleanerMetrics'); if(metrics) metrics.innerHTML = `<div class="metric"><div class="small">${isActualCleaner()?'已绑定房源':'可查看房源'}</div><div class="num">${cleanerBoundProperties().length}</div></div><div class="metric"><div class="small">可查看房间</div><div class="num">${getRooms().filter(r => cleanerCanSeeTarget(r.id,'room')).length}</div></div><div class="metric"><div class="small">今日保洁</div><div class="num">${todayRows.length}</div></div><div class="metric"><div class="small">今日备注</div><div class="num">${getNotes().filter(n => n.date === today() && cleanerCanSeeTarget(n.target_id,n.target_type || 'room')).length + getRoomNotes().filter(n => n.date === today() && cleanerCanSeeTarget(n.room_id,'room')).length}</div></div><div class="metric"><div class="small">未来保洁</div><div class="num">${futureRows.length}</div></div>`;
    const notes = qs('cleanerTodayNotes'); if(notes) notes.innerHTML = renderCleanerNotesToday();
    const todayBox = qs('cleanerToday'); if(todayBox) todayBox.innerHTML = cleaningTableScoped(todayRows);
    const futureBox = qs('cleanerFuture'); if(futureBox) futureBox.innerHTML = cleaningTableScoped(futureRows);
    const manualBox = qs('cleanerManual'); if(manualBox) manualBox.innerHTML = renderManualRecordsHTMLImpl(getManual().filter(m => cleanerCanSeeTarget(m.target_id,m.target_type || 'room')),false);
    const groups = {};
    historyRows.forEach(r => (groups[monthKey(r.date)] ||= []).push(r));
    const historyBox = qs('cleanerHistory');
    if(historyBox) historyBox.innerHTML = `<div class="card"><h2>历史保洁 | 按月统计</h2><div class="small">默认折叠，点月份展开。公区每日保洁也计入历史记录。</div></div>` + (Object.keys(groups).sort().reverse().map((month,index) => {
      const total = groups[month].reduce((s,r) => s + rowAmount(r), 0);
      return `<div class="month-block ${index===0?'open':''}"><div class="month-head" onclick="this.parentElement.classList.toggle('open')"><span>${esc(month)} 保洁 ${groups[month].length} 次</span><span>费用：${money(total)}</span></div><div class="month-body">${cleaningTableScoped(groups[month])}</div></div>`;
    }).join('') || '<div class="card"><p class="small">暂无历史记录</p></div>');
    renderUserProfileImpl();
    setHeader('cleaner');
    ensureLogoutButton();
    ensureVersionBadge();
  }

  function mailSetting(propertyId){return ui.mail.propertyMailForwarding.find(x => String(x.property_id) === String(propertyId)) || null;}
  function generatedMailAddress(propertyId){
    const cfg = ui.mail.mailForwardingConfig[0] || {};
    const inbox = cfg.inbox_email || '';
    if(!inbox.includes('@')) return '';
    const parts = inbox.split('@');
    return `${parts[0]}+${cfg.alias_prefix || 'pms'}_${safe(propertyId)}@${parts.slice(1).join('@')}`;
  }
  function ensureOwnerMailTab(){
    const owner = qs('owner');
    if(!owner) return;
    const tabbar = owner.querySelector('.tabbar');
    if(tabbar && !tabbar.querySelector('[data-pms-mail-tab]')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.pmsMailTab = '1';
      btn.textContent = '邮件提醒';
      btn.onclick = function(){showOwnerTabImpl('ownerMail', this);};
      tabbar.appendChild(btn);
    }
    if(!qs('ownerMail')){
      const pane = document.createElement('div');
      pane.id = 'ownerMail';
      pane.className = 'tab-content';
      owner.appendChild(pane);
    }
  }
  function renderOwnerMail(){
    ensureOwnerMailTab();
    const root = qs('ownerMail');
    if(!root) return;
    const props = propList().filter(p => ownerPropIds().includes(p.id));
    const eventCount = props.reduce((n,p) => n + ui.mail.mailEvents.filter(e => String(e.property_id) === String(p.id)).length, 0);
    root.innerHTML = `<div class="card"><div class="property-detail-head"><div><h2>邮件提醒</h2><div class="small">按房源管理 Airbnb 通知邮箱、PMS 转发地址和提醒记录。</div></div><span class="badge ${eventCount?'orange':'blue'}">共 ${eventCount} 条</span></div><div class="channel-list">${props.map(p => renderPropertyMailPanel(p)).join('') || '<div class="empty-panel">请先添加房源。</div>'}</div></div>`;
  }
  function setMailPanelStatus(propId,kind,text){
    ui.mail.statusByProperty = ui.mail.statusByProperty || {};
    const key = String(propId || '');
    if(text) ui.mail.statusByProperty[key] = {kind: kind || '', text};
    else delete ui.mail.statusByProperty[key];
    const el = qs('mailSyncStatus_' + safe(propId));
    if(el){
      const msg = ui.mail.statusByProperty[key] || {};
      el.className = 'sync-status ' + (msg.kind || '');
      el.textContent = msg.text || '';
      el.style.display = msg.text ? 'inline-flex' : 'none';
    }
  }
  function mailPanelStatusHtml(propId){
    const msg = (ui.mail.statusByProperty || {})[String(propId || '')] || {};
    return `<span id="mailSyncStatus_${safe(propId)}" class="sync-status ${esc(msg.kind || '')}" style="${msg.text ? '' : 'display:none'}">${esc(msg.text || '')}</span>`;
  }
  function renderPropertyMailPanel(prop){
    const row = mailSetting(prop.id) || {};
    const events = ui.mail.mailEvents.filter(e => String(e.property_id) === String(prop.id)).sort((a,b) => String(b.received_at || b.created_at || '').localeCompare(String(a.received_at || a.created_at || ''))).slice(0,8);
    const addr = row.pms_forward_address || generatedMailAddress(prop.id);
    return `<div class="mail-panel" id="mailPanel_${safe(prop.id)}"><div class="property-detail-head"><div><h3 style="margin:0">${esc(prop.name || prop.id)}</h3><div class="small">${events.length} 条邮件提醒</div></div><div class="mail-actions">${mailPanelStatusHtml(prop.id)}<button class="smallbtn primary" onclick="savePropertyMail('${esc(prop.id)}',this)">保存邮箱</button><button class="smallbtn" onclick="syncMailEventsFromGmail('${esc(prop.id)}',this)">同步 Gmail</button><button class="smallbtn" onclick="checkMailDiagnostics('${esc(prop.id)}',this)">检查 Gmail</button></div></div><div class="formgrid"><div><label>Airbnb 通知邮箱</label><input id="mailSource_${safe(prop.id)}" value="${esc(row.source_email || '')}" placeholder="Airbnb 发信到哪个邮箱"></div><div><label>PMS 转发地址</label><input readonly value="${esc(addr || '后台未配置主 Gmail')}"></div><div><label>状态</label><select id="mailStatus_${safe(prop.id)}"><option value="not_set" ${row.forward_status==='not_set'?'selected':''}>未设置</option><option value="verification_pending" ${row.forward_status==='verification_pending'?'selected':''}>待验证</option><option value="active" ${row.forward_status==='active'?'selected':''}>启用</option><option value="paused" ${row.forward_status==='paused'?'selected':''}>暂停</option></select></div><div><label>备注</label><input id="mailNotes_${safe(prop.id)}" value="${esc(row.notes || '')}"></div></div>${events.length ? `<table><tr><th>收到</th><th>类型</th><th>房间</th><th>内容</th></tr>${events.map(e => `<tr><td>${esc((e.received_at || e.created_at || '').slice(0,16))}</td><td>${esc(e.event_type || 'notice')}</td><td>${esc(e.room_id ? roomName(e.room_id) : e.room_name || '')}</td><td>${esc(e.title || e.summary || e.raw_subject || '')}</td></tr>`).join('')}</table>` : '<div class="empty-panel">暂无邮件提醒。</div>'}</div>`;
  }
  function openPropertyMailTab(propertyId){
    ensureOwnerMailTab();
    const id = String(propertyId || '');
    if(id && !ownerPropIds().includes(id)){
      setOwnerPropertyIds(ownerPropIds().concat([id]));
      setOwnerRoomIds(validOwnerRoomIds());
    }
    const owner = qs('owner');
    const btn = owner && Array.from(owner.querySelectorAll('.tabbar button')).find(b => b.dataset.pmsMailTab || (b.textContent || '').includes('邮件提醒'));
    showOwnerTabImpl('ownerMail', btn || null);
    renderOwnerMail();
    setTimeout(() => {
      const panel = qs('mailPanel_' + safe(id));
      if(panel) panel.scrollIntoView({block:'start', behavior:'smooth'});
      const input = qs('mailSource_' + safe(id));
      if(input) input.focus();
    }, 0);
  }

  function showSectionImpl(id,btn){
    ensureBaseShell();
    if(isActualCleaner()) id = 'cleaner';
    document.querySelectorAll('.section').forEach(s => {s.classList.remove('active'); s.style.display = 'none';});
    const section = qs(id);
    if(section){section.classList.add('active'); section.style.display = '';}
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    if(id === 'cleaner') renderCleanerImpl(); else renderOwnerImpl();
  }
  function showTabImpl(id,btn){
    if(id === 'cleanerProfile' && !isActualCleaner()){
      id = 'cleanerToday';
      btn = qs('cleanerDashboardShell') && qs('cleanerDashboardShell').querySelector('button[onclick*="cleanerToday"]');
    }
    const parent = btn && btn.closest ? btn.closest('.section') : qs('cleaner');
    if(parent) parent.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const pane = qs(id);
    if(pane) pane.classList.add('active');
    if(btn && btn.parentElement){
      btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    if(id === 'cleanerProfile' || id === 'ownerProfile') renderUserProfileImpl();
  }
  function applyRoleModeImpl(){
    ensureBaseShell();
    const nav = document.querySelector('.nav');
    if(isActualCleaner() || (cleanerPath() && !isOwnerLike())){
      if(nav) nav.querySelectorAll('button,a').forEach(el => {
        if(el.id === 'logoutBtn') return;
        const text = (el.textContent || '').trim();
        el.style.display = text.includes('房东管理') || text.includes('房源管理') ? 'none' : '';
      });
      showSectionImpl('cleaner', nav && nav.querySelector('button'));
    }else{
      if(nav) nav.querySelectorAll('button,a').forEach(el => el.style.display = '');
      const ownerBtn = nav && Array.from(nav.querySelectorAll('button')).find(b => (b.textContent || '').includes('房东'));
      showSectionImpl('owner', ownerBtn || null);
    }
    ensureLogoutButton();
  }
  function renderAll(){
    ensureBaseShell();
    ensureStyles();
    removeLegacyIntroCards();
    if(isActualCleaner() || (cleanerPath() && !isOwnerLike())) renderCleanerImpl();
    else {
      renderCleanerImpl();
      renderOwnerImpl();
      const cleaner = qs('cleaner');
      if(cleaner && !cleaner.classList.contains('active')) cleaner.style.display = 'none';
    }
    ensureVersionBadge();
  }
  async function initAppImpl(){
    ensureBaseShell();
    ensureStyles();
    ensureLogoutButton();
    try{
      await loadStateImpl();
      ['manualDate','noteDate','noteFilterDate','roomNoteDate','workDate'].forEach(id => { const el = qs(id); if(el && !el.value) el.value = today(); });
      applyRoleModeImpl();
      ui.booted = true;
    }catch(e){
      console.error(e);
      clearDataGate();
      alert('加载 PMS 数据失败：' + (e && e.message ? e.message : e));
    }
  }

  async function syncPropertyIcalImpl(propertyId,btn){
    const propId = propertyId || (selectedProp() && selectedProp().id);
    if(!propId) return alert('请先进入一个房源');
    const roomIds = new Set(propRooms(propId).map(r => r.id));
    const rows = getChannels().filter(ch => roomIds.has(ch.room_id)).map(ch => readChannelForm(ch.id) || ch);
    let movedListingUrl = false;
    for(const row of rows){
      const check = cleanChannelUrls(row, true);
      if(check.moved) movedListingUrl = true;
      if(!check.ok){
        ui.syncResults[propId] = {kind:'error', text:'同步失败：iCal 链接填写错误'};
        renderRoomSettingsImpl();
        return alert(check.message);
      }
    }
    if(!rows.length){
      ui.syncResults[propId] = {kind:'error', text:'同步失败：这个房源还没有渠道 iCal'};
      renderRoomSettingsImpl();
      return alert('请先在房间里添加渠道，并粘贴平台导出的 iCal。');
    }
    const importRows = rows.filter(r => String(r.ical_url || '').trim());
    if(!importRows.length){
      ui.syncResults[propId] = {kind:'error', text:'同步失败：没有填写平台导出的 iCal'};
      if(movedListingUrl) await persistAll();
      renderRoomSettingsImpl();
      return alert('已保存公开房源链接，但还没有填写平台导出的 .ics/iCal，所以不能同步订单。');
    }
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = '同步中...';}
    ui.syncResults[propId] = {kind:'warn', text:'同步中：正在保存渠道并读取 iCal...'};
    renderRoomSettingsImpl();
    try{
      await persistAll();
      const started = Date.now();
      const res = await fetch(apiUrl('/api/sync'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id: propId, channelListings: rows})});
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || 'iCal 同步失败');
      applyStateFromServerImpl(data.state || data);
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const errs = getSyncErrors().filter(e => roomIds.has(e.room_id));
      const imported = getChannels().filter(ch => roomIds.has(ch.room_id)).reduce((n,ch) => n + Number(ch.synced_booking_count || 0), 0);
      ui.syncResults[propId] = errs.length ? {kind:'error', text:`同步完成 ${seconds} 秒，但 ${errs.length} 个渠道失败`} : {kind:'ok', text:`同步完成 ${seconds} 秒：导入 ${imported} 条`};
      renderAll();
      if(errs.length) alert(`iCal 同步完成，但有 ${errs.length} 个渠道失败。`);
      return data;
    }catch(e){
      ui.syncResults[propId] = {kind:'error', text:'同步失败：' + (e && e.message ? e.message : e)};
      renderRoomSettingsImpl();
      alert('同步失败：' + (e && e.message ? e.message : e));
      return null;
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || '同步当前房源 iCal';}
    }
  }

  function copyText(text){
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => alert('已复制')).catch(() => prompt('复制下面内容', text));
  }
  function setOwnerPropertyFilterImpl(id,checked){
    let ids = ownerPropIds();
    ids = checked ? ids.concat([id]) : ids.filter(x => x !== id);
    if(!checked && !ids.length){
      alert('至少保留一个房源。');
      renderAll();
      return;
    }
    setOwnerPropertyIds(ids);
    if(checked){
      setOwnerRoomIds(ownerRoomIds().concat(propRooms(id).map(r => r.id)));
    }
    renderAll();
  }
  function setOwnerPropertyAllImpl(){setOwnerPropertyIds(validPropIds()); setOwnerRoomIds(validOwnerRoomIds()); renderAll();}
  function setOnlyOwnerPropertyImpl(id){setOwnerPropertyIds([id]); setOwnerRoomIds(validOwnerRoomIds()); renderAll();}
  function setOwnerRoomFilterImpl(id,checked){
    let ids = ownerRoomIds();
    ids = checked ? ids.concat([id]) : ids.filter(x => x !== id);
    if(!checked && !ids.length){
      alert('至少保留一个房间。');
      renderAll();
      return;
    }
    setOwnerRoomIds(ids);
    renderAll();
  }
  function setOwnerRoomAllImpl(){setOwnerRoomIds(validOwnerRoomIds()); renderAll();}
  function setOnlyOwnerRoomImpl(id){setOwnerRoomIds([id]); renderAll();}
  function refreshPropertyHub(){loadStateImpl().then(renderAll).catch(e => alert('刷新失败：' + e.message));}
  function editPropertyName(id){ui.editingProperty = id; ensureOwnerPropertyModuleVisible();}
  function cancelPropertyNameEdit(){ui.editingProperty = ''; ensureOwnerPropertyModuleVisible();}
  async function savePropertyName(id,btn){
    const prop = propList().find(p => String(p.id) === String(id));
    const input = qs('propertyName_' + safe(id));
    if(prop && input) prop.name = input.value.trim() || prop.name || prop.id;
    ui.editingProperty = '';
    await persistAll(btn);
    renderAll();
  }
  async function addProperty(){
    const id = 'property_' + Date.now();
    propList().push({id, group_id: groupId(), name: '新房源', created_at: nowIso()});
    setOwnerPropertyIds(validPropIds().concat([id]));
    ui.selectedPropertyId = id;
    await persistAll().catch(e => alert('保存失败：' + e.message));
    renderAll();
  }
  async function deletePropertyUi(id,btn){
    if(!confirm('确定删除这个房源？会同时删除这个房源下的房间、公区、渠道和保洁绑定。')) return;
    setProperties(propList().filter(p => String(p.id) !== String(id)));
    const roomIds = new Set(getRooms().filter(r => String(roomPropId(r.id)) === String(id)).map(r => r.id));
    setRooms(getRooms().filter(r => String(roomPropId(r.id)) !== String(id)));
    setAreas(getAreas().filter(a => String(areaPropId(a.id)) !== String(id)));
    setPropertyCleaners(getPropertyCleaners().filter(x => String(x.property_id) !== String(id)));
    setChannels(getChannels().filter(ch => !roomIds.has(ch.room_id)));
    if(ui.selectedPropertyId === id) ui.selectedPropertyId = '';
    setOwnerPropertyIds(validPropIds());
    await persistAll(btn);
    renderAll();
  }
  function openPropertyRooms(id){
    ui.selectedPropertyId = id;
    const btn = Array.from(document.querySelectorAll('#owner .tabbar button')).find(b => (b.textContent || '').includes('房间'));
    showOwnerTabImpl('ownerRooms', btn || null);
    setTimeout(() => qs('roomSettings') && qs('roomSettings').scrollIntoView({block:'start',behavior:'smooth'}), 0);
  }
  function backToPropertyList(){ui.selectedPropertyId = ''; renderRoomSettingsImpl(); ensureOwnerPropertyModuleVisible();}
  function editRoomBasics(id){ui.editingRoom = id; renderRoomSettingsImpl();}
  function cancelRoomBasics(){ui.editingRoom = ''; renderRoomSettingsImpl();}
  async function saveRoomBasics(id,btn){
    const room = getRooms().find(r => String(r.id) === String(id));
    if(room){
      const name = (qs('roomName_' + safe(id)) && qs('roomName_' + safe(id)).value.trim()) || room.name || id;
      const propId = roomPropId(id);
      if(roomNameExists(propId,name,id)) return alert('同一个房源里不能有相同房间名。请换一个房间名。');
      room.name = name;
      room.cleaning_fee = Number((qs('roomFee_' + safe(id)) && qs('roomFee_' + safe(id)).value) || 0);
    }
    ui.editingRoom = '';
    await persistAll(btn);
    renderAll();
  }
  async function addRoomImpl(propId){
    const id = 'room_' + Date.now();
    const propertyId = propId || (selectedProp() && selectedProp().id) || (propList()[0] && propList()[0].id) || 'property_default';
    getRooms().push({id, property_id: propertyId, name: nextRoomName(propertyId), cleaning_fee: 30, type:'room', created_at:nowIso()});
    setOwnerPropertyIds([propertyId]);
    setOwnerRoomIds(validOwnerRoomIds());
    await persistAll();
    renderAll();
  }
  async function deleteRoomUi(id,btn){
    if(!confirm('确定删除这个房间？')) return;
    setRooms(getRooms().filter(r => String(r.id) !== String(id)));
    setChannels(getChannels().filter(ch => String(ch.room_id) !== String(id)));
    await persistAll(btn);
    renderAll();
  }
  async function addCommonAreaImpl(propId){
    const id = 'common_' + Date.now();
    getAreas().push({id, property_id: propId || (selectedProp() && selectedProp().id) || (propList()[0] && propList()[0].id) || 'property_default', name:'新公区', cleaning_fee:20, daily_default:true, type:'common'});
    await persistAll();
    renderAll();
  }
  async function saveCommonAreaBasics(id,btn){
    const area = getAreas().find(a => String(a.id) === String(id));
    if(area){
      area.name = (qs('areaName_' + safe(id)) && qs('areaName_' + safe(id)).value.trim()) || area.name || id;
      area.cleaning_fee = Number((qs('areaFee_' + safe(id)) && qs('areaFee_' + safe(id)).value) || 0);
      area.daily_default = (qs('areaDaily_' + safe(id)) && qs('areaDaily_' + safe(id)).value) !== 'false';
    }
    await persistAll(btn);
    renderAll();
  }
  async function deleteCommonAreaUi(id,btn){
    if(!confirm('确定删除这个公区？')) return;
    setAreas(getAreas().filter(a => String(a.id) !== String(id)));
    await persistAll(btn);
    renderAll();
  }
  function addChannelListing(roomId){
    getChannels().push({id:'channel_' + safe(roomId) + '_' + Date.now(), room_id:roomId, platform:'Airbnb', ical_url:'', listing_url:'', channel_note:'', is_new_listing:false, created_at:nowIso(), updated_at:nowIso()});
    renderRoomSettingsImpl();
  }
  async function saveChannelListing(id,btn){
    const row = readChannelForm(id);
    const check = cleanChannelUrls(row, true);
    if(!check.ok) return alert(check.message);
    await persistAll(btn);
    renderAll();
    if(check.moved) alert('已保存：房源页面链接已放到“公开房源链接”，iCal 输入框已清空。订单同步还需要粘贴平台导出的 .ics/iCal。');
  }
  async function deleteChannelListing(id,btn){
    if(!confirm('确定删除这个渠道？')) return;
    setChannels(getChannels().filter(ch => String(ch.id) !== String(id)));
    await persistAll(btn);
    renderAll();
  }
  async function bindPropertyCleanerUi(propId,btn){
    const code = (qs('cleanerCode_' + safe(propId)) && qs('cleanerCode_' + safe(propId)).value || '').trim().toUpperCase();
    if(!code) return alert('请填写保洁编号');
    if(!getPropertyCleaners().some(x => String(x.property_id) === String(propId) && String(x.cleaner_code).toUpperCase() === code)){
      getPropertyCleaners().push({property_id:propId, cleaner_code:code, created_at:nowIso()});
    }
    await persistAll(btn);
    renderAll();
  }
  async function unbindPropertyCleanerUi(propId,code,btn){
    setPropertyCleaners(getPropertyCleaners().filter(x => !(String(x.property_id) === String(propId) && String(x.cleaner_code).toUpperCase() === String(code).toUpperCase())));
    await persistAll(btn);
    renderAll();
  }
  async function savePropertyMail(propId,btn){
    const existing = mailSetting(propId) || {};
    const row = {...existing, id: existing.id || 'mail_property_' + safe(propId), property_id: propId, source_email: (qs('mailSource_' + safe(propId)) && qs('mailSource_' + safe(propId)).value || '').trim(), forward_status: (qs('mailStatus_' + safe(propId)) && qs('mailStatus_' + safe(propId)).value) || 'not_set', notes: (qs('mailNotes_' + safe(propId)) && qs('mailNotes_' + safe(propId)).value || '').trim(), updated_at: nowIso()};
    if(!row.source_email){
      setMailPanelStatus(propId,'error','请先填写 Airbnb 通知邮箱');
      return alert('请先填写 Airbnb 通知邮箱。');
    }
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = '保存中...';}
    setMailPanelStatus(propId,'warn','正在保存邮箱设置...');
    try{
      const res = await fetch(apiUrl('/api/property-mail'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)});
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
      applyStateFromServerImpl(data.state || data);
      setMailPanelStatus(propId,'ok','邮箱设置已保存');
      renderOwnerMail();
      setMailPanelStatus(propId,'ok','邮箱设置已保存');
    }catch(e){
      setMailPanelStatus(propId,'error','保存失败：' + (e && e.message ? e.message : e));
      alert('保存邮箱失败：' + (e && e.message ? e.message : e));
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || '保存邮箱';}
    }
  }
  async function syncMailEventsFromGmail(propId,btn){
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = '同步中...';}
    setMailPanelStatus(propId,'warn','正在同步 Gmail...');
    try{
      const res = await fetch(apiUrl('/api/mail-events/sync'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id:propId,days:3,max_results:25})});
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || '同步 Gmail 失败');
      applyStateFromServerImpl(data.state || data);
      const details = Array.isArray(data.details) ? data.details : [];
      const detail = details.find(d => String(d.property_id) === String(propId)) || details[0] || {};
      const text = `Gmail 同步完成：读取 ${Number(detail.emails || 0)} 封，生成 ${Number(detail.events || 0)} 条提醒`;
      setMailPanelStatus(propId,'ok',text);
      renderOwnerMail();
      setMailPanelStatus(propId,'ok',text);
    }catch(e){
      setMailPanelStatus(propId,'error','Gmail 同步失败：' + (e && e.message ? e.message : e));
      try{ await checkMailDiagnostics(propId, null, true); }catch(_ignored){}
      alert('Gmail 同步失败：' + (e && e.message ? e.message : e));
    }
    finally{if(btn){btn.disabled = false; btn.textContent = old || '同步 Gmail';}}
  }
  function mailDiagnosticText(d){
    if(!d) return {kind:'error', text:'Gmail 检查失败：没有返回诊断结果'};
    if(!d.gmail_oauth_configured) return {kind:'error', text:'Gmail OAuth 未配置：Render 需要 GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN'};
    if(d.gmail_token_ok === false) return {kind:'error', text:'Gmail 授权失败：' + (d.gmail_error || 'refresh token 无法换取访问令牌')};
    if(!Number(d.target_count || 0)) return {kind:'error', text:'当前房源没有可同步邮箱：先保存 Airbnb 通知邮箱'};
    const hours = Math.round(Number(d.auto_sync_interval_seconds || 0) / 36) / 100;
    const auto = d.auto_sync_enabled ? `自动同步已开，每 ${hours || 2} 小时` : '自动同步已关闭';
    const token = d.gmail_token_ok ? '授权正常' : '配置存在';
    return {kind:'ok', text:`Gmail ${token}；${auto}；可同步邮箱 ${d.target_count} 个`};
  }
  async function checkMailDiagnostics(propId,btn,silent){
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = '检查中...';}
    setMailPanelStatus(propId,'warn','正在检查 Gmail 配置...');
    try{
      const res = await fetch(apiUrl('/api/mail-diagnostics'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id:propId,check_token:true})});
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
      const msg = mailDiagnosticText(data.diagnostics);
      setMailPanelStatus(propId,msg.kind,msg.text);
      return data.diagnostics;
    }catch(e){
      const text = 'Gmail 检查失败：' + (e && e.message ? e.message : e);
      setMailPanelStatus(propId,'error',text);
      if(!silent) alert(text);
      throw e;
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || '检查 Gmail';}
    }
  }
  async function resolveCancellationReview(key,action,btn){
    const decoded = decodeURIComponent(key || '');
    const parts = decoded.split('|');
    const row = {date:parts[0], target_type:parts[1] || 'room', target_id:parts[2]};
    const note = reviewNoteForRow(row);
    if(!note) return alert('找不到对应的房东确认提醒。');
    const now = nowIso();
    note.owner_review_action = action;
    note.owner_reviewed_by = userName('房东');
    note.owner_reviewed_at = now;
    note.updated_at = now;
    if(action === 'keep'){
      note.owner_review_status = 'clean_needed';
      note.owner_review_task_date = row.date;
    }else if(action === 'move_next_day'){
      note.owner_review_status = 'moved_next_day';
      note.inactive = true;
      getManual().unshift({id:'manual_review_remove_'+safe(key),date:row.date,target_id:row.target_id,target_type:row.target_type,type:'remove',amount:0,reason:'房东确认改到第二天保洁',source:'房东复核',created_by:userName('房东'),created_at:now});
      getNotes().unshift({id:'note_review_next_'+safe(key),date:addDay(row.date,1),target_id:row.target_id,target_type:row.target_type,note:'房东确认改到第二天保洁：' + (note.note || ''),priority:'重要',amount:targetFee(row.target_id,row.target_type),amount_present:true,created_by:userName('房东'),created_at:now,owner_review_status:'clean_needed'});
    }else{
      note.owner_review_status = 'no_cleaning';
      note.inactive = true;
      getManual().unshift({id:'manual_review_cancel_'+safe(key),date:row.date,target_id:row.target_id,target_type:row.target_type,type:'remove',amount:0,reason:'房东确认不需要保洁',source:'房东复核',created_by:userName('房东'),created_at:now});
    }
    await persistAll(btn);
    renderAll();
  }

  Object.assign(window, {
    applyServerState: applyStateFromServerImpl,
    applyStateFromServer: applyStateFromServerImpl,
    loadState: loadStateImpl,
    saveState: persistAll,
    scheduleSave: scheduleSaveImpl,
    logout: logoutImpl,
    pmsForceLogout: logoutImpl,
    showSection: showSectionImpl,
    showTab: showTabImpl,
    showOwnerTab: showOwnerTabImpl,
    applyRoleMode: applyRoleModeImpl,
    initApp: initAppImpl,
    refreshAll: function(){renderAll(); scheduleSaveImpl();},
    renderCleaner: renderCleanerImpl,
    renderOwner: renderOwnerImpl,
    renderOwnerTab: renderOwnerTabImpl,
    renderOwnerMetrics: renderOwnerMetricsImpl,
    renderDailyWork: renderDailyWorkImpl,
    renderOwnerCalendar: renderOwnerCalendarImpl,
    renderSixMonthStats: renderSixMonthStatsImpl,
    renderOwnerBookings: renderOwnerBookingsImpl,
    renderRoomSettings: renderRoomSettingsImpl,
    renderManualRecords: renderManualRecordsImpl,
    renderManualRecordsHTML: renderManualRecordsHTMLImpl,
    renderCleaningFinance: renderCleaningFinanceImpl,
    renderOwnerNotes: renderOwnerNotesImpl,
    renderOwnerMail,
    openPropertyMailTab,
    renderUserProfile: renderUserProfileImpl,
    saveUserProfile,
    ensureOwnerPropertyModuleVisible,
    refreshCalendarRangeViews: refreshCalendarRangeViewsImpl,
    setRangePreset: setRangePresetImpl,
    toggleCalendarVacancyOnly,
    setOwnerPropertyFilter: setOwnerPropertyFilterImpl,
    setOwnerPropertyAll: setOwnerPropertyAllImpl,
    setOnlyOwnerProperty: setOnlyOwnerPropertyImpl,
    setOwnerRoomFilter: setOwnerRoomFilterImpl,
    setOwnerRoomAll: setOwnerRoomAllImpl,
    setOnlyOwnerRoom: setOnlyOwnerRoomImpl,
    refreshPropertyHub,
    editPropertyName,
    cancelPropertyNameEdit,
    savePropertyName,
    addProperty,
    deletePropertyUi,
    openPropertyRooms,
    backToPropertyList,
    editRoomBasics,
    cancelRoomBasics,
    saveRoomBasics,
    addRoom: addRoomImpl,
    deleteRoomUi,
    deleteRoom: deleteRoomUi,
    addCommonArea: addCommonAreaImpl,
    saveCommonAreaBasics,
    deleteCommonAreaUi,
    deleteCommonArea: deleteCommonAreaUi,
    addChannelListing,
    saveChannelListing,
    deleteChannelListing,
    syncPropertyIcal: syncPropertyIcalImpl,
    syncIcal: syncPropertyIcalImpl,
    bindPropertyCleanerUi,
    unbindPropertyCleanerUi,
    refreshManualTargetOptions: refreshManualTargetOptionsImpl,
    refreshNoteTargetOptions: refreshNoteTargetOptionsImpl,
    addManualChange: addManualChangeImpl,
    addCleaningNote: addCleaningNoteImpl,
    addRoomDateNote: addRoomDateNoteImpl,
    savePropertyMail,
    syncMailEventsFromGmail,
    checkMailDiagnostics,
    resolveCancellationReview,
    chooseCleaningPhoto,
    uploadCleaningPhoto,
    copyText,
    realBookings: realBookingsImpl,
    lockBookings: lockBookingsImpl,
    isLockedBooking,
    lockReason,
    dedupeBookingsByStay: dedupeBookings,
    dedupeCleaningRows: dedupeCleaningRowsImpl,
    systemCleaningRows: systemCleaningRowsImpl,
    commonAreaRows: commonAreaRowsImpl,
    actualCleaningRows: actualCleaningRowsImpl,
    cleaningTable: cleaningTableScoped,
    cleaningTableScoped,
    addDays: addDay,
    daysBetween: daysBetweenSafe,
    targetName,
    targetFee,
    moneyText: money,
    signedMoneyText: signedMoney,
    platformBadge,
    objectBadge,
    priorityBadge,
    changeBadge
  });

  [
    ['applyStateFromServer', applyStateFromServerImpl],
    ['loadState', loadStateImpl],
    ['saveState', persistAll],
    ['scheduleSave', scheduleSaveImpl],
    ['logout', logoutImpl],
    ['showSection', showSectionImpl],
    ['showTab', showTabImpl],
    ['showOwnerTab', showOwnerTabImpl],
    ['applyRoleMode', applyRoleModeImpl],
    ['initApp', initAppImpl],
    ['refreshAll', function(){renderAll(); scheduleSaveImpl();}],
    ['renderCleaner', renderCleanerImpl],
    ['renderOwner', renderOwnerImpl],
    ['renderDailyWork', renderDailyWorkImpl],
    ['renderOwnerCalendar', renderOwnerCalendarImpl],
    ['renderSixMonthStats', renderSixMonthStatsImpl],
    ['renderOwnerBookings', renderOwnerBookingsImpl],
    ['renderRoomSettings', renderRoomSettingsImpl],
    ['openPropertyMailTab', openPropertyMailTab],
    ['toggleCalendarVacancyOnly', toggleCalendarVacancyOnly],
    ['setOwnerPropertyFilter', setOwnerPropertyFilterImpl],
    ['setOwnerPropertyAll', setOwnerPropertyAllImpl],
    ['setOnlyOwnerProperty', setOnlyOwnerPropertyImpl],
    ['setOwnerRoomFilter', setOwnerRoomFilterImpl],
    ['setOwnerRoomAll', setOwnerRoomAllImpl],
    ['setOnlyOwnerRoom', setOnlyOwnerRoomImpl],
    ['addRoom', addRoomImpl],
    ['addCommonArea', addCommonAreaImpl],
    ['syncIcal', syncPropertyIcalImpl],
    ['checkMailDiagnostics', checkMailDiagnostics],
    ['realBookings', realBookingsImpl],
    ['lockBookings', lockBookingsImpl],
    ['systemCleaningRows', systemCleaningRowsImpl],
    ['commonAreaRows', commonAreaRowsImpl],
    ['actualCleaningRows', actualCleaningRowsImpl]
  ].forEach(function(pair){
    try{ window[pair[0]] = pair[1]; }catch(e){}
  });
})();
