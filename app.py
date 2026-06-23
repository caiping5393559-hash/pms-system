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
PMS_PATCH_VERSION = "2026-06-23-fast-ical-sync-v1"
if "import threading\nimport time\n" not in source_text:
    source_text = source_text.replace(
        "import urllib.error\n",
        "import urllib.error\nimport threading\nimport time\n",
        1,
    )
if "from zoneinfo import ZoneInfo\n" not in source_text:
    source_text = source_text.replace(
        "from email.utils import formatdate\n",
        "from email.utils import formatdate\nfrom zoneinfo import ZoneInfo\n",
        1,
    )

old_firestore_request = '''def firestore_request(method, url, payload=None, timeout=12):
    headers = {"Authorization": f"Bearer {access_token()}"}
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firestore HTTP {exc.code}: {body}") from exc
'''
new_firestore_request = '''def firestore_request(method, url, payload=None, timeout=12):
    headers = {"Authorization": f"Bearer {access_token()}"}
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firestore HTTP {exc.code}: {body[:500]}") from exc
    except Exception as exc:
        reason = getattr(exc, "reason", None) or str(exc) or exc.__class__.__name__
        raise RuntimeError(f"Firebase database request failed: {reason}") from exc
'''
if new_firestore_request not in source_text:
    if old_firestore_request not in source_text:
        raise RuntimeError("Firestore request hook not found")
    source_text = source_text.replace(old_firestore_request, new_firestore_request, 1)

old_service_account_paths = '''    for path in [Path(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")), BASE / "firebase-key.json", BASE / "firebase-adminsdk.json"]:
        if path and path.exists():
            SERVICE_ACCOUNT_CACHE = json.loads(path.read_text(encoding="utf-8"))
            return SERVICE_ACCOUNT_CACHE
'''
new_service_account_paths = '''    credential_path = str(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    candidates = []
    if credential_path:
        candidates.append(Path(credential_path))
    candidates.extend([BASE / "firebase-key.json", BASE / "firebase-adminsdk.json"])
    for path in candidates:
        if path and path.is_file():
            SERVICE_ACCOUNT_CACHE = json.loads(path.read_text(encoding="utf-8"))
            return SERVICE_ACCOUNT_CACHE
'''
if new_service_account_paths not in source_text:
    if old_service_account_paths not in source_text:
        raise RuntimeError("Firebase credential path hook not found")
    source_text = source_text.replace(old_service_account_paths, new_service_account_paths, 1)

old_state_io = '''def load_state():
    doc = firestore_request("GET", firestore_doc_url())
    if not doc:
        return load_seed_state()
    fields = doc.get("fields", {})
    if "state_json" in fields:
        return normalize_state(json.loads(fields["state_json"].get("stringValue") or "{}"))
    raw = {key: from_firestore_value(value) for key, value in fields.items()}
    return normalize_state(raw) if any(key in raw for key in STATE_KEYS) else load_seed_state()


def save_state(state):
    state = normalize_state(state)
    payload = {"fields": {"state_json": {"stringValue": json.dumps(state, ensure_ascii=False, separators=(",", ":"))}, "updated_at": {"timestampValue": now_utc_iso()}}}
    firestore_request("PATCH", firestore_doc_url(), payload=payload)
    return state
'''
new_state_io = '''def firebase_credentials_configured():
    if os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or os.environ.get("FIREBASE_ADMINSDK_JSON") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_BASE64"):
        return True
    credential_path = str(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    if credential_path and Path(credential_path).is_file():
        return True
    return (BASE / "firebase-key.json").is_file() or (BASE / "firebase-adminsdk.json").is_file()


def write_local_state(state):
    STATE_PATH.write_text(json.dumps(normalize_state(state), ensure_ascii=False, indent=2), encoding="utf-8")


def load_state():
    if not firebase_credentials_configured():
        if STATE_PATH.is_file():
            return normalize_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
        return load_seed_state()
    doc = firestore_request("GET", firestore_doc_url())
    if not doc:
        return load_seed_state()
    fields = doc.get("fields", {})
    compressed = fields.get("state_gzip_base64", {}).get("stringValue") or ""
    if compressed:
        raw = gzip.decompress(base64.b64decode(compressed.encode("ascii"))).decode("utf-8")
        return normalize_state(json.loads(raw or "{}"))
    if "state_json" in fields:
        return normalize_state(json.loads(fields["state_json"].get("stringValue") or "{}"))
    raw = {key: from_firestore_value(value) for key, value in fields.items()}
    return normalize_state(raw) if any(key in raw for key in STATE_KEYS) else load_seed_state()


def save_state(state):
    state = normalize_state(state)
    if not firebase_credentials_configured():
        write_local_state(state)
        return state
    raw = json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = base64.b64encode(gzip.compress(raw, compresslevel=9)).decode("ascii")
    if len(compressed) > 950000:
        raise RuntimeError(f"Compressed state is still too large for one Firestore document: {len(compressed)} bytes")
    payload = {
        "fields": {
            "state_json": {"stringValue": ""},
            "state_gzip_base64": {"stringValue": compressed},
            "state_storage": {"stringValue": "gzip_base64"},
            "state_raw_bytes": {"integerValue": str(len(raw))},
            "state_compressed_bytes": {"integerValue": str(len(compressed))},
            "updated_at": {"timestampValue": now_utc_iso()},
        }
    }
    firestore_request("PATCH", firestore_doc_url(), payload=payload)
    return state
'''
if new_state_io not in source_text:
    if old_state_io not in source_text:
        raise RuntimeError("state IO fallback hook not found")
    source_text = source_text.replace(old_state_io, new_state_io, 1)
