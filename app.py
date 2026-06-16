from pathlib import Path
import base64
import gzip
import hashlib
import re

EXPECTED_SOURCE_SHA256 = "d702011f3f2ca2224047468decdbe5945876cedcb7b4a3eb6c6104b9275a7c0f"
BASE = Path(__file__).resolve().parent

parts = []
for index in range(1, 7):
    chunk = (BASE / f"pms_payload_{index:02d}.txt").read_text(encoding="utf-8").strip()
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
ui_patch = (BASE / "pms_ui_patch.js").read_text(encoding="utf-8")
ui_patch += r'''
(function(){
  var propertyNameEditors = {};
  function pmsPropertyNameKey(value){
    return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
  }
  function pmsDisplayPropertyName(value, id){
    const raw = String(value || id || '').trim();
    return raw ? `房源：${raw}` : '未分配房源';
  }
  function pmsPropertyNameDuplicate(propertyId, name){
    const prop = properties.find(item => item.id === propertyId);
    const groupId = (prop && prop.group_id) || currentGroupId();
    const key = pmsPropertyNameKey(name);
    if(!key) return false;
    return properties.some(item => item.id !== propertyId && (item.group_id || currentGroupId()) === groupId && pmsPropertyNameKey(item.name) === key);
  }
  function pmsUniquePropertyName(base){
    const root = base || '新房源';
    const used = new Set(properties.map(prop => pmsPropertyNameKey(prop.name)));
    if(!used.has(pmsPropertyNameKey(root))) return root;
    for(let i = 2; i < 1000; i++){
      const candidate = `${root} ${i}`;
      if(!used.has(pmsPropertyNameKey(candidate))) return candidate;
    }
    return `${root} ${Date.now()}`;
  }
  window.editPropertyName = function(propertyId){
    propertyNameEditors[propertyId] = true;
    renderRoomSettings();
  };
  window.cancelPropertyNameEdit = function(propertyId){
    propertyNameEditors[propertyId] = false;
    renderRoomSettings();
  };
  function pmsRoleText(user){
    const role = (user && user.role) || 'owner';
    if(role === 'admin') return 'admin';
    if(role === 'cleaner') return 'cleaner';
    return 'owner';
  }
  function pmsOwnerHeaderTitle(){
    const name = (currentUser && (currentUser.name || currentUser.username)) || '房东';
    return `${name} · ${pmsRoleText(currentUser)}的PMS管理后台`;
  }
  window.updatePmsHeaderIdentity = function(){
    const title = document.querySelector('header h1');
    const subtitle = document.querySelector('header h1 + .small');
    const role = getRoleFromPath();
    if(role === 'cleaner'){
      if(title) title.textContent = '保洁查看页面';
      document.title = '保洁查看页面';
      return;
    }
    const text = pmsOwnerHeaderTitle();
    if(title) title.textContent = text;
    if(subtitle) subtitle.textContent = '管理房源、房间、公区、iCal 同步和保洁绑定。';
    document.title = text;
  };
  window.renderAccountBar = function(){
    const nav = document.querySelector('.nav');
    if(!nav) return;
    nav.querySelectorAll('span.small').forEach(el => el.remove());
    if(!document.getElementById('logoutBtn')){
      const btn = document.createElement('button');
      btn.id = 'logoutBtn';
      btn.textContent = '退出登录';
      btn.onclick = logout;
      nav.appendChild(btn);
    }
    updatePmsHeaderIdentity();
  };
  const baseApplyRoleMode = applyRoleMode;
  applyRoleMode = function(){
    baseApplyRoleMode();
    updatePmsHeaderIdentity();
  };
  const baseSetupPropertyRoomUi = setupPropertyRoomUi;
  setupPropertyRoomUi = function(){
    baseSetupPropertyRoomUi();
    const tab = document.querySelector('button[onclick*="ownerRooms"]');
    if(tab){
      tab.textContent = '房源 / 房间设置';
      tab.setAttribute('onclick', "showOwnerTab('ownerRooms', this); backToPropertyList();");
    }
    const section = document.getElementById('ownerRooms');
    if(section){
      section.querySelectorAll('button[onclick="addRoom()"]').forEach(btn => { btn.style.display = 'none'; });
    }
    if(document.body && !document.body.dataset.propertyRoomClickBound){
      document.body.dataset.propertyRoomClickBound = '1';
      document.addEventListener('click', function(event){
        const opener = event.target.closest && event.target.closest('[data-open-property]');
        if(!opener) return;
        event.preventDefault();
        openPropertyRooms(opener.getAttribute('data-open-property'));
      });
    }
  };
  openPropertyRooms = function(propertyId){
    selectedPropertyId = String(propertyId || '');
    renderRoomSettings();
  };
  savePropertyName = async function(propertyId, btn){
    const prop = properties.find(item => item.id === propertyId);
    if(!prop){ alert('找不到这个房源'); return null; }
    const input = document.getElementById(propertyNameInputId(propertyId));
    const nextName = input ? (input.value.trim() || prop.name || '未命名房源') : (prop.name || '未命名房源');
    if(pmsPropertyNameDuplicate(propertyId, nextName)){
      alert('房源名字不能重复，请换一个名字。');
      return null;
    }
    prop.name = nextName;
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
      applyServerState(data.state || data);
      propertyNameEditors[propertyId] = false;
      selectedPropertyId = properties.some(item => item.id === propertyId) && selectedPropertyId === propertyId ? propertyId : '';
      renderCleaner(); renderOwner(); applyRoleMode(); renderAccountBar();
      if(selectedPropertyId) renderRoomSettings();
      return data;
    }catch(e){
      alert('保存房源名字失败：' + e.message);
      return null;
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = oldText || '保存名字'; }
    }
  };
  addProperty = function(){
    const prop = {id:'property' + Date.now(), group_id: currentGroupId(), name:pmsUniquePropertyName('新房源')};
    properties.push(prop);
    selectedPropertyId = '';
    renderRoomSettings();
    savePropertyName(prop.id, null).then(data => {
      if(data){ applyServerState(data.state || data); selectedPropertyId = ''; renderRoomSettings(); }
    });
  };
  renderPropertyList = function(){
    const cards = properties.map(prop => {
      const roomCount = propRooms(prop.id).length;
      const commonCount = propCommonAreas(prop.id).length;
      const cleanerCount = propertyCleanerBindings(prop.id).length;
      const editing = !!propertyNameEditors[prop.id];
      const nameBlock = editing ? `
        <label>房源名字</label>
        <div class="property-name-edit"><input id="${propertyNameInputId(prop.id)}" value="${esc(prop.name || '')}" placeholder="例如：洛杉矶市中心 1 号房源"><button class="smallbtn" onclick="savePropertyName('${esc(prop.id)}',this)">保存名字</button><button class="smallbtn" onclick="cancelPropertyNameEdit('${esc(prop.id)}')">取消</button></div>
      ` : `
        <div class="property-title-line">${esc(pmsDisplayPropertyName(prop.name, prop.id))}</div>
        <button class="smallbtn" onclick="editPropertyName('${esc(prop.id)}')">修改名字</button>
      `;
      return `<div class="property-card-row">
        <div>
          ${nameBlock}
          <div class="property-meta-line">${roomCount} 个房间 · ${commonCount} 个公区 · ${cleanerCount} 个保洁绑定</div>
          ${propertyCleanerSummary(prop.id)}
        </div>
        <div class="property-card-actions">
          <button type="button" class="smallbtn primary" data-open-property="${esc(prop.id)}">进入房间设置</button>
          <button class="smallbtn" onclick="deletePropertyUi('${esc(prop.id)}',this)">删除房源</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="property-list-page">
      <div class="property-list-head">
        <div><h3 style="margin:0">房源列表</h3><div class="small">默认房源会显示在这里；点修改名字才会出现输入框，进入后再管理房间、公区和 iCal。</div></div>
        <button class="smallbtn primary" onclick="addProperty()">添加房源</button>
      </div>
      <div class="property-cards">${cards}</div>
    </div>`;
  };
  const style = document.createElement('style');
  style.textContent = '.property-title-line{font-size:18px;font-weight:900;color:var(--text);line-height:1.25;margin-bottom:8px}';
  document.head.appendChild(style);
})();
'''
old_room_wrapper = """const originalRenderRoomSettings = renderRoomSettings;
renderRoomSettings = function(){
  originalRenderRoomSettings();
  bindRoomSaveControls();
};"""
new_room_wrapper = ui_patch + """
const originalRenderRoomSettings = renderRoomSettings;
renderRoomSettings = function(){
  originalRenderRoomSettings();
};"""
if old_room_wrapper not in source_text:
    raise RuntimeError("room settings hook not found")
