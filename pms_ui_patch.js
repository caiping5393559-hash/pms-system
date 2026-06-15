var selectedPropertyId = '';
var expandedPlatformFields = {};
var expandedPublicRooms = {};

function propRooms(propertyId){
  const fallbackId = (properties[0] && properties[0].id) || 'property_default';
  return rooms.filter(room => (room.property_id || fallbackId) === propertyId);
}
function propCommonAreas(propertyId){
  const fallbackId = (properties[0] && properties[0].id) || 'property_default';
  return commonAreas.filter(area => (area.property_id || fallbackId) === propertyId);
}
function activeProperty(){
  if(!properties.length || !selectedPropertyId) return null;
  return properties.find(prop => prop.id === selectedPropertyId) || null;
}
function openPropertyRooms(propertyId){
  selectedPropertyId = propertyId;
  renderRoomSettings();
}
function backToPropertyList(){
  selectedPropertyId = '';
  renderRoomSettings();
}
function setupPropertyRoomUi(){
  const tab = document.querySelector('button[onclick*="ownerRooms"]');
  if(tab){
    tab.textContent = '房源 / 房间设置';
    tab.setAttribute('onclick', "showOwnerTab('ownerRooms', this); backToPropertyList();");
  }
  const section = document.getElementById('ownerRooms');
  if(section){
    const h2 = section.querySelector(':scope > .card h2');
    const selectedProp = activeProperty();
    if(h2) h2.textContent = selectedProp ? `${selectedProp.name || selectedProp.id}房源的房间管理` : '房源管理';
    const p = section.querySelector(':scope > .card p.small');
    if(p) p.textContent = selectedProp
      ? '公区设置置顶；下面管理该房源的房间、iCal、保洁绑定和平台防超卖链接。'
      : '先看到所有房源。可以添加、重命名、删除房源；点进入后再设置这个房源下面的房间和公区。';
    section.querySelectorAll(':scope > .card > button[onclick="addRoom()"], :scope > .card > .toolbar button[onclick="addRoom()"], :scope > .card > button[onclick="addRoom()"]').forEach(btn => { btn.style.display = 'none'; });
  }
  const syncBtn = document.getElementById('syncIcalBtn');
  if(syncBtn){
    const syncToolbar = syncBtn.closest('.toolbar');
    if(syncToolbar) syncToolbar.style.display = 'none';
  }
  const commonHolder = document.getElementById('commonSettings');
  if(commonHolder){
    const commonCard = commonHolder.closest('.card');
    if(commonCard) commonCard.style.display = 'none';
  }
  if(document.getElementById('propertyRoomUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'propertyRoomUiStyles';
  style.textContent = `
    #ownerRooms>.card:first-child{border-radius:8px}
    .property-list-page{display:grid;gap:12px}
    .property-list-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
    .property-cards{display:grid;gap:10px}
    .property-card-row{border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px;display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:12px;align-items:end}
    .property-card-row label{margin-bottom:6px}
    .property-name-edit{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .property-name-edit input{max-width:360px}
    .property-card-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .property-meta-line{color:var(--muted);font-size:12px;margin-top:6px}
    .property-cleaner-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .property-room-shell{display:grid;gap:12px}
    .property-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
    .property-actions{display:flex;gap:8px;flex-wrap:wrap}
    .property-subcard{border:1px solid var(--line);border-radius:8px;background:#fff;padding:14px}
    .property-subcard h3{margin-top:0}
    .common-area-list{display:grid;gap:8px;margin-top:10px}
    .common-area-card{display:grid;grid-template-columns:minmax(160px,1fr) 120px auto;gap:8px;align-items:end;border:1px solid var(--line);border-radius:8px;background:#f8fafc;padding:10px}
    .room-setting-card{border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px;margin:10px 0}
    .room-compact-head{display:grid;grid-template-columns:minmax(160px,1fr) 110px auto;gap:8px;align-items:end}
    .room-compact-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}
    .room-ical-primary{display:grid;grid-template-columns:140px minmax(0,1fr);gap:8px;align-items:center;margin-top:10px}
    .platform-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .optional-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:8px}
    .optional-box{border:1px dashed var(--line);border-radius:8px;background:#f8fafc;padding:10px}
    .oversell-warning{border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:10px;margin-top:10px;color:#92400e}
    .oversell-warning .copyline{margin-top:6px;background:#fff}
    .empty-panel{border:1px dashed var(--line);border-radius:8px;background:#f8fafc;padding:18px;text-align:center;color:var(--muted)}
    @media(max-width:900px){.property-card-row,.common-area-card,.room-compact-head,.room-ical-primary{grid-template-columns:1fr}.property-card-actions{justify-content:flex-start}}
  `;
  document.head.appendChild(style);
}
function propertyNameInputId(propertyId){ return 'propertyName_' + safeDomId(propertyId); }
async function savePropertyName(propertyId, btn){
  const prop = properties.find(item => item.id === propertyId);
  if(!prop){ alert('找不到这个房源'); return null; }
  const input = document.getElementById(propertyNameInputId(propertyId));
  if(input) prop.name = input.value.trim() || prop.name || '未命名房源';
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '保存中...'; }
  try{
    const res = await fetch(withKey('/api/property/' + encodeURIComponent(propertyId)), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(prop)
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.ok === false){ throw new Error(data.error || 'save property failed'); }
    const keepDetail = selectedPropertyId === propertyId;
    applyServerState(data.state || data);
    selectedPropertyId = keepDetail && properties.some(item => item.id === propertyId) ? propertyId : '';
    renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar();
    if(selectedPropertyId) renderRoomSettings();
    return data;
  }catch(e){
    alert('保存房源名字失败：' + e.message);
    return null;
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = oldText || '保存名字'; }
  }
}
function addProperty(){
  const prop = {id:'property' + Date.now(), group_id: currentGroupId(), name:'新房源'};
  properties.push(prop);
  selectedPropertyId = '';
  renderRoomSettings();
  savePropertyName(prop.id, null).then(data => {
    if(data){ applyServerState(data.state || data); selectedPropertyId = ''; renderRoomSettings(); }
  });
}
async function deletePropertyUi(propertyId, btn){
  const prop = properties.find(item => item.id === propertyId);
  if(!prop){ alert('找不到这个房源'); return; }
  if(properties.length <= 1){ alert('不能删除最后一个房源。'); return; }
  const roomIds = new Set(propRooms(propertyId).map(room => room.id));
  if(!confirm(`确定删除房源「${prop.name || propertyId}」？这个房源下面的 ${roomIds.size} 个房间、相关 iCal 预订和备注也会一起删除。`)) return;
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '删除中...'; }
  try{
    properties = properties.filter(item => item.id !== propertyId);
    propertyCleaners = propertyCleaners.filter(item => item.property_id !== propertyId);
    commonAreas = commonAreas.filter(area => (area.property_id || propertyId) !== propertyId);
    rooms = rooms.filter(room => (room.property_id || propertyId) !== propertyId);
    bookings = bookings.filter(item => !roomIds.has(item.room_id));
    manualChanges = manualChanges.filter(item => item.target_type !== 'room' || !roomIds.has(item.target_id));
    cleaningNotes = cleaningNotes.filter(item => item.target_type !== 'room' || !roomIds.has(item.target_id));
    roomDateNotes = roomDateNotes.filter(item => !roomIds.has(item.room_id));
    await saveState();
    await loadState();
    selectedPropertyId = '';
    renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar();
  }catch(e){ alert('删除房源失败：' + e.message); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = oldText || '删除房源'; } }
}
function updateRoomField(roomId, field, value){
  const room = rooms.find(item => item.id === roomId);
  if(!room) return;
  room[field] = field === 'cleaning_fee' ? Number(value || 0) : value;
  markRoomDirty(roomId);
}
function showPlatformField(roomId, field){
  expandedPlatformFields[roomId + ':' + field] = true;
  renderRoomSettings();
}
function togglePublicLinks(roomId){
  expandedPublicRooms[roomId] = !expandedPublicRooms[roomId];
  renderRoomSettings();
}
function hasPublicLinks(room){
  return !!(room.airbnb_public_url || room.booking_public_url || room.vrbo_public_url || room.other_public_url);
}
function hasOtherPlatformIcal(room){
  return !!(room.booking_ical || room.vrbo_ical || room.other_ical);
}
function optionalPlatformRows(room){
  const fields = [
    ['booking_ical', 'Booking'],
    ['vrbo_ical', 'Vrbo'],
    ['other_ical', '其他平台']
  ];
  const visible = fields.filter(([field]) => room[field] || expandedPlatformFields[room.id + ':' + field]);
  const buttons = fields.filter(([field]) => !room[field] && !expandedPlatformFields[room.id + ':' + field])
    .map(([field, label]) => `<button class="smallbtn" onclick="showPlatformField('${esc(room.id)}','${field}')">增加 ${label} iCal</button>`).join('');
  return `${buttons ? `<div class="platform-buttons">${buttons}</div>` : ''}
    ${visible.length ? `<div class="optional-grid">${visible.map(([field, label]) => `<div class="optional-box"><div class="ical-label">${label} iCal 导出链接</div><input class="ical-input" value="${esc(room[field] || '')}" onchange="updateRoomField('${esc(room.id)}','${field}',this.value)"></div>`).join('')}</div>` : ''}`;
}
function publicLinksPanel(room){
  const show = expandedPublicRooms[room.id] || hasPublicLinks(room);
  return `<div class="platform-buttons"><button class="smallbtn" onclick="togglePublicLinks('${esc(room.id)}')">${show ? '收起公开链接' : '公开房源链接（可选）'}</button></div>
    ${show ? `<div class="optional-grid">
      <div class="optional-box"><div class="ical-label">Airbnb 公开链接</div><input class="ical-input" value="${esc(room.airbnb_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','airbnb_public_url',this.value)"></div>
      <div class="optional-box"><div class="ical-label">Booking 公开链接</div><input class="ical-input" value="${esc(room.booking_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','booking_public_url',this.value)"></div>
      <div class="optional-box"><div class="ical-label">Vrbo 公开链接</div><input class="ical-input" value="${esc(room.vrbo_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','vrbo_public_url',this.value)"></div>
      <div class="optional-box"><div class="ical-label">其他公开链接</div><input class="ical-input" value="${esc(room.other_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','other_public_url',this.value)"></div>
    </div>` : ''}`;
}
function oversellWarning(room){
  if(!hasOtherPlatformIcal(room)) return '';
  const feed = `${location.origin}/feed/${esc(room.id)}.ics`;
  const platforms = [
    room.booking_ical ? 'Booking' : '',
    room.vrbo_ical ? 'Vrbo' : '',
    room.other_ical ? '其他平台' : ''
  ].filter(Boolean).join('、');
  return `<div class="oversell-warning"><strong>防止超卖提醒</strong><div class="small">这个房间已经填写了 ${platforms} 的 iCal。为了让其他平台知道系统里的锁房日期，请把下面这个系统生成的 iCal 链接，填到对应平台的“导入日历 / 同步日历”位置。</div><div class="copyline">${feed}</div></div>`;
}
function addRoom(){
  const prop = activeProperty();
  if(!prop){ alert('请先进入一个房源'); return; }
  const n = propRooms(prop.id).length + 1;
  const room = {id:'room' + Date.now(), name:(prop.name || '房源') + ' 房间' + n, cleaning_fee:80, type:'room', property_id:prop.id};
  rooms.push(room);
  renderRoomSettings();
  saveRoom(room.id, null, {rerender:false}).then(data => { if(data){ applyServerState(data.state || data); renderRoomSettings(); } });
}
async function deleteRoom(id){ await deleteRoomUi(id, null); }
async function deleteRoomUi(roomId, btn){
  const room = rooms.find(item => item.id === roomId);
  if(!room){ alert('找不到这个房间'); return; }
  if(!confirm(`确定删除「${room.name || roomId}」？相关预订、清洁记录和备注也会一起删除。`)) return;
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '删除中...'; }
  try{
    rooms = rooms.filter(item => item.id !== roomId);
    bookings = bookings.filter(item => item.room_id !== roomId);
    manualChanges = manualChanges.filter(item => item.target_type !== 'room' || item.target_id !== roomId);
    cleaningNotes = cleaningNotes.filter(item => item.target_type !== 'room' || item.target_id !== roomId);
    roomDateNotes = roomDateNotes.filter(item => item.room_id !== roomId);
    await saveState();
    await loadState();
    renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar();
  }catch(e){ alert('删除房间失败：' + e.message); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = oldText || '删除'; } }
}
function updateCommonAreaField(areaId, field, value){
  const area = commonAreas.find(item => item.id === areaId);
  if(!area) return;
  if(!area.property_id && selectedPropertyId) area.property_id = selectedPropertyId;
  area[field] = field === 'cleaning_fee' ? Number(value || 0) : value;
}
async function saveCommonAreas(btn){
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '保存中...'; }
  try{
    await saveState();
    await loadState();
    renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar();
  }catch(e){ alert('保存公区失败：' + e.message); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = oldText || '保存公区设置'; } }
}
function addCommonArea(){
  const prop = activeProperty();
  if(!prop){ alert('请先进入一个房源'); return; }
  const n = propCommonAreas(prop.id).length + 1;
  commonAreas.push({id:'common' + Date.now(), name:'公区' + n, cleaning_fee:35, type:'common', daily_default:true, property_id:prop.id});
  renderRoomSettings();
  saveState().then(() => loadState()).then(() => { renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar(); });
}
function deleteCommonArea(id){
  if(!confirm('确定删除这个公区？')) return;
  commonAreas = commonAreas.filter(c => c.id !== id);
  renderRoomSettings();
  saveState().then(() => loadState()).then(() => { renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar(); });
}
async function syncPropertyIcal(propertyId, btn){
  const prop = properties.find(item => item.id === propertyId);
  if(!prop){ alert('找不到这个房源'); return; }
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '同步中...'; }
  try{
    const res = await fetch(withKey('/api/sync'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({property_id: propertyId})
    });
    const state = await res.json().catch(() => ({}));
    if(!res.ok || state.ok === false){ throw new Error(state.error || 'sync failed'); }
    applyServerState(state.state || state);
    selectedPropertyId = propertyId;
    renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar();
  }catch(e){
    alert('同步当前房源 iCal 失败：' + e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = oldText || '同步当前房源 iCal'; }
  }
}
async function saveRoomAndSync(roomId, btn){
  const room = rooms.find(item => item.id === roomId);
  if(!room){ alert('找不到这个房间'); return; }
  const propertyId = room.property_id || selectedPropertyId || ((properties[0] && properties[0].id) || '');
  const oldText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '同步中...'; }
  try{
    const saved = await saveRoom(roomId, null, {rerender:false});
    if(!saved) return;
    await syncPropertyIcal(propertyId, null);
    const status = document.getElementById(roomSaveStatusId(roomId));
    if(status){ status.textContent = syncErrors.length ? `已保存，当前房源同步完成但失败 ${syncErrors.length} 个链接` : '已保存并同步当前房源'; }
  }catch(e){
    alert('保存并同步失败：' + e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = oldText || '保存并同步'; }
  }
}
function renderCommonAreaPanel(prop){
  const areas = propCommonAreas(prop.id);
  const rows = areas.length ? areas.map(area => `<div class="common-area-card">
    <div><label>公区名称</label><input value="${esc(area.name || '')}" onchange="updateCommonAreaField('${esc(area.id)}','name',this.value)"></div>
    <div><label>每日保洁费</label><input type="number" value="${esc(area.cleaning_fee || 0)}" onchange="updateCommonAreaField('${esc(area.id)}','cleaning_fee',this.value)"></div>
    <button class="smallbtn" onclick="deleteCommonArea('${esc(area.id)}')">删除</button>
  </div>`).join('') : `<div class="empty-panel"><strong>这个房源还没有公区</strong><div style="margin-top:10px"><button class="smallbtn primary" onclick="addCommonArea()">添加公区</button></div></div>`;
  return `<div class="property-subcard">
    <div class="property-detail-head">
      <div><h3>公区设置</h3><div class="small">公区属于当前房源，默认每天打扫，可设置每日保洁费。</div></div>
      <div class="property-actions"><button class="smallbtn primary" onclick="addCommonArea()">添加公区</button><button class="smallbtn" onclick="saveCommonAreas(this)">保存公区设置</button></div>
    </div>
    <div class="common-area-list">${rows}</div>
  </div>`;
}
function renderCleanerPanel(prop){
  const sid = safeDomId(prop.id);
  const bindings = propertyCleanerBindings(prop.id);
  const cleaners = bindings.length ? bindings.map(item => `<div class="toolbar" style="margin-bottom:4px"><span class="badge green">${esc(cleanerLabel(item.cleaner_code))}</span><button class="smallbtn" onclick="unbindPropertyCleaner('${esc(prop.id)}','${esc(item.cleaner_code)}',this)">删除绑定</button></div>`).join('') : '<div class="small">这个房源还没有绑定保洁。</div>';
  return `<div class="property-subcard"><h3>保洁绑定</h3><div class="small">保洁先去 <a href="/cleaner-register" target="_blank">保洁注册页</a> 注册，把编号发给房东。这里填编号即可绑定。</div><div class="toolbar" style="margin-top:8px"><input id="cleanerCode_${sid}" placeholder="例如：CLN-1234"><button class="smallbtn primary" onclick="bindPropertyCleaner('${esc(prop.id)}',this)">绑定保洁</button></div>${cleaners}</div>`;
}
function propertyCleanerSummary(propertyId){
  const bindings = propertyCleanerBindings(propertyId);
  if(!bindings.length) return '<div class="property-meta-line">保洁：未绑定</div>';
  return `<div class="property-cleaner-list">${bindings.map(item => `<span class="badge green">${esc(cleanerLabel(item.cleaner_code))}</span>`).join('')}</div>`;
}
function renderRoomCard(room, prop){
  return `<div class="room-setting-card">
    <div class="room-compact-head">
      <div><label>房间名字</label><input value="${esc(room.name || '')}" onchange="updateRoomField('${esc(room.id)}','name',this.value)"></div>
      <div><label>清洁费</label><input type="number" value="${esc(room.cleaning_fee || 0)}" onchange="updateRoomField('${esc(room.id)}','cleaning_fee',this.value)"></div>
      <button class="smallbtn" onclick="deleteRoomUi('${esc(room.id)}',this)">删除</button>
    </div>
    <div class="room-ical-primary"><div class="ical-label">Airbnb iCal</div><input class="ical-input" placeholder="粘贴 Airbnb 导出的 .ics 链接" value="${esc(room.airbnb_ical || '')}" onchange="updateRoomField('${esc(room.id)}','airbnb_ical',this.value)"></div>
    ${optionalPlatformRows(room)}
    ${oversellWarning(room)}
    ${publicLinksPanel(room)}
    <div class="room-compact-actions">
      <button class="smallbtn primary" onclick="saveRoom('${esc(room.id)}',this)">保存</button>
      <button class="smallbtn" onclick="saveRoomAndSync('${esc(room.id)}',this)">保存并同步</button>
      <span class="small" id="${roomSaveStatusId(room.id)}">${roomDirty[room.id] ? '有未保存修改' : '已加载数据库'}</span>
    </div>
  </div>`;
}
function renderPropertyList(){
  const cards = properties.map(prop => {
    const roomCount = propRooms(prop.id).length;
    const commonCount = propCommonAreas(prop.id).length;
    const cleanerCount = propertyCleanerBindings(prop.id).length;
    return `<div class="property-card-row">
      <div>
        <label>房源名字</label>
        <div class="property-name-edit"><input id="${propertyNameInputId(prop.id)}" value="${esc(prop.name || '')}" placeholder="例如：洛杉矶市中心 1 号房源"><button class="smallbtn" onclick="savePropertyName('${esc(prop.id)}',this)">保存名字</button></div>
        <div class="property-meta-line">${roomCount} 个房间 · ${commonCount} 个公区 · ${cleanerCount} 个保洁绑定</div>
        ${propertyCleanerSummary(prop.id)}
      </div>
      <div class="property-card-actions">
        <button class="smallbtn primary" onclick="openPropertyRooms('${esc(prop.id)}')">进入房间设置</button>
        <button class="smallbtn" onclick="deletePropertyUi('${esc(prop.id)}',this)">删除房源</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="property-list-page">
    <div class="property-list-head">
      <div><h3 style="margin:0">房源列表</h3><div class="small">默认房源会显示在这里，可以直接重命名；进入后才管理房间、公区和 iCal。</div></div>
      <button class="smallbtn primary" onclick="addProperty()">添加房源</button>
    </div>
    <div class="property-cards">${cards}</div>
  </div>`;
}
function renderPropertyDetail(prop){
  const propRoomsList = propRooms(prop.id);
  const cards = propRoomsList.length ? propRoomsList.map(room => renderRoomCard(room, prop)).join('') : `<div class="empty-panel"><strong>这个房源还没有房间</strong><div style="margin-top:10px"><button class="smallbtn primary" onclick="addRoom()">添加第一个房间</button></div></div>`;
  const syncText = (lastSync ? `上次同步：${lastSync}` : '上次同步：未同步') + (syncErrors.length ? ` · 失败 ${syncErrors.length} 个链接` : '');
  return `<div class="property-room-shell">
    <div class="property-detail-head">
      <div><h2 style="margin:0">${esc(prop.name || prop.id)}房源的房间管理</h2><div class="small">${propRoomsList.length} 个房间 · ${propCommonAreas(prop.id).length} 个公区 · 房源 ID：${esc(prop.id)}</div></div>
      <div class="property-actions"><button class="smallbtn" onclick="backToPropertyList()">返回房源列表</button><button class="smallbtn primary" onclick="syncPropertyIcal('${esc(prop.id)}',this)">同步当前房源 iCal</button><span class="small">${syncText}</span></div>
    </div>
    ${renderCleanerPanel(prop)}
    ${renderCommonAreaPanel(prop)}
    <div class="property-subcard">
      <div class="property-detail-head"><div><h3 style="margin:0">房间设置</h3><div class="small">每个房间默认只填 Airbnb iCal；需要其他平台时再展开。</div></div><button class="smallbtn primary" onclick="addRoom()">添加房间</button></div>
      ${cards}
    </div>
  </div>`;
}
function renderCommonSettings(){
  const commonHolder = document.getElementById('commonSettings');
  if(commonHolder) commonHolder.innerHTML = '';
}
function renderRoomSettings(){
  if(selectedPropertyId && !properties.some(prop => prop.id === selectedPropertyId)) selectedPropertyId = '';
  setupPropertyRoomUi();
  const holder = document.getElementById('roomSettings');
  if(!holder) return;
  if(!properties.length){
    holder.innerHTML = `<div class="empty-panel"><strong>还没有房源</strong><div style="margin-top:10px"><button class="smallbtn primary" onclick="addProperty()">添加房源</button></div></div>`;
    return;
  }
  const prop = activeProperty();
  holder.innerHTML = prop ? renderPropertyDetail(prop) : renderPropertyList();
}