ui_patch = (BASE / "pms_ui_patch.js").read_text(encoding="utf-8")
ui_patch += r'''
(function(){
  var propertyNameEditors = {};
  function pmsPropertyNameKey(value){
    return String(value || '').trim().replace(/\\s+/g, '').toLowerCase();
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
      tab.textContent = '房间设置';
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
admin_ui_patch = r'''
(function(){
  function adminEsc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function adminList(name){try{const value=eval(name);return Array.isArray(value)?value:[];}catch(e){return Array.isArray(window[name])?window[name]:[];}}
  function adminCurrent(){try{return currentUser||window.currentUser||null;}catch(e){return window.currentUser||null;}}
  function adminGroups(){return adminList('groups');}
  function adminUsers(){return adminList('users');}
  function adminProperties(){return adminList('properties');}
  function adminRooms(){return adminList('rooms');}
  function adminAreas(){return adminList('commonAreas');}
  function adminCleaners(){return adminList('propertyCleaners');}
  function adminUserName(user){return user?(user.name||user.username||user.cleaner_code||user.id||'未命名用户'):'未分配';}
  function adminGroupName(id){const g=adminGroups().find(x=>x&&x.id===id);return g?(g.name||g.id):id;}
  function adminUserGroups(user){return (user&&Array.isArray(user.group_ids)?user.group_ids:[]).filter(Boolean);}
  function adminPropName(prop){return '房源：' + (prop&&(prop.name||prop.id)||'未命名房源');}
  function adminRoomName(room){return room&&(room.name||room.id)||'未命名房间';}
  function adminAreaName(area){return area&&(area.name||area.id)||'未命名公区';}
  function adminPropRooms(propertyId){return adminRooms().filter(r=>(r.property_id||'property_default')===propertyId);}
  function adminPropAreas(propertyId){return adminAreas().filter(a=>(a.property_id||'property_default')===propertyId);}
  function adminPropCleaners(propertyId){return adminCleaners().filter(x=>x.property_id===propertyId);}
  function adminOwners(){return adminUsers().filter(u=>u&&u.role==='owner');}
  function adminCleanerUsers(){return adminUsers().filter(u=>u&&u.role==='cleaner');}
  function adminOwnerForProperty(prop){const gid=prop&&prop.group_id;return adminOwners().filter(u=>adminUserGroups(u).includes(gid));}
  function adminCleanerLabel(code){const normalized=String(code||'').trim().toUpperCase();const user=adminCleanerUsers().find(u=>String(u.cleaner_code||'').trim().toUpperCase()===normalized);return user?`${adminUserName(user)}（${normalized}）`:(normalized||'未知保洁');}
  function adminPlatformBadges(room){const items=[['Airbnb',room&&room.airbnb_ical],['Booking',room&&room.booking_ical],['Vrbo',room&&room.vrbo_ical],['其他平台',room&&room.other_ical],['公开链接',room&&(room.airbnb_public_url||room.booking_public_url||room.vrbo_public_url||room.other_public_url)]];
    return items.map(([label,val])=>`<span class="badge ${val?'green':''}">${adminEsc(label)}：${val?'已设置':'未设置'}</span>`).join(' ');
  }
  function adminPropertySummary(prop){
    const owners=adminOwnerForProperty(prop), rooms=adminPropRooms(prop.id), areas=adminPropAreas(prop.id), cleanerLinks=adminPropCleaners(prop.id);
    const cleanerText=cleanerLinks.length?cleanerLinks.map(x=>adminCleanerLabel(x.cleaner_code)).join('、'):'未绑定';
    const roomRows=rooms.length?rooms.map(r=>`<tr><td>${adminEsc(adminRoomName(r))}</td><td>$${Number(r.cleaning_fee||0)}</td><td>${adminPlatformBadges(r)}</td></tr>`).join(''):`<tr><td colspan="3">暂无房间</td></tr>`;
    const areaRows=areas.length?areas.map(a=>`<span class="badge orange">${adminEsc(adminAreaName(a))} $${Number(a.cleaning_fee||0)}</span>`).join(' '):'未设置公区';
    return `<div class="admin-panel admin-property-card"><div class="property-detail-head"><div><h3>${adminEsc(adminPropName(prop))}</h3><div class="small">房东：${adminEsc(owners.map(adminUserName).join('、')||'未分配')} ｜ 分组：${adminEsc(adminGroupName(prop.group_id))}</div></div><div class="small">房间 ${rooms.length} ｜ 公区 ${areas.length} ｜ 保洁 ${cleanerLinks.length}</div></div><div class="admin-property-meta"><div><strong>保洁绑定</strong><div>${adminEsc(cleanerText)}</div></div><div><strong>公区/特殊房间</strong><div>${areaRows}</div></div></div><table class="admin-table"><tr><th>房间</th><th>清洁费</th><th>房间设置</th></tr>${roomRows}</table></div>`;
  }
  function adminOwnerRows(){
    const owners=adminOwners();
    if(!owners.length)return '<tr><td colspan="8">暂无房东注册账号</td></tr>';
    return owners.map(u=>{const gids=adminUserGroups(u), props=adminProperties().filter(p=>gids.includes(p.group_id)), rooms=props.reduce((s,p)=>s+adminPropRooms(p.id).length,0), areas=props.reduce((s,p)=>s+adminPropAreas(p.id).length,0), cleaners=new Set(props.flatMap(p=>adminPropCleaners(p.id).map(x=>String(x.cleaner_code||'').toUpperCase()).filter(Boolean)));return `<tr><td><strong>${adminEsc(adminUserName(u))}</strong><div class="small">${adminEsc(u.id||'')}</div></td><td>${adminEsc(u.username||'未设置')}</td><td>${adminEsc(gids.map(adminGroupName).join('、')||'未分组')}</td><td>${props.length}</td><td>${rooms}</td><td>${areas}</td><td>${cleaners.size}</td><td>${adminEsc(u.created_at||'')}</td></tr>`;}).join('');
  }
  function adminCleanerRows(){
    const cleaners=adminCleanerUsers();
    if(!cleaners.length)return '<tr><td colspan="7">暂无保洁注册账号</td></tr>';
    return cleaners.map(u=>{const code=String(u.cleaner_code||'').toUpperCase(), links=adminCleaners().filter(x=>String(x.cleaner_code||'').toUpperCase()===code), props=links.map(x=>adminProperties().find(p=>p.id===x.property_id)).filter(Boolean);return `<tr><td><strong>${adminEsc(adminUserName(u))}</strong><div class="small">${adminEsc(u.id||'')}</div></td><td>${adminEsc(u.username||'')}</td><td>${adminEsc(code||'未生成')}</td><td>${adminEsc(u.phone||'')}</td><td>${props.length}</td><td>${adminEsc(props.map(p=>adminPropName(p)).join('、')||'未绑定')}</td><td>${adminEsc(u.created_at||'')}</td></tr>`;}).join('');
  }
  function adminOwnerCleanerRows(){
    const owners=adminOwners();
    if(!owners.length)return '<tr><td colspan="6">暂无房东账号</td></tr>';
    return owners.map(owner=>{
      const gids=adminUserGroups(owner), ownerProps=adminProperties().filter(p=>gids.includes(p.group_id));
      const links=ownerProps.flatMap(p=>adminPropCleaners(p.id).map(link=>({property:p,code:String(link.cleaner_code||'').toUpperCase()}))).filter(x=>x.code);
      const uniqueCodes=[...new Set(links.map(x=>x.code))];
      const relation=uniqueCodes.length?uniqueCodes.map(code=>{const linkedProps=links.filter(x=>x.code===code).map(x=>adminPropName(x.property)).join('、');return `<div><strong>${adminEsc(adminCleanerLabel(code))}</strong><div class="small">${adminEsc(linkedProps)}</div></div>`;}).join(''):'未绑定保洁';
      const rooms=ownerProps.reduce((s,p)=>s+adminPropRooms(p.id).length,0), areas=ownerProps.reduce((s,p)=>s+adminPropAreas(p.id).length,0);
      return `<tr><td><strong>${adminEsc(adminUserName(owner))}</strong><div class="small">${adminEsc(owner.username||owner.id||'')}</div></td><td>${adminEsc(gids.map(adminGroupName).join('、')||'未分组')}</td><td>${ownerProps.length}</td><td>${rooms} / ${areas}</td><td>${uniqueCodes.length}</td><td>${relation}</td></tr>`;
    }).join('');
  }
  function adminCleanerOwnerRows(){
    const cleaners=adminCleanerUsers();
    if(!cleaners.length)return '<tr><td colspan="6">暂无保洁账号</td></tr>';
    return cleaners.map(cleaner=>{
      const code=String(cleaner.cleaner_code||'').toUpperCase(), links=adminCleaners().filter(x=>String(x.cleaner_code||'').toUpperCase()===code), linkedProps=links.map(x=>adminProperties().find(p=>p.id===x.property_id)).filter(Boolean);
      const ownerNames=[...new Set(linkedProps.flatMap(p=>adminOwnerForProperty(p).map(adminUserName)))];
      const propNames=linkedProps.map(adminPropName);
      return `<tr><td><strong>${adminEsc(adminUserName(cleaner))}</strong><div class="small">${adminEsc(code||cleaner.id||'未生成编号')}</div></td><td>${adminEsc(cleaner.username||'')}</td><td>${ownerNames.length}</td><td>${adminEsc(ownerNames.join('、')||'未绑定房东')}</td><td>${linkedProps.length}</td><td>${adminEsc(propNames.join('、')||'未绑定房源')}</td></tr>`;
    }).join('');
  }
  function renderAdminDashboard(){
    const el=document.getElementById('owner');if(!el)return;
    const owners=adminOwners(), cleaners=adminCleanerUsers(), ps=adminProperties(), rs=adminRooms(), areas=adminAreas();
    const boundCleaners=new Set(adminCleaners().map(x=>String(x.cleaner_code||'').toUpperCase()).filter(Boolean));
    el.innerHTML=`<div class="admin-shell admin-dashboard"><div class="admin-panel"><h2>注册用户管理后台</h2><div class="small">管理员只看全局注册用户、房东分组、房源房间配置、保洁账号和绑定关系；不显示房东/保洁业务操作页。</div></div><div class="admin-metric-grid"><div class="admin-metric"><div class="small">房东注册用户</div><div class="num">${owners.length}</div></div><div class="admin-metric"><div class="small">保洁注册用户</div><div class="num">${cleaners.length}</div></div><div class="admin-metric"><div class="small">房源</div><div class="num">${ps.length}</div></div><div class="admin-metric"><div class="small">房间</div><div class="num">${rs.length}</div></div><div class="admin-metric"><div class="small">公区/特殊房间</div><div class="num">${areas.length}</div></div><div class="admin-metric"><div class="small">房源保洁绑定</div><div class="num">${adminCleaners().length}</div></div></div><div class="admin-panel"><h2>房东 / 保洁绑定关系</h2><div class="small">房东和保洁不是直接一对一绑定，而是通过“房源绑定保洁编号”形成关系；这里按房东汇总。</div><table class="admin-table"><tr><th>房东</th><th>房东组</th><th>房源数</th><th>房间/公区</th><th>保洁数</th><th>绑定保洁与覆盖房源</th></tr>${adminOwnerCleanerRows()}</table></div><div class="admin-panel"><h2>保洁 / 房东覆盖关系</h2><div class="small">同一个保洁可以服务多个房东，多个房源；这里按保洁汇总。</div><table class="admin-table"><tr><th>保洁</th><th>登录账号</th><th>房东数</th><th>服务房东</th><th>房源数</th><th>服务房源</th></tr>${adminCleanerOwnerRows()}</table></div><div class="admin-panel"><h2>房东注册用户列表</h2><table class="admin-table"><tr><th>用户</th><th>登录账号</th><th>房东组</th><th>房源</th><th>房间</th><th>公区</th><th>绑定保洁</th><th>注册时间</th></tr>${adminOwnerRows()}</table></div><div class="admin-panel"><h2>保洁注册列表</h2><table class="admin-table"><tr><th>保洁</th><th>登录账号</th><th>保洁编号</th><th>电话</th><th>绑定房源数</th><th>绑定房源</th><th>注册时间</th></tr>${adminCleanerRows()}</table></div><div class="admin-panel"><h2>房源 / 房间配置明细</h2><div class="admin-property-list">${ps.map(adminPropertySummary).join('')||'<p class="small">暂无房源</p>'}</div></div></div>`;
  }
  function applyAdminMode(){
    const user=adminCurrent();
    if(!user||user.role!=='admin')return false;
    const title=document.querySelector('header h1'), subtitle=document.querySelector('header h1 + .small');
    if(title)title.textContent='PMS 管理员后台';
    if(subtitle)subtitle.textContent='管理注册用户、房东分组、保洁账号、房源房间配置和绑定关系。';
    document.title='PMS 管理员后台';
    const cleaner=document.getElementById('cleaner'), owner=document.getElementById('owner');
    if(cleaner)cleaner.classList.remove('active');
    if(owner)owner.classList.add('active');
    const nav=document.querySelector('.nav');
    if(nav){
      nav.style.display='flex';
      nav.innerHTML='<button class="active" type="button">注册用户管理</button><button id="logoutBtn" type="button">退出登录</button>';
      const logoutBtn=document.getElementById('logoutBtn');
      if(logoutBtn)logoutBtn.onclick=typeof logout==='function'?logout:function(){location.href='/login';};
    }
    renderAdminDashboard();
    return true;
  }
  function installAdminOverrides(){
    if(window.applyRoleMode!==adminApplyRoleMode){
      adminApplyRoleMode.base=window.applyRoleMode;
      window.applyRoleMode=adminApplyRoleMode;
    }
    if(window.renderOwner!==adminRenderOwner){
      adminRenderOwner.base=window.renderOwner;
      window.renderOwner=adminRenderOwner;
    }
    if(window.renderAccountBar!==adminRenderAccountBar){
      adminRenderAccountBar.base=window.renderAccountBar;
      window.renderAccountBar=adminRenderAccountBar;
    }
    applyAdminMode();
  }
  function adminApplyRoleMode(){if(applyAdminMode())return;if(typeof adminApplyRoleMode.base==='function')adminApplyRoleMode.base();}
  function adminRenderOwner(){if(applyAdminMode())return;if(typeof adminRenderOwner.base==='function')adminRenderOwner.base();}
  function adminRenderAccountBar(){if(applyAdminMode())return;if(typeof adminRenderAccountBar.base==='function')adminRenderAccountBar.base();const btn=document.getElementById('logoutBtn');if(btn)btn.textContent='退出登录';}
  window.renderAdminDashboard=renderAdminDashboard;
  window.__pmsApplyAdminMode=applyAdminMode;
  [0,80,250,700,1600,3200].forEach(t=>setTimeout(installAdminOverrides,t));
})();
'''
ui_patch += admin_ui_patch
final_ui_override = r'''
(function(){
  const VERSION='2026-06-22-light-state-v2';
  window.__PMS_PATCH_VERSION=VERSION;
  const S=window.__pmsInlineState||(window.__pmsInlineState={});
  S.mailEdits=S.mailEdits||{};
  S.syncResults=S.syncResults||{};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function safe(v){return String(v||'').replace(/[^a-zA-Z0-9_-]/g,'_');}
  function list(name){try{return window[name]||eval(name)||[]}catch(e){return window[name]||[];}}
  function setList(name,value){try{eval(name+'=value')}catch(e){}window[name]=value;}
  function props(){return list('properties');}
  function rooms(){return list('rooms');}
  function areas(){return list('commonAreas');}
  function channels(){return list('channelListings');}
  function mailRows(){return list('propertyMailForwarding');}
  function mailConfigs(){return list('mailForwardingConfig');}
  function mailEvents(){return list('mailEvents');}
  function current(){try{return currentUser||window.currentUser||{}}catch(e){return window.currentUser||{};}}
  function groupId(){const p=props()[0]||{};return p.group_id||'group_default';}
  function firstPropId(){const p=props()[0]||{};return p.id||'property_default';}
  function activeProp(){const id=S.selectedPropertyId||window.selectedPropertyId||'';return props().find(p=>String(p.id)===String(id))||null;}
  function setActiveProp(id){S.selectedPropertyId=String(id||'');window.selectedPropertyId=S.selectedPropertyId;try{selectedPropertyId=S.selectedPropertyId}catch(e){}}
  function roomPropId(roomId){const r=rooms().find(x=>String(x.id)===String(roomId));return (r&&(r.property_id||firstPropId()))||firstPropId();}
  function propRooms(propertyId){return rooms().filter(r=>String(r.property_id||firstPropId())===String(propertyId));}
  function propAreas(propertyId){return areas().filter(a=>String(a.property_id||firstPropId())===String(propertyId));}
  function propCleaners(propertyId){return list('propertyCleaners').filter(x=>String(x.property_id)===String(propertyId));}
  function displayPropertyName(name,id){const raw=String(name||id||'').trim();return raw?'房源：'+raw:'未命名房源';}
  function objectRoomName(r){return String((r&&r.name)||'房间').trim()||'房间';}
  function url(path){return typeof window.withKey==='function'?window.withKey(path):path;}
  function nowIso(){return new Date().toISOString().slice(0,19);}

  function applyState(data){
    const state=(data&&data.state)||data;
    if(!state||typeof state!=='object')return state;
    if(Array.isArray(state.properties))setList('properties',state.properties);
    if(Array.isArray(state.rooms))setList('rooms',state.rooms);
    if(Array.isArray(state.commonAreas))setList('commonAreas',state.commonAreas);
    if(Array.isArray(state.propertyCleaners))setList('propertyCleaners',state.propertyCleaners);
    if(Array.isArray(state.channelListings))setList('channelListings',state.channelListings);
    if(Array.isArray(state.propertyMailForwarding))setList('propertyMailForwarding',state.propertyMailForwarding);
    if(Array.isArray(state.mailForwardingConfig))setList('mailForwardingConfig',state.mailForwardingConfig);
    if(Array.isArray(state.mailEvents))setList('mailEvents',state.mailEvents);
    if(Array.isArray(state.bookings))setList('bookings',state.bookings);
    if(Array.isArray(state.sync_errors))setList('syncErrors',state.sync_errors);
    try{if(window.applyServerState)window.applyServerState(state);}catch(e){}
    return state;
  }

  function status(id,text,kind){
    const el=document.getElementById(id);
    if(!el)return;
    el.textContent=text||'';
    el.className='mail-save-status '+(kind||'');
  }

  function ensureFinalCss(){
    let s=document.getElementById('pmsFinalSaveSyncUiStyles');
    if(!s){s=document.createElement('style');s.id='pmsFinalSaveSyncUiStyles';document.head.appendChild(s);}
    s.textContent=`
      .final-room-card{padding:14px!important;border-left:5px solid #0f766e!important}
      .final-room-head{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #cfe3f6;background:#f8fbff;border-radius:8px;padding:10px 12px}
      .final-room-title{font-size:19px;font-weight:900;color:#0f172a}.final-room-meta{font-size:13px;color:#64748b;margin-top:2px}
      .final-channel-panel{margin-top:10px;border:1px solid #dbeafe;border-radius:8px;background:#fff;padding:10px}
      .final-channel-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
      .final-channel-title{font-size:17px;font-weight:900;color:#0f766e}
      .final-channel-list{display:grid;gap:8px}
      .final-channel-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;border:1px solid #d7e3f2;border-left:4px solid #2563eb;background:#f8fafc;border-radius:8px;padding:9px 10px;align-items:center}
      .final-channel-row.ready{border-left-color:#0f766e}.final-channel-row.warn{border-left-color:#f59e0b}
      .final-channel-row .channel-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .final-channel-line{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px;color:#475569}
      .final-mini{display:inline-flex;align-items:center;gap:4px;max-width:260px;border:1px solid #dbeafe;background:#fff;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:800}
      .final-mini.url{font-weight:600;color:#334155}.final-mini.warn{border-color:#fde68a;background:#fffbeb;color:#92400e}.final-mini.good{border-color:#86efac;background:#dcfce7;color:#166534}
      .final-sync-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
      .sync-inline-status{display:inline-flex;border-radius:999px;border:1px solid #cbd5e1;padding:7px 10px;font-weight:900;background:#fff;color:#334155}
      .sync-inline-status.loading{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8}.sync-inline-status.ok{border-color:#86efac;background:#dcfce7;color:#166534}.sync-inline-status.error{border-color:#fecaca;background:#fff1f2;color:#be123c}
      .property-mail-panel{border:1px solid #99f6e4!important;border-left:5px solid #0f766e!important;border-radius:8px;background:#fbfffe;padding:10px!important}
      .property-mail-panel.final-mail-compact{padding:9px 10px!important}
      .property-mail-compact{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}
      .property-mail-compact-main{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:900}
      .property-mail-compact-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px;font-size:13px;color:#475569}
      .property-mail-chip{display:inline-flex;max-width:320px;min-width:0;border:1px solid #dbeafe;background:#fff;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:800;color:#334155}
      .property-mail-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .property-mail-chip.warn{border-color:#fde68a;background:#fffbeb;color:#92400e}
      .property-mail-chip.good{border-color:#86efac;background:#dcfce7;color:#166534}
      .property-mail-note{font-size:12px;color:#64748b;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .property-mail-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;align-items:stretch}
      .property-mail-item{border:1px solid #dbeafe;background:#f8fafc;border-radius:8px;padding:9px 10px;min-width:0}
      .property-mail-label{font-size:12px;color:#64748b;font-weight:900}.property-mail-value{font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .property-mail-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:10px}.property-mail-form textarea{min-height:70px}
      .property-mail-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
      .mail-save-status{font-size:13px;font-weight:900;color:#64748b}.mail-save-status.ok{color:#047857}.mail-save-status.error{color:#be123c}.mail-save-status.loading{color:#1d4ed8}
      .final-mail-events{display:grid;gap:8px;margin-top:10px}.final-mail-event{border:1px solid #dbeafe;background:#fff;border-radius:8px;padding:9px 10px}.final-mail-event.warn{border-color:#fde68a;background:#fffbeb}.final-mail-event.high{border-color:#fecaca;background:#fff1f2}
      .mail-tab-shell{display:grid;gap:12px}.mail-property-block{border:1px solid #d8e1ef;border-radius:8px;background:#fff;padding:12px;display:grid;gap:10px}
      @media(max-width:760px){.property-mail-compact{grid-template-columns:1fr}.property-mail-actions{justify-content:flex-start}}
    `;
  }

  function primaryMailConfig(){return mailConfigs().find(x=>x&&x.inbox_email)||mailConfigs()[0]||{};}
  function mailSafeId(value){return String(value||'property').replace(/[^a-zA-Z0-9_-]/g,'_')||'property';}
  function generatedMailAddress(propertyId){
    const cfg=primaryMailConfig();
    const inbox=String(cfg.inbox_email||cfg.gmail_address||cfg.forwarding_address||'').trim();
    if(!inbox||!inbox.includes('@'))return '';
    if(cfg.plus_alias_enabled===false)return inbox;
    const parts=inbox.split('@'),local=parts.shift(),domain=parts.join('@');
    const prefix=mailSafeId(cfg.alias_prefix||'pms');
    return `${local}+${prefix}_${mailSafeId(propertyId)}@${domain}`;
  }
  function propertyMailSetting(propertyId){return mailRows().find(x=>x&&String(x.property_id)===String(propertyId))||{};}
  function mailAddressForProperty(propertyId){const row=propertyMailSetting(propertyId);return String(row.pms_forward_address||'').trim()||generatedMailAddress(propertyId);}
  function mailInputId(propertyId,field){return `mail_${safe(propertyId)}_${safe(field)}`;}
  function mailStatusId(propertyId){return `mail_status_${safe(propertyId)}`;}
  function mailStatusText(v,bound){if(bound&&(!v||v==='not_set'))return '已绑定邮箱';return ({not_set:'未设置',verification_pending:'等待确认',rule_created:'已建转发规则',active:'已生效',paused:'暂停'})[v||'not_set']||'未设置';}
  function mailStatusClass(v,bound){return (bound||v==='active'||v==='rule_created')?'good':(v==='verification_pending'?'warn':'');}
  function setMailEdit(propertyId,on){if(on)S.mailEdits[propertyId]=true;else delete S.mailEdits[propertyId];}
  function readPropertyMailForm(propertyId){
    const p=props().find(x=>String(x.id)===String(propertyId))||{};
    const old=propertyMailSetting(propertyId);
    return {
      id:old.id||`mail_property_${propertyId}`,
      property_id:propertyId,
      owner_id:(current()&&current().id)||old.owner_id||'',
      group_id:p.group_id||old.group_id||groupId(),
      source_email:String((document.getElementById(mailInputId(propertyId,'source_email'))||{}).value||'').trim(),
      pms_forward_address:mailAddressForProperty(propertyId),
      forward_status:String((document.getElementById(mailInputId(propertyId,'forward_status'))||{}).value||'not_set'),
      notes:String((document.getElementById(mailInputId(propertyId,'notes'))||{}).value||''),
      updated_at:nowIso()
    };
  }
  function mergePropertyMail(row){
    if(!row||!row.property_id)return;
    const rows=mailRows().filter(x=>x&&String(x.property_id)!==String(row.property_id));
    rows.push(row);
    setList('propertyMailForwarding',rows);
  }
  async function reloadState(){
    try{
      const res=await fetch(url('/api/state'),{cache:'no-store'});
      const data=await res.json().catch(()=>null);
      if(res.ok&&data){applyState(data);return (data&&data.state)||data;}
    }catch(e){}
    return null;
  }
  function verifyMailSaved(expected,state){
    const rows=(state&&Array.isArray(state.propertyMailForwarding)?state.propertyMailForwarding:mailRows());
    const row=rows.find(x=>x&&String(x.property_id)===String(expected.property_id))||{};
    const got=String(row.source_email||'').trim();
    if(got!==String(expected.source_email||'').trim())throw new Error(`服务器保存后重新读取不一致：当前读到 ${got||'未填写'}`);
  }
  async function savePropertyMail(propertyId,btn){
    ensureFinalCss();
    const row=readPropertyMailForm(propertyId);
    const sid=mailStatusId(propertyId);
    if(!row.source_email){
      status(sid,'没有内容可保存：请先填写邮箱。','error');
      status(sid+'_form','没有内容可保存：请先填写邮箱。','error');
      alert('没有内容可保存：请先填写邮箱。');
      return;
    }
    const old=btn&&btn.textContent;
    if(btn){btn.disabled=true;btn.textContent='保存中...';}
    status(sid,'保存中...','loading');
    status(sid+'_form','保存中...','loading');
    try{
      const res=await fetch(url('/api/property-mail'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.ok===false)throw new Error(data.error||'保存失败');
      applyState(data);
      mergePropertyMail(data.propertyMail||row);
      const state=(await reloadState())||((data&&data.state)||null);
      verifyMailSaved(row,state);
      setMailEdit(propertyId,false);
      status(sid,'已保存成功','ok');
      if(typeof window.renderRoomSettings==='function')window.renderRoomSettings();
      if(typeof window.renderOwnerMail==='function')window.renderOwnerMail();
      alert('已保存成功');
    }catch(e){
      const msg=e&&e.message?e.message:String(e||'未知错误');
      status(sid,msg,'error');
      status(sid+'_form',msg,'error');
      alert('保存邮箱设置失败：'+msg);
    }finally{
      if(btn){btn.disabled=false;btn.textContent=old||'保存设置';}
    }
  }
  async function clearPropertyMail(propertyId,btn){
    if(!confirm('确定清空这个房源的邮箱转发设置？'))return;
    const old=btn&&btn.textContent;
    if(btn){btn.disabled=true;btn.textContent='清空中...';}
    try{
      const res=await fetch(url('/api/property-mail'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id:propertyId,_clear:true})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.ok===false)throw new Error(data.error||'清空失败');
      applyState(data);
      setList('propertyMailForwarding',mailRows().filter(x=>x&&String(x.property_id)!==String(propertyId)));
      setMailEdit(propertyId,false);
      if(typeof window.renderRoomSettings==='function')window.renderRoomSettings();
      if(typeof window.renderOwnerMail==='function')window.renderOwnerMail();
      alert('已清空');
    }catch(e){alert('清空邮箱设置失败：'+(e&&e.message?e.message:e));}
    finally{if(btn){btn.disabled=false;btn.textContent=old||'清空';}}
  }
  function copyMailAddress(address,btn){
    const text=String(address||'').trim();
    if(!text)return alert('还没有可复制的 PMS 转发地址');
    const done=()=>{if(btn){const old=btn.textContent;btn.textContent='已复制';setTimeout(()=>btn.textContent=old||'复制',1200);}};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done).catch(done);else done();
  }
  function editPropertyMail(propertyId){setMailEdit(propertyId,true);if(typeof window.renderRoomSettings==='function')window.renderRoomSettings();if(typeof window.renderOwnerMail==='function')window.renderOwnerMail();}
  function cancelPropertyMailEdit(propertyId){setMailEdit(propertyId,false);if(typeof window.renderRoomSettings==='function')window.renderRoomSettings();if(typeof window.renderOwnerMail==='function')window.renderOwnerMail();}
  function renderPropertyMailPanel(p){
    ensureFinalCss();
    const row=propertyMailSetting(p.id),bound=!!String(row.source_email||'').trim(),saved=!!row.property_id,editing=!!S.mailEdits[p.id],addr=mailAddressForProperty(p.id),st=row.forward_status||'not_set';
    const summary=!editing?`<div class="property-mail-compact">
      <div>
        <div class="property-mail-compact-main"><span>邮箱转发</span><span class="status-pill ${mailStatusClass(st,bound)}">${esc(mailStatusText(st,bound))}</span>${bound?'<span class="property-mail-chip good"><span>已绑定</span></span>':'<span class="property-mail-chip warn"><span>未填写</span></span>'}</div>
        <div class="property-mail-compact-line">
          <span class="property-mail-chip ${bound?'':'warn'}" title="${esc(row.source_email||'')}"><span>Airbnb 通知：${bound?esc(row.source_email):'未填写'}</span></span>
          <span class="property-mail-chip ${addr?'':'warn'}" title="${esc(addr)}"><span>PMS 转发：${addr?esc(addr):'管理员未配置'}</span></span>
          ${row.updated_at?`<span class="property-mail-chip"><span>保存：${esc(row.updated_at)}</span></span>`:''}
        </div>
        ${row.notes?`<div class="property-mail-note" title="${esc(row.notes)}">备注：${esc(row.notes)}</div>`:''}
      </div>
      <div class="property-mail-actions"><span class="mail-save-status" id="${mailStatusId(p.id)}"></span><button class="smallbtn primary" onclick="editPropertyMail('${esc(p.id)}')">${saved||bound?'修改':'设置'}</button>${addr?`<button class="smallbtn" onclick="copyMailAddress('${esc(addr)}',this)">复制地址</button>`:''}${saved||bound?`<button class="smallbtn" onclick="clearPropertyMail('${esc(p.id)}',this)">清空</button>`:''}</div>
    </div>`:'';
    const form=editing?`<div class="property-mail-form">
      <label>这个房源接收 Airbnb 通知的邮箱<input id="${mailInputId(p.id,'source_email')}" value="${esc(row.source_email||'')}" placeholder="例如：host@gmail.com"></label>
      <label>转发状态<select id="${mailInputId(p.id,'forward_status')}"><option value="not_set"${st==='not_set'?' selected':''}>未设置</option><option value="verification_pending"${st==='verification_pending'?' selected':''}>等待确认</option><option value="rule_created"${st==='rule_created'?' selected':''}>已建转发规则</option><option value="active"${st==='active'?' selected':''}>已生效</option><option value="paused"${st==='paused'?' selected':''}>暂停</option></select></label>
      <label>PMS 转发地址<input readonly value="${esc(addr||'管理员未配置后台收信邮箱')}"></label>
      <label style="grid-column:1/-1">备注<textarea id="${mailInputId(p.id,'notes')}" placeholder="例如：这个房源的 Airbnb 通知来自哪个邮箱，或转发规则还在等待验证。">${esc(row.notes||'')}</textarea></label>
      <div class="property-mail-actions" style="grid-column:1/-1"><span class="mail-save-status" id="${mailStatusId(p.id)}_form"></span><button class="smallbtn primary" onclick="savePropertyMail('${esc(p.id)}',this)">保存设置</button><button class="smallbtn" onclick="cancelPropertyMailEdit('${esc(p.id)}')">取消</button></div>
    </div>`:'';
    return `<div class="property-subcard property-mail-panel ${editing?'':'final-mail-compact'}">${editing?`<div class="property-detail-head"><div><h3 style="margin:0">设置邮箱转发</h3><div class="small">按房源保存，只记录转发规则和状态；邮件提醒不会改房态，房态只按 iCal 同步结果计算。</div></div></div>`:''}${summary}${form}</div>`;
  }

  function propertyMailEvents(propertyId){return mailEvents().filter(e=>String(e.property_id||'')===String(propertyId||''));}
  function renderPropertyMailEventsPanel(p){
    const rows=propertyMailEvents(p.id).slice().sort((a,b)=>String(b.received_at||b.date||'').localeCompare(String(a.received_at||a.date||''))).slice(0,12);
    return `<div class="property-subcard"><div class="property-detail-head"><div><h3 style="margin:0">邮件提醒</h3><div class="small">最近邮件会按房源整理；后续会继续把邮件内容和 iCal 日期关联。</div></div><span class="status-pill ${rows.length?'warn':''}">${rows.length} 条</span></div><div class="final-mail-events">${rows.length?rows.map(e=>`<div class="final-mail-event ${esc(e.severity||'')}"><strong>${esc(e.title||e.raw_subject||'Airbnb 邮件')}</strong><div class="small">${esc(e.received_at||e.date||'')} ${e.room_name?`｜${esc(e.room_name)}`:''} ${e.event_type?`｜${esc(e.event_type)}`:''}</div><div>${esc(e.summary||'')}</div></div>`).join(''):'<div class="empty-panel">暂无邮件提醒</div>'}</div></div>`;
  }
  function selectedMailProperties(){const ids=Array.isArray(S.ownerPropertyIds)?S.ownerPropertyIds:[];const selected=ids.length?ids:props().map(p=>p.id);return props().filter(p=>selected.includes(p.id));}
  function ensureOwnerMailTab(){
    const owner=document.getElementById('owner');if(!owner)return;
    const tabbar=owner.querySelector('.tabbar'),roomsBtn=tabbar&&tabbar.querySelector('button[onclick*="ownerRooms"]');
    if(roomsBtn)roomsBtn.textContent='房间设置';
    if(tabbar&&!tabbar.querySelector('button[data-pms-mail-tab]')){
      const btn=document.createElement('button');btn.type='button';btn.dataset.pmsMailTab='1';btn.textContent='邮件提醒';
      btn.onclick=function(){if(typeof showOwnerTab==='function')showOwnerTab('ownerMail',this);renderOwnerMail();};
      if(roomsBtn)roomsBtn.insertAdjacentElement('afterend',btn);else tabbar.appendChild(btn);
    }
    if(!document.getElementById('ownerMail')){
      const pane=document.createElement('div');pane.id='ownerMail';pane.className='tab-content';
      const roomsPane=document.getElementById('ownerRooms');if(roomsPane)roomsPane.insertAdjacentElement('afterend',pane);else owner.appendChild(pane);
    }
  }
  function openPropertyMailTab(propertyId){
    if(propertyId)S.ownerPropertyIds=[propertyId];
    ensureOwnerMailTab();
    const btn=document.querySelector('button[data-pms-mail-tab]');
    if(typeof showOwnerTab==='function')showOwnerTab('ownerMail',btn||null);
    renderOwnerMail();
  }
  function renderOwnerMail(){
    ensureFinalCss();ensureOwnerMailTab();
    const root=document.getElementById('ownerMail');if(!root)return;
    const ps=selectedMailProperties();
    const total=ps.reduce((n,p)=>n+propertyMailEvents(p.id).length,0);
    root.innerHTML=`<div class="card mail-tab-shell"><div class="property-detail-head"><div><h2>邮件提醒</h2><div class="small">按房源管理 Airbnb 通知邮箱、PMS 转发地址和邮件提醒。邮件内容不会影响房态；房态只按 iCal 同步结果计算。</div></div><span class="status-pill ${total?'warn':''}">共 ${total} 条</span></div>${ps.length?ps.map(p=>`<div class="mail-property-block"><div class="property-detail-head"><div><h3 style="margin:0">${esc(displayPropertyName(p.name,p.id))}</h3><div class="small">${propertyMailEvents(p.id).length} 条邮件提醒</div></div></div>${renderPropertyMailPanel(p)}${renderPropertyMailEventsPanel(p)}</div>`).join(''):'<div class="empty-panel">请先在上方勾选房源。</div>'}</div>`;
  }

  function roomChannels(roomId){return channels().filter(ch=>String(ch.room_id)===String(roomId));}
  function channelFeedUrl(ch){return `${location.origin}/feed/${encodeURIComponent(ch.id)}.ics`;}
  function channelInputId(id,field){return `channel_${safe(id)}_${safe(field)}`;}
  function channelLabel(ch){const note=String(ch.channel_note||'').trim();return `${ch.platform||'Airbnb'} 渠道${note?' · '+note:''}`;}
  function shortUrl(v){const text=String(v||'').trim();if(!text)return '<span class="final-mini warn">未填</span>';return `<span class="final-mini url" title="${esc(text)}">${esc(text.length>34?text.slice(0,31)+'...':text)}</span>`;}
  function channelStatus(ch){const has=!!String(ch.ical_url||'').trim();return `<span class="final-mini ${has?'good':'warn'}">${has?'已导入 iCal':'未填 iCal'}</span>${ch.is_new_listing?'<span class="final-mini warn">新发布无订单</span>':''}${ch.sync_error?`<span class="final-mini warn">同步失败</span>`:''}`;
  }
  function readChannelForm(id){
    const rows=channels(),idx=rows.findIndex(x=>String(x.id)===String(id));if(idx<0)return null;
    const row={...rows[idx]};
    const platform=document.getElementById(channelInputId(id,'platform'));
    const note=document.getElementById(channelInputId(id,'channel_note'));
    const isNew=document.getElementById(channelInputId(id,'is_new_listing'));
    const listing=document.getElementById(channelInputId(id,'listing_url'));
    const ical=document.getElementById(channelInputId(id,'ical_url'));
    if(platform)row.platform=platform.value||'Airbnb';
    if(note)row.channel_note=note.value.trim();
    if(isNew)row.is_new_listing=isNew.value==='true';
    if(listing)row.listing_url=listing.value.trim();
    if(ical)row.ical_url=ical.value.trim();
    rows[idx]=row;setList('channelListings',rows);return row;
  }
  function collectVisibleIcal(propertyId){
    propRooms(propertyId).forEach(r=>{
      ['airbnb_ical','booking_ical','vrbo_ical','other_ical'].forEach(field=>{
        const el=document.getElementById(`ical_${safe(r.id)}_${safe(field)}`);
        if(el)r[field]=el.value.trim();
      });
      roomChannels(r.id).forEach(ch=>readChannelForm(ch.id));
    });
  }
  async function persistVisibleChannels(propertyId){
    const rows=propRooms(propertyId).flatMap(r=>roomChannels(r.id));
    if(!rows.length&&typeof window.saveState==='function'){const data=await window.saveState();applyState(data);return data;}
    const res=await fetch(url('/api/state'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelListings:rows})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.ok===false)throw new Error(data.error||'保存渠道失败');
    applyState(data);
    return data;
  }
  function propertySyncResultHtml(propertyId){const item=S.syncResults&&S.syncResults[propertyId];return item?`<span class="sync-inline-status ${esc(item.kind||'')}">${esc(item.text||'')}</span>`:'';}
  async function syncPropertyIcal(propertyId,btn){
    const id=propertyId||(activeProp()&&activeProp().id);if(!id)return alert('请先进入一个房源');
    ensureFinalCss();
    const old=btn&&btn.textContent;
    if(btn){btn.disabled=true;btn.textContent='同步中...';}
    S.syncResults[id]={kind:'loading',text:'同步中：正在保存渠道并读取 iCal...'};
    if(typeof window.renderRoomSettings==='function')window.renderRoomSettings();
    try{
      collectVisibleIcal(id);
      await persistVisibleChannels(id);
      const res=await fetch(url('/api/sync'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id:id})});
      const data=await res.json().catch(()=>({ok:false,error:'服务器没有返回有效结果'}));
      if(!res.ok||data.ok===false){
        const debug=data.debug_id?` 编号：${data.debug_id}`:'';
        const detail=data.detail?`（${data.detail}）`:'';
        throw new Error((data.error||'iCal 同步失败')+debug+detail);
      }
      applyState(data);
      const roomIds=new Set(propRooms(id).map(r=>r.id));
      const channelCount=channels().filter(ch=>roomIds.has(ch.room_id)).length;
      const bookingCount=channels().filter(ch=>roomIds.has(ch.room_id)).reduce((n,ch)=>n+Number(ch.synced_booking_count||0),0);
      const errs=list('syncErrors').filter(e=>roomIds.has(e.room_id));
      S.syncResults[id]={kind:errs.length?'error':'ok',text:errs.length?`同步完成，但 ${errs.length} 个渠道失败`:`同步完成：${channelCount} 个渠道，导入 ${bookingCount} 条`};
      if(typeof window.renderRoomSettings==='function')window.renderRoomSettings();
      if(errs.length)alert(`iCal 同步完成，但有 ${errs.length} 个渠道失败。错误已显示在对应房间。`);
      return data;
    }catch(e){
      const msg=e&&e.message?e.message:String(e||'未知错误');
      S.syncResults[id]={kind:'error',text:'同步失败：'+msg};
      if(typeof window.renderRoomSettings==='function')window.renderRoomSettings();
      alert('同步失败：'+msg);
      return null;
    }finally{
      if(btn){btn.disabled=false;btn.textContent=old||'同步当前房源 iCal';}
    }
  }
  function renderChannelSummaryCard(ch){
    const rowClass=String(ch.ical_url||'').trim()?'ready':'warn';
    return `<div class="final-channel-row ${rowClass}"><div><div class="final-channel-title">${esc(channelLabel(ch))}</div><div class="final-channel-line">${channelStatus(ch)}${ch.channel_note?`<span class="final-mini">${esc(ch.channel_note)}</span>`:'<span class="final-mini warn">备注未填</span>'}</div><div class="final-channel-line"><strong>导入 iCal</strong>${shortUrl(ch.ical_url)}<strong>房源链接</strong>${shortUrl(ch.listing_url)}<strong>防超卖 iCal</strong>${shortUrl(channelFeedUrl(ch))}</div></div><div class="channel-actions"><button class="smallbtn" onclick="window.diagnoseChannelIcal&&window.diagnoseChannelIcal('${esc(ch.id)}',this)">检查</button><button class="smallbtn primary" onclick="copyChannelFeed('${esc(ch.id)}',this)">复制防超卖</button><button class="smallbtn primary" onclick="editChannelListing('${esc(ch.id)}')">修改</button><button class="smallbtn" onclick="deleteChannelListing('${esc(ch.id)}',this)">删除</button></div></div>`;
  }
  function renderChannelEditCard(ch){
    const platform=ch.platform||'Airbnb';
    const feed=channelFeedUrl(ch);
    return `<div class="channel-card channel-edit-compact"><div class="channel-card-head"><div><div class="channel-title">${esc(channelLabel(ch))}</div>${channelStatus(ch)}</div><div class="channel-actions"><button class="smallbtn primary" onclick="saveChannelListing('${esc(ch.id)}',this)">保存渠道</button><button class="smallbtn" onclick="cancelChannelEdit('${esc(ch.id)}')">取消</button><button class="smallbtn" onclick="deleteChannelListing('${esc(ch.id)}',this)">删除</button></div></div><div class="channel-grid"><label>平台<select id="${channelInputId(ch.id,'platform')}"><option${platform==='Airbnb'?' selected':''}>Airbnb</option><option${platform==='Booking'?' selected':''}>Booking</option><option${platform==='Vrbo'?' selected':''}>Vrbo</option><option${platform==='Other'?' selected':''}>Other</option></select></label><label>同平台备注<input id="${channelInputId(ch.id,'channel_note')}" value="${esc(ch.channel_note||'')}" placeholder="例如：老账号、新账号、Booking A"></label><label>是否平台新发布房源<select id="${channelInputId(ch.id,'is_new_listing')}"><option value="false"${ch.is_new_listing?'':' selected'}>否，已有或可能已有订单</option><option value="true"${ch.is_new_listing?' selected':''}>是，新发布没有订单</option></select></label><label>该平台房源链接（可选）<input id="${channelInputId(ch.id,'listing_url')}" value="${esc(ch.listing_url||'')}" placeholder="粘贴这个渠道的房源页面链接"></label></div><div class="channel-url-grid"><label>该平台导出的 iCal<input id="${channelInputId(ch.id,'ical_url')}" value="${esc(ch.ical_url||'')}" placeholder="粘贴平台 Export calendar 导出的 .ics 链接"></label><div class="channel-copyline"><input readonly value="${esc(feed)}"><button class="smallbtn primary" onclick="copyChannelFeed('${esc(ch.id)}',this)">复制防超卖 iCal</button></div></div><div class="channel-edit-hint">同一个真实房间上架多个 Airbnb / Booking 时，每个渠道单独建一条记录，并填写备注区分账号或平台房源。</div></div>`;
  }
  function renderChannelCard(ch){return S.channelEdits&&S.channelEdits[ch.id]?renderChannelEditCard(ch):renderChannelSummaryCard(ch);}
  function renderChannelListingsPanel(r){
    ensureFinalCss();
    const listRows=roomChannels(r.id),ready=listRows.filter(ch=>String(ch.ical_url||'').trim()).length,needs=listRows.length-ready,cards=listRows.map(renderChannelCard).join('');
    return `<div class="final-channel-panel"><div class="final-channel-head"><div><div class="final-channel-title">渠道 / iCal</div><div class="final-channel-line"><span class="final-mini">${listRows.length} 个渠道</span><span class="final-mini good">${ready} 个已填 iCal</span>${needs?`<span class="final-mini warn">${needs} 个需处理</span>`:''}</div></div><div class="channel-actions"><button class="smallbtn primary" onclick="addChannelListing('${esc(r.id)}',this)">添加渠道</button><button class="smallbtn" onclick="clearRoomChannels('${esc(r.id)}',this)">清空渠道/iCal</button></div></div><div class="final-channel-list">${cards||'<div class="empty-panel">还没有渠道上架记录。先添加 Airbnb 渠道，把该房间在 Airbnb 导出的 iCal 粘贴进来；第二个平台再新增一条渠道记录。</div>'}</div></div>`;
  }
  function renderRoomCard(r){
    ensureFinalCss();
    const channelsText=roomChannels(r.id),ready=channelsText.filter(ch=>String(ch.ical_url||'').trim()).length;
    const edit=!!S.rooms&&!!S.rooms[r.id];
    const head=edit?`<div class="inline-edit-card"><div><label>房间名字</label><input id="roomName_${safe(r.id)}" value="${esc(r.name||'')}"></div><div><label>清洁费</label><input id="roomFee_${safe(r.id)}" type="number" value="${esc(r.cleaning_fee||0)}"></div><div class="text-actions"><button class="smallbtn primary" onclick="saveRoomBasics('${esc(r.id)}',this)">保存</button><button class="smallbtn" onclick="cancelRoomBasics('${esc(r.id)}')">取消</button><button class="smallbtn" onclick="deleteRoomUi('${esc(r.id)}',this)">删除</button></div></div>`:`<div class="final-room-head"><div><div class="final-room-title">${esc(objectRoomName(r))}</div><div class="final-room-meta">清洁费：$${Number(r.cleaning_fee||0)} ｜ ${channelsText.length} 个渠道 ｜ ${ready} 个已填 iCal</div></div><div class="text-actions"><button class="smallbtn" onclick="editRoomBasics('${esc(r.id)}',this)">修改</button><button class="smallbtn" onclick="deleteRoomUi('${esc(r.id)}',this)">删除</button></div></div>`;
    return `<div class="room-setting-card final-room-card">${head}${renderChannelListingsPanel(r)}<div class="final-sync-row"><button class="smallbtn primary" onclick="syncPropertyIcal('${esc(roomPropId(r.id))}',this)">同步当前房源 iCal</button>${propertySyncResultHtml(roomPropId(r.id))}<span class="small">读取当前房源下每个房间的所有渠道 iCal。</span></div></div>`;
  }
  function renderPropertyDetail(p){
    ensureFinalCss();
    const rs=propRooms(p.id);
    const cleaner=(typeof window.renderCleanerPanel==='function')?window.renderCleanerPanel(p):'';
    const common=(typeof window.renderCommonAreaPanel==='function')?window.renderCommonAreaPanel(p):'';
    const cards=rs.length?`<div class="room-setting-list">${rs.map(renderRoomCard).join('')}</div>`:`<div class="empty-panel"><strong>这个房源还没有房间</strong><div style="margin-top:10px"><button class="smallbtn primary" onclick="addRoom(this)">添加第一个房间</button></div></div>`;
    return `<div class="property-room-shell"><div class="property-detail-head"><div><h2 class="property-room-title"><span class="property-room-name">${esc(displayPropertyName(p.name,p.id))}</span><span class="property-room-title-text">房间管理</span></h2><div class="small">${rs.length} 个房间 · ${propAreas(p.id).length} 个公区 · ${propCleaners(p.id).length} 个保洁绑定 · 房源 ID：${esc(p.id)}</div></div><div class="property-actions sync-actions"><button class="smallbtn" onclick="backToPropertyList()">返回房源列表</button><button class="smallbtn primary" onclick="syncPropertyIcal('${esc(p.id)}',this)">同步当前房源 iCal</button>${propertySyncResultHtml(p.id)}</div></div>${cleaner}${common}<div class="property-subcard"><div class="property-detail-head"><div><h3 style="margin:0">房间设置</h3><div class="small">每个真实房间只建一次；不同平台、不同 Airbnb 账号，都在房间下面添加为渠道上架记录。</div></div><button class="smallbtn primary" onclick="addRoom(this)">添加房间</button></div>${cards}</div></div>`;
  }
  function renderRoomSettings(){
    ensureFinalCss();
    try{if(typeof window.setupPropertyRoomUi==='function')window.setupPropertyRoomUi();}catch(e){}
    ensureOwnerMailTab();
    const root=document.getElementById('roomSettings');if(!root)return;
    const currentProp=activeProp();
    if(currentProp&&!props().some(p=>String(p.id)===String(currentProp.id)))setActiveProp('');
    const p=activeProp();
    if(!props().length){root.innerHTML='<div class="empty-panel"><strong>还没有房源</strong><div class="small" style="margin-top:8px">先在上方房源管理模块添加房源。</div></div>';return;}
    root.innerHTML=p?renderPropertyDetail(p):'<div class="empty-panel"><strong>从上方房源管理进入房间管理</strong><div class="small" style="margin-top:8px">上方已经可以完成房源筛选、添加、改名、删除；这里只在进入某个房源后显示房间、公区、iCal 和保洁绑定。</div></div>';
    root.querySelectorAll('.property-mail-panel').forEach(el=>el.remove());
  }
  function openPropertyRooms(id){
    setActiveProp(id);
    const btn=document.querySelector('button[onclick*="ownerRooms"]');
    if(typeof showOwnerTab==='function')showOwnerTab('ownerRooms',btn||null);
    renderRoomSettings();
  }
  function backToPropertyList(){setActiveProp('');renderRoomSettings();}

  const baseRenderOwner=window.__pmsFinalBaseRenderOwner||window.renderOwner;
  window.__pmsFinalBaseRenderOwner=baseRenderOwner;
  function renderOwner(){
    const user=current();
    if(user&&user.role==='admin'&&typeof baseRenderOwner==='function')return baseRenderOwner();
    if(typeof baseRenderOwner==='function')baseRenderOwner();
    ensureOwnerMailTab();
    renderRoomSettings();
    renderOwnerMail();
  }
  function install(){
    Object.assign(window,{savePropertyMail,clearPropertyMail,copyMailAddress,editPropertyMail,cancelPropertyMailEdit,renderPropertyMailPanel,ensureOwnerMailTab,openPropertyMailTab,renderOwnerMail,syncPropertyIcal,renderChannelListingsPanel,renderRoomCard,renderPropertyDetail,renderRoomSettings,openPropertyRooms,backToPropertyList,renderOwner});
    try{savePropertyMail=window.savePropertyMail;clearPropertyMail=window.clearPropertyMail;syncPropertyIcal=window.syncPropertyIcal;renderRoomSettings=window.renderRoomSettings;renderOwner=window.renderOwner}catch(e){}
    ensureFinalCss();
    ensureOwnerMailTab();
  }
  install();
  [0,120,500,1500,3000].forEach(t=>setTimeout(install,t));
})();
'''
ui_patch += final_ui_override
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

version_route_hook = '''            if path == "/api/health":
                json_response(self, {"ok": True, "firebase_project": firebase_project_id(), "driver": "firestore-rest"})
                return