source_text = source_text.replace(old_room_wrapper, new_room_wrapper, 1)

old_get_start = """            parsed, _ = parse_query(self.path)
            path = parsed.path
"""
new_get_start = """            parsed, _ = parse_query(self.path)
            path = parsed.path
            if urllib.parse.parse_qs(parsed.query).get("key"):
                self.send_response(302)
                self.send_header("Location", "/login")
                self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
                self.end_headers()
                return
"""
if new_get_start not in source_text:
    if old_get_start not in source_text:
        raise RuntimeError("GET route hook not found")
    source_text = source_text.replace(old_get_start, new_get_start, 1)

old_sync_function = """def sync_icals(actor=None):
    state = normalize_state(load_state())
    allowed_room_ids = actor_room_ids(actor, state) if actor else {room.get("id") for room in state.get("rooms", []) if isinstance(room, dict)}
"""
new_sync_function = """def sync_icals(actor=None, property_id=None):
    state = normalize_state(load_state())
    allowed_property_ids = actor_property_ids(actor, state) if actor else {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict)}
    requested_property_id = str(property_id or "").strip()
    if requested_property_id:
        if requested_property_id not in allowed_property_ids:
            raise RuntimeError("property permission required")
        allowed_property_ids = {requested_property_id}
    allowed_room_ids = {
        room.get("id")
        for room in state.get("rooms", [])
        if isinstance(room, dict) and room.get("property_id") in allowed_property_ids
    }
"""
if new_sync_function not in source_text:
    if old_sync_function not in source_text:
        raise RuntimeError("iCal sync hook not found")
    source_text = source_text.replace(old_sync_function, new_sync_function, 1)

