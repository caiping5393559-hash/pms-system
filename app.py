from pathlib import Path
import base64
import gzip
import hashlib
import re

EXPECTED_SOURCE_SHA256 = "d702011f3f2ca2224047468decdbe5945876cedcb7b4a3eb6c6104b9275a7c0f"

parts = []
for index in range(1, 7):
    chunk = (Path(__file__).with_name(f"pms_payload_{index:02d}.txt")).read_text(encoding="utf-8").strip()
    chunk = re.sub(r"\s+", "", chunk)
    if index == 3 and len(chunk) == 3599 and chunk.endswith("KBv"):
        chunk += "1uGilLUBv"
    parts.append(chunk)
payload = "".join(parts)
source = gzip.decompress(base64.b64decode(payload))
actual = hashlib.sha256(source).hexdigest()
if actual != EXPECTED_SOURCE_SHA256:
    raise RuntimeError(f"PMS payload checksum mismatch: {actual}")

source_text = source.decode("utf-8")

PROPERTY_ROOM_UI_JS = r'''
var selectedPropertyId = '';
function propRooms(propertyId){
  return rooms.filter(room => (room.property_id || ((properties[0] && properties[0].id) || 'property_default')) === propertyId);
}
function activeProperty(){
  if(!properties.length) return null;
  if(!selectedPropertyId || !properties.some(prop => prop.id === selectedPropertyId)) selectedPropertyId = properties[0].id;
  return properties.find(prop => prop.id === selectedPropertyId) || properties[0];
}
function selectProperty(propertyId){ selectedPropertyId = propertyId; renderRoomSettings(); }
function setupPropertyRoomUi(){
  const tab = document.querySelector('button[onclick*="ownerRooms"]');
  if(tab) tab.textContent = '房源 / 房间设置';
  const section = document.getElementById('ownerRooms');
  if(section){
    const h2 = section.querySelector(':scope > .card h2');
    if(h2) h2.textContent = '房源 / 房间设置';
    const p = section.querySelector(':scope > .card p.small');
    if(p) p.textContent = '先添加或选择房源，再进入该房源的房间设置。每个房源可以单独绑定保洁、管理房间、保存 iCal 和公开房源链接。';
  }
  if(document.getElementById('propertyRoomUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'propertyRoomUiStyles';
  style.textContent = `
    #ownerRooms>.card:first-child{border-radius:8px}.property-room-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start}.property-sidebar{border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px;position:sticky;top:92px}.property-list{display:grid;gap:8px;margin-top:10px}.property-list-item{width:100%;border:1px solid var(--line);background:#fff;border-radius:8px;padding:11px;text-align:left;cursor:pointer}.property-list-item.active{border-color:var(--primary);background:#f0fdfa;box-shadow:inset 3px 0 0 var(--primary)}.property-list-title{display:block;font-weight:900;color:var(--text);line-height:1.25}.property-list-meta{display:block;color:var(--muted);font-size:12px;margin-top:5px}.property-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}.property-actions{display:flex;gap:8px;flex-wrap:wrap}.room-setting-card{border:1px solid var(--line);border-radius:8px;background:#fff;padding:14px;margin:12px 0}.room-setting-head{display:grid;grid-template-columns:minmax(180px,1fr) 150px 190px auto;gap:10px;align-items:end}.room-subsection{border:1px dashed var(--line);background:#f8fafc;border-radius:8px;padding:12px;margin-top:12px}.room-subsection h3{margin-bottom:8px}.empty-panel{border:1px dashed var(--line);border-radius:8px;background:#f8fafc;padding:18px;text-align:center;color:var(--muted)}@media(max-width:900px){.property-room-layout{grid-template-columns:1fr}.property-sidebar{position:static}.room-setting-head{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}
function propertyNameInputId(propertyId){ return 'propertyName_' + safeDomId(propertyId); }
async function savePropertyName(propertyId, btn){
  const prop = properties.find(item => item.id === propertyId);
  if(!prop){ alert('找不到这个房源'); return; }
  const input = document.getElementById(propertyNameInputId(propertyId));
  if(input) prop.name = input.value.trim() || prop.name || '未命名房源';
  return saveProperty(propertyId, btn);
}
function addProperty(){
  const prop = {id:'property' + Date.now(), group_id: currentGroupId(), name:'新房源'};
  properties.push(prop);
  selectedPropertyId = prop.id;
  renderOwner(); applyRoleMode();
  saveProperty(prop.id, null);
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
    rooms = rooms.filter(room => (room.property_id || ((properties[0] && properties[0].id) || 'property_default')) !== propertyId);
    bookings = bookings.filter(item => !roomIds.has(item.room_id));
    manualChanges = manualChanges.filter(item => item.target_type !== 'room' || !roomIds.has(item.target_id));
    cleaningNotes = cleaningNotes.filter(item => item.target_type !== 'room' || !roomIds.has(item.target_id));
    roomDateNotes = roomDateNotes.filter(item => !roomIds.has(item.room_id));
    await saveState();
    await loadState();
    selectedPropertyId = (properties[0] && properties[0].id) || '';
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
function moveRoomToProperty(roomId, propertyId){
  const room = rooms.find(item => item.id === roomId);
  if(!room) return;
  room.property_id = propertyId;
  markRoomDirty(roomId);
  renderRoomSettings();
}
function addRoom(){
  const prop = activeProperty();
  if(!prop){ alert('请先添加房源'); return; }
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
function renderPropertySidebar(activeId){
  return `<aside class="property-sidebar"><div class="property-detail-head"><div><h3 style="margin:0">房源</h3><div class="small">先选房源，再管理房间</div></div><button class="smallbtn primary" onclick="addProperty()">添加</button></div><div class="property-list">` + properties.map(prop => {
    const count = propRooms(prop.id).length;
    const cleanerCount = propertyCleanerBindings(prop.id).length;
    return `<button class="property-list-item ${prop.id===activeId?'active':''}" onclick="selectProperty('${esc(prop.id)}')"><span class="property-list-title">${esc(prop.name || prop.id)}</span><span class="property-list-meta">${count} 个房间 · ${cleanerCount} 个保洁绑定</span></button>`;
  }).join('') + `</div></aside>`;
}
function renderCleanerPanel(prop){
  const sid = safeDomId(prop.id);
  const bindings = propertyCleanerBindings(prop.id);
  const cleaners = bindings.length ? bindings.map(item => `<div class="toolbar" style="margin-bottom:4px"><span class="badge green">${esc(cleanerLabel(item.cleaner_code))}</span><button class="smallbtn" onclick="unbindPropertyCleaner('${esc(prop.id)}','${esc(item.cleaner_code)}',this)">删除绑定</button></div>`).join('') : '<div class="small">这个房源还没有绑定保洁。</div>';
  return `<div class="room-subsection"><h3>保洁绑定</h3><div class="small">保洁先去 <a href="/cleaner-register" target="_blank">保洁注册页</a> 注册，把编号发给房东。这里填编号即可绑定。</div><div class="toolbar" style="margin-top:8px"><input id="cleanerCode_${sid}" placeholder="例如：CLN-1234"><button class="smallbtn primary" onclick="bindPropertyCleaner('${esc(prop.id)}',this)">绑定保洁</button></div>${cleaners}</div>`;
}
function renderRoomCard(room, prop){
  const roomProperty = room.property_id || prop.id;
  return `<div class="room-setting-card"><div class="room-setting-head"><div><label>房间名字</label><input value="${esc(room.name || '')}" onchange="updateRoomField('${esc(room.id)}','name',this.value)"></div><div><label>清洁费</label><input type="number" value="${esc(room.cleaning_fee || 0)}" onchange="updateRoomField('${esc(room.id)}','cleaning_fee',this.value)"></div><div><label>移动到房源</label><select onchange="moveRoomToProperty('${esc(room.id)}',this.value)">${propertyOptions(roomProperty)}</select></div><button class="smallbtn" onclick="deleteRoomUi('${esc(room.id)}',this)">删除</button></div><div class="toolbar room-save-toolbar" style="margin-top:10px"><button class="smallbtn primary" onclick="saveRoom('${esc(room.id)}',this)">保存房间设置</button><button class="smallbtn" onclick="saveRoomAndSync('${esc(room.id)}',this)">保存并同步 iCal</button><span class="small" id="${roomSaveStatusId(room.id)}">${roomDirty[room.id] ? '有未保存修改' : '已加载数据库'}</span></div><div class="room-subsection"><h3>iCal 设置</h3><div class="ical-links"><div><div class="ical-label">Airbnb iCal 导出链接</div><input class="ical-input" value="${esc(room.airbnb_ical || '')}" onchange="updateRoomField('${esc(room.id)}','airbnb_ical',this.value)"></div><div><div class="ical-label">Booking iCal 导出链接</div><input class="ical-input" value="${esc(room.booking_ical || '')}" onchange="updateRoomField('${esc(room.id)}','booking_ical',this.value)"></div><div><div class="ical-label">Vrbo iCal 导出链接</div><input class="ical-input" value="${esc(room.vrbo_ical || '')}" onchange="updateRoomField('${esc(room.id)}','vrbo_ical',this.value)"></div><div><div class="ical-label">其他平台 iCal 链接</div><input class="ical-input" value="${esc(room.other_ical || '')}" onchange="updateRoomField('${esc(room.id)}','other_ical',this.value)"></div></div></div><div class="room-subsection"><h3>公开房源链接</h3><div class="ical-links"><div><div class="ical-label">Airbnb 公开链接</div><input class="ical-input" value="${esc(room.airbnb_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','airbnb_public_url',this.value)"></div><div><div class="ical-label">Booking 公开链接</div><input class="ical-input" value="${esc(room.booking_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','booking_public_url',this.value)"></div><div><div class="ical-label">Vrbo 公开链接</div><input class="ical-input" value="${esc(room.vrbo_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','vrbo_public_url',this.value)"></div><div><div class="ical-label">其他公开链接</div><input class="ical-input" value="${esc(room.other_public_url || '')}" onchange="updateRoomField('${esc(room.id)}','other_public_url',this.value)"></div></div></div><div class="room-subsection"><h3>日历订阅地址</h3><div class="copyline">${location.origin}/feed/${esc(room.id)}.ics</div></div></div>`;
}
function renderPropertyDetail(prop){
  const propRoomsList = propRooms(prop.id);
  const cards = propRoomsList.length ? propRoomsList.map(room => renderRoomCard(room, prop)).join('') : `<div class="empty-panel"><strong>这个房源还没有房间</strong><div style="margin-top:10px"><button class="smallbtn primary" onclick="addRoom()">添加第一个房间</button></div></div>`;
  return `<section><div class="property-detail-head"><div><h2 style="margin:0">${esc(prop.name || prop.id)}</h2><div class="small">${propRoomsList.length} 个房间 · 房源 ID：${esc(prop.id)}</div></div><div class="property-actions"><button class="smallbtn primary" onclick="addRoom()">添加房间</button><button class="smallbtn" onclick="deletePropertyUi('${esc(prop.id)}',this)">删除房源</button></div></div><div class="card" style="box-shadow:none"><h3>房源信息</h3><div class="formgrid"><div><label>房源名字</label><input id="${propertyNameInputId(prop.id)}" value="${esc(prop.name || '')}"></div><div><label>房间数量</label><input value="${propRoomsList.length}" disabled></div></div><div class="toolbar" style="margin-top:10px"><button class="smallbtn primary" onclick="savePropertyName('${esc(prop.id)}',this)">保存房源</button></div>${renderCleanerPanel(prop)}</div><div class="card" style="box-shadow:none"><div class="property-detail-head"><div><h3 style="margin:0">房间设置</h3><div class="small">当前只显示这个房源下面的房间。</div></div><button class="smallbtn primary" onclick="addRoom()">添加房间</button></div>${cards}</div></section>`;
}
function renderRoomSettings(){
  setupPropertyRoomUi();
  const syncStatus = document.getElementById('syncIcalStatus');
  if(syncStatus) syncStatus.textContent = (lastSync ? `上次同步：${lastSync}` : '上次同步：未同步') + (syncErrors.length ? ` · 失败 ${syncErrors.length} 个链接` : '');
  const holder = document.getElementById('roomSettings');
  if(!holder) return;
  if(!properties.length){ holder.innerHTML = `<div class="empty-panel"><strong>还没有房源</strong><div style="margin-top:10px"><button class="smallbtn primary" onclick="addProperty()">添加房源</button></div></div>`; return; }
  const prop = activeProperty();
  holder.innerHTML = `<div class="property-room-layout">${renderPropertySidebar(prop.id)}${renderPropertyDetail(prop)}</div>`;
}
'''

old_room_wrapper = """const originalRenderRoomSettings = renderRoomSettings;
renderRoomSettings = function(){
  originalRenderRoomSettings();
  bindRoomSaveControls();
};"""
new_room_wrapper = PROPERTY_ROOM_UI_JS + """
const originalRenderRoomSettings = renderRoomSettings;
renderRoomSettings = function(){
  originalRenderRoomSettings();
};"""
if old_room_wrapper not in source_text:
    raise RuntimeError("room settings hook not found")
source_text = source_text.replace(old_room_wrapper, new_room_wrapper, 1)

handler_marker = "class Handler(BaseHTTPRequestHandler):\n    def do_OPTIONS"
if handler_marker in source_text:
    source_text = source_text.replace(
        handler_marker,
        "class Handler(BaseHTTPRequestHandler):\n    def do_HEAD(self):\n        if urllib.parse.urlparse(self.path).path in ('/', '/login', '/health', '/api/health'):\n            self.send_response(200)\n            self.end_headers()\n            return\n        self.send_response(404)\n        self.end_headers()\n\n    def do_OPTIONS",
        1,
    )

exec(compile(source_text, __file__, "exec"))