'''
version_route = f'''            if path == "/api/version":
                json_response(self, {{"ok": True, "version": "{PMS_PATCH_VERSION}"}})
                return
''' + version_route_hook
if 'version": "2026-06-18-mail-save-v2"' not in source_text:
    if version_route_hook not in source_text:
        raise RuntimeError("version route hook not found")
    source_text = source_text.replace(version_route_hook, version_route, 1)

locked_ical_parser = r'''
def ical_clean_text(value):
    return (
        str(value or "")
        .replace("\\n", " ")
        .replace("\\N", " ")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .strip()
    )


def ical_lock_reason(summary="", description="", status=""):
    text = " ".join([ical_clean_text(summary), ical_clean_text(description), ical_clean_text(status)]).lower()
    if not text:
        return ""
    if ("reserved" in text or "reservation" in text) and not any(word in text for word in ["not available", "unavailable", "blocked", "closed"]):
        return ""
    patterns = [
        "not available",
        "unavailable",
        "blocked",
        "calendar blocked",
        "closed",
        "not open",
        "不开放",
        "锁定",
        "关闭",
        "不可订",
        "不可预订",
        "已阻止",
    ]
    if any(pattern in text for pattern in patterns):
        return ical_clean_text(summary) or ical_clean_text(description) or "平台关闭日历或关联房源占用"
    return ""