old_sync_bookings_start = """    state["bookings"] = [
        booking
"""
new_sync_bookings_start = """    sync_time = datetime.now().isoformat(timespec="seconds")
    state["bookings"] = [
        booking
"""
if new_sync_bookings_start not in source_text:
    if old_sync_bookings_start not in source_text:
        raise RuntimeError("iCal sync timestamp hook not found")
    source_text = source_text.replace(old_sync_bookings_start, new_sync_bookings_start, 1)

old_sync_room_start = """        room_id = room.get("id")
        for platform, url in [("Airbnb", room.get("airbnb_ical", "")), ("Booking", room.get("booking_ical", "")), ("Vrbo", room.get("vrbo_ical", "")), ("Other", room.get("other_ical", ""))]:
"""
new_sync_room_start = """        room_id = room.get("id")
        room["last_sync"] = sync_time
        room["sync_error"] = ""
        room["synced_booking_count"] = 0
        for platform, url in [("Airbnb", room.get("airbnb_ical", "")), ("Booking", room.get("booking_ical", "")), ("Vrbo", room.get("vrbo_ical", "")), ("Other", room.get("other_ical", ""))]:
"""
if new_sync_room_start not in source_text:
    if old_sync_room_start not in source_text:
        raise RuntimeError("iCal sync room log hook not found")
    source_text = source_text.replace(old_sync_room_start, new_sync_room_start, 1)

old_sync_import = """                state["bookings"].extend(parse_ics(fetch_text(url), platform, room_id))
"""
new_sync_import = """                imported = parse_ics(fetch_text(url), platform, room_id)
                room["synced_booking_count"] = int(room.get("synced_booking_count") or 0) + len(imported)
                state["bookings"].extend(imported)
"""
if new_sync_import not in source_text:
    if old_sync_import not in source_text:
        raise RuntimeError("iCal sync import count hook not found")
    source_text = source_text.replace(old_sync_import, new_sync_import, 1)

