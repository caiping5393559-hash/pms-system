(function(){
  const VERSION = '2026-07-09-v95-fast-channel-save';
  window.__PMS_APP_VERSION = VERSION;
  const CLEANING_CONFIRM_REQUIRED_FROM = '2026-07-04';
  const CLEANING_TASK_LAUNCH_DATE = '2026-07-04';
  const CLEANING_TASK_RAMP_DAYS = 7;

  const ui = window.__pmsUnifiedUi || (window.__pmsUnifiedUi = {
    selectedPropertyIds: null,
    selectedRoomIds: null,
    selectedPropertyId: '',
    editingProperty: '',
    editingRoom: '',
    editingArea: '',
    roomSettingsPanel: 'summary',
    roomDefaultsApplied: false,
    syncResults: {},
    pendingChannels: {},
    calendarVacancyOnly: false,
    cleaningSubTab: 'today',
    cleaningWorkDate: '',
    editingRecurringTaskId: '',
    recurringPropertyFilter: '',
    recurringRoomFilter: '',
    opsTab: 'dashboard',
    mail: {mailForwardingConfig: [], propertyMailForwarding: [], mailEvents: []},
    photoRows: {},
    confirmRows: {},
    booted: false,
    loading: false
  });
  ui.mail = ui.mail || {mailForwardingConfig: [], propertyMailForwarding: [], mailEvents: []};
  ui.mail.mailForwardingConfig = Array.isArray(ui.mail.mailForwardingConfig) ? ui.mail.mailForwardingConfig : [];
  ui.mail.propertyMailForwarding = Array.isArray(ui.mail.propertyMailForwarding) ? ui.mail.propertyMailForwarding : [];
  ui.mail.mailEvents = Array.isArray(ui.mail.mailEvents) ? ui.mail.mailEvents : [];
  ui.mail.statusByProperty = ui.mail.statusByProperty || {};
  ui.calendarVacancyOnly = !!ui.calendarVacancyOnly;
  ui.roomSettingsPanel = ui.roomSettingsPanel || 'summary';
  ui.roomDefaultsApplied = !!ui.roomDefaultsApplied;
  ui.editingRecurringTaskId = ui.editingRecurringTaskId || '';
  ui.cleaningSubTab = ['today','finance','manual','notes'].includes(ui.cleaningSubTab) ? ui.cleaningSubTab : 'today';
  ui.cleaningWorkDate = ui.cleaningWorkDate || '';
  ui.opsTab = ['dashboard','maintenance','inventory','expenses','guests','channels','audit'].includes(ui.opsTab) ? ui.opsTab : 'dashboard';

  const LANGUAGES = [
    ['zh-CN','中文'],
    ['en-US','English'],
    ['es-ES','Español']
  ];
  const I18N = {
    'zh-CN': {
      'nav.cleaner':'保洁页面','nav.owner':'房东管理','nav.finance':'财务管理','nav.access':'子账号权限','nav.ops':'运营中心','nav.profile':'用户设置','nav.logout':'退出登录',
      'pref.timezone':'时区','pref.language':'语言',
      'role.admin':'管理员','role.owner':'房东','role.cleaner':'保洁','role.unknown':'未识别',
      'header.owner.title':'{name} · 房东管理后台','header.owner.sub':'管理房源、房间、公区、iCal 同步和保洁绑定。',
      'header.cleaner.title':'{name} · 保洁工作台','header.cleaner.sub':'查看绑定房源的今日保洁、未来保洁、历史保洁和事项。',
      'header.cleaner.ownerTitle':'{name} · 保洁任务查看','header.cleaner.ownerSub':'房东查看当前房源范围内的保洁任务和历史记录。',
      'profile.title':'用户设置','profile.sub':'查看当前登录账号资料；可修改对外显示名、默认时区和语言。',
      'profile.displayName':'对外显示名','profile.timezone':'个人默认时区','profile.language':'界面语言','profile.username':'用户名','profile.email':'邮箱','profile.phone':'手机号','profile.wechat':'微信号','profile.cleanerCode':'保洁编号','profile.role':'账号类型','profile.save':'保存用户设置','profile.saving':'保存中...','profile.saved':'已保存','profile.saveFailed':'保存用户设置失败：','profile.required':'对外显示名不能为空。',
      'ops.title':'运营中心','ops.sub':'集中查看维护、耗材、费用、客人档案、渠道健康和操作记录。当前跟随上方房源/房间范围。',
      'ops.dashboard':'总览','ops.maintenance':'维护','ops.inventory':'耗材','ops.expenses':'费用','ops.guests':'客人','ops.channels':'渠道健康','ops.audit':'日志',
      'ops.properties':'房源','ops.openMaintenance':'待处理维护','ops.lowStock':'低库存耗材','ops.monthExpenses':'本月费用','ops.guestProfiles':'客人档案','ops.channelCount':'渠道数',
      'ops.noMaintenance':'暂无待处理维护。','ops.noLowStock':'暂无低库存提醒。','ops.noChannelErrors':'暂无渠道异常。','ops.maintenanceTitle':'维护工单','ops.maintenanceList':'维护列表','ops.inventoryTitle':'耗材库存','ops.inventoryList':'耗材列表','ops.expenseTitle':'费用账本','ops.expenseList':'费用记录','ops.guestTitle':'客人档案','ops.guestList':'客人列表','ops.channelHealthTitle':'渠道 / iCal 健康','ops.auditTitle':'操作日志',
      'common.property':'房源','common.room':'房间','common.category':'分类','common.priority':'优先级','common.dueDate':'到期日','common.title':'标题','common.note':'备注','common.add':'新增','common.delete':'删除','common.done':'完成','common.inProgress':'处理中','common.pending':'待处理','common.normal':'普通','common.urgent':'紧急','common.low':'低','common.date':'日期','common.amount':'金额','common.vendor':'商家','common.name':'姓名','common.phone':'电话','common.source':'来源','common.tags':'标签','common.time':'时间','common.actor':'人员','common.action':'动作','common.content':'内容','common.noRoom':'不指定房间','common.statusDone':'已完成','common.statusNormal':'正常','common.statusLowStock':'低库存','common.synced':'已同步','common.syncFailed':'同步失败','common.notSynced':'未同步',
      'owner.tab.daily':'指定日期工作表','owner.tab.calendar':'未来预订','owner.tab.cleaning':'保洁管理','owner.tab.rooms':'房间/公区设置',
      'owner.property.title':'房源管理','owner.property.sub':'勾选房源后，下面所有工作表、预订、保洁、事项和房间筛选都会按这个范围显示。','owner.property.selected':'已选 {selected}/{total} 个房源','owner.property.all':'全部房源','owner.property.add':'添加房源','owner.property.prefix':'房源:','owner.property.rooms':'{count} 个房间','owner.property.areas':'{count} 个公区','owner.property.cleaners':'{count} 个保洁绑定','owner.property.select':'选择','owner.property.edit':'修改房源资料','owner.property.openRooms':'进入房间管理','owner.property.only':'只看这个房源','owner.property.delete':'删除房源','owner.property.mail':'邮件提醒 {count}','owner.property.empty':'还没有房源。点“添加房源”开始配置。','owner.property.name':'房源名称','owner.property.city':'城市','owner.property.address':'地址','owner.property.timezone':'房源时区','owner.property.save':'保存房源资料','owner.property.cancel':'取消',
      'owner.scope.title':'房间范围','owner.scope.sub':'先在上面勾房源，再在这里勾房间；点“保存默认”后，下次刷新或重新进入会直接按这些房间显示。','owner.scope.selected':'已选 {selected}/{total} 个房间','owner.scope.default':'默认 {count} 个','owner.scope.saveDefault':'保存默认','owner.scope.allRooms':'全部房间','owner.scope.only':'只看','owner.scope.empty':'当前房源没有房间。',
      'owner.metric.futureOrders':'未来订单','owner.metric.futureNights':'未来占用晚数','owner.metric.todayCleaning':'今日实际保洁','owner.metric.todayNotes':'今日事项',
      'owner.daily.title':'指定日期工作表','owner.daily.date':'日期：','owner.daily.today':'今天','owner.daily.next':'下一天','owner.daily.prev':'上一天',
      'owner.daily.checkout':'退房','owner.daily.checkin':'入住','owner.daily.stay':'剩余在住','owner.daily.vacant':'空房','owner.daily.blocked':'不开放锁定','owner.daily.cleaningTasks':'保洁任务','owner.daily.checkoutLine':'退房：{checkout} ｜ 入住：{checkin}','owner.daily.stayLine':'还剩 {days} 天退房 ｜ 退房：{checkout}','owner.daily.orderLine':'订单：{checkin} → {checkout}','owner.daily.guest':'客人：{guest}','owner.daily.emptyNight':'当晚没有入住、在住或锁定记录。','owner.daily.noVacant':'暂无空房','owner.daily.none':'暂无','owner.daily.reason':'原因：{reason}','owner.daily.pendingTitle':'待房东确认','owner.daily.pendingSub':'这些是订单消失后的确认提醒，不是已经派给保洁的正式任务；确认需要保洁后才会进入保洁端。','owner.daily.cleaningTitle':'当天保洁任务','owner.daily.cleaningSub':'这里和保洁端使用同一套正式任务列表。','owner.daily.notesTitle':'当天事项','owner.daily.dateNote':'日期事项','owner.daily.noNotes':'暂无事项',
      'cleaning.pendingConfirm':'待确认','cleaning.incompleteNoPay':'任务未完成，暂不结算','cleaning.donePayable':'已完成，可结算','cleaning.ownerConfirmCheckout':'房东确认退房保洁','cleaning.commonDaily':'公区每日保洁','cleaning.checkoutBasic':'退房基础保洁','cleaning.task':'保洁任务','cleaning.done':'已完成','cleaning.pending':'待完成','cleaning.notDue':'未到日期','cleaning.deferNextCheckout':'下次退房再做','cleaning.deferNext':'下次做','cleaning.photo':'照片','cleaning.photoN':'照片 {count}','cleaning.camera':'拍照','cleaning.uploadMany':'上传多张','cleaning.photoLink':'照片{count}','cleaning.notUploaded':'未上传','cleaning.expires7':'7天后自动删除','cleaning.followTasks':'按下方任务逐项完成。','cleaning.record':'保洁记录','cleaning.noItemConfirm':'无需逐项确认','cleaning.date':'日期：{date}','cleaning.noRecords':'暂无记录','cleaning.history':'历史记录','cleaning.progress':'{done}/{total} 已完成','cleaning.uploading':'上传中 {done}/{total}...','cleaning.uploaded':'已上传 {count} 张','cleaning.uploadFailedPartial':'已上传 {done}/{total} 张，失败：{message}','cleaning.uploadPhotoFailed':'上传照片失败：{message}',
      'owner.calendar.title':'未来房态总览','owner.calendar.sub':'默认未来 14 天，可切换 28 天，也可指定日期范围：','owner.calendar.range14':'未来14天','owner.calendar.range28':'未来28天','owner.calendar.vacancyOnly':'只看空房','owner.calendar.showAll':'显示全部房态','owner.calendar.vacancySummary':'只标空晚 · {visible}/{total} 个房间','owner.calendar.noVacancy':'当前日期范围没有空房','owner.calendar.noRooms':'当前房源没有房间','owner.calendar.roomDate':'房间 / 日期','owner.calendar.emptyNight':'空','owner.calendar.emptyNightTitle':'当晚空房','owner.calendar.note':'事项','owner.calendar.noteTitle':'有房东日期事项','owner.calendar.blocked':'不开放锁定','owner.calendar.stats':'{range}每个房间预订统计','owner.calendar.currentStats':'当前区间每个房间预订统计','owner.calendar.bookings':'{range}预订列表','owner.calendar.currentBookings':'当前区间预订列表','owner.calendar.platformAll':'全部平台','owner.calendar.direct':'微信直订',
      'owner.table.property':'房源','owner.table.room':'房间','owner.table.orders':'订单数','owner.table.orderNights':'订单晚数','owner.table.lockNights':'不开放锁定晚数','owner.table.availableNights':'可订晚数','owner.table.occupancy':'预订率','owner.table.cleaningFee':'单次保洁费','owner.table.noRooms':'当前筛选没有房间','owner.table.checkin':'入住/开始','owner.table.checkout':'退房/结束','owner.table.source':'来源','owner.table.guest':'客人','owner.table.status':'状态','owner.table.dateNotes':'日期事项','owner.table.noBookings':'当前日期范围没有预订'
    },
    'en-US': {
      'nav.cleaner':'Cleaner','nav.owner':'Owner','nav.finance':'Finance','nav.access':'Subaccounts','nav.ops':'Operations','nav.profile':'User settings','nav.logout':'Log out',
      'pref.timezone':'Time zone','pref.language':'Language',
      'role.admin':'Admin','role.owner':'Owner','role.cleaner':'Cleaner','role.unknown':'Unknown',
      'header.owner.title':'{name} · Owner dashboard','header.owner.sub':'Manage properties, rooms, common areas, iCal sync, and cleaner bindings.',
      'header.cleaner.title':'{name} · Cleaner workspace','header.cleaner.sub':'View today, upcoming, and historical cleaning tasks and notes for bound properties.',
      'header.cleaner.ownerTitle':'{name} · Cleaning task view','header.cleaner.ownerSub':'Owner view of cleaning tasks and history for the selected property scope.',
      'profile.title':'User settings','profile.sub':'View account details and update display name, default time zone, and language.',
      'profile.displayName':'Display name','profile.timezone':'Default time zone','profile.language':'Interface language','profile.username':'Username','profile.email':'Email','profile.phone':'Phone','profile.wechat':'WeChat','profile.cleanerCode':'Cleaner code','profile.role':'Account type','profile.save':'Save settings','profile.saving':'Saving...','profile.saved':'Saved','profile.saveFailed':'Failed to save settings: ','profile.required':'Display name is required.',
      'ops.title':'Operations','ops.sub':'Track maintenance, supplies, expenses, guest profiles, channel health, and activity logs. Uses the selected property and room scope.',
      'ops.dashboard':'Overview','ops.maintenance':'Maintenance','ops.inventory':'Supplies','ops.expenses':'Expenses','ops.guests':'Guests','ops.channels':'Channel health','ops.audit':'Log',
      'ops.properties':'Properties','ops.openMaintenance':'Open maintenance','ops.lowStock':'Low stock','ops.monthExpenses':'This month','ops.guestProfiles':'Guest profiles','ops.channelCount':'Channels',
      'ops.noMaintenance':'No open maintenance.','ops.noLowStock':'No low-stock alerts.','ops.noChannelErrors':'No channel errors.','ops.maintenanceTitle':'Maintenance tickets','ops.maintenanceList':'Maintenance list','ops.inventoryTitle':'Supply inventory','ops.inventoryList':'Supply list','ops.expenseTitle':'Expense ledger','ops.expenseList':'Expense records','ops.guestTitle':'Guest profiles','ops.guestList':'Guest list','ops.channelHealthTitle':'Channel / iCal health','ops.auditTitle':'Activity log',
      'common.property':'Property','common.room':'Room','common.category':'Category','common.priority':'Priority','common.dueDate':'Due date','common.title':'Title','common.note':'Note','common.add':'Add','common.delete':'Delete','common.done':'Done','common.inProgress':'In progress','common.pending':'Pending','common.normal':'Normal','common.urgent':'Urgent','common.low':'Low','common.date':'Date','common.amount':'Amount','common.vendor':'Vendor','common.name':'Name','common.phone':'Phone','common.source':'Source','common.tags':'Tags','common.time':'Time','common.actor':'User','common.action':'Action','common.content':'Content','common.noRoom':'No room','common.statusDone':'Done','common.statusNormal':'Normal','common.statusLowStock':'Low stock','common.synced':'Synced','common.syncFailed':'Sync failed','common.notSynced':'Not synced',
      'owner.tab.daily':'Work sheet','owner.tab.calendar':'Reservations','owner.tab.cleaning':'Cleaning / notes','owner.tab.rooms':'Rooms / areas',
      'owner.property.title':'Property management','owner.property.sub':'After selecting properties, all worksheets, reservations, cleaning tasks, notes, and room filters below follow this scope.','owner.property.selected':'Selected {selected}/{total} properties','owner.property.all':'All properties','owner.property.add':'Add property','owner.property.prefix':'Property: ','owner.property.rooms':'{count} rooms','owner.property.areas':'{count} common areas','owner.property.cleaners':'{count} cleaner bindings','owner.property.select':'Select','owner.property.edit':'Edit property','owner.property.openRooms':'Manage rooms','owner.property.only':'Only this property','owner.property.delete':'Delete property','owner.property.mail':'Mail alerts {count}','owner.property.empty':'No properties yet. Click “Add property” to start.','owner.property.name':'Property name','owner.property.city':'City','owner.property.address':'Address','owner.property.timezone':'Property time zone','owner.property.save':'Save property','owner.property.cancel':'Cancel',
      'owner.scope.title':'Room scope','owner.scope.sub':'Select properties above, then select rooms here. After saving defaults, refreshes and new visits use these rooms automatically.','owner.scope.selected':'Selected {selected}/{total} rooms','owner.scope.default':'Default {count}','owner.scope.saveDefault':'Save default','owner.scope.allRooms':'All rooms','owner.scope.only':'Only','owner.scope.empty':'No rooms in the current property scope.',
      'owner.metric.futureOrders':'Future orders','owner.metric.futureNights':'Future occupied nights','owner.metric.todayCleaning':'Today cleaning','owner.metric.todayNotes':'Today notes',
      'owner.daily.title':'Work sheet','owner.daily.date':'Date:','owner.daily.today':'Today','owner.daily.next':'Next day','owner.daily.prev':'Previous day',
      'owner.daily.checkout':'Check-outs','owner.daily.checkin':'Check-ins','owner.daily.stay':'Still occupied','owner.daily.vacant':'Vacant','owner.daily.blocked':'Blocked','owner.daily.cleaningTasks':'Cleaning tasks','owner.daily.checkoutLine':'Check-out: {checkout} | Check-in: {checkin}','owner.daily.stayLine':'{days} days until check-out | Check-out: {checkout}','owner.daily.orderLine':'Booking: {checkin} -> {checkout}','owner.daily.guest':'Guest: {guest}','owner.daily.emptyNight':'No check-in, stay, or block for this night.','owner.daily.noVacant':'No vacant rooms','owner.daily.none':'None','owner.daily.reason':'Reason: {reason}','owner.daily.pendingTitle':'Needs owner confirmation','owner.daily.pendingSub':'These are confirmation alerts after a booking disappeared. They are not official cleaner tasks until the owner confirms cleaning is needed.','owner.daily.cleaningTitle':'Today cleaning tasks','owner.daily.cleaningSub':'This uses the same official task list as the cleaner workspace.','owner.daily.notesTitle':'Today notes','owner.daily.dateNote':'Date note','owner.daily.noNotes':'No notes',
      'cleaning.pendingConfirm':'Pending confirmation','cleaning.incompleteNoPay':'Tasks incomplete, not payable yet','cleaning.donePayable':'Completed, payable','cleaning.ownerConfirmCheckout':'Owner-confirmed turnover cleaning','cleaning.commonDaily':'Daily common-area cleaning','cleaning.checkoutBasic':'Turnover cleaning','cleaning.task':'Cleaning task','cleaning.done':'Done','cleaning.pending':'Pending','cleaning.notDue':'Not due','cleaning.deferNextCheckout':'Move to next checkout','cleaning.deferNext':'Next time','cleaning.photo':'Photos','cleaning.photoN':'Photos {count}','cleaning.camera':'Camera','cleaning.uploadMany':'Upload photos','cleaning.photoLink':'Photo {count}','cleaning.notUploaded':'Not uploaded','cleaning.expires7':'Auto-deletes after 7 days','cleaning.followTasks':'Complete each task below.','cleaning.record':'Cleaning record','cleaning.noItemConfirm':'No item confirmation required','cleaning.date':'Date: {date}','cleaning.noRecords':'No records','cleaning.history':'History','cleaning.progress':'{done}/{total} done','cleaning.uploading':'Uploading {done}/{total}...','cleaning.uploaded':'Uploaded {count} photos','cleaning.uploadFailedPartial':'Uploaded {done}/{total}; failed: {message}','cleaning.uploadPhotoFailed':'Photo upload failed: {message}',
      'owner.calendar.title':'Future calendar','owner.calendar.sub':'Default 14 days. Switch to 28 days or choose a custom range:','owner.calendar.range14':'Next 14 days','owner.calendar.range28':'Next 28 days','owner.calendar.vacancyOnly':'Vacant only','owner.calendar.showAll':'Show all status','owner.calendar.vacancySummary':'Vacant nights only · {visible}/{total} rooms','owner.calendar.noVacancy':'No vacant rooms in this date range','owner.calendar.noRooms':'No rooms in the current property scope','owner.calendar.roomDate':'Room / date','owner.calendar.emptyNight':'Open','owner.calendar.emptyNightTitle':'Open for the night','owner.calendar.note':'Note','owner.calendar.noteTitle':'Owner date note','owner.calendar.blocked':'Blocked','owner.calendar.stats':'{range} reservation stats by room','owner.calendar.currentStats':'Current range reservation stats by room','owner.calendar.bookings':'{range} reservation list','owner.calendar.currentBookings':'Current range reservation list','owner.calendar.platformAll':'All platforms','owner.calendar.direct':'Direct booking',
      'owner.table.property':'Property','owner.table.room':'Room','owner.table.orders':'Orders','owner.table.orderNights':'Booked nights','owner.table.lockNights':'Blocked nights','owner.table.availableNights':'Available nights','owner.table.occupancy':'Occupancy','owner.table.cleaningFee':'Cleaning fee','owner.table.noRooms':'No rooms match the current filter','owner.table.checkin':'Check-in / start','owner.table.checkout':'Check-out / end','owner.table.source':'Source','owner.table.guest':'Guest','owner.table.status':'Status','owner.table.dateNotes':'Date notes','owner.table.noBookings':'No reservations in this date range'
    },
    'es-ES': {
      'nav.cleaner':'Limpieza','nav.owner':'Propietario','nav.finance':'Finanzas','nav.access':'Subcuentas','nav.ops':'Operaciones','nav.profile':'Usuario','nav.logout':'Salir',
      'pref.timezone':'Zona horaria','pref.language':'Idioma',
      'role.admin':'Administrador','role.owner':'Propietario','role.cleaner':'Limpieza','role.unknown':'Desconocido',
      'header.owner.title':'{name} · Panel del propietario','header.owner.sub':'Gestiona propiedades, habitaciones, áreas comunes, iCal y limpieza.',
      'header.cleaner.title':'{name} · Panel de limpieza','header.cleaner.sub':'Ver tareas de limpieza de hoy, próximas, historial y notas.',
      'header.cleaner.ownerTitle':'{name} · Vista de limpieza','header.cleaner.ownerSub':'Vista del propietario para tareas e historial de limpieza.',
      'profile.title':'Configuración de usuario','profile.sub':'Ver cuenta y cambiar nombre público, zona horaria e idioma.',
      'profile.displayName':'Nombre visible','profile.timezone':'Zona horaria','profile.language':'Idioma','profile.username':'Usuario','profile.email':'Correo','profile.phone':'Teléfono','profile.wechat':'WeChat','profile.cleanerCode':'Código de limpieza','profile.role':'Tipo de cuenta','profile.save':'Guardar','profile.saving':'Guardando...','profile.saved':'Guardado','profile.saveFailed':'No se pudo guardar: ','profile.required':'El nombre visible es obligatorio.',
      'ops.title':'Operaciones','ops.sub':'Seguimiento de mantenimiento, insumos, gastos, huéspedes, canales y registros.',
      'ops.dashboard':'Resumen','ops.maintenance':'Mantenimiento','ops.inventory':'Insumos','ops.expenses':'Gastos','ops.guests':'Huéspedes','ops.channels':'Canales','ops.audit':'Registro',
      'ops.properties':'Propiedades','ops.openMaintenance':'Mantenimiento abierto','ops.lowStock':'Stock bajo','ops.monthExpenses':'Este mes','ops.guestProfiles':'Huéspedes','ops.channelCount':'Canales',
      'ops.noMaintenance':'No hay mantenimiento abierto.','ops.noLowStock':'No hay alertas de stock.','ops.noChannelErrors':'No hay errores de canal.','ops.maintenanceTitle':'Tickets de mantenimiento','ops.maintenanceList':'Lista de mantenimiento','ops.inventoryTitle':'Inventario','ops.inventoryList':'Lista de insumos','ops.expenseTitle':'Gastos','ops.expenseList':'Registros de gastos','ops.guestTitle':'Huéspedes','ops.guestList':'Lista de huéspedes','ops.channelHealthTitle':'Estado de canales / iCal','ops.auditTitle':'Registro de actividad',
      'common.property':'Propiedad','common.room':'Habitación','common.category':'Categoría','common.priority':'Prioridad','common.dueDate':'Vence','common.title':'Título','common.note':'Nota','common.add':'Agregar','common.delete':'Eliminar','common.done':'Completar','common.inProgress':'En proceso','common.pending':'Pendiente','common.normal':'Normal','common.urgent':'Urgente','common.low':'Baja','common.date':'Fecha','common.amount':'Monto','common.vendor':'Proveedor','common.name':'Nombre','common.phone':'Teléfono','common.source':'Fuente','common.tags':'Etiquetas','common.time':'Hora','common.actor':'Usuario','common.action':'Acción','common.content':'Contenido','common.noRoom':'Sin habitación','common.statusDone':'Completado','common.statusNormal':'Normal','common.statusLowStock':'Stock bajo','common.synced':'Sincronizado','common.syncFailed':'Error de sync','common.notSynced':'Sin sync',
      'owner.tab.daily':'Hoja diaria','owner.tab.calendar':'Reservas','owner.tab.cleaning':'Limpieza / notas','owner.tab.rooms':'Habitaciones / áreas',
      'owner.property.title':'Gestión de propiedades','owner.property.sub':'Después de seleccionar propiedades, las hojas, reservas, limpiezas, notas y filtros de habitaciones usan este alcance.','owner.property.selected':'Seleccionadas {selected}/{total} propiedades','owner.property.all':'Todas','owner.property.add':'Agregar propiedad','owner.property.prefix':'Propiedad: ','owner.property.rooms':'{count} habitaciones','owner.property.areas':'{count} áreas comunes','owner.property.cleaners':'{count} vínculos de limpieza','owner.property.select':'Seleccionar','owner.property.edit':'Editar propiedad','owner.property.openRooms':'Gestionar habitaciones','owner.property.only':'Solo esta propiedad','owner.property.delete':'Eliminar propiedad','owner.property.mail':'Alertas correo {count}','owner.property.empty':'No hay propiedades. Haz clic en “Agregar propiedad”.','owner.property.name':'Nombre','owner.property.city':'Ciudad','owner.property.address':'Dirección','owner.property.timezone':'Zona horaria','owner.property.save':'Guardar propiedad','owner.property.cancel':'Cancelar',
      'owner.scope.title':'Alcance de habitaciones','owner.scope.sub':'Selecciona propiedades arriba y habitaciones aquí. Al guardar, se usarán por defecto.','owner.scope.selected':'Seleccionadas {selected}/{total} habitaciones','owner.scope.default':'Predeterminado {count}','owner.scope.saveDefault':'Guardar defecto','owner.scope.allRooms':'Todas las habitaciones','owner.scope.only':'Solo','owner.scope.empty':'No hay habitaciones en este alcance.',
      'owner.metric.futureOrders':'Pedidos futuros','owner.metric.futureNights':'Noches ocupadas','owner.metric.todayCleaning':'Limpieza hoy','owner.metric.todayNotes':'Notas hoy',
      'owner.daily.title':'Hoja diaria','owner.daily.date':'Fecha:','owner.daily.today':'Hoy','owner.daily.next':'Día siguiente','owner.daily.prev':'Día anterior',
      'owner.daily.checkout':'Salidas','owner.daily.checkin':'Entradas','owner.daily.stay':'Ocupadas','owner.daily.vacant':'Libres','owner.daily.blocked':'Bloqueadas','owner.daily.cleaningTasks':'Tareas limpieza','owner.daily.checkoutLine':'Salida: {checkout} | Entrada: {checkin}','owner.daily.stayLine':'Faltan {days} días para salida | Salida: {checkout}','owner.daily.orderLine':'Reserva: {checkin} -> {checkout}','owner.daily.guest':'Huésped: {guest}','owner.daily.emptyNight':'Sin entrada, estancia ni bloqueo esta noche.','owner.daily.noVacant':'No hay libres','owner.daily.none':'Ninguno','owner.daily.reason':'Motivo: {reason}','owner.daily.pendingTitle':'Requiere confirmación','owner.daily.pendingSub':'Alertas por reservas desaparecidas. No son tareas oficiales hasta que el propietario confirme.','owner.daily.cleaningTitle':'Tareas de limpieza de hoy','owner.daily.cleaningSub':'Usa la misma lista oficial que ve limpieza.','owner.daily.notesTitle':'Notas de hoy','owner.daily.dateNote':'Nota de fecha','owner.daily.noNotes':'Sin notas',
      'cleaning.pendingConfirm':'Pendiente','cleaning.incompleteNoPay':'Tareas incompletas, no pagable','cleaning.donePayable':'Completado, pagable','cleaning.ownerConfirmCheckout':'Limpieza de salida confirmada','cleaning.commonDaily':'Limpieza diaria de áreas comunes','cleaning.checkoutBasic':'Limpieza de salida','cleaning.task':'Tarea de limpieza','cleaning.done':'Hecho','cleaning.pending':'Pendiente','cleaning.notDue':'Aún no vence','cleaning.deferNextCheckout':'Mover a próxima salida','cleaning.deferNext':'Próxima vez','cleaning.photo':'Fotos','cleaning.photoN':'Fotos {count}','cleaning.camera':'Cámara','cleaning.uploadMany':'Subir fotos','cleaning.photoLink':'Foto {count}','cleaning.notUploaded':'Sin subir','cleaning.expires7':'Se borra en 7 días','cleaning.followTasks':'Completa cada tarea abajo.','cleaning.record':'Registro de limpieza','cleaning.noItemConfirm':'No requiere confirmación por ítem','cleaning.date':'Fecha: {date}','cleaning.noRecords':'Sin registros','cleaning.history':'Historial','cleaning.progress':'{done}/{total} hecho','cleaning.uploading':'Subiendo {done}/{total}...','cleaning.uploaded':'Subidas {count} fotos','cleaning.uploadFailedPartial':'Subidas {done}/{total}; error: {message}','cleaning.uploadPhotoFailed':'Error al subir foto: {message}',
      'owner.calendar.title':'Calendario futuro','owner.calendar.sub':'Predeterminado 14 días. Cambia a 28 días o elige rango:','owner.calendar.range14':'Próximos 14 días','owner.calendar.range28':'Próximos 28 días','owner.calendar.vacancyOnly':'Solo vacantes','owner.calendar.showAll':'Mostrar todo','owner.calendar.vacancySummary':'Solo noches libres · {visible}/{total} habitaciones','owner.calendar.noVacancy':'No hay vacantes en este rango','owner.calendar.noRooms':'No hay habitaciones en este alcance','owner.calendar.roomDate':'Habitación / fecha','owner.calendar.emptyNight':'Libre','owner.calendar.emptyNightTitle':'Libre esa noche','owner.calendar.note':'Nota','owner.calendar.noteTitle':'Nota del propietario','owner.calendar.blocked':'Bloqueado','owner.calendar.stats':'{range} estadísticas por habitación','owner.calendar.currentStats':'Estadísticas del rango por habitación','owner.calendar.bookings':'{range} lista de reservas','owner.calendar.currentBookings':'Lista de reservas del rango','owner.calendar.platformAll':'Todas las plataformas','owner.calendar.direct':'Reserva directa',
      'owner.table.property':'Propiedad','owner.table.room':'Habitación','owner.table.orders':'Pedidos','owner.table.orderNights':'Noches reservadas','owner.table.lockNights':'Noches bloqueadas','owner.table.availableNights':'Noches disponibles','owner.table.occupancy':'Ocupación','owner.table.cleaningFee':'Tarifa limpieza','owner.table.noRooms':'No hay habitaciones con este filtro','owner.table.checkin':'Entrada / inicio','owner.table.checkout':'Salida / fin','owner.table.source':'Fuente','owner.table.guest':'Huésped','owner.table.status':'Estado','owner.table.dateNotes':'Notas de fecha','owner.table.noBookings':'No hay reservas en este rango'
    }
  };

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function normalizeLanguage(value){
    const text = String(value || '').trim().toLowerCase();
    const map = {'zh':'zh-CN','zh-cn':'zh-CN','zh-hans':'zh-CN','cn':'zh-CN','en':'en-US','en-us':'en-US','es':'es-ES','es-es':'es-ES'};
    return map[text] || 'zh-CN';
  }
  function browserLanguage(){
    try{return navigator.language || '';}catch(e){return '';}
  }
  function currentLanguage(){
    const u = getCurrentUser ? (getCurrentUser() || {}) : {};
    const saved = u.language || u.locale || u.lang || (() => {try{return localStorage.getItem('pms_language') || '';}catch(e){return '';}})() || browserLanguage();
    return normalizeLanguage(saved);
  }
  function t(key, vars){
    const lang = currentLanguage();
    let text = (I18N[lang] && I18N[lang][key]) || (I18N['zh-CN'] && I18N['zh-CN'][key]) || key;
    Object.keys(vars || {}).forEach(name => {
      text = text.replace(new RegExp('\\{' + name + '\\}','g'), vars[name]);
    });
    return text;
  }
  const DATA_TEXT_TRANSLATIONS = {
    'en-US': {
      '系统退房自动生成':'System-generated checkout task',
      '房东确认退房保洁':'Owner-confirmed turnover cleaning',
      '订单消失待确认':'Booking disappeared, pending confirmation',
      '订单消失后的退房保洁待确认':'Turnover cleaning after a disappeared booking, pending confirmation',
      '公区每日保洁':'Daily common-area cleaning',
      '退房基础保洁':'Turnover cleaning',
      '周期任务':'Recurring task',
      '深度保洁':'Deep cleaning',
      '周期保洁任务':'Recurring cleaning task',
      '备注':'Note',
      '手动增加':'Manual add',
      '每次退房基础保洁':'Standard turnover cleaning',
      '厨卫深清和水垢检查':'Kitchen and bathroom deep clean / scale check',
      '房间厨房深清和水垢检查':'Room kitchen deep clean / scale check',
      '卫浴深清和水垢检查':'Bathroom deep clean / scale check',
      '耗材库存和布草检查':'Supplies and linen check',
      '窗户轨道/纱窗/窗台灰尘':'Window tracks / screens / sill dust',
      '床底沙发边角和踢脚线':'Under beds, sofa edges, and baseboards',
      '排水口/马桶异味维护':'Drain / toilet odor maintenance',
      '防虫巡检和必要处理':'Pest inspection and needed treatment',
      '空调滤网/通风口检查':'A/C filter and vent check',
      '床垫/沙发/枕芯保护层检查':'Mattress / sofa / pillow protector check',
      '窗帘百叶/灯具/高处灰尘':'Curtains, blinds, lights, and high dust',
      '垃圾清空、床品毛巾更换、独立卫生间清洁、地面吸尘拖地、高频接触点擦拭、补齐耗材、拍照记录异常。':'Trash removal, linens and towels changed, private bathroom cleaned, floors vacuumed/mopped, high-touch surfaces wiped, supplies replenished, and exceptions photographed.',
      '垃圾清空、床品毛巾更换、厨房台面和餐具检查、卫浴清洁、地面吸尘拖地、高频触摸点擦拭、补齐耗材、拍照记录异常。':'Trash removal, linens and towels changed, kitchen counters and dishes checked, bathroom cleaned, floors vacuumed/mopped, high-touch surfaces wiped, supplies replenished, and exceptions photographed.',
      '检查厨房油污、水槽、淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。':'Check kitchen grease, sink, shower glass, toilet edges, floor drains, and scale. Do it on lighter cleaning days.',
      '检查房间内厨房油污、水槽、台面、淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。':'Check in-room kitchen grease, sink, counter, shower glass, toilet edges, floor drains, and scale. Do it on lighter cleaning days.',
      '检查房间内厨房油污、水槽、台面和小厨房区域水垢；在当天保洁量少时补做。':'Check in-room kitchen grease, sink, counter, and kitchenette scale. Do it on lighter cleaning days.',
      '检查独立卫生间淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。':'Check private bathroom shower glass, toilet edges, floor drains, and scale. Do it on lighter cleaning days.',
      '检查纸巾、垃圾袋、洗手液、洗衣液、备用毛巾和用品；记录缺货。':'Check paper goods, trash bags, hand soap, laundry detergent, spare towels, and supplies. Record shortages.',
      '清理窗户轨道、窗台、纱窗表面灰尘；保洁量大时可顺延到下一次退房。':'Clean window tracks, sills, and screen dust. Can move to the next checkout when workload is heavy.',
      '吸尘床底、沙发边角、踢脚线、门后和柜角。':'Vacuum under beds, sofa edges, baseboards, behind doors, and cabinet corners.',
      '检查淋浴、洗手池、厨房水槽、马桶和地漏异味，按产品说明维护。':'Check odors from shower, sink, kitchen sink, toilet, and floor drains. Maintain according to product instructions.',
      '检查淋浴、洗手池、马桶和地漏异味；只使用适合管道的产品，并按产品说明操作。':'Check odors from shower, sink, toilet, and floor drains. Use only pipe-safe products and follow labels.',
      '检查食物残渣、垃圾、门窗缝、潮湿点和虫迹；优先清洁/封堵，确需用药时按标签说明处理。':'Check food residue, trash, door/window gaps, damp spots, and pest traces. Clean/seal first; use chemicals only as labeled when needed.',
      '检查空调滤网、回风口、排风扇和出风口积灰；需要更换时记录给房东确认。':'Check A/C filters, return vents, exhaust fans, and outlet dust. Record items that need owner approval.',
      '检查床垫保护套、枕芯、沙发垫、床架缝隙和可见污渍，必要时拍照反馈。':'Check mattress protectors, pillows, sofa cushions, bed-frame gaps, and visible stains. Photograph issues when needed.',
      '清理窗帘、百叶、灯具、风扇、高处置物架和装饰物积灰。':'Dust curtains, blinds, lights, fans, high shelves, and decor.',
      '其他公区每日清洁':'Other common-area daily cleaning',
      '共享厨房每日清洁':'Shared kitchen daily cleaning',
      '共享卫生间每日清洁':'Shared bathroom daily cleaning'
    },
    'es-ES': {
      '系统退房自动生成':'Tarea automática de salida',
      '房东确认退房保洁':'Limpieza de salida confirmada',
      '公区每日保洁':'Limpieza diaria de áreas comunes',
      '退房基础保洁':'Limpieza de salida',
      '周期任务':'Tarea recurrente',
      '深度保洁':'Limpieza profunda',
      '每次退房基础保洁':'Limpieza básica de salida'
    }
  };
  function displayDataText(value){
    const text = String(value == null ? '' : value);
    if(!text || currentLanguage() === 'zh-CN') return text;
    const map = DATA_TEXT_TRANSLATIONS[currentLanguage()] || DATA_TEXT_TRANSLATIONS['en-US'] || {};
    if(map[text]) return map[text];
    let out = text;
    Object.keys(map).sort((a,b) => b.length - a.length).forEach(src => {
      if(src && out.includes(src)) out = out.split(src).join(map[src]);
    });
    if(currentLanguage() !== 'zh-CN'){
      out = out.replace(/（(\d+) 个）/g, ' ($1)')
        .replace(/（(\d+)个）/g, ' ($1)')
        .replace(/：/g, ': ')
        .replace(/；/g, '; ')
        .replace(/，/g, ', ');
    }
    return out;
  }
  function languageOptions(selected){
    const current = normalizeLanguage(selected || currentLanguage());
    return LANGUAGES.map(row => `<option value="${esc(row[0])}" ${row[0] === current ? 'selected' : ''}>${esc(row[1])}</option>`).join('');
  }
  function saveLanguageLocal(lang){
    try{localStorage.setItem('pms_language', normalizeLanguage(lang));}catch(e){}
  }
  function safe(value){return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'x';}
  function qs(id){return document.getElementById(id);}
  function nowIso(){return new Date().toISOString().slice(0,19);}
  function apiUrl(path){
    if(typeof withKey === 'function') return withKey(path);
    const key = new URLSearchParams(location.search).get('key') || '';
    if(!key) return path;
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
  function upsertCleaningPhoto(photo){
    if(!photo || !photo.id) return;
    const rows = getPhotos().filter(p => p && String(p.id || '') !== String(photo.id || ''));
    rows.push(photo);
    setPhotos(rows);
  }
  function getMaintenanceTickets(){try{return Array.isArray(maintenanceTickets) ? maintenanceTickets : [];}catch(e){return window.maintenanceTickets || [];}}
  function setMaintenanceTickets(value){try{maintenanceTickets = value;}catch(e){} window.maintenanceTickets = value;}
  function getInventoryItems(){try{return Array.isArray(inventoryItems) ? inventoryItems : [];}catch(e){return window.inventoryItems || [];}}
  function setInventoryItems(value){try{inventoryItems = value;}catch(e){} window.inventoryItems = value;}
  function getExpenseRecords(){try{return Array.isArray(expenseRecords) ? expenseRecords : [];}catch(e){return window.expenseRecords || [];}}
  function setExpenseRecords(value){try{expenseRecords = value;}catch(e){} window.expenseRecords = value;}
  function getGuestProfiles(){try{return Array.isArray(guestProfiles) ? guestProfiles : [];}catch(e){return window.guestProfiles || [];}}
  function setGuestProfiles(value){try{guestProfiles = value;}catch(e){} window.guestProfiles = value;}
  function getAuditLog(){try{return Array.isArray(auditLog) ? auditLog : [];}catch(e){return window.auditLog || [];}}
  function setAuditLog(value){try{auditLog = value;}catch(e){} window.auditLog = value;}
  function getCurrentUser(){try{return currentUser || null;}catch(e){return window.currentUser || null;}}
  function setCurrentUser(value){try{currentUser = value;}catch(e){} window.currentUser = value;}
  function getLastSync(){try{return lastSync || '';}catch(e){return window.lastSync || '';}}
  function setLastSync(value){try{lastSync = value || '';}catch(e){} window.lastSync = value || '';}

  const DEFAULT_TIME_ZONE = 'America/Los_Angeles';
  const DEFAULT_PROPERTY_CITY = 'Los Angeles';
  const DEFAULT_PROPERTY_ADDRESS = 'Los Angeles, CA';
  const COMMON_TIME_ZONES = [
    ['America/Los_Angeles','洛杉矶 / Pacific'],
    ['America/New_York','纽约 / Eastern'],
    ['America/Chicago','芝加哥 / Central'],
    ['America/Denver','丹佛 / Mountain'],
    ['America/Phoenix','凤凰城'],
    ['Pacific/Honolulu','檀香山'],
    ['Asia/Shanghai','中国'],
    ['UTC','UTC']
  ];
  function validTimeZone(value){
    try{ new Intl.DateTimeFormat('en-US', {timeZone: value}).format(new Date()); return true; }
    catch(e){ return false; }
  }
  function browserTimeZone(){
    try{return Intl.DateTimeFormat().resolvedOptions().timeZone || '';}catch(e){return '';}
  }
  function normalizeTimeZone(value){
    const text = String(value || '').trim();
    return validTimeZone(text) ? text : DEFAULT_TIME_ZONE;
  }
  function userTimeZone(){
    const u = getCurrentUser() || {};
    const saved = u.timezone || u.time_zone || u.timeZone || (() => {try{return localStorage.getItem('pms_timezone') || '';}catch(e){return '';}})() || browserTimeZone();
    return normalizeTimeZone(saved);
  }
  function propertyTimeZone(propOrId){
    const prop = typeof propOrId === 'object' && propOrId ? propOrId : getProperties().find(p => String(p.id) === String(propOrId));
    return normalizeTimeZone(prop && (prop.timezone || prop.time_zone || prop.timeZone || prop.iana_timezone));
  }
  function activeTimeZone(){
    try{
      if(ui.selectedPropertyId) return propertyTimeZone(ui.selectedPropertyId);
      if(typeof ownerPropIds === 'function'){
        const ids = ownerPropIds();
        if(ids.length === 1) return propertyTimeZone(ids[0]);
      }
      if(typeof cleanerBoundProperties === 'function'){
        const props = cleanerBoundProperties();
        if(props.length === 1) return propertyTimeZone(props[0]);
      }
    }catch(e){}
    return userTimeZone();
  }
  function localDateString(dateValue, timeZone){
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normalizeTimeZone(timeZone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).reduce((out, part) => {out[part.type] = part.value; return out;}, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function today(timeZone){
    return localDateString(new Date(), timeZone || activeTimeZone());
  }
  try{Object.defineProperty(window, 'TODAY', {configurable:true, get:function(){return today();}});}catch(e){window.TODAY = today();}
  function parseDate(value){
    const parts = String(value || '').slice(0,10).split('-').map(Number);
    return new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
  }
  function normalizeDateInputValue(value){
    const text = String(value || '').trim().replace(/\//g, '-');
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(!match) return '';
    return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
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

  const CLEANING_TASK_PRESETS = [
    {id:'checkout_turnover_standard', title:'每次退房基础保洁', category:'基础/退房', target:'room', schedule:'daily', weekday:1, interval:1, flex:0, amount:0, attach:true, note:'垃圾清空、床品毛巾更换、厨房台面和餐具检查、卫浴清洁、地面吸尘拖地、高频触摸点擦拭、补齐耗材、拍照记录异常。'},
    {id:'weekly_trash_bins', title:'每周垃圾桶推出/收回', category:'外部/垃圾', target:'common', schedule:'weekly', weekday:4, interval:7, flex:0, amount:0, note:'按当地垃圾日，把垃圾桶推出到指定位置；垃圾车收走后再收回。'},
    {id:'weekly_kitchen_bath_detail', title:'厨卫深清和水垢检查', category:'厨卫', target:'room', schedule:'weekly', weekday:2, interval:7, flex:1, amount:0, note:'检查厨房油污、水槽、淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。'},
    {id:'weekly_supply_audit', title:'耗材库存和布草检查', category:'补给/布草', target:'room', schedule:'weekly', weekday:3, interval:7, flex:1, amount:0, note:'检查厕纸、纸巾、垃圾袋、洗手液、洗衣液、备用毛巾和床品，记录缺货。'},
    {id:'biweekly_window_tracks_screens', title:'窗户轨道/纱窗/窗台灰尘', category:'窗户/灰尘', target:'room', schedule:'interval', weekday:1, interval:14, flex:3, amount:0, note:'清理窗户轨道、窗台、纱窗表面灰尘；如当天退房多，可自动提前或延后到轻松日期。'},
    {id:'biweekly_under_furniture_edges', title:'床底沙发边角和踢脚线', category:'地面/边角', target:'room', schedule:'interval', weekday:1, interval:14, flex:3, amount:0, note:'吸尘床底、沙发边角、踢脚线、门后和柜角，避免长期积灰。'},
    {id:'monthly_drain_deodorize', title:'排水口/马桶异味维护', category:'排水/卫浴', target:'room', schedule:'interval', weekday:1, interval:30, flex:7, amount:0, note:'检查浴缸、洗手池、厨房水槽、马桶和地漏异味；只使用适合管道的产品，并按产品说明操作。'},
    {id:'monthly_pest_ipm_check', title:'防虫巡检和必要处理', category:'防虫', target:'room', schedule:'interval', weekday:1, interval:30, flex:7, amount:0, note:'检查食物残渣、垃圾、门窗缝、潮湿点和虫迹；优先清洁/封堵，确需用药时按标签说明处理。'},
    {id:'monthly_appliance_detail', title:'家电细节清洁', category:'家电', target:'room', schedule:'interval', weekday:1, interval:30, flex:7, amount:0, note:'微波炉、烤箱、冰箱抽屉、洗衣机胶圈/滤网、咖啡机、遥控器和小家电外观深清。'},
    {id:'monthly_air_filter_vents', title:'空调滤网/通风口检查', category:'通风', target:'room', schedule:'interval', weekday:1, interval:30, flex:7, amount:0, note:'检查空调滤网、回风口、排风扇和出风口积灰；需要更换时记录给房东确认。'},
    {id:'quarterly_mattress_sofa', title:'床垫/沙发/枕芯保护层检查', category:'布草/家具', target:'room', schedule:'interval', weekday:1, interval:90, flex:14, amount:0, note:'检查床垫保护套、枕芯、沙发垫、床架缝隙和可见污渍，必要时拍照反馈。'},
    {id:'quarterly_curtains_blinds', title:'窗帘百叶/灯具/高处灰尘', category:'高处/软装', target:'room', schedule:'interval', weekday:1, interval:90, flex:14, amount:0, note:'清理窗帘、百叶、灯具、风扇、高处置物架和装饰物积灰。'}
  ];

  const DEFAULT_ROOM_TASK_PRESET_IDS = [
    'checkout_turnover_standard',
    'weekly_kitchen_bath_detail',
    'weekly_supply_audit',
    'biweekly_window_tracks_screens',
    'biweekly_under_furniture_edges',
    'monthly_drain_deodorize',
    'monthly_pest_ipm_check',
    'monthly_appliance_detail',
    'monthly_air_filter_vents',
    'quarterly_mattress_sofa',
    'quarterly_curtains_blinds'
  ];

  const ROOM_APPLIANCE_OPTIONS = [
    ['microwave', '微波炉'],
    ['oven', '烤箱'],
    ['fridge', '冰箱'],
    ['washer', '洗衣机'],
    ['dryer', '烘干机'],
    ['coffee_maker', '咖啡机'],
    ['tv', '电视'],
    ['ac', '空调']
  ];

  const OWNER_PERMISSION_DEFS = [
    ['calendar_view', '房态/订单查看'],
    ['cleaning_manage', '保洁管理'],
    ['settings_manage', '房间/iCal/房源设置'],
    ['finance_view', '查看财务'],
    ['finance_edit', '编辑财务'],
    ['ops_manage', '运营中心'],
    ['users_manage', '子账号权限']
  ];

  const CLEANING_GUIDANCE_GROUPS = [
    ['每次退房/当天基础', ['垃圾清空', '床品毛巾更换', '厨房台面和餐具检查', '卫浴清洁', '地面吸尘拖地', '高频触摸点擦拭', '补齐耗材', '拍照记录异常']],
    ['每周/轻度深清', ['厨卫水垢和油污', '垃圾桶推出/收回', '冰箱过期物检查', '布草耗材盘点', '门口/阳台/走廊检查', '遥控器和小家电擦拭']],
    ['约每 14 天', ['窗户轨道和纱窗灰尘', '床底/沙发边角', '踢脚线和门后', '排水口异味检查', '柜内抽屉快速检查']],
    ['约每 30 天', ['排水口/马桶维护', '防虫巡检和必要处理', '家电内部细节', '空调滤网/通风口', '床垫保护套和沙发垫检查']],
    ['约每 60-90 天', ['窗帘百叶', '灯具和高处灰尘', '床垫/枕芯/沙发深度检查', '储物柜整理', '墙角霉点和潮湿点排查']]
  ];

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
  function currentPermissions(){
    const u = getCurrentUser() || {};
    return (u.permissions && typeof u.permissions === 'object') ? u.permissions : null;
  }
  function canPermission(key){
    if(role() === 'admin') return true;
    if(role() !== 'owner') return false;
    const permissions = currentPermissions();
    if(!permissions || !Object.keys(permissions).length) return true;
    return !!permissions[key];
  }
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
    props.push({id, group_id: groupId(), name: '默认房源', city: DEFAULT_PROPERTY_CITY, address: DEFAULT_PROPERTY_ADDRESS, timezone: DEFAULT_TIME_ZONE, time_zone: DEFAULT_TIME_ZONE, created_at: nowIso()});
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
  function timeZoneOptions(selected){
    const current = normalizeTimeZone(selected || userTimeZone());
    const rows = COMMON_TIME_ZONES.slice();
    if(!rows.some(row => row[0] === current)) rows.unshift([current, current]);
    return rows.map(row => `<option value="${esc(row[0])}" ${row[0] === current ? 'selected' : ''}>${esc(row[1])} · ${esc(row[0])}</option>`).join('');
  }
  function propertyCity(prop){
    return String((prop && (prop.city || prop.location_city || prop.locality)) || DEFAULT_PROPERTY_CITY).trim();
  }
  function propertyAddress(prop){
    return String((prop && (prop.address || prop.location || prop.full_address)) || DEFAULT_PROPERTY_ADDRESS).trim();
  }
  function propertyLocationText(prop){
    const city = propertyCity(prop);
    const address = propertyAddress(prop);
    return address && address !== city ? `${city} · ${address}` : city;
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
  function roomBathroomType(roomOrId){
    const room = typeof roomOrId === 'object' && roomOrId ? roomOrId : getRooms().find(x => String(x.id) === String(roomOrId));
    const raw = String((room && (room.bathroom_type || room.bathroomType || room.bathroom)) || 'private').toLowerCase();
    if(['shared','common','public'].includes(raw)) return 'shared';
    if(['none','no','without'].includes(raw)) return 'none';
    return 'private';
  }
  function roomBathroomLabel(roomOrId){
    const value = roomBathroomType(roomOrId);
    if(value === 'shared') return '共享卫生间';
    if(value === 'none') return '无卫生间';
    return '独立卫生间';
  }
  function roomBathroomOptions(selected){
    const value = roomBathroomType({bathroom_type:selected || 'private'});
    return [
      ['private','独立卫生间'],
      ['shared','共享卫生间'],
      ['none','无卫生间']
    ].map(row => `<option value="${row[0]}" ${row[0] === value ? 'selected' : ''}>${row[1]}</option>`).join('');
  }
  function roomHasKitchen(roomOrId){
    const room = typeof roomOrId === 'object' && roomOrId ? roomOrId : getRooms().find(x => String(x.id) === String(roomOrId));
    if(!room) return false;
    if(Object.prototype.hasOwnProperty.call(room,'has_kitchen') || Object.prototype.hasOwnProperty.call(room,'hasKitchen')) return !!(room.has_kitchen || room.hasKitchen);
    const raw = String(room.kitchen_type || room.kitchenType || room.kitchen || '').toLowerCase();
    return ['private','yes','true','1','kitchen','kitchenette','private_kitchen'].includes(raw);
  }
  function roomKitchenLabel(roomOrId){return roomHasKitchen(roomOrId) ? '有房内厨房/小厨房' : '无房内厨房';}
  function readRoomHasKitchen(roomId){
    const el = qs('roomKitchen_' + safe(roomId));
    return !!(el && el.checked);
  }
  function roomAppliances(roomOrId){
    const room = typeof roomOrId === 'object' && roomOrId ? roomOrId : getRooms().find(x => String(x.id) === String(roomOrId));
    const raw = room && room.appliances;
    const rows = Array.isArray(raw) ? raw : (String(raw || '').trim() ? String(raw || '').split(/[,，\s]+/) : []);
    return Array.from(new Set(rows.map(x => String(x || '').trim()).filter(Boolean)));
  }
  function roomHasAppliances(roomOrId){return roomAppliances(roomOrId).length > 0;}
  function roomApplianceLabel(roomOrId){
    const selected = roomAppliances(roomOrId);
    if(!selected.length) return '无单独电器';
    const labels = selected.map(id => (ROOM_APPLIANCE_OPTIONS.find(row => row[0] === id) || [id,id])[1]);
    return labels.join('、');
  }
  function roomApplianceCheckboxes(room){
    const selected = new Set(roomAppliances(room));
    return `<div class="check-grid appliance-grid">${ROOM_APPLIANCE_OPTIONS.map(row => `<label><input type="checkbox" id="roomAppliance_${safe(room.id)}_${row[0]}" value="${row[0]}" ${selected.has(row[0]) ? 'checked' : ''}> ${row[1]}</label>`).join('')}</div>`;
  }
  function readRoomAppliances(roomId){
    return ROOM_APPLIANCE_OPTIONS.filter(row => qs('roomAppliance_' + safe(roomId) + '_' + row[0]) && qs('roomAppliance_' + safe(roomId) + '_' + row[0]).checked).map(row => row[0]);
  }
  function presetRequiresPrivateBathroom(presetId){
    return false;
  }
  function presetRequiresAppliances(presetId){
    return String(presetId || '') === 'monthly_appliance_detail';
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
  function commonAreaKind(area){
    const raw = String((area && (area.area_type || area.areaType || area.kind)) || 'general').toLowerCase();
    if(['shared_kitchen','kitchen','厨房'].includes(raw)) return 'shared_kitchen';
    if(['shared_bathroom','bathroom','卫生间','bath'].includes(raw)) return 'shared_bathroom';
    return 'general';
  }
  function commonAreaComponents(area){
    const kind = commonAreaKind(area);
    const legacyCount = commonAreaCount(area);
    const hasExplicit = area && ['has_kitchen','hasKitchen','has_bathroom','hasBathroom','has_general','hasGeneral'].some(key => Object.prototype.hasOwnProperty.call(area,key));
    const hasKitchen = hasExplicit ? !!(area.has_kitchen || area.hasKitchen) : kind === 'shared_kitchen';
    const hasBathroom = hasExplicit ? !!(area.has_bathroom || area.hasBathroom) : kind === 'shared_bathroom';
    let hasGeneral = hasExplicit ? !!(area.has_general || area.hasGeneral) : kind === 'general';
    if(!hasKitchen && !hasBathroom && !hasGeneral) hasGeneral = true;
    return {
      has_kitchen: hasKitchen,
      kitchen_count: Math.max(1, Number((area && (area.kitchen_count || area.kitchenCount)) || (hasKitchen ? legacyCount : 1)) || 1),
      has_bathroom: hasBathroom,
      bathroom_count: Math.max(1, Number((area && (area.bathroom_count || area.bathroomCount)) || (hasBathroom ? legacyCount : 1)) || 1),
      has_general: hasGeneral,
      general_count: Math.max(1, Number((area && (area.general_count || area.generalCount)) || (hasGeneral ? legacyCount : 1)) || 1),
      general_label: String((area && (area.general_label || area.generalLabel || area.other_label || area.otherLabel)) || '其他公区').trim() || '其他公区'
    };
  }
  function commonAreaKindLabel(area){
    const c = commonAreaComponents(area);
    const parts = [];
    if(c.has_kitchen) parts.push(currentLanguage() === 'zh-CN' ? `共享厨房 ${c.kitchen_count}` : `Shared kitchen ${c.kitchen_count}`);
    if(c.has_bathroom) parts.push(currentLanguage() === 'zh-CN' ? `共享卫生间 ${c.bathroom_count}` : `Shared bathroom ${c.bathroom_count}`);
    if(c.has_general) parts.push(`${c.general_label} ${c.general_count}`);
    return parts.length ? parts.join(' / ') : (currentLanguage() === 'zh-CN' ? '公区' : 'Common area');
  }
  function commonAreaCount(area){
    const n = Math.max(1, Number((area && (area.unit_count || area.unitCount || area.count)) || 1));
    return Number.isFinite(n) ? n : 1;
  }
  function commonAreaComponentControls(area){
    const c = commonAreaComponents(area);
    const id = safe(area.id);
    return `<div class="area-component-list"><label class="area-component-item"><span><input id="areaHasKitchen_${id}" type="checkbox" ${c.has_kitchen ? 'checked' : ''}> 共享厨房</span><input id="areaKitchenCount_${id}" type="number" min="1" step="1" value="${esc(c.kitchen_count)}"></label><label class="area-component-item"><span><input id="areaHasBathroom_${id}" type="checkbox" ${c.has_bathroom ? 'checked' : ''}> 共享卫生间</span><input id="areaBathroomCount_${id}" type="number" min="1" step="1" value="${esc(c.bathroom_count)}"></label><label class="area-component-item area-component-other"><span><input id="areaHasGeneral_${id}" type="checkbox" ${c.has_general ? 'checked' : ''}> 其他公区</span><input id="areaGeneralLabel_${id}" type="text" value="${esc(c.general_label)}" placeholder="名称"><input id="areaGeneralCount_${id}" type="number" min="1" step="1" value="${esc(c.general_count)}"></label></div>`;
  }
  function commonAreaReason(area){
    const c = commonAreaComponents(area);
    const parts = [];
    if(currentLanguage() === 'zh-CN'){
      if(c.has_kitchen) parts.push(`共享厨房每日清洁（${c.kitchen_count} 个）：台面、水槽、灶台、垃圾、地面和公共耗材`);
      if(c.has_bathroom) parts.push(`共享卫生间每日清洁（${c.bathroom_count} 个）：马桶、洗手台、镜面、淋浴区、地面、垃圾和耗材`);
      if(c.has_general) parts.push(`${c.general_label}每日清洁（${c.general_count} 个）：公共地面、垃圾、台面和公共用品`);
      return parts.join('；') + '。';
    }
    if(c.has_kitchen) parts.push(`Shared kitchen daily cleaning (${c.kitchen_count}): counters, sink, stove, trash, floors, and shared supplies`);
    if(c.has_bathroom) parts.push(`Shared bathroom daily cleaning (${c.bathroom_count}): toilet, sink, mirror, shower area, floors, trash, and supplies`);
    if(c.has_general) parts.push(`${c.general_label} daily cleaning (${c.general_count}): common floors, trash, counters, and shared items`);
    return parts.join('; ') + '.';
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
  function savedDefaultRoomIds(){
    const u = getCurrentUser() || {};
    const raw = Array.isArray(u.default_room_ids) ? u.default_room_ids : (Array.isArray(u.defaultRoomIds) ? u.defaultRoomIds : []);
    const valid = new Set(validOwnerRoomIds());
    return raw.map(String).filter(id => valid.has(id));
  }
  function applySavedDefaultRooms(force=false){
    if(ui.roomDefaultsApplied && !force) return;
    const defaults = savedDefaultRoomIds();
    if(defaults.length) ui.selectedRoomIds = defaults;
    ui.roomDefaultsApplied = true;
  }
  function pruneSelectedRooms(){
    const valid = new Set(validOwnerRoomIds());
    if(!ui.selectedRoomIds || !Array.isArray(ui.selectedRoomIds)){
      const defaults = savedDefaultRoomIds();
      ui.selectedRoomIds = defaults.length ? defaults : Array.from(valid);
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
    const kind = type === 'common' ? 'common' : 'room';
    if(!propMatches(targetPropId(targetId,kind))) return false;
    return kind === 'common' ? true : roomMatches(targetId);
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

  function defaultRoomTaskKey(roomId,presetId){
    return 'room_default|' + String(roomId || '') + '|' + String(presetId || '');
  }
  function defaultDeepTaskStartDate(){
    return addDay(CLEANING_TASK_LAUNCH_DATE, CLEANING_TASK_RAMP_DAYS);
  }
  function defaultDeepTaskTemplateId(value){
    const text = String(value || '').trim();
    if(!text) return '';
    return DEFAULT_ROOM_TASK_PRESET_IDS.find(id => {
      if(id === 'checkout_turnover_standard') return false;
      return text === id || text.endsWith('_' + id) || text.includes('_' + id + '|') || text.includes('|' + id + '|') || text.endsWith('|' + id);
    }) || '';
  }
  function defaultDeepTaskInRamp(date){
    const normalized = normalizeDateInputValue(date);
    return !!normalized && normalized >= CLEANING_TASK_LAUNCH_DATE && normalized < defaultDeepTaskStartDate();
  }
  function defaultPresetStartDate(isBase){
    return isBase ? today() : defaultDeepTaskStartDate();
  }
  function isDefaultDeepRoomTask(note){
    return !!(note && note.recurring_task && note.default_room_task && defaultDeepTaskTemplateId(note.template_id || note.default_task_key || note.id));
  }
  function holdDefaultDeepRoomTask(note,date){
    return isDefaultDeepRoomTask(note) && defaultDeepTaskInRamp(date);
  }
  function effectiveRecurringStartDate(note, first){
    const normalized = normalizeDateInputValue(first) || today();
    if(isDefaultDeepRoomTask(note) && normalized < defaultDeepTaskStartDate()) return defaultDeepTaskStartDate();
    return normalized;
  }
  function rampDefaultRoomCleaningTasks(){
    let changed = 0;
    const start = defaultDeepTaskStartDate();
    getNotes().forEach(note => {
      if(!isDefaultDeepRoomTask(note)) return;
      const current = normalizeDateInputValue(note.start_date);
      if(!current || current < start){
        note.start_date = start;
        note.launch_ramp_applied = true;
        changed += 1;
      }
    });
    return changed;
  }
  function allRecurringTaskNotes(){
    return getNotes().filter(n => n && n.recurring_task);
  }
  function defaultTaskApplicable(room,presetId){
    const id = String(presetId || '');
    if(['weekly_kitchen_bath_detail','monthly_drain_deodorize'].includes(id) && roomBathroomType(room) !== 'private' && !roomHasKitchen(room)) return {ok:false, reason:'no_room_plumbing'};
    if(presetRequiresPrivateBathroom(id) && roomBathroomType(room) !== 'private') return {ok:false, reason:'no_private_bath'};
    if(presetRequiresAppliances(presetId) && !roomHasAppliances(room)) return {ok:false, reason:'no_room_appliances'};
    return {ok:true, reason:''};
  }
  function checkoutDefaultNote(room){
    const parts = ['垃圾清空','床品毛巾更换'];
    if(roomHasKitchen(room)) parts.push('房间内厨房/小厨房台面、水槽和餐具检查');
    const bath = roomBathroomType(room);
    if(bath === 'private') parts.push('独立卫生间清洁');
    else if(bath === 'shared') parts.push('本房间使用共享卫生间，卫生间清洁归入公区任务');
    else parts.push('本房间无卫生间，卫生间清洁不在本房间任务内');
    parts.push('地面吸尘拖地','高频接触点擦拭','补齐耗材','拍照记录异常');
    return parts.join('、') + '。';
  }
  function kitchenBathDefaultTitleNote(room){
    const bath = roomBathroomType(room);
    const hasKitchen = roomHasKitchen(room);
    if(bath === 'private' && hasKitchen) return ['厨卫深清和水垢检查','检查房间内厨房油污、水槽、台面、淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。'];
    if(hasKitchen) return ['房间厨房深清和水垢检查','检查房间内厨房油污、水槽、台面和小厨房区域水垢；在当天保洁量少时补做。'];
    return ['卫浴深清和水垢检查','检查独立卫生间淋浴玻璃、马桶边角、地漏和水垢；在当天保洁量少时补做。'];
  }
  function drainDefaultTitleNote(room){
    const bath = roomBathroomType(room);
    const hasKitchen = roomHasKitchen(room);
    if(bath === 'private' && hasKitchen) return ['排水口/卫浴/厨房异味维护','检查淋浴、洗手池、房间内厨房水槽、马桶和地漏异味；只使用适合管道的产品，并按产品说明操作。'];
    if(hasKitchen) return ['厨房水槽异味维护','检查房间内厨房水槽和小厨房区域异味；只使用适合管道的产品，并按产品说明操作。'];
    return ['排水口/马桶异味维护','检查淋浴、洗手池、马桶和地漏异味；只使用适合管道的产品，并按产品说明操作。'];
  }
  function syncDefaultRoomTaskContent(note,room){
    const preset = recurringPresetById(note && note.template_id);
    if(!preset) return 0;
    const updated = makeDefaultRoomTask(room,preset);
    let changed = 0;
    ['title','note','task_mode','schedule_type','weekday','interval_days','flex_days','workload_sensitive','attach_to_checkout','can_defer'].forEach(key => {
      if(note[key] !== updated[key]){
        note[key] = updated[key];
        changed += 1;
      }
    });
    return changed;
  }
  function syncRoomDefaultTaskApplicability(room){
    if(!room || !room.id) return 0;
    let changed = 0;
    allRecurringTaskNotes().forEach(note => {
      if(!note.default_room_task || String(note.target_id) !== String(room.id)) return;
      const check = defaultTaskApplicable(room, note.template_id);
      if(!check.ok){
        if(note.enabled !== false || !note.inactive || note.auto_disabled_reason !== check.reason) changed += 1;
        note.enabled = false;
        note.inactive = true;
        note.auto_disabled_reason = check.reason;
      }else if(['no_private_bath','no_room_appliances','no_room_plumbing'].includes(String(note.auto_disabled_reason || ''))){
        note.enabled = true;
        delete note.inactive;
        delete note.auto_disabled_reason;
        changed += 1;
      }
      if(check.ok) changed += syncDefaultRoomTaskContent(note,room);
    });
    return changed;
  }
  function makeDefaultRoomTask(room,preset){
    const interval = Math.max(1, Number(preset.interval || (preset.schedule === 'weekly' ? 7 : 30)));
    const isBase = preset.id === 'checkout_turnover_standard';
    let title = preset.title;
    let note = preset.note;
    if(isBase){
      note = checkoutDefaultNote(room);
    }else if(preset.id === 'weekly_kitchen_bath_detail'){
      [title,note] = kitchenBathDefaultTitleNote(room);
    }else if(preset.id === 'monthly_drain_deodorize'){
      [title,note] = drainDefaultTitleNote(room);
    }
    if(preset.id === 'monthly_appliance_detail' && roomHasAppliances(room)){
      note = `${note} 本房间独有电器：${roomApplianceLabel(room)}。`;
    }
    return {
      id:'recurring_default_' + safe(room.id) + '_' + safe(preset.id),
      recurring_task:true,
      enabled:true,
      default_room_task:true,
      default_task_key:defaultRoomTaskKey(room.id,preset.id),
      template_id:preset.id,
      attach_to_checkout:true,
      can_defer:!isBase,
      task_mode:isBase ? 'regular' : 'deep',
      target_id:room.id,
      target_type:'room',
      title,
      note,
      priority:'普通',
      schedule_type:isBase ? 'daily' : 'interval',
      weekday:Number(preset.weekday == null ? 1 : preset.weekday),
      interval_days:isBase ? 1 : interval,
      flex_days:isBase ? 0 : Math.max(0, Number(preset.flex || 0)),
      workload_sensitive:!isBase,
      amount:Number(preset.amount || 0),
      start_date:defaultPresetStartDate(isBase),
      created_by:'系统默认',
      created_at:nowIso()
    };
  }
  function ensureDefaultRoomCleaningTasksForRoom(room){
    if(!room || !room.id) return 0;
    let added = syncRoomDefaultTaskApplicability(room);
    const notes = getNotes();
    const existing = new Set(allRecurringTaskNotes().map(n => n.default_task_key || (n.default_room_task ? defaultRoomTaskKey(n.target_id,n.template_id) : '')));
    DEFAULT_ROOM_TASK_PRESET_IDS.forEach(id => {
      const preset = recurringPresetById(id);
      const key = defaultRoomTaskKey(room.id,id);
      if(!preset || preset.target !== 'room') return;
      const check = defaultTaskApplicable(room,id);
      if(!check.ok) return;
      if(presetRequiresAppliances(id) && !roomHasAppliances(room)) return;
      if(existing.has(key)) return;
      notes.push(makeDefaultRoomTask(room,preset));
      existing.add(key);
      added += 1;
    });
    return added;
  }
  function ensureDefaultRoomCleaningTasks(){
    let added = rampDefaultRoomCleaningTasks();
    getRooms().forEach(room => { added += ensureDefaultRoomCleaningTasksForRoom(room); });
    return added;
  }

  function dataCount(state){
    const s = (state && state.state) || state || {};
    return ['users','properties','propertyCleaners','rooms','commonAreas','bookings','channelListings','maintenanceTickets','inventoryItems','expenseRecords','guestProfiles'].reduce((n,k) => n + (Array.isArray(s[k]) ? s[k].length : 0), 0);
  }
  function currentDataCount(){
    return getUsers().length + getProperties().length + getPropertyCleaners().length + getRooms().length + getAreas().length + getBookings().length + getChannels().length + getMaintenanceTickets().length + getInventoryItems().length + getExpenseRecords().length + getGuestProfiles().length;
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
      mailEvents: ui.mail.mailEvents,
      maintenanceTickets: getMaintenanceTickets(), inventoryItems: getInventoryItems(), expenseRecords: getExpenseRecords(),
      guestProfiles: getGuestProfiles(), auditLog: getAuditLog(),
      current_user: u, currentUser: u
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
    if(Array.isArray(state.maintenanceTickets)) setMaintenanceTickets(state.maintenanceTickets);
    if(Array.isArray(state.inventoryItems)) setInventoryItems(state.inventoryItems);
    if(Array.isArray(state.expenseRecords)) setExpenseRecords(state.expenseRecords);
    if(Array.isArray(state.guestProfiles)) setGuestProfiles(state.guestProfiles);
    if(Array.isArray(state.auditLog)) setAuditLog(state.auditLog);
    if(Array.isArray(state.sync_errors)) setSyncErrors(state.sync_errors);
    if(state.last_sync) setLastSync(state.last_sync);
    if(Array.isArray(state.mailForwardingConfig)) ui.mail.mailForwardingConfig = state.mailForwardingConfig;
    if(Array.isArray(state.propertyMailForwarding)) ui.mail.propertyMailForwarding = state.propertyMailForwarding;
    if(Array.isArray(state.mailEvents)) ui.mail.mailEvents = state.mailEvents;
    ensureRealDefaultProperty();
    applySavedDefaultRooms();
    if(currentDataCount()) rememberGoodState();
    clearDataGate();
    return state;
  }

  async function loadStateImpl(){
    ui.loading = true;
    ensureDataGate('正在加载 PMS 数据...');
    let last = null;
    let lastError = null;
    for(let i=0;i<2;i++){
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
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    ui.loading = false;
    clearDataGate();
    if(lastError && !last) throw lastError;
    return last;
  }

  async function persistAll(btn){
    ensureRealDefaultProperty();
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = t('profile.saving');}
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
        maintenanceTickets: getMaintenanceTickets(),
        inventoryItems: getInventoryItems(),
        guestProfiles: getGuestProfiles(),
        auditLog: getAuditLog(),
        sync_errors: getSyncErrors(),
        last_sync: getLastSync(),
        propertyMailForwarding: ui.mail.propertyMailForwarding
      };
      if(canPermission('finance_edit')) payload.expenseRecords = getExpenseRecords();
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

  function confirmationMergeKey(row){
    const r = row || {};
    return [r.date || '', r.target_type || r.targetType || 'room', r.target_id || r.targetId || '', r.task_key || r.taskKey || ''].map(x => String(x || '')).join('|');
  }
  function mergeConfirmations(rows){
    const current = getConfirmations().slice();
    (rows || []).forEach(row => {
      if(!row || typeof row !== 'object') return;
      const mergeKey = confirmationMergeKey(row);
      const taskKey = String(row.task_key || row.taskKey || '');
      const idx = current.findIndex(item => confirmationMergeKey(item) === mergeKey || (taskKey && String(item.task_key || item.taskKey || '') === taskKey));
      if(idx >= 0) current[idx] = {...current[idx], ...row};
      else current.push(row);
    });
    setConfirmations(current);
  }
  async function persistCleaningConfirmations(rows, btn){
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = t('profile.saving');}
    try{
      const res = await fetch(apiUrl('/api/cleaning-confirmations'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({cleaningTaskConfirmations: rows || []})
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('保存失败 HTTP ' + res.status));
      if(Array.isArray(data.cleaningTaskConfirmations)) mergeConfirmations(data.cleaningTaskConfirmations);
      return data;
    }catch(err){
      alert('保存失败：' + (err && err.message ? err.message : err));
      throw err;
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || t('cleaning.done');}
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
  function ensureTimezoneSelector(){
    const nav = document.querySelector('.nav') || document.querySelector('header') || document.body;
    if(!nav) return null;
    let wrap = qs('pmsTimezoneWrap');
    if(!wrap){
      wrap = document.createElement('label');
      wrap.id = 'pmsTimezoneWrap';
      wrap.className = 'small';
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.style.marginLeft = '8px';
      wrap.innerHTML = '<span>' + esc(t('pref.timezone')) + '</span><select id="pmsTimezoneSelect" class="smallbtn timezone-picker"></select>';
      const logout = qs('logoutBtn');
      if(logout && logout.parentNode === nav) nav.insertBefore(wrap, logout);
      else nav.appendChild(wrap);
    }
    const tzLabel = wrap.querySelector('span');
    if(tzLabel) tzLabel.textContent = t('pref.timezone');
    const select = qs('pmsTimezoneSelect');
    if(select){
      const current = userTimeZone();
      select.innerHTML = timeZoneOptions(current);
      select.value = current;
      select.onchange = async function(){
        const tz = normalizeTimeZone(select.value);
        try{localStorage.setItem('pms_timezone', tz);}catch(e){}
        const user = {...(getCurrentUser() || {}), timezone: tz, time_zone: tz};
        setCurrentUser(user);
        try{
          await fetch(apiUrl('/api/profile'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: user.name || user.username || '用户', timezone: tz, time_zone: tz, language: currentLanguage(), locale: currentLanguage()})
          });
        }catch(e){console.warn('save timezone failed', e);}
        renderAll();
      };
    }
    ensureLanguageSelector();
    return wrap;
  }
  function ensureLanguageSelector(){
    const nav = document.querySelector('.nav') || document.querySelector('header') || document.body;
    if(!nav) return null;
    let wrap = qs('pmsLanguageWrap');
    if(!wrap){
      wrap = document.createElement('label');
      wrap.id = 'pmsLanguageWrap';
      wrap.className = 'small';
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.style.marginLeft = '8px';
      wrap.innerHTML = '<span></span><select id="pmsLanguageSelect" class="smallbtn language-picker"></select>';
      const logout = qs('logoutBtn');
      if(logout && logout.parentNode === nav) nav.insertBefore(wrap, logout);
      else nav.appendChild(wrap);
    }
    const label = wrap.querySelector('span');
    if(label) label.textContent = t('pref.language');
    const select = qs('pmsLanguageSelect');
    if(select){
      const current = currentLanguage();
      select.innerHTML = languageOptions(current);
      select.value = current;
      select.onchange = async function(){
        const lang = normalizeLanguage(select.value);
        saveLanguageLocal(lang);
        const user = {...(getCurrentUser() || {}), language: lang, locale: lang};
        setCurrentUser(user);
        try{
          await fetch(apiUrl('/api/profile'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: user.name || user.username || '用户', timezone: userTimeZone(), time_zone: userTimeZone(), language: lang, locale: lang})
          });
        }catch(e){console.warn('save language failed', e);}
        renderAll();
      };
    }
    return wrap;
  }
  function ensureLogoutButton(){
    const nav = document.querySelector('.nav') || document.querySelector('header') || document.body;
    ensureTimezoneSelector();
    updateMainNavLabels();
    let btn = qs('logoutBtn');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'logoutBtn';
      btn.type = 'button';
      btn.className = 'smallbtn';
      nav.appendChild(btn);
    }
    btn.textContent = t('nav.logout');
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
      if(el.closest && (el.closest('#pmsTimezoneWrap') || el.closest('#pmsLanguageWrap'))){ el.style.display = ''; return; }
      const text = (el.textContent || '').trim();
      const action = el.getAttribute('onclick') || '';
      const isOwnerNav = action.includes("showSection('owner'") || action.includes('showSection("owner"') || text.includes('房东管理') || text.includes('房源管理') || text.includes('Owner') || text.includes('Propietario');
      el.style.display = cleanerOnly && isOwnerNav ? 'none' : '';
    });
  }
  function updateMainNavLabels(){
    const nav = document.querySelector('.nav');
    if(!nav) return;
    nav.querySelectorAll('button').forEach(btn => {
      if(btn.id === 'logoutBtn') return;
      const action = btn.getAttribute('onclick') || '';
      if(action.includes("showSection('cleaner'") || action.includes('showSection("cleaner"')) btn.textContent = t('nav.cleaner');
      if(action.includes("showSection('owner'") || action.includes('showSection("owner"')) btn.textContent = t('nav.owner');
    });
  }
  function ensureVersionBadge(){
    let style = qs('pmsVersionBadgeStyles');
    if(!style){
      style = document.createElement('style');
      style.id = 'pmsVersionBadgeStyles';
      style.textContent = '.pms-version-badge{display:inline-flex;align-items:center;justify-content:center;border:1px solid #99f6e4;background:#ecfeff;color:#0f766e;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900;line-height:1;white-space:nowrap;pointer-events:none;opacity:.9;box-shadow:0 8px 20px rgba(15,23,42,.08)}@media(max-width:600px){.pms-version-badge{order:99;padding:5px 8px;font-size:10px}}';
      document.head.appendChild(style);
    }
    const nav = document.querySelector('.nav') || document.querySelector('header') || document.body;
    let badge = qs('pmsVersionBadge');
    if(!badge){
      badge = document.createElement('span');
      badge.id = 'pmsVersionBadge';
    }
    badge.className = 'pms-version-badge';
    if(nav && badge.parentNode !== nav) nav.appendChild(badge);
    badge.title = 'PMS v' + VERSION;
    const compact = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    const match = String(VERSION).match(/v\d+/);
    badge.textContent = compact && match ? 'PMS ' + match[0] : 'PMS v' + VERSION;
  }
  function setHeader(view){
    const h = document.querySelector('header h1');
    const sub = document.querySelector('header h1 + .small');
    const name = userName(isActualCleaner() ? t('role.cleaner') : t('role.owner'));
    if(view === 'cleaner'){
      if(isActualCleaner()){
        if(h) h.textContent = t('header.cleaner.title', {name});
        if(sub) sub.textContent = t('header.cleaner.sub');
      }else{
        if(h) h.textContent = t('header.cleaner.ownerTitle', {name});
        if(sub) sub.textContent = t('header.cleaner.ownerSub');
      }
      document.title = h ? h.textContent : t('nav.cleaner');
    }else{
      if(h) h.textContent = t('header.owner.title', {name});
      if(sub) sub.textContent = t('header.owner.sub');
      document.title = h ? h.textContent : t('nav.owner');
    }
    updateMainNavLabels();
    syncNavForRole();
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
        <button class="active" onclick="showOwnerTab('ownerDailyWork', this)">${esc(t('owner.tab.daily'))}</button>
        <button onclick="showOwnerTab('ownerCalendar', this)">${esc(t('owner.tab.calendar'))}</button>
        <button onclick="showOwnerTab('ownerCleaning', this)">${esc(t('owner.tab.cleaning'))}</button>
        <button onclick="showOwnerTab('ownerRooms', this)">${esc(t('owner.tab.rooms'))}</button>
      </div>`;
      qs('ownerMetrics').insertAdjacentElement('afterend', card);
    }
    syncOwnerBaseTabs();
    ensureOwnerFinanceTab();
    ensureOwnerAccessTab();
    ensureOwnerOpsTab();
    const pane = (id, html) => {
      if(qs(id)) return;
      const div = document.createElement('div');
      div.id = id;
      div.className = 'tab-content' + (id === 'ownerDailyWork' ? ' active' : '');
      div.innerHTML = html;
      owner.appendChild(div);
    };
    pane('ownerDailyWork', `<div class="card"><h2>${esc(t('owner.daily.title'))}</h2><div class="toolbar"><span class="small">${esc(t('owner.daily.date'))}</span><input id="workDate" type="date" onchange="setWorkDate(this.value)"><button class="smallbtn primary" onclick="setWorkDateToday()">${esc(t('owner.daily.today'))}</button><button class="smallbtn" onclick="shiftWorkDate(1)">${esc(t('owner.daily.next'))}</button><button class="smallbtn" onclick="shiftWorkDate(-1)">${esc(t('owner.daily.prev'))}</button></div><div id="dailyWorkMetrics" class="grid"></div></div><div id="dailyWorkContent"></div>`);
    pane('ownerCalendar', `<div class="card"><h2>${esc(t('owner.calendar.title'))}</h2><div class="toolbar"><span class="small">${esc(t('owner.calendar.sub'))}</span><button class="smallbtn primary" data-range-preset="14" onclick="setRangePreset(14)">${esc(t('owner.calendar.range14'))}</button><button class="smallbtn" data-range-preset="28" onclick="setRangePreset(28)">${esc(t('owner.calendar.range28'))}</button><input id="rangeStart" type="date" onchange="refreshCalendarRangeViews()"><input id="rangeEnd" type="date" onchange="refreshCalendarRangeViews()"><span id="ownerRoomFilterSummary" class="badge blue"></span><button id="calendarVacancyOnlyBtn" class="smallbtn" onclick="toggleCalendarVacancyOnly()">${esc(t('owner.calendar.vacancyOnly'))}</button><span id="calendarVacancySummary" class="badge green"></span></div><div class="scroll"><div id="calendarGrid" class="timeline"></div></div></div><div class="card"><h2 id="futureStatsTitle">${esc(t('owner.calendar.currentStats'))}</h2><div id="sixMonthStats"></div></div><div class="card"><div class="toolbar"><strong id="futureBookingsTitle">${esc(t('owner.calendar.currentBookings'))}</strong><select id="platformFilter" onchange="renderOwnerBookings()"><option value="">${esc(t('owner.calendar.platformAll'))}</option><option>Airbnb</option><option>Booking</option><option>Vrbo</option><option>Other</option><option value="微信直订">${esc(t('owner.calendar.direct'))}</option></select><span id="bookingRoomFilterSummary" class="badge blue"></span></div><div id="ownerBookings"></div></div>`);
    pane('ownerCleaning', `<div id="ownerCleaningShell"></div>`);
    pane('ownerRooms', `<div id="roomSettingsUnifiedShell" class="room-settings-shell"><div id="roomSettings"></div></div>`);
    syncOwnerPaneLabels();
    ensureOwnerProfileTab();
    ensureRoomSettingsShell();
  }
  function syncOwnerPaneLabels(){
    const daily = qs('ownerDailyWork');
    if(daily){
      const h2 = daily.querySelector('h2'); if(h2) h2.textContent = t('owner.daily.title');
      const dateLabel = daily.querySelector('.toolbar .small'); if(dateLabel) dateLabel.textContent = t('owner.daily.date');
      const dailyButtons = Array.from(daily.querySelectorAll('button'));
      const todayBtn = dailyButtons.find(btn => String(btn.getAttribute('onclick') || '').includes('setWorkDateToday'));
      const nextBtn = dailyButtons.find(btn => String(btn.getAttribute('onclick') || '').includes('shiftWorkDate(1)'));
      const prevBtn = dailyButtons.find(btn => String(btn.getAttribute('onclick') || '').includes('shiftWorkDate(-1)'));
      if(todayBtn) todayBtn.textContent = t('owner.daily.today');
      if(nextBtn) nextBtn.textContent = t('owner.daily.next');
      if(prevBtn) prevBtn.textContent = t('owner.daily.prev');
    }
    const calendar = qs('ownerCalendar');
    if(calendar){
      const h2 = calendar.querySelector('h2'); if(h2) h2.textContent = t('owner.calendar.title');
      const sub = calendar.querySelector('.toolbar .small'); if(sub) sub.textContent = t('owner.calendar.sub');
      const preset14 = calendar.querySelector('[data-range-preset="14"]'); if(preset14) preset14.textContent = t('owner.calendar.range14');
      const preset28 = calendar.querySelector('[data-range-preset="28"]'); if(preset28) preset28.textContent = t('owner.calendar.range28');
      const vacantBtn = qs('calendarVacancyOnlyBtn'); if(vacantBtn) vacantBtn.textContent = ui.calendarVacancyOnly ? t('owner.calendar.showAll') : t('owner.calendar.vacancyOnly');
      const statsTitle = qs('futureStatsTitle'); if(statsTitle) statsTitle.textContent = t('owner.calendar.currentStats');
      const bookingTitle = qs('futureBookingsTitle'); if(bookingTitle) bookingTitle.textContent = t('owner.calendar.currentBookings');
      const platform = qs('platformFilter');
      if(platform && platform.options && platform.options.length){
        platform.options[0].textContent = t('owner.calendar.platformAll');
        Array.from(platform.options).forEach(opt => {
          if(opt.value === '微信直订') opt.textContent = t('owner.calendar.direct');
        });
      }
    }
  }
  function ownerTabAllowed(id){
    if(id === 'ownerDailyWork' || id === 'ownerCalendar') return canPermission('calendar_view');
    if(id === 'ownerCleaning') return canPermission('cleaning_manage');
    if(id === 'ownerRooms') return canPermission('settings_manage');
    if(id === 'ownerFinance') return canPermission('finance_view');
    if(id === 'ownerAccess') return canPermission('users_manage');
    if(id === 'ownerOps') return canPermission('ops_manage');
    return true;
  }
  function firstAllowedOwnerTab(){
    return ['ownerDailyWork','ownerCalendar','ownerCleaning','ownerRooms','ownerFinance','ownerOps','ownerAccess','ownerProfile'].find(ownerTabAllowed) || 'ownerProfile';
  }
  function ownerTabButton(id){
    const tabbar = qs('ownerTabsCard') && qs('ownerTabsCard').querySelector('.tabbar');
    if(!tabbar) return null;
    if(id === 'ownerFinance') return tabbar.querySelector('[data-pms-finance-tab]');
    if(id === 'ownerAccess') return tabbar.querySelector('[data-pms-access-tab]');
    if(id === 'ownerOps') return tabbar.querySelector('[data-pms-ops-tab]');
    if(id === 'ownerProfile') return tabbar.querySelector('[data-pms-profile-tab]');
    return tabbar.querySelector(`button[onclick*="${id}"]`);
  }
  function syncOwnerBaseTabs(){
    const tabbar = qs('ownerTabsCard') && qs('ownerTabsCard').querySelector('.tabbar');
    if(!tabbar) return;
    [['ownerDailyWork',t('owner.tab.daily')],['ownerCalendar',t('owner.tab.calendar')],['ownerCleaning',t('owner.tab.cleaning')],['ownerRooms',t('owner.tab.rooms')]].forEach(([id,label]) => {
      const btn = tabbar.querySelector(`button[onclick*="${id}"]`);
      if(btn){
        btn.textContent = label;
        btn.style.display = ownerTabAllowed(id) ? '' : 'none';
      }
    });
  }
  function ensureOwnerFeatureTab(id, dataAttr, label, allowed){
    const owner = qs('owner');
    if(!owner) return;
    const tabbar = owner.querySelector('#ownerTabsCard .tabbar') || owner.querySelector('.tabbar');
    const selector = `[${dataAttr}]`;
    const existing = tabbar && tabbar.querySelector(selector);
    const pane = qs(id);
    if(!allowed){
      if(existing) existing.remove();
      if(pane){
        if(pane.classList.contains('active')){
          const dailyBtn = tabbar && tabbar.querySelector('button[onclick*="ownerDailyWork"]');
          showOwnerTabImpl('ownerDailyWork', dailyBtn || null);
        }
        pane.remove();
      }
      return;
    }
    if(existing) existing.textContent = label;
    if(tabbar && !existing){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute(dataAttr, '1');
      btn.textContent = label;
      btn.onclick = function(){showOwnerTabImpl(id, this);};
      tabbar.appendChild(btn);
    }
    if(!qs(id)){
      const div = document.createElement('div');
      div.id = id;
      div.className = 'tab-content';
      div.innerHTML = id === 'ownerFinance' ? '<div id="ownerFinanceShell"></div>' : id === 'ownerAccess' ? '<div id="ownerAccessShell"></div>' : '<div id="ownerOpsShell"></div>';
      owner.appendChild(div);
    }
  }
  function ensureOwnerFinanceTab(){
    ensureOwnerFeatureTab('ownerFinance', 'data-pms-finance-tab', t('nav.finance'), canPermission('finance_view'));
  }
  function ensureOwnerAccessTab(){
    ensureOwnerFeatureTab('ownerAccess', 'data-pms-access-tab', t('nav.access'), canPermission('users_manage'));
  }
  function ensureOwnerOpsTab(){
    ensureOwnerFeatureTab('ownerOps', 'data-pms-ops-tab', t('nav.ops'), canPermission('ops_manage'));
  }
  function ensureOwnerProfileTab(){
    const owner = qs('owner');
    if(!owner) return;
    const tabbar = owner.querySelector('#ownerTabsCard .tabbar') || owner.querySelector('.tabbar');
    const existing = tabbar && tabbar.querySelector('[data-pms-profile-tab]');
    if(existing) existing.textContent = t('nav.profile');
    if(tabbar && !tabbar.querySelector('[data-pms-profile-tab]')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.pmsProfileTab = '1';
      btn.textContent = t('nav.profile');
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
    const profileTab = isActualCleaner() ? `<button data-pms-profile-tab="1" onclick="showTab('cleanerProfile', this)">${esc(t('nav.profile'))}</button>` : '';
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
      btn.textContent = t('nav.profile');
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
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
      .metric{background:#fff;border:1px solid var(--line);padding:14px;box-shadow:var(--shadow);min-width:0}
      .metric .small{font-size:13px;color:var(--muted)}
      .metric .num{font-size:28px;line-height:1.1;font-weight:900;color:#0f766e;margin-top:6px}
      .tabbar,.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .badge{display:inline-flex;align-items:center;justify-content:center;border:1px solid #d8e1ef;background:#f8fafc;color:#0f172a;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:900;line-height:1.1}
      .badge.green{border-color:#bbf7d0;background:#dcfce7;color:#047857}.badge.blue{border-color:#bae6fd;background:#e0f2fe;color:#0369a1}.badge.orange{border-color:#fed7aa;background:#ffedd5;color:#c2410c}.badge.red{border-color:#fecdd3;background:#ffe4e6;color:#be123c}.badge.yellow{border-color:#fde68a;background:#fef3c7;color:#92400e}.badge.purple{border-color:#ddd6fe;background:#f5f3ff;color:#6d28d9}
      .formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end}
      .formgrid label,label{font-weight:900;color:#0f172a}
      input,select,textarea{border:1px solid var(--line);border-radius:8px;padding:9px 10px;font:inherit;max-width:100%}
      textarea{min-height:78px;resize:vertical}
      table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}
      th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
      th{background:#eaf1fb;font-weight:900;color:#0f172a}
      tr:last-child td{border-bottom:0}
      .note-card{border:1px solid #fbbf24;background:#fffbeb;border-radius:8px;padding:10px;margin:8px 0;color:#0f172a}
      .note-card.important{border-color:#fb7185;background:#fff1f2}
      .note-title{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-weight:900;margin-bottom:5px}
      .work-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .work-card{border:1px solid var(--line);background:#fff;border-radius:8px;padding:12px;box-shadow:var(--shadow);min-width:0}
      .property-module{display:grid;gap:12px;border:2px solid #2dd4bf;background:#fbfffe;box-shadow:inset 5px 0 0 #0f766e,0 10px 22px rgba(15,118,110,.08)}
      .property-module-head,.property-detail-head,.property-actions,.room-head,.channel-row,.mail-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .property-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
      .property-card,.property-subcard,.room-setting-card{border:1px solid var(--line);background:#fff;padding:14px}
      .property-card{display:grid;gap:10px;align-content:space-between;min-height:145px;min-width:0}
      .property-card.editing{grid-column:1/-1}
      .property-card.editing .property-card-top{display:block}
      .property-card.editing .property-select{margin-top:8px}
      .property-card.editing .property-actions{justify-content:flex-start}
      .property-card.editing .property-actions>*{width:auto}
      .property-card-top{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
      .property-title{font-size:18px;font-weight:900;color:#0f172a}
      .property-select{display:flex;align-items:center;gap:8px;font-weight:900;color:#0f766e}
      .property-select input,.scope-chip input{width:18px!important;height:18px;min-width:18px}
      .property-card input,.property-card select,.room-setting-card input,.room-setting-card select,.mail-panel input,.mail-panel textarea{width:100%;min-width:0}
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
      .room-basics{display:grid;grid-template-columns:minmax(180px,1fr) minmax(120px,.45fr) minmax(150px,.55fr) minmax(190px,.75fr) minmax(220px,1fr) auto;gap:8px;align-items:end;width:100%}
      .room-index-section{display:grid;gap:12px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:14px}
      .room-index-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .room-index-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
      .room-index-item{border:1px solid #d8e1ef;background:#fff;border-radius:8px;padding:10px;display:grid;gap:8px;text-align:left;color:#0f172a;cursor:pointer;min-height:96px}
      .room-index-item:hover{border-color:#5eead4;background:#f8fffd}
      .room-index-item.active{border-color:#0f766e;background:#ecfdf5;box-shadow:inset 4px 0 0 #0f766e}
      .room-index-title{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;font-weight:900}
      .room-index-title span:first-child{font-size:16px}
      .room-index-desc{font-size:12px;color:#64748b;line-height:1.45}
      .room-index-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .mini-status{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:900;border:1px solid #d8e1ef;background:#f8fafc;color:#475569;max-width:100%}
      .mini-status.ok{border-color:#86efac;background:#f0fdf4;color:#166534}.mini-status.error{border-color:#fb7185;background:#fff1f2;color:#be123c}.mini-status.warn{border-color:#fbbf24;background:#fffbeb;color:#92400e}
      .room-settings-detail{display:grid;gap:12px;margin-top:12px}
      .channel-list{display:grid;gap:10px;margin-top:10px}
      .channel-card{border:1px solid #bae6fd;background:#f8fcff;border-radius:8px;padding:10px;display:grid;gap:8px}
      .channel-grid{display:grid;grid-template-columns:130px minmax(190px,1fr) minmax(190px,1fr) minmax(140px,.8fr) auto;gap:8px;align-items:end}
      .channel-grid.area-grid{grid-template-columns:minmax(180px,1fr) minmax(420px,2.2fr) minmax(120px,.45fr) minmax(150px,.55fr) auto}
      .channel-grid.area-grid>div:nth-child(2){grid-column:auto!important}
      .common-area-list{display:grid;gap:10px;margin-top:10px}
      .common-area-card{border:1px solid #bae6fd;background:#f8fcff;border-radius:8px;padding:12px;display:grid;gap:10px}
      .common-area-form{display:grid;grid-template-columns:minmax(150px,220px) minmax(0,1fr) minmax(100px,130px) minmax(140px,170px) auto;gap:10px;align-items:end}
      .common-area-field{display:grid;gap:5px;min-width:0}
      .common-area-field>span,.common-area-components-title{font-size:12px;font-weight:900;color:#475569}
      .common-area-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .check-grid{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .check-grid label{display:inline-flex;align-items:center;gap:5px;font-weight:800}
      .appliance-grid{grid-column:1/-1}
      .area-component-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:stretch}
      .area-component-item{border:1px solid #d8e1ef;background:#fff;border-radius:8px;padding:8px;display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:8px;align-items:center;font-weight:900;color:#0f172a;min-width:0}
      .area-component-item span{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap}
      .area-component-item input[type=number]{width:100%;min-width:0}
      .area-component-item input[type=text]{width:100%;min-width:0}
      .area-component-other{grid-template-columns:auto minmax(80px,1fr) 64px}
      .feed-line,.readonly-line{word-break:break-all;border:1px solid #d8e1ef;background:#f8fafc;border-radius:8px;padding:8px 10px;font-size:12px;color:#475569}
      .sync-status{display:inline-flex;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:900;border:1px solid #d8e1ef;background:#f8fafc;color:#475569}
      .sync-status.ok{border-color:#86efac;background:#f0fdf4;color:#166534}.sync-status.error{border-color:#fb7185;background:#fff1f2;color:#be123c}.sync-status.warn{border-color:#fbbf24;background:#fffbeb;color:#92400e}
      .property-location{margin-top:6px;color:#475569;font-size:13px;line-height:1.45}
      .property-edit-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end;max-width:100%}
      .property-edit-grid label{display:grid;gap:5px;font-size:12px;font-weight:900;color:#475569;min-width:0}
      .property-edit-actions{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-start;flex-wrap:wrap}
      .property-edit-actions .smallbtn{min-width:120px}
      .timezone-picker{max-width:260px}
      .scroll{overflow:auto;-webkit-overflow-scrolling:touch}
      #calendarGrid{display:grid;gap:6px;align-items:stretch;min-width:max-content;padding-bottom:4px}
      #calendarGrid .cell{position:relative;overflow:hidden;min-width:64px;min-height:54px;border:1px solid #d8e1ef;background:#fff;border-radius:8px;padding:6px;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:850;line-height:1.12;color:#0f172a}
      #calendarGrid .cell.head{background:#eaf1fb;font-weight:900;z-index:2}
      #calendarGrid .cell.room{position:sticky;left:0;z-index:3;justify-content:flex-start;text-align:left;background:#f8fafc;font-weight:900;box-shadow:5px 0 10px rgba(15,23,42,.08)}
      #calendarGrid .cell.head:first-child{position:sticky;left:0;z-index:4}
      #calendarGrid.vacancy-only .cell:not(.head):not(.room){background:#fff!important;border-color:#d8e1ef!important;color:#0f172a!important;outline:none!important;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:900}
      #calendarGrid.vacancy-only .cell:not(.head):not(.room):before,#calendarGrid.vacancy-only .cell:not(.head):not(.room):after{display:none!important}
      #calendarGrid.vacancy-only .cell.empty-night{color:#0f766e!important}
      #calendarGrid.vacancy-only .cell.hidden-occupied{color:transparent!important}
      #calendarGrid.vacancy-only .cell.hidden-occupied *{display:none!important}
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
      #calendarGrid.vacancy-only .cell.hidden-occupied{outline:none!important;border-color:#e2e8f0!important;background:#fff!important}
      #calendarGrid .cell .cell-platform{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:900;position:relative;z-index:2}
      .weekend-label{display:block;font-size:11px;font-weight:900;line-height:1.1;margin-top:2px;color:#b45309}
      .work-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}
      .work-card h3{white-space:normal!important}
      .finance-section{margin-top:12px}.finance-section h3{margin:0;padding:10px 12px;background:#f8fafc;border:1px solid var(--line);border-radius:8px 8px 0 0}
      .finance-day-list{display:grid;gap:12px;margin-top:12px}
      .finance-day{border:1px solid var(--line);border-radius:8px;background:#fff;overflow:hidden}
      .finance-day-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 12px;background:#f8fafc;border-bottom:1px solid var(--line);flex-wrap:wrap}
      .finance-day-head h3{margin:0;font-size:18px}
      .finance-day-total{font-size:22px;font-weight:900;color:#0f766e;white-space:nowrap}
      .mail-panel{border:1px solid #bae6fd;background:#f8fcff;border-radius:8px;padding:12px;display:grid;gap:10px}
      .ops-shell{display:grid;gap:14px}
      .ops-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .ops-tabs button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}
      .ops-tabs button.active{background:#0f766e;border-color:#0f766e;color:#fff}
      .ops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
      .ops-panel{border:1px solid var(--line);background:#fff;border-radius:8px;padding:14px;display:grid;gap:12px}
      .ops-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end}
      .ops-form label{display:grid;gap:5px;font-size:12px;font-weight:900;color:#475569}
      .ops-form input,.ops-form select,.ops-form textarea{width:100%;min-width:0}
      .ops-list{display:grid;gap:8px}
      .ops-row{border:1px solid #d8e1ef;background:#f8fafc;border-radius:8px;padding:10px;display:grid;gap:8px}
      .ops-row-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap}
      .ops-title{font-weight:900;color:#0f172a}
      .ops-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .ops-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .ops-health{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px}
      .ops-empty{border:1px dashed #cbd5e1;background:#f8fafc;border-radius:8px;padding:14px;color:#64748b}
      .access-user-card{background:#fff!important}
      .access-section{display:grid;gap:8px}
      .access-section h4{margin:0;color:#0f172a}
      .access-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
      .access-check{display:flex;align-items:center;gap:7px;border:1px solid #d8e1ef;border-radius:8px;padding:8px 10px;background:#f8fafc;font-weight:900}
      .access-check input{width:18px;height:18px}
      .user-profile-card{display:grid;gap:14px}
      .profile-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .profile-field{display:grid;gap:6px}
      .profile-field label{font-weight:900;color:#0f172a}
      .profile-field input,.profile-field select{width:100%;min-width:0}
      .profile-field input[readonly]{background:#f8fafc;color:#475569}
      .profile-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .profile-status{font-size:13px;font-weight:900;color:#0f766e}
      .review-row{background:#fff7ed!important}
      .photo-cell{display:grid;gap:6px;min-width:150px}
      .photo-cell input[type=file]{position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;pointer-events:none}
      .photo-thumb-list{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .photo-thumb{position:relative;display:block;width:54px;height:54px;border:1px solid #bae6fd;border-radius:8px;overflow:hidden;background:#f8fafc;text-decoration:none;box-shadow:0 1px 2px rgba(15,23,42,.06)}
      .photo-thumb img{display:block;width:100%;height:100%;object-fit:cover}
      .photo-thumb-label{position:absolute;right:3px;bottom:3px;min-width:16px;height:16px;border-radius:999px;background:rgba(15,23,42,.75);color:#fff;font-size:10px;font-weight:900;line-height:16px;text-align:center}
      .photo-thumb:focus-visible{outline:2px solid #14b8a6;outline-offset:2px}
      .photo-expiry{font-size:11px;color:#64748b}
      .photo-status{font-size:12px;color:#64748b;font-weight:800;min-height:16px}
      .photo-status.ok{color:#047857}
      .photo-status.error{color:#b91c1c}
      .clean-subtask-list,.task-confirm-list,.task-photo-list{display:grid;gap:8px;margin-top:8px}
      .clean-subtask{border:1px solid #d8e1ef;background:#f8fafc;border-radius:8px;padding:8px}
      .clean-subtask.done{border-color:#86efac;background:#f0fdf4}
      .clean-subtask-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:900}
      .task-confirm-item,.task-photo-item{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px;display:grid;gap:6px}
      .task-confirm-item.done{border-color:#86efac;background:#f0fdf4}
      .task-confirm-list .mail-actions,.task-photo-list .mail-actions{justify-content:flex-start}
      .cleaning-subnav-card{display:grid;gap:10px}
      .cleaning-subnav-card .property-detail-head{margin-bottom:0}
      .cleaning-subnav-card h2{font-size:20px}
      .cleaning-subtabs{margin:0;padding:0;gap:8px}
      .filter-strip{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:10px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
      .filter-field{display:grid;gap:4px;min-width:150px}
      .filter-field label{font-size:12px;font-weight:900;color:#64748b}
      .filter-field input,.filter-field select{min-height:38px}
      .filter-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .cleaning-day-list{display:grid;gap:10px}
      .cleaning-day{border:1px solid var(--line);background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}
      .cleaning-day-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#f8fafc;border-bottom:1px solid var(--line)}
      .cleaning-day-head h3{margin:0;font-size:18px;line-height:1.15}
      .cleaning-day-total{font-size:20px;font-weight:900;color:#0f766e;white-space:nowrap}
      .cleaning-list-card{padding:8px}
      .cleaning-work-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(620px,1fr));gap:10px;align-items:start}
      .cleaning-work-list.compact-tasks{grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:8px}
      .cleaning-work-card{border:1px solid #d8e1ef;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}
      .cleaning-work-card.today{border-color:#fbbf24;background:#fffbeb;box-shadow:0 0 0 1px rgba(251,191,36,.18)}
      .cleaning-work-card.review{border-color:#fb923c;background:#fff7ed}
      .cleaning-work-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
      .cleaning-work-card.today .cleaning-work-head{background:#fef3c7}
      .cleaning-work-title{display:grid;gap:3px;min-width:0}
      .cleaning-work-name{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:16px;font-weight:900;color:#0f172a}
      .cleaning-work-title>.small{font-size:12px}
      .cleaning-work-meta{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;min-width:160px}
      .cleaning-work-body{display:grid;gap:6px;padding:8px 10px 8px 16px;position:relative;background:#fff}
      .cleaning-work-card.today .cleaning-work-body{background:#fffdf4}
      .cleaning-work-card.review .cleaning-work-body{background:#fff7ed}
      .cleaning-work-body:before{content:"";position:absolute;left:7px;top:8px;bottom:8px;width:3px;border-radius:999px;background:#cbd5e1}
      .cleaning-work-card.today .cleaning-work-body:before{background:#f59e0b}
      .cleaning-work-card.review .cleaning-work-body:before{background:#fb923c}
      .cleaning-work-note{color:#64748b;line-height:1.3;font-size:13px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
      .cleaning-work-photo-panel{display:grid;gap:4px}
      .cleaning-work-photo-panel>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:max-content;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:999px;min-height:30px;padding:5px 14px;font-size:13px;font-weight:900;line-height:1}
      .cleaning-work-photo-panel>summary::-webkit-details-marker{display:none}
      .cleaning-work-photo-panel[open]{border:1px dashed #cbd5e1;background:#f8fafc;border-radius:8px;padding:7px}
      .cleaning-task-rows{display:grid;gap:5px}
      .cleaning-task-row{display:grid;grid-template-columns:minmax(260px,1fr) minmax(90px,.18fr) minmax(110px,.22fr);gap:8px;align-items:center;border:1px solid #d8e1ef;border-left:4px solid #94a3b8;background:#fff;border-radius:8px;padding:6px 8px}
      .cleaning-task-row.compact{grid-template-columns:minmax(0,1fr) minmax(92px,.18fr);border-left-width:3px;border-radius:6px;padding:4px 6px;gap:6px}
      .cleaning-task-row.done{border-color:#86efac;background:#f0fdf4}
      .cleaning-task-row.pending{border-color:#fbbf24;border-left-color:#f59e0b;background:#fffaf0}
      .cleaning-task-main{display:grid;gap:2px;min-width:0}
      .cleaning-task-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;font-weight:900;color:#0f172a;line-height:1.15}
      .cleaning-task-title-text{min-width:0}
      .cleaning-task-index{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:900;flex:0 0 auto}
      .cleaning-task-note{color:#475569;font-size:13px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
      .cleaning-task-actions{display:grid;gap:4px}
      .cleaning-task-actions>.small{font-size:11px;color:#64748b;font-weight:900}
      .cleaning-task-actions .photo-cell{min-width:0}
      .cleaning-task-actions .mail-actions{justify-content:flex-start}
      .cleaning-task-photo-panel{display:grid;gap:4px;min-width:90px}
      .cleaning-task-photo-panel>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:999px;min-height:30px;padding:5px 10px;font-size:13px;font-weight:900;line-height:1}
      .cleaning-task-photo-panel>summary::-webkit-details-marker{display:none}
      .cleaning-task-photo-panel[open]{grid-column:1/-1}
      .cleaning-task-photo-panel[open]>summary{margin-bottom:4px;width:max-content}
      .cleaning-task-photo-panel .photo-cell{min-width:0}
      .cleaning-task-confirm{min-width:110px}
      .cleaning-task-confirm .smallbtn{min-height:30px;padding:5px 10px;font-size:13px}
      .cleaning-task-confirm .task-confirm-item{padding:5px 7px;gap:3px}
      @media(min-width:901px) and (max-width:1300px){.cleaning-work-list{grid-template-columns:1fr}.cleaning-task-note{-webkit-line-clamp:2}}
      .task-guidance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:8px 0 14px}
      .task-guidance-grid .note-card{margin:0;background:#f8fafc}
      .task-guidance-grid ul{margin:8px 0 0;padding-left:18px;color:#475569;font-size:13px;line-height:1.55}
      #recurringTaskManager table{font-size:13px}
      #recurringTaskManager td{vertical-align:top}
      @media(max-width:1200px){.common-area-form{grid-template-columns:1fr 1fr}.common-area-form>.common-area-field:nth-child(2){grid-column:1/-1}.common-area-actions{grid-column:1/-1;justify-content:flex-start}.area-component-list{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}}
      @media(max-width:900px){.room-basics,.channel-grid,.property-edit-grid,.common-area-form,.cleaning-work-list,.cleaning-task-row{grid-template-columns:1fr}.property-module-head,.property-detail-head,.property-actions,.property-card-top,.cleaning-work-head{align-items:stretch}.property-actions>*,.property-card-top>*{width:100%}.property-card-top{flex-direction:column}.common-area-actions{justify-content:flex-start}.common-area-actions>*{width:100%}.cleaning-work-meta{justify-content:flex-start;min-width:0}.cleaning-work-note,.cleaning-task-note{-webkit-line-clamp:unset}}
      @media(max-width:600px){
        header{padding:10px 12px}
        .header-inner{display:grid;grid-template-columns:1fr;gap:8px;align-items:start}
        header h1{font-size:20px;line-height:1.15}
        header .small{font-size:12px}
        main{margin-top:10px;padding:0 8px 72px}
        .nav{gap:6px;align-items:center}
        .nav button,.nav .smallbtn{min-height:36px;padding:7px 10px;font-size:13px}
        #pmsTimezoneWrap,#pmsLanguageWrap{margin-left:0!important;gap:5px!important}
        #pmsTimezoneWrap{flex:1 1 100%}
        #pmsTimezoneSelect{max-width:100%;width:min(100%,330px)}
        #pmsLanguageSelect{min-width:112px}
        .card{padding:10px;margin-bottom:10px}
        .grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px}
        .metric{padding:10px!important;min-width:0}
        .metric .num{font-size:24px!important}
        .tabbar,.toolbar{display:flex;gap:6px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;padding-bottom:2px}
        .tabbar button,.toolbar button,.toolbar .smallbtn{flex:0 0 auto;white-space:nowrap}
        .toolbar input,.toolbar select{flex:0 0 auto;max-width:150px}
        .toolbar>.small{display:none}
        #calendarGrid{gap:4px;padding-bottom:8px}
        #calendarGrid .cell{min-width:52px;min-height:38px;border-radius:7px;padding:4px;font-size:12px;line-height:1.05}
        #calendarGrid .cell.room{min-width:88px;max-width:88px;font-size:12px;line-height:1.15;box-shadow:4px 0 8px rgba(15,23,42,.10)}
        #calendarGrid .cell.head{font-size:11px}
        #calendarGrid .cell .cell-platform{font-size:12px}
        #calendarGrid .cell.locked .cell-platform{font-size:11px}
        .weekend-label{font-size:10px}
        #cleaner .card,#ownerCleaningShell .card{padding:10px}
        .filter-strip{align-items:stretch;gap:8px;padding:8px}
        .filter-field{min-width:0;flex:1 1 140px}
        .filter-actions{width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
        .filter-actions .smallbtn{min-width:0;padding-left:6px;padding-right:6px}
        #cleanerSummary .card{padding:8px 10px;margin-bottom:8px}
        #cleanerSummary h2{font-size:18px;margin:0}
        #cleanerSummary .small{font-size:12px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        #cleanerSummary .badge{font-size:11px;padding:3px 7px}
        #cleanerMetrics{display:flex!important;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:8px;padding-bottom:2px}
        #cleanerMetrics .metric{flex:0 0 86px;padding:7px 8px!important;box-shadow:none}
        #cleanerMetrics .metric .small{font-size:11px;line-height:1.15}
        #cleanerMetrics .metric .num{font-size:20px!important;margin-top:2px}
        #cleanerDashboardShell>.card{padding:8px;margin-bottom:8px}
        body.pms-view-cleaner header{padding:8px 10px}
        body.pms-view-cleaner .header-inner{gap:6px}
        body.pms-view-cleaner header h1{font-size:18px;line-height:1.1}
        body.pms-view-cleaner header h1 + .small{display:none}
        body.pms-view-cleaner .nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;width:100%}
        body.pms-view-cleaner .nav button,body.pms-view-cleaner .nav .smallbtn{min-height:32px;padding:6px 8px;font-size:12px}
        body.pms-view-cleaner #pmsTimezoneWrap{grid-column:1/-1;display:flex;align-items:center}
        body.pms-view-cleaner #pmsTimezoneWrap>span,body.pms-view-cleaner #pmsLanguageWrap>span{font-size:12px}
        body.pms-view-cleaner #pmsTimezoneSelect,body.pms-view-cleaner #pmsLanguageSelect{height:34px;font-size:12px}
        body.pms-view-cleaner .pms-version-badge{justify-self:start;padding:4px 6px;font-size:9px}
        body.pms-view-cleaner main{margin-top:8px}
        body.pms-view-cleaner #cleanerTodayNotes .card{padding:8px 10px;margin-bottom:8px}
        body.pms-view-cleaner #cleanerTodayNotes h2{font-size:16px;margin:0 0 6px}
        body.pms-view-cleaner #cleanerTodayNotes .note-card{padding:7px 8px;margin:6px 0}
        .cleaning-list-card{padding:8px;background:#f8fafc}
        .cleaning-day-list{gap:8px}
        .cleaning-day-head{padding:8px 10px}
        .cleaning-day-head h3{font-size:16px}
        .cleaning-day-total{font-size:17px}
        .cleaning-work-list{gap:10px}
        .cleaning-work-list.compact-tasks{grid-template-columns:1fr}
        .cleaning-work-card{border-radius:8px}
        .cleaning-work-head{display:grid;grid-template-columns:1fr;gap:8px;padding:10px}
        .cleaning-work-title{gap:4px}
        .cleaning-work-name{font-size:16px;gap:6px}
        .cleaning-work-meta{display:grid;grid-template-columns:1fr;gap:6px;justify-content:stretch;min-width:0}
        .cleaning-work-meta .sync-status{justify-content:center;text-align:center}
        .cleaning-work-meta>div{display:grid;gap:4px}
        .cleaning-work-body{padding:10px 10px 10px 18px;gap:8px}
        .cleaning-work-note{font-size:13px;line-height:1.45}
        .cleaning-task-rows{gap:6px}
        .cleaning-task-row{grid-template-columns:minmax(0,1fr) auto auto!important;align-items:center;padding:7px 8px;gap:6px}
        .cleaning-task-main{gap:2px}
        .cleaning-task-title{font-size:14px;line-height:1.18;gap:5px;flex-wrap:nowrap;min-width:0}
        .cleaning-task-title-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .cleaning-task-index{width:20px;height:20px;font-size:11px}
        .cleaning-task-title .sync-status{font-size:11px;padding:2px 6px;white-space:nowrap}
        .cleaning-task-note{font-size:12px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cleaning-task-actions{border-top:0;padding-top:0}
        .cleaning-task-actions>.small{display:none}
        .cleaning-task-photo-panel{min-width:0;justify-self:end}
        .cleaning-task-photo-panel>summary{min-height:34px;padding:7px 9px;font-size:13px}
        .cleaning-task-photo-panel[open]{grid-column:1/-1;justify-self:stretch;border-top:1px dashed #d8e1ef;padding-top:6px}
        .cleaning-task-photo-panel[open]>summary{width:max-content}
        .cleaning-task-confirm{min-width:0;justify-self:end}
        .cleaning-task-confirm .mail-actions{display:flex;gap:6px;justify-content:flex-end}
        .cleaning-task-confirm .smallbtn{width:auto;min-height:34px;justify-content:center;padding:7px 10px;font-size:13px}
        .cleaning-task-confirm .task-defer-btn{padding-left:8px;padding-right:8px}
        .photo-cell{gap:6px;min-width:0}
        .photo-cell .mail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .photo-cell .mail-actions .smallbtn{width:100%;min-height:38px;justify-content:center;padding:8px 10px}
        .task-confirm-item{padding:0;border:0;background:transparent}
        .photo-thumb{width:46px;height:46px}
        .sync-status,.badge{white-space:normal;text-align:center}
        #cleaner .cleaning-list-card{padding:0;background:transparent;border:0;box-shadow:none}
        #cleaner .cleaning-work-list{gap:8px}
        #cleaner .cleaning-work-head{gap:5px;padding:6px 8px}
        #cleaner .cleaning-work-name{font-size:14px;gap:4px}
        #cleaner .cleaning-work-name .badge{font-size:10px;padding:2px 6px}
        #cleaner .cleaning-work-title>.small{font-size:11px}
        #cleaner .cleaning-work-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
        #cleaner .cleaning-work-meta .sync-status{font-size:10px;padding:2px 6px;width:auto}
        #cleaner .cleaning-work-meta>div{font-size:12px}
        #cleaner .cleaning-work-meta>div .sync-status{display:inline-flex}
        #cleaner .cleaning-work-body{padding:6px 7px 6px 15px;gap:5px}
        #cleaner .cleaning-work-note{font-size:11px;line-height:1.2;color:#64748b}
        #cleaner .cleaning-task-rows{gap:5px}
        #cleaner .cleaning-task-row{grid-template-columns:minmax(0,1fr) 72px 72px!important;align-items:start;padding:6px 7px;gap:5px}
        #cleaner .cleaning-task-row.compact{grid-template-columns:minmax(0,1fr) 68px!important;align-items:center;padding:4px 6px;gap:5px}
        #cleaner .cleaning-task-main{gap:3px}
        #cleaner .cleaning-task-title{font-size:14px;line-height:1.18;gap:4px;flex-wrap:wrap}
        #cleaner .cleaning-task-index{width:18px;height:18px;font-size:10px}
        #cleaner .cleaning-task-title-text{white-space:normal;overflow:visible;text-overflow:clip;flex:1 1 110px}
        #cleaner .cleaning-task-title .sync-status{font-size:10px;padding:1px 5px;margin-left:auto}
        #cleaner .cleaning-task-note{font-size:13px;line-height:1.3;white-space:normal;overflow:visible;text-overflow:clip;color:#334155}
        #cleaner .cleaning-task-row.compact .cleaning-task-note{font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#64748b}
        #cleaner .cleaning-task-photo-panel{justify-self:stretch;width:72px}
        #cleaner .cleaning-task-photo-panel>summary{width:100%;min-height:28px;padding:5px 6px;font-size:12px}
        #cleaner .cleaning-task-photo-panel[open]{grid-column:1/-1;width:100%}
        #cleaner .cleaning-task-confirm{justify-self:stretch;width:72px}
        #cleaner .cleaning-task-confirm .mail-actions{display:grid;grid-template-columns:1fr;gap:4px}
        #cleaner .cleaning-task-confirm .smallbtn{width:100%;min-height:28px;padding:5px 6px;font-size:12px}
        #cleaner .cleaning-task-confirm .sync-status{min-height:28px;padding:4px 6px;font-size:10px}
        #cleaner .photo-thumb{width:44px;height:44px}
      }
      @media(max-width:380px){
        .photo-cell .mail-actions{grid-template-columns:1fr}
        .cleaning-task-row{grid-template-columns:minmax(0,1fr) auto!important}
        .cleaning-task-confirm{grid-column:1/-1;justify-self:stretch}
        .cleaning-task-confirm .mail-actions{justify-content:stretch}
        .cleaning-task-confirm .smallbtn{flex:1}
        .cleaning-work-name{font-size:15px}
        #cleaner .cleaning-task-row{grid-template-columns:minmax(0,1fr) 68px!important}
        #cleaner .cleaning-task-row.compact{grid-template-columns:minmax(0,1fr) 64px!important}
        #cleaner .cleaning-task-confirm{grid-column:2;grid-row:2;width:68px}
        #cleaner .cleaning-task-photo-panel{width:68px}
        #cleaner .cleaning-task-note{font-size:12px;line-height:1.28}
      }
    `;
    document.head.appendChild(style);
  }

  function platformBadge(platform){
    const p = String(platform || 'Airbnb');
    const cls = p === 'Airbnb' ? 'blue' : p === 'Booking' ? 'green' : p === 'Vrbo' ? 'yellow' : p === 'Other' ? 'purple' : '';
    return `<span class="badge ${cls}">${esc(p)}</span>`;
  }
  function objectBadge(type){
    const label = type === 'common' ? (currentLanguage() === 'zh-CN' ? '公区' : (currentLanguage() === 'es-ES' ? 'Área' : 'Common area')) : t('common.room');
    return `<span class="badge ${type === 'common' ? 'orange' : ''}">${esc(label)}</span>`;
  }
  function priorityBadge(value){
    const important = value === '重要';
    const label = important ? (currentLanguage() === 'zh-CN' ? '重要' : (currentLanguage() === 'es-ES' ? 'Importante' : 'Important')) : t('common.normal');
    return `<span class="badge ${important ? 'red' : 'blue'}">${esc(label)}</span>`;
  }
  function changeBadge(value){
    const add = value === 'add';
    const label = add ? (currentLanguage() === 'zh-CN' ? '额外增加' : (currentLanguage() === 'es-ES' ? 'Agregar limpieza' : 'Extra cleaning')) : (currentLanguage() === 'zh-CN' ? '取消保洁' : (currentLanguage() === 'es-ES' ? 'Cancelar limpieza' : 'Cancel cleaning'));
    return `<span class="badge ${add ? 'green' : 'red'}">${esc(label)}</span>`;
  }

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
  function lockReason(b){
    const text = String((b && (b.lock_reason || b.lockReason || b.status || b.summary || b.reason)) || '');
    if(text) return displayDataText(text);
    if(currentLanguage() === 'zh-CN') return '手动不开放锁定';
    return currentLanguage() === 'es-ES' ? 'Bloqueo manual' : 'Manual block';
  }
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
  function checkoutAttachKey(row){
    return cleanTargetKey(row);
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
    if(row.subtasks || base.subtasks) base.subtasks = (base.subtasks || []).concat(row.subtasks || []);
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
        dateRange(s,e).forEach(date => rows.push({date, target_id: area.id, target_type: 'common', source: commonAreaKindLabel(area), type: 'system_common', actual: true, reason: commonAreaReason(area)}));
      }
    });
    return rows;
  }
  function getRecurringTaskNotes(includeInactive=false){
    return getNotes().filter(n => n && n.recurring_task && !n.deleted && (includeInactive || (!n.inactive && n.enabled !== false)));
  }
  function weekdayName(value){
    return ['周日','周一','周二','周三','周四','周五','周六'][Number(value || 0)] || '周一';
  }
  function recurringScheduleText(note){
    const type = note.schedule_type || 'interval';
    if(type === 'daily') return '每天';
    if(type === 'weekly') return '每周 ' + weekdayName(note.weekday || 1);
    return '约每 ' + Math.max(1, Number(note.interval_days || 30)) + ' 天';
  }
  function baseCleaningLoad(date, applyOwnerScope){
    return systemCleaningRowsImpl().concat(commonAreaRowsImpl(date,date)).filter(r => {
      if(r.date !== date) return false;
      return !applyOwnerScope || targetMatches(r.target_id, r.target_type || 'room');
    }).length;
  }
  function chooseRecurringTaskDate(note, dueDate, start, end, applyOwnerScope){
    const flex = note.workload_sensitive === false ? 0 : Math.max(0, Math.min(60, Number(note.flex_days || 0)));
    const candidates = [];
    for(let offset = -flex; offset <= flex; offset++){
      const d = addDay(dueDate, offset);
      if((start && d < start) || (end && d > end)) continue;
      if(note.start_date && d < note.start_date) continue;
      candidates.push({date:d, offset:Math.abs(offset), load:baseCleaningLoad(d, applyOwnerScope)});
    }
    candidates.sort((a,b) => a.load - b.load || a.offset - b.offset || String(a.date).localeCompare(String(b.date)));
    return candidates[0] ? candidates[0].date : '';
  }
  function roomCheckoutDates(roomId,start,end){
    const entity = roomEntityId(roomId);
    return Array.from(new Set(realBookingsImpl().filter(b => roomEntityId(b.room_id) === entity && (!start || b.checkout >= start) && (!end || b.checkout <= end)).map(b => b.checkout).filter(Boolean))).sort();
  }
  function chooseCheckoutTaskDate(note,dueDate,start,end){
    const flex = Math.max(0, Math.min(60, Number(note.flex_days || 0)));
    const scanStart = addDay(dueDate, -flex);
    const scanEnd = addDay(dueDate, flex || 1);
    let candidates = roomCheckoutDates(note.target_id, scanStart, scanEnd).filter(d => (!start || d >= start) && (!end || d <= end));
    if(!candidates.length){
      candidates = roomCheckoutDates(note.target_id, dueDate, addDay(dueDate, Math.max(60, Number(note.interval_days || 30) + flex))).filter(d => (!start || d >= start) && (!end || d <= end));
    }
    const scored = candidates.map(date => ({date, offset:Math.abs(daysBetweenSafe(dueDate,date)), load:baseCleaningLoad(date,true)}));
    scored.sort((a,b) => a.offset - b.offset || a.load - b.load || String(a.date).localeCompare(String(b.date)));
    return scored[0] ? scored[0].date : '';
  }
  function nextCheckoutDateForRoom(roomId,afterDate){
    return roomCheckoutDates(roomId, addDay(afterDate,1), addDay(afterDate,365))[0] || '';
  }
  function applyRecurringDeferrals(note,dates,start,end){
    const map = new Map();
    const skip = new Set();
    (Array.isArray(note && note.deferred_occurrences) ? note.deferred_occurrences : []).forEach(d => {
      const from = String(d.from_date || '').slice(0,10);
      const to = String(d.to_date || '').slice(0,10);
      if(from && to){
        skip.add(from);
        map.set(from,to);
      }
    });
    const out = [];
    dates.forEach(date => {
      if(skip.has(date)){
        const to = map.get(date);
        if(to && (!start || to >= start) && (!end || to <= end)) out.push(to);
      }else{
        out.push(date);
      }
    });
    (Array.isArray(note && note.deferred_occurrences) ? note.deferred_occurrences : []).forEach(d => {
      const to = String(d.to_date || '').slice(0,10);
      if(to && (!start || to >= start) && (!end || to <= end)) out.push(to);
    });
    return Array.from(new Set(out)).sort();
  }
  function recurringDatesForNote(note,start,end,applyOwnerScope=true){
    if(!note || !note.target_id) return [];
    const type = note.schedule_type || 'interval';
    const first = effectiveRecurringStartDate(note, normalizeDateInputValue(note.start_date) || normalizeDateInputValue(note.date) || String(note.created_at || '').slice(0,10) || today());
    const out = [];
    const seen = new Set();
    if(type === 'daily'){
      const dates = note.attach_to_checkout ? roomCheckoutDates(note.target_id,start,end) : dateRange(start,end);
      dates.forEach(d => {
        if(d >= first && !seen.has(d)){seen.add(d); out.push(d);}
      });
      return applyRecurringDeferrals(note,out,start,end);
    }
    if(type === 'weekly'){
      const weekday = Number(note.weekday || 1);
      dateRange(start,end).forEach(d => {
        if(d >= first && parseDate(d).getDay() === weekday && !seen.has(d)){
          const selected = note.attach_to_checkout ? chooseCheckoutTaskDate(note,d,start,end) : d;
          if(selected && !seen.has(selected)){seen.add(selected); out.push(selected);}
        }
      });
      return applyRecurringDeferrals(note,out,start,end);
    }
    const interval = Math.max(1, Number(note.interval_days || 30));
    const flex = note.workload_sensitive === false ? 0 : Math.max(0, Math.min(60, Number(note.flex_days || 0)));
    let due = first;
    const scanStart = addDay(start, -flex);
    const scanEnd = addDay(end, flex);
    while(due < scanStart) due = addDay(due, interval);
    while(due <= scanEnd){
      const selected = note.attach_to_checkout ? chooseCheckoutTaskDate(note, due, start, end) : chooseRecurringTaskDate(note, due, start, end, applyOwnerScope);
      if(selected && !seen.has(selected)){
        seen.add(selected);
        out.push(selected);
      }
      due = addDay(due, interval);
    }
    return applyRecurringDeferrals(note,out,start,end);
  }
  function recurringTaskRows(start,end,applyOwnerScope=true){
    const rows = [];
    getRecurringTaskNotes().forEach(note => {
      const type = note.target_type || 'room';
      if(applyOwnerScope && !targetMatches(note.target_id,type)) return;
      recurringDatesForNote(note,start,end,applyOwnerScope).forEach(date => {
        if(holdDefaultDeepRoomTask(note,date)) return;
        rows.push({
          id: 'recurring_task_' + safe(note.id || '') + '_' + safe(date),
          date,
          target_id: note.target_id,
          target_type: type,
          source: note.task_mode === 'deep' ? '深度保洁' : '周期任务',
          type: 'recurring_task',
          actual: true,
          reason: [note.title || '周期保洁任务', note.note || ''].filter(Boolean).join('：'),
          amount: Number(note.amount || 0),
          note_task: true,
          recurring_task: true,
          note_id: note.id || '',
          priority: note.priority || '普通',
          schedule_text: recurringScheduleText(note),
          attach_to_checkout: !!note.attach_to_checkout,
          can_defer: note.can_defer !== false,
          task_note: note
        });
      });
    });
    return rows;
  }
  function cleaningSubtaskFromRow(row){
    const note = row.task_note || {};
    const key = [row.date, row.target_type || 'room', row.target_id, row.note_id || row.id || row.title || row.reason].map(x => String(x || '')).join('|');
    return {
      key,
      date: row.date,
      target_id: row.target_id,
      target_type: row.target_type || 'room',
      title: displayDataText(note.title || row.title || row.source || t('cleaning.task')),
      note: displayDataText(note.note || row.reason || ''),
      source: displayDataText(row.source || ''),
      amount: Number(row.amount || 0),
      can_defer: note.can_defer !== false && row.can_defer !== false,
      note_id: row.note_id || '',
      template_id: note.template_id || row.template_id || '',
      default_task_key: note.default_task_key || row.default_task_key || '',
      default_room_task: !!(note.default_room_task || row.default_room_task),
      required: true
    };
  }
  function attachRecurringRowsToCleanings(rows,recurringRows){
    const out = (rows || []).map(r => ({...r}));
    const byCheckout = new Map();
    out.forEach(row => {
      if((row.target_type || 'room') === 'room' && (row.booking || row.type === 'system')) byCheckout.set(checkoutAttachKey(row), row);
    });
    (recurringRows || []).forEach(task => {
      if(task.attach_to_checkout && (task.target_type || 'room') === 'room'){
        const base = byCheckout.get(checkoutAttachKey(task));
        if(base){
          base.subtasks = base.subtasks || [];
          base.subtasks.push(cleaningSubtaskFromRow(task));
          return;
        }
      }
      out.push(task);
    });
    return out;
  }
  function noteTaskRows(start,end,applyOwnerScope=true){
    return getNotes().filter(n => {
      const type = n.target_type || 'room';
      return n.date && !n.recurring_task && !n.cancellation_review && (!start || n.date >= start) && (!end || n.date <= end) && (!applyOwnerScope || targetMatches(n.target_id,type)) && n.amount_present;
    }).map(n => ({date:n.date,target_id:n.target_id,target_type:n.target_type || 'room',source:'事项',type:'note_task',actual:true,reason:n.note || '',amount:Number(n.amount || 0),note_task:true,note_id:n.id || ''}));
  }
  function manualRemoveMatchesRow(remove,row){
    if(!remove || !row) return false;
    const type = remove.target_type || 'room';
    return String(row.date || '').slice(0,10) === String(remove.date || '').slice(0,10)
      && String(row.target_id || '') === String(remove.target_id || '')
      && (row.target_type || 'room') === type;
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
  function cancelReviewResolvedByCurrentBooking(note){
    if(!note || String(note.owner_review_status || 'pending') !== 'pending') return false;
    const targetId = String(note.target_id || '');
    const oldIn = String(note.checkin || '').slice(0,10);
    const oldOut = String(note.checkout || '').slice(0,10);
    if(!targetId || !oldIn || !oldOut) return false;
    return ownerRealBookings().some(b => {
      if(String(b.room_id || '') !== targetId) return false;
      const newIn = String(b.checkin || '').slice(0,10);
      const newOut = String(b.checkout || '').slice(0,10);
      if(!newIn || !newOut) return false;
      if(newIn === oldIn || newOut === oldOut) return true;
      const overlapStart = newIn > oldIn ? newIn : oldIn;
      const overlapEnd = newOut < oldOut ? newOut : oldOut;
      const overlapDays = daysBetweenSafe(overlapStart, overlapEnd);
      const oldDays = daysBetweenSafe(oldIn, oldOut);
      const contained = (newIn <= oldIn && newOut >= oldOut) || (oldIn <= newIn && oldOut >= newOut);
      return contained && overlapDays >= Math.max(2, Math.min(3, oldDays || 0));
    });
  }
  function cancelReviewTaskRows(start,end,includePending=false,applyOwnerScope=true){
    const out = [];
    getNotes().forEach(note => {
      if(!note || !note.cancellation_review || note.inactive || note.deleted) return;
      if(cancelReviewResolvedByCurrentBooking(note)) return;
      const type = note.target_type || 'room';
      if(applyOwnerScope && !targetMatches(note.target_id,type)) return;
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
          source: note.review_task_label || note.review_source || (status === 'clean_needed' ? '房东确认退房保洁' : '订单消失待确认'),
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
  function actualCleaningRowsImpl(start,end,applyOwnerScope=true){
    const s = start || addDay(today(), -90);
    const e = end || addDay(today(), 180);
    const rows = systemCleaningRowsImpl().concat(commonAreaRowsImpl(s,e));
    const manualRemoves = [];
    getManual().forEach(m => {
      const type = m.target_type || 'room';
      if(m.type === 'add'){
        rows.push({date:m.date,target_id:m.target_id,target_type:type,source:m.source || '手动增加',type:'manual_add',actual:true,reason:m.reason || '',amount:Number(m.amount || targetFee(m.target_id,type))});
      }else if(m.type === 'remove'){
        manualRemoves.push({...m,target_type:type});
        rows.forEach(r => {
          if(r.date === m.date && String(r.target_id) === String(m.target_id) && (r.target_type || 'room') === type){
            r.actual = false;
            r.reason = '房东取消：' + (m.reason || '');
          }
        });
      }
    });
    const recurringRows = recurringTaskRows(s,e,applyOwnerScope);
    const mergedRows = attachRecurringRowsToCleanings(rows.filter(r => r.actual).concat(noteTaskRows(s,e,applyOwnerScope)), recurringRows);
    const finalRows = mergedRows.concat(cancelReviewTaskRows(s,e,false,applyOwnerScope)).filter(row => {
      if(row && row.type === 'manual_add') return true;
      return !manualRemoves.some(remove => manualRemoveMatchesRow(remove,row));
    });
    return dedupeCleaningRowsImpl(finalRows);
  }
  function scopedCleaningRows(start,end){
    return actualCleaningRowsImpl(start,end).filter(r => targetMatches(r.target_id, r.target_type));
  }
  function rowAmount(row){
    if(row.cancel_review_task && String(row.review_status || 'pending') !== 'clean_needed') return 0;
    const subtaskAmount = cleaningRowItems(row).filter(item => !item.main_task).reduce((sum,item) => sum + Number(item.amount || 0), 0);
    if(row.recurring_task) return Number(row.amount || 0);
    if(row.type === 'manual_add' || row.note_task) return Number(row.amount || targetFee(row.target_id,row.target_type));
    return targetFee(row.target_id,row.target_type) + subtaskAmount;
  }
  function rowFeeText(row){
    if(row.cancel_review_task && String(row.review_status || 'pending') !== 'clean_needed') return `<span class="sync-status warn">${esc(t('cleaning.pendingConfirm'))}</span>`;
    const amount = money(rowAmount(row));
    if(!cleaningConfirmRequired(row)) return amount;
    const items = cleaningRowItems(row);
    if(items.length && !cleaningRowComplete(row)) return `${amount}<div class="sync-status warn">${esc(t('cleaning.incompleteNoPay'))}</div>`;
    if(items.length) return `${amount}<div class="sync-status ok">${esc(t('cleaning.donePayable'))}</div>`;
    return amount;
  }
  function cleaningRowMainTask(row){
    const type = row.target_type || 'room';
    const title = row.cancel_review_task ? t('cleaning.ownerConfirmCheckout') : (type === 'common' ? t('cleaning.commonDaily') : t('cleaning.checkoutBasic'));
    const key = [row.date,type,row.target_id,row.type || '',row.review_note_id || row.note_id || '',title].map(x => String(x || '')).join('|');
    return {
      key,
      date: row.date,
      target_id: row.target_id,
      target_type: type,
      title,
      note: displayDataText(row.reason || ''),
      source: displayDataText(row.source || ''),
      amount: 0,
      can_defer: false,
      required: true,
      main_task: true
    };
  }
  function isHeldDefaultDeepSubtask(row,item){
    if(!defaultDeepTaskInRamp((item && item.date) || (row && row.date))) return false;
    const ref = [
      item && item.template_id,
      item && item.templateId,
      item && item.default_task_key,
      item && item.defaultTaskKey,
      item && item.note_id,
      item && item.noteId,
      item && item.id,
      item && item.key
    ].join('|');
    return !!defaultDeepTaskTemplateId(ref);
  }
  function cleaningRowItems(row){
    if(!row || !row.date || !row.target_id) return [];
    const subtasks = (Array.isArray(row.subtasks) ? row.subtasks : []).filter(item => item && item.key && !isHeldDefaultDeepSubtask(row,item));
    return sortCleaningRowItems(row, subtasks.length ? subtasks : [cleaningRowMainTask(row)]);
  }
  function cleaningItemImportance(item,index){
    const id = String((item && (item.template_id || item.templateId || item.note_id || item.noteId || item.id)) || '').toLowerCase();
    const text = [id, item && item.title, item && item.note, item && item.source].map(v => String(v || '').toLowerCase()).join(' ');
    let score = 500 + Number(index || 0);
    if(item && item.main_task) score -= 450;
    if(id.includes('checkout_turnover_standard') || /基础|退房|turnover|checkout/.test(text)) score -= 420;
    if(item && item.can_defer === false) score -= 120;
    if(/厨卫|卫生|马桶|排水|水垢|bath|kitchen|drain/.test(text)) score -= 70;
    if(/耗材|布草|库存|supply|linen/.test(text)) score -= 50;
    if(/防虫|pest/.test(text)) score -= 30;
    if(id.includes('weekly')) score += 20;
    if(id.includes('biweekly')) score += 80;
    if(id.includes('monthly')) score += 140;
    if(id.includes('quarterly')) score += 220;
    if(item && item.can_defer !== false) score += 90;
    if(item && item.key && subtaskDone(item.key)) score += 1000;
    return score;
  }
  function sortCleaningRowItems(row,items){
    return (items || []).map((item,index) => ({item,index,score:cleaningItemImportance(item,index)}))
      .sort((a,b) => a.score - b.score || a.index - b.index)
      .map(x => x.item);
  }
  function cleaningConfirmRequired(row){
    if(!row || !row.date) return false;
    if(cleaningRowItems(row).some(item => !item.main_task)) return true;
    return String(row.date) >= CLEANING_CONFIRM_REQUIRED_FROM;
  }
  function subtaskConfirmation(key){
    const target = String(key || '');
    for(let i=getConfirmations().length - 1;i>=0;i--){
      const row = getConfirmations()[i] || {};
      const rowKey = String(row.task_key || row.taskKey || '');
      const status = String(row.status || '').trim().toLowerCase();
      const done = row.completed === true || ['done','completed','已完成','完成'].includes(status);
      if(rowKey === target && done) return row;
    }
    return null;
  }
  function subtaskDone(key){return !!subtaskConfirmation(key);}
  function cleaningRowComplete(row){
    if(!cleaningConfirmRequired(row)) return true;
    const items = cleaningRowItems(row);
    return !!items.length && items.every(item => subtaskDone(item.key));
  }
  function cleaningTaskDetails(row){
    const base = `${esc(row.reason || '')}${row.cancel_review_task ? '' : inlineNotes(row.date,row.target_id,row.target_type)}`;
    if(row.cancel_review_task) return base;
    if(!cleaningConfirmRequired(row)) return base;
    const items = cleaningRowItems(row);
    if(!items.length) return base;
    const list = items.map(item => {
      const done = subtaskDone(item.key);
      const cls = done ? 'done' : 'pending';
      const status = done ? '已完成' : '待完成';
      return `<div class="clean-subtask ${cls}"><div class="clean-subtask-title"><span>${esc(item.title || '保洁任务')}</span><span class="sync-status ${done ? 'ok' : 'warn'}">${status}</span></div>${item.note ? `<div class="small">${esc(item.note)}</div>` : ''}</div>`;
    }).join('');
    return `${base}<div class="clean-subtask-list">${list}</div>`;
  }
  function roomDateNoteFor(date, roomId){return getRoomNotes().filter(n => n.date === date && String(n.room_id) === String(roomId));}
  function noteFor(date,targetId,targetType){return getNotes().filter(n => !n.recurring_task && n.date === date && String(n.target_id) === String(targetId) && (n.target_type || 'room') === (targetType || 'room'));}
  function inlineNotes(date,targetId,targetType){
    const all = noteFor(date,targetId,targetType).filter(n => !n.cancellation_review).concat((targetType === 'room' ? roomDateNoteFor(date,targetId).map(n => ({...n,target_id:n.room_id,target_type:'room',roomDate:true})) : []));
    if(!all.length) return '';
    return all.map(n => `<div class="note-card ${n.priority === '重要' ? 'important' : ''}"><div class="note-title">${priorityBadge(n.priority)} ${esc(targetName(n.target_id,n.target_type))} ${n.roomDate ? '日期事项' : '事项'}</div><div>${esc(n.note)}</div></div>`).join('');
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
  function cleaningPhotoTaskKey(row,item=null){
    if(item && item.key) return 'subtask|' + String(item.key);
    return [row && row.date, row && (row.target_type || 'room'), row && row.target_id, row && (row.type || ''), row && (row.source || ''), row && (row.review_note_id || row.note_id || '')].map(x => String(x || '')).join('|');
  }
  function cleaningPhotosForRow(row,item=null){
    const key = cleaningPhotoTaskKey(row,item);
    return getPhotos().filter(p => p && String(p.task_key || p.taskKey || '') === key);
  }
  function cleaningPhotosForWork(row,items=[]){
    const keys = new Set([cleaningPhotoTaskKey(row,null)]);
    (items || []).forEach(item => keys.add(cleaningPhotoTaskKey(row,item)));
    return getPhotos().filter(p => p && keys.has(String(p.task_key || p.taskKey || '')));
  }
  function cleaningPhotoControls(row,item=null,options={}){
    if(!row || !row.date || !row.target_id) return '';
    const key = cleaningPhotoTaskKey(row,item);
    ui.photoRows[key] = {
      date: (item && item.date) || row.date,
      target_id: (item && item.target_id) || row.target_id,
      target_type: (item && item.target_type) || row.target_type || 'room',
      task_key: key,
      subtask_key: item && item.key || '',
      subtask_title: item && item.title || ''
    };
    const cameraId = 'cleanPhotoCamera_' + safe(key);
    const fileId = 'cleanPhotoFile_' + safe(key);
    const statusId = 'cleanPhotoStatus_' + safe(key);
    const photos = Array.isArray(options.photos) ? options.photos : cleaningPhotosForRow(row,item);
    const canUpload = row.date <= today();
    const upload = canUpload ? `<div class="mail-actions"><label class="smallbtn" for="${cameraId}">${esc(t('cleaning.camera'))}</label><label class="smallbtn" for="${fileId}">${esc(t('cleaning.uploadMany'))}</label></div><input id="${cameraId}" data-upload-source="camera" type="file" accept="image/*" capture="environment" multiple onchange="uploadCleaningPhoto('${encodeURIComponent(key)}',this)"><input id="${fileId}" data-upload-source="file" type="file" accept="image/*" multiple onchange="uploadCleaningPhoto('${encodeURIComponent(key)}',this)"><div id="${statusId}" class="photo-status"></div>` : '';
    const list = photos.length ? `<div class="photo-thumb-list">${photos.map((p,i) => {
      const href = String(p.url || '').startsWith('/') ? apiUrl(p.url) : String(p.url || '');
      const label = t('cleaning.photoLink', {count: i + 1});
      return `<a class="photo-thumb" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(label)}"><img src="${esc(href)}" alt="${esc(label)}" loading="lazy" decoding="async" fetchpriority="low"><span class="photo-thumb-label">${esc(i + 1)}</span></a>`;
    }).join('')}</div>` : `<span class="small">${esc(t('cleaning.notUploaded'))}</span>`;
    const expiry = photos.length ? `<div class="photo-expiry">${esc(t('cleaning.expires7'))}</div>` : '';
    return `<div class="photo-cell">${upload}${list}${expiry}</div>`;
  }
  function cleaningPhotoColumn(row){
    if(!row || row.cancel_review_task) return cleaningPhotoControls(row);
    const items = cleaningRowItems(row);
    if(items.length <= 1) return cleaningPhotoControls(row, items[0]);
    return `<div class="task-photo-list">${items.map(item => `<div class="task-photo-item"><div class="small"><b>${esc(item.title || t('cleaning.task'))}</b></div>${cleaningPhotoControls(row,item)}</div>`).join('')}</div>`;
  }
  function cleaningWorkPhotoPanel(row,items){
    const photos = cleaningPhotosForWork(row,items);
    const label = photos.length ? t('cleaning.photoN', {count: photos.length}) : t('cleaning.photo');
    return `<details class="cleaning-work-photo-panel"><summary>${esc(label)}</summary>${cleaningPhotoControls(row,null,{photos})}</details>`;
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
    if(type && !type.startsWith('image/')) return dataUrl;
    try{
      const img = await imageFromDataUrl(dataUrl);
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
      if(scale >= 1 && file.size < 450000) return dataUrl;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.width || maxSide) * scale));
      canvas.height = Math.max(1, Math.round((img.height || maxSide) * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let output = canvas.toDataURL('image/jpeg', 0.72);
      if(output.length > 900000){
        const retryScale = Math.min(1, 1024 / Math.max(canvas.width || 1024, canvas.height || 1024));
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.round(canvas.width * retryScale));
        small.height = Math.max(1, Math.round(canvas.height * retryScale));
        const smallCtx = small.getContext('2d');
        smallCtx.drawImage(canvas, 0, 0, small.width, small.height);
        output = small.toDataURL('image/jpeg', 0.68);
      }
      return output;
    }catch(e){
      return dataUrl;
    }
  }
  async function uploadCleaningPhoto(encodedKey,input){
    const key = decodeURIComponent(encodedKey || '');
    const row = ui.photoRows[key];
    const files = Array.from((input && input.files) || []);
    const status = qs('cleanPhotoStatus_' + safe(key));
    const setStatus = (text, kind='') => {
      if(status){
        status.textContent = text || '';
        status.className = 'photo-status' + (kind ? ' ' + kind : '');
      }
    };
    if(!row || !files.length) return;
    const oldTitle = document.title;
    let uploaded = 0;
    try{
      for(const file of files){
        setStatus(t('cleaning.uploading', {done: uploaded + 1, total: files.length}));
        const dataUrl = await prepareCleaningPhoto(file);
        const res = await fetch(apiUrl('/api/cleaning-photo'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({...row, file_name: file.name || `cleaning-photo-${uploaded + 1}.jpg`, content_type: file.type || 'image/jpeg', upload_source: (input && input.dataset && input.dataset.uploadSource) || '', photo_data: dataUrl})
        });
        const raw = await res.text();
        let data = {};
        try{data = raw ? JSON.parse(raw) : {};}catch(e){}
        if(!res.ok || data.ok === false) throw new Error(data.error || raw.slice(0, 200) || ('上传失败 HTTP ' + res.status));
        if(data.photo) upsertCleaningPhoto(data.photo);
        else applyStateFromServerImpl(data.state || data);
        uploaded += 1;
      }
      setStatus(t('cleaning.uploaded', {count: uploaded}), 'ok');
      renderAll();
    }catch(e){
      const message = e && e.message ? e.message : String(e || '未知错误');
      setStatus(t('cleaning.uploadFailedPartial', {done: uploaded, total: files.length, message}), 'error');
      alert(t('cleaning.uploadPhotoFailed', {message}));
    }finally{
      if(input) input.value = '';
      document.title = oldTitle;
    }
  }
  function cleaningConfirmControls(row){
    if(!row) return '';
    if(row.cancel_review_task) return cleaningReviewControls(row);
    if(!cleaningConfirmRequired(row)) return `<span class="sync-status ok">${esc(t('cleaning.history'))}</span>`;
    const items = cleaningRowItems(row);
    if(!items.length) return '';
    const canComplete = row.date <= today();
    return `<div class="task-confirm-list">${items.map(item => {
      const key = String(item.key || '');
      ui.confirmRows[key] = {row, item};
      const doneRow = subtaskConfirmation(key);
      if(doneRow){
        return `<div class="task-confirm-item done"><span class="sync-status ok">${esc(t('cleaning.done'))}</span><div class="small">${esc(doneRow.completed_at || doneRow.created_at || '')}</div></div>`;
      }
      const completeBtn = canComplete ? `<button class="smallbtn primary" onclick="markCleaningSubtaskDone('${encodeURIComponent(key)}',this)">${esc(t('cleaning.done'))}</button>` : `<span class="sync-status warn">${esc(t('cleaning.notDue'))}</span>`;
      const deferBtn = item.can_defer ? `<button class="smallbtn" onclick="deferCleaningSubtask('${encodeURIComponent(key)}',this)">${esc(t('cleaning.deferNextCheckout'))}</button>` : '';
      return `<div class="task-confirm-item"><div class="small">${esc(item.title || t('cleaning.task'))}</div><div class="mail-actions">${completeBtn}${deferBtn}</div></div>`;
    }).join('')}</div>`;
  }
  function cleaningTaskConfirmControl(row,item){
    if(!row) return '';
    if(row.cancel_review_task) return cleaningReviewControls(row);
    if(!cleaningConfirmRequired(row)) return `<span class="sync-status ok">${esc(t('cleaning.history'))}</span>`;
    const key = String((item && item.key) || '');
    ui.confirmRows[key] = {row, item};
    const doneRow = subtaskConfirmation(key);
    if(doneRow) return `<div class="task-confirm-item done"><span class="sync-status ok">${esc(t('cleaning.done'))}</span><div class="small">${esc(doneRow.completed_at || doneRow.created_at || '')}</div></div>`;
    const canComplete = row.date <= today();
    const completeBtn = canComplete ? `<button class="smallbtn primary task-done-btn" onclick="markCleaningSubtaskDone('${encodeURIComponent(key)}',this)">${esc(t('cleaning.done'))}</button>` : `<span class="sync-status warn">${esc(t('cleaning.notDue'))}</span>`;
    const deferBtn = item && item.can_defer ? `<button class="smallbtn task-defer-btn" onclick="deferCleaningSubtask('${encodeURIComponent(key)}',this)">${esc(t('cleaning.deferNext'))}</button>` : '';
    return `<div class="mail-actions">${completeBtn}${deferBtn}</div>`;
  }
  function cleaningTaskRow(row,item,index,total,options={}){
    const done = subtaskDone(item.key);
    const cls = done ? 'done' : 'pending';
    const status = done ? `<span class="sync-status ok">${esc(t('cleaning.done'))}</span>` : `<span class="sync-status warn">${esc(t('cleaning.pending'))}</span>`;
    const photoCount = cleaningPhotosForRow(row,item).length;
    const photoLabel = photoCount ? t('cleaning.photoN', {count: photoCount}) : t('cleaning.photo');
    const compact = options.compact === true;
    const photo = compact ? '' : `<details class="cleaning-task-photo-panel"><summary>${esc(photoLabel)}</summary>${cleaningPhotoControls(row,item)}</details>`;
    return `<div class="cleaning-task-row ${compact ? 'compact' : ''} ${cls}"><div class="cleaning-task-main"><div class="cleaning-task-title"><span class="cleaning-task-index">${index + 1}</span><span class="cleaning-task-title-text">${esc(item.title || t('cleaning.task'))}</span>${status}</div>${item.note ? `<div class="cleaning-task-note">${esc(item.note)}</div>` : ''}</div>${photo}<div class="cleaning-task-actions cleaning-task-confirm">${cleaningTaskConfirmControl(row,item)}</div></div>`;
  }
  function cleaningRowProgressBadge(row){
    if(row.cancel_review_task) return cleaningReviewControls(row);
    if(!cleaningConfirmRequired(row)) return `<span class="sync-status ok">${esc(t('cleaning.history'))}</span>`;
    const items = cleaningRowItems(row);
    const done = items.filter(item => subtaskDone(item.key)).length;
    const cls = done === items.length ? 'ok' : 'warn';
    return `<span class="sync-status ${cls}">${esc(t('cleaning.progress', {done, total: items.length}))}</span>`;
  }
  function cleaningWorkCard(row,showProp,showSource,options={}){
    const type = row.target_type || 'room';
    const prop = showProp ? `<span class="badge blue">${esc(propName(targetPropId(row.target_id,type)))}</span>` : '';
    const source = showSource && row.source ? `<span class="badge">${esc(displayDataText(row.source))}</span>` : '';
    const title = esc(targetName(row.target_id,type));
    const items = (!row.cancel_review_task && cleaningConfirmRequired(row)) ? cleaningRowItems(row) : [];
    const baseNote = esc(displayDataText(row.reason || ''));
    const inline = inlineNotes(row.date,row.target_id,type);
    const note = row.cancel_review_task ? baseNote : ((type === 'common' && row.type === 'system_common' && items.length) ? inline : `${baseNote}${inline}`);
    const noteBlock = note ? `<div class="cleaning-work-note">${note}</div>` : '';
    const body = row.cancel_review_task
      ? `<div class="cleaning-work-note">${note}</div><div>${cleaningReviewControls(row)}</div>`
      : `${noteBlock}${items.length ? `${options.compactTasks ? cleaningWorkPhotoPanel(row,items) : ''}<div class="cleaning-task-rows">${items.map((item,i) => cleaningTaskRow(row,item,i,items.length,{compact: options.compactTasks === true})).join('')}</div>` : `<div class="cleaning-task-rows"><div class="cleaning-task-row done"><div class="cleaning-task-main"><div class="cleaning-task-title"><span>${esc(displayDataText(row.reason || t('cleaning.record')))}</span><span class="sync-status ok">${esc(t('cleaning.noItemConfirm'))}</span></div></div><div></div><div>${cleaningConfirmControls(row)}</div></div></div>`}`;
    return `<div class="cleaning-work-card ${row.date === today() ? 'today' : ''} ${row.cancel_review_task ? 'review' : ''}"><div class="cleaning-work-head"><div class="cleaning-work-title"><div class="cleaning-work-name">${objectBadge(type)} <span>${title}</span>${prop}${source}</div><div class="small">${esc(t('cleaning.date', {date: row.date}))}</div></div><div class="cleaning-work-meta">${cleaningRowProgressBadge(row)}<div>${rowFeeText(row)}</div></div></div><div class="cleaning-work-body">${body}</div></div>`;
  }
  function cleaningTableScoped(items, showSource=true, options={}){
    const rows = dedupeCleaningRowsImpl(items || []).sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const empty = `<p class="small">${esc(t('cleaning.noRecords'))}</p>`;
    if(!rows.length) return options.wrapCard === false ? `<div class="empty-panel">${empty}</div>` : `<div class="card">${empty}</div>`;
    const showProp = ownerPropIds().length !== 1;
    const list = `<div class="cleaning-work-list ${options.compactTasks ? 'compact-tasks' : ''}">${rows.map(row => cleaningWorkCard(row,showProp,showSource,options)).join('')}</div>`;
    return options.wrapCard === false ? list : `<div class="card cleaning-list-card">${list}</div>`;
  }
  function cleaningRowsByDayHtml(items,options={}){
    const rows = dedupeCleaningRowsImpl(items || []);
    if(!rows.length) return `<div class="card"><p class="small">${esc(t('cleaning.noRecords'))}</p></div>`;
    const groups = new Map();
    rows.forEach(row => {
      const date = String(row.date || '');
      if(!groups.has(date)) groups.set(date, []);
      groups.get(date).push(row);
    });
    const desc = options.order === 'desc';
    const entries = Array.from(groups.entries()).sort((a,b) => desc ? String(b[0]).localeCompare(String(a[0])) : String(a[0]).localeCompare(String(b[0])));
    return `<div class="cleaning-day-list">${entries.map(([date,list]) => {
      list.sort((a,b) => targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
      const roomCount = new Set(list.filter(r => (r.target_type || 'room') === 'room').map(r => String(r.target_id || ''))).size;
      const commonCount = list.filter(r => r.target_type === 'common').length;
      const total = list.reduce((sum,row) => sum + rowAmount(row), 0);
      return `<div class="cleaning-day"><div class="cleaning-day-head"><div><h3>${esc(date)}</h3><div class="small">房间 ${roomCount} 个 · 公区 ${commonCount} 个 · 共 ${list.length} 条</div></div><div class="cleaning-day-total">${money(total)}</div></div>${cleaningTableScoped(list, options.showSource !== false, {wrapCard:false, compactTasks:true})}</div>`;
    }).join('')}</div>`;
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
    return `<button type="button" class="smallbtn" onclick="openPropertyMailInRooms('${esc(propertyId)}')">${esc(t('owner.property.mail', {count}))}</button>`;
  }
  function propertyCard(prop){
    const rooms = propRooms(prop.id);
    const areas = propAreas(prop.id);
    const cleaners = propCleaners(prop.id);
    const editing = ui.editingProperty === prop.id;
    const checked = ownerPropIds().includes(prop.id);
    const tz = propertyTimeZone(prop);
    const nameBlock = editing
      ? `<div class="property-edit-grid"><label>${esc(t('owner.property.name'))}<input id="propertyName_${safe(prop.id)}" value="${esc(prop.name || '')}" placeholder="901"></label><label>${esc(t('owner.property.city'))}<input id="propertyCity_${safe(prop.id)}" value="${esc(propertyCity(prop))}" placeholder="Los Angeles"></label><label>${esc(t('owner.property.address'))}<input id="propertyAddress_${safe(prop.id)}" value="${esc(propertyAddress(prop))}" placeholder="Los Angeles, CA"></label><label>${esc(t('owner.property.timezone'))}<select id="propertyTimezone_${safe(prop.id)}">${timeZoneOptions(tz)}</select></label><div class="property-edit-actions"><button class="smallbtn primary" onclick="savePropertyName('${esc(prop.id)}',this)">${esc(t('owner.property.save'))}</button><button class="smallbtn" onclick="cancelPropertyNameEdit()">${esc(t('owner.property.cancel'))}</button></div></div>`
      : `<div class="property-title">${esc(t('owner.property.prefix'))}${esc(prop.name || prop.id)}</div><div class="property-location">${esc(propertyLocationText(prop))} · ${esc(tz)}</div>`;
    const actions = editing
      ? `<button class="smallbtn primary" onclick="openPropertyRooms('${esc(prop.id)}')">${esc(t('owner.property.openRooms'))}</button>`
      : `<button class="smallbtn" onclick="editPropertyName('${esc(prop.id)}')">${esc(t('owner.property.edit'))}</button><button class="smallbtn primary" onclick="openPropertyRooms('${esc(prop.id)}')">${esc(t('owner.property.openRooms'))}</button><button class="smallbtn" onclick="setOnlyOwnerProperty('${esc(prop.id)}')">${esc(t('owner.property.only'))}</button><button class="smallbtn" onclick="deletePropertyUi('${esc(prop.id)}',this)">${esc(t('owner.property.delete'))}</button>${propertyMailDigest(prop.id)}`;
    return `<div class="property-card ${checked?'active':''} ${editing?'editing':''}"><div><div class="property-card-top"><div>${nameBlock}<div class="property-meta"><span class="badge blue">${esc(t('owner.property.rooms', {count: rooms.length}))}</span><span class="badge orange">${esc(t('owner.property.areas', {count: areas.length}))}</span><span class="badge green">${esc(t('owner.property.cleaners', {count: cleaners.length}))}</span></div></div><label class="property-select" title="${esc(t('owner.property.sub'))}"><input type="checkbox" ${checked?'checked':''} onchange="setOwnerPropertyFilter('${esc(prop.id)}',this.checked)">${esc(t('owner.property.select'))}</label></div></div><div class="property-actions">${actions}</div></div>`;
  }
  function ensureOwnerPropertyModuleVisible(){
    if(visibleAsCleaner()) return;
    const host = ensureOwnerPropertyHost();
    if(!host) return;
    const props = propList();
    const label = t('owner.property.selected', {selected: ownerPropIds().length, total: props.length});
    host.innerHTML = `<div class="property-module-head"><div><h2 style="margin:0">${esc(t('owner.property.title'))}</h2><div class="small">${esc(t('owner.property.sub'))}</div></div><div class="property-actions"><span class="badge green">${esc(label)}</span><button class="smallbtn" onclick="setOwnerPropertyAll()">${esc(t('owner.property.all'))}</button><button class="smallbtn primary" onclick="addProperty()">${esc(t('owner.property.add'))}</button></div></div><div class="property-cards">${props.length ? props.map(propertyCard).join('') : `<div class="empty-panel">${esc(t('owner.property.empty'))}</div>`}</div>`;
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
    return `<label class="scope-chip ${checked?'active':''}"><input type="checkbox" ${checked?'checked':''} onchange="setOwnerRoomFilter('${esc(room.id)}',this.checked)"><span>${esc(roomName(room.id))}</span>${showProp?`<span class="prop-label">${esc(propName(roomPropId(room.id)))}</span>`:''}<button type="button" class="smallbtn" onclick="event.preventDefault();event.stopPropagation();setOnlyOwnerRoom('${esc(room.id)}')">${esc(t('owner.scope.only'))}</button></label>`;
  }
  function renderOwnerScopeFilter(){
    const host = ensureOwnerScopeFilterHost();
    if(!host) return;
    const rooms = validOwnerRoomIds().map(id => getRooms().find(r => String(r.id) === String(id))).filter(Boolean);
    const selectedCount = ownerRoomIds().length;
    const defaultCount = savedDefaultRoomIds().length;
    host.innerHTML = `<div class="scope-filter-head"><div><div class="scope-filter-title">${esc(t('owner.scope.title'))}</div><div class="small">${esc(t('owner.scope.sub'))}</div></div><div class="property-actions"><span class="badge blue">${esc(t('owner.scope.selected', {selected: selectedCount, total: rooms.length}))}</span><span id="roomDefaultStatus" class="sync-status ok" style="${defaultCount ? '' : 'display:none'}">${esc(t('owner.scope.default', {count: defaultCount}))}</span><button class="smallbtn primary" onclick="saveOwnerRoomDefault(this)">${esc(t('owner.scope.saveDefault'))}</button><button class="smallbtn" onclick="setOwnerRoomAll()">${esc(t('owner.scope.allRooms'))}</button></div></div><div class="scope-chip-list">${rooms.length ? rooms.map(roomScopeChip).join('') : `<span class="small">${esc(t('owner.scope.empty'))}</span>`}</div>`;
  }

  function initSelectsImpl(){
    renderOwnerScopeFilter();
    ['ownerRoomFilterSummary','bookingRoomFilterSummary'].forEach(id => {
      const el = qs(id);
      if(el) el.textContent = t('owner.scope.selected', {selected: ownerRoomIds().length, total: validOwnerRoomIds().length});
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
    const notesToday = getNotes().filter(n => !n.recurring_task && n.date === today() && targetMatches(n.target_id,n.target_type || 'room')).length + getRoomNotes().filter(n => n.date === today() && roomMatches(n.room_id)).length;
    const el = qs('ownerMetrics');
    if(el) el.innerHTML = `<div class="metric"><div class="small">${esc(t('owner.metric.futureOrders'))}</div><div class="num">${future.length}</div></div><div class="metric"><div class="small">${esc(t('owner.metric.futureNights'))}</div><div class="num">${nights}</div></div><div class="metric"><div class="small">${esc(t('owner.metric.todayCleaning'))}</div><div class="num">${cleanToday}</div></div><div class="metric"><div class="small">${esc(t('owner.metric.todayNotes'))}</div><div class="num">${notesToday}</div></div>`;
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
    if(r.start === today() && r.dayCount === 14) return t('owner.calendar.range14');
    if(r.start === today() && r.dayCount === 28) return t('owner.calendar.range28');
    return currentLanguage() === 'zh-CN' ? `${r.start} 至 ${r.end}` : `${r.start} to ${r.end}`;
  }
  function weekendClass(day){
    const d = parseDate(day).getDay();
    return d === 0 ? 'weekend weekend-sun' : d === 6 ? 'weekend weekend-sat' : '';
  }
  function weekendLabel(day){
    const d = parseDate(day).getDay();
    if(d === 0) return currentLanguage() === 'zh-CN' ? '周日' : currentLanguage() === 'es-ES' ? 'Dom' : 'Sun';
    if(d === 6) return currentLanguage() === 'zh-CN' ? '周六' : currentLanguage() === 'es-ES' ? 'Sáb' : 'Sat';
    return '';
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
      const checkin = real.some(x => x.checkin === day);
      const stay = real.some(x => x.checkin < day && x.checkout > day);
      const lock = locks.some(x => x.checkin <= day && x.checkout > day);
      return !checkin && !stay && !lock;
    });
  }
  function calendarDaysForRange(range){
    const r = range || calendarRange();
    return Array.from({length: r.dayCount}, (_,i) => addDay(r.start,i));
  }
  function selectedCalendarRooms(range){
    const rows = ownerRooms();
    return rows;
  }
  function updateCalendarVacancyControls(range, visibleCount){
    const total = ownerRooms().length;
    const btn = qs('calendarVacancyOnlyBtn');
    if(btn){
      btn.classList.toggle('primary', !!ui.calendarVacancyOnly);
      btn.textContent = ui.calendarVacancyOnly ? t('owner.calendar.showAll') : t('owner.calendar.vacancyOnly');
    }
    const summary = qs('calendarVacancySummary');
    if(summary){
      summary.textContent = ui.calendarVacancyOnly ? t('owner.calendar.vacancySummary', {visible: visibleCount, total}) : '';
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
    grid.classList.toggle('vacancy-only', !!ui.calendarVacancyOnly);
    if(!rows.length){
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = `<div class="cell head">${esc(ui.calendarVacancyOnly ? t('owner.calendar.noVacancy') : t('owner.calendar.noRooms'))}</div>`;
      updateRangePresetButtons();
      updateCalendarVacancyControls(range, rows.length);
      return;
    }
    const compactCalendar = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    grid.style.gridTemplateColumns = compactCalendar ? `88px repeat(${days.length}, 52px)` : `140px repeat(${days.length}, minmax(64px,1fr))`;
    let html = `<div class="cell head">${esc(t('owner.calendar.roomDate'))}</div>` + days.map(day => `<div class="cell head ${weekendClass(day)}">${esc(day.slice(5))}${weekendLabel(day)?`<span class="weekend-label">${weekendLabel(day)}</span>`:''}</div>`).join('');
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
        const nightBooked = !!(checkin || stay || lock);
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
          body = `<span class="cell-platform">${esc(t('owner.calendar.blocked'))}</span>`;
          titles.push(`不开放锁定：${lock.checkin} 到 ${lock.checkout}；${lockReason(lock)}`);
        }
        if(ui.calendarVacancyOnly){
          if(nightBooked){
            body = '';
            classes.push('hidden-occupied');
          }else{
            body = `<span class="cell-platform">${esc(t('owner.calendar.emptyNight'))}</span>`;
            classes.push('empty-night');
            titles.push(t('owner.calendar.emptyNightTitle'));
          }
        }else if(hasNote){
          classes.push('hasnote');
          body += `<span class="cell-note">${esc(t('owner.calendar.note'))}</span>`;
          titles.push(t('owner.calendar.noteTitle'));
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
    if(title) title.textContent = t('owner.calendar.stats', {range: rangeLabel(range)});
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
    el.innerHTML = `<table><tr>${showProp?`<th>${esc(t('owner.table.property'))}</th>`:''}<th>${esc(t('owner.table.room'))}</th><th>${esc(t('owner.table.orders'))}</th><th>${esc(t('owner.table.orderNights'))}</th><th>${esc(t('owner.table.lockNights'))}</th><th>${esc(t('owner.table.availableNights'))}</th><th>${esc(t('owner.table.occupancy'))}</th><th>${esc(t('owner.table.cleaningFee'))}</th></tr>${rows || `<tr><td colspan="${showProp?8:7}">${esc(t('owner.table.noRooms'))}</td></tr>`}</table>`;
  }
  function renderOwnerBookingsImpl(){
    const range = calendarRange();
    const title = qs('futureBookingsTitle');
    if(title) title.textContent = t('owner.calendar.bookings', {range: rangeLabel(range)});
    const pf = qs('platformFilter') && qs('platformFilter').value || '';
    let rows = dedupeBookings(ownerBookingsAll()).filter(b => b.checkin < range.endExclusive && b.checkout > range.start);
    if(pf) rows = rows.filter(b => bookingLabels(b).includes(pf) || b.platform === pf);
    rows.sort((a,b) => String(a.checkin).localeCompare(String(b.checkin)) || roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const showProp = ownerPropIds().length !== 1;
    const el = qs('ownerBookings');
    if(!el) return;
    el.innerHTML = `<table><tr><th>${esc(t('owner.table.checkin'))}</th><th>${esc(t('owner.table.checkout'))}</th>${showProp?`<th>${esc(t('owner.table.property'))}</th>`:''}<th>${esc(t('owner.table.room'))}</th><th>${esc(t('owner.table.source'))}</th><th>${esc(t('owner.table.guest'))}</th><th>${esc(t('owner.table.status'))}</th><th>${esc(t('owner.table.dateNotes'))}</th></tr>${rows.length ? rows.map(b => {
      const locked = isLockedBooking(b);
      return `<tr class="${locked?'lock-row':''}"><td>${esc(b.checkin)}</td><td>${esc(b.checkout)}</td>${showProp?`<td>${esc(propName(roomPropId(b.room_id)))}</td>`:''}<td><span class="badge">${esc(roomName(b.room_id))}</span></td><td>${bookingSourceBadges(b)}</td><td>${locked?'':esc(b.guest || '')}</td><td>${locked?`<span class="badge red">${esc(t('owner.calendar.blocked'))}</span> ${esc(lockReason(b))}`:esc(b.status || '')}</td><td>${getRoomNotes().filter(n => n.room_id === b.room_id && n.date >= b.checkin && n.date <= b.checkout).length}</td></tr>`;
    }).join('') : `<tr><td colspan="${showProp?8:7}">${esc(t('owner.table.noBookings'))}</td></tr>`}</table>`;
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
  function currentWorkDate(){
    const wd = qs('workDate');
    return normalizeDateInputValue(wd && wd.value) || today();
  }
  function setWorkDateImpl(value){
    const wd = qs('workDate');
    const next = normalizeDateInputValue(value) || today();
    if(wd) wd.value = next;
    renderDailyWorkImpl();
  }
  function setWorkDateTodayImpl(){
    setWorkDateImpl(today());
  }
  function shiftWorkDateImpl(days){
    setWorkDateImpl(addDay(currentWorkDate(), Number(days || 0)));
  }
  function renderDailyWorkImpl(){
    const wd = qs('workDate');
    if(wd) wd.value = normalizeDateInputValue(wd.value) || today();
    const d = currentWorkDate();
    const real = ownerRealBookings();
    const locks = ownerLockBookings().filter(b => b.checkin <= d && b.checkout > d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const checkouts = real.filter(b => b.checkout === d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const checkins = real.filter(b => b.checkin === d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const stays = real.filter(b => b.checkin < d && b.checkout > d).sort((a,b) => roomName(a.room_id).localeCompare(roomName(b.room_id),'zh-Hans-CN'));
    const empty = dailyEmptyRooms(d, real, locks);
    const pendingReviewRows = cancelReviewTaskRows(d,d,true).filter(r => r.date === d && String(r.review_status || 'pending') !== 'clean_needed');
    const cleanRows = scopedCleaningRows(d,d).filter(r => r.date === d);
    const notes = getNotes().filter(n => !n.recurring_task && !n.cancellation_review && n.date === d && targetMatches(n.target_id,n.target_type || 'room')).concat(getRoomNotes().filter(n => n.date === d && roomMatches(n.room_id)).map(n => ({...n,target_id:n.room_id,target_type:'room',roomDate:true})));
    const metrics = qs('dailyWorkMetrics');
    if(metrics) metrics.innerHTML = `<div class="metric"><div class="small">${esc(t('owner.daily.checkout'))}</div><div class="num">${checkouts.length}</div></div><div class="metric"><div class="small">${esc(t('owner.daily.checkin'))}</div><div class="num">${checkins.length}</div></div><div class="metric"><div class="small">${esc(t('owner.daily.stay'))}</div><div class="num">${stays.length}</div></div><div class="metric"><div class="small">${esc(t('owner.daily.vacant'))}</div><div class="num">${empty.length}</div></div><div class="metric"><div class="small">${esc(t('owner.daily.blocked'))}</div><div class="num">${locks.length}</div></div><div class="metric"><div class="small">${esc(t('owner.daily.cleaningTasks'))}</div><div class="num">${cleanRows.length}</div></div>`;
    function countTitle(label,count){
      return currentLanguage() === 'zh-CN' ? `${label}（${count}）` : `${label} (${count})`;
    }
    function bookingCards(title, rows, cls){
      return `<div class="work-card ${cls}"><h3>${esc(countTitle(title, rows.length))}</h3>${rows.length ? rows.map(b => {
        const left = Math.max(0, daysBetweenSafe(d,b.checkout));
        const main = cls === 'checkout' ? t('owner.daily.checkoutLine', {checkout: esc(b.checkout), checkin: esc(b.checkin)}) : t('owner.daily.stayLine', {days: left, checkout: esc(b.checkout)});
        const guest = b.guest ? (currentLanguage() === 'zh-CN' ? ` ｜ ${t('owner.daily.guest', {guest: esc(b.guest)})}` : ` | ${t('owner.daily.guest', {guest: esc(b.guest)})}`) : '';
        return `<div class="note-card"><div class="note-title"><span class="badge">${esc(roomName(b.room_id))}</span> ${bookingSourceBadges(b)}</div><div>${main}</div><div class="small">${esc(t('owner.daily.orderLine', {checkin: b.checkin, checkout: b.checkout}))}${guest}</div>${inlineNotes(d,b.room_id,'room')}</div>`;
      }).join('') : `<p class="small">${esc(t('owner.daily.none'))}</p>`}</div>`;
    }
    const content = qs('dailyWorkContent');
    const pendingHtml = pendingReviewRows.length ? `<div class="card"><h2>${esc(t('owner.daily.pendingTitle'))}</h2><div class="small">${esc(t('owner.daily.pendingSub'))}</div>${cleaningTableScoped(pendingReviewRows)}</div>` : '';
    if(content) content.innerHTML = `<div class="work-grid">${bookingCards(t('owner.daily.checkout'),checkouts,'checkout')}${bookingCards(t('owner.daily.checkin'),checkins,'checkin')}${bookingCards(t('owner.daily.stay'),stays,'stay')}<div class="work-card empty"><h3>${esc(countTitle(t('owner.daily.vacant'), empty.length))}</h3>${empty.length ? empty.map(r => `<div class="note-card"><div class="note-title"><span class="badge green">${esc(roomName(r.id))}</span></div><div class="small">${esc(t('owner.daily.emptyNight'))}</div>${inlineNotes(d,r.id,'room')}</div>`).join('') : `<p class="small">${esc(t('owner.daily.noVacant'))}</p>`}</div><div class="work-card locked"><h3>${esc(countTitle(t('owner.daily.blocked'), locks.length))}</h3>${locks.length ? locks.map(b => `<div class="note-card"><div class="note-title"><span class="badge orange">${esc(roomName(b.room_id))}</span> <span class="badge red">${esc(t('owner.daily.blocked'))}</span></div><div>${esc(b.checkin)} → ${esc(b.checkout)}</div><div class="small">${esc(t('owner.daily.reason', {reason: lockReason(b)}))}</div></div>`).join('') : `<p class="small">${esc(t('owner.daily.none'))}</p>`}</div></div>${pendingHtml}<div class="card"><h2>${esc(t('owner.daily.cleaningTitle'))}</h2><div class="small">${esc(t('owner.daily.cleaningSub'))}</div>${cleaningTableScoped(cleanRows)}</div><div class="card"><h2>${esc(t('owner.daily.notesTitle'))}</h2>${notes.length ? notes.map(n => `<div class="note-card ${n.priority === '重要' ? 'important' : ''}"><div class="note-title">${priorityBadge(n.priority)} ${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))} ${n.roomDate?esc(t('owner.daily.dateNote')):''}</div><div>${esc(n.note)}</div></div>`).join('') : `<p class="small">${esc(t('owner.daily.noNotes'))}</p>`}</div>`;
  }

  const OWNER_CLEANING_TABS = [
    ['today', '保洁工作'],
    ['finance', '结算统计'],
    ['manual', '手动调整'],
    ['notes', '保洁事项']
  ];
  function activeCleaningSubTab(){
    const ids = OWNER_CLEANING_TABS.map(x => x[0]);
    if(!ids.includes(ui.cleaningSubTab)) ui.cleaningSubTab = 'today';
    return ui.cleaningSubTab;
  }
  function renderCleaningSubTabs(active){
    return `<div class="tabbar cleaning-subtabs">${OWNER_CLEANING_TABS.map(([id,label]) => `<button class="${active === id ? 'active' : ''}" onclick="showCleaningSubTab('${id}',this)">${label}</button>`).join('')}</div>`;
  }
  function showCleaningSubTabImpl(id){
    ui.cleaningSubTab = OWNER_CLEANING_TABS.some(x => x[0] === id) ? id : 'today';
    renderCleaningManagerShell();
  }
  function setCleaningWorkDateImpl(value){
    ui.cleaningWorkDate = value || today();
    renderCleaningManagerShell();
  }
  function renderCleaningTodaySubTabImpl(){
    const root = qs('ownerCleaningSubContent');
    if(!root) return;
    const d = ui.cleaningWorkDate || today();
    const pendingReviewRows = cancelReviewTaskRows(d,d,true).filter(r => r.date === d && String(r.review_status || 'pending') !== 'clean_needed');
    const rows = scopedCleaningRows(d,d).filter(r => r.date === d);
    const notes = getNotes().filter(n => !n.recurring_task && !n.cancellation_review && n.date === d && targetMatches(n.target_id,n.target_type || 'room')).concat(getRoomNotes().filter(n => n.date === d && roomMatches(n.room_id)).map(n => ({...n,target_id:n.room_id,target_type:'room',roomDate:true})));
    const pendingHtml = pendingReviewRows.length ? `<div class="card"><h2>待房东确认</h2><div class="small">这里不是已分配给保洁的任务；确认需要保洁后，才会进入下面正式保洁列表，也会同步给保洁端。</div>${cleaningTableScoped(pendingReviewRows)}</div>` : '';
    root.innerHTML = `<div class="card"><div class="property-detail-head"><div><h2 style="margin:0">保洁工作</h2><div class="small">正式保洁任务和保洁端使用同一套列表；待确认提醒单独显示。</div></div><div class="property-actions"><input id="ownerCleaningWorkDate" type="date" value="${esc(d)}" onchange="setCleaningWorkDate(this.value)"><button class="smallbtn" onclick="setCleaningWorkDate('')">今天</button></div></div></div>${pendingHtml}${cleaningTableScoped(rows)}<div class="card"><h2>当天事项</h2>${notes.length ? notes.map(n => `<div class="note-card ${n.priority === '重要' ? 'important' : ''}"><div class="note-title">${priorityBadge(n.priority)} ${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))} ${n.roomDate?'日期事项':''}</div><div>${esc(n.note)}</div></div>`).join('') : '<p class="small">暂无事项</p>'}</div>`;
  }
  function renderManualChangeSubTabImpl(){
    const root = qs('ownerCleaningSubContent');
    if(!root) return;
    root.innerHTML = `<div class="card"><h2>手动调整实际保洁</h2><div class="formgrid"><div><label>日期</label><input id="manualDate" type="date"></div><div><label>对象</label><select id="manualTarget"></select></div><div><label>调整类型</label><select id="manualType"><option value="add">额外增加保洁</option><option value="remove">取消系统保洁</option></select></div><div><label>调整金额</label><input id="manualAmount" type="number" step="0.01"></div><div><label>原因</label><input id="manualReason" placeholder="例如：临时加扫 / 实际没打扫"></div></div><br><button class="smallbtn primary" onclick="addManualChange()">添加调整记录</button></div><div class="card"><div class="toolbar"><h2 style="margin:0">手动调整记录</h2><input id="manualFilterStart" type="date" onchange="renderManualRecords()"><input id="manualFilterEnd" type="date" onchange="renderManualRecords()"><select id="manualFilterTarget" onchange="renderManualRecords()"></select><select id="manualFilterType" onchange="renderManualRecords()"><option value="">全部调整</option><option value="add">额外增加</option><option value="remove">取消保洁</option></select></div><div id="manualRecords"></div></div>`;
    const md = qs('manualDate'); if(md && !md.value) md.value = today();
    initSelectsImpl();
    renderManualRecordsImpl();
  }
  function renderCleaningFinanceSubTabImpl(){
    const root = qs('ownerCleaningSubContent');
    if(!root) return;
    root.innerHTML = `<div class="card"><div class="property-detail-head"><div><h2>保洁结算统计</h2><div class="small">按日期倒序汇总；先看每天的房间数、公区数和金额，再看当天明细。</div></div></div><div class="filter-strip"><div class="filter-field"><label>开始日期</label><input id="cleanStart" type="date" onchange="renderCleaningFinance()"></div><div class="filter-field"><label>结束日期</label><input id="cleanEnd" type="date" onchange="renderCleaningFinance()"></div><div class="filter-actions"><button class="smallbtn" onclick="setCleaningFinanceRange('last30')">最近30天</button><button class="smallbtn" onclick="setCleaningFinanceRange('month')">本月</button><button class="smallbtn" onclick="setCleaningFinanceRange('next30')">未来30天</button></div></div><div id="cleaningFinance"></div></div>`;
    const cs = qs('cleanStart'); if(cs && !cs.value) cs.value = addDay(today(), -30);
    const ce = qs('cleanEnd'); if(ce && !ce.value) ce.value = today();
    renderCleaningFinanceImpl();
  }
  function setCleaningFinanceRangeImpl(mode){
    const cs = qs('cleanStart'), ce = qs('cleanEnd');
    if(!cs || !ce) return;
    if(mode === 'month'){
      const start = `${monthKey(today())}-01`;
      const nextMonthStart = `${monthKey(addDay(start, 32))}-01`;
      cs.value = start;
      ce.value = addDay(nextMonthStart, -1);
    }else if(mode === 'next30'){
      cs.value = today();
      ce.value = addDay(today(), 30);
    }else{
      cs.value = addDay(today(), -30);
      ce.value = today();
    }
    renderCleaningFinanceImpl();
  }
  function renderOwnerNotesSubTabImpl(){
    const root = qs('ownerCleaningSubContent');
    if(!root) return;
    root.innerHTML = `<div id="ownerNotesShell"></div>`;
    renderOwnerNotesShell();
    renderOwnerNotesImpl();
  }
  function renderCleaningSubContentImpl(active){
    if(active === 'finance') return renderCleaningFinanceSubTabImpl();
    if(active === 'manual') return renderManualChangeSubTabImpl();
    if(active === 'notes') return renderOwnerNotesSubTabImpl();
    return renderCleaningTodaySubTabImpl();
  }
  function renderCleaningManagerShell(){
    const root = qs('ownerCleaningShell');
    if(!root) return;
    const active = activeCleaningSubTab();
    root.innerHTML = `<div class="card cleaning-subnav-card"><div class="property-detail-head"><div><h2 style="margin:0">保洁管理</h2><div class="small">保洁任务、结算、手动调整和保洁事项分开处理。</div></div></div>${renderCleaningSubTabs(active)}</div><div id="ownerCleaningSubContent"></div>`;
    renderCleaningSubContentImpl(active);
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
    if(ce && !ce.value) ce.value = today();
    const start = (cs && cs.value) || addDay(today(), -30);
    const end = (ce && ce.value) || today();
    const rows = scopedCleaningRows(start,end).filter(r => r.date >= start && r.date <= end).sort((a,b) => String(b.date).localeCompare(String(a.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const total = rows.reduce((s,r) => s + rowAmount(r), 0);
    const roomRows = rows.filter(r => (r.target_type || 'room') === 'room');
    const commonRows = rows.filter(r => r.target_type === 'common');
    const roomCount = new Set(roomRows.map(r => String(r.target_id || ''))).size;
    const el = qs('cleaningFinance');
    if(!el) return;
    const byDate = new Map();
    rows.forEach(row => {
      const date = String(row.date || '');
      if(!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(row);
    });
    const dayHtml = Array.from(byDate.entries()).sort((a,b) => String(b[0]).localeCompare(String(a[0]))).map(([date, list]) => {
      list.sort((a,b) => targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
      const dayRooms = list.filter(r => (r.target_type || 'room') === 'room');
      const dayCommons = list.filter(r => r.target_type === 'common');
      const dayRoomCount = new Set(dayRooms.map(r => String(r.target_id || ''))).size;
      const dayTotal = list.reduce((s,r) => s + rowAmount(r), 0);
      return `<div class="finance-day"><div class="finance-day-head"><div><h3>${esc(date)}</h3><div class="small">房间 ${dayRoomCount} 个，房间保洁 ${dayRooms.length} 次，公区 ${dayCommons.length} 次，共 ${list.length} 条</div></div><div class="finance-day-total">${money(dayTotal)}</div></div>${cleaningTableScoped(list)}</div>`;
    }).join('') || '<div class="ops-empty">暂无结算记录</div>';
    el.innerHTML = `<div class="grid"><div class="metric"><div class="small">保洁任务</div><div class="num">${rows.length}</div></div><div class="metric"><div class="small">涉及房间</div><div class="num">${roomCount}</div></div><div class="metric"><div class="small">公区任务</div><div class="num">${commonRows.length}</div></div><div class="metric"><div class="small">合计费用</div><div class="num">${money(total)}</div></div></div><div class="finance-day-list">${dayHtml}</div>`;
  }

  function recurringPresetById(id){
    return CLEANING_TASK_PRESETS.find(x => x.id === id) || CLEANING_TASK_PRESETS[0];
  }
  function targetValueForPreset(preset){
    const wantCommon = preset && preset.target === 'common';
    const area = ownerAreas()[0];
    const room = ownerRooms()[0];
    if(wantCommon && area) return 'common:' + area.id;
    if(room) return 'room:' + room.id;
    if(area) return 'common:' + area.id;
    return '';
  }
  function renderCleaningGuidance(){
    return `<div class="task-guidance-grid">${CLEANING_GUIDANCE_GROUPS.map(group => `<div class="note-card"><div class="note-title">${esc(group[0])}</div><ul>${group[1].map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  }
  function recurringFilterRooms(){
    return ownerRooms().filter(r => !ui.recurringPropertyFilter || String(roomPropId(r.id)) === String(ui.recurringPropertyFilter));
  }
  function renderRecurringTaskFilters(){
    const propOptions = `<option value="">全部房源</option>` + propList().filter(p => propMatches(p.id)).map(p => `<option value="${esc(p.id)}" ${String(ui.recurringPropertyFilter) === String(p.id) ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('');
    const roomOptions = `<option value="">全部房间/公区</option>` + recurringFilterRooms().map(r => `<option value="room:${esc(r.id)}" ${String(ui.recurringRoomFilter) === 'room:'+String(r.id) ? 'selected' : ''}>${esc(propName(roomPropId(r.id)))} / ${esc(roomName(r.id))}</option>`).join('') + ownerAreas().filter(a => !ui.recurringPropertyFilter || String(areaPropId(a.id)) === String(ui.recurringPropertyFilter)).map(a => `<option value="common:${esc(a.id)}" ${String(ui.recurringRoomFilter) === 'common:'+String(a.id) ? 'selected' : ''}>${esc(propName(areaPropId(a.id)))} / ${esc(targetName(a.id,'common'))}</option>`).join('');
    return `<div class="toolbar"><select onchange="setRecurringPropertyFilter(this.value)">${propOptions}</select><select onchange="setRecurringRoomFilter(this.value)">${roomOptions}</select></div>`;
  }
  function renderRecurringTaskList(){
    const filter = parseTarget(ui.recurringRoomFilter || '');
    const rows = getRecurringTaskNotes(true).filter(n => {
      const type = n.target_type || 'room';
      if(!targetMatches(n.target_id,type)) return false;
      if(ui.recurringPropertyFilter && String(targetPropId(n.target_id,type)) !== String(ui.recurringPropertyFilter)) return false;
      if(filter.id && (String(type) !== String(filter.type) || String(n.target_id) !== String(filter.id))) return false;
      return true;
    }).sort((a,b) => propName(targetPropId(a.target_id,a.target_type)).localeCompare(propName(targetPropId(b.target_id,b.target_type)),'zh-Hans-CN') || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN') || recurringScheduleText(a).localeCompare(recurringScheduleText(b),'zh-Hans-CN'));
    if(!rows.length) return renderRecurringTaskFilters() + '<p class="small">暂无周期任务。可以先选一个模板，再选择房间或公区保存。</p>';
    return `${renderRecurringTaskFilters()}<table><tr><th>启用</th><th>房源</th><th>对象</th><th>任务</th><th>周期</th><th>弹性</th><th>费用</th><th>操作</th></tr>${rows.map(n => {
      const flex = n.schedule_type === 'weekly' || n.schedule_type === 'daily' ? '固定' : `前后 ${Number(n.flex_days || 0)} 天`;
      return `<tr><td><input type="checkbox" ${(n.enabled === false || n.inactive) ? '' : 'checked'} onchange="toggleRecurringTask('${esc(n.id)}',this.checked)"></td><td>${esc(propName(targetPropId(n.target_id,n.target_type)))}</td><td>${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))}</td><td><b>${esc(n.title || '周期任务')}</b><div class="small">${esc(n.note || '')}</div></td><td>${esc(recurringScheduleText(n))}</td><td>${esc(flex)}</td><td>${money(n.amount || 0)}</td><td><button class="smallbtn" onclick="editRecurringTask('${esc(n.id)}')">修改</button><button class="smallbtn danger" onclick="deleteRecurringTask('${esc(n.id)}')">删除</button></td></tr>`;
    }).join('')}</table>`;
  }
  function renderRecurringTaskManagerImpl(){
    const el = qs('recurringTaskManager');
    if(!el) return;
    const presetOptions = CLEANING_TASK_PRESETS.map(p => `<option value="${esc(p.id)}">${esc(p.category)} · ${esc(p.title)}</option>`).join('');
    const editing = !!ui.editingRecurringTaskId;
    el.innerHTML = `<div class="card"><div class="property-detail-head"><div><h2 style="margin:0">周期/深度保洁任务</h2><div class="small">房东可以把每周、每 14 天、每 30 天左右的项目放进任务库；间隔型任务会优先安排到保洁量较少的退房日。</div></div></div><div class="formgrid"><div><label>任务模板</label><select id="recurringPreset" onchange="applyRecurringPreset()">${presetOptions}</select></div><div><label>对象</label><select id="recurringTarget">${cleanTargetOptions()}</select></div><div><label>任务名称</label><input id="recurringTitle"></div><div><label>周期类型</label><select id="recurringScheduleType"><option value="weekly">每周固定</option><option value="interval">按间隔弹性安排</option><option value="daily">每天</option></select></div><div><label>每周几</label><select id="recurringWeekday">${[0,1,2,3,4,5,6].map(i => `<option value="${i}">${weekdayName(i)}</option>`).join('')}</select></div><div><label>间隔天数</label><input id="recurringIntervalDays" type="number" min="1" max="365"></div><div><label>弹性天数</label><input id="recurringFlexDays" type="number" min="0" max="60"></div><div><label>额外费用</label><input id="recurringAmount" type="number" step="0.01" placeholder="不额外收费填 0"></div><div><label>开始日期</label><input id="recurringStartDate" type="date"></div><div><label>类型</label><select id="recurringTaskMode"><option value="regular">周期任务</option><option value="deep">深度保洁</option></select></div><div><label>归属</label><select id="recurringAttachToCheckout"><option value="true">放到退房保洁下</option><option value="false">单独生成任务</option></select></div><div><label>是否可顺延</label><select id="recurringCanDefer"><option value="true">可移到下一次退房</option><option value="false">必须本次完成</option></select></div></div><label style="margin-top:12px">任务说明</label><textarea id="recurringNote" placeholder="写给保洁看的具体操作。"></textarea><div class="toolbar"><button class="smallbtn primary" onclick="addRecurringTask()">${editing ? '保存任务修改' : '添加周期任务'}</button>${editing ? '<button class="smallbtn" onclick="cancelRecurringTaskEdit()">取消修改</button>' : ''}<span class="small">基础退房保洁默认必须完成；深度项目可以按下一次退房顺延。</span></div><h3>默认项目库</h3>${renderCleaningGuidance()}<h3>已启用/已保存任务</h3><div id="recurringTaskList">${renderRecurringTaskList()}</div></div>`;
    if(editing) loadRecurringTaskFormImpl(ui.editingRecurringTaskId);
    else applyRecurringPresetImpl();
  }
  function applyRecurringPresetImpl(){
    const preset = recurringPresetById(qs('recurringPreset') && qs('recurringPreset').value);
    if(!preset) return;
    const target = qs('recurringTarget');
    if(target && (!target.value || preset.target === 'common')) {
      const value = targetValueForPreset(preset);
      if(value) target.value = value;
    }
    const title = qs('recurringTitle'); if(title) title.value = preset.title || '';
    const schedule = qs('recurringScheduleType'); if(schedule) schedule.value = preset.schedule || 'interval';
    const weekday = qs('recurringWeekday'); if(weekday) weekday.value = String(preset.weekday == null ? 1 : preset.weekday);
    const interval = qs('recurringIntervalDays'); if(interval) interval.value = String(preset.interval || 30);
    const flex = qs('recurringFlexDays'); if(flex) flex.value = String(preset.flex || 0);
    const amount = qs('recurringAmount'); if(amount) amount.value = String(preset.amount || 0);
    const mode = qs('recurringTaskMode'); if(mode) mode.value = (preset.schedule === 'interval' && Number(preset.interval || 0) >= 14) ? 'deep' : 'regular';
    const start = qs('recurringStartDate'); if(start && !start.value) start.value = defaultPresetStartDate(preset.id === 'checkout_turnover_standard');
    const note = qs('recurringNote'); if(note) note.value = preset.note || '';
    const attach = qs('recurringAttachToCheckout'); if(attach) attach.value = preset.attach === false || preset.target === 'common' ? 'false' : 'true';
    const defer = qs('recurringCanDefer'); if(defer) defer.value = preset.id === 'checkout_turnover_standard' ? 'false' : 'true';
  }
  function loadRecurringTaskFormImpl(id){
    const row = getRecurringTaskNotes(true).find(n => String(n.id) === String(id));
    if(!row) return;
    const target = qs('recurringTarget'); if(target) target.value = `${row.target_type || 'room'}:${row.target_id}`;
    const title = qs('recurringTitle'); if(title) title.value = row.title || '';
    const schedule = qs('recurringScheduleType'); if(schedule) schedule.value = row.schedule_type || 'interval';
    const weekday = qs('recurringWeekday'); if(weekday) weekday.value = String(row.weekday == null ? 1 : row.weekday);
    const interval = qs('recurringIntervalDays'); if(interval) interval.value = String(row.interval_days || 30);
    const flex = qs('recurringFlexDays'); if(flex) flex.value = String(row.flex_days || 0);
    const amount = qs('recurringAmount'); if(amount) amount.value = String(row.amount || 0);
    const mode = qs('recurringTaskMode'); if(mode) mode.value = row.task_mode || 'regular';
    const start = qs('recurringStartDate'); if(start) start.value = normalizeDateInputValue(row.start_date) || today();
    const note = qs('recurringNote'); if(note) note.value = row.note || '';
    const attach = qs('recurringAttachToCheckout'); if(attach) attach.value = row.attach_to_checkout ? 'true' : 'false';
    const defer = qs('recurringCanDefer'); if(defer) defer.value = row.can_defer === false ? 'false' : 'true';
  }
  function editRecurringTaskImpl(id){
    ui.editingRecurringTaskId = id || '';
    renderRecurringTaskManagerImpl();
  }
  function cancelRecurringTaskEditImpl(){
    ui.editingRecurringTaskId = '';
    renderRecurringTaskManagerImpl();
  }
  function setRecurringPropertyFilterImpl(value){
    ui.recurringPropertyFilter = value || '';
    ui.recurringRoomFilter = '';
    renderRecurringTaskManagerImpl();
  }
  function setRecurringRoomFilterImpl(value){
    ui.recurringRoomFilter = value || '';
    renderRecurringTaskManagerImpl();
  }
  function addRecurringTaskImpl(){
    const target = parseTarget(qs('recurringTarget') && qs('recurringTarget').value);
    const title = String(qs('recurringTitle') && qs('recurringTitle').value || '').trim();
    const note = String(qs('recurringNote') && qs('recurringNote').value || '').trim();
    if(!target.id) return alert('请先选择房间或公区。');
    if(!title) return alert('请填写任务名称。');
    const schedule = (qs('recurringScheduleType') && qs('recurringScheduleType').value) || 'interval';
    const interval = Math.max(1, Number((qs('recurringIntervalDays') && qs('recurringIntervalDays').value) || 30));
    const flex = schedule === 'interval' ? Math.max(0, Math.min(60, Number((qs('recurringFlexDays') && qs('recurringFlexDays').value) || 0))) : 0;
    const editingId = ui.editingRecurringTaskId || '';
    let row = editingId ? getRecurringTaskNotes(true).find(n => String(n.id) === String(editingId)) : null;
    const isNew = !row;
    if(!row) row = {id:'recurring_'+Date.now(), recurring_task:true, created_at:nowIso(), created_by:userName('房东')};
    Object.assign(row, {
      recurring_task:true,
      enabled:true,
      inactive:false,
      task_mode:(qs('recurringTaskMode') && qs('recurringTaskMode').value) || 'regular',
      target_id:target.id,
      target_type:target.type,
      title,
      note,
      priority:'普通',
      schedule_type:schedule,
      weekday:Number((qs('recurringWeekday') && qs('recurringWeekday').value) || 1),
      interval_days:interval,
      flex_days:flex,
      workload_sensitive:schedule === 'interval',
      amount:Number((qs('recurringAmount') && qs('recurringAmount').value) || 0),
      start_date:(qs('recurringStartDate') && qs('recurringStartDate').value) || today(),
      attach_to_checkout: target.type === 'room' && ((qs('recurringAttachToCheckout') && qs('recurringAttachToCheckout').value) !== 'false'),
      can_defer: (qs('recurringCanDefer') && qs('recurringCanDefer').value) !== 'false',
      updated_at:nowIso()
    });
    if(isNew) getNotes().unshift(row);
    ui.editingRecurringTaskId = '';
    persistAll().then(() => { renderRecurringTaskManagerImpl(); renderAll(); }).catch(e => alert('保存失败：' + e.message));
  }
  function toggleRecurringTaskImpl(id,enabled){
    const row = getRecurringTaskNotes(true).find(n => String(n.id) === String(id));
    if(!row) return;
    row.enabled = !!enabled;
    row.inactive = !enabled;
    persistAll().then(renderAll).catch(e => alert('保存失败：' + e.message));
  }
  function deleteRecurringTaskImpl(id){
    const row = getRecurringTaskNotes(true).find(n => String(n.id) === String(id));
    if(!row) return;
    if(!confirm('删除这个周期任务？')) return;
    row.deleted = true;
    persistAll().then(renderAll).catch(e => alert('删除失败：' + e.message));
  }

  function renderOwnerNotesShell(){
    const root = qs('ownerNotesShell');
    if(!root) return;
    root.innerHTML = `<div class="card"><h2>保洁事项</h2><div class="formgrid"><div><label>日期</label><input id="noteDate" type="date"></div><div><label>对象</label><select id="noteTarget"></select></div><div><label>优先级</label><select id="notePriority"><option>普通</option><option>重要</option></select></div><div><label>调整金额</label><input id="noteAmount" type="number" step="0.01" placeholder="可不填"></div></div><label style="margin-top:12px">事项内容</label><textarea id="noteText" placeholder="写给保洁看的事项"></textarea><br><br><button class="smallbtn primary" onclick="addCleaningNote()">保存事项</button></div><div class="card"><h2>指定房间日期事项</h2><div class="formgrid"><div><label>日期</label><input id="roomNoteDate" type="date"></div><div><label>房间</label><select id="roomNoteRoom"></select></div><div><label>优先级</label><select id="roomNotePriority"><option>普通</option><option>重要</option></select></div></div><label style="margin-top:12px">事项内容</label><textarea id="roomNoteText" placeholder="例如：纪念日布置、婴儿床、提前放红酒"></textarea><br><br><button class="smallbtn primary" onclick="addRoomDateNote()">添加日期事项</button></div><div class="card"><h2>事项记录</h2><div class="filter-strip"><div class="filter-field"><label>日期</label><input id="noteFilterDate" type="date" onchange="renderOwnerNotes()"></div><div class="filter-field"><label>对象类型</label><select id="noteFilterTargetType" onchange="renderOwnerNotes()"><option value="">全部事项</option><option value="room">房间事项</option><option value="common">公区事项</option><option value="roomDate">房间日期事项</option></select></div></div><div id="ownerNotesList"></div></div>`;
    root.insertAdjacentHTML('afterbegin', '<div id="recurringTaskManager"></div>');
    ['noteDate','roomNoteDate'].forEach(id => { const el = qs(id); if(el && !el.value) el.value = today(); });
    initSelectsImpl();
    renderRecurringTaskManagerImpl();
  }
  function addCleaningNoteImpl(){
    const target = parseTarget(qs('noteTarget') && qs('noteTarget').value);
    const text = (qs('noteText') && qs('noteText').value || '').trim();
    if(!target.id) return alert('请选择对象');
    if(!text) return alert('请先填写事项内容');
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
    if(!text) return alert('请先填写事项内容');
    getRoomNotes().unshift({id:'roomnote_'+Date.now(),date:(qs('roomNoteDate') && qs('roomNoteDate').value) || today(),room_id:roomId,note:text,priority:(qs('roomNotePriority') && qs('roomNotePriority').value) || '普通',created_by:userName('房东'),created_at:nowIso()});
    if(qs('roomNoteText')) qs('roomNoteText').value = '';
    persistAll().then(renderAll).catch(e => alert('保存失败：' + e.message));
  }
  function renderOwnerNotesImpl(){
    const fd = qs('noteFilterDate') && qs('noteFilterDate').value;
    const ft = qs('noteFilterTargetType') && qs('noteFilterTargetType').value;
    let rows = [];
    if(!ft || ft === 'room' || ft === 'common') rows = rows.concat(getNotes().filter(n => !n.recurring_task).map(n => ({...n,kind:'cleaning'})));
    if(!ft || ft === 'roomDate') rows = rows.concat(getRoomNotes().map(n => ({...n,date:n.date,target_id:n.room_id,target_type:'room',kind:'roomDate'})));
    rows = rows.filter(n => n.kind === 'roomDate' ? roomMatches(n.target_id) : targetMatches(n.target_id,n.target_type || 'room'));
    if(fd) rows = rows.filter(n => n.date === fd);
    if(ft === 'room' || ft === 'common') rows = rows.filter(n => (n.target_type || 'room') === ft && n.kind === 'cleaning');
    if(ft === 'roomDate') rows = rows.filter(n => n.kind === 'roomDate');
    rows.sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const el = qs('ownerNotesList');
    if(el) el.innerHTML = rows.length ? `<table><tr><th>日期</th><th>对象</th><th>类型</th><th>事项</th><th>金额</th><th>操作人</th></tr>${rows.map(n => `<tr><td>${esc(n.date)}</td><td>${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))}</td><td>${n.kind === 'roomDate' ? '<span class="badge purple">房间日期事项</span>' : priorityBadge(n.priority)}</td><td>${esc(n.note)}</td><td>${n.amount_present ? signedMoney(n.amount) : ''}</td><td>${esc(n.created_by || '')}</td></tr>`).join('')}</table>` : '<p class="small">暂无事项</p>';
  }

  function channelRows(roomId){
    return getChannels().filter(ch => String(ch.room_id) === String(roomId));
  }
  function feedUrlForRoom(room){
    return `${location.origin}/feed/${encodeURIComponent(inventoryGroupId(room))}.ics`;
  }
  function feedUrlForChannel(room,ch){
    const id = ch && ch.id ? ch.id : inventoryGroupId(room);
    return `${location.origin}/feed/${encodeURIComponent(id)}.ics`;
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
    const currentIcal = String(row.ical_url || '').trim();
    const currentListing = String(row.listing_url || '').trim();
    const nextIcal = (qs(channelInputId(id,'ical')) && qs(channelInputId(id,'ical')).value || '').trim();
    const nextListing = (qs(channelInputId(id,'listing')) && qs(channelInputId(id,'listing')).value || '').trim();
    row.ical_url = nextIcal || currentIcal;
    row.listing_url = nextListing || currentListing;
    row.channel_note = (qs(channelInputId(id,'note')) && qs(channelInputId(id,'note')).value || '').trim();
    row.updated_at = nowIso();
    return row;
  }
  function renderChannel(room,ch){
    const urlIssue = cleanChannelUrls({...ch}, false);
    const hasImportIcal = !!String(ch.ical_url || '').trim();
    const status = urlIssue.moved ? `<span class="sync-status warn">${esc(urlIssue.message)}</span>` : (!urlIssue.ok ? `<span class="sync-status warn">${esc(urlIssue.message)}</span>` : (!hasImportIcal && ch.last_sync ? `<span class="sync-status warn">缺 iCal：只保留旧同步 ${esc(ch.last_sync)} · ${Number(ch.synced_booking_count || 0)} 条</span>` : (!hasImportIcal ? '<span class="sync-status warn">未填写平台导出 iCal</span>' : (ch.sync_error ? `<span class="sync-status error">同步失败：${esc(ch.sync_error)}</span>` : (ch.last_sync ? `<span class="sync-status ok">同步：${esc(ch.last_sync)} · ${Number(ch.synced_booking_count || 0)} 条</span>` : '<span class="sync-status warn">已填 iCal，未同步</span>')))));
    const feedUrl = feedUrlForChannel(room,ch);
    return `<div class="channel-card"><div class="channel-grid"><div><label>平台</label><select id="${channelInputId(ch.id,'platform')}"><option ${ch.platform==='Airbnb'?'selected':''}>Airbnb</option><option ${ch.platform==='Booking'?'selected':''}>Booking</option><option ${ch.platform==='Vrbo'?'selected':''}>Vrbo</option><option ${ch.platform==='Other'?'selected':''}>Other</option></select></div><div><label>平台导出 iCal</label><input id="${channelInputId(ch.id,'ical')}" value="${esc(ch.ical_url || '')}" placeholder="粘贴平台导出的 .ics/iCal，不是房源页面"></div><div><label>公开房源链接</label><input id="${channelInputId(ch.id,'listing')}" value="${esc(ch.listing_url || '')}" placeholder="粘贴客人可见的公开房源页面"></div><div><label>备注</label><input id="${channelInputId(ch.id,'note')}" value="${esc(ch.channel_note || '')}" placeholder="账号/房源备注"></div><div class="property-actions"><button class="smallbtn primary" onclick="saveChannelListing('${esc(ch.id)}',this)">保存</button><button class="smallbtn" onclick="deleteChannelListing('${esc(ch.id)}',this)">删除</button></div></div><div class="channel-row"><div>${status}</div><button class="smallbtn" onclick="copyText('${esc(feedUrl)}')">复制防超卖 iCal</button></div><div class="feed-line">${esc(feedUrl)}</div></div>`;
  }
  function renderRoomCard(room){
    const editing = ui.editingRoom === room.id;
    const channels = channelRows(room.id);
    const roomHead = editing
      ? `<div class="room-basics"><div><label>房间名称</label><input id="roomName_${safe(room.id)}" value="${esc(room.name || '')}"></div><div><label>单次保洁费</label><input id="roomFee_${safe(room.id)}" type="number" value="${esc(room.cleaning_fee || 0)}"></div><div><label>卫生间</label><select id="roomBathroom_${safe(room.id)}">${roomBathroomOptions(room.bathroom_type || 'private')}</select></div><div><label>房间厨房</label><div class="check-grid"><label><input id="roomKitchen_${safe(room.id)}" type="checkbox" ${roomHasKitchen(room) ? 'checked' : ''}> 房间内有厨房/小厨房</label></div><div class="small">默认不选；不选时房间保洁不包含厨房打扫。</div></div><div><label>房间独有电器</label>${roomApplianceCheckboxes(room)}<div class="small">默认不选；只有勾选后才会生成家电细节清洁任务。</div></div><div class="property-actions"><button class="smallbtn primary" onclick="saveRoomBasics('${esc(room.id)}',this)">保存</button><button class="smallbtn" onclick="cancelRoomBasics()">取消</button></div></div>`
      : `<div><strong>${esc(room.name || room.id)}</strong><div class="small">清洁费：${money(room.cleaning_fee || 0)} · ${roomBathroomLabel(room)} · ${roomKitchenLabel(room)} · 电器：${esc(roomApplianceLabel(room))} · ${channels.length} 个渠道</div></div><div class="property-actions"><button class="smallbtn" onclick="editRoomBasics('${esc(room.id)}')">修改</button><button class="smallbtn" onclick="deleteRoomUi('${esc(room.id)}',this)">删除</button></div>`;
    return `<div class="room-setting-card"><div class="room-head">${roomHead}</div><div class="property-subcard"><div class="property-detail-head"><div><h3 style="margin:0">渠道 / iCal</h3><div class="small">同一个真实房间只建一次；多个 Airbnb 账号或平台都作为渠道挂在这里。</div></div><button class="smallbtn primary" onclick="addChannelListing('${esc(room.id)}')">添加渠道</button></div><div class="channel-list">${channels.length ? channels.map(ch => renderChannel(room,ch)).join('') : '<div class="empty-panel">还没有渠道。点击“添加渠道”后粘贴 Airbnb/平台导出的 iCal。</div>'}</div></div></div>`;
  }
  function renderCleanerPanel(prop){
    const cleaners = propCleaners(prop.id);
    return `<div class="settings-section"><div class="property-detail-head"><div><h3 style="margin:0">保洁绑定</h3><div class="small">输入保洁编号后绑定到这个房源。</div></div></div><div class="channel-row"><input id="cleanerCode_${safe(prop.id)}" placeholder="例如 CLN-1091"><button class="smallbtn primary" onclick="bindPropertyCleanerUi('${esc(prop.id)}',this)">绑定保洁</button></div><div class="property-meta">${cleaners.length ? cleaners.map(c => `<span class="badge green">${esc(c.cleaner_code)} <button class="tiny-link" onclick="unbindPropertyCleanerUi('${esc(prop.id)}','${esc(c.cleaner_code)}',this)">删除</button></span>`).join('') : '<span class="small">还没有绑定保洁。</span>'}</div></div>`;
  }
  function renderCommonAreaPanel(prop){
    const areas = propAreas(prop.id);
    return `<div class="settings-section"><div class="property-detail-head"><div><h3 style="margin:0">公区设置</h3><div class="small">勾选这个公区包含哪些内容，并填写共享厨房、共享卫生间等数量；保洁任务会按这里生成。</div></div><button class="smallbtn primary" onclick="addCommonArea('${esc(prop.id)}')">添加公区</button></div><div class="common-area-list">${areas.length ? areas.map(a => `<div class="common-area-card"><div class="common-area-form"><label class="common-area-field"><span>名称</span><input id="areaName_${safe(a.id)}" value="${esc(a.name || '')}"></label><div class="common-area-field"><span>包含内容</span>${commonAreaComponentControls(a)}</div><label class="common-area-field"><span>每日费用</span><input id="areaFee_${safe(a.id)}" type="number" value="${esc(a.cleaning_fee || 0)}"></label><label class="common-area-field"><span>是否每日保洁</span><select id="areaDaily_${safe(a.id)}"><option value="true" ${a.daily_default!==false?'selected':''}>每天打扫</option><option value="false" ${a.daily_default===false?'selected':''}>不默认</option></select></label><div class="common-area-actions"><button class="smallbtn primary" onclick="saveCommonAreaBasics('${esc(a.id)}',this)">保存</button><button class="smallbtn" onclick="deleteCommonAreaUi('${esc(a.id)}',this)">删除</button></div></div><div class="small">${esc(commonAreaReason(a))}</div></div>`).join('') : '<div class="empty-panel">还没有公区。</div>'}</div></div>`;
  }
  function roomSettingsPanelKey(kind,id){
    return id ? `${kind}:${id}` : String(kind || 'summary');
  }
  function activeRoomSettingsPanel(rooms){
    let key = ui.roomSettingsPanel || 'summary';
    const fixed = new Set(['summary','cleaners','mail','areas']);
    if(key.startsWith('room:')){
      const roomId = key.slice(5);
      if((rooms || []).some(r => String(r.id) === roomId)) return key;
      key = 'summary';
    }
    if(!fixed.has(key)) key = 'summary';
    ui.roomSettingsPanel = key;
    return key;
  }
  function setRoomSettingsPanel(kind,id){
    ui.roomSettingsPanel = roomSettingsPanelKey(kind,id);
    renderRoomSettingsImpl();
    setTimeout(() => {
      const detail = qs('roomSettingsDetail');
      if(detail && ui.roomSettingsPanel !== 'summary') detail.scrollIntoView({block:'nearest', behavior:'smooth'});
    }, 0);
  }
  function cleanerDisplay(code){
    const key = String(code || '').trim().toUpperCase();
    const user = getUsers().find(u => String(u.cleaner_code || '').trim().toUpperCase() === key);
    const name = user && (user.display_name || user.name || user.username || '');
    return name && String(name).toUpperCase() !== key ? `${key} · ${name}` : key;
  }
  function channelSummaryStatus(ch){
    if(!ch) return {kind:'warn', text:'未建渠道'};
    const issue = cleanChannelUrls({...ch}, false);
    const platform = ch.platform || '渠道';
    if(issue.moved) return {kind:'warn', text:`${platform} 房源链接填错位置`};
    if(!issue.ok) return {kind:'error', text:`${platform} iCal 错误`};
    if(!String(ch.ical_url || '').trim() && ch.last_sync) return {kind:'warn', text:`${platform} 缺 iCal，旧同步 ${Number(ch.synced_booking_count || 0)} 条`};
    if(!String(ch.ical_url || '').trim()) return {kind:'warn', text:`${platform} 缺 iCal`};
    if(ch.sync_error) return {kind:'error', text:`${platform} 同步失败`};
    if(ch.last_sync) return {kind:'ok', text:`${platform} 已同步 ${Number(ch.synced_booking_count || 0)} 条`};
    if(ch.ical_url) return {kind:'warn', text:`${platform} 已填未同步`};
    return {kind:'warn', text:`${platform} 缺 iCal`};
  }
  function roomChannelBadges(room){
    const rows = channelRows(room.id);
    if(!rows.length) return '<span class="mini-status warn">未建渠道</span>';
    return rows.map(ch => {
      const status = channelSummaryStatus(ch);
      return `<span class="mini-status ${esc(status.kind)}">${esc(status.text)}</span>`;
    }).join('');
  }
  function renderPropertyRoomIndex(prop, rooms){
    const active = activeRoomSettingsPanel(rooms);
    const cleaners = propCleaners(prop.id);
    const areas = propAreas(prop.id);
    const mailRow = mailSetting(prop.id) || {};
    const mailEvents = ui.mail.mailEvents.filter(e => String(e.property_id) === String(prop.id));
    const mailStatus = mailRow.source_email ? `${mailRow.source_email} · ${mailRow.forward_status || '未设置状态'}` : '未设置通知邮箱';
    const itemClass = key => `room-index-item ${active === key ? 'active' : ''}`;
    return `<div class="room-index-section"><div class="room-index-head"><div><h3 style="margin:0">房源索引</h3><div class="small">先看状态；点保洁、邮件、公区或某个房间后，下面只展开对应设置。</div></div><div class="property-actions"><button class="smallbtn" onclick="setRoomSettingsPanel('summary')">收起详情</button><button class="smallbtn primary" onclick="addRoom('${esc(prop.id)}')">添加房间</button></div></div><div class="room-index-grid"><button type="button" class="${itemClass('cleaners')}" onclick="setRoomSettingsPanel('cleaners')"><div class="room-index-title"><span>保洁绑定</span><span class="badge green">${cleaners.length} 个</span></div><div class="room-index-desc">${cleaners.length ? cleaners.map(c => esc(cleanerDisplay(c.cleaner_code))).join('、') : '还没有绑定保洁'}</div></button><button type="button" class="${itemClass('mail')}" onclick="setRoomSettingsPanel('mail')"><div class="room-index-title"><span>邮件提醒</span><span class="badge ${mailEvents.length ? 'orange' : 'blue'}">${mailEvents.length} 条</span></div><div class="room-index-desc">${esc(mailStatus)}</div></button><button type="button" class="${itemClass('areas')}" onclick="setRoomSettingsPanel('areas')"><div class="room-index-title"><span>公区</span><span class="badge orange">${areas.length} 个</span></div><div class="room-index-desc">${areas.length ? areas.map(a => esc(a.name || a.id)).join('、') : '还没有公区'}</div></button>${rooms.length ? rooms.map(room => { const key = roomSettingsPanelKey('room', room.id); return `<button type="button" class="${itemClass(key)}" onclick="setRoomSettingsPanel('room','${esc(room.id)}')"><div class="room-index-title"><span>${esc(room.name || room.id)}</span><span class="badge blue">${channelRows(room.id).length} 渠道</span></div><div class="room-index-meta">${roomChannelBadges(room)}</div></button>`; }).join('') : '<div class="empty-panel">这个房源还没有房间。</div>'}</div></div>`;
  }
  function renderPropertyMailSummaryPanel(prop){
    return renderPropertyMailPanel(prop);
  }
  function renderRoomSettingsDetail(prop, rooms){
    const active = activeRoomSettingsPanel(rooms);
    if(active === 'summary') return '';
    if(active === 'cleaners') return renderCleanerPanel(prop);
    if(active === 'mail') return `<div class="settings-section">${renderPropertyMailPanel(prop)}</div>`;
    if(active === 'areas') return renderCommonAreaPanel(prop);
    if(active.startsWith('room:')){
      const roomId = active.slice(5);
      const room = rooms.find(r => String(r.id) === roomId);
      return room ? renderRoomCard(room) : '<div class="empty-panel">这个房间已经不存在。</div>';
    }
    return '';
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
    activeRoomSettingsPanel(rooms);
    root.innerHTML = `<div class="property-detail-head"><div><h2 style="margin:0">${esc(prop.name || prop.id)} 房间管理</h2><div class="small">${rooms.length} 个房间 · ${propAreas(prop.id).length} 个公区 · ${propCleaners(prop.id).length} 个保洁绑定</div><div class="property-location">${esc(propertyLocationText(prop))} · ${esc(propertyTimeZone(prop))}</div></div><div class="property-actions"><button class="smallbtn" onclick="backToPropertyList()">返回房源列表</button><button class="smallbtn" onclick="setRoomSettingsPanel('summary')">房源索引</button><button class="smallbtn primary" onclick="syncPropertyIcal('${esc(prop.id)}',this)">同步当前房源 iCal</button>${sync?`<span class="sync-status ${sync.kind || ''}">${esc(sync.text || '')}</span>`:''}</div></div>${renderPropertyRoomIndex(prop, rooms)}<div id="roomSettingsDetail" class="room-settings-detail">${renderRoomSettingsDetail(prop, rooms)}</div>`;
  }

  function renderOwnerImpl(){
    ensureBaseShell();
    ensureStyles();
    document.body.classList.add('pms-view-owner');
    document.body.classList.remove('pms-view-cleaner');
    if(!currentDataCount() && ui.loading){ensureDataGate('正在加载房源数据...'); return;}
    ensureOwnerPropertyModuleVisible();
    initSelectsImpl();
    renderOwnerMetricsImpl();
    ensureOwnerFinanceTab();
    ensureOwnerAccessTab();
    ensureOwnerOpsTab();
    ensureOwnerProfileTab();
    renderOwnerTabImpl(activeOwnerTabId());
    setHeader('owner');
    ensureLogoutButton();
    ensureVersionBadge();
  }
  function activeOwnerTabId(){const active = document.querySelector('#owner > .tab-content.active'); return active && active.id ? active.id : 'ownerDailyWork';}
  function renderOwnerTabImpl(id){
    const requested = id || activeOwnerTabId();
    const tab = ownerTabAllowed(requested) ? requested : firstAllowedOwnerTab();
    if(tab !== requested){
      showOwnerTabImpl(tab, ownerTabButton(tab));
      return;
    }
    if(tab === 'ownerCalendar'){renderOwnerCalendarImpl(); renderSixMonthStatsImpl(); renderOwnerBookingsImpl();}
    else if(tab === 'ownerCleaning'){renderCleaningManagerShell();}
    else if(tab === 'ownerRooms'){renderRoomSettingsImpl();}
    else if(tab === 'ownerFinance'){renderFinanceManagerImpl();}
    else if(tab === 'ownerAccess'){renderAccessManagerImpl();}
    else if(tab === 'ownerOps'){renderOpsCenterImpl();}
    else if(tab === 'ownerProfile'){renderUserProfileImpl();}
    else renderDailyWorkImpl();
  }
  function showOwnerTabImpl(id,btn){
    if(!ownerTabAllowed(id)){
      const fallback = firstAllowedOwnerTab();
      if(fallback && fallback !== id) return showOwnerTabImpl(fallback, ownerTabButton(fallback));
      return;
    }
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
    if(text === 'admin') return t('role.admin');
    if(text === 'owner') return t('role.owner');
    if(text === 'cleaner') return t('role.cleaner');
    return text || t('role.unknown');
  }
  function renderUserProfilePanel(rootId){
    const root = qs(rootId);
    if(!root) return;
    const u = getCurrentUser() || {};
    const email = profileEmail(u);
    const phone = profilePhone(u);
    const wechat = profileWechat(u);
    const cleanerCode = u.cleaner_code || u.cleanerCode || '';
    const emptyText = currentLanguage() === 'zh-CN' ? '未填写' : '';
    const cleanerCodeField = isCleanerProfile(u) ? `<div class="profile-field"><label>${esc(t('profile.cleanerCode'))}</label><input readonly value="${esc(cleanerCode || (currentLanguage() === 'zh-CN' ? '未生成' : ''))}"></div>` : '';
    root.innerHTML = `<div class="card user-profile-card"><div class="property-detail-head"><div><h2>${esc(t('profile.title'))}</h2><div class="small">${esc(t('profile.sub'))}</div></div><span class="badge green">${esc(roleLabel(u.role))}</span></div><div class="profile-grid"><div class="profile-field"><label>${esc(t('profile.displayName'))}</label><input id="${rootId}_displayName" value="${esc(u.name || '')}" placeholder="例如 zhoulimei"></div><div class="profile-field"><label>${esc(t('profile.timezone'))}</label><select id="${rootId}_timezone">${timeZoneOptions(userTimeZone())}</select></div><div class="profile-field"><label>${esc(t('profile.language'))}</label><select id="${rootId}_language">${languageOptions(currentLanguage())}</select></div><div class="profile-field"><label>${esc(t('profile.username'))}</label><input readonly value="${esc(u.username || emptyText)}"></div><div class="profile-field"><label>${esc(t('profile.email'))}</label><input readonly value="${esc(email || emptyText)}"></div><div class="profile-field"><label>${esc(t('profile.phone'))}</label><input id="${rootId}_phone" value="${esc(phone || '')}" autocomplete="tel" placeholder="手机号"></div><div class="profile-field"><label>${esc(t('profile.wechat'))}</label><input id="${rootId}_wechat" value="${esc(wechat || '')}" placeholder="微信号"></div>${cleanerCodeField}<div class="profile-field"><label>${esc(t('profile.role'))}</label><input readonly value="${esc(roleLabel(u.role))}"></div><div class="profile-field"><label>新密码</label><input id="${rootId}_password" type="password" autocomplete="new-password" placeholder="不修改请留空"></div><div class="profile-field"><label>确认新密码</label><input id="${rootId}_password2" type="password" autocomplete="new-password" placeholder="再输入一次"></div></div><div class="profile-actions"><button class="smallbtn primary" onclick="saveUserProfile('${rootId}',this)">${esc(t('profile.save'))}</button><span id="${rootId}_profileStatus" class="profile-status"></span></div></div>`;
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
    if(!name) return alert(t('profile.required'));
    const timezoneInput = qs(rootId + '_timezone');
    const tz = normalizeTimeZone(timezoneInput && timezoneInput.value);
    const languageInput = qs(rootId + '_language');
    const lang = normalizeLanguage(languageInput && languageInput.value);
    const phone = String((qs(rootId + '_phone') && qs(rootId + '_phone').value) || '').trim();
    const wechat = String((qs(rootId + '_wechat') && qs(rootId + '_wechat').value) || '').trim();
    const password = String((qs(rootId + '_password') && qs(rootId + '_password').value) || '');
    const password2 = String((qs(rootId + '_password2') && qs(rootId + '_password2').value) || '');
    if(password || password2){
      if(password !== password2) return alert('两次输入的新密码不一致');
      if(password.length < 6) return alert('新密码至少 6 位');
    }
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = t('profile.saving');}
    try{
      const res = await fetch(apiUrl('/api/profile'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, timezone: tz, time_zone: tz, language: lang, locale: lang, phone, wechat, new_password: password})
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('保存失败 HTTP ' + res.status));
      try{localStorage.setItem('pms_timezone', tz);}catch(e){}
      saveLanguageLocal(lang);
      if(data.user) setCurrentUser({...getCurrentUser(), ...data.user});
      if(data.state) applyStateFromServerImpl(data.state);
      renderUserProfileImpl();
      setHeader(isActualCleaner() ? 'cleaner' : 'owner');
      ensureLanguageSelector();
      ensureTimezoneSelector();
      const status = qs(rootId + '_profileStatus');
      if(status) status.textContent = t('profile.saved');
    }catch(e){
      alert(t('profile.saveFailed') + (e && e.message ? e.message : e));
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || t('profile.save');}
    }
  }
  function renderCleanerNotesToday(){
    const rows = getNotes().filter(n => !n.recurring_task && n.date === today() && cleanerCanSeeTarget(n.target_id,n.target_type || 'room')).concat(getRoomNotes().filter(n => n.date === today() && cleanerCanSeeTarget(n.room_id,'room')).map(n => ({...n,target_id:n.room_id,target_type:'room',roomDate:true})));
    if(!rows.length) return '';
    return `<div class="card"><h2>今日特别事项</h2>${rows.map(n => `<div class="note-card ${n.priority === '重要' ? 'important' : ''}"><div class="note-title">${priorityBadge(n.priority)} ${objectBadge(n.target_type)} ${esc(targetName(n.target_id,n.target_type))} ${n.roomDate?'日期事项':''}</div><div>${esc(n.note)}</div></div>`).join('')}</div>`;
  }
  function activeCleanerTab(){
    const ids = ['cleanerToday','cleanerFuture','cleanerManual','cleanerHistory','cleanerProfile'];
    const active = ids.find(id => qs(id) && qs(id).classList.contains('active'));
    if(active === 'cleanerProfile' && !isActualCleaner()) return 'cleanerToday';
    return active || 'cleanerToday';
  }
  function cleanerRowsForRange(start,end){
    return actualCleaningRowsImpl(start,end,false).filter(r => cleanerCanSeeTarget(r.target_id,r.target_type));
  }
  function renderCleanerTabContentImpl(tabId, options={}){
    const active = tabId || activeCleanerTab();
    if(active === 'cleanerProfile'){
      renderUserProfileImpl();
      return;
    }
    if(active === 'cleanerToday'){
      const rows = options.todayRows || cleanerRowsForRange(today(), today()).filter(r => r.date === today()).sort((a,b) => targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
      const box = qs('cleanerToday'); if(box) box.innerHTML = cleaningTableScoped(rows, true, {compactTasks:true});
      return;
    }
    if(active === 'cleanerFuture'){
      const rows = cleanerRowsForRange(addDay(today(),1), addDay(today(),180)).filter(r => r.date > today()).sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN')).slice(0,120);
      const box = qs('cleanerFuture'); if(box) box.innerHTML = cleaningRowsByDayHtml(rows, {order:'asc'});
      return;
    }
    if(active === 'cleanerManual'){
      const box = qs('cleanerManual'); if(box) box.innerHTML = renderManualRecordsHTMLImpl(getManual().filter(m => cleanerCanSeeTarget(m.target_id,m.target_type || 'room')),false);
      return;
    }
    if(active === 'cleanerHistory'){
      const historyRows = cleanerRowsForRange(addDay(today(),-90), addDay(today(),-1)).filter(r => r.date < today()).sort((a,b) => String(a.date).localeCompare(String(b.date)) || targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
      const box = qs('cleanerHistory');
      if(box) box.innerHTML = `<div class="card"><h2>历史保洁 | 按天统计</h2><div class="small">先按日期倒序显示；每天先看房间数、公区数和金额，再展开当天明细。</div></div>${cleaningRowsByDayHtml(historyRows, {order:'desc'})}`;
    }
  }
  function renderCleanerImpl(){
    ensureBaseShell();
    ensureStyles();
    document.body.classList.add('pms-view-cleaner');
    document.body.classList.remove('pms-view-owner');
    ensureCleanerContainers();
    const todayRows = cleanerRowsForRange(today(), today()).filter(r => r.date === today()).sort((a,b) => targetName(a.target_id,a.target_type).localeCompare(targetName(b.target_id,b.target_type),'zh-Hans-CN'));
    const summary = qs('cleanerSummary'); if(summary) summary.innerHTML = cleanerSummaryHtml();
    const metrics = qs('cleanerMetrics'); if(metrics) metrics.innerHTML = `<div class="metric"><div class="small">${isActualCleaner()?'已绑定房源':'可查看房源'}</div><div class="num">${cleanerBoundProperties().length}</div></div><div class="metric"><div class="small">可查看房间</div><div class="num">${getRooms().filter(r => cleanerCanSeeTarget(r.id,'room')).length}</div></div><div class="metric"><div class="small">今日保洁</div><div class="num">${todayRows.length}</div></div><div class="metric"><div class="small">今日事项</div><div class="num">${getNotes().filter(n => !n.recurring_task && n.date === today() && cleanerCanSeeTarget(n.target_id,n.target_type || 'room')).length + getRoomNotes().filter(n => n.date === today() && cleanerCanSeeTarget(n.room_id,'room')).length}</div></div>`;
    const notes = qs('cleanerTodayNotes'); if(notes) notes.innerHTML = renderCleanerNotesToday();
    renderCleanerTabContentImpl(activeCleanerTab(), {todayRows});
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
  function openPropertyMailInRooms(propertyId){
    const id = String(propertyId || '');
    if(id && !ownerPropIds().includes(id)){
      setOwnerPropertyIds(ownerPropIds().concat([id]));
      setOwnerRoomIds(validOwnerRoomIds());
    }
    if(id) ui.selectedPropertyId = id;
    ui.roomSettingsPanel = 'mail';
    const owner = qs('owner');
    const btn = owner && Array.from(owner.querySelectorAll('.tabbar button')).find(b => (b.textContent || '').includes('房间/公区'));
    showOwnerTabImpl('ownerRooms', btn || null);
    setTimeout(() => {
      const panel = qs('roomSettingsDetail') || qs('mailPanel_' + safe(id));
      if(panel) panel.scrollIntoView({block:'start', behavior:'smooth'});
      const input = qs('mailSource_' + safe(id));
      if(input) input.focus();
    }, 0);
  }
  function openPropertyMailTab(propertyId){
    openPropertyMailInRooms(propertyId);
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
    if(id && String(id).startsWith('cleaner')) renderCleanerTabContentImpl(id);
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
    if(isActualCleaner() || (cleanerPath() && !isOwnerLike())) renderCleanerImpl();
    else {
      renderOwnerImpl();
      const cleaner = qs('cleaner');
      if(cleaner && !cleaner.classList.contains('active')) cleaner.style.display = 'none';
    }
    ensureVersionBadge();
  }
  async function initAppImpl(){
    if(ui.bootingPromise) return ui.bootingPromise;
    if(ui.booted && currentDataCount()){
      applyRoleModeImpl();
      return;
    }
    ui.bootStarted = true;
    ui.bootingPromise = (async () => {
      ensureBaseShell();
      ensureStyles();
      ensureLogoutButton();
      try{
        await loadStateImpl();
        if(isOwnerLike() && ensureDefaultRoomCleaningTasks()){
          scheduleSaveImpl();
        }
        ['manualDate','noteDate','noteFilterDate','roomNoteDate','workDate'].forEach(id => { const el = qs(id); if(el && !el.value) el.value = today(); });
        applyRoleModeImpl();
        ui.booted = true;
      }catch(e){
        console.error(e);
        clearDataGate();
        alert('加载 PMS 数据失败：' + (e && e.message ? e.message : e));
      }finally{
        ui.bootingPromise = null;
      }
    })();
    return ui.bootingPromise;
  }

  function startUnifiedApp(){
    if(ui.bootStarted && (ui.bootingPromise || ui.booted)) return;
    initAppImpl().catch(e => console.error(e));
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
  async function saveOwnerRoomDefault(btn){
    const ids = ownerRoomIds();
    if(!ids.length) return alert('至少选择一个房间再保存默认。');
    const user = getCurrentUser() || {};
    const name = String(user.name || user.username || '房东').trim();
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = t('profile.saving');}
    try{
      const res = await fetch(apiUrl('/api/profile'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, default_room_ids: ids})
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('保存默认失败 HTTP ' + res.status));
      if(data.user) setCurrentUser({...getCurrentUser(), ...data.user});
      if(data.state) applyStateFromServerImpl(data.state);
      ui.selectedRoomIds = ids;
      const status = qs('roomDefaultStatus');
      if(status){
        status.style.display = 'inline-flex';
        status.textContent = `已保存默认 ${ids.length} 个`;
      }
      renderAll();
    }catch(e){
      alert('保存默认房间失败：' + (e && e.message ? e.message : e));
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || '保存默认';}
    }
  }
  function refreshPropertyHub(){loadStateImpl().then(renderAll).catch(e => alert('刷新失败：' + e.message));}
  function editPropertyName(id){ui.editingProperty = id; ensureOwnerPropertyModuleVisible();}
  function cancelPropertyNameEdit(){ui.editingProperty = ''; ensureOwnerPropertyModuleVisible();}
  async function savePropertyName(id,btn){
    const prop = propList().find(p => String(p.id) === String(id));
    const input = qs('propertyName_' + safe(id));
    if(prop){
      const cityInput = qs('propertyCity_' + safe(id));
      const addressInput = qs('propertyAddress_' + safe(id));
      const timezoneInput = qs('propertyTimezone_' + safe(id));
      if(input) prop.name = input.value.trim() || prop.name || prop.id;
      prop.city = (cityInput && cityInput.value.trim()) || propertyCity(prop);
      prop.address = (addressInput && addressInput.value.trim()) || propertyAddress(prop);
      prop.timezone = normalizeTimeZone(timezoneInput && timezoneInput.value);
      prop.time_zone = prop.timezone;
    }
    ui.editingProperty = '';
    await persistAll(btn);
    renderAll();
  }
  async function addProperty(){
    const id = 'property_' + Date.now();
    const existingNames = new Set(propList().map(p => String(p.name || '').trim()).filter(Boolean));
    let name = '新房源';
    for(let i=2; existingNames.has(name); i++) name = '新房源' + i;
    propList().push({id, group_id: groupId(), name, city: DEFAULT_PROPERTY_CITY, address: DEFAULT_PROPERTY_ADDRESS, timezone: DEFAULT_TIME_ZONE, time_zone: DEFAULT_TIME_ZONE, created_at: nowIso()});
    setOwnerPropertyIds(validPropIds().concat([id]));
    ui.selectedPropertyId = id;
    ui.editingProperty = id;
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
    ui.roomSettingsPanel = 'summary';
    const btn = Array.from(document.querySelectorAll('#owner .tabbar button')).find(b => (b.textContent || '').includes('房间'));
    showOwnerTabImpl('ownerRooms', btn || null);
    setTimeout(() => qs('roomSettings') && qs('roomSettings').scrollIntoView({block:'start',behavior:'smooth'}), 0);
  }
  function backToPropertyList(){ui.selectedPropertyId = ''; ui.roomSettingsPanel = 'summary'; renderRoomSettingsImpl(); ensureOwnerPropertyModuleVisible();}
  function editRoomBasics(id){ui.editingRoom = id; ui.roomSettingsPanel = roomSettingsPanelKey('room', id); renderRoomSettingsImpl();}
  function cancelRoomBasics(){ui.editingRoom = ''; renderRoomSettingsImpl();}
  async function saveRoomBasics(id,btn){
    const room = getRooms().find(r => String(r.id) === String(id));
    if(room){
      const name = (qs('roomName_' + safe(id)) && qs('roomName_' + safe(id)).value.trim()) || room.name || id;
      const propId = roomPropId(id);
      if(roomNameExists(propId,name,id)) return alert('同一个房源里不能有相同房间名。请换一个房间名。');
      room.name = name;
      room.cleaning_fee = Number((qs('roomFee_' + safe(id)) && qs('roomFee_' + safe(id)).value) || 0);
      room.bathroom_type = (qs('roomBathroom_' + safe(id)) && qs('roomBathroom_' + safe(id)).value) || room.bathroom_type || 'private';
      room.has_kitchen = readRoomHasKitchen(id);
      room.appliances = readRoomAppliances(id);
      ensureDefaultRoomCleaningTasksForRoom(room);
    }
    ui.editingRoom = '';
    await persistAll(btn);
    renderAll();
  }
  async function addRoomImpl(propId){
    const id = 'room_' + Date.now();
    const propertyId = propId || (selectedProp() && selectedProp().id) || (propList()[0] && propList()[0].id) || 'property_default';
    const room = {id, property_id: propertyId, name: nextRoomName(propertyId), cleaning_fee: 30, bathroom_type:'private', has_kitchen:false, appliances:[], type:'room', created_at:nowIso()};
    getRooms().push(room);
    ensureDefaultRoomCleaningTasksForRoom(room);
    setOwnerPropertyIds([propertyId]);
    setOwnerRoomIds(validOwnerRoomIds());
    ui.selectedPropertyId = propertyId;
    ui.roomSettingsPanel = roomSettingsPanelKey('room', id);
    await persistAll();
    renderAll();
  }
  async function deleteRoomUi(id,btn){
    if(!confirm('确定删除这个房间？')) return;
    setRooms(getRooms().filter(r => String(r.id) !== String(id)));
    setChannels(getChannels().filter(ch => String(ch.room_id) !== String(id)));
    if(ui.roomSettingsPanel === roomSettingsPanelKey('room', id)) ui.roomSettingsPanel = 'summary';
    await persistAll(btn);
    renderAll();
  }
  async function addCommonAreaImpl(propId){
    const id = 'common_' + Date.now();
    getAreas().push({id, property_id: propId || (selectedProp() && selectedProp().id) || (propList()[0] && propList()[0].id) || 'property_default', name:'新公区', area_type:'general', unit_count:1, has_general:true, general_count:1, general_label:'其他公区', has_kitchen:false, kitchen_count:1, has_bathroom:false, bathroom_count:1, cleaning_fee:20, daily_default:true, type:'common'});
    await persistAll();
    renderAll();
  }
  async function saveCommonAreaBasics(id,btn){
    const area = getAreas().find(a => String(a.id) === String(id));
    if(area){
      area.name = (qs('areaName_' + safe(id)) && qs('areaName_' + safe(id)).value.trim()) || area.name || id;
      area.has_kitchen = !!(qs('areaHasKitchen_' + safe(id)) && qs('areaHasKitchen_' + safe(id)).checked);
      area.kitchen_count = Math.max(1, Number((qs('areaKitchenCount_' + safe(id)) && qs('areaKitchenCount_' + safe(id)).value) || area.kitchen_count || 1));
      area.has_bathroom = !!(qs('areaHasBathroom_' + safe(id)) && qs('areaHasBathroom_' + safe(id)).checked);
      area.bathroom_count = Math.max(1, Number((qs('areaBathroomCount_' + safe(id)) && qs('areaBathroomCount_' + safe(id)).value) || area.bathroom_count || 1));
      area.has_general = !!(qs('areaHasGeneral_' + safe(id)) && qs('areaHasGeneral_' + safe(id)).checked);
      area.general_label = ((qs('areaGeneralLabel_' + safe(id)) && qs('areaGeneralLabel_' + safe(id)).value.trim()) || area.general_label || '其他公区').slice(0, 80);
      area.general_count = Math.max(1, Number((qs('areaGeneralCount_' + safe(id)) && qs('areaGeneralCount_' + safe(id)).value) || area.general_count || 1));
      if(!area.has_kitchen && !area.has_bathroom && !area.has_general) area.has_general = true;
      area.area_type = area.has_kitchen ? 'shared_kitchen' : (area.has_bathroom ? 'shared_bathroom' : 'general');
      area.unit_count = area.has_kitchen ? area.kitchen_count : (area.has_bathroom ? area.bathroom_count : area.general_count);
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
    ui.roomSettingsPanel = roomSettingsPanelKey('room', roomId);
    renderRoomSettingsImpl();
  }
  async function saveChannelListing(id,btn){
    const row = readChannelForm(id);
    const check = cleanChannelUrls(row, true);
    if(!check.ok) return alert(check.message);
    const old = btn && btn.textContent;
    if(btn){
      btn.disabled = true;
      btn.textContent = t('profile.saving');
    }
    try{
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 12000) : null;
      let res;
      try{
        res = await fetch(apiUrl('/api/channel-listing'), {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify(row)
        });
      }finally{
        if(timeoutId) clearTimeout(timeoutId);
      }
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('保存失败 HTTP ' + res.status));
      if(data.channelListing){
        const saved = data.channelListing;
        const next = getChannels().filter(ch => String(ch.id) !== String(saved.id));
        next.push(saved);
        setChannels(next);
      }
      rememberGoodState();
      renderRoomSettingsImpl();
    }catch(err){
      alert('保存失败：' + (err && err.message ? err.message : err));
      throw err;
    }finally{
      if(btn){
        btn.disabled = false;
        btn.textContent = old || '保存';
      }
    }
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
    if(btn){btn.disabled = true; btn.textContent = t('profile.saving');}
    setMailPanelStatus(propId,'warn','正在保存邮箱设置...');
    try{
      const res = await fetch(apiUrl('/api/property-mail'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)});
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
      applyStateFromServerImpl(data.state || data);
      setMailPanelStatus(propId,'ok','邮箱设置已保存');
      renderRoomSettingsImpl();
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
    try{
      const diagnostics = await checkMailDiagnostics(propId, null, true).catch(() => null);
      const diagnosticMessage = mailDiagnosticText(diagnostics);
      if(diagnosticMessage.kind === 'error'){
        setMailPanelStatus(propId, diagnosticMessage.kind, diagnosticMessage.text);
        alert(diagnosticMessage.text);
        return null;
      }
      setMailPanelStatus(propId,'warn','正在同步 Gmail...');
      const res = await fetch(apiUrl('/api/mail-events/sync'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_id:propId,days:3,max_results:25})});
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(cleanMailError(data.error || data.detail || '同步 Gmail 失败'));
      applyStateFromServerImpl(data.state || data);
      const details = Array.isArray(data.details) ? data.details : [];
      const detail = details.find(d => String(d.property_id) === String(propId)) || details[0] || {};
      const text = detail.bridge_enabled ? 'Gmail 桥接已启用：邮件由后台自动同步任务写入 PMS' : `Gmail 同步完成：读取 ${Number(detail.emails || 0)} 封，生成 ${Number(detail.events || 0)} 条提醒`;
      setMailPanelStatus(propId,'ok',text);
      renderRoomSettingsImpl();
      setMailPanelStatus(propId,'ok',text);
    }catch(e){
      let text = 'Gmail 同步失败：' + cleanMailError(e && e.message ? e.message : e);
      try{
        const diagnostics = await checkMailDiagnostics(propId, null, true);
        const msg = mailDiagnosticText(diagnostics);
        if(msg.kind === 'error') text = msg.text;
      }catch(_ignored){}
      setMailPanelStatus(propId,'error',text);
      alert(text);
    }
    finally{if(btn){btn.disabled = false; btn.textContent = old || '同步 Gmail';}}
  }
  function cleanMailError(value){
    const text = String(value || '').replace(/\s+/g,' ').trim();
    if(!text) return '未知错误';
    if(text.includes('后台 Gmail OAuth 未配置') || text.includes('GMAIL_CLIENT_ID') || text.includes('GMAIL_CLIENT_SECRET') || text.includes('GMAIL_REFRESH_TOKEN')) return '后台 Gmail OAuth 未配置：Render 需要 GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN';
    if(text.includes('没有可同步的房源邮箱设置')) return '当前房源没有可同步邮箱：先保存 Airbnb 通知邮箱';
    if(text.includes('Gmail API')) return 'Gmail API 请求失败：请检查 Gmail 授权是否过期';
    if(text.includes('Traceback')) return '后台 Gmail 同步失败，请先点“检查 Gmail”查看配置状态';
    return text.slice(0,240);
  }
  function mailDiagnosticText(d){
    if(!d) return {kind:'error', text:'Gmail 检查失败：没有返回诊断结果'};
    if(d.gmail_bridge_configured && !d.gmail_oauth_configured){
      if(!Number(d.target_count || 0)) return {kind:'error', text:'当前房源没有可同步邮箱：先保存 Airbnb 通知邮箱'};
      const hours = Math.round(Number(d.auto_sync_interval_seconds || 7200) / 36) / 100;
      return {kind:'ok', text:`Gmail 桥接已启用；自动同步每 ${hours || 2} 小时；可同步邮箱 ${d.target_count} 个`};
    }
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

  async function markCleaningSubtaskDone(encodedKey,btn){
    const key = decodeURIComponent(encodedKey || '');
    const payload = ui.confirmRows[key];
    if(!payload || !payload.item) return alert('没有找到这条保洁任务，请刷新页面后再试。');
    const item = payload.item;
    const rows = getConfirmations();
    let row = rows.find(x => String(x.task_key || x.taskKey || '') === key);
    const now = nowIso();
    if(!row){
      row = {id:'clean_confirm_' + Date.now() + '_' + safe(key), task_key:key, created_at:now};
      rows.push(row);
    }
    row.status = 'done';
    row.completed = true;
    row.completed_at = now;
    row.completed_by = userName('保洁');
    row.confirmed_at = now;
    row.confirmed_by = userName('保洁');
    row.date = item.date || (payload.row && payload.row.date) || today();
    row.target_id = item.target_id || (payload.row && payload.row.target_id) || '';
    row.target_type = item.target_type || (payload.row && payload.row.target_type) || 'room';
    row.title = item.title || '';
    row.note_id = item.note_id || '';
    await persistCleaningConfirmations([row], btn);
    renderAll();
  }

  async function deferCleaningSubtask(encodedKey,btn){
    const key = decodeURIComponent(encodedKey || '');
    const payload = ui.confirmRows[key];
    if(!payload || !payload.item) return alert('没有找到这条保洁任务，请刷新页面后再试。');
    const item = payload.item;
    if(!item.can_defer) return alert('基础退房保洁不能顺延，必须本次完成。');
    const note = getNotes().find(n => String(n.id || '') === String(item.note_id || ''));
    if(!note) return alert('没有找到这个周期任务，不能顺延。');
    const nextDate = nextCheckoutDateForRoom(item.target_id, item.date || today());
    if(!nextDate) return alert('这个房间未来一年没有下一次退房，暂时不能顺延。');
    note.deferred_occurrences = Array.isArray(note.deferred_occurrences) ? note.deferred_occurrences : [];
    const from = String(item.date || '').slice(0,10);
    const existing = note.deferred_occurrences.find(x => String(x.from_date || '').slice(0,10) === from);
    const row = existing || {};
    row.from_date = from;
    row.to_date = nextDate;
    row.by = userName('保洁');
    row.at = nowIso();
    row.reason = '保洁选择移到下一次退房再做';
    if(!existing) note.deferred_occurrences.push(row);
    await persistAll(btn);
    renderAll();
  }

  function scopedProperties(){
    const ids = new Set(ownerPropIds());
    return propList().filter(p => ids.has(p.id));
  }
  function opsPropertyOptions(selected){
    return scopedProperties().map(p => `<option value="${esc(p.id)}" ${String(p.id) === String(selected || '') ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('');
  }
  function opsRoomOptions(propertyId, selected, includeAll){
    const rooms = getRooms().filter(r => !propertyId || String(roomPropId(r.id)) === String(propertyId));
    const rows = includeAll ? ['<option value="">不指定房间</option>'] : [];
    return rows.concat(rooms.map(r => `<option value="${esc(r.id)}" ${String(r.id) === String(selected || '') ? 'selected' : ''}>${esc(propName(roomPropId(r.id)))} / ${esc(r.name || r.id)}</option>`)).join('');
  }
  function selectedOpsPropertyId(){
    const props = scopedProperties();
    return (props[0] && props[0].id) || '';
  }
  function appendAudit(action, detail, propertyId){
    const u = getCurrentUser() || {};
    const rows = getAuditLog();
    rows.push({id:'audit_' + Date.now() + '_' + Math.random().toString(16).slice(2,7),property_id:propertyId || selectedOpsPropertyId(),action,detail:detail || '',actor_id:u.id || '',actor_name:userName('用户'),created_at:nowIso()});
    setAuditLog(rows.slice(-500));
  }
  function monthStart(value){
    const text = String(value || today().slice(0,7)).slice(0,7);
    return /^\d{4}-\d{2}$/.test(text) ? text + '-01' : today().slice(0,7) + '-01';
  }
  function monthEnd(value){
    const start = monthStart(value);
    const y = Number(start.slice(0,4));
    const m = Number(start.slice(5,7));
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0,10);
  }
  function financeDirection(row){
    const dir = String((row && (row.direction || row.type)) || '').toLowerCase();
    return dir === 'income' || dir === 'revenue' ? 'income' : 'expense';
  }
  function financeAmountValue(value){
    if(typeof value === 'number') return Math.abs(value || 0);
    const text = String(value || '').replace(/,/g,'');
    const match = text.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
    return match ? Math.abs(Number(match[1] || 0)) : 0;
  }
  function financeSignedAmount(row){
    const amount = financeAmountValue(row && row.amount);
    return financeDirection(row) === 'income' ? amount : -amount;
  }
  function financeScopePropertyIds(){
    return new Set(ownerPropIds().map(String));
  }
  function financePropertyOptions(selected, includeAll){
    const scoped = financeScopePropertyIds();
    const rows = propList().filter(p => scoped.has(String(p.id)));
    return `${includeAll ? `<option value="">全部房源</option>` : ''}${rows.map(p => `<option value="${esc(p.id)}" ${String(selected || '') === String(p.id) ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}`;
  }
  function selectedFinancePropertyId(){
    const el = qs('financePropFilter');
    return el ? el.value : '';
  }
  function financeMailIncomeRecordsForMonth(month, propId){
    const start = monthStart(month);
    const end = monthEnd(month);
    const scoped = financeScopePropertyIds();
    const manualKeys = new Set(getExpenseRecords().filter(row => financeDirection(row) === 'income').map(row => String(row.mail_event_id || row.source_event_id || row.reservation_code || '').trim()).filter(Boolean));
    return (ui.mail.mailEvents || []).filter(event => {
      if(!event || !scoped.has(String(event.property_id || ''))) return false;
      if(propId && String(event.property_id || '') !== String(propId)) return false;
      const amount = financeAmountValue(event.amount);
      if(!amount) return false;
      const type = String(event.event_type || '').toLowerCase();
      if(!['new_booking','reservation_change','payment'].includes(type)) return false;
      const eventKeys = [event.id, event.reservation_code].map(value => String(value || '').trim()).filter(Boolean);
      if(eventKeys.some(key => manualKeys.has(key))) return false;
      const d = String(event.checkin || event.received_at || event.created_at || '').slice(0,10);
      return d >= start && d <= end;
    }).map(event => {
      const type = String(event.event_type || '').toLowerCase();
      return {
        id: 'mail_income_' + (event.id || event.reservation_code || Math.random().toString(16).slice(2)),
        property_id: event.property_id,
        room_id: event.room_id || '',
        date: String(event.checkin || event.received_at || event.created_at || '').slice(0,10),
        direction: 'income',
        category: type === 'payment' ? 'Airbnb款项' : 'Airbnb房费',
        amount: financeAmountValue(event.amount),
        vendor: event.guest || 'Airbnb',
        note: [event.reservation_code ? ('订单 ' + event.reservation_code) : '', event.room_id ? roomName(event.room_id) : '', '邮件自动识别'].filter(Boolean).join(' / '),
        virtual: true,
        mail_event_id: event.id || '',
        reservation_code: event.reservation_code || '',
        created_at: event.received_at || event.created_at || '',
      };
    });
  }
  function financeRecordsForMonth(month, propId){
    const start = monthStart(month);
    const end = monthEnd(month);
    const scoped = financeScopePropertyIds();
    const manual = getExpenseRecords().filter(row => {
      if(!row || !scoped.has(String(row.property_id || ''))) return false;
      if(propId && String(row.property_id || '') !== String(propId)) return false;
      const d = String(row.date || '').slice(0,10);
      return d >= start && d <= end;
    });
    return manual.concat(financeMailIncomeRecordsForMonth(month, propId)).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  function financeCleaningRowsForMonth(month, propId){
    const start = monthStart(month);
    const end = monthEnd(month);
    return scopedCleaningRows(start,end).filter(row => {
      const pid = targetPropId(row.target_id,row.target_type);
      return (!propId || String(pid) === String(propId));
    });
  }
  function renderFinanceManagerImpl(){
    const root = qs('ownerFinanceShell');
    if(!root) return;
    if(!canPermission('finance_view')){
      root.innerHTML = '<div class="card"><h2>财务管理</h2><p class="small">当前账号没有财务查看权限。</p></div>';
      return;
    }
    const currentMonth = (qs('financeMonth') && qs('financeMonth').value) || today().slice(0,7);
    const propId = selectedFinancePropertyId();
    const records = financeRecordsForMonth(currentMonth, propId);
    const cleaningRows = financeCleaningRowsForMonth(currentMonth, propId);
    const income = records.filter(r => financeDirection(r) === 'income').reduce((sum,r) => sum + Math.abs(Number(r.amount || 0)), 0);
    const expenses = records.filter(r => financeDirection(r) !== 'income').reduce((sum,r) => sum + Math.abs(Number(r.amount || 0)), 0);
    const cleaningCost = cleaningRows.reduce((sum,r) => sum + rowAmount(r), 0);
    const net = income - expenses - cleaningCost;
    const canEdit = canPermission('finance_edit');
    const rowsHtml = records.length ? records.map(row => {
      const dir = financeDirection(row);
      const cls = dir === 'income' ? 'green' : 'yellow';
      const autoBadge = row.virtual ? '<span class="badge blue">邮件自动</span> ' : '';
      return `<tr><td>${esc(row.date || '')}</td><td>${esc(propName(row.property_id))}</td><td><span class="badge ${cls}">${dir === 'income' ? '收入' : '支出'}</span></td><td>${autoBadge}${esc(row.category || '')}</td><td>${money(financeSignedAmount(row))}</td><td>${esc([row.vendor,row.note].filter(Boolean).join(' / '))}</td><td>${canEdit && !row.virtual ? `<button class="smallbtn" onclick="deleteFinanceRecord('${esc(row.id)}',this)">删除</button>` : ''}</td></tr>`;
    }).join('') : '<tr><td colspan="7">暂无财务记录</td></tr>';
    const formHtml = canEdit ? `<div class="ops-panel"><h3>新增收支</h3><div class="ops-form"><label>日期<input id="financeDate" type="date" value="${today()}"></label><label>房源<select id="financeProp">${financePropertyOptions(propId || Array.from(financeScopePropertyIds())[0] || '', false)}</select></label><label>类型<select id="financeDirection"><option value="expense">支出</option><option value="income">收入</option></select></label><label>分类<input id="financeCategory" placeholder="房费 / 保洁 / 维修 / 耗材"></label><label>金额<input id="financeAmount" type="number" step="0.01" value="0"></label><label>对象<input id="financeVendor" placeholder="客人 / 商家 / 平台"></label><label style="grid-column:1/-1">备注<input id="financeNote" placeholder="订单号、发票、用途"></label><button class="smallbtn primary" onclick="addFinanceRecord(this)">新增记录</button></div></div>` : '';
    root.innerHTML = `<div class="card"><div class="property-detail-head"><div><h2>财务管理</h2><div class="small">按月份和房源统计收入、支出、保洁成本和净额；和运营中心费用账本使用同一份数据。</div></div><div class="property-actions"><input id="financeMonth" type="month" value="${esc(currentMonth)}" onchange="renderFinanceManager()"><select id="financePropFilter" onchange="renderFinanceManager()">${financePropertyOptions(propId, true)}</select></div></div></div><div class="grid"><div class="metric"><div class="small">收入</div><div class="num">${money(income)}</div></div><div class="metric"><div class="small">支出</div><div class="num">${money(expenses)}</div></div><div class="metric"><div class="small">保洁成本</div><div class="num">${money(cleaningCost)}</div></div><div class="metric"><div class="small">净额</div><div class="num">${money(net)}</div></div></div>${formHtml}<div class="ops-panel"><div class="property-detail-head"><h3>收支明细</h3><span class="badge blue">${records.length} 条</span></div><table><tr><th>日期</th><th>房源</th><th>类型</th><th>分类</th><th>金额</th><th>备注</th><th></th></tr>${rowsHtml}</table></div><div class="ops-panel"><div class="property-detail-head"><h3>本月保洁成本明细</h3><span class="badge yellow">${cleaningRows.length} 条 / ${money(cleaningCost)}</span></div>${cleaningRows.length ? cleaningTableScoped(cleaningRows) : '<div class="ops-empty">本月暂无保洁成本。</div>'}</div>`;
  }
  async function addFinanceRecord(btn){
    if(!canPermission('finance_edit')) return alert('当前账号没有财务编辑权限。');
    const propId = (qs('financeProp') && qs('financeProp').value) || Array.from(financeScopePropertyIds())[0] || '';
    const amount = Math.abs(Number((qs('financeAmount') && qs('financeAmount').value) || 0));
    if(!propId) return alert('请先选择房源。');
    if(!amount) return alert('请填写金额。');
    const direction = (qs('financeDirection') && qs('financeDirection').value) || 'expense';
    const category = String((qs('financeCategory') && qs('financeCategory').value) || (direction === 'income' ? '房费' : '其他')).trim();
    getExpenseRecords().unshift({id:'finance_'+Date.now(),property_id:propId,date:(qs('financeDate')&&qs('financeDate').value)||today(),direction,category,amount,vendor:(qs('financeVendor')&&qs('financeVendor').value)||'',note:(qs('financeNote')&&qs('financeNote').value)||'',created_by:userName('房东'),created_at:nowIso()});
    appendAudit(direction === 'income' ? '新增收入' : '新增支出', `${category} ${money(amount)}`, propId);
    await persistAll(btn);
    renderFinanceManagerImpl();
  }
  async function deleteFinanceRecord(id,btn){
    if(!canPermission('finance_edit')) return alert('当前账号没有财务编辑权限。');
    if(!confirm('删除这条财务记录？')) return;
    const row = getExpenseRecords().find(x => String(x.id) === String(id));
    setExpenseRecords(getExpenseRecords().filter(x => String(x.id) !== String(id)));
    appendAudit('删除财务记录', row ? `${row.category || ''} ${money(row.amount)}` : id, row && row.property_id);
    await persistAll(btn);
    renderFinanceManagerImpl();
  }
  function permissionMapForUser(user){
    const raw = user && user.permissions && typeof user.permissions === 'object' ? user.permissions : {};
    return raw;
  }
  function permissionChecked(user, key){
    const map = permissionMapForUser(user);
    if(!map || !Object.keys(map).length) return true;
    return !!map[key];
  }
  function accessPropertyChecked(user, propId){
    let raw = null;
    if(user && Object.prototype.hasOwnProperty.call(user, 'allowed_property_ids')) raw = user.allowed_property_ids;
    else if(user && Object.prototype.hasOwnProperty.call(user, 'property_ids')) raw = user.property_ids;
    else if(user && Object.prototype.hasOwnProperty.call(user, 'propertyIds')) raw = user.propertyIds;
    if(!Array.isArray(raw)) return true;
    return raw.map(String).includes(String(propId));
  }
  function managedUsers(){
    const current = getCurrentUser() || {};
    const currentRole = String(current.role || '').toLowerCase();
    return getUsers().filter(user => {
      if(!user || !user.id || String(user.id) === String(current.id || '')) return false;
      const userRole = String(user.role || '').toLowerCase();
      if(userRole === 'cleaner') return false;
      if(currentRole === 'admin') return userRole === 'owner' || userRole === 'admin';
      return userRole === currentRole;
    });
  }
  function renderAccessManagerImpl(){
    const root = qs('ownerAccessShell');
    if(!root) return;
    if(!canPermission('users_manage')){
      root.innerHTML = '<div class="card"><h2>子账号权限</h2><p class="small">当前账号没有子账号权限。</p></div>';
      return;
    }
    const props = propList().filter(p => financeScopePropertyIds().has(String(p.id)));
    const rows = managedUsers();
    const cards = rows.length ? rows.map(user => {
      const roleText = roleLabel(user.role);
      const permissionHtml = OWNER_PERMISSION_DEFS.map(([key,label]) => `<label class="access-check"><input type="checkbox" data-permission="${esc(key)}" ${permissionChecked(user,key) ? 'checked' : ''}> ${esc(label)}</label>`).join('');
      const propHtml = props.map(prop => `<label class="access-check"><input type="checkbox" data-property="${esc(prop.id)}" ${accessPropertyChecked(user,prop.id) ? 'checked' : ''}> ${esc(prop.name || prop.id)}</label>`).join('');
      return `<div class="ops-row access-user-card" data-user-id="${esc(user.id)}"><div class="property-detail-head"><div><div class="ops-title">${esc(user.name || user.username || user.cleaner_code || user.id)}</div><div class="small">${esc(roleText)} · ${esc(user.username || user.cleaner_code || user.id)}</div></div><button class="smallbtn primary" onclick="saveUserAccess('${esc(user.id)}',this)">保存权限</button></div><div class="access-section"><h4>可看房源</h4><div class="access-grid">${propHtml}</div></div><div class="access-section"><h4>功能权限</h4><div class="access-grid">${permissionHtml}</div></div></div>`;
    }).join('') : '<div class="ops-empty">暂无可管理的子账号。房东子账号属于房东账号体系；保洁账号是平级账号，只通过房源里的“保洁绑定”建立工作关系。</div>';
    root.innerHTML = `<div class="card"><div class="property-detail-head"><div><h2>子账号权限</h2><div class="small">这里只管理当前账号体系下的子账号。保洁账号不属于房东子账号；请在“房间/公区设置”的保洁绑定里用保洁编号绑定或解绑。</div></div><span class="badge blue">${rows.length} 个子账号</span></div></div><div class="ops-list">${cards}</div>`;
  }
  async function saveUserAccess(userId,btn){
    if(!canPermission('users_manage')) return alert('当前账号没有子账号权限。');
    const card = Array.from(document.querySelectorAll('.access-user-card')).find(el => String(el.getAttribute('data-user-id')) === String(userId));
    const users = getUsers();
    const user = users.find(x => String(x.id) === String(userId));
    if(!card || !user) return;
    const permissions = {};
    OWNER_PERMISSION_DEFS.forEach(([key]) => {
      const input = card.querySelector(`input[data-permission="${key}"]`);
      permissions[key] = !!(input && input.checked);
    });
    const allowedProps = Array.from(card.querySelectorAll('input[data-property]:checked')).map(input => input.getAttribute('data-property')).filter(Boolean);
    user.permissions = permissions;
    if(String(user.role || '').toLowerCase() !== 'cleaner') user.allowed_property_ids = allowedProps;
    setUsers(users);
    appendAudit('更新子账号权限', user.name || user.username || user.id, selectedOpsPropertyId());
    const old = btn && btn.textContent;
    if(btn){btn.disabled = true; btn.textContent = t('profile.saving');}
    try{
      const res = await fetch(apiUrl('/api/state'), {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({users:getUsers(), auditLog:getAuditLog()})
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false) throw new Error(data.error || ('保存失败 HTTP ' + res.status));
      if(data.state) applyStateFromServerImpl(data.state);
      renderAccessManagerImpl();
    }catch(e){
      alert('保存权限失败：' + (e && e.message ? e.message : e));
    }finally{
      if(btn){btn.disabled = false; btn.textContent = old || '保存权限';}
    }
  }
  function showOpsTab(tab, btn){
    ui.opsTab = tab || 'dashboard';
    if(btn && btn.parentElement) btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    renderOpsCenterImpl();
  }
  function opsTabButton(id,label){
    return `<button class="${ui.opsTab === id ? 'active' : ''}" onclick="showOpsTab('${id}',this)">${esc(label)}</button>`;
  }
  function opsRowsByProperty(rows){
    const ids = new Set(ownerPropIds());
    return (rows || []).filter(row => row && ids.has(row.property_id || targetPropId(row.room_id || row.target_id, row.target_type)));
  }
  function renderOpsCenterImpl(){
    const root = qs('ownerOpsShell');
    if(!root) return;
    const props = scopedProperties();
    const tickets = opsRowsByProperty(getMaintenanceTickets());
    const inventory = opsRowsByProperty(getInventoryItems());
    const expenses = opsRowsByProperty(getExpenseRecords());
    const guests = opsRowsByProperty(getGuestProfiles());
    const openTickets = tickets.filter(x => String(x.status || 'open') !== 'done');
    const lowStock = inventory.filter(x => Number(x.current_qty || 0) <= Number(x.min_qty || 0));
    const month = today().slice(0,7);
    const monthExpenses = expenses.filter(x => financeDirection(x) !== 'income' && String(x.date || '').slice(0,7) === month).reduce((sum,x) => sum + Number(x.amount || 0), 0);
    const channels = getChannels().filter(ch => ownerRoomEntityIds().has(roomEntityId(ch.room_id)));
    const opsTabs = `${opsTabButton('dashboard',t('ops.dashboard'))}${opsTabButton('maintenance',t('ops.maintenance'))}${opsTabButton('inventory',t('ops.inventory'))}${canPermission('finance_view') ? opsTabButton('expenses',t('ops.expenses')) : ''}${opsTabButton('guests',t('ops.guests'))}${opsTabButton('channels',t('ops.channels'))}${opsTabButton('audit',t('ops.audit'))}`;
    const expenseMetric = canPermission('finance_view') ? `<div class="metric"><div class="small">${esc(t('ops.monthExpenses'))}</div><div class="num">${money(monthExpenses)}</div></div>` : '';
    root.innerHTML = `<div class="ops-shell"><div class="card"><div class="property-detail-head"><div><h2>${esc(t('ops.title'))}</h2><div class="small">${esc(t('ops.sub'))}</div></div><div class="ops-tabs">${opsTabs}</div></div></div><div class="ops-grid"><div class="metric"><div class="small">${esc(t('ops.properties'))}</div><div class="num">${props.length}</div></div><div class="metric"><div class="small">${esc(t('ops.openMaintenance'))}</div><div class="num">${openTickets.length}</div></div><div class="metric"><div class="small">${esc(t('ops.lowStock'))}</div><div class="num">${lowStock.length}</div></div>${expenseMetric}<div class="metric"><div class="small">${esc(t('ops.guestProfiles'))}</div><div class="num">${guests.length}</div></div><div class="metric"><div class="small">${esc(t('ops.channelCount'))}</div><div class="num">${channels.length}</div></div></div>${renderOpsTabContent()}</div>`;
  }
  function renderOpsTabContent(){
    if(ui.opsTab === 'maintenance') return renderMaintenanceOps();
    if(ui.opsTab === 'inventory') return renderInventoryOps();
    if(ui.opsTab === 'expenses' && canPermission('finance_view')) return renderExpenseOps();
    if(ui.opsTab === 'guests') return renderGuestOps();
    if(ui.opsTab === 'channels') return renderChannelHealthOps();
    if(ui.opsTab === 'audit') return renderAuditOps();
    return renderOpsDashboard();
  }
  function renderOpsDashboard(){
    const tickets = opsRowsByProperty(getMaintenanceTickets()).filter(x => String(x.status || 'open') !== 'done').slice(0,6);
    const low = opsRowsByProperty(getInventoryItems()).filter(x => Number(x.current_qty || 0) <= Number(x.min_qty || 0)).slice(0,6);
    const errors = getChannels().filter(ch => ownerRoomEntityIds().has(roomEntityId(ch.room_id)) && ch.sync_error).slice(0,6);
    return `<div class="ops-grid"><div class="ops-panel"><h3>${esc(t('ops.openMaintenance'))}</h3>${tickets.length ? `<div class="ops-list">${tickets.map(maintenanceRowHtml).join('')}</div>` : `<div class="ops-empty">${esc(t('ops.noMaintenance'))}</div>`}</div><div class="ops-panel"><h3>${esc(t('ops.lowStock'))}</h3>${low.length ? `<div class="ops-list">${low.map(inventoryRowHtml).join('')}</div>` : `<div class="ops-empty">${esc(t('ops.noLowStock'))}</div>`}</div><div class="ops-panel"><h3>${esc(t('ops.channels'))}</h3>${errors.length ? `<div class="ops-list">${errors.map(channelHealthRowHtml).join('')}</div>` : `<div class="ops-empty">${esc(t('ops.noChannelErrors'))}</div>`}</div></div>`;
  }
  function maintenanceRowHtml(row){
    const status = String(row.status || 'open');
    const cls = status === 'done' ? 'ok' : status === 'in_progress' ? 'warn' : 'error';
    return `<div class="ops-row"><div class="ops-row-head"><div><div class="ops-title">${esc(row.title || t('ops.maintenanceTitle'))}</div><div class="small">${esc(propName(row.property_id))}${row.room_id ? ' / ' + esc(roomName(row.room_id)) : ''}</div></div><span class="sync-status ${cls}">${esc(status === 'done' ? t('common.statusDone') : status === 'in_progress' ? t('common.inProgress') : t('common.pending'))}</span></div><div class="small">${esc(row.note || '')}</div><div class="ops-actions"><button class="smallbtn" onclick="setMaintenanceStatus('${esc(row.id)}','in_progress',this)">${esc(t('common.inProgress'))}</button><button class="smallbtn primary" onclick="setMaintenanceStatus('${esc(row.id)}','done',this)">${esc(t('common.done'))}</button><button class="smallbtn" onclick="deleteMaintenanceTicket('${esc(row.id)}',this)">${esc(t('common.delete'))}</button></div></div>`;
  }
  function renderMaintenanceOps(){
    const propId = selectedOpsPropertyId();
    const rows = opsRowsByProperty(getMaintenanceTickets()).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return `<div class="ops-panel"><h3>维护工单</h3><div class="ops-form"><label>房源<select id="maintProp">${opsPropertyOptions(propId)}</select></label><label>房间<select id="maintRoom">${opsRoomOptions(propId,'',true)}</select></label><label>分类<select id="maintCategory"><option value="repair">维修</option><option value="cleaning">保洁问题</option><option value="supply">耗材</option><option value="safety">安全</option></select></label><label>优先级<select id="maintPriority"><option value="normal">普通</option><option value="urgent">紧急</option><option value="low">低</option></select></label><label>到期日<input id="maintDue" type="date"></label><label>标题<input id="maintTitle" placeholder="例如：门锁电池低电量"></label><label style="grid-column:1/-1">备注<textarea id="maintNote" placeholder="记录位置、现象、处理要求"></textarea></label><button class="smallbtn primary" onclick="addMaintenanceTicket(this)">新增维护</button></div></div><div class="ops-panel"><h3>维护列表</h3>${rows.length ? `<div class="ops-list">${rows.map(maintenanceRowHtml).join('')}</div>` : '<div class="ops-empty">暂无维护工单。</div>'}</div>`;
  }
  function inventoryRowHtml(row){
    const low = Number(row.current_qty || 0) <= Number(row.min_qty || 0);
    return `<div class="ops-row"><div class="ops-row-head"><div><div class="ops-title">${esc(row.name || '耗材')}</div><div class="small">${esc(propName(row.property_id))} / ${esc(row.category || '耗材')}</div></div><span class="sync-status ${low ? 'warn' : 'ok'}">${low ? '低库存' : '正常'}</span></div><div class="ops-meta"><span class="badge blue">库存 ${esc(row.current_qty || 0)} ${esc(row.unit || '')}</span><span class="badge">最低 ${esc(row.min_qty || 0)}</span></div><div class="small">${esc(row.note || '')}</div><div class="ops-actions"><button class="smallbtn" onclick="deleteInventoryItem('${esc(row.id)}',this)">删除</button></div></div>`;
  }
  function renderInventoryOps(){
    const propId = selectedOpsPropertyId();
    const rows = opsRowsByProperty(getInventoryItems()).sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
    return `<div class="ops-panel"><h3>耗材库存</h3><div class="ops-form"><label>房源<select id="invProp">${opsPropertyOptions(propId)}</select></label><label>名称<input id="invName" placeholder="纸巾、垃圾袋、洗衣液"></label><label>分类<select id="invCategory"><option value="cleaning">清洁</option><option value="linen">床品</option><option value="guest_supply">客用品</option><option value="repair">维修</option></select></label><label>当前数量<input id="invQty" type="number" step="1" value="0"></label><label>最低数量<input id="invMin" type="number" step="1" value="0"></label><label>单位<input id="invUnit" value="pcs"></label><label style="grid-column:1/-1">备注<input id="invNote" placeholder="购买链接、规格或摆放位置"></label><button class="smallbtn primary" onclick="addInventoryItem(this)">新增耗材</button></div></div><div class="ops-panel"><h3>耗材列表</h3>${rows.length ? `<div class="ops-list">${rows.map(inventoryRowHtml).join('')}</div>` : '<div class="ops-empty">暂无耗材。</div>'}</div>`;
  }
  function renderExpenseOps(){
    const propId = selectedOpsPropertyId();
    const rows = opsRowsByProperty(getExpenseRecords()).filter(row => financeDirection(row) !== 'income').sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    const total = rows.reduce((sum,x) => sum + Number(x.amount || 0), 0);
    return `<div class="ops-panel"><h3>费用账本</h3><div class="ops-form"><label>日期<input id="expenseDate" type="date" value="${today()}"></label><label>房源<select id="expenseProp">${opsPropertyOptions(propId)}</select></label><label>分类<select id="expenseCategory"><option value="repair">维修</option><option value="supply">耗材</option><option value="cleaning">保洁</option><option value="utility">水电网</option><option value="other">其他</option></select></label><label>金额<input id="expenseAmount" type="number" step="0.01" value="0"></label><label>商家<input id="expenseVendor" placeholder="Costco / Home Depot"></label><label style="grid-column:1/-1">备注<input id="expenseNote" placeholder="发票、用途、关联房间"></label><button class="smallbtn primary" onclick="addExpenseRecord(this)">新增费用</button></div></div><div class="ops-panel"><div class="property-detail-head"><h3>费用记录</h3><span class="badge yellow">合计 ${money(total)}</span></div>${rows.length ? `<table><tr><th>日期</th><th>房源</th><th>分类</th><th>金额</th><th>备注</th><th></th></tr>${rows.map(r => `<tr><td>${esc(r.date || '')}</td><td>${esc(propName(r.property_id))}</td><td>${esc(r.category || '')}</td><td>${money(r.amount)}</td><td>${esc([r.vendor,r.note].filter(Boolean).join(' / '))}</td><td><button class="smallbtn" onclick="deleteExpenseRecord('${esc(r.id)}',this)">删除</button></td></tr>`).join('')}</table>` : '<div class="ops-empty">暂无费用。</div>'}</div>`;
  }
  function renderGuestOps(){
    const propId = selectedOpsPropertyId();
    const rows = opsRowsByProperty(getGuestProfiles()).sort((a,b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    return `<div class="ops-panel"><h3>客人档案</h3><div class="ops-form"><label>房源<select id="guestProp">${opsPropertyOptions(propId)}</select></label><label>姓名<input id="guestName" placeholder="客人姓名"></label><label>电话<input id="guestPhone" placeholder="可选"></label><label>邮箱<input id="guestEmail" placeholder="可选"></label><label>来源<select id="guestSource"><option>Airbnb</option><option>Booking</option><option>Vrbo</option><option>微信直订</option><option>Other</option></select></label><label>标签<input id="guestTags" placeholder="回头客、投诉、黑名单等"></label><label style="grid-column:1/-1">备注<textarea id="guestNote" placeholder="偏好、沟通记录、风险提示"></textarea></label><button class="smallbtn primary" onclick="addGuestProfile(this)">新增客人</button></div></div><div class="ops-panel"><h3>客人列表</h3>${rows.length ? `<div class="ops-list">${rows.map(r => `<div class="ops-row"><div class="ops-row-head"><div><div class="ops-title">${esc(r.name || '客人')}</div><div class="small">${esc(propName(r.property_id))} / ${esc(r.source || '')}</div></div><button class="smallbtn" onclick="deleteGuestProfile('${esc(r.id)}',this)">删除</button></div><div class="ops-meta">${r.phone ? `<span class="badge blue">${esc(r.phone)}</span>` : ''}${r.email ? `<span class="badge green">${esc(r.email)}</span>` : ''}${r.tags ? `<span class="badge yellow">${esc(r.tags)}</span>` : ''}</div><div class="small">${esc(r.note || '')}</div></div>`).join('')}</div>` : '<div class="ops-empty">暂无客人档案。</div>'}</div>`;
  }
  function channelHealthRowHtml(ch){
    const issue = ch.sync_error;
    const cls = issue ? 'error' : ch.last_sync ? 'ok' : 'warn';
    const text = issue ? '同步失败' : ch.last_sync ? '已同步' : '未同步';
    return `<div class="ops-row"><div class="ops-row-head"><div><div class="ops-title">${esc(roomName(ch.room_id))} / ${esc(ch.platform || 'Airbnb')}</div><div class="small">${esc(propName(roomPropId(ch.room_id)))}</div></div><span class="sync-status ${cls}">${text}</span></div><div class="small">${issue ? esc(issue) : `上次同步：${esc(ch.last_sync || '无')} / ${Number(ch.synced_booking_count || 0)} 条`}</div></div>`;
  }
  function renderChannelHealthOps(){
    const rows = getChannels().filter(ch => ownerRoomEntityIds().has(roomEntityId(ch.room_id)));
    const errors = getSyncErrors().filter(x => !x.property_id || ownerPropIds().includes(x.property_id));
    return `<div class="ops-panel"><h3>渠道 / iCal 健康</h3>${rows.length ? `<div class="ops-health">${rows.map(channelHealthRowHtml).join('')}</div>` : '<div class="ops-empty">当前房间还没有渠道 iCal。</div>'}${errors.length ? `<div class="note-card important"><strong>最近同步错误</strong><div class="small">${errors.slice(-8).map(e => esc(e.message || e.error || JSON.stringify(e))).join('<br>')}</div></div>` : ''}</div>`;
  }
  function renderAuditOps(){
    const ids = ownerPropIds();
    const rows = getAuditLog().filter(x => !x.property_id || ids.includes(x.property_id)).slice(-120).reverse();
    return `<div class="ops-panel"><h3>操作日志</h3>${rows.length ? `<table><tr><th>时间</th><th>人员</th><th>房源</th><th>动作</th><th>内容</th></tr>${rows.map(r => `<tr><td>${esc((r.created_at || '').slice(0,19))}</td><td>${esc(r.actor_name || '')}</td><td>${esc(propName(r.property_id))}</td><td>${esc(r.action || '')}</td><td>${esc(r.detail || '')}</td></tr>`).join('')}</table>` : '<div class="ops-empty">暂无日志。</div>'}</div>`;
  }
  async function addMaintenanceTicket(btn){
    const propId = (qs('maintProp') && qs('maintProp').value) || selectedOpsPropertyId();
    const title = String(qs('maintTitle') && qs('maintTitle').value || '').trim();
    if(!propId) return alert('请先选择房源。');
    if(!title) return alert('请填写维护标题。');
    getMaintenanceTickets().unshift({id:'maint_'+Date.now(),property_id:propId,room_id:(qs('maintRoom')&&qs('maintRoom').value)||'',category:(qs('maintCategory')&&qs('maintCategory').value)||'repair',priority:(qs('maintPriority')&&qs('maintPriority').value)||'normal',due_date:(qs('maintDue')&&qs('maintDue').value)||'',title,note:(qs('maintNote')&&qs('maintNote').value)||'',status:'open',created_by:userName('房东'),created_at:nowIso()});
    appendAudit('新增维护', title, propId);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function setMaintenanceStatus(id,status,btn){
    const row = getMaintenanceTickets().find(x => String(x.id) === String(id));
    if(!row) return;
    row.status = status; row.updated_at = nowIso(); if(status === 'done') row.completed_at = nowIso();
    appendAudit('维护状态', `${row.title || id} -> ${status}`, row.property_id);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function deleteMaintenanceTicket(id,btn){
    if(!confirm('删除这条维护工单？')) return;
    const row = getMaintenanceTickets().find(x => String(x.id) === String(id));
    setMaintenanceTickets(getMaintenanceTickets().filter(x => String(x.id) !== String(id)));
    appendAudit('删除维护', row ? row.title : id, row && row.property_id);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function addInventoryItem(btn){
    const propId = (qs('invProp') && qs('invProp').value) || selectedOpsPropertyId();
    const name = String(qs('invName') && qs('invName').value || '').trim();
    if(!propId) return alert('请先选择房源。');
    if(!name) return alert('请填写耗材名称。');
    getInventoryItems().push({id:'inv_'+Date.now(),property_id:propId,name,category:(qs('invCategory')&&qs('invCategory').value)||'cleaning',current_qty:Number((qs('invQty')&&qs('invQty').value)||0),min_qty:Number((qs('invMin')&&qs('invMin').value)||0),unit:(qs('invUnit')&&qs('invUnit').value)||'pcs',note:(qs('invNote')&&qs('invNote').value)||'',updated_at:nowIso(),created_at:nowIso()});
    appendAudit('新增耗材', name, propId);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function deleteInventoryItem(id,btn){
    if(!confirm('删除这个耗材？')) return;
    const row = getInventoryItems().find(x => String(x.id) === String(id));
    setInventoryItems(getInventoryItems().filter(x => String(x.id) !== String(id)));
    appendAudit('删除耗材', row ? row.name : id, row && row.property_id);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function addExpenseRecord(btn){
    if(!canPermission('finance_edit')) return alert('当前账号没有财务编辑权限。');
    const propId = (qs('expenseProp') && qs('expenseProp').value) || selectedOpsPropertyId();
    const amount = Number((qs('expenseAmount') && qs('expenseAmount').value) || 0);
    if(!propId) return alert('请先选择房源。');
    getExpenseRecords().unshift({id:'expense_'+Date.now(),property_id:propId,date:(qs('expenseDate')&&qs('expenseDate').value)||today(),direction:'expense',category:(qs('expenseCategory')&&qs('expenseCategory').value)||'other',amount,vendor:(qs('expenseVendor')&&qs('expenseVendor').value)||'',note:(qs('expenseNote')&&qs('expenseNote').value)||'',created_by:userName('房东'),created_at:nowIso()});
    appendAudit('新增费用', money(amount), propId);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function deleteExpenseRecord(id,btn){
    if(!canPermission('finance_edit')) return alert('当前账号没有财务编辑权限。');
    if(!confirm('删除这条费用？')) return;
    const row = getExpenseRecords().find(x => String(x.id) === String(id));
    setExpenseRecords(getExpenseRecords().filter(x => String(x.id) !== String(id)));
    appendAudit('删除费用', row ? money(row.amount) : id, row && row.property_id);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function addGuestProfile(btn){
    const propId = (qs('guestProp') && qs('guestProp').value) || selectedOpsPropertyId();
    const name = String(qs('guestName') && qs('guestName').value || '').trim();
    if(!propId) return alert('请先选择房源。');
    if(!name) return alert('请填写客人姓名。');
    getGuestProfiles().unshift({id:'guest_'+Date.now(),group_id:groupId(),property_id:propId,name,phone:(qs('guestPhone')&&qs('guestPhone').value)||'',email:(qs('guestEmail')&&qs('guestEmail').value)||'',source:(qs('guestSource')&&qs('guestSource').value)||'',tags:(qs('guestTags')&&qs('guestTags').value)||'',note:(qs('guestNote')&&qs('guestNote').value)||'',created_by:userName('房东'),created_at:nowIso(),updated_at:nowIso()});
    appendAudit('新增客人', name, propId);
    await persistAll(btn); renderOpsCenterImpl();
  }
  async function deleteGuestProfile(id,btn){
    if(!confirm('删除这个客人档案？')) return;
    const row = getGuestProfiles().find(x => String(x.id) === String(id));
    setGuestProfiles(getGuestProfiles().filter(x => String(x.id) !== String(id)));
    appendAudit('删除客人', row ? row.name : id, row && row.property_id);
    await persistAll(btn); renderOpsCenterImpl();
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
    refreshAll: refreshPropertyHub,
    renderCleaner: renderCleanerImpl,
    renderOwner: renderOwnerImpl,
    renderOwnerTab: renderOwnerTabImpl,
    renderFinanceManager: renderFinanceManagerImpl,
    addFinanceRecord,
    deleteFinanceRecord,
    renderAccessManager: renderAccessManagerImpl,
    saveUserAccess,
    showCleaningSubTab: showCleaningSubTabImpl,
    setCleaningWorkDate: setCleaningWorkDateImpl,
    setWorkDate: setWorkDateImpl,
    setWorkDateToday: setWorkDateTodayImpl,
    shiftWorkDate: shiftWorkDateImpl,
    renderOwnerMetrics: renderOwnerMetricsImpl,
    renderDailyWork: renderDailyWorkImpl,
    renderOwnerCalendar: renderOwnerCalendarImpl,
    renderSixMonthStats: renderSixMonthStatsImpl,
    renderOwnerBookings: renderOwnerBookingsImpl,
    renderRoomSettings: renderRoomSettingsImpl,
    renderManualRecords: renderManualRecordsImpl,
    renderManualRecordsHTML: renderManualRecordsHTMLImpl,
    renderCleaningFinance: renderCleaningFinanceImpl,
    setCleaningFinanceRange: setCleaningFinanceRangeImpl,
    renderOwnerNotes: renderOwnerNotesImpl,
    openPropertyMailInRooms,
    openPropertyMailTab,
    renderUserProfile: renderUserProfileImpl,
    saveUserProfile,
    renderOpsCenter: renderOpsCenterImpl,
    showOpsTab,
    addMaintenanceTicket,
    setMaintenanceStatus,
    deleteMaintenanceTicket,
    addInventoryItem,
    deleteInventoryItem,
    addExpenseRecord,
    deleteExpenseRecord,
    addGuestProfile,
    deleteGuestProfile,
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
    saveOwnerRoomDefault,
    refreshPropertyHub,
    setRoomSettingsPanel,
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
    applyRecurringPreset: applyRecurringPresetImpl,
    addRecurringTask: addRecurringTaskImpl,
    editRecurringTask: editRecurringTaskImpl,
    cancelRecurringTaskEdit: cancelRecurringTaskEditImpl,
    setRecurringPropertyFilter: setRecurringPropertyFilterImpl,
    setRecurringRoomFilter: setRecurringRoomFilterImpl,
    toggleRecurringTask: toggleRecurringTaskImpl,
    deleteRecurringTask: deleteRecurringTaskImpl,
    addManualChange: addManualChangeImpl,
    addCleaningNote: addCleaningNoteImpl,
    addRoomDateNote: addRoomDateNoteImpl,
    savePropertyMail,
    syncMailEventsFromGmail,
    checkMailDiagnostics,
    resolveCancellationReview,
    markCleaningSubtaskDone,
    deferCleaningSubtask,
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
    ['showCleaningSubTab', showCleaningSubTabImpl],
    ['setCleaningWorkDate', setCleaningWorkDateImpl],
    ['setWorkDate', setWorkDateImpl],
    ['setWorkDateToday', setWorkDateTodayImpl],
    ['shiftWorkDate', shiftWorkDateImpl],
    ['applyRoleMode', applyRoleModeImpl],
    ['initApp', initAppImpl],
    ['refreshAll', refreshPropertyHub],
    ['renderCleaner', renderCleanerImpl],
    ['renderOwner', renderOwnerImpl],
    ['renderDailyWork', renderDailyWorkImpl],
    ['renderOwnerCalendar', renderOwnerCalendarImpl],
    ['renderSixMonthStats', renderSixMonthStatsImpl],
    ['renderOwnerBookings', renderOwnerBookingsImpl],
    ['renderRoomSettings', renderRoomSettingsImpl],
    ['setCleaningFinanceRange', setCleaningFinanceRangeImpl],
    ['renderOpsCenter', renderOpsCenterImpl],
    ['showOpsTab', showOpsTab],
    ['addMaintenanceTicket', addMaintenanceTicket],
    ['setMaintenanceStatus', setMaintenanceStatus],
    ['deleteMaintenanceTicket', deleteMaintenanceTicket],
    ['addInventoryItem', addInventoryItem],
    ['deleteInventoryItem', deleteInventoryItem],
    ['addExpenseRecord', addExpenseRecord],
    ['deleteExpenseRecord', deleteExpenseRecord],
    ['addGuestProfile', addGuestProfile],
    ['deleteGuestProfile', deleteGuestProfile],
    ['openPropertyMailInRooms', openPropertyMailInRooms],
    ['openPropertyMailTab', openPropertyMailTab],
    ['toggleCalendarVacancyOnly', toggleCalendarVacancyOnly],
    ['setOwnerPropertyFilter', setOwnerPropertyFilterImpl],
    ['setOwnerPropertyAll', setOwnerPropertyAllImpl],
    ['setOnlyOwnerProperty', setOnlyOwnerPropertyImpl],
    ['setOwnerRoomFilter', setOwnerRoomFilterImpl],
    ['setOwnerRoomAll', setOwnerRoomAllImpl],
    ['setOnlyOwnerRoom', setOnlyOwnerRoomImpl],
    ['saveOwnerRoomDefault', saveOwnerRoomDefault],
    ['setRoomSettingsPanel', setRoomSettingsPanel],
    ['applyRecurringPreset', applyRecurringPresetImpl],
    ['addRecurringTask', addRecurringTaskImpl],
    ['editRecurringTask', editRecurringTaskImpl],
    ['cancelRecurringTaskEdit', cancelRecurringTaskEditImpl],
    ['setRecurringPropertyFilter', setRecurringPropertyFilterImpl],
    ['setRecurringRoomFilter', setRecurringRoomFilterImpl],
    ['toggleRecurringTask', toggleRecurringTaskImpl],
    ['deleteRecurringTask', deleteRecurringTaskImpl],
    ['addRoom', addRoomImpl],
    ['addCommonArea', addCommonAreaImpl],
    ['syncIcal', syncPropertyIcalImpl],
    ['checkMailDiagnostics', checkMailDiagnostics],
    ['markCleaningSubtaskDone', markCleaningSubtaskDone],
    ['deferCleaningSubtask', deferCleaningSubtask],
    ['realBookings', realBookingsImpl],
    ['lockBookings', lockBookingsImpl],
    ['systemCleaningRows', systemCleaningRowsImpl],
    ['commonAreaRows', commonAreaRowsImpl],
    ['actualCleaningRows', actualCleaningRowsImpl]
  ].forEach(function(pair){
    try{ window[pair[0]] = pair[1]; }catch(e){}
  });
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', startUnifiedApp, {once:true});
  }else{
    setTimeout(startUnifiedApp, 0);
  }
})();