def parse_ics(text, platform, room_id):
    events, in_event, current = [], False, {}
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    unfolded = []
    for line in lines:
        if (line.startswith(" ") or line.startswith("\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    for line in unfolded:
        line = line.strip("\ufeff")
        if line == "BEGIN:VEVENT":
            in_event, current = True, {}
            continue
        if line == "END:VEVENT":
            checkin, checkout = current.get("checkin"), current.get("checkout")
            if in_event and checkin:
                if not checkout:
                    checkout = (datetime.strptime(checkin, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                if checkout > checkin:
                    summary = ical_clean_text(current.get("summary"))
                    description = ical_clean_text(current.get("description"))
                    reason = ical_lock_reason(summary, description, current.get("status"))
                    if reason:
                        events.append({
                            "room_id": room_id,
                            "platform": platform,
                            "guest": "",
                            "checkin": checkin,
                            "checkout": checkout,
                            "status": "不开放锁定",
                            "source": "ical",
                            "booking_type": "lock",
                            "is_locked": True,
                            "lock_reason": reason,
                            "summary": summary,
                        })
                    else:
                        events.append({
                            "room_id": room_id,
                            "platform": platform,
                            "guest": "",
                            "checkin": checkin,
                            "checkout": checkout,
                            "status": summary or f"{platform} iCal",
                            "source": "ical",
                            "booking_type": "booking",
                            "is_locked": False,
                            "summary": summary,
                        })
            in_event = False
            continue
        if not in_event or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.split(";", 1)[0].upper()
        if key == "DTSTART":
            current["checkin"] = parse_date_value(value)
        elif key == "DTEND":
            current["checkout"] = parse_date_value(value)
        elif key == "SUMMARY":
            current["summary"] = value.strip()
        elif key == "DESCRIPTION":
            current["description"] = value.strip()
        elif key == "STATUS":
            current["status"] = value.strip()
    return events
'''
source_text, locked_ical_count = re.subn(
    r'def parse_ics\(text, platform, room_id\):.*?\n\n\ndef fetch_text',
    lambda match: locked_ical_parser + "\n\ndef fetch_text",
    source_text,
    count=1,
    flags=re.S,
)
if locked_ical_count != 1:
    raise RuntimeError("iCal lock parser hook not found")

old_fetch_text = '''def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PMS-Firebase/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")
'''
new_fetch_text = '''def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "PMS-Firebase/1.0"})
    timeout = float(os.environ.get("PMS_ICAL_FETCH_TIMEOUT_SECONDS", "8"))
    max_bytes = int(os.environ.get("PMS_ICAL_FETCH_MAX_BYTES", "1048576"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise RuntimeError(f"iCal file too large: over {max_bytes} bytes")
            return data.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"iCal fetch HTTP {exc.code}") from exc
    except Exception as exc:
        host = urllib.parse.urlparse(str(url or "")).netloc or "iCal"
        reason = getattr(exc, "reason", None) or str(exc) or exc.__class__.__name__
        raise RuntimeError(f"iCal fetch failed from {host}: {reason}") from exc
'''
if new_fetch_text not in source_text:
    if old_fetch_text not in source_text:
        raise RuntimeError("iCal fetch hook not found")
    source_text = source_text.replace(old_fetch_text, new_fetch_text, 1)

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

safe_sync_route = """            if path == "/api/sync":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}") if raw else {}
                try:
                    synced = sync_icals(actor=user, property_id=payload.get("property_id"))
                    json_response(self, {"ok": True, "state": filter_state_for_user(synced, user)})
                except Exception as exc:
                    message = str(exc) or exc.__class__.__name__
                    debug_id = hashlib.sha1((message + str(time.time())).encode("utf-8")).hexdigest()[:10]
                    if "iCal fetch" in message:
                        public_error = "同步失败：平台 iCal 链接读取失败，请检查对应渠道 iCal 是否仍有效。"
                    elif "Firestore" in message or "Firebase database" in message:
                        public_error = "同步失败：数据库保存或读取失败，iCal 没有被完整写入，请稍后重试。"
                    elif "property permission" in message:
                        public_error = "同步失败：当前账号没有这个房源的权限。"
                    else:
                        public_error = "同步失败：系统没有完成本次 iCal 同步。"
                    traceback.print_exc()
                    json_response(self, {"ok": False, "error": public_error, "detail": message[:500], "debug_id": debug_id}, status=500)
                return
"""
if safe_sync_route not in source_text:
    if new_sync_route not in source_text:
        raise RuntimeError("safe iCal sync route hook not found")
    source_text = source_text.replace(new_sync_route, safe_sync_route, 1)

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

auto_sync_marker = '''if __name__ == "__main__":
    print(f"PMS Firebase REST backend started on port {PORT}")
    HTTPServer((HOST, PORT), Handler).serve_forever()
'''
channel_listing_backend = r'''
_pms_channel_listing_model_v1 = True

if "channelListings" not in STATE_KEYS:
    STATE_KEYS.append("channelListings")
if "icalSyncHistory" not in STATE_KEYS:
    STATE_KEYS.append("icalSyncHistory")

_pms_channel_base_default_state = default_state
def default_state():
    state = _pms_channel_base_default_state()
    state.setdefault("channelListings", [])
    state.setdefault("icalSyncHistory", [])
    return state


def _pms_channel_safe_id(value):
    text = str(value or "").strip()
    safe = "".join(ch if (ch.isalnum() or ch in "-_") else "_" for ch in text)
    return safe or "channel"


def _pms_channel_text(value):
    return str(value or "").strip()


def _pms_channel_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "new", "是"}


def _pms_channel_room_ids(state):
    return {room.get("id") for room in state.get("rooms", []) if isinstance(room, dict) and room.get("id")}


def _pms_channel_clean_listing(item, state=None):
    raw = item if isinstance(item, dict) else {}
    room_id = _pms_channel_text(raw.get("room_id") or raw.get("roomId"))
    listing_id = _pms_channel_text(raw.get("id"))
    if not listing_id:
        seed = room_id + "_" + _pms_channel_text(raw.get("platform") or "channel") + "_" + _pms_channel_text(raw.get("ical_url") or raw.get("icalUrl") or raw.get("listing_url") or raw.get("listingUrl") or time.time())
        listing_id = "channel_" + _pms_channel_safe_id(seed)[:80]
    platform = _pms_channel_text(raw.get("platform") or "Airbnb") or "Airbnb"
    if platform not in {"Airbnb", "Booking", "Vrbo", "Other"}:
        platform = "Other"
    now = datetime.utcnow().isoformat(timespec="seconds")
    return {
        "id": listing_id,
        "room_id": room_id,
        "platform": platform,
        "channel_note": _pms_channel_text(raw.get("channel_note") or raw.get("channelNote") or raw.get("note") or raw.get("label")),
        "is_new_listing": _pms_channel_bool(raw.get("is_new_listing", raw.get("isNewListing", False))),
        "listing_url": _pms_channel_text(raw.get("listing_url") or raw.get("listingUrl")),
        "ical_url": _pms_channel_text(raw.get("ical_url") or raw.get("icalUrl")),
        "last_sync": _pms_channel_text(raw.get("last_sync") or raw.get("lastSync")),
        "sync_error": _pms_channel_text(raw.get("sync_error") or raw.get("syncError")),
        "sync_warning": _pms_channel_text(raw.get("sync_warning") or raw.get("syncWarning")),
        "availability_status": _pms_channel_text(raw.get("availability_status") or raw.get("availabilityStatus")),
        "synced_booking_count": int(raw.get("synced_booking_count") or raw.get("syncedBookingCount") or 0),
        "created_at": _pms_channel_text(raw.get("created_at") or raw.get("createdAt")) or now,
        "updated_at": _pms_mail_text(raw.get("updated_at")) or now,
    }


def _pms_channel_migrate_legacy_listings(state):
    listings = [_pms_channel_clean_listing(item, state) for item in state.get("channelListings", []) if isinstance(item, dict)]
    by_id = {item.get("id"): item for item in listings}
    legacy_fields = [
        ("airbnb_ical", "Airbnb", "airbnb_public_url"),
        ("booking_ical", "Booking", "booking_public_url"),
        ("vrbo_ical", "Vrbo", "vrbo_public_url"),
        ("other_ical", "Other", "other_public_url"),
    ]
    for room in state.get("rooms", []):
        if not isinstance(room, dict) or not room.get("id"):
            continue
        for field, platform, url_field in legacy_fields:
            ical_url = _pms_channel_text(room.get(field))
            if not ical_url:
                continue
            listing_id = "channel_" + _pms_channel_safe_id(room.get("id")) + "_" + field
            if listing_id in by_id:
                if not by_id[listing_id].get("ical_url"):
                    by_id[listing_id]["ical_url"] = ical_url
                room[field] = ""
                if url_field:
                    room[url_field] = ""
                continue
            item = _pms_channel_clean_listing({
                "id": listing_id,
                "room_id": room.get("id"),
                "platform": platform,
                "is_new_listing": False,
                "listing_url": room.get(url_field) or "",
                "ical_url": ical_url,
            }, state)
            listings.append(item)
            by_id[listing_id] = item
            room[field] = ""
            if url_field:
                room[url_field] = ""
    state["channelListings"] = listings
    return state


def _pms_channel_clear_room_legacy_fields(state, room_id):
    for room in state.get("rooms", []):
        if not isinstance(room, dict) or room.get("id") != room_id:
            continue
        for field in ["airbnb_ical", "booking_ical", "vrbo_ical", "other_ical", "airbnb_public_url", "booking_public_url", "vrbo_public_url", "other_public_url"]:
            room[field] = ""
        room["sync_error"] = ""
        room["synced_booking_count"] = 0
        return


_pms_channel_base_normalize_state = normalize_state
def normalize_state(raw):
    state = _pms_channel_base_normalize_state(raw)
    state.setdefault("channelListings", [])
    state.setdefault("icalSyncHistory", [])
    return _pms_channel_migrate_legacy_listings(state)


def _pms_channel_unfold_ics(text):
    raw_lines = str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = []
    for line in raw_lines:
        if line.startswith(" ") or line.startswith("\t"):
            if lines:
                lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def _pms_channel_field(event_lines, name):
    target = str(name or "").upper()
    for line in event_lines:
        head, sep, tail = line.partition(":")
        if not sep:
            continue
        if head.split(";", 1)[0].upper() == target:
            return tail.strip()
    return ""


def _pms_channel_field_map(event_lines):
    fields = {}
    for line in event_lines:
        head, sep, tail = line.partition(":")
        if not sep:
            continue
        name = head.split(";", 1)[0].upper()
        value = ical_clean_text(tail.strip())
        if not name:
            continue
        if name in fields:
            if isinstance(fields[name], list):
                fields[name].append(value)
            else:
                fields[name] = [fields[name], value]
        else:
            fields[name] = value
    return fields


def _pms_channel_field_details(event_lines):
    rows = []
    for line in event_lines:
        head, sep, tail = str(line or "").partition(":")
        if not sep:
            continue
        name = head.split(";", 1)[0].upper()
        params = head.split(";", 1)[1] if ";" in head else ""
        rows.append({
            "name": name,
            "raw_name": head,
            "params": params,
            "value": ical_clean_text(tail.strip()),
            "raw": line,
        })
    return rows


def _pms_channel_event_excerpt(event_lines, limit=3000):
    text = "\n".join(str(line or "") for line in event_lines)
    return text[:limit]


def _pms_channel_parse_ics(text, listing):
    events = []
    current = []
    inside = False
    for line in _pms_channel_unfold_ics(text):
        token = line.strip().upper()
        if token == "BEGIN:VEVENT":
            inside = True
            current = []
            continue
        if token == "END:VEVENT" and inside:
            events.append(current)
            current = []
            inside = False
            continue
        if inside:
            current.append(line)
    rows = []
    listing_id = listing.get("id")
    room_id = listing.get("room_id")
    platform = listing.get("platform") or "iCal"
    for event in events:
        checkin = parse_date_value(_pms_channel_field(event, "DTSTART"))
        checkout = parse_date_value(_pms_channel_field(event, "DTEND"))
        if not checkin or not checkout or checkout <= checkin:
            continue
        summary = ical_clean_text(_pms_channel_field(event, "SUMMARY"))
        description = ical_clean_text(_pms_channel_field(event, "DESCRIPTION"))
        status = ical_clean_text(_pms_channel_field(event, "STATUS"))
        uid = _pms_channel_text(_pms_channel_field(event, "UID"))
        if not uid:
            uid = hashlib.sha1(("|".join([listing_id or "", checkin, checkout, summary, description])).encode("utf-8")).hexdigest()
        lock_reason = ical_lock_reason(summary, description, status)
        stable_id = hashlib.sha1((str(listing_id) + "|" + uid).encode("utf-8")).hexdigest()[:24]
        rows.append({
            "id": "ical_" + stable_id,
            "room_id": room_id,
            "channel_listing_id": listing_id,
            "external_event_uid": uid,
            "platform": platform,
            "channel_note": listing.get("channel_note") or "",
            "listing_url": listing.get("listing_url") or "",
            "is_new_listing": bool(listing.get("is_new_listing")),
            "guest": "",
            "checkin": checkin,
            "checkout": checkout,
            "status": "不开放锁定" if lock_reason else (summary or "iCal导入"),
            "source": "ical",
            "booking_type": "lock" if lock_reason else "booking",
            "is_locked": bool(lock_reason),
            "lock_reason": lock_reason or "",
            "summary": summary,
        })
    return rows


def _pms_channel_date_overlaps(checkin, checkout, date_text):
    checkin = str(checkin or "")
    checkout = str(checkout or "")
    date_text = str(date_text or "")
    return bool(checkin and checkout and date_text and checkin <= date_text < checkout)


def _pms_channel_raw_event_snapshots(text, listing):
    rows = []
    listing_id = listing.get("id")
    room_id = listing.get("room_id")
    platform = listing.get("platform") or "iCal"
    current = []
    inside = False
    for line in _pms_channel_unfold_ics(text):
        token = line.strip().upper()
        if token == "BEGIN:VEVENT":
            inside = True
            current = []
            continue
        if token == "END:VEVENT" and inside:
            fields = _pms_channel_field_map(current)
            raw_excerpt = _pms_channel_event_excerpt(current)
            checkin = parse_date_value(_pms_channel_field(current, "DTSTART"))
            checkout = parse_date_value(_pms_channel_field(current, "DTEND"))
            summary = ical_clean_text(_pms_channel_field(current, "SUMMARY"))
            description = ical_clean_text(_pms_channel_field(current, "DESCRIPTION"))
            status = ical_clean_text(_pms_channel_field(current, "STATUS"))
            uid = _pms_channel_text(_pms_channel_field(current, "UID"))
            lock_reason = ical_lock_reason(summary, description, status)
            if checkin and checkout and checkout > checkin:
                rows.append({
                    "uid": uid,
                    "uid_hash": hashlib.sha1(uid.encode("utf-8")).hexdigest()[:16] if uid else "",
                    "room_id": room_id,
                    "channel_listing_id": listing_id,
                    "platform": platform,
                    "checkin": checkin,
                    "checkout": checkout,
                    "kind": "lock" if lock_reason else "booking",
                    "is_locked": bool(lock_reason),
                    "lock_reason": lock_reason or "",
                    "summary": summary,
                    "status": status,
                    "description": description[:300],
                    "fields": fields,
                    "fields_detailed": _pms_channel_field_details(current)[:120],
                    "raw_lines": current[:120],
                    "raw_excerpt": raw_excerpt,
                    "raw_hash": hashlib.sha1(raw_excerpt.encode("utf-8")).hexdigest()[:16],
                })
            current = []
            inside = False
            continue
        if inside:
            current.append(line)
    return rows


def _pms_channel_event_history_snapshot(item):
    return {
        "uid": _pms_channel_text(item.get("external_event_uid") or item.get("uid")),
        "uid_hash": hashlib.sha1(_pms_channel_text(item.get("external_event_uid") or item.get("uid")).encode("utf-8")).hexdigest()[:16] if _pms_channel_text(item.get("external_event_uid") or item.get("uid")) else "",
        "checkin": _pms_channel_text(item.get("checkin")),
        "checkout": _pms_channel_text(item.get("checkout")),
        "kind": "lock" if item.get("is_locked") or item.get("booking_type") == "lock" else "booking",
        "is_locked": bool(item.get("is_locked") or item.get("booking_type") == "lock"),
        "lock_reason": _pms_channel_text(item.get("lock_reason")),
        "summary": _pms_channel_text(item.get("summary") or item.get("status")),
        "status": _pms_channel_text(item.get("status")),
    }


def _pms_channel_history_room(state, room_id):
    return next((item for item in state.get("rooms", []) if isinstance(item, dict) and item.get("id") == room_id), {})


def _pms_channel_append_ical_history(state, listing, synced_at, status, events=None, raw_events=None, error="", warning="", inferred_events=None, missing_events=None):
    room = _pms_channel_history_room(state, listing.get("room_id"))
    url = _pms_channel_text(listing.get("ical_url"))
    raw_events = raw_events if raw_events is not None else [_pms_channel_event_history_snapshot(item) for item in (events or [])]
    inferred_events = [_pms_channel_event_history_snapshot(item) for item in (inferred_events or [])]
    missing_events = [_pms_channel_event_history_snapshot(item) for item in (missing_events or [])]
    archive_update = globals().get("_pms_ical_archive_update")
    if callable(archive_update):
        archive_update(state, listing, synced_at, status, raw_events, error=error, warning=warning, missing_events=missing_events)
    row = {
        "id": "icalhist_" + hashlib.sha1(("|".join([_pms_channel_text(listing.get("id")), synced_at, url])).encode("utf-8")).hexdigest()[:24],
        "synced_at": synced_at,
        "property_id": room.get("property_id") or "property_default",
        "room_id": listing.get("room_id"),
        "room_name": room.get("name") or "",
        "channel_listing_id": listing.get("id"),
        "platform": listing.get("platform") or "iCal",
        "channel_note": listing.get("channel_note") or "",
        "url_hash": hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] if url else "",
        "status": status,
        "event_count": len(raw_events),
        "booking_count": sum(1 for item in raw_events if item.get("kind") != "lock"),
        "lock_count": sum(1 for item in raw_events if item.get("kind") == "lock"),
        "inferred_lock_count": len(inferred_events),
        "missing_event_count": len(missing_events),
        "events": raw_events[:120],
        "inferred_events": inferred_events[:80],
        "missing_events": missing_events[:80],
        "warning": warning or "",
        "error": error or "",
    }
    history = [item for item in state.get("icalSyncHistory", []) if isinstance(item, dict)]
    history.append(row)
    state["icalSyncHistory"] = history[-600:]
    return row


def _pms_channel_property_timezone(state, property_id):
    prop = next((item for item in state.get("properties", []) if isinstance(item, dict) and item.get("id") == property_id), {})
    return _pms_channel_text(prop.get("timezone") or prop.get("time_zone") or os.environ.get("PMS_DEFAULT_TIMEZONE") or "America/Los_Angeles")


def _pms_channel_local_now(state, property_id):
    tz_name = _pms_channel_property_timezone(state, property_id)
    try:
        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        return datetime.utcnow()


def _pms_channel_cancel_cutoff(state, property_id, checkin):
    try:
        base = datetime.strptime(str(checkin or "") + " 16:00", "%Y-%m-%d %H:%M")
    except Exception:
        return None
    now = _pms_channel_local_now(state, property_id)
    try:
        return base.replace(tzinfo=now.tzinfo)
    except Exception:
        return base


def _pms_channel_disappeared_cancel_status(state, booking, property_id):
    cutoff = _pms_channel_cancel_cutoff(state, property_id, booking.get("checkin"))
    now = _pms_channel_local_now(state, property_id)
    if not cutoff:
        return "unknown", now
    return ("after_checkin_cutoff" if now >= cutoff else "before_checkin_cutoff"), now


def _pms_channel_add_cancel_cleaning_review(state, booking, listing, synced_at):
    if not isinstance(booking, dict):
        return False
    if booking.get("is_locked") or booking.get("booking_type") == "lock":
        return False
    room = _pms_channel_history_room(state, listing.get("room_id") or booking.get("room_id"))
    property_id = room.get("property_id") or "property_default"
    cancel_status, local_now = _pms_channel_disappeared_cancel_status(state, booking, property_id)
    if cancel_status != "after_checkin_cutoff":
        return False
    uid = _pms_channel_text(booking.get("external_event_uid") or booking.get("id"))
    stable = hashlib.sha1(("cancel-review|" + _pms_channel_text(listing.get("id")) + "|" + uid + "|" + _pms_channel_text(booking.get("checkin")) + "|" + _pms_channel_text(booking.get("checkout"))).encode("utf-8")).hexdigest()[:24]
    note_id = "cancel_review_" + stable
    notes = [item for item in state.get("cleaningNotes", []) if isinstance(item, dict)]
    if any(item.get("id") == note_id for item in notes):
        return False
    room_id = listing.get("room_id") or booking.get("room_id")
    review_date = local_now.date().isoformat() if hasattr(local_now, "date") else datetime.utcnow().date().isoformat()
    platform = listing.get("platform") or booking.get("platform") or "iCal"
    note = {
        "id": note_id,
        "date": review_date,
        "target_id": room_id,
        "target_type": "room",
        "note": f"{platform} iCal 旧订单在入住日16:00后或入住后消失：{booking.get('checkin')} → {booking.get('checkout')}。请房东确认客人是否入住/退款，是否需要安排保洁；当天来不及可改到第二天。",
        "priority": "保洁确认",
        "note_type": "cancel_review",
        "amount": 0,
        "amount_present": False,
        "source": "iCal取消复核",
        "created_by": "系统",
        "created_at": synced_at,
        "cancellation_review": True,
        "checkin": booking.get("checkin"),
        "checkout": booking.get("checkout"),
        "platform": platform,
        "channel_listing_id": listing.get("id"),
        "external_event_uid": uid,
    }
    notes.insert(0, note)
    state["cleaningNotes"] = notes[:1000]
    return True


def _pms_channel_diagnostic_status(events, date_text):
    matches = [item for item in events if _pms_channel_date_overlaps(item.get("checkin"), item.get("checkout"), date_text)]
    if any(item.get("kind") == "lock" for item in matches):
        return "locked"
    if matches:
        return "booked"
    return "empty"


def inspect_ical_diagnostics(payload, actor=None):
    state = normalize_state(load_state())
    allowed_property_ids = _pms_channel_allowed_property_ids(actor, state)
    allowed_room_ids = {
        room.get("id") for room in state.get("rooms", [])
        if isinstance(room, dict) and (room.get("property_id") or "property_default") in allowed_property_ids
    }
    room_id = _pms_channel_text(payload.get("room_id") or payload.get("roomId"))
    channel_id = _pms_channel_text(payload.get("channel_listing_id") or payload.get("channelListingId") or payload.get("channel_id") or payload.get("channelId"))
    date_text = _pms_channel_text(payload.get("date")) or datetime.utcnow().date().isoformat()
    listings = [
        item for item in normalize_state(state).get("channelListings", [])
        if isinstance(item, dict)
        and item.get("room_id") in allowed_room_ids
        and (not room_id or item.get("room_id") == room_id)
        and (not channel_id or item.get("id") == channel_id)
    ]
    results = []
    now = datetime.utcnow().isoformat(timespec="seconds")
    for listing in listings:
        url = _pms_channel_text(listing.get("ical_url"))
        base = {
            "checked_at": now,
            "date": date_text,
            "room_id": listing.get("room_id"),
            "channel_listing_id": listing.get("id"),
            "platform": listing.get("platform") or "iCal",
            "channel_note": listing.get("channel_note") or "",
            "url_hash": hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] if url else "",
        }
        if not url:
            base.update({"status": "no_url", "events": [], "date_events": [], "message": "这个渠道还没有填写导入 PMS 的 iCal"})
            results.append(base)
            continue
        try:
            text = fetch_text(url)
            events = _pms_channel_raw_event_snapshots(text, listing)
            date_events = [item for item in events if _pms_channel_date_overlaps(item.get("checkin"), item.get("checkout"), date_text)]
            base.update({
                "status": _pms_channel_diagnostic_status(events, date_text),
                "events": events[:160],
                "date_events": date_events,
                "event_count": len(events),
                "booking_count": sum(1 for item in events if item.get("kind") != "lock"),
                "lock_count": sum(1 for item in events if item.get("kind") == "lock"),
                "message": "实时读取 iCal 成功",
            })
        except Exception as exc:
            base.update({"status": "error", "events": [], "date_events": [], "error": str(exc), "message": "实时读取 iCal 失败"})
        results.append(base)
    return {
        "room_id": room_id,
        "channel_listing_id": channel_id,
        "date": date_text,
        "results": results,
        "history": [
            item for item in state.get("icalSyncHistory", [])
            if isinstance(item, dict)
            and (not room_id or item.get("room_id") == room_id)
            and (not channel_id or item.get("channel_listing_id") == channel_id)
        ][-20:],
    }


_pms_channel_base_filter_state_for_user = filter_state_for_user
def filter_state_for_user(state, actor):
    filtered = _pms_channel_base_filter_state_for_user(state, actor)
    normalized = normalize_state(state)
    if not actor or actor.get("role") == "admin":
        filtered["channelListings"] = normalized.get("channelListings", [])
        filtered["icalSyncHistory"] = normalized.get("icalSyncHistory", [])
        return filtered
    room_ids = {room.get("id") for room in filtered.get("rooms", []) if isinstance(room, dict)}
    filtered["channelListings"] = [
        item for item in normalized.get("channelListings", [])
        if item.get("room_id") in room_ids
    ]
    filtered["icalSyncHistory"] = [
        item for item in normalized.get("icalSyncHistory", [])
        if isinstance(item, dict) and item.get("room_id") in room_ids
    ]
    return filtered