old_sync_error = """                errors.append({"room_id": room_id, "platform": platform, "error": str(exc)})
"""
new_sync_error = """                message = str(exc)
                room["sync_error"] = (room.get("sync_error") + "；" if room.get("sync_error") else "") + f"{platform}: {message}"
                errors.append({"room_id": room_id, "platform": platform, "error": message})
"""
if new_sync_error not in source_text:
    if old_sync_error not in source_text:
        raise RuntimeError("iCal sync error log hook not found")
    source_text = source_text.replace(old_sync_error, new_sync_error, 1)

old_sync_last_sync = """    state["last_sync"] = datetime.now().isoformat(timespec="seconds")
"""
new_sync_last_sync = """    state["last_sync"] = sync_time
"""
if new_sync_last_sync not in source_text:
    if old_sync_last_sync not in source_text:
        raise RuntimeError("iCal sync last_sync hook not found")
    source_text = source_text.replace(old_sync_last_sync, new_sync_last_sync, 1)

old_sync_route = """            if path == "/api/sync":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                json_response(self, filter_state_for_user(sync_icals(actor=user), user))
                return
"""
new_sync_route = """            if path == "/api/sync":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}") if raw else {}
                json_response(self, filter_state_for_user(sync_icals(actor=user, property_id=payload.get("property_id")), user))
                return
"""
if new_sync_route not in source_text:
    if old_sync_route not in source_text:
        raise RuntimeError("iCal sync route hook not found")
    source_text = source_text.replace(old_sync_route, new_sync_route, 1)

old_visible_room_ids = """    room_ids = {room.get("id") for room in rooms}
    cleaner_codes = {
"""
new_visible_room_ids = """    room_ids = {room.get("id") for room in rooms}
    common_areas = [area for area in state.get("commonAreas", []) if isinstance(area, dict) and area.get("property_id") in property_ids]
    common_area_ids = {area.get("id") for area in common_areas}
    cleaner_codes = {
"""
if new_visible_room_ids not in source_text:
    if old_visible_room_ids not in source_text:
        raise RuntimeError("visible common area scope hook not found")
    source_text = source_text.replace(old_visible_room_ids, new_visible_room_ids, 1)

old_visible_rooms = """    visible["rooms"] = rooms
    visible["bookings"] = [booking for booking in state.get("bookings", []) if isinstance(booking, dict) and booking.get("room_id") in room_ids]
"""
new_visible_rooms = """    visible["rooms"] = rooms
    visible["commonAreas"] = common_areas
    visible["bookings"] = [booking for booking in state.get("bookings", []) if isinstance(booking, dict) and booking.get("room_id") in room_ids]
"""
if new_visible_rooms not in source_text:
    if old_visible_rooms not in source_text:
        raise RuntimeError("visible common area list hook not found")
    source_text = source_text.replace(old_visible_rooms, new_visible_rooms, 1)

old_common_note_filter = """        if isinstance(item, dict) and (item.get("target_type") == "common" or item.get("target_id") in room_ids)
"""
new_common_note_filter = """        if isinstance(item, dict)
        and (
            (item.get("target_type") == "common" and item.get("target_id") in common_area_ids)
            or (item.get("target_type") != "common" and item.get("target_id") in room_ids)
        )
"""
if old_common_note_filter in source_text:
    source_text = source_text.replace(old_common_note_filter, new_common_note_filter, 2)

old_common_defaults = """        area.setdefault("type", "common")
        area.setdefault("cleaning_fee", 0)
"""
new_common_defaults = """        area.setdefault("type", "common")
        area.setdefault("property_id", default_property)
        area.setdefault("cleaning_fee", 0)
"""
if new_common_defaults not in source_text:
    if old_common_defaults not in source_text:
        raise RuntimeError("common area default property hook not found")
    source_text = source_text.replace(old_common_defaults, new_common_defaults, 1)