_pms_channel_base_save_state_from_payload = save_state_from_payload
def _pms_channel_room_has_sync(state, room_id):
    room = next((item for item in state.get("rooms", []) if isinstance(item, dict) and item.get("id") == room_id), {})
    legacy_fields = ("airbnb_ical", "booking_ical", "vrbo_ical", "other_ical")
    if any(_pms_channel_text(room.get(field)) for field in legacy_fields):
        return True
    for item in state.get("channelListings", []):
        if not isinstance(item, dict) or item.get("room_id") != room_id:
            continue
        if _pms_channel_text(item.get("ical_url")) or _pms_channel_text(item.get("listing_url")) or item.get("is_new_listing"):
            return True
    return False

def _pms_channel_room_property_id(room):
    if not isinstance(room, dict):
        return ""
    return room.get("property_id") or "property_default"

def _pms_channel_guard_structural_delete(payload, actor=None):
    current = normalize_state(load_state())
    if actor and actor.get("role") != "admin":
        allowed_property_ids = actor_property_ids(actor, current)
    else:
        allowed_property_ids = {prop.get("id") for prop in current.get("properties", []) if isinstance(prop, dict) and prop.get("id")}
    if "properties" in payload:
        incoming_property_ids = {
            item.get("id") for item in payload.get("properties", [])
            if isinstance(item, dict) and item.get("id")
        }
        for prop in current.get("properties", []):
            if not isinstance(prop, dict) or prop.get("id") not in allowed_property_ids or prop.get("id") in incoming_property_ids:
                continue
            room_count = sum(1 for room in current.get("rooms", []) if isinstance(room, dict) and _pms_channel_room_property_id(room) == prop.get("id"))
            if room_count:
                raise RuntimeError("这个房源下面还有房间，不能删除房源。请先进入房间管理处理房间。")
    if "rooms" in payload:
        incoming_room_ids = {
            item.get("id") for item in payload.get("rooms", [])
            if isinstance(item, dict) and item.get("id")
        }
        for room in current.get("rooms", []):
            if not isinstance(room, dict) or _pms_channel_room_property_id(room) not in allowed_property_ids or room.get("id") in incoming_room_ids:
                continue
            if _pms_channel_room_has_sync(current, room.get("id")):
                raise RuntimeError("这个房间还有 iCal/渠道同步，不能删除。请先清空 iCal/渠道后再删除房间。")

def save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    if "properties" in working or "rooms" in working:
        _pms_channel_guard_structural_delete(working, actor)
    incoming_channels = working.pop("channelListings", None)
    if incoming_channels is None:
        return _pms_channel_base_save_state_from_payload(working, actor)
    channel_mutation = any(
        isinstance(raw, dict) and (raw.get("_delete") or raw.get("_clear_room_channels") or raw.get("_clearRoomChannels"))
        for raw in incoming_channels
    )
    if (not actor or actor.get("role") == "admin") and not channel_mutation:
        current = normalize_state(load_state())
        room_ids = _pms_channel_room_ids(current)
        working["channelListings"] = [
            _pms_channel_clean_listing(item, current)
            for item in incoming_channels
            if isinstance(item, dict) and _pms_channel_text(item.get("room_id") or item.get("roomId")) in room_ids
        ]
        return _pms_channel_base_save_state_from_payload(working, actor)

    saved = _pms_channel_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    current = normalize_state(load_state())
    if not actor or actor.get("role") == "admin":
        allowed_property_ids = {
            prop.get("id") for prop in current.get("properties", [])
            if isinstance(prop, dict) and prop.get("id")
        }
    else:
        allowed_property_ids = actor_property_ids(actor, current)
    allowed_room_ids = {
        room.get("id") for room in current.get("rooms", [])
        if isinstance(room, dict) and room.get("property_id") in allowed_property_ids
    }
    by_id = {item.get("id"): item for item in current.get("channelListings", []) if isinstance(item, dict)}
    delete_ids = set()
    clear_room_ids = set()
    incoming = []
    incoming_ids = set()
    for raw in incoming_channels:
        if not isinstance(raw, dict):
            continue
        if raw.get("_clear_room_channels") or raw.get("_clearRoomChannels"):
            room_id = _pms_channel_text(raw.get("room_id") or raw.get("roomId"))
            if room_id in allowed_room_ids:
                clear_room_ids.add(room_id)
                _pms_channel_clear_room_legacy_fields(current, room_id)
            continue
        item_id = _pms_channel_text(raw.get("id"))
        if raw.get("_delete"):
            existing = by_id.get(item_id)
            if existing and existing.get("room_id") in allowed_room_ids:
                delete_ids.add(item_id)
                _pms_channel_clear_room_legacy_fields(current, existing.get("room_id"))
            continue
        clean = _pms_channel_clean_listing(raw, current)
        if clean.get("room_id") not in allowed_room_ids:
            raise RuntimeError("room permission required")
        existing = by_id.get(clean.get("id"))
        if existing:
            clean["created_at"] = existing.get("created_at") or clean.get("created_at")
        incoming.append(clean)
        incoming_ids.add(clean.get("id"))
    current["channelListings"] = [
        item for item in current.get("channelListings", [])
        if item.get("id") not in delete_ids and item.get("id") not in incoming_ids and item.get("room_id") not in clear_room_ids
    ] + incoming
    if delete_ids or clear_room_ids:
        now = datetime.utcnow().isoformat(timespec="seconds")
        current["bookings"] = [
            item for item in current.get("bookings", [])
            if not (
                isinstance(item, dict)
                and item.get("source") == "ical"
                and (
                    item.get("channel_listing_id") in delete_ids
                    or item.get("room_id") in clear_room_ids
                )
            )
        ]
        current["sync_errors"] = [
            item for item in current.get("sync_errors", [])
            if not (
                isinstance(item, dict)
                and (
                    item.get("channel_listing_id") in delete_ids
                    or item.get("room_id") in clear_room_ids
                )
            )
        ]
        for row in current.get("icalEventArchive", []):
            if not isinstance(row, dict):
                continue
            if row.get("channel_listing_id") in delete_ids or row.get("room_id") in clear_room_ids:
                row["active"] = False
                row["last_sync_status"] = "channel_deleted"
                row["disappeared_at"] = row.get("disappeared_at") or now
                row["last_missing_at"] = now
    return save_state(current)


def _pms_channel_allowed_property_ids(actor, state):
    if actor:
        return actor_property_ids(actor, state)
    return {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("id")}


def sync_icals(actor=None, property_id=None):
    state = normalize_state(load_state())
    allowed_property_ids = _pms_channel_allowed_property_ids(actor, state)
    if property_id:
        if property_id not in allowed_property_ids:
            raise RuntimeError("property permission required")
        allowed_property_ids = {property_id}
    allowed_room_ids = {
        room.get("id") for room in state.get("rooms", [])
        if isinstance(room, dict) and room.get("property_id") in allowed_property_ids
    }
    listings = [
        item for item in state.get("channelListings", [])
        if item.get("room_id") in allowed_room_ids
    ]
    listing_ids = {item.get("id") for item in listings if item.get("id")}
    previous_counts = {}
    previous_bookings_by_listing = {}
    for booking in state.get("bookings", []):
        if not isinstance(booking, dict) or booking.get("source") != "ical":
            continue
        listing_id = booking.get("channel_listing_id")
        if listing_id in listing_ids:
            previous_counts[listing_id] = previous_counts.get(listing_id, 0) + 1
            previous_bookings_by_listing.setdefault(listing_id, []).append(booking)
    now = datetime.utcnow().isoformat(timespec="seconds")
    today = datetime.utcnow().date().isoformat()
    sync_errors = [
        err for err in state.get("sync_errors", [])
        if not (isinstance(err, dict) and err.get("room_id") in allowed_room_ids)
    ]
    successful_listing_ids = set()
    successful_room_ids = set()
    new_bookings = []
    def _pms_missing_event_key(item):
        return "|".join([
            str(item.get("external_event_uid") or ""),
            str(item.get("checkin") or ""),
            str(item.get("checkout") or ""),
            str(item.get("booking_type") or ("lock" if item.get("is_locked") else "booking")),
        ])

    def _pms_inferred_platform_lock(item, listing):
        listing_id = str(listing.get("id") or "")
        uid = str(item.get("external_event_uid") or item.get("id") or "")
        checkin = str(item.get("checkin") or "")
        checkout = str(item.get("checkout") or "")
        stable_id = hashlib.sha1(("missing-lock|" + listing_id + "|" + uid + "|" + checkin + "|" + checkout).encode("utf-8")).hexdigest()[:24]
        return {
            "id": "ical_missing_lock_" + stable_id,
            "room_id": listing.get("room_id") or item.get("room_id"),
            "channel_listing_id": listing.get("id"),
            "external_event_uid": "missing-lock-" + (uid or stable_id),
            "platform": listing.get("platform") or item.get("platform") or "iCal",
            "channel_note": listing.get("channel_note") or "",
            "listing_url": listing.get("listing_url") or "",
            "is_new_listing": bool(listing.get("is_new_listing")),
            "guest": "",
            "checkin": checkin,
            "checkout": checkout,
            "status": "不开放锁定",
            "source": "ical",
            "booking_type": "lock",
            "is_locked": True,
            "lock_reason": "平台未返回原订单，系统按不开放锁定处理",
            "summary": "平台状态变更锁定",
        }

    for listing in listings:
        listing["last_sync"] = now
        listing["sync_error"] = ""
        listing["sync_warning"] = ""
        listing["availability_status"] = ""
        previous_count = max(previous_counts.get(listing.get("id"), 0), int(listing.get("synced_booking_count") or 0))
        listing["synced_booking_count"] = 0
        url = _pms_channel_text(listing.get("ical_url"))
        if not url:
            if listing.get("is_new_listing"):
                _pms_channel_append_ical_history(state, listing, now, "new_listing_no_url", raw_events=[], warning="平台新发布房源，没有导入 iCal")
                continue
            error = "请先填写这个渠道导出的 iCal，或确认这是平台新发布且没有订单"
            listing["sync_error"] = error
            sync_errors.append({"room_id": listing.get("room_id"), "channel_listing_id": listing.get("id"), "platform": listing.get("platform"), "error": error})
            _pms_channel_append_ical_history(state, listing, now, "error", raw_events=[], error=error)
            continue
        try:
            raw_ical_text = fetch_text(url)
            raw_events = _pms_channel_raw_event_snapshots(raw_ical_text, listing)
            imported = _pms_channel_parse_ics(raw_ical_text, listing)
            listing["synced_booking_count"] = len(imported)
            imported_keys = {_pms_missing_event_key(item) for item in imported}
            previous_future = [
                item for item in previous_bookings_by_listing.get(listing.get("id"), [])
                if str(item.get("checkout") or item.get("checkin") or "") >= today
            ]
            imported_ranges = {(str(item.get("checkin") or ""), str(item.get("checkout") or "")) for item in imported}
            disappeared = [
                item for item in previous_future
                if _pms_missing_event_key(item) not in imported_keys
                and (str(item.get("checkin") or ""), str(item.get("checkout") or "")) not in imported_ranges
            ]
            if disappeared and not listing.get("is_new_listing"):
                examples = "、".join(
                    f"{item.get('checkin')}→{item.get('checkout')}"
                    for item in disappeared[:3]
                )
                listing["availability_status"] = "order_disappeared"
                listing["sync_warning"] = f"iCal 本次少了 {len(disappeared)} 条当天或未来订单记录（{examples}）。系统已保存取消/移除历史；如果发生在入住日16:00后或入住后，会生成保洁确认任务。"
                review_count = sum(1 for item in disappeared if _pms_channel_add_cancel_cleaning_review(state, item, listing, now))
            else:
                review_count = 0
            _pms_channel_append_ical_history(
                state,
                listing,
                now,
                "order_disappeared" if disappeared and not listing.get("is_new_listing") else "ok",
                events=imported,
                raw_events=raw_events,
                warning=listing.get("sync_warning", ""),
                missing_events=disappeared if disappeared and not listing.get("is_new_listing") else [],
            )
            successful_listing_ids.add(listing.get("id"))
            successful_room_ids.add(listing.get("room_id"))
            new_bookings.extend(imported)
        except Exception as exc:
            error = str(exc)
            listing["sync_error"] = error
            sync_errors.append({"room_id": listing.get("room_id"), "channel_listing_id": listing.get("id"), "platform": listing.get("platform"), "error": error})
            _pms_channel_append_ical_history(state, listing, now, "error", raw_events=[], error=error)
    if successful_listing_ids:
        state["bookings"] = [
            b for b in state.get("bookings", [])
            if not (
                isinstance(b, dict)
                and b.get("source") == "ical"
                and (
                    b.get("channel_listing_id") in successful_listing_ids
                    or (not b.get("channel_listing_id") and b.get("room_id") in successful_room_ids)
                )
            )
        ]
        state["bookings"].extend(new_bookings)
    state["sync_errors"] = sync_errors
    state["last_sync"] = now
    return save_state(state)


def _pms_channel_feed_target(state, feed_id):
    feed_id = str(feed_id or "").replace(".ics", "")
    listing = next((item for item in state.get("channelListings", []) if item.get("id") == feed_id), None)
    if listing:
        return listing.get("room_id"), listing.get("id"), listing
    room = next((item for item in state.get("rooms", []) if item.get("id") == feed_id), None)
    if room:
        return room.get("id"), "", None
    return "", "", None


def _pms_channel_ics_escape(text):
    return str(text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def make_feed(feed_id):
    state = normalize_state(load_state())
    room_id, target_channel_id, target_listing = _pms_channel_feed_target(state, feed_id)
    if not room_id:
        return None
    events = []
    seen = set()
    for booking in state.get("bookings", []):
        if not isinstance(booking, dict) or booking.get("room_id") != room_id:
            continue
        if target_channel_id and booking.get("channel_listing_id") == target_channel_id:
            continue
        checkin = booking.get("checkin")
        checkout = booking.get("checkout")
        if not checkin or not checkout or checkout <= checkin:
            continue
        kind = "lock" if (booking.get("is_locked") or booking.get("booking_type") == "lock") else "booking"
        dedupe = (checkin, checkout, kind, booking.get("channel_listing_id") or booking.get("platform") or "")
        if dedupe in seen:
            continue
        seen.add(dedupe)
        platform = booking.get("platform") or "PMS"
        summary = "Not available" if kind == "lock" else f"{platform} booked"
        uid_seed = "|".join([str(feed_id), str(booking.get("channel_listing_id") or ""), str(booking.get("external_event_uid") or booking.get("id") or ""), checkin, checkout, kind])
        uid = hashlib.sha1(uid_seed.encode("utf-8")).hexdigest() + "@pms-system"
        events.append("BEGIN:VEVENT\r\n"
                      f"UID:{uid}\r\n"
                      f"DTSTART;VALUE=DATE:{checkin.replace('-', '')}\r\n"
                      f"DTEND;VALUE=DATE:{checkout.replace('-', '')}\r\n"
                      f"SUMMARY:{_pms_channel_ics_escape(summary)}\r\n"
                      f"DESCRIPTION:{_pms_channel_ics_escape('Generated by PMS anti-overbooking feed')}\r\n"
                      "END:VEVENT")
    title = "PMS Anti Overbooking"
    if target_listing:
        title += " - " + (target_listing.get("platform") or "channel")
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PMS System//Channel Feed//EN\r\nCALSCALE:GREGORIAN\r\n" + "\r\n".join(events) + "\r\nEND:VCALENDAR\r\n"
'''
if "_pms_channel_listing_model_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, channel_listing_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + channel_listing_backend + "\n"

property_mail_backend = r'''
_pms_property_mail_forwarding_v1 = True

for _pms_mail_key in ("mailForwardingConfig", "propertyMailForwarding"):
    if _pms_mail_key not in STATE_KEYS:
        STATE_KEYS.append(_pms_mail_key)

_pms_mail_base_default_state = default_state
def default_state():
    state = _pms_mail_base_default_state()
    state.setdefault("mailForwardingConfig", [])
    state.setdefault("propertyMailForwarding", [])
    return state


def _pms_mail_text(value, limit=500):
    return str(value or "").strip()[:limit]


def _pms_mail_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def _pms_mail_safe_id(value):
    text = _pms_mail_text(value, 120)
    safe = "".join(ch if (ch.isalnum() or ch in "-_") else "_" for ch in text)
    return safe or "property"


def _pms_mail_status(value):
    status = _pms_mail_text(value, 40)
    return status if status in {"not_set", "verification_pending", "rule_created", "active", "paused"} else "not_set"


def _pms_mail_property_ids(state):
    return {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("id")}


def _pms_mail_clean_config(item):
    raw = item if isinstance(item, dict) else {}
    now = datetime.utcnow().isoformat(timespec="seconds")
    return {
        "id": _pms_mail_text(raw.get("id") or "main", 80),
        "inbox_email": _pms_mail_text(raw.get("inbox_email") or raw.get("gmail_address") or raw.get("forwarding_address"), 200),
        "alias_prefix": _pms_mail_text(raw.get("alias_prefix") or "pms", 60),
        "plus_alias_enabled": _pms_mail_bool(raw.get("plus_alias_enabled", True)),
        "notes": _pms_mail_text(raw.get("notes"), 800),
        "updated_at": _pms_mail_text(raw.get("updated_at")) or now,
    }


def _pms_mail_primary_config(state):
    rows = state.get("mailForwardingConfig", [])
    if rows and isinstance(rows[0], dict):
        return _pms_mail_clean_config(rows[0])
    return _pms_mail_clean_config({})


def _pms_mail_forward_address(property_id, state):
    cfg = _pms_mail_primary_config(state)
    inbox = _pms_mail_text(cfg.get("inbox_email"), 200)
    if not inbox or "@" not in inbox:
        return ""
    local, domain = inbox.rsplit("@", 1)
    prefix = _pms_mail_safe_id(cfg.get("alias_prefix") or "pms")
    prop = _pms_mail_safe_id(property_id)
    if cfg.get("plus_alias_enabled", True):
        return f"{local}+{prefix}_{prop}@{domain}"
    return inbox


def _pms_mail_clean_property_setting(item, state=None):
    raw = item if isinstance(item, dict) else {}
    state = state or {}
    property_id = _pms_mail_text(raw.get("property_id") or raw.get("propertyId"), 100)
    group_id = _pms_mail_text(raw.get("group_id") or raw.get("groupId"), 100)
    prop = next((p for p in state.get("properties", []) if isinstance(p, dict) and p.get("id") == property_id), None)
    if prop:
        group_id = group_id or _pms_mail_text(prop.get("group_id"), 100)
    now = datetime.utcnow().isoformat(timespec="seconds")
    forward_address = _pms_mail_text(raw.get("pms_forward_address") or raw.get("pmsForwardAddress"), 220) or _pms_mail_forward_address(property_id, state)
    return {
        "id": _pms_mail_text(raw.get("id") or ("mail_property_" + _pms_mail_safe_id(property_id)), 140),
        "property_id": property_id,
        "owner_id": _pms_mail_text(raw.get("owner_id") or raw.get("ownerId"), 100),
        "group_id": group_id,
        "source_email": _pms_mail_text(raw.get("source_email") or raw.get("sourceEmail") or raw.get("airbnb_email"), 220),
        "pms_forward_address": forward_address,
        "forward_status": _pms_mail_status(raw.get("forward_status") or raw.get("forwardStatus")),
        "notes": _pms_mail_text(raw.get("notes"), 1000),
        "updated_at": _pms_mail_text(raw.get("updated_at")) or now,
    }


_pms_mail_base_normalize_state = normalize_state
def normalize_state(raw):
    state = _pms_mail_base_normalize_state(raw)
    configs = state.get("mailForwardingConfig", [])
    state["mailForwardingConfig"] = [_pms_mail_clean_config(configs[0] if configs else {})]
    valid_properties = _pms_mail_property_ids(state)
    by_property = {}
    for item in state.get("propertyMailForwarding", []):
        if not isinstance(item, dict):
            continue
        clean = _pms_mail_clean_property_setting(item, state)
        property_id = clean.get("property_id")
        if property_id and (not valid_properties or property_id in valid_properties):
            by_property[property_id] = clean
    state["propertyMailForwarding"] = list(by_property.values())
    return state


_pms_mail_base_filter_state_for_user = filter_state_for_user
def filter_state_for_user(state, actor):
    normalized = normalize_state(state)
    filtered = _pms_mail_base_filter_state_for_user(normalized, actor)
    role = (actor or {}).get("role")
    if role == "admin":
        filtered["mailForwardingConfig"] = normalized.get("mailForwardingConfig", [])
        filtered["propertyMailForwarding"] = normalized.get("propertyMailForwarding", [])
        return filtered
    if role == "owner":
        property_ids = {prop.get("id") for prop in filtered.get("properties", []) if isinstance(prop, dict) and prop.get("id")}
        filtered["mailForwardingConfig"] = normalized.get("mailForwardingConfig", [])
        filtered["propertyMailForwarding"] = [
            item for item in normalized.get("propertyMailForwarding", [])
            if item.get("property_id") in property_ids
        ]
        return filtered
    filtered["mailForwardingConfig"] = []
    filtered["propertyMailForwarding"] = []
    return filtered


def save_mail_config_setting(payload, actor=None):
    if not actor or actor.get("role") != "admin":
        raise RuntimeError("admin permission required")
    state = normalize_state(load_state())
    state["mailForwardingConfig"] = [_pms_mail_clean_config(payload if isinstance(payload, dict) else {})]
    return save_state(state)


def save_property_mail_setting(payload, actor=None):
    raw = dict(payload) if isinstance(payload, dict) else {}
    state = normalize_state(load_state())
    property_id = _pms_mail_text(raw.get("property_id") or raw.get("propertyId"), 100)
    if not property_id:
        raise RuntimeError("property required")
    allowed_property_ids = _pms_mail_property_ids(state) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, state)
    if property_id not in allowed_property_ids:
        raise RuntimeError("property permission required")
    if actor and actor.get("role") == "owner":
        raw["owner_id"] = actor.get("id") or raw.get("owner_id") or raw.get("ownerId") or ""
    by_property = {
        item.get("property_id"): item
        for item in state.get("propertyMailForwarding", [])
        if isinstance(item, dict) and item.get("property_id")
    }
    if raw.get("_delete") or raw.get("_clear"):
        by_property.pop(property_id, None)
        state["propertyMailForwarding"] = list(by_property.values())
        return save_state(state), None
    if not _pms_mail_text(raw.get("source_email") or raw.get("sourceEmail"), 240):
        raise RuntimeError("没有内容可保存：请先填写 Airbnb 通知邮箱；如果要删除绑定，请点清空。")
    clean = _pms_mail_clean_property_setting(raw, state)
    by_property[property_id] = clean
    state["propertyMailForwarding"] = list(by_property.values())
    saved = save_state(state)
    saved_row = next(
        (item for item in saved.get("propertyMailForwarding", []) if isinstance(item, dict) and item.get("property_id") == property_id),
        clean,
    )
    return saved, saved_row


_pms_mail_base_save_state_from_payload = save_state_from_payload
def save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    incoming_config = working.pop("mailForwardingConfig", None)
    incoming_property_mail = working.pop("propertyMailForwarding", None)
    if incoming_config is None and incoming_property_mail is None:
        return _pms_mail_base_save_state_from_payload(working, actor)

    if incoming_config is not None and (not actor or actor.get("role") != "admin"):
        raise RuntimeError("admin permission required")

    saved = _pms_mail_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    current = normalize_state(load_state())

    if incoming_config is not None:
        row = incoming_config[0] if isinstance(incoming_config, list) and incoming_config else {}
        current["mailForwardingConfig"] = [_pms_mail_clean_config(row)]

    if incoming_property_mail is not None:
        allowed_property_ids = _pms_mail_property_ids(current) if (not actor or actor.get("role") == "admin") else actor_property_ids(actor, current)
        by_property = {
            item.get("property_id"): item
            for item in current.get("propertyMailForwarding", [])
            if isinstance(item, dict) and item.get("property_id")
        }
        rows = incoming_property_mail if isinstance(incoming_property_mail, list) else []
        for raw in rows:
            if not isinstance(raw, dict):
                continue
            property_id = _pms_mail_text(raw.get("property_id") or raw.get("propertyId"), 100)
            if not property_id or property_id not in allowed_property_ids:
                raise RuntimeError("property permission required")
            if raw.get("_delete") or raw.get("_clear"):
                by_property.pop(property_id, None)
                continue
            if not _pms_mail_text(raw.get("source_email") or raw.get("sourceEmail"), 240):
                raise RuntimeError("没有内容可保存：请先填写 Airbnb 通知邮箱；如果要删除绑定，请点清空。")
            clean = _pms_mail_clean_property_setting(raw, current)
            by_property[property_id] = clean
        current["propertyMailForwarding"] = list(by_property.values())

    return save_state(current)
'''
if "_pms_property_mail_forwarding_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, property_mail_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + property_mail_backend + "\n"

mail_events_backend = r'''
_pms_mail_events_v1 = True

if "mailEvents" not in STATE_KEYS:
    STATE_KEYS.append("mailEvents")

_pms_mail_events_base_default_state = default_state
def default_state():
    state = _pms_mail_events_base_default_state()
    state.setdefault("mailEvents", [])
    return state


def _pms_mail_event_text(value, limit=1000):
    return str(value or "").strip()[:limit]


def _pms_mail_event_property_ids(state):
    return {prop.get("id") for prop in state.get("properties", []) if isinstance(prop, dict) and prop.get("id")}


def _pms_mail_event_room_property(room_id, state):
    for room in state.get("rooms", []):
        if isinstance(room, dict) and room.get("id") == room_id:
            return room.get("property_id") or next(iter(_pms_mail_event_property_ids(state)), "")
    return ""


def _pms_mail_event_clean(item, state=None):
    raw = item if isinstance(item, dict) else {}
    state = state or {}
    now = datetime.utcnow().isoformat(timespec="seconds")
    room_id = _pms_mail_event_text(raw.get("room_id") or raw.get("roomId"), 120)
    property_id = _pms_mail_event_text(raw.get("property_id") or raw.get("propertyId"), 120)
    if not property_id and room_id:
        property_id = _pms_mail_event_room_property(room_id, state)
    message_id = _pms_mail_event_text(raw.get("message_id") or raw.get("messageId"), 160)
    event_id = _pms_mail_event_text(raw.get("id"), 180) or ("mail_" + hashlib.sha1((message_id or (property_id + "|" + now)).encode("utf-8")).hexdigest()[:18])
    return {
        "id": event_id,
        "message_id": message_id,
        "thread_id": _pms_mail_event_text(raw.get("thread_id") or raw.get("threadId"), 160),
        "received_at": _pms_mail_event_text(raw.get("received_at") or raw.get("receivedAt") or raw.get("date"), 40),
        "source_email": _pms_mail_event_text(raw.get("source_email") or raw.get("sourceEmail"), 220),
        "target_mail": _pms_mail_event_text(raw.get("target_mail") or raw.get("targetMail"), 220),
        "property_id": property_id,
        "room_id": room_id,
        "listing_id": _pms_mail_event_text(raw.get("listing_id") or raw.get("listingId"), 160),
        "reservation_code": _pms_mail_event_text(raw.get("reservation_code") or raw.get("reservationCode"), 120),
        "guest": _pms_mail_event_text(raw.get("guest") or raw.get("guest_name") or raw.get("guestName"), 160),
        "event_type": _pms_mail_event_text(raw.get("event_type") or raw.get("eventType") or "notice", 60),
        "severity": _pms_mail_event_text(raw.get("severity") or "normal", 40),
        "title": _pms_mail_event_text(raw.get("title") or raw.get("subject"), 240),
        "summary": _pms_mail_event_text(raw.get("summary") or raw.get("body_summary") or raw.get("bodySummary"), 1600),
        "checkin": _pms_mail_event_text(raw.get("checkin") or raw.get("start_date") or raw.get("startDate"), 40),
        "checkout": _pms_mail_event_text(raw.get("checkout") or raw.get("end_date") or raw.get("endDate"), 40),
        "amount": _pms_mail_event_text(raw.get("amount"), 80),
        "status": _pms_mail_event_text(raw.get("status") or "open", 60),
        "action_status": _pms_mail_event_text(raw.get("action_status") or raw.get("actionStatus"), 240),
        "raw_subject": _pms_mail_event_text(raw.get("raw_subject") or raw.get("rawSubject") or raw.get("subject"), 300),
        "created_at": _pms_mail_event_text(raw.get("created_at") or raw.get("createdAt")) or now,
        "updated_at": _pms_mail_event_text(raw.get("updated_at") or raw.get("updatedAt")) or now,
    }


_pms_mail_events_base_normalize_state = normalize_state
def normalize_state(raw):
    state = _pms_mail_events_base_normalize_state(raw)
    valid_properties = _pms_mail_event_property_ids(state)
    by_id = {}
    for item in state.get("mailEvents", []):
        if not isinstance(item, dict):
            continue
        clean = _pms_mail_event_clean(item, state)
        property_id = clean.get("property_id")
        if property_id and (not valid_properties or property_id in valid_properties):
            by_id[clean["id"]] = clean
    state["mailEvents"] = sorted(by_id.values(), key=lambda x: x.get("received_at") or x.get("created_at") or "", reverse=True)[:1000]
    return state


_pms_mail_events_base_filter_state_for_user = filter_state_for_user
def filter_state_for_user(state, actor):
    normalized = normalize_state(state)
    filtered = _pms_mail_events_base_filter_state_for_user(normalized, actor)
    role = (actor or {}).get("role")
    if role == "admin":
        filtered["mailEvents"] = normalized.get("mailEvents", [])
        return filtered
    if role == "owner":
        property_ids = {prop.get("id") for prop in filtered.get("properties", []) if isinstance(prop, dict) and prop.get("id")}
        filtered["mailEvents"] = [
            item for item in normalized.get("mailEvents", [])
            if item.get("property_id") in property_ids
        ]
        return filtered
    filtered["mailEvents"] = []
    return filtered


def save_mail_events(payload, actor=None):
    state = normalize_state(load_state())
    rows = payload.get("mailEvents") if isinstance(payload, dict) else payload
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list):
        raise RuntimeError("mailEvents required")
    allowed_property_ids = _pms_mail_event_property_ids(state) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, state)
    by_id = {
        item.get("id"): item
        for item in state.get("mailEvents", [])
        if isinstance(item, dict) and item.get("id")
    }
    saved_rows = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        clean = _pms_mail_event_clean(raw, state)
        if not clean.get("property_id") or clean.get("property_id") not in allowed_property_ids:
            raise RuntimeError("mail event property permission required")
        if raw.get("_delete") or raw.get("_clear"):
            by_id.pop(clean.get("id"), None)
            continue
        by_id[clean["id"]] = clean
        saved_rows.append(clean)
    state["mailEvents"] = sorted(by_id.values(), key=lambda x: x.get("received_at") or x.get("created_at") or "", reverse=True)[:1000]
    return save_state(state), saved_rows


_pms_mail_events_base_save_state_from_payload = save_state_from_payload
def save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    incoming_mail_events = working.pop("mailEvents", None)
    if incoming_mail_events is None:
        return _pms_mail_events_base_save_state_from_payload(working, actor)
    saved = _pms_mail_events_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    final_state, _rows = save_mail_events(incoming_mail_events, actor)
    return final_state
'''
if "_pms_mail_events_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, mail_events_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + mail_events_backend + "\n"

mail_raw_parser_backend = r'''
_pms_mail_raw_parser_v1 = True


def _pms_mail_raw_list(value):
    if isinstance(value, list):
        return [str(x or "").strip() for x in value if str(x or "").strip()]
    if value is None:
        return []
    return [str(value or "").strip()] if str(value or "").strip() else []


def _pms_mail_raw_value(raw, keys, limit=5000):
    raw = raw if isinstance(raw, dict) else {}
    for key in keys:
        value = raw.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            value = ", ".join(_pms_mail_raw_list(value))
        text = str(value or "").strip()
        if text:
            return text[:limit]
    return ""


def _pms_mail_raw_compact(text, limit=1800):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text[:limit]


def _pms_mail_raw_year(value):
    text = str(value or "")
    match = re.search(r"(\d{4})", text)
    if match:
        return int(match.group(1))
    return datetime.utcnow().year


def _pms_mail_iso_date(year, month, day):
    try:
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    except Exception:
        return ""


def _pms_mail_extract_cn_dates(text, base_year):
    text = str(text or "")
    checkin = ""
    checkout = ""
    full_range = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*(?:-|->|至|到|~|—|－)\s*(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})", text)
    if full_range:
        checkin = _pms_mail_iso_date(full_range.group(1), full_range.group(2), full_range.group(3))
        checkout = _pms_mail_iso_date(full_range.group(4) or full_range.group(1), full_range.group(5), full_range.group(6))
        return checkin, checkout
    cn_full = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|-|~|—|－)\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日", text)
    if cn_full:
        checkin = _pms_mail_iso_date(cn_full.group(1), cn_full.group(2), cn_full.group(3))
        checkout = _pms_mail_iso_date(cn_full.group(4) or cn_full.group(1), cn_full.group(5), cn_full.group(6))
        return checkin, checkout
    same_month = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|-|~|—|－)\s*(\d{1,2})\s*日", text)
    if same_month:
        checkin = _pms_mail_iso_date(base_year, same_month.group(1), same_month.group(2))
        checkout = _pms_mail_iso_date(base_year, same_month.group(1), same_month.group(3))
    in_match = re.search(r"(?:入住|抵达|Check.?in)[^\d]{0,30}(\d{1,2})\s*月\s*(\d{1,2})\s*日", text, re.I)
    out_match = re.search(r"(?:退房|离开|Check.?out)[^\d]{0,30}(\d{1,2})\s*月\s*(\d{1,2})\s*日", text, re.I)
    if in_match:
        checkin = _pms_mail_iso_date(base_year, in_match.group(1), in_match.group(2))
    if out_match:
        checkout = _pms_mail_iso_date(base_year, out_match.group(1), out_match.group(2))
    if not checkin:
        arrive = re.search(r"将于\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日.*?(?:抵达|入住)", text)
        if arrive:
            checkin = _pms_mail_iso_date(base_year, arrive.group(1), arrive.group(2))
    return checkin, checkout


def _pms_mail_extract_guest(subject, text):
    patterns = [
        r"预订已确认\s*-\s*(.+?)将于",
        r"(.+?)想要更改预订",
        r"回复(.+?)的咨询",
        r"为(.+?)(?:撰写评价|写评价)",
        r"(.+?)给了你\s*\d+\s*星好评",
        r"房客\s*([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff\s.'-]{0,60})",
        r"guest\s+([A-Za-z][A-Za-z\s.'-]{0,60})",
    ]
    haystacks = [subject or "", text or ""]
    for source in haystacks:
        for pattern in patterns:
            match = re.search(pattern, source, re.I)
            if match:
                return _pms_mail_raw_compact(match.group(1), 80).strip(" ，,。")
    return ""


def _pms_mail_extract_room(text):
    for pattern in [r"(新增房间[A-Za-z0-9\u4e00-\u9fff]{1,8})", r"(房间[A-Za-z0-9\u4e00-\u9fff]{1,8})", r"(\d+个房间整套)"]:
        match = re.search(pattern, str(text or ""))
        if match:
            return _pms_mail_raw_compact(match.group(1), 80)
    return ""


def _pms_mail_extract_listing_id(text):
    text = str(text or "")
    for pattern in [r"/rooms/(\d{8,})", r"项目\s*#?\s*(\d{8,})", r"listing(?:\s+id)?\D{0,10}(\d{8,})", r"房源\D{0,10}(\d{8,})"]:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1)
    return ""


def _pms_mail_extract_reservation(text):
    match = re.search(r"\bH[A-Z0-9]{7,14}\b", str(text or ""))
    return match.group(0) if match else ""


def _pms_mail_classify(subject, text):
    blob = f"{subject}\n{text}"
    if re.search(r"取消|cancel", blob, re.I):
        return "cancellation", "warn", "cancelled"
    if re.search(r"更改预订|预订已更新|reservation change|updated", blob, re.I):
        return "reservation_change", "warn", "need_review"
    if re.search(r"预订已确认|新预订|new booking|confirmed", blob, re.I):
        return "new_booking", "normal", "new"
    if re.search(r"咨询|申请已过期|inquiry|request expired", blob, re.I):
        return "inquiry", "warn", "need_reply"
    if re.search(r"评价|review", blob, re.I):
        return "review", "warn", "need_review"
    if re.search(r"款项|收款|发放|payout|payment|\$[0-9]", blob, re.I):
        return "payment", "normal", "open"
    if re.search(r"投诉|申诉|调解中心|resolution|用户支持团队|support|屏蔽|开放|unblock|blocked", blob, re.I):
        return "support", "warn", "need_review"
    return "notice", "normal", "open"


def _pms_mail_event_title(event_type, guest, checkin, checkout, subject):
    date_text = checkin or checkout or ""
    unknown_guest = "\u672a\u77e5\u5ba2\u4eba"
    if event_type == "new_booking":
        return f"\u65b0\u8ba2\u5355\uff1a{guest or unknown_guest} {date_text}"
    if event_type == "cancellation":
        return f"\u8ba2\u5355\u53d6\u6d88\uff1a{guest or unknown_guest} {date_text}"
    if event_type == "reservation_change":
        return f"\u8ba2\u5355\u66f4\u6539\uff1a{guest or unknown_guest}"
    if event_type == "inquiry":
        return f"\u54a8\u8be2\uff1a{guest or unknown_guest}"
    if event_type == "review":
        return f"\u8bc4\u4ef7\u63d0\u9192\uff1a{guest or unknown_guest}"
    if event_type == "payment":
        return "\u6b3e\u9879\u901a\u77e5"
    if event_type == "support":
        return "\u7231\u5f7c\u8fce\u5ba2\u670d/\u98ce\u9669\u901a\u77e5"
    return subject[:80] if subject else "\u90ae\u4ef6\u901a\u77e5"


def _pms_mail_action_status(event_type, status, text):
    if event_type == "cancellation":
        return "\u5165\u4f4f\u524d\u53d6\u6d88\u4e0d\u751f\u6210\u4fdd\u6d01\uff1b\u5982\u5df2\u5165\u4f4f\u540e\u53d6\u6d88\uff0c\u9700\u8981\u627e\u623f\u4e1c\u786e\u8ba4\u662f\u5426\u5b89\u6392\u6253\u626b"
    if event_type == "new_booking":
        return "\u6838\u5bf9 iCal \u662f\u5426\u5df2\u540c\u6b65\uff0c\u5e76\u68c0\u67e5\u9000\u623f\u4fdd\u6d01\u4efb\u52a1"
    if event_type == "reservation_change":
        return "\u9700\u8981\u786e\u8ba4\u6539\u5355\u662f\u5426\u5df2\u88ab\u63a5\u53d7\uff0c\u4eba\u6570/\u65e5\u671f/\u4fdd\u6d01\u662f\u5426\u9700\u8981\u66f4\u65b0"
    if event_type == "inquiry":
        return "\u9700\u8981\u623f\u4e1c\u56de\u590d"
    if event_type == "review":
        return "\u53ef\u51b3\u5b9a\u662f\u5426\u64b0\u5199\u8bc4\u4ef7"
    if event_type == "support":
        if re.search(r"\u5f00\u653e|unblock|opened|unblocked", text or "", re.I):
            return "\u5e73\u53f0\u5df2\u89e3\u9664\u65e5\u5386\u5c4f\u853d\uff0c\u9700\u4e0e iCal \u9501\u5b9a\u5386\u53f2\u5173\u8054"
        return "\u9700\u8981\u623f\u4e1c\u67e5\u770b\u5e76\u5904\u7406\u5e73\u53f0\u5ba2\u670d\u6d88\u606f"
    return status


def _pms_mail_match_room(property_id, listing_id, room_name, text, state):
    if listing_id:
        needle = str(listing_id)
        for listing in state.get("channelListings", []):
            if not isinstance(listing, dict):
                continue
            if str(listing.get("property_id") or "") != str(property_id):
                continue
            try:
                hay = json.dumps(listing, ensure_ascii=False)
            except Exception:
                hay = str(listing)
            if needle and needle in hay and listing.get("room_id"):
                return str(listing.get("room_id"))
    body = str(text or "")
    for room in state.get("rooms", []):
        if not isinstance(room, dict):
            continue
        if str(room.get("property_id") or "") != str(property_id):
            continue
        name = str(room.get("name") or "")
        if name and (name == room_name or name in body):
            return str(room.get("id") or "")
    return ""


def _pms_mail_event_from_raw(raw, property_id, state):
    subject = _pms_mail_raw_value(raw, ["subject", "title"], 500)
    body = _pms_mail_raw_value(raw, ["body", "text", "plain", "html", "snippet", "summary"], 20000)
    snippet = _pms_mail_raw_value(raw, ["snippet", "summary"], 2000)
    combined = "\n".join([subject, body, snippet])
    received_at = _pms_mail_raw_value(raw, ["email_ts", "received_at", "receivedAt", "date", "created_at"], 80) or datetime.utcnow().isoformat(timespec="seconds")
    year = _pms_mail_raw_year(received_at)
    checkin, checkout = _pms_mail_extract_cn_dates(combined, year)
    guest = _pms_mail_extract_guest(subject, combined)
    listing_id = _pms_mail_extract_listing_id(combined)
    reservation_code = _pms_mail_extract_reservation(combined)
    room_name = _pms_mail_extract_room(combined)
    event_type, severity, status = _pms_mail_classify(subject, combined)
    if event_type == "support" and re.search(r"\u5f00\u653e|unblock|opened|unblocked", combined, re.I):
        status = "unblocked"
    source_email = _pms_mail_raw_value(raw, ["source_email", "sourceEmail"], 220)
    if not source_email:
        to_values = _pms_mail_raw_list(raw.get("to") or raw.get("to_") or raw.get("recipients"))
        source_email = next((x for x in to_values if "@" in x and "gmail.com" not in x.lower()), "")
    target_mail = _pms_mail_raw_value(raw, ["target_mail", "targetMail", "delivered_to"], 220)
    message_id = _pms_mail_raw_value(raw, ["id", "message_id", "messageId"], 180)
    if not message_id:
        message_id = hashlib.sha1((subject + "|" + received_at + "|" + body[:500]).encode("utf-8")).hexdigest()[:24]
    room_id = _pms_mail_match_room(property_id, listing_id, room_name, combined, state)
    summary = _pms_mail_raw_compact(snippet or body or subject, 900)
    if event_type in {"new_booking", "cancellation"}:
        pieces = []
        if guest:
            pieces.append(guest)
        if checkin or checkout:
            pieces.append(f"{checkin or '?'} -> {checkout or '?'}")
        if reservation_code:
            pieces.append(f"\u786e\u8ba4\u7801 {reservation_code}")
        if pieces:
            summary = f"{_pms_mail_event_title(event_type, guest, checkin, checkout, subject)}\uff1a" + "\uff0c".join(pieces) + "\u3002"
    event_id = "mail_" + hashlib.sha1((message_id + "|" + str(property_id)).encode("utf-8")).hexdigest()[:18]
    return {
        "id": event_id,
        "message_id": message_id,
        "thread_id": _pms_mail_raw_value(raw, ["thread_id", "threadId"], 180),
        "received_at": received_at,
        "source_email": source_email,
        "target_mail": target_mail,
        "property_id": property_id,
        "room_id": room_id,
        "room_name": room_name,
        "listing_id": listing_id,
        "reservation_code": reservation_code,
        "guest": guest,
        "event_type": event_type,
        "severity": severity,
        "title": _pms_mail_event_title(event_type, guest, checkin, checkout, subject),
        "summary": summary,
        "checkin": checkin,
        "checkout": checkout,
        "status": status,
        "action_status": _pms_mail_action_status(event_type, status, combined),
        "raw_subject": subject,
        "created_at": datetime.utcnow().isoformat(timespec="seconds"),
        "updated_at": datetime.utcnow().isoformat(timespec="seconds"),
    }