old_common_save = """        for key in ["commonAreas", "last_sync", "sync_errors"]:
            if key in payload:
                merged[key] = payload.get(key)
"""
new_common_save = """        if "commonAreas" in payload:
            incoming_common_areas = []
            for area in payload.get("commonAreas", []):
                if not isinstance(area, dict):
                    continue
                property_id = str(area.get("property_id") or first_actor_property_id(actor, current))
                if property_id not in property_ids:
                    continue
                fixed = dict(area)
                fixed["property_id"] = property_id
                fixed.setdefault("type", "common")
                incoming_common_areas.append(fixed)
            merged["commonAreas"] = merge_scoped_list(
                current.get("commonAreas", []),
                incoming_common_areas,
                lambda item: (item.get("property_id") or first_actor_property_id(actor, current)) not in property_ids,
            )
        for key in ["last_sync", "sync_errors"]:
            if key in payload:
                merged[key] = payload.get(key)
"""
if new_common_save not in source_text:
    if old_common_save not in source_text:
        raise RuntimeError("common area save scope hook not found")
    source_text = source_text.replace(old_common_save, new_common_save, 1)

old_save_scope_ids = """        property_ids = actor_property_ids(actor, current)
        room_ids = actor_room_ids(actor, current)
"""
new_save_scope_ids = """        property_ids = actor_property_ids(actor, current)
        room_ids = actor_room_ids(actor, current)
        common_area_ids = {
            area.get("id")
            for area in current.get("commonAreas", [])
            if isinstance(area, dict)
            and (area.get("property_id") or first_actor_property_id(actor, current)) in property_ids
        }
"""
if new_save_scope_ids not in source_text:
    if old_save_scope_ids not in source_text:
        raise RuntimeError("save scoped common area ids hook not found")
    source_text = source_text.replace(old_save_scope_ids, new_save_scope_ids, 1)

old_manual_note_scope = """                lambda item: item.get("target_type") != "room" or item.get("target_id") not in room_ids,
"""
new_manual_note_scope = """                lambda item: (
                    (item.get("target_type") == "common" and item.get("target_id") not in common_area_ids)
                    or (item.get("target_type") != "common" and item.get("target_id") not in room_ids)
                ),
"""
if old_manual_note_scope in source_text:
    source_text = source_text.replace(old_manual_note_scope, new_manual_note_scope, 2)

owner_register_backend = r'''
def normalized_property_name(value):
    return re.sub(r"\s+", "", str(value or "").strip()).lower()


def validate_property_names_unique(state):
    seen = set()
    for prop in normalize_state(state).get("properties", []):
        if not isinstance(prop, dict):
            continue
        key = normalized_property_name(prop.get("name"))
        if not key:
            continue
        scoped = (prop.get("group_id") or DEFAULT_GROUP_ID, key)
        if scoped in seen:
            raise RuntimeError("同一房东下房源名字不能重复")
        seen.add(scoped)


def username_key(value):
    return str(value or "").strip().lower()


def login_name_exists(state, username):
    key = username_key(username)
    if not key:
        return False
    return find_user_for_login(state, key) is not None


def unique_state_id(state, prefix, field="id"):
    existing = {str(item.get(field) or "") for key in STATE_KEYS for item in state.get(key, []) if isinstance(item, dict)}
    for _ in range(100):
        candidate = f"{prefix}_{secrets.token_hex(4)}"
        if candidate not in existing:
            return candidate
    return f"{prefix}_{secrets.token_hex(8)}"


def register_owner(payload):
    if not isinstance(payload, dict):
        raise RuntimeError("payload must be an object")
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "").strip()
    name = str(payload.get("name") or "").strip() or username
    if not username:
        raise RuntimeError("username is required")
    if not password:
        raise RuntimeError("password is required")
    state = normalize_state(load_state())
    if login_name_exists(state, username):
        raise RuntimeError("username already exists")
    group_id = unique_state_id(state, "group")
    owner_id = unique_state_id(state, "owner")
    property_id = unique_state_id(state, "property")
    state["groups"].append({"id": group_id, "name": f"{name}的房东组", "created_at": now_utc_iso()})
    user = {
        "id": owner_id,
        "username": username,
        "role": "owner",
        "name": name,
        "group_ids": [group_id],
        "password_hash": password_hash(password),
        "created_at": now_utc_iso(),
    }
    state["users"].append(user)
    state["properties"].append({"id": property_id, "group_id": group_id, "name": "默认房源", "created_at": now_utc_iso()})
    saved = save_state(state)
    return saved, public_user(user)
'''
register_cleaner_marker = "\ndef register_cleaner(payload):\n"
if "def register_owner(payload):" not in source_text:
    if register_cleaner_marker not in source_text:
        raise RuntimeError("owner register insertion hook not found")
    source_text = source_text.replace(register_cleaner_marker, "\n" + owner_register_backend + register_cleaner_marker, 1)

source_text = source_text.replace(
    "        return save_state(merged)\n",
    "        validate_property_names_unique(merged)\n        return save_state(merged)\n",
    1,
)
source_text = source_text.replace(
    "    return save_state(merged)\n\n\ndef generate_cleaner_code",
    "    validate_property_names_unique(merged)\n    return save_state(merged)\n\n\ndef generate_cleaner_code",
    1,
)

old_save_property_block = '''    if prop is None:
        prop = {"id": property_id, "group_id": requested_group_id}
        state["properties"].append(prop)
    prop["id"] = property_id
    prop["group_id"] = requested_group_id if actor and actor.get("role") != "admin" else str(payload.get("group_id") or prop.get("group_id") or state.get("current_group_id") or DEFAULT_GROUP_ID)
    prop["name"] = str(payload.get("name") or prop.get("name") or "未命名房源").strip()
'''
new_save_property_block = '''    if prop is None:
        prop = {"id": property_id, "group_id": requested_group_id}
        state["properties"].append(prop)
    proposed_group_id = requested_group_id if actor and actor.get("role") != "admin" else str(payload.get("group_id") or prop.get("group_id") or state.get("current_group_id") or DEFAULT_GROUP_ID)
    proposed_name = str(payload.get("name") or prop.get("name") or "未命名房源").strip()
    name_key = normalized_property_name(proposed_name)
    if name_key and any(
        item.get("id") != property_id
        and item.get("group_id") == proposed_group_id
        and normalized_property_name(item.get("name")) == name_key
        for item in state["properties"]
        if isinstance(item, dict)
    ):
        raise RuntimeError("同一房东下房源名字不能重复")
    prop["id"] = property_id
    prop["group_id"] = proposed_group_id
    prop["name"] = proposed_name
'''
if new_save_property_block not in source_text:
    if old_save_property_block not in source_text:
        raise RuntimeError("property duplicate hook not found")
    source_text = source_text.replace(old_save_property_block, new_save_property_block, 1)

source_text = source_text.replace(
    '''    <div class="links">
      <a href="/cleaner-register">保洁注册</a>
    </div>''',
    '''    <div class="links">
      <a href="/owner-register">房东注册</a>
      <a href="/cleaner-register">保洁注册</a>
    </div>''',
    1,
)