def parse_mail_events(payload, actor=None):
    state = normalize_state(load_state())
    property_id = _pms_mail_event_text((payload or {}).get("property_id") or (payload or {}).get("propertyId"), 120)
    allowed_property_ids = _pms_mail_event_property_ids(state) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, state)
    if not property_id and len(allowed_property_ids) == 1:
        property_id = next(iter(allowed_property_ids))
    if not property_id or property_id not in allowed_property_ids:
        raise RuntimeError("mail parse property permission required")
    rows = (payload or {}).get("rawEmails") or (payload or {}).get("raw_emails") or (payload or {}).get("emails") or (payload or {}).get("messages")
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("rawEmails required")
    parsed = [_pms_mail_event_from_raw(raw, property_id, state) for raw in rows if isinstance(raw, dict)]
    saved, clean_rows = save_mail_events({"mailEvents": parsed}, actor)
    return saved, clean_rows
'''
if "_pms_mail_raw_parser_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, mail_raw_parser_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + mail_raw_parser_backend + "\n"

gmail_sync_backend = r'''
_pms_gmail_sync_v1 = True
GMAIL_TOKEN_CACHE = {"token": "", "expiry": 0}


def _pms_gmail_setting(name, default=""):
    return str(os.environ.get(name) or CONFIG.get(name.lower()) or default).strip()


def _pms_gmail_enabled():
    return bool(
        _pms_gmail_setting("GMAIL_CLIENT_ID")
        and _pms_gmail_setting("GMAIL_CLIENT_SECRET")
        and _pms_gmail_setting("GMAIL_REFRESH_TOKEN")
    )


def _pms_gmail_http_json(url, method="GET", payload=None, headers=None):
    data = None
    if payload is not None:
        if isinstance(payload, bytes):
            data = payload
        else:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if payload is not None and "Content-Type" not in (headers or {}):
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Gmail API {exc.code}: {body[:500]}")


def _pms_gmail_access_token():
    if not _pms_gmail_enabled():
        raise RuntimeError("后台 Gmail OAuth 未配置：需要 GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN")
    now = time.time()
    if GMAIL_TOKEN_CACHE.get("token") and GMAIL_TOKEN_CACHE.get("expiry", 0) > now + 60:
        return GMAIL_TOKEN_CACHE["token"]
    form = urllib.parse.urlencode({
        "client_id": _pms_gmail_setting("GMAIL_CLIENT_ID"),
        "client_secret": _pms_gmail_setting("GMAIL_CLIENT_SECRET"),
        "refresh_token": _pms_gmail_setting("GMAIL_REFRESH_TOKEN"),
        "grant_type": "refresh_token",
    }).encode("utf-8")
    data = _pms_gmail_http_json(
        "https://oauth2.googleapis.com/token",
        method="POST",
        payload=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = str(data.get("access_token") or "")
    if not token:
        raise RuntimeError("Gmail OAuth 未返回 access_token")
    GMAIL_TOKEN_CACHE["token"] = token
    GMAIL_TOKEN_CACHE["expiry"] = now + int(data.get("expires_in") or 3000)
    return token


def _pms_gmail_auth_headers():
    return {"Authorization": "Bearer " + _pms_gmail_access_token()}


def _pms_gmail_decode_body(data):
    text = str(data or "").strip()
    if not text:
        return ""
    pad = "=" * (-len(text) % 4)
    try:
        return base64.urlsafe_b64decode((text + pad).encode("ascii")).decode("utf-8", "replace")
    except Exception:
        return ""


def _pms_gmail_payload_text(payload):
    payload = payload if isinstance(payload, dict) else {}
    mime = str(payload.get("mimeType") or "").lower()
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    if mime.startswith("text/plain"):
        text = _pms_gmail_decode_body(body.get("data"))
        if text:
            return text
    parts = payload.get("parts") if isinstance(payload.get("parts"), list) else []
    plain = []
    html = []
    for part in parts:
        text = _pms_gmail_payload_text(part)
        if not text:
            continue
        pmime = str((part or {}).get("mimeType") or "").lower()
        if pmime.startswith("text/html"):
            html.append(re.sub(r"<[^>]+>", " ", text))
        else:
            plain.append(text)
    if plain:
        return "\n".join(plain)
    if html:
        return "\n".join(html)
    return _pms_gmail_decode_body(body.get("data"))


def _pms_gmail_headers(message):
    payload = message.get("payload") if isinstance(message, dict) else {}
    headers = payload.get("headers") if isinstance(payload, dict) and isinstance(payload.get("headers"), list) else []
    out = {}
    for item in headers:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").lower()
        if name:
            out[name] = str(item.get("value") or "")
    return out


def _pms_gmail_message_to_raw(message):
    headers = _pms_gmail_headers(message)
    return {
        "id": str(message.get("id") or ""),
        "thread_id": str(message.get("threadId") or ""),
        "from_": headers.get("from", ""),
        "to": _pms_mail_raw_list(headers.get("to", "")),
        "subject": headers.get("subject", ""),
        "date": headers.get("date", ""),
        "email_ts": datetime.utcfromtimestamp(int(message.get("internalDate") or "0") / 1000).isoformat(timespec="seconds") if message.get("internalDate") else "",
        "snippet": str(message.get("snippet") or ""),
        "body": _pms_gmail_payload_text(message.get("payload") or {}),
        "target_mail": _pms_gmail_setting("GMAIL_INBOX_EMAIL") or _pms_gmail_setting("PMS_GMAIL_INBOX") or "",
    }


def _pms_gmail_search(query, max_results=20):
    token_headers = _pms_gmail_auth_headers()
    url = "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + urllib.parse.urlencode({
        "q": query,
        "maxResults": max(1, min(int(max_results or 20), 50)),
    })
    data = _pms_gmail_http_json(url, headers=token_headers)
    ids = [item.get("id") for item in data.get("messages", []) if isinstance(item, dict) and item.get("id")]
    messages = []
    for message_id in ids:
        detail_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + urllib.parse.quote(message_id) + "?format=full"
        messages.append(_pms_gmail_http_json(detail_url, headers=token_headers))
    return [_pms_gmail_message_to_raw(message) for message in messages]


def _pms_mail_property_targets(state, actor, property_id=""):
    normalized = normalize_state(state)
    allowed = _pms_mail_event_property_ids(normalized) if (actor and actor.get("role") == "admin") else actor_property_ids(actor, normalized)
    targets = []
    for row in normalized.get("propertyMailForwarding", []):
        if not isinstance(row, dict):
            continue
        pid = str(row.get("property_id") or "")
        if property_id and pid != property_id:
            continue
        if pid not in allowed:
            continue
        source = str(row.get("source_email") or "").strip()
        if not source:
            continue
        targets.append((pid, source))
    return targets


def sync_gmail_mail_events(payload, actor=None):
    if not _pms_gmail_enabled():
        raise RuntimeError("后台 Gmail OAuth 未配置，暂时只能用页面的“导入/解析邮件”手动导入")
    payload = payload if isinstance(payload, dict) else {}
    state = normalize_state(load_state())
    property_id = _pms_mail_event_text(payload.get("property_id") or payload.get("propertyId"), 120)
    days = max(1, min(int(payload.get("days") or 3), 30))
    max_results = max(1, min(int(payload.get("max_results") or payload.get("maxResults") or 20), 50))
    targets = _pms_mail_property_targets(state, actor, property_id)
    if not targets:
        raise RuntimeError("没有可同步的房源邮箱设置：请先在房源里保存 Airbnb 通知邮箱")
    all_events = []
    details = []
    for pid, source_email in targets:
        base_query = _pms_gmail_setting("GMAIL_SYNC_QUERY") or "(airbnb OR 爱彼迎 OR from:airbnb.com OR from:airbnbmail.com OR from:supportmessaging.airbnb.com OR from:automated@airbnb.com) -in:spam -in:trash"
        query = f"newer_than:{days}d to:{source_email} {base_query}"
        raw_rows = _pms_gmail_search(query, max_results=max_results)
        parsed = [_pms_mail_event_from_raw(raw, pid, state) for raw in raw_rows]
        all_events.extend(parsed)
        details.append({"property_id": pid, "source_email": source_email, "query": query, "emails": len(raw_rows), "events": len(parsed)})
    saved, rows = save_mail_events({"mailEvents": all_events}, actor)
    return saved, rows, details
'''
if "_pms_gmail_sync_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, gmail_sync_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + gmail_sync_backend + "\n"

cleaning_confirm_backend = r'''
_pms_cleaning_confirm_v1 = True

if "cleaningTaskConfirmations" not in STATE_KEYS:
    STATE_KEYS.append("cleaningTaskConfirmations")

_pms_cleaning_confirm_base_default_state = default_state
def default_state():
    state = _pms_cleaning_confirm_base_default_state()
    state.setdefault("cleaningTaskConfirmations", [])
    return state


def _pms_cleaning_confirm_text(value, limit=1000):
    return str(value or "").strip()[:limit]


def _pms_cleaning_confirm_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "done", "completed", "已完成", "完成"}


def _pms_cleaning_confirm_allowed_targets(state, actor):
    normalized = normalize_state(state)
    if not actor or actor.get("role") == "admin":
        property_ids = {
            item.get("id")
            for item in normalized.get("properties", [])
            if isinstance(item, dict) and item.get("id")
        }
    else:
        property_ids = actor_property_ids(actor, normalized)
    first_property = next(iter(property_ids), "")
    room_ids = {
        item.get("id")
        for item in normalized.get("rooms", [])
        if isinstance(item, dict)
        and item.get("id")
        and (item.get("property_id") or first_property) in property_ids
    }
    common_ids = {
        item.get("id")
        for item in normalized.get("commonAreas", [])
        if isinstance(item, dict)
        and item.get("id")
        and (item.get("property_id") or first_property) in property_ids
    }
    return room_ids, common_ids


def _pms_cleaning_confirm_target_allowed(row, room_ids, common_ids):
    target_type = _pms_cleaning_confirm_text(row.get("target_type") or row.get("targetType") or "room", 20)
    target_id = _pms_cleaning_confirm_text(row.get("target_id") or row.get("targetId"), 120)
    if target_type == "common":
        return target_id in common_ids
    return target_id in room_ids


def _pms_cleaning_confirm_key(row):
    return "|".join([
        _pms_cleaning_confirm_text(row.get("date"), 20),
        _pms_cleaning_confirm_text(row.get("target_type") or row.get("targetType") or "room", 20),
        _pms_cleaning_confirm_text(row.get("target_id") or row.get("targetId"), 120),
        _pms_cleaning_confirm_text(row.get("task_key") or row.get("taskKey"), 300),
    ])


def _pms_cleaning_confirm_clean(row):
    raw = row if isinstance(row, dict) else {}
    date = _pms_cleaning_confirm_text(raw.get("date"), 20)
    target_type = _pms_cleaning_confirm_text(raw.get("target_type") or raw.get("targetType") or "room", 20)
    if target_type not in {"room", "common"}:
        target_type = "room"
    target_id = _pms_cleaning_confirm_text(raw.get("target_id") or raw.get("targetId"), 120)
    task_key = _pms_cleaning_confirm_text(raw.get("task_key") or raw.get("taskKey") or "|".join([date, target_type, target_id]), 500)
    completed = _pms_cleaning_confirm_bool(raw.get("completed")) or _pms_cleaning_confirm_text(raw.get("status"), 40) in {"已完成", "完成"}
    now = datetime.utcnow().isoformat(timespec="seconds")
    stable = hashlib.sha1(task_key.encode("utf-8")).hexdigest()[:24]
    return {
        "id": _pms_cleaning_confirm_text(raw.get("id"), 80) or "cleanconf_" + stable,
        "date": date,
        "target_type": target_type,
        "target_id": target_id,
        "task_key": task_key,
        "source": _pms_cleaning_confirm_text(raw.get("source"), 80),
        "task_type": _pms_cleaning_confirm_text(raw.get("task_type") or raw.get("taskType"), 80),
        "task_reason": _pms_cleaning_confirm_text(raw.get("task_reason") or raw.get("taskReason"), 500),
        "amount": raw.get("amount", 0),
        "completed": completed,
        "status": "已完成" if completed else _pms_cleaning_confirm_text(raw.get("status"), 40) or "未完成",
        "feedback": _pms_cleaning_confirm_text(raw.get("feedback"), 2000),
        "confirmed_by": _pms_cleaning_confirm_text(raw.get("confirmed_by") or raw.get("confirmedBy"), 120),
        "confirmed_at": _pms_cleaning_confirm_text(raw.get("confirmed_at") or raw.get("confirmedAt"), 40) if completed else "",
        "updated_at": now,
    }


_pms_cleaning_confirm_base_normalize_state = normalize_state
def normalize_state(raw):
    state = _pms_cleaning_confirm_base_normalize_state(raw)
    state.setdefault("cleaningTaskConfirmations", [])
    state["cleaningTaskConfirmations"] = [
        _pms_cleaning_confirm_clean(item)
        for item in state.get("cleaningTaskConfirmations", [])
        if isinstance(item, dict)
    ][-2000:]
    return state


_pms_cleaning_confirm_base_filter_state_for_user = filter_state_for_user
def filter_state_for_user(state, actor):
    filtered = _pms_cleaning_confirm_base_filter_state_for_user(state, actor)
    normalized = normalize_state(state)
    if not actor or actor.get("role") == "admin":
        filtered["cleaningTaskConfirmations"] = normalized.get("cleaningTaskConfirmations", [])
        return filtered
    room_ids = {item.get("id") for item in filtered.get("rooms", []) if isinstance(item, dict)}
    common_ids = {item.get("id") for item in filtered.get("commonAreas", []) if isinstance(item, dict)}
    filtered["cleaningTaskConfirmations"] = [
        item for item in normalized.get("cleaningTaskConfirmations", [])
        if isinstance(item, dict)
        and (
            (item.get("target_type") == "common" and item.get("target_id") in common_ids)
            or (item.get("target_type") != "common" and item.get("target_id") in room_ids)
        )
    ]
    return filtered


_pms_cleaning_confirm_base_save_state_from_payload = save_state_from_payload
def save_state_from_payload(payload, actor=None):
    working = dict(payload or {})
    incoming_confirmations = working.pop("cleaningTaskConfirmations", None)
    if incoming_confirmations is None:
        return _pms_cleaning_confirm_base_save_state_from_payload(working, actor)
    saved = _pms_cleaning_confirm_base_save_state_from_payload(working, actor) if working else normalize_state(load_state())
    current = normalize_state(load_state())
    room_ids, common_ids = _pms_cleaning_confirm_allowed_targets(current, actor)
    existing = [
        item for item in current.get("cleaningTaskConfirmations", [])
        if isinstance(item, dict) and not _pms_cleaning_confirm_target_allowed(item, room_ids, common_ids)
    ]
    by_key = {_pms_cleaning_confirm_key(item): item for item in existing}
    rows = incoming_confirmations if isinstance(incoming_confirmations, list) else []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        clean = _pms_cleaning_confirm_clean(raw)
        if not _pms_cleaning_confirm_target_allowed(clean, room_ids, common_ids):
            raise RuntimeError("cleaning task permission required")
        key = _pms_cleaning_confirm_key(clean)
        if raw.get("_delete") or raw.get("_clear"):
            by_key.pop(key, None)
            continue
        by_key[key] = clean
    current["cleaningTaskConfirmations"] = list(by_key.values())[-2000:]
    return save_state(current)
'''
if "_pms_cleaning_confirm_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, cleaning_confirm_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + cleaning_confirm_backend + "\n"

ical_event_archive_backend = r'''
_pms_ical_event_archive_v1 = True

if "icalEventArchive" not in STATE_KEYS:
    STATE_KEYS.append("icalEventArchive")


def _pms_ical_archive_text(value, limit=5000):
    return str(value or "").strip()[:limit]


def _pms_ical_archive_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "是"}


def _pms_ical_archive_int(value, default=0):
    try:
        return int(value or 0)
    except Exception:
        return default


def _pms_ical_archive_hash(value, length=24):
    return hashlib.sha1(str(value or "").encode("utf-8")).hexdigest()[:length]


def _pms_ical_archive_room(state, room_id):
    return next((item for item in state.get("rooms", []) if isinstance(item, dict) and item.get("id") == room_id), {})


def _pms_ical_archive_event_id(listing, event):
    listing_id = _pms_ical_archive_text(listing.get("id"), 160)
    uid = _pms_ical_archive_text(event.get("uid") or event.get("external_event_uid"), 300)
    checkin = _pms_ical_archive_text(event.get("checkin"), 40)
    checkout = _pms_ical_archive_text(event.get("checkout"), 40)
    raw_hash = _pms_ical_archive_text(event.get("raw_hash"), 80)
    if not raw_hash:
        raw_hash = _pms_ical_archive_hash(event.get("raw_excerpt") or event.get("summary") or event.get("description"), 16)
    identity = uid or raw_hash or _pms_ical_archive_hash("|".join([
        _pms_ical_archive_text(event.get("summary"), 300),
        _pms_ical_archive_text(event.get("status"), 120),
        _pms_ical_archive_text(event.get("description"), 500),
    ]), 24)
    return "icalevt_" + _pms_ical_archive_hash("|".join([listing_id, identity, checkin, checkout]), 28)


def _pms_ical_archive_kind(event):
    return "lock" if _pms_ical_archive_bool(event.get("is_locked")) or event.get("kind") == "lock" or event.get("booking_type") == "lock" else "booking"


def _pms_ical_archive_snapshot(event, synced_at):
    return {
        "synced_at": synced_at,
        "raw_hash": _pms_ical_archive_text(event.get("raw_hash"), 80),
        "uid": _pms_ical_archive_text(event.get("uid") or event.get("external_event_uid"), 300),
        "checkin": _pms_ical_archive_text(event.get("checkin"), 40),
        "checkout": _pms_ical_archive_text(event.get("checkout"), 40),
        "kind": _pms_ical_archive_kind(event),
        "summary": _pms_ical_archive_text(event.get("summary"), 500),
        "status": _pms_ical_archive_text(event.get("status"), 300),
        "lock_reason": _pms_ical_archive_text(event.get("lock_reason"), 600),
    }


def _pms_ical_archive_clean(item):
    raw = item if isinstance(item, dict) else {}
    snapshots = raw.get("snapshots") if isinstance(raw.get("snapshots"), list) else []
    return {
        "id": _pms_ical_archive_text(raw.get("id"), 160),
        "property_id": _pms_ical_archive_text(raw.get("property_id") or raw.get("propertyId"), 120),
        "room_id": _pms_ical_archive_text(raw.get("room_id") or raw.get("roomId"), 120),
        "room_name": _pms_ical_archive_text(raw.get("room_name") or raw.get("roomName"), 240),
        "channel_listing_id": _pms_ical_archive_text(raw.get("channel_listing_id") or raw.get("channelListingId"), 160),
        "platform": _pms_ical_archive_text(raw.get("platform") or "iCal", 80),
        "channel_note": _pms_ical_archive_text(raw.get("channel_note") or raw.get("channelNote"), 240),
        "uid": _pms_ical_archive_text(raw.get("uid"), 300),
        "uid_hash": _pms_ical_archive_text(raw.get("uid_hash") or raw.get("uidHash"), 80),
        "raw_hash": _pms_ical_archive_text(raw.get("raw_hash") or raw.get("rawHash"), 80),
        "checkin": _pms_ical_archive_text(raw.get("checkin"), 40),
        "checkout": _pms_ical_archive_text(raw.get("checkout"), 40),
        "kind": "lock" if raw.get("kind") == "lock" or _pms_ical_archive_bool(raw.get("is_locked") or raw.get("isLocked")) else "booking",
        "is_locked": _pms_ical_archive_bool(raw.get("is_locked") or raw.get("isLocked")),
        "lock_reason": _pms_ical_archive_text(raw.get("lock_reason") or raw.get("lockReason"), 800),
        "summary": _pms_ical_archive_text(raw.get("summary"), 800),
        "status": _pms_ical_archive_text(raw.get("status"), 500),
        "description": _pms_ical_archive_text(raw.get("description"), 1600),
        "fields": raw.get("fields") if isinstance(raw.get("fields"), dict) else {},
        "fields_detailed": raw.get("fields_detailed") if isinstance(raw.get("fields_detailed"), list) else [],
        "raw_lines": raw.get("raw_lines") if isinstance(raw.get("raw_lines"), list) else [],
        "raw_excerpt": _pms_ical_archive_text(raw.get("raw_excerpt") or raw.get("rawExcerpt"), 3000),
        "first_seen": _pms_ical_archive_text(raw.get("first_seen") or raw.get("firstSeen") or raw.get("synced_at"), 80),
        "last_seen": _pms_ical_archive_text(raw.get("last_seen") or raw.get("lastSeen") or raw.get("synced_at"), 80),
        "seen_count": _pms_ical_archive_int(raw.get("seen_count") or raw.get("seenCount"), 0),
        "active": _pms_ical_archive_bool(raw.get("active", True)),
        "disappeared_at": _pms_ical_archive_text(raw.get("disappeared_at") or raw.get("disappearedAt"), 80),
        "last_missing_at": _pms_ical_archive_text(raw.get("last_missing_at") or raw.get("lastMissingAt"), 80),
        "missing_count": _pms_ical_archive_int(raw.get("missing_count") or raw.get("missingCount"), 0),
        "last_sync_status": _pms_ical_archive_text(raw.get("last_sync_status") or raw.get("lastSyncStatus"), 80),
        "last_error": _pms_ical_archive_text(raw.get("last_error") or raw.get("lastError"), 500),
        "last_warning": _pms_ical_archive_text(raw.get("last_warning") or raw.get("lastWarning"), 900),
        "snapshots": snapshots,
    }