owner_register_page_source = r'''
def owner_register_page():
    return """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>房东注册</title>
<style>
body{margin:0;background:#f5f7fb;color:#182230;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
main{max-width:520px;margin:8vh auto;padding:0 16px}
.card{background:#fff;border:1px solid #d9e1ec;border-radius:12px;padding:20px;box-shadow:0 8px 22px rgba(16,24,40,.06)}
h1{font-size:24px;margin:0 0 8px}.small{color:#667085;font-size:14px;line-height:1.5}
label{display:block;font-weight:800;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;border:1px solid #d9e1ec;border-radius:10px;padding:11px;font-size:15px}
button{width:100%;margin-top:16px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:800;padding:12px 14px;cursor:pointer}
.links{display:flex;justify-content:space-between;gap:12px;margin-top:14px}.links a{color:#0f766e;text-decoration:none;font-weight:700}
.result{margin-top:16px;padding:12px;border-radius:10px;background:#f0fdfa;border:1px solid #99f6e4;word-break:break-all}
.err{background:#fff1f2;border-color:#fb7185}
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>房东注册</h1>
    <div class="small">注册后会自动创建你的房东组和一个默认房源。进入后台后可以重命名房源、添加房间和绑定保洁。</div>
    <label>用户名</label>
    <input id="username" autocomplete="username" autofocus>
    <label>显示名字</label>
    <input id="name" autocomplete="name" placeholder="例如：默认房东">
    <label>登录密码</label>
    <input id="password" type="password" autocomplete="new-password">
    <button id="submitBtn" onclick="registerOwner()">注册并进入后台</button>
    <div id="result"></div>
    <div class="links"><a href="/login">返回登录</a><a href="/cleaner-register">保洁注册</a></div>
  </div>
</main>
<script>
async function registerOwner(){
  const btn = document.getElementById('submitBtn');
  const result = document.getElementById('result');
  btn.disabled = true;
  btn.textContent = '注册中...';
  result.innerHTML = '';
  try{
    const res = await fetch('/api/owners/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        username: document.getElementById('username').value,
        name: document.getElementById('name').value,
        password: document.getElementById('password').value
      })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.ok === false){ throw new Error(data.error || '注册失败'); }
    location.href = data.redirect || '/owner';
  }catch(e){
    result.className = 'result err';
    result.textContent = e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = '注册并进入后台';
  }
}
document.addEventListener('keydown', event => { if(event.key === 'Enter') registerOwner(); });
</script>
</body>
</html>"""
'''
cleaner_page_marker = "\ndef cleaner_register_page():\n"
if "def owner_register_page():" not in source_text:
    if cleaner_page_marker not in source_text:
        raise RuntimeError("owner register page hook not found")
    source_text = source_text.replace(cleaner_page_marker, "\n" + owner_register_page_source + cleaner_page_marker, 1)

source_text = source_text.replace(
    '''            if path in ("/", "/login"):
                text_response(self, login_page(), content_type="text/html; charset=utf-8")
                return
            if path == "/cleaner-register":''',
    '''            if path in ("/", "/login"):
                text_response(self, login_page(), content_type="text/html; charset=utf-8")
                return
            if path == "/owner-register":
                text_response(self, owner_register_page(), content_type="text/html; charset=utf-8")
                return
            if path == "/cleaner-register":''',
    1,
)

source_text = source_text.replace(
    '''            if path == "/api/cleaners/register":
                payload = json.loads(raw.decode("utf-8") or "{}")
                _, cleaner = register_cleaner(payload)
                json_response(self, {"ok": True, "cleaner": cleaner})
                return
            if path.startswith("/api/property/"):''',
    '''            if path == "/api/cleaners/register":
                payload = json.loads(raw.decode("utf-8") or "{}")
                _, cleaner = register_cleaner(payload)
                json_response(self, {"ok": True, "cleaner": cleaner})
                return
            if path == "/api/owners/register":
                payload = json.loads(raw.decode("utf-8") or "{}")
                _, owner = register_owner(payload)
                token = make_session_token(owner.get("id"))
                json_response(
                    self,
                    {"ok": True, "owner": owner, "redirect": "/owner"},
                    extra_headers={"Set-Cookie": f"{SESSION_COOKIE}={urllib.parse.quote(token)}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Lax"},
                )
                return
            if path.startswith("/api/property/"):''',
    1,
)

handler_marker = "class Handler(BaseHTTPRequestHandler):\n    def do_OPTIONS"
if handler_marker in source_text:
    source_text = source_text.replace(
        handler_marker,
        "class Handler(BaseHTTPRequestHandler):\n    def do_HEAD(self):\n        if urllib.parse.urlparse(self.path).path in ('/', '/login', '/owner-register', '/cleaner-register', '/health', '/api/health'):\n            self.send_response(200)\n            self.end_headers()\n            return\n        self.send_response(404)\n        self.end_headers()\n\n    def do_OPTIONS",
        1,
    )

exec(compile(source_text, __file__, "exec"))