_pms_ical_archive_base_default_state = default_state
def default_state():
    state = _pms_ical_archive_base_default_state()
    state.setdefault("icalEventArchive", [])
    return state


_pms_ical_archive_base_normalize_state = normalize_state
def normalize_state(raw):
    state = _pms_ical_archive_base_normalize_state(raw)
    archive = {}
    for item in state.get("icalEventArchive", []):
        if not isinstance(item, dict):
            continue
        clean = _pms_ical_archive_clean(item)
        if clean.get("id"):
            archive[clean["id"]] = clean
    state["icalEventArchive"] = sorted(
        archive.values(),
        key=lambda item: item.get("last_seen") or item.get("first_seen") or item.get("disappeared_at") or "",
        reverse=True,
    )
    return state


def _pms_ical_archive_record_from_event(state, listing, event, synced_at, sync_status, error="", warning=""):
    room = _pms_ical_archive_room(state, listing.get("room_id"))
    uid = _pms_ical_archive_text(event.get("uid") or event.get("external_event_uid"), 300)
    raw_hash = _pms_ical_archive_text(event.get("raw_hash"), 80) or _pms_ical_archive_hash(event.get("raw_excerpt") or event.get("summary"), 16)
    kind = _pms_ical_archive_kind(event)
    return {
        "id": _pms_ical_archive_event_id(listing, event),
        "property_id": room.get("property_id") or "property_default",
        "room_id": listing.get("room_id"),
        "room_name": room.get("name") or "",
        "channel_listing_id": listing.get("id"),
        "platform": listing.get("platform") or "iCal",
        "channel_note": listing.get("channel_note") or "",
        "uid": uid,
        "uid_hash": _pms_ical_archive_hash(uid, 16) if uid else "",
        "raw_hash": raw_hash,
        "checkin": _pms_ical_archive_text(event.get("checkin"), 40),
        "checkout": _pms_ical_archive_text(event.get("checkout"), 40),
        "kind": kind,
        "is_locked": kind == "lock",
        "lock_reason": _pms_ical_archive_text(event.get("lock_reason"), 800),
        "summary": _pms_ical_archive_text(event.get("summary"), 800),
        "status": _pms_ical_archive_text(event.get("status"), 500),
        "description": _pms_ical_archive_text(event.get("description"), 1600),
        "fields": event.get("fields") if isinstance(event.get("fields"), dict) else {},
        "fields_detailed": event.get("fields_detailed") if isinstance(event.get("fields_detailed"), list) else [],
        "raw_lines": event.get("raw_lines") if isinstance(event.get("raw_lines"), list) else [],
        "raw_excerpt": _pms_ical_archive_text(event.get("raw_excerpt"), 3000),
        "first_seen": synced_at,
        "last_seen": synced_at,
        "seen_count": 1,
        "active": True,
        "disappeared_at": "",
        "last_missing_at": "",
        "missing_count": 0,
        "last_sync_status": sync_status,
        "last_error": _pms_ical_archive_text(error, 500),
        "last_warning": _pms_ical_archive_text(warning, 900),
        "snapshots": [_pms_ical_archive_snapshot(event, synced_at)],
    }


def _pms_ical_archive_update(state, listing, synced_at, sync_status, raw_events, error="", warning="", missing_events=None):
    state.setdefault("icalEventArchive", [])
    archive = {}
    for item in state.get("icalEventArchive", []):
        if isinstance(item, dict):
            clean = _pms_ical_archive_clean(item)
            if clean.get("id"):
                archive[clean["id"]] = clean
    current_ids = set()
    for event in raw_events or []:
        if not isinstance(event, dict):
            continue
        event_id = _pms_ical_archive_event_id(listing, event)
        current_ids.add(event_id)
        fresh = _pms_ical_archive_record_from_event(state, listing, event, synced_at, sync_status, error=error, warning=warning)
        existing = archive.get(event_id)
        if existing:
            first_seen = existing.get("first_seen") or fresh.get("first_seen")
            snapshots = existing.get("snapshots") if isinstance(existing.get("snapshots"), list) else []
            snap = _pms_ical_archive_snapshot(event, synced_at)
            if not snapshots or snapshots[-1].get("raw_hash") != snap.get("raw_hash") or snapshots[-1].get("checkin") != snap.get("checkin") or snapshots[-1].get("checkout") != snap.get("checkout") or snapshots[-1].get("status") != snap.get("status"):
                snapshots.append(snap)
            fresh["first_seen"] = first_seen
            fresh["seen_count"] = _pms_ical_archive_int(existing.get("seen_count"), 0) + 1
            fresh["snapshots"] = snapshots
        archive[event_id] = fresh
    listing_id = listing.get("id")
    for event_id, row in list(archive.items()):
        if row.get("channel_listing_id") != listing_id or event_id in current_ids:
            continue
        if row.get("active"):
            row["disappeared_at"] = row.get("disappeared_at") or synced_at
        row["active"] = False
        row["last_missing_at"] = synced_at
        row["missing_count"] = _pms_ical_archive_int(row.get("missing_count"), 0) + 1
        row["last_sync_status"] = "missing_from_latest_sync"
        row["last_warning"] = _pms_ical_archive_text(warning or "平台最新 iCal 没有返回这条旧事件，已保留为历史记录", 900)
    for event in missing_events or []:
        if not isinstance(event, dict):
            continue
        event_id = _pms_ical_archive_event_id(listing, event)
        row = archive.get(event_id)
        if row:
            row["active"] = False
            row["disappeared_at"] = row.get("disappeared_at") or synced_at
            row["last_missing_at"] = synced_at
            row["missing_count"] = max(_pms_ical_archive_int(row.get("missing_count"), 0), 1)
    state["icalEventArchive"] = sorted(
        archive.values(),
        key=lambda item: item.get("last_seen") or item.get("first_seen") or item.get("disappeared_at") or "",
        reverse=True,
    )
    return state


_pms_ical_archive_base_filter_state_for_user = filter_state_for_user
def filter_state_for_user(state, actor):
    filtered = _pms_ical_archive_base_filter_state_for_user(state, actor)
    normalized = normalize_state(state)
    role = (actor or {}).get("role")
    if role == "admin":
        filtered["icalEventArchive"] = normalized.get("icalEventArchive", [])
        return filtered
    if role == "owner":
        room_ids = {room.get("id") for room in filtered.get("rooms", []) if isinstance(room, dict)}
        filtered["icalEventArchive"] = [
            item for item in normalized.get("icalEventArchive", [])
            if item.get("room_id") in room_ids
        ]
        return filtered
    filtered["icalEventArchive"] = []
    return filtered


_pms_ical_archive_base_inspect_ical_diagnostics = inspect_ical_diagnostics
def inspect_ical_diagnostics(payload, actor=None):
    data = _pms_ical_archive_base_inspect_ical_diagnostics(payload, actor)
    state = normalize_state(load_state())
    allowed_property_ids = _pms_channel_allowed_property_ids(actor, state)
    allowed_room_ids = {
        room.get("id") for room in state.get("rooms", [])
        if isinstance(room, dict) and (room.get("property_id") or "property_default") in allowed_property_ids
    }
    room_id = _pms_ical_archive_text((payload or {}).get("room_id") or (payload or {}).get("roomId"), 120)
    channel_id = _pms_ical_archive_text((payload or {}).get("channel_listing_id") or (payload or {}).get("channelListingId") or (payload or {}).get("channel_id") or (payload or {}).get("channelId"), 160)
    data["archive"] = [
        item for item in state.get("icalEventArchive", [])
        if item.get("room_id") in allowed_room_ids
        and (not room_id or item.get("room_id") == room_id)
        and (not channel_id or item.get("channel_listing_id") == channel_id)
    ][:120]
    return data
'''
if "_pms_ical_event_archive_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, ical_event_archive_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + ical_event_archive_backend + "\n"

external_event_storage_backend = r'''
_pms_external_event_storage_v1 = True

_PMS_EXTERNAL_STATE_KEYS = ("icalEventArchive", "mailEvents")
_PMS_EXTERNAL_SHARD_RAW_LIMIT = 360000


def _pms_external_doc_url(suffix):
    project = urllib.parse.quote(firebase_project_id(), safe="")
    collection = urllib.parse.quote(STATE_COLLECTION, safe="")
    document = urllib.parse.quote(f"{STATE_DOCUMENT}__{suffix}", safe="")
    return f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/{collection}/{document}"


def _pms_external_pack(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return raw, base64.b64encode(gzip.compress(raw, compresslevel=9)).decode("ascii")


def _pms_external_unpack(text):
    if not text:
        return []
    raw = gzip.decompress(base64.b64decode(str(text).encode("ascii"))).decode("utf-8")
    value = json.loads(raw or "[]")
    return value if isinstance(value, list) else []


def _pms_external_index(key):
    doc = firestore_request("GET", _pms_external_doc_url(f"{key}__index"))
    if not doc:
        return None
    fields = doc.get("fields", {})
    return {
        "shard_count": int(fields.get("shard_count", {}).get("integerValue") or 0),
        "row_count": int(fields.get("row_count", {}).get("integerValue") or 0),
        "updated_at": fields.get("updated_at", {}).get("timestampValue") or "",
    }


def _pms_external_read(key):
    if not firebase_credentials_configured():
        return None
    index = _pms_external_index(key)
    if not index:
        legacy = firestore_request("GET", _pms_external_doc_url(key))
        if not legacy:
            return None
        fields = legacy.get("fields", {})
        compressed = fields.get("data_gzip_base64", {}).get("stringValue") or ""
        if compressed:
            return _pms_external_unpack(compressed)
        raw = fields.get("data_json", {}).get("stringValue") or ""
        if raw:
            value = json.loads(raw or "[]")
            return value if isinstance(value, list) else []
        return None
    rows = []
    for idx in range(index.get("shard_count", 0)):
        doc = firestore_request("GET", _pms_external_doc_url(f"{key}__{idx:04d}"))
        if not doc:
            continue
        compressed = doc.get("fields", {}).get("data_gzip_base64", {}).get("stringValue") or ""
        rows.extend(_pms_external_unpack(compressed))
    return rows


def _pms_external_chunk_rows(rows):
    chunks = []
    current = []
    current_size = 2
    for row in rows:
        row_raw = json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        row_size = len(row_raw) + 1
        if current and current_size + row_size > _PMS_EXTERNAL_SHARD_RAW_LIMIT:
            chunks.append(current)
            current = []
            current_size = 2
        current.append(row)
        current_size += row_size
    chunks.append(current)
    return chunks


def _pms_external_write(key, rows):
    if not firebase_credentials_configured():
        return
    clean_rows = rows if isinstance(rows, list) else []
    chunks = _pms_external_chunk_rows(clean_rows)
    now = now_utc_iso()
    for idx, chunk in enumerate(chunks):
        raw, compressed = _pms_external_pack(chunk)
        if len(compressed) > 950000:
            raise RuntimeError(f"{key} shard {idx} is too large after compression: {len(compressed)} bytes")
        firestore_request("PATCH", _pms_external_doc_url(f"{key}__{idx:04d}"), payload={
            "fields": {
                "key": {"stringValue": key},
                "shard_index": {"integerValue": str(idx)},
                "data_gzip_base64": {"stringValue": compressed},
                "raw_bytes": {"integerValue": str(len(raw))},
                "compressed_bytes": {"integerValue": str(len(compressed))},
                "row_count": {"integerValue": str(len(chunk))},
                "updated_at": {"timestampValue": now},
            }
        })
    firestore_request("PATCH", _pms_external_doc_url(f"{key}__index"), payload={
        "fields": {
            "key": {"stringValue": key},
            "storage": {"stringValue": "gzip_base64_shards"},
            "shard_count": {"integerValue": str(len(chunks))},
            "row_count": {"integerValue": str(len(clean_rows))},
            "updated_at": {"timestampValue": now},
        }
    })


_pms_external_base_load_state = load_state
def load_state():
    state = _pms_external_base_load_state()
    if firebase_credentials_configured():
        for key in _PMS_EXTERNAL_STATE_KEYS:
            rows = _pms_external_read(key)
            if rows is not None:
                state[key] = rows
    return normalize_state(state)


_pms_external_base_save_state = save_state
def save_state(state):
    state = normalize_state(state)
    if not firebase_credentials_configured():
        return _pms_external_base_save_state(state)
    external_rows = {}
    compact_state = dict(state)
    for key in _PMS_EXTERNAL_STATE_KEYS:
        external_rows[key] = compact_state.pop(key, [])
    for key, rows in external_rows.items():
        _pms_external_write(key, rows)
    saved = _pms_external_base_save_state(compact_state)
    for key, rows in external_rows.items():
        saved[key] = rows
    return normalize_state(saved)


def pms_storage_diagnostics():
    state = normalize_state(load_state())
    details = {"main_state_keys": sorted(state.keys()), "external": {}}
    if firebase_credentials_configured():
        for key in _PMS_EXTERNAL_STATE_KEYS:
            index = _pms_external_index(key) or {}
            details["external"][key] = {
                "rows": len(state.get(key, [])),
                "shards": index.get("shard_count", 0),
                "updated_at": index.get("updated_at", ""),
            }
    else:
        for key in _PMS_EXTERNAL_STATE_KEYS:
            details["external"][key] = {"rows": len(state.get(key, [])), "shards": 0, "storage": "local_state_json"}
    return details


def _pms_ui_sync_history_summary(rows):
    clean = []
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        clean.append({
            "id": item.get("id", ""),
            "synced_at": item.get("synced_at", ""),
            "property_id": item.get("property_id", ""),
            "room_id": item.get("room_id", ""),
            "room_name": item.get("room_name", ""),
            "channel_listing_id": item.get("channel_listing_id", ""),
            "platform": item.get("platform", ""),
            "channel_note": item.get("channel_note", ""),
            "status": item.get("status", ""),
            "event_count": item.get("event_count", 0),
            "booking_count": item.get("booking_count", 0),
            "lock_count": item.get("lock_count", 0),
            "inferred_lock_count": item.get("inferred_lock_count", 0),
            "missing_event_count": item.get("missing_event_count", 0),
            "warning": item.get("warning", ""),
            "error": item.get("error", ""),
        })
    return clean[-80:]


def pms_state_response_for_user(state, actor):
    normalized = normalize_state(state)
    normalized["icalEventArchive"] = []
    normalized["icalSyncHistory"] = _pms_ui_sync_history_summary(normalized.get("icalSyncHistory", []))
    filtered = filter_state_for_user(normalized, actor)
    if not isinstance(filtered, dict):
        return filtered
    # The UI never needs raw archived iCal fields. Keep them in Firestore for
    # diagnostics/sync logic, but do not ship them on every page load.
    filtered["icalEventArchive"] = []
    filtered["icalSyncHistory"] = _pms_ui_sync_history_summary(filtered.get("icalSyncHistory", []))
    return filtered


def pms_load_state_for_ui():
    if not firebase_credentials_configured():
        return normalize_state(load_state())
    state = _pms_external_base_load_state()
    rows = _pms_external_read("mailEvents")
    if rows is not None:
        state["mailEvents"] = rows
    return normalize_state(state)
'''
if "_pms_external_event_storage_v1" not in source_text:
    if auto_sync_marker in source_text:
        source_text = source_text.replace(auto_sync_marker, external_event_storage_backend + "\n" + auto_sync_marker, 1)
    else:
        source_text += "\n" + external_event_storage_backend + "\n"

if "_pms_property_mail_http_v1" not in source_text:
    property_mail_route_hook = '''            if path.startswith("/api/property/"):'''
    property_mail_routes = '''            # _pms_property_mail_http_v1
            if path == "/api/storage-diagnostics":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                json_response(self, {"ok": True, "storage": pms_storage_diagnostics()})
                return
            if path == "/api/mail-config":
                user = require_user(self, ("admin",))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved = save_mail_config_setting(payload, user)
                json_response(self, {"ok": True, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/property-mail":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, row = save_property_mail_setting(payload, user)
                json_response(self, {"ok": True, "propertyMail": row, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/mail-events":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, rows = save_mail_events(payload, user)
                json_response(self, {"ok": True, "mailEvents": rows, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/mail-events/parse":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, rows = parse_mail_events(payload, user)
                json_response(self, {"ok": True, "mailEvents": rows, "state": filter_state_for_user(saved, user)})
                return
            if path == "/api/mail-events/sync":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved, rows, details = sync_gmail_mail_events(payload, user)
                json_response(self, {"ok": True, "mailEvents": rows, "details": details, "state": filter_state_for_user(saved, user)})
                return
'''
    if property_mail_route_hook not in source_text:
        raise RuntimeError("property mail route hook not found")
    source_text = source_text.replace(property_mail_route_hook, property_mail_routes + property_mail_route_hook, 1)

if "_pms_ical_diagnostic_http_v1" not in source_text:
    ical_diagnostic_route_hook = '''            if path.startswith("/api/property/"):'''
    ical_diagnostic_routes = '''            # _pms_ical_diagnostic_http_v1
            if path == "/api/ical-diagnostics":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                json_response(self, {"ok": True, "diagnostics": inspect_ical_diagnostics(payload, user)})
                return
'''
    if ical_diagnostic_route_hook not in source_text:
        raise RuntimeError("iCal diagnostic route hook not found")
    source_text = source_text.replace(ical_diagnostic_route_hook, ical_diagnostic_routes + ical_diagnostic_route_hook, 1)

state_get_route_old = '''            if path == "/api/state":
                user = require_user(self, ("admin", "owner", "cleaner"))
                if not user:
                    return
                json_response(self, filter_state_for_user(load_state(), user))
                return
'''
state_get_route_new = '''            if path == "/api/state":
                user = require_user(self, ("admin", "owner", "cleaner"))
                if not user:
                    return
                json_response(self, pms_state_response_for_user(pms_load_state_for_ui(), user))
                return
'''
if state_get_route_new not in source_text:
    if state_get_route_old not in source_text:
        raise RuntimeError("GET /api/state route hook not found")
    source_text = source_text.replace(state_get_route_old, state_get_route_new, 1)

state_post_route_old = '''            if path == "/api/state":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved = save_state_from_payload(payload, actor=user)
                json_response(self, {"ok": True, "state": filter_state_for_user(saved, user)})
                return
'''
state_post_route_new = '''            if path == "/api/state":
                user = require_user(self, ("admin", "owner"))
                if not user:
                    return
                payload = json.loads(raw.decode("utf-8") or "{}")
                saved = save_state_from_payload(payload, actor=user)
                json_response(self, {"ok": True, "state": pms_state_response_for_user(saved, user)})
                return
'''
if state_post_route_new not in source_text:
    if state_post_route_old not in source_text:
        raise RuntimeError("POST /api/state route hook not found")
    source_text = source_text.replace(state_post_route_old, state_post_route_new, 1)

auto_sync_block = '''_pms_ical_sync_lock = threading.Lock()

def _pms_run_scheduled_ical_sync():
    if not _pms_ical_sync_lock.acquire(blocking=False):
        return
    try:
        sync_icals()
    except Exception:
        traceback.print_exc()
    finally:
        _pms_ical_sync_lock.release()

def _pms_start_ical_auto_sync():
    enabled = str(os.environ.get("PMS_ICAL_AUTO_SYNC_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")
    if not enabled:
        return
    interval = int(os.environ.get("PMS_ICAL_SYNC_INTERVAL_SECONDS", "3600"))
    if interval <= 0:
        return
    def worker():
        time.sleep(min(60, interval))
        while True:
            _pms_run_scheduled_ical_sync()
            time.sleep(interval)
    threading.Thread(target=worker, daemon=True, name="pms-ical-auto-sync").start()

if __name__ == "__main__":
    _pms_start_ical_auto_sync()
    print(f"PMS Firebase REST backend started on port {PORT}")
    HTTPServer((HOST, PORT), Handler).serve_forever()
'''
if "_pms_start_ical_auto_sync" not in source_text:
    if auto_sync_marker not in source_text:
        raise RuntimeError("auto iCal sync startup hook not found")
    source_text = source_text.replace(auto_sync_marker, auto_sync_block, 1)

exec(compile(source_text, __file__, "exec"))
