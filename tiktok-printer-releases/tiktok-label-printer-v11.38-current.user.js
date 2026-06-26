// ==UserScript==
// @name         WINDOWS电脑 TikTok标签 v11.38 清理稳定版
// @name:zh-CN   WINDOWS电脑 TikTok标签 v11.38 清理稳定版
// @namespace    local-tiktok-label-printer-windows
// @version      11.38
// @description  v11.38：当前页批量打印队列按 Title 排序，弹窗列表仍按订单时间显示
// @description:zh-CN v11.38：当前页批量打印队列按 Title 排序，弹窗列表仍按订单时间显示
// @match        https://*/*
// @connect      firestore.googleapis.com
// @connect      raw.githubusercontent.com
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function(){
'use strict';

const TK_ALLOWED_HOST_RE=/(^|\.)seller-us\.tiktok\.com$|(^|\.)seller\.tiktokglobalshop\.com$|(^|\.)tiktokglobalshop\.com$/i;
if(!TK_ALLOWED_HOST_RE.test(location.hostname))return;

const PREFIX="windows_";
const HISTORY_KEY=PREFIX+"tk_history_master";
const SEEN_KEY=PREFIX+"tk_seen_master";
const NOTE_KEY=PREFIX+"tk_note_master";
const LOCK_KEY=PREFIX+"tk_lock_master";
const REFRESH_BIND_KEY=PREFIX+"tk_refresh_bind_master";
const NEXT_BIND_KEY=PREFIX+"tk_next_page_bind_master";
const REVIEW_IGNORE_KEY=PREFIX+"tk_review_ignore_master";
const CANCEL_NOTE_ALERT_KEY=PREFIX+"tk_cancel_note_alert_v88";
const CANCEL_NOTE_ALERT_IGNORE_KEY=PREFIX+"tk_cancel_note_alert_ignore_v110";
const MIGRATION_KEY=PREFIX+"tk_migrated_to_master_v88";
const REVIEW_SNAPSHOT_KEY=PREFIX+"tk_review_snapshot_v88";
const REVIEW_SCAN_HISTORY_KEY=PREFIX+"tk_review_scan_history_v88";
const REVIEW_DIFF_HISTORY_KEY=PREFIX+"tk_review_diff_history_v88";
const REVIEW_RESULT_HISTORY_KEY=PREFIX+"tk_review_result_history_v119";
const CLOUD_PENDING_WRITES_KEY=PREFIX+"tk_cloud_pending_writes_v1129";
const UI_LANGUAGE_KEY=PREFIX+"tk_ui_language_v1131";
const LISTEN_PAUSE_REASON_KEY=PREFIX+"tk_listen_pause_reason_v1131";
const GIVEAWAY_NOTE="FOR FREE";

const SCRIPT_VERSION="11.38";
const TK_IS_LOCAL_CHROME_EXTENSION=typeof chrome!=="undefined"&&!!(chrome.runtime&&chrome.runtime.id);
const QR_CODE_SCRIPT_URL="https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js";
const QR_FALLBACK_API="https://api.qrserver.com/v1/create-qr-code/?size=180x180&format=png&data=";
const FIREBASE_APP_SCRIPT_URL="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js";
const FIREBASE_FIRESTORE_SCRIPT_URL="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js";
const OPERATOR_NAME_KEY=PREFIX+"tk_operator_name";
const CLIENT_ID_KEY=PREFIX+"tk_client_id";
const CLOUD_ENABLED_KEY=PREFIX+"tk_cloud_enabled";
const MAIN_PANEL_COLLAPSED_KEY=PREFIX+"tk_main_panel_collapsed_v116";
const MAIN_PANEL_POS_KEY=PREFIX+"tk_main_panel_position_v117";
const DIRECT_PRINT_LAUNCH_KEY=PREFIX+"tk_direct_print_launch_session_v116";
const DIRECT_PRINT_PERSIST_KEY=PREFIX+"tk_direct_print_launch_persist_v117";
const DIRECT_PRINT_MARKER_FILE_URL="file:///C:/Users/caipi/AppData/Local/Temp/tk-direct-print-launch.txt";
const DIRECT_PRINT_MARKER_TTL_MS=12*60*60*1000;
const LOCAL_TIME_ZONE="America/Los_Angeles";
const FIREBASE_CONFIG={
    apiKey:"AIzaSyAEGcotiJO69GpKXkg9-qjTOHy8Se4WRik",
    authDomain:"tk-printer.firebaseapp.com",
    projectId:"tk-printer",
    storageBucket:"tk-printer.firebasestorage.app",
    messagingSenderId:"1074015997772",
    appId:"1:1074015997772:web:38bf97bf55e37567aa09e9"
};
const RELEASE_COLLECTION="tiktok_orders";
const RELEASE_DOC_PREFIX="__script_release_";
const RELEASE_DOC_LATEST=RELEASE_DOC_PREFIX+"latest";
const RELEASE_GITHUB_RAW_BASE="https://raw.githubusercontent.com/caiping5393559-hash/pms-system/main/tiktok-printer-releases/";
const RELEASE_GITHUB_MANIFEST_URL=RELEASE_GITHUB_RAW_BASE+"manifest.json";
const RELEASE_HISTORY_FALLBACK=[
    {version:"11.38",date:"2026-06-25",notesZh:"当前页批量打印时，实际打印队列按 Title 排序；弹窗列表默认仍按订单时间显示。",notesEn:"For current-page batch printing, the actual print queue now sorts by Title while the popup list still defaults to order time."},
    {version:"11.37",date:"2026-06-24",notesZh:"Local Chrome extension install fix: static injection, file-marker guard, and QRCode CSP guard.",notesEn:"Local Chrome extension install fix: static injection, file-marker guard, and QRCode CSP guard."},
    {version:"11.36",date:"2026-06-23",notesZh:"英文模式扩展到二级窗口、弹出菜单和复核/历史/打印窗口。",notesEn:"Expanded English mode to secondary windows, pop-up menus, review, history, and current-page print dialogs."},
    {version:"11.35",date:"2026-06-23",notesZh:"修复 tk-printer 复核流水集合无权限时导致整批云同步失败；现在会先保存主订单最新复核状态。",notesEn:"Fixed review cloud sync failing completely when the tk-printer review-log collection lacks permission; latest order review state is now saved first."},
    {version:"11.34",date:"2026-06-23",notesZh:"修复标题栏中英文下拉被窗口拖动逻辑拦截，语言切换点击后立即生效。",notesEn:"Fixed the Chinese/English selector being intercepted by panel dragging; language changes now apply immediately."},
    {version:"11.33",date:"2026-06-22",notesZh:"版本下载中心改用 GitHub Raw 作为最新版来源，避开 Firebase 写入权限限制。",notesEn:"Release center now uses GitHub Raw as the latest-version source, avoiding Firebase write-permission limits."},
    {version:"11.32",date:"2026-06-22",notesZh:"版本库改用订单云端兼容存储，便于旧电脑下载最新版。",notesEn:"Moved release storage to the compatible cloud order collection so older computers can download the latest version."},
    {version:"11.31",date:"2026-06-19",notesZh:"新增中英文主菜单、版本下载中心、监听暂停原因提示。",notesEn:"Added Chinese/English main menu, release download center, and visible listening pause reasons."},
    {version:"11.30",date:"2026-06-16",notesZh:"二维码改为本地生成，避免打印标签二维码空白。",notesEn:"Generated QR codes locally to prevent blank QR codes on printed labels."},
    {version:"11.29",date:"2026-06-16",notesZh:"新增云端打印流水失败本机暂存与自动补写。",notesEn:"Added local pending queue and automatic retry for failed cloud print-log writes."},
    {version:"11.28",date:"2026-06-16",notesZh:"查看历史改用打印流水校正多人协作同单打印次数。",notesEn:"History now uses per-print logs to correct multi-operator print counts."},
    {version:"11.27",date:"2026-06-16",notesZh:"优化复核窗口布局和商品维度分析入口。",notesEn:"Improved review window layout and product analysis entry."},
    {version:"11.24",date:"2026-06-16",notesZh:"优化复核结果展示，减少嵌套滚动。",notesEn:"Improved review result layout and reduced nested scrolling."},
    {version:"11.19",date:"2026-06-15",notesZh:"修复订单标题、Note、状态字段识别规则。",notesEn:"Fixed parsing rules for title, seller note, and order status."},
    {version:"11.17",date:"2026-06-15",notesZh:"增加直接打印入口检查和专用启动快捷方式。",notesEn:"Added direct-print launch verification and launcher shortcut."},
    {version:"11.6",date:"2026-06-13",notesZh:"稳定版基础：监听、当前页打印、云端历史、复核扫描。",notesEn:"Stable baseline: listener, current-page printing, cloud history, and review scan."}
];
let tkCloudDb=null;
let tkCloudReady=false;
let tkCloudStatus="云同步：初始化中";
let tkCloudOrderCount=0;
let tkCloudPrintLogCount=0;
let tkCloudLastAt="";
let tkCloudInitStarted=false;
let tkCloudInitRetryTimer=null;
let tkCloudCountLoading=false;
let tkCloudPendingFlushRunning=false;
let tkCloudPendingFlushTimer=null;
let tkLocalQrGfExp=null;
let tkLocalQrGfLog=null;
let tkBootInitialized=false;
let tkUtilityWarmupStarted=false;
let tkFirebaseSdkLoadStarted=false;
const externalScriptLoadMap={};
let directPrintMarkerChecking=false;
let directPrintMarkerCheckDone=false;
let directPrintLaunchReason="";
let tiktokVerificationGuardActive=false;
let tiktokVerificationLastNoticeAt=0;

const UI_TEXT={
    zh:{
        appTitle:"WINDOWS电脑 TikTok标签",
        collapsedTitle:"TK标签",
        start:"启动",
        pause:"暂停",
        collapse:"收起",
        expand:"展开",
        listening:"监听",
        listeningOn:"已开启",
        listeningOff:"未开启",
        currentOperator:"当前操作人",
        operatorUnset:"未设置",
        confirmEntry:"确认入口",
        downloadStart:"下载启动",
        refreshShort:"刷新",
        cloudReconnect:"云重连",
        rebindRefresh:"重绑刷新",
        switchUser:"切换用户",
        language:"语言",
        chinese:"中文",
        english:"English",
        startListening:"启动监听",
        pauseListening:"暂停监听",
        bindRefresh:"绑定/重新绑定刷新按钮",
        bindRefreshBound:"重新绑定刷新按钮",
        bindRefreshUnbound:"绑定刷新按钮",
        downloadLauncher:"下载专用启动快捷方式",
        versionCenter:"版本/下载",
        printCurrent:"打印当前页",
        history:"查看历史",
        review:"复核网页与云端",
        scriptRunning:"脚本已运行",
        directConfirmed:"直接打印入口已确认",
        directChecking:"直接打印入口确认中",
        directUnconfirmed:"直接打印入口未确认",
        launchScript:"启动脚本",
        localMarker:"本机标记",
        urlEntry:"URL入口",
        manualConfirm:"人工确认",
        confirmed:"已确认",
        queue:"队列",
        cloudPending:"云待同步",
        refreshBound:"刷新已绑定",
        refreshAutoFinding:"刷新自动查找中",
        nextRefresh:"下次刷新",
        refreshUnbound:"刷新未绑定",
        pauseReason:"暂停原因",
        noPauseReason:"无",
        stoppedByUser:"用户手动暂停",
        stoppedForReview:"复核/手动操作要求暂停",
        stoppedByVerification:"TikTok验证中",
        versionCenterTitle:"版本/下载中心",
        currentVersion:"当前版本",
        latestVersion:"最新版",
        downloadLatest:"下载最新版",
        downloadThisVersion:"下载这个版本",
        downloadLocalCurrent:"下载本机当前代码",
        releaseHistory:"历史版本",
        releaseNotes:"更新内容",
        close:"关闭",
        reload:"重新读取",
        cloudReleaseUnavailable:"云端版本库暂不可用，已显示本机内置版本记录。",
        downloadNeedCloud:"需要云端版本库有源码后才能下载。当前仅显示更新记录。",
        downloadDone:"已下载版本文件",
        releaseCenterOpened:"已打开版本/下载中心。"
    },
    en:{
        appTitle:"WINDOWS PC TikTok Labels",
        collapsedTitle:"TK Labels",
        start:"Start",
        pause:"Pause",
        collapse:"Collapse",
        expand:"Expand",
        listening:"Listener",
        listeningOn:"ON",
        listeningOff:"OFF",
        currentOperator:"Operator",
        operatorUnset:"Not set",
        confirmEntry:"Confirm Entry",
        downloadStart:"Download Start",
        refreshShort:"Refresh",
        cloudReconnect:"Cloud Reconnect",
        rebindRefresh:"Rebind Refresh",
        switchUser:"Switch User",
        language:"Language",
        chinese:"中文",
        english:"English",
        startListening:"Start Listener",
        pauseListening:"Pause Listener",
        bindRefresh:"Bind/Rebind Refresh Button",
        bindRefreshBound:"Rebind Refresh Button",
        bindRefreshUnbound:"Bind Refresh Button",
        downloadLauncher:"Download Direct-Print Launcher",
        versionCenter:"Versions/Download",
        printCurrent:"Print Current Page",
        history:"View History",
        review:"Review Page vs Cloud",
        scriptRunning:"Script running",
        directConfirmed:"Direct-print entry confirmed",
        directChecking:"Checking direct-print entry",
        directUnconfirmed:"Direct-print entry not confirmed",
        launchScript:"launcher script",
        localMarker:"local marker",
        urlEntry:"URL entry",
        manualConfirm:"manual confirm",
        confirmed:"confirmed",
        queue:"Queue",
        cloudPending:"Cloud pending",
        refreshBound:"Refresh bound",
        refreshAutoFinding:"Finding refresh",
        nextRefresh:"next refresh",
        refreshUnbound:"Refresh not bound",
        pauseReason:"Pause reason",
        noPauseReason:"None",
        stoppedByUser:"Paused by user",
        stoppedForReview:"Paused for review/manual action",
        stoppedByVerification:"TikTok verification",
        versionCenterTitle:"Versions / Download Center",
        currentVersion:"Current version",
        latestVersion:"Latest version",
        downloadLatest:"Download Latest",
        downloadThisVersion:"Download This Version",
        downloadLocalCurrent:"Download Local Current Code",
        releaseHistory:"Release History",
        releaseNotes:"Release notes",
        close:"Close",
        reload:"Reload",
        cloudReleaseUnavailable:"Cloud release library is unavailable. Showing built-in release history.",
        downloadNeedCloud:"Source code must exist in the cloud release library before download. Showing release notes only.",
        downloadDone:"Downloaded version file",
        releaseCenterOpened:"Opened versions/download center."
    }
};

function getUiLanguage(){
    const v=localStorage.getItem(UI_LANGUAGE_KEY);
    return v==="en"?"en":"zh";
}

function setUiLanguage(lang){
    localStorage.setItem(UI_LANGUAGE_KEY,lang==="en"?"en":"zh");
    normalizeMainPanelUiText();
    updateStablePanelSoon();
    localizePluginWindowsSoon();
}

function tr(key){
    const lang=getUiLanguage();
    const pack=UI_TEXT[lang]||UI_TEXT.zh;
    return pack[key]||UI_TEXT.zh[key]||key;
}

const UI_DYNAMIC_TRANSLATIONS=[
    ["TikTok订单复核汇总","TikTok Order Review Summary"],
    ["WINDOWS电脑 - 当前页面订单打印","WINDOWS PC - Current Page Print"],
    ["当前页面订单打印","Current Page Print"],
    ["订单复核汇总","Order Review Summary"],
    ["商品订单明细","Product Order Details"],
    ["商品维度分析","Product Analysis"],
    ["版本/下载中心","Versions / Download Center"],
    ["复核网页与云端","Review Page vs Cloud"],
    ["查看历史","View History"],
    ["订单复核","Order Review"],
    ["复核汇总","Review Summary"],
    ["复核历史","Review History"],
    ["打印当前页","Print Current Page"],
    ["重新读取","Reload"],
    ["重新扫描","Rescan"],
    ["精确刷新后重新扫描","Refresh and Rescan"],
    ["复制汇总文本","Copy Summary Text"],
    ["显示纯文本","Show Plain Text"],
    ["隐藏纯文本","Hide Plain Text"],
    ["复制到剪贴板","Copy to Clipboard"],
    ["复制汇总","Copy Summary"],
    ["复制订单号","Copy Order ID"],
    ["下载专用启动快捷方式","Download Direct-Print Shortcut"],
    ["重新绑定刷新按钮","Rebind Refresh Button"],
    ["绑定刷新按钮","Bind Refresh Button"],
    ["启动监听","Start Listener"],
    ["暂停监听","Pause Listener"],
    ["云重连","Cloud Reconnect"],
    ["重绑刷新","Rebind Refresh"],
    ["切换用户","Switch User"],
    ["最大化","Maximize"],
    ["还原","Restore"],
    ["关闭","Close"],
    ["收起","Collapse"],
    ["展开","Expand"],
    ["启动","Start"],
    ["暂停","Pause"],
    ["打印记录","Print Logs"],
    ["收起打印","Collapse Prints"],
    ["收起变化","Collapse Changes"],
    ["变化","Changes"],
    ["补打","Reprint"],
    ["复制","Copy"],
    ["忽略选中","Ignore Selected"],
    ["批量更新选中状态","Update Selected Status"],
    ["批量更新选中Note","Update Selected Note"],
    ["批量按当前Note打印","Print Selected with Current Note"],
    ["全选当前筛选后的可打印订单","Select all printable filtered orders"],
    ["全选当前复核结果","Select all current review results"],
    ["当前筛选汇总","Current Filter Summary"],
    ["原始扫描","Original Scan"],
    ["物流状态统计","Shipping Status Stats"],
    ["按日期统计摘要","Daily Summary"],
    ["差异类型","Difference Type"],
    ["订单时间","Order Time"],
    ["当前状态","Current Status"],
    ["历史状态","Previous Status"],
    ["当前Note","Current Note"],
    ["历史Note","Previous Note"],
    ["快递单号","Tracking Number"],
    ["完整订单号","Full Order ID"],
    ["订单号","Order ID"],
    ["订单类型","Order Type"],
    ["操作人","Operator"],
    ["最近打印","Last Print"],
    ["最近复核","Last Review"],
    ["打印次数合计","Total Print Count"],
    ["历史打印次数","Historical Print Count"],
    ["打印次数","Print Count"],
    ["复核订单","Reviewed Orders"],
    ["范围内订单","Orders in Range"],
    ["扫描金额","Scanned GMV"],
    ["总GMV","Total GMV"],
    ["总单","Total Orders"],
    ["日期","Date"],
    ["状态","Status"],
    ["类型","Type"],
    ["时间","Time"],
    ["橱窗订单","Showcase Orders"],
    ["非Canceled 橱窗订单","Non-Canceled Showcase Orders"],
    ["非Canceled LIVE","Non-Canceled LIVE"],
    ["非Canceled GMV","Non-Canceled GMV"],
    ["Canceled GMV","Canceled GMV"],
    ["有 Note 未打印","Has Note Not Printed"],
    ["有 Note","Has Note"],
    ["不能打印","Cannot Print"],
    ["可打印","Printable"],
    ["已打印后变Canceled","Canceled After Printed"],
    ["LIVE但没有Note","LIVE Missing Note"],
    ["疑似漏打","Possible Missed Print"],
    ["NOTE变化","Note Changed"],
    ["状态/Note/单号变化","Status/Note/Tracking Changed"],
    ["状态/Note/单号","Status/Note/Tracking"],
    ["没有找到这次复核历史。","Review history not found."],
    ["复核历史：暂无可复现历史。完成一次复核后会自动保存。","Review History: no replayable history yet. It will be saved after a review finishes."],
    ["当前已载入所选复核历史。","Selected review history is loaded."],
    ["当前没有可分析的复核订单。请先完成复核，或点击一个可复现的复核历史。","No review orders available for analysis. Finish a review or replay a saved review history first."],
    ["当前没有可分析的复核订单。请先完成复核，或点击复核历史复现结果。","No review orders available for analysis. Finish a review or replay review history first."],
    ["暂无分页扫描统计。复核开始后这里会显示卡片+表格汇总。","No page-scan stats yet. Cards and tables will appear after review starts."],
    ["暂无复核差异。开始复核后会显示：已打印后Canceled、NOTE变化、疑似漏打、状态/Note/单号变化。","No review differences yet. After review starts, this shows canceled-after-print, note changes, possible missed prints, and status/note/tracking changes."],
    ["暂无该订单复核流水。后续复核扫描后会显示每次订单状态、Note、快递单号记录。","No review log for this order yet. Future review scans will show each status, note, and tracking record."],
    ["正在读取 Firebase 云端历史...","Reading Firebase cloud history..."],
    ["正在扫描当前页面订单，请稍等...","Scanning current page orders, please wait..."],
    ["正在扫描当前页面订单...","Scanning current page orders..."],
    ["正在读取每次打印记录...","Reading print logs..."],
    ["正在读取该订单复核变化流水...","Reading review change logs for this order..."],
    ["读取云端历史失败","Failed to read cloud history"],
    ["读取打印记录失败","Failed to read print logs"],
    ["读取变化流水失败","Failed to read change logs"],
    ["无法精确确认刷新按钮，未刷新。请重新绑定刷新按钮。","Cannot precisely confirm the refresh button, so refresh was skipped. Please rebind refresh."],
    ["请至少勾选一个可打印订单。","Select at least one printable order."],
    ["请先勾选复核结果。","Select review results first."],
    ["请先勾选 NOTE变化 类型。Canceled订单不会更新Note。","Select Note Changed items first. Canceled orders will not update notes."],
    ["请先勾选可打印的非Canceled复核结果。","Select printable non-canceled review results first."],
    ["无历史状态","No Previous Status"],
    ["无法识别","Unrecognized"],
    ["本机缓存","Local Cache"],
    ["云端历史","Cloud History"],
    ["全部","All"],
    ["已选择","Selected"],
    ["订单","Orders"],
    [" 单"," orders"],
    [" 条"," items"],
    [" 次"," times"],
    ["Note为空","Note empty"],
    ["：空",": Empty"]
].sort((a,b)=>b[0].length-a[0].length);
const UI_TEXT_NODE_ORIGINAL=new WeakMap();
let uiI18nObserverStarted=false;
let uiI18nLocalizeTimer=null;

function translateDynamicText(text){
    if(getUiLanguage()!=="en")return text;
    let out=String(text||"");
    UI_DYNAMIC_TRANSLATIONS.forEach(pair=>{
        out=out.split(pair[0]).join(pair[1]);
    });
    return out;
}

function isPluginWindowNode(node){
    if(!node||node.nodeType!==1)return false;
    const ids=[
        "tk-stable-panel-v101",
        "tk-review-window",
        "tk-review-product-analysis-window",
        "tk-review-product-detail-window",
        "tk-print-floating-window",
        "tk-cloud-history-window-v101",
        "tk-version-center-window",
        "tk-bind-tip"
    ];
    if(node.id&&ids.includes(node.id))return true;
    return !!(node.closest&&node.closest("#"+ids.join(",#")));
}

function localizePluginRoot(root){
    if(!root||root.nodeType!==1)return;
    const lang=getUiLanguage();
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
        acceptNode(node){
            const parent=node.parentElement;
            if(!parent||/^(SCRIPT|STYLE|TEXTAREA)$/i.test(parent.tagName))return NodeFilter.FILTER_REJECT;
            return String(node.nodeValue||"").trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
        }
    });
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
        if(lang==="en"){
            const original=UI_TEXT_NODE_ORIGINAL.get(node)||node.nodeValue;
            const translated=translateDynamicText(original);
            if(translated!==node.nodeValue){
                if(!UI_TEXT_NODE_ORIGINAL.has(node))UI_TEXT_NODE_ORIGINAL.set(node,original);
                node.nodeValue=translated;
            }
        }else if(UI_TEXT_NODE_ORIGINAL.has(node)){
            node.nodeValue=UI_TEXT_NODE_ORIGINAL.get(node);
        }
    });
    Array.from(root.querySelectorAll("input,textarea,select,button,[title]")).forEach(el=>{
        ["placeholder","title","value"].forEach(attr=>{
            if(attr==="value"&&!/^(BUTTON|INPUT)$/i.test(el.tagName))return;
            if(attr==="value"&&/^INPUT$/i.test(el.tagName)&&!["button","submit","reset"].includes(String(el.type||"").toLowerCase()))return;
            const current=el.getAttribute(attr);
            if(!current)return;
            const key="tkI18nOriginal"+attr.charAt(0).toUpperCase()+attr.slice(1);
            if(lang==="en"){
                const original=el.dataset[key]||current;
                const translated=translateDynamicText(original);
                if(translated!==current){
                    el.dataset[key]=original;
                    el.setAttribute(attr,translated);
                }
            }else if(el.dataset[key]){
                el.setAttribute(attr,el.dataset[key]);
            }
        });
    });
}

function localizePluginWindows(){
    const roots=[
        "tk-stable-panel-v101",
        "tk-review-window",
        "tk-review-product-analysis-window",
        "tk-review-product-detail-window",
        "tk-print-floating-window",
        "tk-cloud-history-window-v101",
        "tk-version-center-window",
        "tk-bind-tip"
    ];
    roots.forEach(id=>{
        const el=document.getElementById(id);
        if(el)localizePluginRoot(el);
    });
}

function localizePluginWindowsSoon(){
    if(uiI18nLocalizeTimer)clearTimeout(uiI18nLocalizeTimer);
    uiI18nLocalizeTimer=setTimeout(localizePluginWindows,20);
}

function startUiI18nObserver(){
    if(uiI18nObserverStarted)return;
    uiI18nObserverStarted=true;
    const target=document.documentElement||document.body;
    if(!target)return;
    const observer=new MutationObserver(mutations=>{
        if(getUiLanguage()!=="en")return;
        for(const m of mutations){
            for(const node of Array.from(m.addedNodes||[])){
                if(isPluginWindowNode(node)){
                    localizePluginWindowsSoon();
                    return;
                }
            }
        }
    });
    observer.observe(target,{childList:true,subtree:true});
}

function setListenPauseReason(reasonKey,detail){
    const data={
        key:reasonKey||"",
        detail:detail||"",
        at:now()
    };
    try{localStorage.setItem(LISTEN_PAUSE_REASON_KEY,JSON.stringify(data));}catch(e){}
    return data;
}

function clearListenPauseReason(){
    try{localStorage.removeItem(LISTEN_PAUSE_REASON_KEY);}catch(e){}
}

function getListenPauseReasonText(){
    try{
        const data=JSON.parse(localStorage.getItem(LISTEN_PAUSE_REASON_KEY)||"{}");
        if(!data||!data.key)return tr("noPauseReason");
        const base=tr(data.key)||data.key;
        return base+(data.detail?" - "+data.detail:"")+(data.at?" @ "+data.at:"");
    }catch(e){
        return tr("noPauseReason");
    }
}

function bootSafeText(v){
    return String(v==null?"":v)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;");
}
function showBootNotice(title,detail){
    const run=function(){
        try{
            if(!document.body)return;
            let box=document.getElementById("tk-printer-boot-notice-v116");
            if(!box){
                box=document.createElement("div");
                box.id="tk-printer-boot-notice-v116";
                box.style.cssText="position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#fff;border:2px solid #d60000;border-radius:8px;padding:10px 12px;width:360px;max-width:calc(100vw - 32px);font:13px/1.45 Arial,'Microsoft YaHei',sans-serif;color:#111;box-shadow:0 6px 24px rgba(0,0,0,.28);";
                document.body.appendChild(box);
            }
            box.innerHTML='<b style="color:#d60000;">TikTok打印插件诊断 v'+SCRIPT_VERSION+'</b><div style="margin-top:4px;">'+bootSafeText(title||"脚本已执行，正在加载面板...")+'</div>'+(detail?'<pre style="white-space:pre-wrap;word-break:break-all;max-height:160px;overflow:auto;margin:6px 0 0;background:#fff6f6;border:1px solid #ffd0d0;padding:6px;">'+bootSafeText(detail).slice(0,1200)+'</pre>':'');
        }catch(e){}
    };
    if(document.body)run();
    else setTimeout(run,500);
}
function clearBootNotice(){
    try{
        const box=document.getElementById("tk-printer-boot-notice-v116");
        if(box)box.remove();
    }catch(e){}
}
function showBootError(label,e){
    const msg=(e&&e.stack)?e.stack:(e&&e.message?e.message:String(e));
    showBootNotice(label||"启动失败",msg);
}
window.addEventListener("error",function(e){
    console.warn("[TikTok v"+SCRIPT_VERSION+"] page/script error captured:",e.error||e.message||e);
});
window.addEventListener("unhandledrejection",function(e){
    console.warn("[TikTok v"+SCRIPT_VERSION+"] page/script async error captured:",e.reason||e);
});

function getOperatorName(){
    const keys=[
        OPERATOR_NAME_KEY,
        PREFIX+"tk_operator_name_v89",
        PREFIX+"tk_operator_name_v90",
        PREFIX+"tk_operator_name_v91",
        PREFIX+"tk_operator_name_v912"
    ];
    for(const k of keys){
        const v=norm(localStorage.getItem(k)||"");
        if(v){
            if(k!==OPERATOR_NAME_KEY)localStorage.setItem(OPERATOR_NAME_KEY,v);
            return v;
        }
    }
    return "";
}
function setOperatorName(name){
    name=norm(name);
    if(!name)return false;
    localStorage.setItem(OPERATOR_NAME_KEY,name);
    // 兼容旧补丁可能读取的 key，避免一会儿显示未设置
    [PREFIX+"tk_operator_name_v89",PREFIX+"tk_operator_name_v90",PREFIX+"tk_operator_name_v91",PREFIX+"tk_operator_name_v912"].forEach(k=>localStorage.setItem(k,name));
    return true;
}
function ensureOperatorName(){
    let name=getOperatorName();
    if(name)return true;
    name=norm(prompt("请输入当前操作人用户名/昵称。\n例如：蔡平、张三、仓库A。\n不输入不能使用自动监听和打印。")||"");
    if(!name){alert("必须输入当前操作人后才能使用插件。");return false;}
    if(name.length>30){alert("用户名太长，请控制在30个字符以内。");return false;}
    setOperatorName(name);
    updateStablePanelSoon();
    return true;
}
function changeOperatorName(){
    const old=getOperatorName();
    const name=norm(prompt("请输入当前操作人用户名：",old||"")||"");
    if(!name)return;
    if(name.length>30){alert("用户名太长，请控制在30个字符以内。");return;}
    setOperatorName(name);
    updateStatus("当前操作人已切换为："+name);
    updateStablePanelSoon();
}
function getClientId(){
    let id=localStorage.getItem(CLIENT_ID_KEY);
    if(!id){id="client_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);localStorage.setItem(CLIENT_ID_KEY,id);}
    return id;
}
function getTabId(){
    const key=PREFIX+"tk_tab_id";
    let id=sessionStorage.getItem(key);
    if(!id){id="tab_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);sessionStorage.setItem(key,id);}
    return id;
}
function getOperatorMeta(){return {operatorName:getOperatorName()||"UNKNOWN",clientId:getClientId(),tabId:getTabId(),scriptVersion:SCRIPT_VERSION,pageUrl:location.href};}

function localTimeParts(date){
    const parts=new Intl.DateTimeFormat("en-US",{
        timeZone:LOCAL_TIME_ZONE,
        year:"numeric",
        month:"2-digit",
        day:"2-digit",
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
        hour12:false
    }).formatToParts(date||new Date());
    const out={};
    parts.forEach(p=>{if(p.type!=="literal")out[p.type]=p.value;});
    if(out.hour==="24")out.hour="00";
    return out;
}

function localDateTimeString(date){
    const p=localTimeParts(date||new Date());
    return p.year+"-"+p.month+"-"+p.day+" "+p.hour+":"+p.minute+":"+p.second+" LA";
}

function localDateString(date){
    const p=localTimeParts(date||new Date());
    return p.year+"-"+p.month+"-"+p.day;
}

function formatDisplayLocalTime(value){
    const s=norm(value);
    if(!s)return "";
    if(/\sLA$/i.test(s))return s;
    const d=new Date(s);
    if(!isNaN(d.getTime()))return localDateTimeString(d);
    return s;
}

function setDirectPrintLaunchMarker(reason,ts){
    const value=String(ts||Date.now());
    directPrintLaunchReason=reason||directPrintLaunchReason||"unknown";
    try{sessionStorage.setItem(DIRECT_PRINT_LAUNCH_KEY,value);}catch(e){}
    try{localStorage.setItem(DIRECT_PRINT_PERSIST_KEY,JSON.stringify({ts:Number(value)||Date.now(),reason:reason||"unknown"}));}catch(e){}
    try{
        if(typeof GM_setValue==="function")GM_setValue("directPrintLaunchTs",Number(value)||Date.now());
    }catch(e){}
}

function getPersistedDirectPrintMarkerTs(){
    try{
        const raw=localStorage.getItem(DIRECT_PRINT_PERSIST_KEY)||"";
        if(!raw)return 0;
        let data=null;
        try{data=JSON.parse(raw);}catch(e){data={ts:Number(raw)||0};}
        const ts=Number(data&&data.ts||0);
        if(ts&&Date.now()-ts<DIRECT_PRINT_MARKER_TTL_MS){
            directPrintLaunchReason=data.reason||directPrintLaunchReason||"local-storage";
            return ts;
        }
        if(ts)localStorage.removeItem(DIRECT_PRINT_PERSIST_KEY);
    }catch(e){}
    return 0;
}

function syncDirectPrintLaunchMarker(){
    try{
        const u=new URL(location.href);
        if(u.searchParams.get("tk_direct_print")==="1"||String(location.hash||"").includes("tk_direct_print=1")){
            setDirectPrintLaunchMarker("url",Date.now());
        }
    }catch(e){}
    try{
        const persisted=getPersistedDirectPrintMarkerTs();
        if(persisted&&!sessionStorage.getItem(DIRECT_PRINT_LAUNCH_KEY)){
            sessionStorage.setItem(DIRECT_PRINT_LAUNCH_KEY,String(persisted));
        }
    }catch(e){}
    try{
        if(typeof GM_getValue==="function"){
            const ts=Number(GM_getValue("directPrintLaunchTs",0)||0);
            if(ts&&Date.now()-ts<DIRECT_PRINT_MARKER_TTL_MS){
                setDirectPrintLaunchMarker("tampermonkey-storage",ts);
            }
        }
    }catch(e){}
}
syncDirectPrintLaunchMarker();

function checkDirectPrintMarkerFileSoon(){
    if(directPrintMarkerChecking||directPrintMarkerCheckDone)return;
    if(typeof GM_xmlhttpRequest!=="function"){
        directPrintMarkerCheckDone=true;
        return;
    }
    directPrintMarkerChecking=true;
    try{
        GM_xmlhttpRequest({
            method:"GET",
            url:DIRECT_PRINT_MARKER_FILE_URL+"?t="+Date.now(),
            timeout:2500,
            onload:function(res){
                directPrintMarkerChecking=false;
                directPrintMarkerCheckDone=true;
                const text=String((res&&res.responseText)||"");
                const m=text.match(/TK_DIRECT_PRINT_LAUNCH\s*=\s*(\d+)/i)||text.match(/(\d{12,})/);
                const ts=m?Number(m[1]||m[0]):0;
                if(ts&&Date.now()-ts<DIRECT_PRINT_MARKER_TTL_MS){
                    setDirectPrintLaunchMarker("marker-file",ts);
                    updateStablePanelSoon();
                    updateStatus("已确认直接打印入口：本机启动标记有效。");
                }else{
                    updateStablePanelSoon();
                }
            },
            onerror:function(){
                directPrintMarkerChecking=false;
                directPrintMarkerCheckDone=true;
                updateStablePanelSoon();
            },
            ontimeout:function(){
                directPrintMarkerChecking=false;
                directPrintMarkerCheckDone=true;
                updateStablePanelSoon();
            }
        });
    }catch(e){
        directPrintMarkerChecking=false;
        directPrintMarkerCheckDone=true;
    }
}

function isDirectPrintLaunchConfirmed(){
    syncDirectPrintLaunchMarker();
    const confirmed=!!sessionStorage.getItem(DIRECT_PRINT_LAUNCH_KEY);
    if(!confirmed)checkDirectPrintMarkerFileSoon();
    return confirmed;
}

function getDirectPrintStatusText(){
    if(isDirectPrintLaunchConfirmed()){
        const label=directPrintLaunchReason==="tampermonkey-storage"?tr("launchScript"):(directPrintLaunchReason==="marker-file"?tr("localMarker"):(directPrintLaunchReason==="url"?tr("urlEntry"):(directPrintLaunchReason==="manual"?tr("manualConfirm"):tr("confirmed"))));
        return tr("directConfirmed")+": "+label;
    }
    if(directPrintMarkerChecking)return tr("directChecking");
    return tr("directUnconfirmed");
}

function confirmDirectPrintLaunchManually(){
    const ok=confirm("确认当前浏览器窗口是用于 TikTok 标签直接打印的专用窗口？\n\n确认后，本窗口会允许监听自动打印。");

    if(!ok)return;

    setDirectPrintLaunchMarker("manual",Date.now());
    updateStatus("已人工确认直接打印入口。本窗口允许自动打印。");
    updateStablePanelSoon();
}

function makeDirectPrintLauncherCmd(){
    const url="https://seller-us.tiktok.com/order?selected_sort=6&tab=all&tk_direct_print=1";
    return [
        "@echo off",
        "set \"CHROME=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe\"",
        "if not exist \"%CHROME%\" set \"CHROME=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe\"",
        "if not exist \"%CHROME%\" set \"CHROME=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe\"",
        "if not exist \"%CHROME%\" (",
        "  echo Chrome executable not found.",
        "  pause",
        "  exit /b 1",
        ")",
        "",
        "set \"MARKER=%LOCALAPPDATA%\\Temp\\tk-direct-print-launch.txt\"",
        "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Set-Content -LiteralPath $env:MARKER -Value ('TK_DIRECT_PRINT_LAUNCH=' + [DateTimeOffset]::Now.ToUnixTimeMilliseconds()) -Encoding ASCII\"",
        "start \"\" \"%CHROME%\" --kiosk-printing --start-maximized --window-position=0,0 --new-window \""+url+"\"",
        ""
    ].join("\r\n");
}

async function downloadDirectPrintLauncher(){
    const filename="启动TikTok直接打印.cmd";
    const text=makeDirectPrintLauncherCmd();

    try{
        if(window.showSaveFilePicker){
            const handle=await window.showSaveFilePicker({
                suggestedName:filename,
                types:[{
                    description:"Windows command shortcut",
                    accept:{"application/x-msdownload":[".cmd"]}
                }]
            });
            const writable=await handle.createWritable();
            await writable.write(new Blob([text],{type:"application/x-msdownload"}));
            await writable.close();
            updateStatus("已保存专用启动快捷方式："+filename+"。以后请用它打开 TikTok。");
            updateStablePanelSoon();
            return;
        }
    }catch(e){
        if(e&&e.name==="AbortError")return;
        console.warn("[TikTok Printer] showSaveFilePicker failed, fallback to download",e);
    }

    try{
        const blob=new Blob([text],{type:"application/x-msdownload"});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;
        a.download=filename;
        a.style.display="none";
        document.body.appendChild(a);
        a.click();
        setTimeout(function(){
            try{URL.revokeObjectURL(url);}catch(e){}
            try{a.remove();}catch(e){}
        },1000);
        updateStatus("已下载专用启动快捷方式："+filename+"。如果浏览器提示风险，请保留该文件；以后用它打开 TikTok。");
        updateStablePanelSoon();
    }catch(e){
        alert("下载启动快捷方式失败："+(e&&e.message?e.message:e));
    }
}

function downloadTextFile(filename,text,mime){
    const blob=new Blob([String(text||"")],{type:mime||"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=filename||"download.txt";
    a.style.display="none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
        try{URL.revokeObjectURL(url);}catch(e){}
        try{a.remove();}catch(e){}
    },1200);
}

function compareVersionDesc(a,b){
    const pa=String(a||"").split(".").map(x=>Number(x)||0);
    const pb=String(b||"").split(".").map(x=>Number(x)||0);
    for(let i=0;i<Math.max(pa.length,pb.length);i++){
        const d=(pb[i]||0)-(pa[i]||0);
        if(d)return d;
    }
    return 0;
}

function normalizeReleaseDoc(d){
    d=d||{};
    const rawId=String(d.__docId||"");
    const inferredVersion=rawId.indexOf(RELEASE_DOC_PREFIX)===0?rawId.slice(RELEASE_DOC_PREFIX.length):rawId;
    return {
        version:String(d.version||inferredVersion||"").replace(/^v/i,""),
        date:d.date||d.releasedAt||d.updatedAt||"",
        notesZh:d.notesZh||d.notesCN||d.notes||"",
        notesEn:d.notesEn||d.notesEN||d.notes||"",
        source:d.source||"",
        downloadUrl:d.downloadUrl||d.url||"",
        filename:d.filename||("tiktok-label-printer-v"+String(d.version||inferredVersion||SCRIPT_VERSION).replace(/^v/i,"")+"-current.user.js"),
        isLatest:!!d.isLatest||d.__docId===RELEASE_DOC_LATEST
    };
}

function releaseDocId(version){
    if(!version||version==="latest")return RELEASE_DOC_LATEST;
    const v=String(version).replace(/^v/i,"");
    return RELEASE_DOC_PREFIX+v;
}

function releaseRawUrl(file){
    file=String(file||"").trim();
    if(!file)return "";
    return RELEASE_GITHUB_RAW_BASE+file.split("/").map(part=>encodeURIComponent(part)).join("/");
}

function withCacheBust(url){
    return url+(url.indexOf("?")>=0?"&":"?")+"_="+Date.now();
}

async function fetchReleaseText(url){
    const res=gmRequestText(url,{method:"GET",headers:{},timeout:20000});
    const out=res?await res:await fetchRequestText(url,{method:"GET",headers:{}});
    if(!out.ok)throw new Error("HTTP "+out.status+" "+String(out.text||"").slice(0,180));
    return String(out.text||"");
}

async function fetchReleaseJson(url){
    return JSON.parse(await fetchReleaseText(url));
}

async function loadGithubReleaseRows(){
    const manifest=await fetchReleaseJson(withCacheBust(RELEASE_GITHUB_MANIFEST_URL));
    const files=Array.isArray(manifest&&manifest.files)?manifest.files:[];
    const rows=files.map(item=>{
        const file=item.file||item.filename||"";
        return normalizeReleaseDoc(Object.assign({},item,{
            filename:file||item.filename,
            downloadUrl:file?releaseRawUrl(file):(item.downloadUrl||item.url||""),
            isLatest:String(item.version||"").replace(/^v/i,"")===String(manifest.latest||"").replace(/^v/i,"")
        }));
    }).filter(x=>x.version);
    return rows.sort((a,b)=>compareVersionDesc(a.version,b.version));
}

async function loadReleaseHistory(){
    try{
        const rows=await loadGithubReleaseRows();
        if(rows.length)return {rows:rows,via:"github"};
    }catch(e){
        console.warn("[TikTok Printer] release history GitHub load failed",e);
    }

    try{
        const ids=[...new Set(RELEASE_HISTORY_FALLBACK.map(x=>releaseDocId(x.version)))];
        const docs=[];

        for(const id of ids){
            try{
                const doc=await getRestDoc(RELEASE_COLLECTION,id);
                if(doc&&doc.exists)docs.push(Object.assign({__docId:id},doc.data||{}));
            }catch(e){}
        }

        const rows=docs.map(normalizeReleaseDoc).filter(x=>x.version&&x.version!=="latest").sort((a,b)=>compareVersionDesc(a.version,b.version));

        if(rows.length)return {rows:rows,via:"cloud"};
    }catch(e){
        console.warn("[TikTok Printer] release history cloud load failed",e);
    }

    return {rows:RELEASE_HISTORY_FALLBACK.map(normalizeReleaseDoc),via:"fallback"};
}

async function loadReleaseDoc(version){
    try{
        const rows=await loadGithubReleaseRows();
        const wanted=String(version||"latest").replace(/^v/i,"");
        let release=null;
        if(wanted==="latest")release=rows.find(x=>x.isLatest)||rows[0]||null;
        else release=rows.find(x=>String(x.version||"").replace(/^v/i,"")===wanted)||null;
        if(release){
            if(release.downloadUrl&&!release.source){
                release.source=await fetchReleaseText(withCacheBust(release.downloadUrl));
            }
            return release;
        }
    }catch(e){
        console.warn("[TikTok Printer] release doc GitHub load failed",e);
    }

    const id=releaseDocId(version);
    const doc=await getRestDoc(RELEASE_COLLECTION,id);
    if(doc&&doc.exists)return normalizeReleaseDoc(Object.assign({__docId:id},doc.data||{}));
    throw new Error("Release not found: "+id);
}

async function downloadReleaseVersion(version){
    try{
        const release=await loadReleaseDoc(version||"latest");

        if(release.source){
            downloadTextFile(release.filename,release.source,"application/javascript;charset=utf-8");
            updateStatus(tr("downloadDone")+": "+release.filename);
            return;
        }

        if(release.downloadUrl){
            const a=document.createElement("a");
            a.href=release.downloadUrl;
            a.target="_blank";
            a.rel="noopener";
            a.download=release.filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(()=>{try{a.remove();}catch(e){}},800);
            updateStatus(tr("downloadDone")+": "+release.filename);
            return;
        }

        alert(tr("downloadNeedCloud"));
    }catch(e){
        alert(tr("downloadNeedCloud")+"\n"+(e&&e.message?e.message:e));
    }
}

function closeVersionCenter(){
    const el=document.getElementById("tk-version-center-window");
    if(el)el.remove();
}

async function openVersionCenter(){
    closeVersionCenter();

    const win=document.createElement("div");
    win.id="tk-version-center-window";
    win.style.cssText="position:fixed;right:24px;top:84px;z-index:2147483200;width:min(760px,calc(100vw - 48px));max-height:calc(100vh - 120px);display:flex;flex-direction:column;background:#fff;border:2px solid #111;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.3);font:13px/1.45 Arial,'Microsoft YaHei',sans-serif;color:#111;overflow:hidden;";
    win.innerHTML=
        '<div id="tkVersionHeader" style="background:#111;color:#fff;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;">'+
            '<b>'+esc(tr("versionCenterTitle"))+'</b>'+
            '<div style="display:flex;gap:6px;align-items:center;">'+
                '<button id="tkVersionReload" style="padding:4px 10px;border:0;border-radius:4px;background:#fff;color:#111;cursor:pointer;font-weight:bold;">'+esc(tr("reload"))+'</button>'+
                '<button id="tkVersionClose" style="padding:4px 10px;border:0;border-radius:4px;background:#ff3b30;color:#fff;cursor:pointer;font-weight:bold;">'+esc(tr("close"))+'</button>'+
            '</div>'+
        '</div>'+
        '<div id="tkVersionBody" style="padding:12px;overflow:auto;min-height:180px;">Loading...</div>';
    document.body.appendChild(win);
    makeFloatingWindowDraggable(win,"#tkVersionHeader");
    document.getElementById("tkVersionClose").onclick=closeVersionCenter;
    document.getElementById("tkVersionReload").onclick=function(){renderVersionCenterBody();};
    await renderVersionCenterBody();
    updateStatus(tr("releaseCenterOpened"));
}

async function renderVersionCenterBody(){
    const body=document.getElementById("tkVersionBody");
    if(!body)return;
    body.innerHTML='<div style="padding:20px;text-align:center;color:#666;">Loading...</div>';

    const result=await loadReleaseHistory();
    const rows=result.rows||[];
    const latest=rows[0]||normalizeReleaseDoc(RELEASE_HISTORY_FALLBACK[0]);
    const lang=getUiLanguage();

    body.innerHTML=
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">'+
            '<div style="border:1px solid #ddd;border-radius:6px;padding:10px;background:#f7f7f7;"><div style="color:#666;font-size:12px;">'+esc(tr("currentVersion"))+'</div><b style="font-size:22px;">v'+esc(SCRIPT_VERSION)+'</b></div>'+
            '<div style="border:1px solid #d0e2ff;border-radius:6px;padding:10px;background:#eef5ff;"><div style="color:#555;font-size:12px;">'+esc(tr("latestVersion"))+'</div><b style="font-size:22px;">v'+esc(latest.version||SCRIPT_VERSION)+'</b></div>'+
        '</div>'+
        (result.via==="fallback"?'<div style="padding:8px 10px;background:#fff7d6;border:1px solid #e6d28a;border-radius:6px;margin-bottom:10px;color:#7a4b00;font-weight:bold;">'+esc(tr("cloudReleaseUnavailable"))+'</div>':'')+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">'+
            '<button id="tkDownloadLatestRelease" style="padding:8px 14px;border:1px solid #111;border-radius:6px;background:#111;color:#fff;font-weight:bold;cursor:pointer;">'+esc(tr("downloadLatest"))+'</button>'+
            '<button id="tkDownloadCurrentRelease" style="padding:8px 14px;border:1px solid #0b67c2;border-radius:6px;background:#e8f0ff;color:#073b78;font-weight:bold;cursor:pointer;">'+esc(tr("downloadLocalCurrent"))+'</button>'+
        '</div>'+
        '<div style="font-weight:900;margin-bottom:6px;">'+esc(tr("releaseHistory"))+'</div>'+
        rows.map(row=>{
            const notes=lang==="en"?(row.notesEn||row.notesZh):(row.notesZh||row.notesEn);
            return '<div style="border:1px solid #ddd;border-radius:7px;padding:10px;margin:8px 0;background:#fff;">'+
                '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
                    '<div><b style="font-size:17px;">v'+esc(row.version)+'</b> <span style="color:#666;">'+esc(row.date||"")+'</span></div>'+
                    '<button class="tkDownloadReleaseBtn" data-version="'+esc(row.version)+'" style="padding:5px 10px;border:1px solid #333;border-radius:5px;background:#f5f5f5;cursor:pointer;">'+esc(tr("downloadThisVersion"))+'</button>'+
                '</div>'+
                '<div style="margin-top:6px;color:#333;white-space:pre-wrap;">'+esc(notes||"")+'</div>'+
            '</div>';
        }).join("");

    const latestBtn=document.getElementById("tkDownloadLatestRelease");
    if(latestBtn)latestBtn.onclick=function(e){e.preventDefault();downloadReleaseVersion("latest");};
    const currentBtn=document.getElementById("tkDownloadCurrentRelease");
    if(currentBtn)currentBtn.onclick=function(e){e.preventDefault();downloadReleaseVersion(SCRIPT_VERSION);};
    body.querySelectorAll(".tkDownloadReleaseBtn").forEach(btn=>{
        btn.onclick=function(e){
            e.preventDefault();
            downloadReleaseVersion(this.getAttribute("data-version"));
        };
    });
}

function requireDirectPrintForAutoPrint(opt){
    if(opt&&opt.force)return true;
    if(isDirectPrintLaunchConfirmed())return true;
    updateStatus("已阻止自动打印：当前浏览器不是通过直接打印专用入口打开。请用带 tk_direct_print=1 的专用启动链接打开。");
    return false;
}

function isPageBlockedByTikTokVerification(){
    try{
        const text=norm(document.body&&document.body.innerText||"").toLowerCase();
        if(!text)return false;
        const hasVerifyText=
            text.includes("verify to continue") ||
            text.includes("drag the puzzle") ||
            text.includes("puzzle piece") ||
            text.includes("complete the verification") ||
            text.includes("请完成验证") ||
            text.includes("拖动滑块") ||
            text.includes("验证");
        if(!hasVerifyText)return false;
        const centerModal=Array.from(document.querySelectorAll("div,section,main")).some(el=>{
            if(!el||!el.getBoundingClientRect)return false;
            const rect=el.getBoundingClientRect();
            if(rect.width<260||rect.height<180)return false;
            if(rect.left<0||rect.top<0||rect.right>(window.innerWidth||0)||rect.bottom>(window.innerHeight||0))return false;
            const t=norm(el.innerText||el.textContent||"").toLowerCase();
            return t.includes("verify to continue")||t.includes("drag the puzzle")||t.includes("puzzle piece")||t.includes("验证");
        });
        return centerModal || text.includes("verify to continue");
    }catch(e){
        return false;
    }
}

function guardTikTokVerification(reason){
    if(!isPageBlockedByTikTokVerification()){
        if(tiktokVerificationGuardActive){
            tiktokVerificationGuardActive=false;
            if(autoRefreshPausedReason==="TikTok验证中，完成验证后会继续")autoRefreshPausedReason="";
            updateStatus("TikTok验证已解除，脚本恢复正常。");
            updateAutoRefreshText();
            updateStablePanelSoon();
        }
        return false;
    }
    tiktokVerificationGuardActive=true;
    setListenPauseReason("stoppedByVerification","");
    autoRefreshPausedReason="TikTok验证中，完成验证后会继续";
    const nowMs=Date.now();
    if(nowMs-tiktokVerificationLastNoticeAt>5000){
        tiktokVerificationLastNoticeAt=nowMs;
        updateStatus((reason||"检测到 TikTok 验证")+"：请先手动完成页面中间的验证，完成后脚本会继续正常使用。");
        updateAutoRefreshText();
        updateStablePanelSoon();
    }
    return true;
}

function loadExternalScriptOnce(url,id,timeoutMs){
    if(externalScriptLoadMap[url])return externalScriptLoadMap[url];
    externalScriptLoadMap[url]=new Promise((resolve,reject)=>{
        let done=false;
        let timer=null;
        function finish(ok,err){
            if(done)return;
            done=true;
            if(timer)clearTimeout(timer);
            if(ok)resolve(true);
            else reject(err||new Error("脚本加载失败："+url));
        }
        function append(){
            try{
                const parent=document.head||document.documentElement||document.body;
                if(!parent){
                    setTimeout(append,100);
                    return;
                }
                if(id&&document.getElementById(id)){
                    finish(true);
                    return;
                }
                const s=document.createElement("script");
                if(id)s.id=id;
                s.async=true;
                s.src=url;
                s.onload=()=>finish(true);
                s.onerror=()=>finish(false,new Error("脚本加载失败："+url));
                parent.appendChild(s);
                timer=setTimeout(()=>finish(false,new Error("脚本加载超时："+url)),timeoutMs||15000);
            }catch(e){
                finish(false,e);
            }
        }
        append();
    });
    return externalScriptLoadMap[url];
}

function startUtilityScriptWarmup(){
    if(tkUtilityWarmupStarted)return;
    tkUtilityWarmupStarted=true;
    if(TK_IS_LOCAL_CHROME_EXTENSION)return;
    loadExternalScriptOnce(QR_CODE_SCRIPT_URL,"tk-qrcodejs-dynamic",15000).catch(e=>{
        console.warn("[TikTok Printer] QRCode库动态加载失败，将使用备用二维码图片",e);
    });
}

function startFirebaseSdkLoad(){
    tkFirebaseSdkLoadStarted=false;
    tkCloudStatus="云同步：REST通道已启用";
    updateStablePanelSoon();
}

function initFirebaseCloud(){
    try{
        if(tkCloudReady&&tkCloudDb)return true;
        if(shouldUseCloudRestFirst()){
            if(!tkCloudStatus||tkCloudStatus==="云同步：初始化中"||tkCloudStatus==="云同步：重新连接中"||/^云同步：SDK/.test(tkCloudStatus)){
                tkCloudStatus="云同步：REST通道已启用";
                updateStablePanelSoon();
            }
            return false;
        }
        const fb=(typeof firebase!=="undefined")?firebase:((typeof window!=="undefined"&&window.firebase)?window.firebase:null);
        if(!fb){
            tkCloudStatus="云同步：REST通道已启用";
            updateStablePanelSoon();
            return false;
        }
        if(!fb.firestore){
            tkCloudStatus="云同步：REST通道已启用";
            updateStablePanelSoon();
            return false;
        }
        if(!fb.apps||!fb.apps.length)fb.initializeApp(FIREBASE_CONFIG);
        tkCloudDb=fb.firestore();
        try{
            tkCloudDb.settings({
                experimentalForceLongPolling:true,
                ignoreUndefinedProperties:true
            });
        }catch(settingsError){
            console.warn("[TikTok v"+SCRIPT_VERSION+"] Firestore settings skipped:",settingsError);
        }
        tkCloudReady=true;
        tkCloudStatus="云同步：已连接";
        updateStablePanelSoon();
        return true;
    }catch(e){
        tkCloudReady=false;
        tkCloudStatus="云同步：连接失败 "+(e&&e.message?e.message:e);
        console.error("[TikTok v10.1] Firebase init failed",e);
        updateStablePanelSoon();
        return false;
    }
}
async function waitForFirebaseCloud(timeoutMs){
    if(shouldUseCloudRestFirst())return false;
    const end=Date.now()+Number(timeoutMs||9000);
    if(initFirebaseCloud())return true;
    while(Date.now()<end){
        await wait(350);
        if(initFirebaseCloud())return true;
    }
    if(/^云同步：SDK/.test(tkCloudStatus)){
        tkCloudStatus="云同步：REST通道已启用";
        updateStablePanelSoon();
    }
    return false;
}

function cloudErrorCode(e){
    return String((e&&e.code)||(e&&e.message)||e||"unknown");
}

function isTransientCloudError(e){
    return /unavailable|deadline-exceeded|aborted|internal|network|offline|Firebase未连接|SDK未加载|SDK动态加载失败/i.test(cloudErrorCode(e));
}

function isPermissionCloudError(e){
    const text=cloudErrorCode(e)+" "+String((e&&e.message)||e||"");
    return /permission|PERMISSION_DENIED|insufficient permissions|REST 403/i.test(text);
}

function shouldUseCloudRestFirst(){
    return !tkCloudReady&&typeof GM_xmlhttpRequest==="function";
}

async function runCloudOperation(label,fn,attempts){
    attempts=attempts||3;
    let lastError=null;
    for(let i=1;i<=attempts;i++){
        if(!await waitForFirebaseCloud(10000))throw new Error(tkCloudStatus||"Firebase未连接");
        try{
            if(tkCloudDb&&typeof tkCloudDb.enableNetwork==="function"){
                try{await tkCloudDb.enableNetwork();}catch(e){}
            }
            return await fn();
        }catch(e){
            lastError=e;
            if(!isTransientCloudError(e)||i>=attempts)break;
            tkCloudStatus="云同步："+label+"重试 "+i+"/"+attempts+"（"+cloudErrorCode(e)+"）";
            updateStablePanelSoon();
            await wait(700*i+500);
        }
    }
    throw lastError;
}

function firestoreRestBase(){
    return "https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(FIREBASE_CONFIG.projectId)+"/databases/(default)/documents";
}

function firestoreRestDocName(collection,id){
    return "projects/"+FIREBASE_CONFIG.projectId+"/databases/(default)/documents/"+collection+"/"+encodeURIComponent(String(id));
}

function firestoreRestValue(v){
    if(v===undefined||v===null)return {nullValue:null};
    if(typeof v==="boolean")return {booleanValue:v};
    if(typeof v==="number"){
        if(Number.isFinite(v)&&Math.floor(v)===v)return {integerValue:String(v)};
        return {doubleValue:Number.isFinite(v)?v:0};
    }
    if(Array.isArray(v))return {arrayValue:{values:v.map(firestoreRestValue)}};
    if(typeof v==="object")return {mapValue:{fields:firestoreRestFields(v)}};
    return {stringValue:String(v)};
}

function firestoreRestFields(obj){
    const fields={};
    Object.keys(obj||{}).forEach(k=>{
        const v=obj[k];
        if(v!==undefined&&typeof v!=="function")fields[k]=firestoreRestValue(v);
    });
    return fields;
}

function firestoreRestNumber(value){
    if(!value)return 0;
    return Number(value.integerValue||value.doubleValue||0)||0;
}

function firestoreRestPlainValue(value){
    if(!value)return null;
    if(Object.prototype.hasOwnProperty.call(value,"stringValue"))return value.stringValue;
    if(Object.prototype.hasOwnProperty.call(value,"integerValue"))return Number(value.integerValue)||0;
    if(Object.prototype.hasOwnProperty.call(value,"doubleValue"))return Number(value.doubleValue)||0;
    if(Object.prototype.hasOwnProperty.call(value,"booleanValue"))return !!value.booleanValue;
    if(Object.prototype.hasOwnProperty.call(value,"timestampValue"))return value.timestampValue;
    if(Object.prototype.hasOwnProperty.call(value,"nullValue"))return null;
    if(value.arrayValue){
        const arr=value.arrayValue.values||[];
        return arr.map(firestoreRestPlainValue);
    }
    if(value.mapValue){
        const out={};
        const fields=value.mapValue.fields||{};
        Object.keys(fields).forEach(k=>{out[k]=firestoreRestPlainValue(fields[k]);});
        return out;
    }
    return null;
}

function firestoreRestDocToPlain(doc){
    const out={};
    const fields=doc&&doc.fields?doc.fields:{};
    Object.keys(fields).forEach(k=>{out[k]=firestoreRestPlainValue(fields[k]);});
    return out;
}

function gmRequestText(url,opt){
    opt=opt||{};
    if(typeof GM_xmlhttpRequest!=="function")return null;
    return new Promise((resolve,reject)=>{
        let done=false;
        function finish(fn,arg){
            if(done)return;
            done=true;
            fn(arg);
        }
        try{
            GM_xmlhttpRequest({
                method:opt.method||"GET",
                url:url,
                headers:Object.assign({"Content-Type":"application/json"},opt.headers||{}),
                data:opt.body||undefined,
                timeout:opt.timeout||18000,
                onload:function(res){
                    finish(resolve,{
                        ok:res.status>=200&&res.status<300,
                        status:res.status,
                        text:String(res.responseText||"")
                    });
                },
                onerror:function(res){
                    finish(reject,new Error("GM REST network error "+(res&&res.status||"")));
                },
                ontimeout:function(){
                    finish(reject,new Error("GM REST timeout"));
                }
            });
        }catch(e){
            finish(reject,e);
        }
    });
}

async function fetchRequestText(url,opt){
    const res=await fetch(url,Object.assign({headers:{"Content-Type":"application/json"}},opt||{}));
    return {ok:res.ok,status:res.status,text:await res.text()};
}

async function firestoreRestFetch(path,opt){
    opt=opt||{};
    const joiner=path.includes("?")?"&":"?";
    const url=firestoreRestBase()+path+joiner+"key="+encodeURIComponent(FIREBASE_CONFIG.apiKey);
    const request=gmRequestText(url,opt);
    const res=request?await request:await fetchRequestText(url,opt);
    const text=res.text||"";
    let data=null;
    try{data=text?JSON.parse(text):null;}catch(e){}
    if(!res.ok){
        const msg=(data&&data.error&&data.error.message)?data.error.message:text;
        throw new Error("REST "+res.status+" "+msg);
    }
    return data;
}

async function getRestPrintCount(orderId){
    try{
        const data=await firestoreRestFetch("/tiktok_orders/"+encodeURIComponent(String(orderId)));
        return firestoreRestNumber(data&&data.fields&&data.fields.printCount);
    }catch(e){
        if(/REST 404/i.test(String(e&&e.message||e)))return 0;
        throw e;
    }
}

async function getRestDoc(collection,id){
    try{
        const data=await firestoreRestFetch("/"+encodeURIComponent(collection)+"/"+encodeURIComponent(String(id)));
        return {exists:true,data:firestoreRestDocToPlain(data)};
    }catch(e){
        if(/REST 404/i.test(String(e&&e.message||e)))return {exists:false,data:{}};
        throw e;
    }
}

async function listRestCollection(collection,pageSize){
    const all=[];
    let token="";
    do{
        const query="?pageSize="+encodeURIComponent(String(pageSize||1000))+(token?"&pageToken="+encodeURIComponent(token):"");
        const data=await firestoreRestFetch("/"+encodeURIComponent(collection)+query);
        (data.documents||[]).forEach(doc=>{
            const plain=firestoreRestDocToPlain(doc);
            if(doc.name)plain.__docId=doc.name.split("/").pop();
            all.push(plain);
        });
        token=data.nextPageToken||"";
    }while(token);
    return all;
}

async function firestoreRestRunQuery(structuredQuery){
    const data=await firestoreRestFetch(":runQuery",{
        method:"POST",
        body:JSON.stringify({structuredQuery:structuredQuery})
    });
    return (Array.isArray(data)?data:[]).filter(x=>x&&x.document).map(x=>{
        const plain=firestoreRestDocToPlain(x.document);
        if(x.document.name)plain.__docId=x.document.name.split("/").pop();
        return plain;
    });
}

function makeCloudPrintEventId(orderId,reason){
    return [
        "print",
        String(orderId).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)||"order",
        Date.now(),
        getTabId().replace(/[^a-zA-Z0-9_-]/g,"").slice(0,40),
        Math.random().toString(36).slice(2,8)
    ].join("_");
}

function makeCloudPrintLogDoc(doc,reason,extra,printEventId){
    const printedAtLocal=doc.latestPrintedAt||doc.printedAt||now();
    const printedAtIso=doc.latestPrintedAtIso||doc.printedAtIso||new Date().toISOString();
    const printedAtMs=Number(doc.latestPrintedAtMs||doc.printedAtMs||0)||Date.now();
    return Object.assign({},doc,{
        printEventId:printEventId,
        reason:reason||"打印",
        printedAt:printedAtLocal,
        printedAtIso:printedAtIso,
        printedAtMs:printedAtMs,
        oldNote:extra&&extra.oldNote?extra.oldNote:"",
        newNote:extra&&extra.newNote?extra.newNote:(doc.note||"")
    });
}

async function saveHistoryCloudRest(orderId,doc,reason,extra){
    const printEventId=doc.printEventId||makeCloudPrintEventId(orderId,reason);
    const old=await getRestDoc("tiktok_orders",orderId);
    const oldData=old.data||{};
    const oldCount=Number(oldData.printCount||0)||0;
    const log=await getRestDoc("tiktok_print_logs",printEventId);
    const alreadyApplied=log.exists||oldData.lastPrintEventId===printEventId;
    const nextCount=alreadyApplied?oldCount:oldCount+1;
    const orderDoc=Object.assign({},doc,{printEventId:printEventId,lastPrintEventId:printEventId,printCount:nextCount});
    const logDoc=makeCloudPrintLogDoc(doc,reason,extra,printEventId);
    await firestoreRestFetch(":commit",{
        method:"POST",
        body:JSON.stringify({
            writes:[
                {
                    update:{
                        name:firestoreRestDocName("tiktok_orders",orderId),
                        fields:firestoreRestFields(orderDoc)
                    },
                    updateMask:{fieldPaths:Object.keys(orderDoc)}
                },
                {
                    update:{
                        name:firestoreRestDocName("tiktok_print_logs",printEventId),
                        fields:firestoreRestFields(logDoc)
                    }
                }
            ]
        })
    });
    return {wasNew:!old.exists,via:"REST",applied:!alreadyApplied};
}

function getCloudPendingWrites(){
    const rows=getJson(CLOUD_PENDING_WRITES_KEY,[]);
    return Array.isArray(rows)?rows.filter(x=>x&&x.type==="print"&&x.orderId&&x.doc):[];
}

function setCloudPendingWrites(rows){
    setJson(CLOUD_PENDING_WRITES_KEY,(Array.isArray(rows)?rows:[]).slice(-500));
}

function getCloudPendingPrintCount(){
    try{
        return getCloudPendingWrites().length;
    }catch(e){
        return 0;
    }
}

function enqueueCloudPendingPrint(orderId,doc,reason,extra,sourceError){
    if(!orderId||!doc)return 0;
    const printEventId=doc.printEventId||makeCloudPrintEventId(orderId,reason);
    doc=Object.assign({},doc,{printEventId:printEventId,lastPrintEventId:printEventId});
    const rows=getCloudPendingWrites();
    if(rows.some(x=>x.printEventId===printEventId))return rows.length;
    rows.push({
        type:"print",
        orderId:String(orderId),
        printEventId:printEventId,
        doc:doc,
        reason:reason||"打印",
        extra:extra||{},
        queuedAt:now(),
        queuedAtIso:new Date().toISOString(),
        queuedAtMs:Date.now(),
        retryCount:0,
        lastError:sourceError?cloudErrorCode(sourceError):""
    });
    setCloudPendingWrites(rows);
    return rows.length;
}

function scheduleCloudPendingFlush(delayMs){
    if(tkCloudPendingFlushTimer)clearTimeout(tkCloudPendingFlushTimer);
    tkCloudPendingFlushTimer=setTimeout(function(){
        flushCloudPendingWrites(80).catch(e=>{
            tkCloudStatus="云同步：补写失败 "+cloudErrorCode(e)+"，待同步 "+getCloudPendingPrintCount()+" 条";
            updateStablePanelSoon();
        });
    },Math.max(1000,Number(delayMs||3000)||3000));
}

async function flushCloudPendingWrites(maxItems){
    if(tkCloudPendingFlushRunning)return;
    const rows=getCloudPendingWrites();
    if(!rows.length)return;
    tkCloudPendingFlushRunning=true;
    let synced=0;
    let failed=null;
    const remaining=[];
    const limit=Math.max(1,Number(maxItems||80)||80);
    try{
        for(let i=0;i<rows.length;i++){
            const item=rows[i];
            if(synced>=limit){
                remaining.push(item);
                continue;
            }
            try{
                const doc=Object.assign({},item.doc||{},{
                    printEventId:item.printEventId,
                    lastPrintEventId:item.printEventId
                });
                await saveHistoryCloudRest(item.orderId,doc,item.reason,item.extra||{});
                synced++;
            }catch(e){
                failed=e;
                item.retryCount=Number(item.retryCount||0)+1;
                item.lastError=cloudErrorCode(e);
                item.lastTryAt=now();
                item.lastTryAtIso=new Date().toISOString();
                remaining.push(item);
                for(let j=i+1;j<rows.length;j++)remaining.push(rows[j]);
                break;
            }
        }
        setCloudPendingWrites(remaining);
        if(synced){
            tkCloudLastAt=now();
            tkCloudStatus="云同步：补写成功 "+synced+" 条"+(remaining.length?"，待同步 "+remaining.length+" 条":"");
            refreshCloudCount();
        }else if(failed){
            tkCloudStatus="云同步：补写失败 "+cloudErrorCode(failed)+"，待同步 "+remaining.length+" 条";
        }
        updateStablePanelSoon();
    }finally{
        tkCloudPendingFlushRunning=false;
    }
}

async function refreshCloudCount(){
    if(tkCloudCountLoading)return;
    tkCloudCountLoading=true;
    try{
        if(shouldUseCloudRestFirst()||!await waitForFirebaseCloud(1500)){
            const docs=await listRestCollection("tiktok_orders",1000);
            tkCloudOrderCount=docs.length||0;
            tkCloudLastAt=now();
            tkCloudStatus="云同步：已同步 "+tkCloudOrderCount+" 单（REST读取）";
            updateStablePanelSoon();
            return;
        }
        tkCloudStatus="云同步：读取中";
        updateStablePanelSoon();
        const snap=await runCloudOperation("读取",()=>tkCloudDb.collection("tiktok_orders").get(),3);
        tkCloudOrderCount=snap.size||0;
        tkCloudLastAt=now();
        tkCloudStatus="云同步：已同步 "+tkCloudOrderCount+" 单";
        updateStablePanelSoon();
    }catch(e){
        try{
            const docs=await listRestCollection("tiktok_orders",1000);
            tkCloudOrderCount=docs.length||0;
            tkCloudLastAt=now();
            tkCloudStatus="云同步：已同步 "+tkCloudOrderCount+" 单（REST读取）";
        }catch(restError){
            tkCloudStatus="云同步：读取失败 "+(restError&&restError.code?restError.code:(restError&&restError.message?restError.message:""));
        }
        updateStablePanelSoon();
    }finally{
        tkCloudCountLoading=false;
    }
}
function startCloudSyncWarmup(){
    if(tkCloudInitStarted)return;
    tkCloudInitStarted=true;
    if(shouldUseCloudRestFirst()){
        refreshCloudCount();
        return;
    }

    let attempts=0;

    function tryInit(){
        attempts++;

        if(initFirebaseCloud()){
            refreshCloudCount();
            if(tkCloudInitRetryTimer){
                clearInterval(tkCloudInitRetryTimer);
                tkCloudInitRetryTimer=null;
            }
            return;
        }

        if(attempts>=20){
            if(tkCloudInitRetryTimer){
                clearInterval(tkCloudInitRetryTimer);
                tkCloudInitRetryTimer=null;
            }
            if(/^云同步：SDK/.test(tkCloudStatus))tkCloudStatus="云同步：REST通道已启用";
            updateStablePanelSoon();
        }
    }

    tryInit();
    tkCloudInitRetryTimer=setInterval(tryInit,1500);
}

function retryCloudSyncNow(){
    if(tkCloudInitRetryTimer){
        clearInterval(tkCloudInitRetryTimer);
        tkCloudInitRetryTimer=null;
    }
    tkCloudReady=false;
    tkCloudDb=null;
    tkCloudInitStarted=false;
    tkCloudStatus="云同步：重新连接中";
    updateStablePanelSoon();
    if(shouldUseCloudRestFirst()){
        refreshCloudCount();
        scheduleCloudPendingFlush(1200);
        return;
    }
    startCloudSyncWarmup();
    scheduleCloudPendingFlush(1800);
}
function cloudOrderDocFromInfo(orderId,info,reason){
    const meta=getOperatorMeta();
    const note=effectiveNote(info);
    const printedAtLocal=now();
    const printedAtIso=new Date().toISOString();
    return Object.assign({},meta,{
        order:orderId,
        orderId:orderId,
        shortId:info.shortId||String(orderId).slice(-6),
        title:info.title||"",
        time:info.time||"",
        orderDate:info.orderDate||orderDateOnly(info.time||""),
        orderDateValue:info.orderDateValue||parseOrderDateValue(info.time||""),
        note:note||"",
        latestNote:note||"",
        orderType:info.orderType||"",
        orderStatus:info.orderStatus||"",
        quantity:Number(info.quantity||info.qty||1)||1,
        gmv:Number(info.gmv||info.amount||0)||0,
        gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
        latestStatus:info.orderStatus||"",
        latestReason:reason||"打印",
        latestOperatorName:meta.operatorName,
        latestPrintedAt:printedAtLocal,
        latestPrintedAtIso:printedAtIso,
        latestPrintedAtMs:Date.now(),
        updatedAt:printedAtLocal,
        updatedAtIso:printedAtIso,
        updatedAtMs:Date.now(),
        pageUrl:location.href
    });
}
async function saveHistoryCloud(orderId,info,reason,extra){
    let doc=null;
    try{
        doc=cloudOrderDocFromInfo(orderId,info,reason);
        const printEventId=makeCloudPrintEventId(orderId,reason);
        doc.printEventId=printEventId;
        doc.lastPrintEventId=printEventId;
        let result=null;
        if(shouldUseCloudRestFirst()){
            result=await saveHistoryCloudRest(orderId,doc,reason,extra);
        }else{
            try{
                result=await runCloudOperation("写入",async ()=>{
                const ref=tkCloudDb.collection("tiktok_orders").doc(String(orderId));
                const logRef=tkCloudDb.collection("tiktok_print_logs").doc(printEventId);
                if(typeof tkCloudDb.runTransaction==="function"){
                    let txResult={wasNew:false,via:"SDK",applied:false};
                    await tkCloudDb.runTransaction(async transaction=>{
                        const old=await transaction.get(ref);
                        const log=await transaction.get(logRef);
                        const oldData=old.exists?(old.data()||{}):{};
                        const oldCount=Number(oldData.printCount||0)||0;
                        const alreadyApplied=log.exists||oldData.lastPrintEventId===printEventId;
                        const nextCount=alreadyApplied?oldCount:oldCount+1;
                        transaction.set(ref,Object.assign({},doc,{printCount:nextCount}),{merge:true});
                        if(!log.exists)transaction.set(logRef,makeCloudPrintLogDoc(doc,reason,extra,printEventId));
                        txResult={wasNew:!old.exists,via:"SDK",applied:!alreadyApplied};
                    });
                    return txResult;
                }
                const old=await ref.get();
                const log=await logRef.get();
                const oldData=old.exists?(old.data()||{}):{};
                const oldCount=Number(oldData.printCount||0)||0;
                const alreadyApplied=log.exists||oldData.lastPrintEventId===printEventId;
                const nextCount=alreadyApplied?oldCount:oldCount+1;
                await ref.set(Object.assign({},doc,{printCount:nextCount}),{merge:true});
                if(!log.exists)await logRef.set(makeCloudPrintLogDoc(doc,reason,extra,printEventId));
                return {wasNew:!old.exists,via:"SDK",applied:!alreadyApplied};
                },3);
            }catch(sdkError){
                if(!isTransientCloudError(sdkError))throw sdkError;
                tkCloudStatus="云同步：SDK写入不可用，正在改用REST...";
                updateStablePanelSoon();
                result=await saveHistoryCloudRest(orderId,doc,reason,extra);
            }
        }
        tkCloudOrderCount=Math.max(tkCloudOrderCount,result&&result.wasNew?tkCloudOrderCount+1:tkCloudOrderCount);
        tkCloudLastAt=now();
        const pending=getCloudPendingPrintCount();
        tkCloudStatus="云同步：已同步 "+tkCloudOrderCount+" 单"+(result&&result.via==="REST"?"（REST备用）":"")+(pending?"，待同步 "+pending+" 条":"");
        updateStablePanelSoon();
        if(getCloudPendingPrintCount())scheduleCloudPendingFlush(2500);
    }catch(e){
        const pending=doc?enqueueCloudPendingPrint(orderId,doc,reason,extra,e):getCloudPendingPrintCount();
        tkCloudStatus="云同步：写入失败 "+cloudErrorCode(e)+"，已暂存待同步 "+pending+" 条";
        console.error("[TikTok v10.1] cloud save failed",e);
        if(doc)scheduleCloudPendingFlush(10000);
        updateStablePanelSoon();
    }
}

function makeReviewLogId(scanId,page,orderId,nowMs){
    return [
        scanId||("scan_"+nowMs),
        "p"+String(page||0),
        String(orderId)
    ].join("_").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,220);
}

function makeReviewOrderCloudData(info,meta,scanId,page,nowLocal,nowIso,nowMs){
    const orderId=String(info.order);
    const note=effectiveNote(info)||"";
    return Object.assign({},meta,{
        order:orderId,
        orderId:orderId,
        shortId:info.shortId||orderId.slice(-6),
        title:info.title||"",
        time:info.time||"",
        orderDate:info.orderDate||orderDateOnly(info.time||""),
        orderDateValue:info.orderDateValue||parseOrderDateValue(info.time||""),
        note:note,
        latestNote:note,
        orderType:info.orderType||"",
        orderStatus:info.orderStatus||"",
        quantity:Number(info.quantity||info.qty||1)||1,
        gmv:Number(info.gmv||info.amount||0)||0,
        gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
        latestStatus:info.orderStatus||"",
        trackingText:info.trackingText||"",
        hasTracking:!!(info.trackingText),
        latestReason:"复核扫描",
        latestOperatorName:meta.operatorName,
        latestReviewStatus:info.orderStatus||"",
        latestReviewNote:note,
        latestReviewTrackingText:info.trackingText||"",
        latestReviewAt:nowLocal,
        latestReviewAtIso:nowIso,
        latestReviewAtMs:nowMs,
        latestReviewOperatorName:meta.operatorName,
        reviewScanId:scanId||"",
        reviewPage:Number(page||0),
        reviewSource:"网页复核扫描",
        updatedAt:nowLocal,
        updatedAtIso:nowIso,
        updatedAtMs:nowMs,
        pageUrl:location.href
    });
}

async function saveReviewOrdersCloudRest(infos,scanId,page,meta,nowLocal,nowIso,nowMs,options){
    options=options||{};
    const includeReviewLogs=options.includeReviewLogs!==false;
    try{
        let writes=[];
        let count=0;
        async function commit(){
            if(!writes.length)return;
            await firestoreRestFetch(":commit",{
                method:"POST",
                body:JSON.stringify({writes:writes})
            });
            writes=[];
        }
        for(const info of infos){
            if(!info||!info.order)continue;
            const orderId=String(info.order);
            const data=makeReviewOrderCloudData(info,meta,scanId,page,nowLocal,nowIso,nowMs);
            writes.push({
                update:{
                    name:firestoreRestDocName("tiktok_orders",orderId),
                    fields:firestoreRestFields(data)
                },
                updateMask:{fieldPaths:Object.keys(data)}
            });
            if(includeReviewLogs){
                const logId=makeReviewLogId(scanId,page,orderId,nowMs);
                const logData=Object.assign({},data,{
                    logId:logId,
                    logType:"review_snapshot",
                    reviewedAt:nowLocal,
                    reviewedAtIso:nowIso,
                    reviewedAtMs:nowMs
                });
                writes.push({
                    update:{
                        name:firestoreRestDocName("tiktok_review_logs",logId),
                        fields:firestoreRestFields(logData)
                    },
                    updateMask:{fieldPaths:Object.keys(logData)}
                });
            }
            count++;
            if(writes.length>=380)await commit();
        }
        await commit();
        return {ok:true,count,via:includeReviewLogs?"REST":"REST-orders-only",reviewLogsSaved:includeReviewLogs};
    }catch(e){
        if(includeReviewLogs&&isPermissionCloudError(e)){
            const fallback=await saveReviewOrdersCloudRest(infos,scanId,page,meta,nowLocal,nowIso,nowMs,{includeReviewLogs:false});
            fallback.reviewLogsSkipped=true;
            fallback.reviewLogError=cloudErrorCode(e);
            return fallback;
        }
        throw e;
    }
}

async function saveReviewOrdersCloud(infos,scanId,page){
    try{
        if(!Array.isArray(infos)||!infos.length)return {ok:true,count:0};
        const meta=getOperatorMeta();
        const nowLocal=now();
        const nowIso=new Date().toISOString();
        const nowMs=Date.now();
        if(shouldUseCloudRestFirst()||!await waitForFirebaseCloud(1500)){
            const restResult=await saveReviewOrdersCloudRest(infos,scanId,page,meta,nowLocal,nowIso,nowMs);
            tkCloudLastAt=now();
            tkCloudStatus=restResult.reviewLogsSkipped
                ?"云同步：复核主订单已保存 "+restResult.count+" 单；复核流水无权限"
                :"云同步：复核已保存 "+restResult.count+" 单（REST备用）";
            updateStablePanelSoon();
            return restResult;
        }
        let count=0;
        let batch=tkCloudDb.batch();
        let batchWriteCount=0;

        async function commitBatch(){
            if(batchWriteCount>0){
                await batch.commit();
                batch=tkCloudDb.batch();
                batchWriteCount=0;
            }
        }

        for(const info of infos){
            if(!info||!info.order)continue;
            const orderId=String(info.order);
            const ref=tkCloudDb.collection("tiktok_orders").doc(orderId);
            const data=makeReviewOrderCloudData(info,meta,scanId,page,nowLocal,nowIso,nowMs);
            batch.set(ref,data,{merge:true});
            batchWriteCount++;

            const logId=makeReviewLogId(scanId,page,orderId,nowMs);
            const logRef=tkCloudDb.collection("tiktok_review_logs").doc(logId);
            batch.set(logRef,Object.assign({},data,{
                logId:logId,
                logType:"review_snapshot",
                reviewedAt:nowLocal,
                reviewedAtIso:nowIso,
                reviewedAtMs:nowMs
            }),{merge:true});
            batchWriteCount++;
            count++;

            if(batchWriteCount>=380)await commitBatch();
        }
        await commitBatch();
        if(count>0){
            tkCloudLastAt=now();
            tkCloudStatus="云同步：复核已保存 "+count+" 单";
            refreshCloudCount();
            updateStablePanelSoon();
        }
        return {ok:true,count};
    }catch(e){
        if(isPermissionCloudError(e)){
            try{
                const meta=getOperatorMeta();
                const nowLocal=now();
                const nowIso=new Date().toISOString();
                const nowMs=Date.now();
                const restResult=await saveReviewOrdersCloudRest(infos,scanId,page,meta,nowLocal,nowIso,nowMs,{includeReviewLogs:false});
                tkCloudLastAt=now();
                tkCloudStatus="云同步：复核主订单已保存 "+restResult.count+" 单；复核流水无权限";
                updateStablePanelSoon();
                return restResult;
            }catch(restError){
                e=restError;
            }
        }else if(isTransientCloudError(e)){
            try{
                const meta=getOperatorMeta();
                const nowLocal=now();
                const nowIso=new Date().toISOString();
                const nowMs=Date.now();
                const restResult=await saveReviewOrdersCloudRest(infos,scanId,page,meta,nowLocal,nowIso,nowMs);
                tkCloudLastAt=now();
                tkCloudStatus=restResult.reviewLogsSkipped
                    ?"云同步：复核主订单已保存 "+restResult.count+" 单；复核流水无权限"
                    :"云同步：复核已保存 "+restResult.count+" 单（REST备用）";
                updateStablePanelSoon();
                return restResult;
            }catch(restError){
                e=restError;
            }
        }
        console.error("[TikTok Printer] 复核订单写入云端失败",e);
        tkCloudStatus="云同步：复核写入失败 "+(e&&e.code?e.code:"");
        updateStablePanelSoon();
        return {ok:false,count:0,reason:e&&e.message?e.message:String(e)};
    }
}

function clearPrintQueue(reason){
    printQueue=[];
    printingQueue=false;
    updateStatus(reason||"已清空打印队列。");
    updateStablePanelSoon();
}


const SCAN_INTERVAL=2000;
const AUTO_REFRESH_INTERVAL=15000;
const BACKGROUND_WATCHDOG_INTERVAL=5000;
const BACKGROUND_STALE_MS=12000;
const LOCK_MS=30000;
const PRINT_DELAY_MS=1300;
const REVIEW_DAYS=3;
const REVIEW_MAX_PAGES=180;

let scanTimer=null;
let autoRefreshTimer=null;
let autoRefreshNextAt=0;
let autoRefreshCountdownTimer=null;
let backgroundWatchdogTimer=null;
let backgroundContinuityReady=false;
let listeningWakeLock=null;
let listeningWakeLockPending=false;
let lastScanAt=0;
let lastContinuityRecoverAt=0;
let isListening=false;
let viewChangeTimer=null;
let viewChangeProtecting=false;
let lastUrlForProtect=location.href;
let pageChangeGuardUntil=0;
let lastKnownVisibleSig="";
let bindRefreshMode=false;
let bindNextMode=false;
let printQueue=[];
let printingQueue=false;
let currentPrintListInfos=[];
let currentPrintListLastScanAt="";
let autoRefreshPausedReason="";
let reviewDifferences=[];
let reviewScannedInfos=[];
let reviewPageStats=[];
let reviewLastResult=null;
let reviewRunning=false;
let reviewAbortRequested=false;
let refreshAutoRebindLastAt=0;
let refreshAutoRebindFailCount=0;

function getJson(k,f){
    try{
        return JSON.parse(localStorage.getItem(k)||JSON.stringify(f));
    }catch(e){
        return f;
    }
}

function setJson(k,v){
    const text=JSON.stringify(v);
    try{
        localStorage.setItem(k,text);
        return true;
    }catch(e){
        console.warn('[TikTok Printer] localStorage写入失败，尝试压缩数据:',k,e);

        // 复核扫描历史最容易超额。这里不让复核流程因为本地缓存失败而中断。
        if(k===REVIEW_SCAN_HISTORY_KEY){
            try{
                const compact=Array.isArray(v)?v.slice(0,5).map(makeCompactReviewHistoryItem):[];
                localStorage.setItem(k,JSON.stringify(compact));
                return true;
            }catch(e2){
                try{localStorage.removeItem(k);}catch(e3){}
                console.warn('[TikTok Printer] 已清空超额复核扫描历史:',e2);
                return false;
            }
        }

        // 差异历史也可能很大，失败时只保留最近5次的轻量摘要。
        if(k===REVIEW_DIFF_HISTORY_KEY){
            try{
                const compact=Array.isArray(v)?v.slice(0,5).map(x=>({
                    scanId:x&&x.scanId||'',
                    createdAt:x&&x.createdAt||'',
                    tabTitle:x&&x.tabTitle||'',
                    diffCount:x&&x.diffCount||0
                })):[];
                localStorage.setItem(k,JSON.stringify(compact));
                return true;
            }catch(e2){
                try{localStorage.removeItem(k);}catch(e3){}
                return false;
            }
        }

        if(k===REVIEW_RESULT_HISTORY_KEY){
            try{
                const compact=Array.isArray(v)?v.slice(0,3).map(x=>makeCompactReviewReplayItem(x,450,180)):[];
                localStorage.setItem(k,JSON.stringify(compact));
                return true;
            }catch(e2){
                try{localStorage.removeItem(k);}catch(e3){}
                return false;
            }
        }

        return false;
    }
}

function norm(s){
    return String(s||"").trim().replace(/\s+/g," ");
}

function esc(s){
    return String(s||"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function now(){
    return localDateTimeString(new Date());
}

function today(){
    return localDateString(new Date());
}

function wait(ms){
    return new Promise(r=>setTimeout(r,ms));
}

function stripPrintedMark(note){
    return norm(note).replace(/\s*\[?PRINTED\]?\s*$/i,"").trim();
}

function isGiftOrder(info){
    return info&&info.orderType==="LIVE Giveaway";
}

function effectiveNote(info){
    return stripPrintedMark((info&&info.cleanNote)||(info&&info.note)||"")||(isGiftOrder(info)?GIVEAWAY_NOTE:"");
}

function copyTextToClipboard(text){
    const ta=document.createElement("textarea");
    ta.value=String(text||"");
    ta.setAttribute("readonly","readonly");
    ta.style.position="fixed";
    ta.style.left="-9999px";
    ta.style.top="-9999px";
    ta.style.opacity="0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try{
        document.execCommand("copy");
    }catch(e){
        console.warn("复制失败",e);
    }
    ta.remove();
    return Promise.resolve();
}

function getVisibleOrderSignature(){
    try{
        // v11.0：不再隐藏复核窗口。只读取页面正文文本，并排除插件自身浮窗里的旧订单号。
        const pluginIds=new Set(["tk-review-window","tk-print-floating-window","tk-cloud-history-window","tiktok-auto-print-panel-windows","tk-stable-panel-v101","tk-bind-tip"]);
        const chunks=[];
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{
            acceptNode(node){
                const p=node.parentElement;
                if(!p)return NodeFilter.FILTER_REJECT;
                let cur=p;
                while(cur&&cur!==document.body){
                    if(cur.id&&pluginIds.has(cur.id))return NodeFilter.FILTER_REJECT;
                    cur=cur.parentElement;
                }
                const s=String(node.nodeValue||"").trim();
                if(!s)return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let n;
        while((n=walker.nextNode()))chunks.push(n.nodeValue);
        const text=chunks.join("\n");
        const found=[...text.matchAll(/Order ID:\s*\n?\s*(577\d{15})\b/gi)].map(x=>x[1]);
        return found.slice(0,5).join("|");
    }catch(e){
        return "";
    }
}

async function waitPageChanged(oldSig,maxMs){
    maxMs=maxMs||9000;
    const start=Date.now();

    while(Date.now()-start<maxMs){
        await wait(500);
        const nowSig=getVisibleOrderSignature();
        if(nowSig&&nowSig!==oldSig)return true;
    }

    return false;
}

function getPaginationSignatureForReview(){
    try{
        return Array.from(document.querySelectorAll("button,[role='button'],li,a,[aria-current],[aria-selected]"))
            .filter(el=>isVisibleElement(el))
            .filter(el=>{
                const rect=el.getBoundingClientRect();
                const text=getNextCandidateText(el);
                const lower=text.toLowerCase();
                const pageLike=/^(\d{1,4}|…|\.\.\.)$/.test(norm(el.innerText||el.textContent||""));
                return rect.top>window.innerHeight*0.45 || pageLike || isNextText(text) || isPreviousText(text) || lower.includes("page");
            })
            .map(el=>{
                const text=norm(el.innerText||el.textContent||safeAttr(el,"aria-label")||safeAttr(el,"title"));
                const cls=String(el.className||"").toLowerCase();
                const state=[
                    safeAttr(el,"aria-current"),
                    safeAttr(el,"aria-selected"),
                    safeAttr(el,"aria-disabled"),
                    el.disabled?"disabled":"",
                    cls.includes("active")?"active":"",
                    cls.includes("selected")?"selected":"",
                    cls.includes("disabled")?"disabled-class":""
                ].filter(Boolean).join(",");
                return text+":"+state;
            })
            .join("|")
            .slice(0,1200);
    }catch(e){
        return "";
    }
}

function getReviewPageTurnSignature(){
    return [
        location.href,
        getVisibleOrderSignature(),
        getPaginationSignatureForReview()
    ].join("||");
}

async function waitReviewPageTurnChanged(oldSig,maxMs){
    maxMs=maxMs||10000;
    const start=Date.now();

    while(Date.now()-start<maxMs){
        await wait(500);
        const sig=getReviewPageTurnSignature();
        if(sig&&sig!==oldSig)return true;
    }

    return false;
}

function migrateOldStorageToMaster(){
    if(localStorage.getItem(MIGRATION_KEY)==="1")return;

    const versions=[
        "60","61","62","63","64","65","66","67","68","69",
        "70","71","72","73","74","75","76","77","78","79",
        "80","81","82","83","84","85","86","87"
    ];

    const historyKeys=versions.map(v=>PREFIX+"tk_history_v"+v);
    const seenKeys=versions.map(v=>PREFIX+"tk_seen_v"+v);
    const noteKeys=versions.map(v=>PREFIX+"tk_note_v"+v);
    const refreshKeys=versions.map(v=>PREFIX+"tk_refresh_bind_v"+v);

    const masterHistory=getJson(HISTORY_KEY,{});

    historyKeys.forEach(k=>{
        const old=getJson(k,null);
        if(!old||typeof old!=="object")return;

        Object.keys(old).forEach(date=>{
            if(!masterHistory[date])masterHistory[date]={};

            const day=old[date]||{};

            Object.keys(day).forEach(orderId=>{
                const item=day[orderId];
                if(!item)return;

                if(!masterHistory[date][orderId]){
                    masterHistory[date][orderId]=item;
                }else{
                    const m=masterHistory[date][orderId];
                    const oldLogs=Array.isArray(item.logs)?item.logs:[];
                    const mLogs=Array.isArray(m.logs)?m.logs:[];

                    m.logs=mLogs.concat(oldLogs);
                    m.printCount=Math.max(
                        Number(m.printCount||0),
                        Number(item.printCount||0),
                        m.logs.length||1
                    );
                    m.printedAt=item.printedAt||m.printedAt||"";
                    m.title=item.title||m.title||"";
                    m.time=item.time||m.time||"";
                    m.note=item.note||m.note||"";
                    m.systemNote=item.systemNote||m.systemNote||"";
                    m.orderType=item.orderType||m.orderType||"";
                    m.orderStatus=item.orderStatus||m.orderStatus||"";
                }
            });
        });
    });

    setJson(HISTORY_KEY,masterHistory);

    const seenSet=new Set(getJson(SEEN_KEY,[]));

    seenKeys.forEach(k=>{
        const arr=getJson(k,[]);
        if(Array.isArray(arr))arr.forEach(x=>seenSet.add(x));
    });

    setJson(SEEN_KEY,[...seenSet].slice(-8000));

    const notes=getJson(NOTE_KEY,{});

    noteKeys.forEach(k=>{
        const old=getJson(k,null);
        if(old&&typeof old==="object")Object.assign(notes,old);
    });

    setJson(NOTE_KEY,notes);

    if(!localStorage.getItem(REFRESH_BIND_KEY)){
        for(const k of refreshKeys){
            const old=getJson(k,null);
            if(old){
                setJson(REFRESH_BIND_KEY,old);
                break;
            }
        }
    }

    localStorage.setItem(MIGRATION_KEY,"1");
}

function lines(t){
    return String(t||"").replace(/\r/g,"\n").split("\n").map(x=>x.trim()).filter(Boolean);
}

function formatTimeNoYear(t){
    const s=norm(t);
    const m=s.match(/^(\d{2})\/(\d{2})\/\d{4}\s+(.+)$/);
    return m?m[1]+"/"+m[2]+" "+m[3]:s;
}

function parseOrderDateValue(t){
    const s=norm(t);
    const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);

    if(!m)return 0;

    let month=Number(m[1])-1;
    let day=Number(m[2]);
    let year=Number(m[3]);
    let hour=Number(m[4]);
    let min=Number(m[5]);
    let sec=Number(m[6]||0);
    const ap=(m[7]||"").toUpperCase();

    if(ap==="PM"&&hour<12)hour+=12;
    if(ap==="AM"&&hour===12)hour=0;

    return new Date(year,month,day,hour,min,sec).getTime()||0;
}

function parseAnyDateValue(t){
    const s=norm(t);
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*LA)?$/i);
    if(m){
        return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0)).getTime()||0;
    }
    const d=new Date(s.replace(/\s+LA$/i,""));
    if(!isNaN(d.getTime()))return d.getTime();
    return parseOrderDateValue(t);
}

function dateOnlyFromValue(v){
    if(!v)return "";
    const d=new Date(v);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function orderDateOnly(t){
    return dateOnlyFromValue(parseOrderDateValue(t));
}

function dayStartValue(dateStr){
    if(!dateStr)return 0;
    const d=new Date(dateStr+"T00:00:00");
    return d.getTime()||0;
}

function getReviewCutoffValue(){
    const d=new Date();
    d.setDate(d.getDate()-REVIEW_DAYS);
    d.setHours(0,0,0,0);
    return d.getTime();
}

function getOrderBlocksFromText(txt){
    txt=String(txt||"");
    const reg=/Order ID:\s*\n?\s*(577\d{15})\b/gi;
    let matches=[];
    let m;

    while((m=reg.exec(txt))!==null){
        matches.push({id:m[1],index:m.index});
    }

    return matches.map((x,i)=>{
        const next=matches[i+1]?matches[i+1].index:txt.length;

        return {
            order:x.id,
            shortId:x.id.slice(-6),
            text:txt.slice(x.index,next)
        };
    });
}

function isPluginPanelElement(el){
    const ids=new Set([
        "tk-print-floating-window",
        "tiktok-auto-print-panel-windows",
        "tk-review-window",
        "tk-bind-tip",
        "tk-cloud-history-window",
        "tk-stable-panel-v101"
    ]);

    let cur=el;

    while(cur&&cur!==document.body){
        if(cur.id&&(ids.has(cur.id)||cur.id.indexOf("tk-cloud-history-window")===0))return true;
        cur=cur.parentElement;
    }

    return false;
}

function getOrderBlocksFromDom(){
    const reg=/Order ID:\s*\n?\s*(577\d{15})\b/gi;
    const map={};
    const candidates=Array.from(document.querySelectorAll("div,li,tr,article,section"));

    candidates.forEach(el=>{
        if(isPluginPanelElement(el))return;

        const rawText=String(el.innerText||el.textContent||"").replace(/\r/g,"");
        const text=norm(rawText);

        if(!text||!text.includes("Order ID"))return;

        const matches=[...text.matchAll(reg)];

        if(matches.length!==1)return;

        const order=matches[0][1];
        const lower=text.toLowerCase();
        const rect=el.getBoundingClientRect();

        if(text.length<80||text.length>4500)return;
        if(rect.width<500||rect.height<55)return;

        let signal=0;

        if(/\d{2}\/\d{2}\/\d{4}/.test(text)&&/\d{1,2}:\d{2}:\d{2}/.test(text))signal+=4;
        if(/\b(live|auction|giveaway)\b/i.test(text))signal+=3;
        if(/\b(canceled|cancelled|awaiting shipment|awaiting collection|in transit|delivered|shipped|on hold)\b/i.test(text))signal+=3;
        if(lower.includes("tiktok shipping")||lower.includes("standard shipping"))signal+=1;
        if(lower.includes("add note")||lower.includes("seller note")||/\bnote\b/i.test(text))signal+=1;

        if(signal<5)return;

        const score=signal*10000-text.length-Math.round(rect.height);
        const old=map[order];

        if(!old||score>old.score){
            map[order]={
                order,
                shortId:order.slice(-6),
                text:rawText,
                score
            };
        }
    });

    return Object.values(map).map(x=>({
        order:x.order,
        shortId:x.shortId,
        text:x.text
    }));
}

function getOrderBlocks(){
    const ids=[
        "tk-print-floating-window",
        "tiktok-auto-print-panel-windows",
        "tk-review-window",
        "tk-bind-tip",
        "tk-cloud-history-window-v101",
        "tk-stable-panel-v101"
    ];

    const old={};

    ids.forEach(id=>{
        const el=document.getElementById(id);
        if(el){
            old[id]=el.style.display;
            el.style.display="none";
        }
    });

    const domBlocks=getOrderBlocksFromDom();
    const text=document.body.innerText||"";
    const textBlocks=getOrderBlocksFromText(text);

    ids.forEach(id=>{
        const el=document.getElementById(id);
        if(el)el.style.display=old[id]||"";
    });

    if(!domBlocks.length)return textBlocks;
    if(!textBlocks.length)return domBlocks;

    const merged={};

    textBlocks.forEach(block=>{
        if(block&&block.order){
            merged[block.order]={
                order:block.order,
                shortId:block.shortId,
                text:block.text||""
            };
        }
    });

    domBlocks.forEach(block=>{
        if(!block||!block.order)return;

        const oldBlock=merged[block.order];
        const domText=block.text||"";
        const oldText=oldBlock&&oldBlock.text?oldBlock.text:"";

        merged[block.order]={
            order:block.order,
            shortId:block.shortId,
            text:oldText&&oldText!==domText?(domText+"\n"+oldText):domText||oldText
        };
    });

    return Object.values(merged);
}

function mergeBlocksToMap(targetMap,blocks){
    blocks.forEach(block=>{
        if(block&&block.order)targetMap[block.order]=block;
    });
}

function getScrollableCandidates(){
    const all=Array.from(document.querySelectorAll("div,main,section,article"));
    const candidates=[];

    for(const el of all){
        try{
            const style=window.getComputedStyle(el);
            const overflowY=style.overflowY;
            const rect=el.getBoundingClientRect();

            if(
                rect.height>250 &&
                rect.width>400 &&
                el.scrollHeight>el.clientHeight+100 &&
                (
                    overflowY==="auto" ||
                    overflowY==="scroll" ||
                    overflowY==="overlay"
                )
            ){
                candidates.push(el);
            }
        }catch(e){}
    }

    candidates.sort((a,b)=>{
        const scoreA=(a.scrollHeight-a.clientHeight)+a.getBoundingClientRect().height;
        const scoreB=(b.scrollHeight-b.clientHeight)+b.getBoundingClientRect().height;
        return scoreB-scoreA;
    });

    return candidates;
}

function getMainScrollTarget(){
    const candidates=getScrollableCandidates();

    for(const el of candidates){
        const txt=el.innerText||"";
        if(/Order ID:\s*\n?\s*577\d{15}/i.test(txt))return el;
    }

    return document.scrollingElement||document.documentElement||document.body;
}

async function scrollMainToBottom(){
    const scrollTarget=getMainScrollTarget();

    const isWindowScroll=
        scrollTarget===document.scrollingElement ||
        scrollTarget===document.documentElement ||
        scrollTarget===document.body;

    if(isWindowScroll){
        window.scrollTo(
            0,
            Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)
        );
    }else{
        scrollTarget.scrollTop=scrollTarget.scrollHeight;
    }

    await wait(800);
}

async function collectCurrentListOrderBlocksByScroll(){
    const blockMap={};
    const scrollTarget=getMainScrollTarget();

    const isWindowScroll=
        scrollTarget===document.scrollingElement ||
        scrollTarget===document.documentElement ||
        scrollTarget===document.body;

    const originalTop=isWindowScroll?window.scrollY:scrollTarget.scrollTop;

    const getTop=()=>isWindowScroll?window.scrollY:scrollTarget.scrollTop;

    const getMaxTop=()=>{
        if(isWindowScroll){
            const doc=document.scrollingElement||document.documentElement||document.body;
            return Math.max(0,doc.scrollHeight-window.innerHeight);
        }

        return Math.max(0,scrollTarget.scrollHeight-scrollTarget.clientHeight);
    };

    const scrollToTopValue=(top)=>{
        if(isWindowScroll)window.scrollTo(0,top);
        else scrollTarget.scrollTop=top;
    };

    // 复核翻页前会滚到底部点下一页；新页面加载后滚动位置可能还在底部。
    // 每页采集前先回到顶部，避免只扫到底部旧订单后误判复核已经结束。
    scrollToTopValue(0);
    await wait(650);

    function collectOnce(){
        mergeBlocksToMap(blockMap,getOrderBlocks());
        updateStatus("正在扫描当前列表：已发现 "+Object.keys(blockMap).length+" 个订单...");
        updateReviewStatus("正在扫描当前页：已发现 "+Object.keys(blockMap).length+" 个订单...");
    }

    collectOnce();

    let lastCount=Object.keys(blockMap).length;
    let stableTimes=0;

    for(let i=0;i<22;i++){
        const currentTop=getTop();
        const maxTop=getMaxTop();

        if(currentTop>=maxTop-8)stableTimes++;

        const nextTop=Math.min(maxTop,currentTop+Math.max(500,window.innerHeight*0.75));

        scrollToTopValue(nextTop);
        await wait(650);

        collectOnce();

        const count=Object.keys(blockMap).length;

        if(count===lastCount)stableTimes++;
        else stableTimes=0;

        lastCount=count;

        if(stableTimes>=3)break;
    }

    await wait(300);
    collectOnce();

    scrollToTopValue(originalTop);
    await wait(300);

    const blocks=Object.values(blockMap);

    updateStatus("扫描完成：共发现 "+blocks.length+" 个订单。");
    updateReviewStatus("当前页扫描完成：共发现 "+blocks.length+" 个订单。");

    return blocks;
}

function extractOrderType(block){
    const head=lines(block.text).slice(0,18).join(" ");

    if(/\bLIVE\b/i.test(head)&&/\bAuction\b/i.test(head))return "LIVE Auction";
    if(/\bLIVE\b/i.test(head)&&/\bGiveaway\b/i.test(head))return "LIVE Giveaway";
    if(/\bLIVE\b/i.test(head))return "LIVE";

    return "";
}

function isCanceledTextLine(line){
    const s=norm(line).toLowerCase();
    return (
        s==="canceled" ||
        s==="cancelled" ||
        s==="cancled" ||
        /^canceled by\b/i.test(s) ||
        /^cancelled by\b/i.test(s) ||
        /^cancled by\b/i.test(s) ||
        /^order status\s*[:：]\s*canceled$/i.test(s) ||
        /^order status\s*[:：]\s*cancelled$/i.test(s)
    );
}

function normalizeOrderStatusLine(line){
    const s=norm(line);

    if(!s)return "";
    if(isCanceledTextLine(s))return "Canceled";
    if(/^in transit$/i.test(s))return "In transit";
    if(/^awaiting collection$/i.test(s))return "Awaiting collection";
    if(/^awaiting shipment$/i.test(s))return "Awaiting shipment";
    if(/^on hold$/i.test(s))return "On hold";
    if(/^completed$/i.test(s))return "Completed";
    if(/^shipped$/i.test(s))return "Shipped";
    if(/^delivered$/i.test(s)||/^delived$/i.test(s))return "Delivered";
    if(/^to ship$/i.test(s))return "To ship";
    if(/^pending$/i.test(s))return "Pending";

    return "";
}

function isQuantityLine(line){
    const s=norm(line);
    return /^([x×]\s*)?\d+\s*$/.test(s)||/^[x×]\s*\d+$/i.test(s);
}

function isOrderStatusSearchBoundary(line){
    const lower=norm(line).toLowerCase();
    return (
        !lower ||
        lower.includes("tiktok shipping") ||
        lower.includes("standard shipping") ||
        lower.includes("delivery deadline") ||
        lower.includes("ship by ") ||
        lower.includes("arrange shipment") ||
        lower.includes("print documents") ||
        lower.includes("view logistics") ||
        lower.includes("more actions") ||
        lower.includes("seller note") ||
        lower.includes("add note") ||
        lower.includes("edit note") ||
        lower.includes("orders from the last")
    );
}

function extractOrderStatus(t){
    const arr=lines(t);

    for(let i=0;i<arr.length;i++){
        if(!isQuantityLine(arr[i]))continue;

        for(let j=i+1;j<arr.length&&j<=i+8;j++){
            const status=normalizeOrderStatusLine(arr[j]);

            if(status)return status;
            if(isOrderStatusSearchBoundary(arr[j]))break;
        }
    }

    for(let i=0;i<arr.length;i++){
        const status=normalizeOrderStatusLine(arr[i]);
        if(status)return status;
    }

    return "Unknown";
}

function isLikelyProductSpecLine(line){
    const s=norm(line).toLowerCase();

    if(!s)return false;

    return (
        s==="default" ||
        s==="black" ||
        s==="white" ||
        s==="red" ||
        s==="blue" ||
        s==="green" ||
        s==="grey" ||
        s==="gray" ||
        s==="brown" ||
        s==="orange" ||
        s==="yellow" ||
        s==="pink" ||
        s==="purple" ||
        s==="navy" ||
        s==="beige" ||
        s==="cream" ||
        s==="one size" ||
        s==="small" ||
        s==="medium" ||
        s==="large" ||
        s==="x-small" ||
        s==="x-large" ||
        s==="xs" ||
        s==="s" ||
        s==="m" ||
        s==="l" ||
        s==="xl" ||
        s==="xxl" ||
        s==="xxxl" ||
        /^size\s*[:：]?\s*\w+$/i.test(s) ||
        /^(men|women|unisex|kids|youth|adult)s?$/i.test(s) ||
        /^\d+\s*(pack|pcs|piece|pieces)$/i.test(s) ||
        /^\d+(\.\d+)?\s*(m|w|y|us|uk|eu)$/i.test(s)
    );
}

function isBadNoteValue(line){
    const s=norm(line);
    const lower=s.toLowerCase();

    if(!s)return true;
    if(s.length>120)return true;
    if(/^add note$/i.test(s))return true;
    if(/^edit note$/i.test(s))return true;
    if(/^seller note$/i.test(s)||/^note$/i.test(s))return true;
    if(/^order id\b/i.test(s)||/^577\d{15}$/.test(s))return true;
    if(isCanceledTextLine(s))return true;
    if(/^(live|auction|giveaway|live auction|live giveaway)$/i.test(s))return true;
    if(isLikelyProductSpecLine(s))return true;
    if(lower.includes("seller-signed creator"))return true;
    if(lower.startsWith("live:"))return true;
    if(lower.includes("seller sku"))return true;
    if(lower.includes("start chat"))return true;
    if(lower.includes("tiktok shipping"))return true;
    if(lower.includes("standard shipping"))return true;
    if(lower.includes("delivery deadline"))return true;
    if(lower.includes("awaiting shipment"))return true;
    if(lower.includes("awaiting collection"))return true;
    if(lower.includes("in transit"))return true;
    if(lower.includes("delivered"))return true;
    if(lower.includes("applepay")||lower.includes("paypal")||lower.includes("venmo"))return true;
    if(/\d{2}\/\d{2}\/\d{4}/.test(s))return true;
    if(/^\$?\d+(\.\d{2})?$/.test(s))return true;
    if(/^x\s*\d+$/i.test(s)||/^×\s*\d+$/i.test(s))return true;

    return false;
}

function isHardBadNoteValue(line){
    let s=stripPrintedMark(line);
    const lower=s.toLowerCase();

    if(!s)return true;
    if(s.length>120)return true;
    if(/^add note$/i.test(s))return true;
    if(/^edit note$/i.test(s))return true;
    if(/^seller note$/i.test(s)||/^note$/i.test(s))return true;
    if(/^order id\b/i.test(s)||/^577\d{15}$/.test(s))return true;
    if(isCanceledTextLine(s))return true;
    if(/^(live|auction|giveaway|live auction|live giveaway)$/i.test(s))return true;
    if(lower.includes("seller-signed creator"))return true;
    if(lower.startsWith("live:"))return true;
    if(lower.includes("seller sku"))return true;
    if(lower.includes("start chat"))return true;
    if(lower.includes("tiktok shipping"))return true;
    if(lower.includes("standard shipping"))return true;
    if(lower.includes("delivery deadline"))return true;
    if(lower.includes("awaiting shipment"))return true;
    if(lower.includes("awaiting collection"))return true;
    if(lower.includes("in transit"))return true;
    if(lower.includes("delivered"))return true;
    if(lower.includes("applepay")||lower.includes("paypal")||lower.includes("venmo"))return true;
    if(/\d{2}\/\d{2}\/\d{4}/.test(s))return true;
    if(/^\$?\d+(\.\d{2})?$/.test(s))return true;
    if(/^x\s*\d+$/i.test(s)||/^×\s*\d+$/i.test(s))return true;

    return false;
}

function normalizeNoteCandidate(line){
    let s=stripPrintedMark(line);
    const boundaries=[
        /\s+(add note|edit note)\b/i,
        /\s+seller sku\s*[:：]/i,
        /\s+start chat\b/i,
        /\s+tiktok shipping\b/i,
        /\s+standard shipping\b/i,
        /\s+delivery deadline\b/i,
        /\s+awaiting shipment\b/i,
        /\s+awaiting collection\b/i,
        /\s+in transit\b/i,
        /\s+delivered\b/i,
        /\s+shipped\b/i,
        /\s+on hold\b/i,
        /\s+canceled\b/i,
        /\s+cancelled\b/i,
        /\s+order id\s*[:：]/i,
        /\s+577\d{15}\b/i,
        /\s+\d{2}\/\d{2}\/\d{4}\b/
    ];
    let cut=s.length;

    boundaries.forEach(re=>{
        const m=re.exec(s);
        if(m&&m.index>=0)cut=Math.min(cut,m.index);
    });

    s=s.slice(0,cut).trim();
    return s;
}

function cleanExtractedNote(line,explicitNoteLabel){
    const s=normalizeNoteCandidate(line);
    if(explicitNoteLabel)return isHardBadNoteValue(s)?"":s;
    return isBadNoteValue(s)?"":s;
}

function collectSellerNoteContinuation(arr,start){
    const parts=[];

    for(let j=start;j<arr.length&&parts.length<3;j++){
        const line=normalizeNoteCandidate(arr[j]);

        if(!line)continue;
        if(isHardBadNoteValue(line))break;

        parts.push(line);
    }

    return parts.join(" ").trim();
}

function extractNote(t){
    const arr=lines(t);

    for(let i=0;i<arr.length;i++){
        const line=arr[i];
        let candidate=null;
        let explicitNoteLabel=false;

        if(/^seller note\s*[:：]/i.test(line)){
            candidate=line.replace(/^seller note\s*[:：]\s*/i,"").trim();
            if(!candidate)candidate=collectSellerNoteContinuation(arr,i+1);
            explicitNoteLabel=true;
        }else if(/\bseller note\s*[:：]/i.test(line)){
            candidate=line.replace(/^.*?\bseller note\s*[:：]\s*/i,"").trim();
            explicitNoteLabel=true;
        }else if(/^note\s*[:：]/i.test(line)){
            candidate=line.replace(/^note\s*[:：]\s*/i,"").trim();
            explicitNoteLabel=true;
        }else if(/\bnote\s*[:：]/i.test(line)){
            candidate=line.replace(/^.*?\bnote\s*[:：]\s*/i,"").trim();
            explicitNoteLabel=true;
        }else if(/^seller note$/i.test(line)&&arr[i+1]){
            candidate=collectSellerNoteContinuation(arr,i+1);
            explicitNoteLabel=true;
        }else if(/^note$/i.test(line)&&arr[i+1]){
            candidate=collectSellerNoteContinuation(arr,i+1);
            explicitNoteLabel=true;
        }

        if(candidate!==null){
            const clean=cleanExtractedNote(candidate,explicitNoteLabel);
            if(clean)return clean;
        }
    }

    return "";
}

function extractTracking(t){
    const txt=lines(t).join(" ");
    const out=[];
    const orderIds=new Set([...txt.matchAll(/\b577\d{15}\b/g)].map(x=>x[0]));

    function push(carrier,num){
        num=String(num||"").replace(/\s+/g,"").trim();
        if(!num)return;
        if(num.length<10)return;
        if(orderIds.has(num)||/^577\d{15}$/.test(num))return;

        if(!out.some(x=>x.number===num)){
            out.push({
                carrier:carrier||"",
                number:num
            });
        }
    }

    let m;
    const usps=/\bUSPS\b[\s,:#-]*([0-9]{12,34})/ig;

    while((m=usps.exec(txt))!==null){
        push("USPS",m[1]);
    }

    const longNums=[...txt.matchAll(/\b(9[0-9]{15,33}|[0-9]{18,34})\b/g)];

    longNums.forEach(x=>push("",x[1]));

    return out;
}

function parseMoneyAmountText(s){
    const m=String(s||"").match(/(?:US\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    if(!m)return 0;
    const n=Number(String(m[1]||"").replace(/,/g,""));
    return Number.isFinite(n)?n:0;
}

function formatMoneyAmount(n){
    n=Number(n||0);
    if(!Number.isFinite(n)||n<=0)return "$0.00";
    return "$"+n.toFixed(2);
}

function extractOrderAmount(t){
    const arr=lines(t);
    const paymentRe=/apple\s*pay|applepay|paypal|credit\/debit|credit card|debit card|venmo|klarna|afterpay|google pay|cash app/i;
    const skipRe=/save|saving|discount|coupon|shipping benefit|shipping fee|tax|refund|return|fee|adjustment|promotion|promo/i;
    const candidates=[];

    arr.forEach((line,i)=>{
        const amount=parseMoneyAmountText(line);

        if(!amount)return;
        if(skipRe.test(line))return;

        let score=0;
        const clean=norm(line);
        const prev=norm(arr[i-1]||"");
        const next=norm(arr[i+1]||"");
        const near=[prev,next,norm(arr[i-2]||""),norm(arr[i+2]||"")].join(" ");

        if(/^\s*(?:US\$|\$)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*$/i.test(clean))score+=80;
        if(paymentRe.test(next)||paymentRe.test(near))score+=70;
        if(/shipping|logistics/i.test(prev))score+=10;
        if(amount>=1)score+=10;
        if(amount>9999)score-=40;

        candidates.push({amount,score,index:i});
    });

    if(!candidates.length)return 0;

    candidates.sort((a,b)=>(b.score-a.score)||(b.index-a.index));

    return Number(candidates[0].amount.toFixed(2));
}

function extractOrderQuantity(t){
    const arr=lines(t);
    const candidates=[];

    arr.forEach((line,i)=>{
        const s=norm(line);
        const m=s.match(/^[x×]\s*(\d{1,4})$/i)||s.match(/^(\d{1,4})\s*[x×]$/i);

        if(!m)return;

        const qty=Number(m[1]||0);

        if(!Number.isFinite(qty)||qty<=0)return;
        if(qty>999)return;

        const near=[
            arr[i-3]||"",
            arr[i-2]||"",
            arr[i-1]||"",
            arr[i+1]||"",
            arr[i+2]||"",
            arr[i+3]||""
        ].join(" ").toLowerCase();

        let score=10;

        if(/seller sku|default|white|black|red|blue|green|grey|gray|small|medium|large|size|men|women|unisex/i.test(near))score+=20;
        if(/order id|start chat|payment|shipping|tracking|seller note|note/i.test(near))score-=5;

        candidates.push({qty,score,index:i});
    });

    if(!candidates.length)return 1;

    candidates.sort((a,b)=>(b.score-a.score)||(a.index-b.index));

    return candidates[0].qty||1;
}

function isBadTitleLine(line){
    const lower=String(line||"").toLowerCase().trim();

    return (
        !line ||
        line.length<4 ||
        /^order id/i.test(line) ||
        /^577\d{15}$/.test(line) ||
        lower==="live" ||
        lower==="auction" ||
        lower==="giveaway" ||
        lower==="combined shipment" ||
        lower==="+1" ||
        lower==="default" ||
        lower.includes("start chat") ||
        lower.includes("awaiting collection") ||
        lower.includes("awaiting shipment") ||
        lower.includes("in transit") ||
        lower.includes("delivered") ||
        lower.includes("delived") ||
        lower.includes("on hold") ||
        lower.includes("canceled") ||
        lower.includes("cancelled") ||
        lower.includes("cancled") ||
        lower.includes("tiktok shipping") ||
        lower.includes("standard shipping") ||
        lower.includes("delivery deadline") ||
        lower.includes("credit/debit card") ||
        lower.includes("venmo") ||
        lower.includes("applepay") ||
        lower.includes("print documents") ||
        lower.includes("view logistics") ||
        lower.includes("more actions") ||
        lower.includes("seller note") ||
        lower.includes("seller sku") ||
        lower.includes("seller-signed creator") ||
        lower.startsWith("live:") ||
        line.includes("$") ||
        line.includes("×") ||
        /^\+?\d+$/.test(line) ||
        /\d{2}\/\d{2}\/\d{4}/.test(line) ||
        /^usps/i.test(line)
    );
}

function isOrderTimeLine(line){
    return /\d{2}\/\d{2}\/\d{4}/.test(line)&&/\d{1,2}:\d{2}:\d{2}/.test(line);
}

function isBadTitleCandidate(arr,index){
    const line=arr[index]||"";
    const prev=norm(arr[index-1]||"").toLowerCase();
    const next=norm(arr[index+1]||"").toLowerCase();

    if(isBadTitleLine(line))return true;

    // TikTok puts buyer handle immediately before "Start chat"; that is never a product title.
    if(next==="start chat")return true;

    // In duplicated order headers, buyer handle can sit between order type and Start chat.
    if((prev==="live"||prev==="auction"||prev==="giveaway")&&/^[a-z0-9_.-]{3,40}$/i.test(norm(line)))return true;

    return false;
}

function extractTitle(t){
    const arr=lines(t);
    let timeIndex=-1;

    for(let i=0;i<arr.length;i++){
        if(isOrderTimeLine(arr[i])){
            timeIndex=i;
        }
    }

    if(timeIndex>=0){
        for(let i=timeIndex+1;i<arr.length;i++){
            const line=arr[i];
            const lower=line.toLowerCase();

            if(
                lower.includes("tiktok shipping") ||
                lower.includes("standard shipping") ||
                lower.includes("delivery deadline") ||
                lower.includes("seller note")
            ){
                break;
            }

            if(!isBadTitleCandidate(arr,i))return line;
        }
    }

    for(let i=0;i<arr.length;i++){
        const lower=arr[i].toLowerCase();

        if(lower.includes("seller sku")){
            for(let j=i-1;j>=0;j--){
                if(!isBadTitleCandidate(arr,j)){
                    const maybeSpec=arr[j];

                    if(
                        maybeSpec.toLowerCase()==="default" ||
                        /white|black|red|blue|green|grey|gray|men|women|unisex|\d+m|\d+w|\d+y|small|medium|large|size/i.test(maybeSpec)
                    ){
                        for(let k=j-1;k>=0;k--){
                            if(!isBadTitleCandidate(arr,k))return arr[k];
                        }
                    }

                    return maybeSpec;
                }
            }
        }
    }

    for(let i=0;i<arr.length;i++){
        if(!isBadTitleCandidate(arr,i))return arr[i];
    }

    return "未识别标题";
}

function extractTime(t){
    for(const line of lines(t)){
        if(isOrderTimeLine(line)){
            return line;
        }
    }

    return "";
}

function infoFromBlock(block){
    const rawNote=extractNote(block.text);
    const orderType=extractOrderType(block);
    const status=extractOrderStatus(block.text);
    const orderTime=extractTime(block.text);
    const trackingList=extractTracking(block.text);
    const gmv=extractOrderAmount(block.text);
    const quantity=extractOrderQuantity(block.text);

    return {
        order:block.order,
        shortId:block.shortId,
        title:extractTitle(block.text),
        time:orderTime,
        orderDate:orderDateOnly(orderTime),
        orderDateValue:parseOrderDateValue(orderTime),
        note:rawNote,
        cleanNote:stripPrintedMark(rawNote),
        orderType:orderType,
        orderStatus:status,
        isCanceled:status==="Canceled",
        shouldPrint:!!orderType,
        trackingList:trackingList,
        trackingText:trackingList.map(x=>(x.carrier?x.carrier+" ":"")+x.number).join(", "),
        quantity:quantity,
        qty:quantity,
        gmv:gmv,
        amount:gmv,
        gmvText:gmv?formatMoneyAmount(gmv):"",
        rawText:block.text
    };
}

function getSeen(){
    return new Set(getJson(SEEN_KEY,[]));
}

function saveSeen(s){
    setJson(SEEN_KEY,[...s].slice(-8000));
}

function markSeen(id){
    const s=getSeen();
    s.add(id);
    saveSeen(s);
}

function getLastNote(id){
    return stripPrintedMark(getJson(NOTE_KEY,{})[id]||"");
}

function saveNote(id,note){
    const s=getJson(NOTE_KEY,{});
    s[id]=stripPrintedMark(note);
    setJson(NOTE_KEY,s);
}

function markCurrentPageAsSeenForListening(){
    const blocks=getOrderBlocks();
    const seen=getSeen();
    let count=0;

    blocks.forEach(block=>{
        const info=infoFromBlock(block);
        seen.add(info.order);

        if(info.shouldPrint&&norm(effectiveNote(info))){
            saveNote(info.order,effectiveNote(info));
            count++;
        }
    });

    saveSeen(seen);
    return count;
}

function isLocked(id){
    const l=getJson(LOCK_KEY,{});
    return l[id]&&Date.now()-l[id]<LOCK_MS;
}

function lock(id){
    const l=getJson(LOCK_KEY,{});
    l[id]=Date.now();
    setJson(LOCK_KEY,l);
}

function getHistoryAggregate(id){
    const h=getJson(HISTORY_KEY,{});
    let printCount=0;
    let lastItem=null;
    let lastDate="";
    let lastPrintedValue=0;
    let allItems=[];

    Object.keys(h).forEach(date=>{
        const day=h[date]||{};
        const item=day[id];

        if(!item)return;

        allItems.push({date,item});
        printCount+=Number(item.printCount||0);

        const v=parseAnyDateValue(item.printedAt||date);

        if(v>=lastPrintedValue){
            lastPrintedValue=v;
            lastItem=item;
            lastDate=date;
        }
    });

    return {
        order:id,
        printCount,
        lastItem,
        lastDate,
        note:stripPrintedMark(lastItem&&lastItem.note?lastItem.note:""),
        systemNote:stripPrintedMark(lastItem&&lastItem.systemNote?lastItem.systemNote:""),
        orderStatus:lastItem&&lastItem.orderStatus?lastItem.orderStatus:"",
        orderType:lastItem&&lastItem.orderType?lastItem.orderType:"",
        title:lastItem&&lastItem.title?lastItem.title:"",
        time:lastItem&&lastItem.time?lastItem.time:"",
        printedAt:lastItem&&lastItem.printedAt?lastItem.printedAt:"",
        latestReviewStatus:lastItem&&lastItem.latestReviewStatus?lastItem.latestReviewStatus:"",
        latestReviewTrackingText:lastItem&&lastItem.latestReviewTrackingText?lastItem.latestReviewTrackingText:"",
        latestReviewAt:lastItem&&lastItem.latestReviewAt?lastItem.latestReviewAt:"",
        latestReviewAtIso:lastItem&&lastItem.latestReviewAtIso?lastItem.latestReviewAtIso:"",
        latestReviewAtMs:lastItem&&lastItem.latestReviewAtMs?lastItem.latestReviewAtMs:0,
        latestReviewOperatorName:lastItem&&lastItem.latestReviewOperatorName?lastItem.latestReviewOperatorName:"",
        latestReviewScanId:lastItem&&lastItem.latestReviewScanId?lastItem.latestReviewScanId:"",
        latestReviewPage:lastItem&&lastItem.latestReviewPage?lastItem.latestReviewPage:0,
        allItems
    };
}

function getTotalPrintCount(id){
    return getHistoryAggregate(id).printCount;
}

function updateHistoryOrder(orderId,updates,reason){
    const h=getJson(HISTORY_KEY,{});
    const agg=getHistoryAggregate(orderId);
    const d=agg.lastDate||today();

    if(!h[d])h[d]={};

    if(!h[d][orderId]){
        h[d][orderId]={
            order:orderId,
            shortId:String(orderId).slice(-6),
            title:updates.title||"",
            time:updates.time||"",
            note:stripPrintedMark(updates.note||""),
            systemNote:stripPrintedMark(updates.systemNote||updates.note||""),
            orderType:updates.orderType||"",
            orderStatus:updates.orderStatus||"",
            printedAt:"",
            printCount:0,
            logs:[]
        };
    }

    const item=h[d][orderId];
    const oldNote=stripPrintedMark(item.note||"");
    const oldStatus=item.orderStatus||"";

    if(updates.title!==undefined)item.title=updates.title;
    if(updates.time!==undefined)item.time=updates.time;
    if(updates.note!==undefined)item.note=stripPrintedMark(updates.note);
    if(updates.systemNote!==undefined)item.systemNote=stripPrintedMark(updates.systemNote);
    if(updates.orderType!==undefined)item.orderType=updates.orderType;
    if(updates.orderStatus!==undefined)item.orderStatus=updates.orderStatus;

    if(!Array.isArray(item.logs))item.logs=[];

    item.logs.push({
        printedAt:now(),
        reason:reason||"复核更新历史",
        note:item.note||"",
        oldNote,
        newNote:item.note||"",
        oldStatus,
        newStatus:item.orderStatus||""
    });

    setJson(HISTORY_KEY,h);
}

function saveReviewInfoToLocalHistory(infos,scanId,page){
    if(!Array.isArray(infos)||!infos.length)return {count:0,changed:0};

    const h=getJson(HISTORY_KEY,{});
    const meta=getOperatorMeta();
    const reviewedAt=now();
    const reviewedAtIso=new Date().toISOString();
    const reviewedAtMs=Date.now();
    let count=0;
    let changed=0;

    function findHistoryDate(orderId){
        let lastDate="";
        let lastValue=0;

        Object.keys(h).forEach(date=>{
            const item=h[date]&&h[date][orderId];

            if(!item)return;

            const v=parseAnyDateValue(item.printedAt||date);

            if(v>=lastValue){
                lastValue=v;
                lastDate=date;
            }
        });

        return lastDate;
    }

    infos.forEach(info=>{
        if(!info||!info.order)return;

        const orderId=String(info.order);
        const d=findHistoryDate(orderId)||today();

        if(!h[d])h[d]={};

        if(!h[d][orderId]){
            h[d][orderId]={
                order:orderId,
                shortId:info.shortId||orderId.slice(-6),
                title:info.title||"",
                time:info.time||"",
                note:"",
                systemNote:"",
                orderType:info.orderType||"",
                orderStatus:"",
                quantity:Number(info.quantity||info.qty||1)||1,
                gmv:Number(info.gmv||info.amount||0)||0,
                gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
                latestReviewOperatorName:meta.operatorName||"",
                printedAt:"",
                printCount:0,
                logs:[]
            };
        }

        const item=h[d][orderId];
        const nextStatus=info.orderStatus||"Unknown";
        const nextTracking=info.trackingText||"";
        const oldStatus=item.latestReviewStatus||"";
        const oldTracking=item.latestReviewTrackingText||"";
        const hadReviewSnapshot=!!(item.latestReviewAt||item.latestReviewStatus||item.latestReviewTrackingText);
        const changedFields=[];

        if(oldStatus!==nextStatus){
            changedFields.push({field:"status",oldValue:oldStatus||"无",newValue:nextStatus||"无"});
        }

        if(oldTracking!==nextTracking){
            changedFields.push({field:"tracking",oldValue:oldTracking||"无/未识别",newValue:nextTracking||"无/未识别"});
        }

        if(info.shortId)item.shortId=info.shortId;
        if(info.title)item.title=info.title;
        if(info.time)item.time=info.time;
        if(info.orderType)item.orderType=info.orderType;
        item.quantity=Number(info.quantity||info.qty||item.quantity||1)||1;
        item.gmv=Number(info.gmv||info.amount||item.gmv||0)||0;
        item.gmvText=info.gmvText||formatMoneyAmount(item.gmv||0);

        item.latestReviewStatus=nextStatus;
        item.latestReviewTrackingText=nextTracking;
        item.latestReviewAt=reviewedAt;
        item.latestReviewAtIso=reviewedAtIso;
        item.latestReviewAtMs=reviewedAtMs;
        item.latestReviewOperatorName=meta.operatorName||"";
        item.latestReviewScanId=scanId||"";
        item.latestReviewPage=Number(page||0);

        if(!Array.isArray(item.logs))item.logs=[];

        if(hadReviewSnapshot&&changedFields.length){
            item.logs.push({
                printedAt:reviewedAt,
                reason:"复核扫描更新最新状态/快递单号",
                reviewOnly:true,
                changes:changedFields,
                oldStatus,
                newStatus:nextStatus,
                oldTracking,
                newTracking:nextTracking,
                operatorName:meta.operatorName||"",
                latestReviewOperatorName:meta.operatorName||"",
                scanId:scanId||"",
                page:Number(page||0)
            });
            changed++;
        }

        count++;
    });

    setJson(HISTORY_KEY,h);
    return {count,changed};
}

function canPrintInfo(info){
    if(!info)return false;
    if(!info.shouldPrint)return false;
    if(info.isCanceled)return false;
    if(!norm(effectiveNote(info)))return false;
    return true;
}

function cannotPrintInfo(info){
    return !canPrintInfo(info);
}

function saveHistory(id,info,reason,extra){
    extra=extra||{};

    const h=getJson(HISTORY_KEY,{});
    const d=today();
    const cleanNote=effectiveNote(info);
    const meta=getOperatorMeta();

    if(!h[d])h[d]={};

    if(!h[d][id]){
        h[d][id]={
            order:id,
            shortId:info.shortId,
            title:info.title,
            time:info.time,
            note:cleanNote,
            systemNote:info.note||"",
            orderType:info.orderType,
            orderStatus:info.orderStatus||"",
            quantity:Number(info.quantity||info.qty||1)||1,
            gmv:Number(info.gmv||info.amount||0)||0,
            gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
            operatorName:meta.operatorName||"",
            latestOperatorName:meta.operatorName||"",
            printedAt:now(),
            printCount:1,
            logs:[]
        };
    }else{
        h[d][id].printCount=(h[d][id].printCount||1)+1;
        h[d][id].title=info.title;
        h[d][id].time=info.time;
        h[d][id].note=cleanNote;
        h[d][id].systemNote=info.note||"";
        h[d][id].orderType=info.orderType;
        h[d][id].orderStatus=info.orderStatus||h[d][id].orderStatus||"";
        h[d][id].quantity=Number(info.quantity||info.qty||h[d][id].quantity||1)||1;
        h[d][id].gmv=Number(info.gmv||info.amount||h[d][id].gmv||0)||0;
        h[d][id].gmvText=info.gmvText||formatMoneyAmount(h[d][id].gmv||0);
        h[d][id].operatorName=h[d][id].operatorName||meta.operatorName||"";
        h[d][id].latestOperatorName=meta.operatorName||h[d][id].latestOperatorName||h[d][id].operatorName||"";
        h[d][id].printedAt=now();
    }

    if(!Array.isArray(h[d][id].logs))h[d][id].logs=[];

    h[d][id].logs.push({
        printedAt:now(),
        note:cleanNote,
        systemNote:info.note||"",
        oldNote:extra.oldNote||"",
        newNote:extra.newNote||cleanNote,
        reason:reason,
        orderStatus:info.orderStatus||"",
        quantity:Number(info.quantity||info.qty||1)||1,
        gmv:Number(info.gmv||info.amount||0)||0,
        gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
        operatorName:meta.operatorName||"",
        latestOperatorName:meta.operatorName||""
    });

    setJson(HISTORY_KEY,h);
    saveHistoryCloud(id,info,reason,extra);
    updateStablePanelSoon();
}

function qrAppendBits(out,value,len){
    for(let i=len-1;i>=0;i--)out.push((value>>>i)&1);
}

function ensureLocalQrGf(){
    if(tkLocalQrGfExp&&tkLocalQrGfLog)return;

    const exp=new Array(512);
    const log=new Array(256);
    let x=1;

    for(let i=0;i<255;i++){
        exp[i]=x;
        log[x]=i;
        x<<=1;
        if(x&0x100)x^=0x11d;
    }

    for(let i=255;i<512;i++)exp[i]=exp[i-255];

    tkLocalQrGfExp=exp;
    tkLocalQrGfLog=log;
}

function qrGfMul(a,b){
    if(!a||!b)return 0;
    ensureLocalQrGf();
    return tkLocalQrGfExp[tkLocalQrGfLog[a]+tkLocalQrGfLog[b]];
}

function qrRsGenerator(degree){
    ensureLocalQrGf();
    let gen=[1];

    for(let i=0;i<degree;i++){
        const next=new Array(gen.length+1).fill(0);
        const root=tkLocalQrGfExp[i];

        for(let j=0;j<gen.length;j++){
            next[j]^=gen[j];
            next[j+1]^=qrGfMul(gen[j],root);
        }

        gen=next;
    }

    return gen;
}

function qrRsRemainder(data,degree){
    const gen=qrRsGenerator(degree);
    const rem=new Array(degree).fill(0);

    data.forEach(byte=>{
        const factor=byte^rem.shift();
        rem.push(0);

        for(let i=0;i<degree;i++){
            rem[i]^=qrGfMul(gen[i+1],factor);
        }
    });

    return rem;
}

function qrFormatBits(ecLevelBits,mask){
    const generator=0x537;
    let data=((ecLevelBits&3)<<3)|(mask&7);
    let rem=data<<10;

    for(let i=14;i>=10;i--){
        if((rem>>>i)&1)rem^=generator<<(i-10);
    }

    return ((data<<10)|rem)^0x5412;
}

function makeNumericOrderQrSvgDataUrl(text){
    text=String(text||"");
    if(!/^\d{1,41}$/.test(text))throw new Error("本地二维码只支持41位以内纯数字");

    const size=21;
    const matrix=Array.from({length:size},()=>Array(size).fill(false));
    const reserved=Array.from({length:size},()=>Array(size).fill(false));

    function inBounds(x,y){return x>=0&&y>=0&&x<size&&y<size;}
    function setModule(x,y,dark,isReserved){
        if(!inBounds(x,y))return;
        matrix[y][x]=!!dark;
        if(isReserved)reserved[y][x]=true;
    }
    function reserveModule(x,y){
        if(!inBounds(x,y))return;
        reserved[y][x]=true;
    }
    function drawFinder(x,y){
        for(let dy=-1;dy<=7;dy++){
            for(let dx=-1;dx<=7;dx++){
                setModule(x+dx,y+dy,false,true);
            }
        }
        for(let dy=0;dy<7;dy++){
            for(let dx=0;dx<7;dx++){
                const dark=dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4);
                setModule(x+dx,y+dy,dark,true);
            }
        }
    }
    function reserveFormat(){
        for(let i=0;i<=5;i++){reserveModule(8,i);reserveModule(i,8);}
        reserveModule(8,7);
        reserveModule(8,8);
        reserveModule(7,8);
        for(let i=0;i<8;i++)reserveModule(size-1-i,8);
        for(let i=8;i<15;i++)reserveModule(8,size-15+i);
    }
    function setFormat(){
        const bits=qrFormatBits(1,0); // Level L, mask 0.
        const bit=i=>((bits>>>i)&1)!==0;

        for(let i=0;i<=5;i++)setModule(8,i,bit(i),true);
        setModule(8,7,bit(6),true);
        setModule(8,8,bit(7),true);
        setModule(7,8,bit(8),true);
        for(let i=9;i<15;i++)setModule(14-i,8,bit(i),true);

        for(let i=0;i<8;i++)setModule(size-1-i,8,bit(i),true);
        for(let i=8;i<15;i++)setModule(8,size-15+i,bit(i),true);
        setModule(8,size-8,true,true);
    }

    drawFinder(0,0);
    drawFinder(size-7,0);
    drawFinder(0,size-7);
    reserveFormat();

    for(let i=8;i<=size-9;i++){
        setModule(i,6,i%2===0,true);
        setModule(6,i,i%2===0,true);
    }

    setModule(8,size-8,true,true);

    const dataBits=[];
    qrAppendBits(dataBits,0x1,4);
    qrAppendBits(dataBits,text.length,10);

    for(let i=0;i<text.length;i+=3){
        const part=text.slice(i,i+3);
        qrAppendBits(dataBits,Number(part),part.length===3?10:(part.length===2?7:4));
    }

    const dataCodewords=19;
    const capacityBits=dataCodewords*8;
    const terminator=Math.min(4,capacityBits-dataBits.length);

    for(let i=0;i<terminator;i++)dataBits.push(0);
    while(dataBits.length%8)dataBits.push(0);

    const data=[];
    for(let i=0;i<dataBits.length;i+=8){
        let byte=0;
        for(let j=0;j<8;j++)byte=(byte<<1)|dataBits[i+j];
        data.push(byte);
    }

    const pads=[0xec,0x11];
    let padIndex=0;
    while(data.length<dataCodewords)data.push(pads[(padIndex++)&1]);

    const codewords=data.concat(qrRsRemainder(data,7));
    const bits=[];

    codewords.forEach(byte=>qrAppendBits(bits,byte,8));

    let bitIndex=0;
    let upward=true;

    for(let right=size-1;right>=1;right-=2){
        if(right===6)right--;

        for(let vert=0;vert<size;vert++){
            const y=upward?size-1-vert:vert;

            for(let dx=0;dx<2;dx++){
                const x=right-dx;
                if(reserved[y][x])continue;

                let dark=bitIndex<bits.length?!!bits[bitIndex++]:false;

                if((x+y)%2===0)dark=!dark;
                matrix[y][x]=dark;
            }
        }

        upward=!upward;
    }

    setFormat();

    const quiet=4;
    const view=size+quiet*2;
    let path="";

    for(let y=0;y<size;y++){
        for(let x=0;x<size;x++){
            if(matrix[y][x])path+="M"+(x+quiet)+" "+(y+quiet)+"h1v1h-1z";
        }
    }

    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+view+' '+view+'" shape-rendering="crispEdges"><rect width="'+view+'" height="'+view+'" fill="#fff"/><path d="'+path+'" fill="#000"/></svg>';
    return "data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg);
}

function qrData(id){
    id=String(id||"");
    if(/^\d{1,41}$/.test(id)){
        try{
            return makeNumericOrderQrSvgDataUrl(id);
        }catch(localQrError){
            console.warn("[TikTok Printer] 本地二维码生成失败，改用备用二维码",localQrError);
        }
    }

    if(typeof QRCode==="undefined"){
        return QR_FALLBACK_API+encodeURIComponent(id);
    }

    const temp=document.createElement("div");
    temp.style.position="fixed";
    temp.style.left="-9999px";
    document.body.appendChild(temp);

    new QRCode(temp,{
        text:id,
        width:180,
        height:180,
        correctLevel:QRCode.CorrectLevel.M
    });

    const canvas=temp.querySelector("canvas");
    const img=temp.querySelector("img");
    const data=canvas?canvas.toDataURL("image/png"):(img?img.src:"");

    temp.remove();

    return data;
}

function validatePrintableInfo(info,opt){
    opt=opt||{};

    if(!info||!info.shouldPrint){
        return {ok:false,msg:"橱窗订单，跳过"};
    }

    const printableNote=effectiveNote(info);

    if(!norm(printableNote)){
        return {ok:false,msg:info.orderType+" 订单 "+info.shortId+" Note为空，未打印"};
    }

    if(info.isCanceled&&!opt.forceCanceled){
        return {ok:false,msg:"订单 "+info.shortId+" 已Canceled，未打印"};
    }

    if(!opt.force&&isLocked(info.order)){
        return {ok:false,msg:"防重复：订单 "+info.shortId+" 30秒内已打印过，跳过"};
    }

    return {ok:true,note:printableNote};
}

function markPrintedBeforeOutput(info,reason,opt){
    opt=opt||{};

    const check=validatePrintableInfo(info,opt);

    if(!check.ok){
        updateStatus(check.msg);
        updateReviewStatus(check.msg);
        return null;
    }

    lock(info.order);
    saveNote(info.order,check.note);
    markSeen(info.order);
    saveHistory(
        info.order,
        Object.assign({},info,{cleanNote:check.note}),
        reason||"打印",
        opt.historyExtra||{}
    );

    return Object.assign({},info,{cleanNote:check.note,note:check.note});
}

function isNumericNote(note){
    const s=stripPrintedMark(note);
    return /^[0-9.\-\/\s]+$/.test(s)&&/\d/.test(s);
}

function extractDigitsFromNote(note){
    const s=stripPrintedMark(note);
    const m=s.match(/[0-9][0-9.\-\/\s]*/g);

    if(!m)return "";

    return m.join(" ").trim();
}

function makeLabelHtml(info){
    const printableNote=effectiveNote(info);
    const qr=qrData(info.order);
    const timeText=formatTimeNoYear(info.time);
    const digitsText=extractDigitsFromNote(printableNote);
    const numeric=isNumericNote(printableNote);
    const showRightDigits=!!(digitsText&&!numeric);
    const noteClass=numeric?"note numericNote":"note";

    return `
<div class="label">
<img class="qr" src="${qr}">
<div class="row id"><span class="fullid">${esc(info.order.slice(0,-6))}</span><span class="last6inline">${esc(info.shortId)}</span></div>
<div class="row title">${esc(info.title)}</div>
<div class="row time">${esc(timeText)}</div>
<div class="${noteClass}" style="top:20mm;height:9mm;">
    <span class="noteMain">Note: ${esc(printableNote)}</span>
    ${showRightDigits?`<span class="noteDigitsInline">${esc(digitsText)}</span>`:""}
</div>
</div>`;
}

function openPrintFrameWithLabels(labelsHtml){
    const frame=document.createElement("iframe");
    frame.style.position="fixed";
    frame.style.width="1px";
    frame.style.height="1px";
    frame.style.border="0";
    frame.style.left="-9999px";
    frame.style.top="0";

    document.body.appendChild(frame);

    const doc=frame.contentWindow.document;

    doc.open();

    doc.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page{size:50mm 30mm;margin:0;}
html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.label{width:50mm;height:30mm;position:relative;overflow:hidden;font-family:Arial,"Microsoft YaHei",sans-serif;page-break-after:always;break-after:page;}
.label:last-child{page-break-after:auto;break-after:auto;}
.qr{position:absolute;left:3mm;top:3.8mm;width:16mm;height:16mm;display:block;background:#fff;image-rendering:pixelated;image-rendering:crisp-edges;}
.row{position:absolute;overflow:hidden;text-align:left;font-weight:bold;line-height:1.08;}
.id{left:19.5mm;right:0.2mm;top:0.8mm;height:6mm;font-size:5.2pt;white-space:nowrap;}
.fullid{font-size:5.2pt;font-weight:bold;}
.last6inline{font-size:9.8pt;font-weight:900;}
.title{left:20.2mm;right:1.2mm;top:7mm;height:7.8mm;font-size:5.7pt;line-height:1.08;}
.time{left:20.2mm;right:1.2mm;top:15.5mm;height:4mm;font-size:6.2pt;white-space:nowrap;}
.note{position:absolute;overflow:hidden;text-align:left;left:2.8mm;right:1.2mm;display:flex;align-items:flex-end;justify-content:space-between;gap:1.5mm;font-size:8.8pt;font-weight:900;line-height:1.03;word-break:break-word;font-family:"Arial Black","Consolas","Courier New",Arial,sans-serif;letter-spacing:.18mm;}
.noteMain{flex:1 1 auto;overflow:hidden;word-break:break-word;}
.noteDigitsInline{flex:0 0 auto;font-size:13pt;line-height:.95;font-weight:900;font-family:"Consolas","Courier New",monospace;letter-spacing:.45mm;white-space:nowrap;padding-left:1mm;}
.numericNote{top:20.1mm !important;height:8.8mm !important;font-size:13pt;line-height:1.05;letter-spacing:.55mm;font-family:"Consolas","Courier New",monospace;}
.numericNote .noteMain{font-size:13pt;line-height:1.05;letter-spacing:.55mm;font-family:"Consolas","Courier New",monospace;}
</style>
</head>
<body>
${labelsHtml}
<script>
function waitForImagesThen(fn){
    var imgs=Array.prototype.slice.call(document.images||[]);
    var pending=imgs.filter(function(img){return !img.complete;});
    var done=false;
    function finish(){
        if(done)return;
        done=true;
        fn();
    }
    if(!pending.length){
        finish();
        return;
    }
    var left=pending.length;
    pending.forEach(function(img){
        var one=function(){
            left--;
            if(left<=0)finish();
        };
        img.onload=one;
        img.onerror=one;
    });
    setTimeout(finish,2500);
}
window.onload=function(){
    waitForImagesThen(function(){
        window.focus();
        setTimeout(function(){
            window.print();
            setTimeout(function(){
                if(frameElement){
                    frameElement.remove();
                }
            },2000);
        },120);
    });
};
<\/script>
</body>
</html>
`);

    doc.close();
}

function printLabel(info,reason,opt){
    opt=opt||{};

    if(!requireDirectPrintForAutoPrint(opt))return false;

    const printedInfo=markPrintedBeforeOutput(info,reason,opt);

    if(!printedInfo)return false;

    openPrintFrameWithLabels(makeLabelHtml(printedInfo));
    updateStatus("已打印："+printedInfo.orderType+" ID "+printedInfo.shortId);

    return true;
}

function printLabelsBatch(infos,reason,opt){
    opt=opt||{};

    const valid=[];
    const skipped=[];

    infos.forEach(info=>{
        const printedInfo=markPrintedBeforeOutput(info,reason,opt);

        if(printedInfo)valid.push(printedInfo);
        else if(info&&info.order)skipped.push(info.shortId);
    });

    if(!valid.length){
        updateStatus("没有可打印的订单。");
        updateReviewStatus("没有可打印的订单。");
        return false;
    }

    openPrintFrameWithLabels(valid.map(makeLabelHtml).join("\n"));

    const msg=
        "已批量发送打印任务："+valid.length+
        " 个订单"+
        (skipped.length?"；跳过 "+skipped.length+" 个："+skipped.join(", "):"");

    updateStatus(msg);
    updateReviewStatus(msg);

    return true;
}

function enqueuePrint(info,reason,opt){
    opt=opt||{};

    if(!info||!info.order)return;

    const exists=printQueue.some(x=>x.info&&x.info.order===info.order);

    if(exists)return;

    printQueue.push({
        info,
        reason,
        opt
    });

    updateStatus("已加入打印队列："+info.shortId+"；当前队列 "+printQueue.length+" 个");

    processPrintQueue();
}

function processPrintQueue(){
    if(printingQueue)return;
    if(!printQueue.length)return;

    printingQueue=true;

    const item=printQueue.shift();

    printLabel(item.info,item.reason,item.opt||{});

    setTimeout(function(){
        printingQueue=false;
        processPrintQueue();
    },PRINT_DELAY_MS);
}function safeAttr(el,name){
    try{return norm(el.getAttribute(name)||"");}catch(e){return"";}
}

function isInsideScriptUI(el){
    const ids=["tiktok-auto-print-panel-windows","tk-print-floating-window","tk-review-window","tk-bind-tip"];
    return ids.some(id=>{
        const x=document.getElementById(id);
        return x&&x.contains(el);
    });
}

function isVisibleElement(el){
    if(!el||!el.getBoundingClientRect)return false;
    if(isInsideScriptUI(el))return false;
    const rect=el.getBoundingClientRect();
    const style=window.getComputedStyle(el);
    return rect.width>0 && rect.height>0 && style.display!=="none" && style.visibility!=="hidden" && rect.bottom>=0 && rect.right>=0 && rect.top<=window.innerHeight && rect.left<=window.innerWidth;
}

function getInteractiveElement(target){
    if(!target)return null;
    if(target.closest)return target.closest("button,[role='button'],a,[tabindex]")||target.closest("div,span,li");
    return target;
}

function getElementIndexInParent(el){
    if(!el||!el.parentElement)return -1;
    return Array.from(el.parentElement.children).indexOf(el);
}

function getElementPath(el){
    if(!el)return "";
    const parts=[];
    let cur=el;
    for(let i=0;i<5&&cur&&cur!==document.body;i++){
        let part=cur.tagName?cur.tagName.toLowerCase():"";
        const cls=norm(cur.className||"");
        if(cls)part+="."+cls.split(/\s+/).slice(0,4).join(".");
        const role=safeAttr(cur,"role");
        const aria=safeAttr(cur,"aria-label");
        const title=safeAttr(cur,"title");
        if(role)part+="[role="+role+"]";
        if(aria)part+="[aria="+aria.slice(0,30)+"]";
        if(title)part+="[title="+title.slice(0,30)+"]";
        parts.unshift(part);
        cur=cur.parentElement;
    }
    return parts.join(">");
}

function getSvgSignature(el){
    try{
        return Array.from((el||document).querySelectorAll("svg path,svg circle,svg polyline,svg line,svg rect"))
            .map(x=>
                safeAttr(x,"d")||
                safeAttr(x,"points")||
                safeAttr(x,"cx")+safeAttr(x,"cy")+safeAttr(x,"r")||
                safeAttr(x,"x1")+safeAttr(x,"y1")+safeAttr(x,"x2")+safeAttr(x,"y2")||
                safeAttr(x,"x")+safeAttr(x,"y")+safeAttr(x,"width")+safeAttr(x,"height")
            )
            .filter(Boolean)
            .join("|")
            .slice(0,800);
    }catch(e){return "";}
}

function makeFingerprint(target,x,y,label){
    const el=getInteractiveElement(target)||target;
    const rect=el.getBoundingClientRect?el.getBoundingClientRect():{left:x,top:y,width:0,height:0};
    const parent=el.parentElement;
    const parentRect=parent&&parent.getBoundingClientRect?parent.getBoundingClientRect():null;

    return {
        label:label||"",
        x:Math.round(x),
        y:Math.round(y),
        tagName:el.tagName||"",
        role:safeAttr(el,"role"),
        aria:safeAttr(el,"aria-label"),
        title:safeAttr(el,"title"),
        text:norm(el.innerText||el.textContent||""),
        className:norm(String(el.className||"")),
        id:safeAttr(el,"id"),
        path:getElementPath(el),
        indexInParent:getElementIndexInParent(el),
        width:Math.round(rect.width||0),
        height:Math.round(rect.height||0),
        centerRatioX:window.innerWidth?(rect.left+rect.width/2)/window.innerWidth:0,
        centerRatioY:window.innerHeight?(rect.top+rect.height/2)/window.innerHeight:0,
        parentClassName:parent?norm(String(parent.className||"")):"",
        parentText:parent?norm(parent.innerText||parent.textContent||"").slice(0,160):"",
        parentPath:parent?getElementPath(parent):"",
        parentWidth:parentRect?Math.round(parentRect.width||0):0,
        parentHeight:parentRect?Math.round(parentRect.height||0):0,
        svgSignature:getSvgSignature(el),
        savedAt:now(),
        version:"8.8"
    };
}

//-----------------右下浮窗面板-----------------
function isOldMainPanelVersion(p){
    return !!(p&&!String(p.textContent||"").includes("v"+SCRIPT_VERSION));
}

function ensureMainPanelPositionStyle(){
    try{
        if(document.getElementById("tk-main-panel-position-style"))return;
        const st=document.createElement("style");
        st.id="tk-main-panel-position-style";
        st.textContent=[
            "#tiktok-auto-print-panel-windows{position:fixed!important;left:calc(100vw - 380px)!important;right:auto!important;bottom:20px!important;top:auto!important;width:360px!important;max-width:calc(100vw - 40px)!important;z-index:2147483647!important;visibility:visible!important;opacity:1!important;}",
            "#tiktok-auto-print-panel-windows.tk-main-panel-collapsed{left:calc(100vw - 170px)!important;width:150px!important;}",
            "#tk-stable-panel-v101{display:none!important;visibility:hidden!important;}"
        ].join("\n");
        (document.head||document.documentElement).appendChild(st);
    }catch(e){}
}

function cleanupLegacyMainPanels(){
    try{
        Array.from(document.querySelectorAll("#tk-stable-panel-v101,[data-tk-printer-panel='old-main']")).forEach(el=>{
            try{el.remove();}catch(e){}
        });
        Array.from(document.querySelectorAll("div")).forEach(el=>{
            if(el.id==="tiktok-auto-print-panel-windows")return;
            const text=String(el.textContent||"");
            const looksLikePrinterPanel=(text.includes("WINDOWS电脑 TikTok标签")||text.includes("WINDOWS PC TikTok Labels"))&&/v\d+\.\d+/.test(text);
            const hasKnownActions=text.includes("启动监听")||text.includes("Start Listener")||text.includes("查看历史")||text.includes("View History");
            if(looksLikePrinterPanel&&hasKnownActions){
                try{el.remove();}catch(e){}
            }
        });
    }catch(e){}
}

function getMainPanelCollapsed(){
    return localStorage.getItem(MAIN_PANEL_COLLAPSED_KEY)==="1";
}

function setMainPanelCollapsed(v){
    localStorage.setItem(MAIN_PANEL_COLLAPSED_KEY,v?"1":"0");
}

function getSavedMainPanelPosition(){
    try{
        const data=JSON.parse(localStorage.getItem(MAIN_PANEL_POS_KEY)||"null");
        if(!data||!Number.isFinite(Number(data.left))||!Number.isFinite(Number(data.top)))return null;
        return {left:Number(data.left),top:Number(data.top),savedAt:Number(data.savedAt||0)};
    }catch(e){
        return null;
    }
}

function saveMainPanelPosition(p){
    try{
        if(!p||!p.getBoundingClientRect)return;
        const rect=p.getBoundingClientRect();
        localStorage.setItem(MAIN_PANEL_POS_KEY,JSON.stringify({
            left:Math.round(rect.left),
            top:Math.round(rect.top),
            savedAt:Date.now()
        }));
    }catch(e){}
}

function applySavedMainPanelPosition(p){
    try{
        const pos=getSavedMainPanelPosition();
        if(!p||!pos)return false;
        const vp=getViewportBox();
        const rect=p.getBoundingClientRect?p.getBoundingClientRect():{width:getMainPanelCollapsed()?150:360,height:getMainPanelCollapsed()?44:320};
        const width=Math.min(rect.width||p.offsetWidth||(getMainPanelCollapsed()?150:360),Math.max(120,(vp.width||360)-40));
        const height=Math.min(rect.height||p.offsetHeight||(getMainPanelCollapsed()?44:320),Math.max(60,(vp.height||600)-40));
        const left=Math.min(Math.max(vp.left+8,pos.left),Math.max(vp.left+8,vp.right-width-8));
        const top=Math.min(Math.max(vp.top+8,pos.top),Math.max(vp.top+8,vp.bottom-height-8));
        p.style.setProperty("left",Math.round(left)+"px","important");
        p.style.setProperty("top",Math.round(top)+"px","important");
        p.style.setProperty("right","auto","important");
        p.style.setProperty("bottom","auto","important");
        p.style.setProperty("transform","none","important");
        return true;
    }catch(e){
        return false;
    }
}

function applyMainPanelCollapsedState(p,collapsed){
    if(!p)return;
    const body=p.querySelector("#panelBody");
    const bar=p.querySelector("#stableStatusBar");
    const btn=p.querySelector("#togglePanelMiniBtn");
    const title=p.querySelector("#panelHeader span");
    if(body)body.style.display=collapsed?"none":"block";
    if(bar)bar.style.display=collapsed?"none":"block";
    if(btn)btn.textContent=collapsed?tr("expand"):tr("collapse");
    if(title)title.textContent=collapsed?(tr("collapsedTitle")+" v"+SCRIPT_VERSION):getMainPanelTitle();
    p.style.setProperty("width",collapsed?"150px":"360px","important");
    p.classList.toggle("tk-main-panel-collapsed",!!collapsed);
    clampMainPanelPosition(p);
}

function resetMainPanelPosition(p){
    if(!p)return;
    const collapsed=getMainPanelCollapsed();
    const vp=(typeof getViewportBox==="function")?getViewportBox():{left:0,top:0,right:window.innerWidth||1200,bottom:window.innerHeight||800,width:window.innerWidth||1200,height:window.innerHeight||800};
    const targetWidth=Math.min(collapsed?150:360,Math.max(120,(vp.width||360)-40));
    p.style.setProperty("width",targetWidth+"px","important");
    p.style.setProperty("max-width","calc(100vw - 40px)","important");
    p.style.display="block";
    const rect=p.getBoundingClientRect?p.getBoundingClientRect():{width:targetWidth,height:collapsed?44:320};
    const targetHeight=Math.min(Math.max(rect.height||0,collapsed?44:260),Math.max(60,(vp.height||600)-40));
    const left=Math.max(vp.left+8,(vp.right||vp.width)-targetWidth-20);
    const top=Math.max(vp.top+8,(vp.bottom||vp.height)-targetHeight-20);
    p.style.setProperty("left",Math.round(left)+"px","important");
    p.style.setProperty("top",Math.round(top)+"px","important");
    p.style.setProperty("right","auto","important");
    p.style.setProperty("bottom","auto","important");
    p.style.setProperty("transform","none","important");
}

function getViewportBox(){
    const vv=window.visualViewport||null;
    const vx=vv&&Number.isFinite(vv.offsetLeft)?vv.offsetLeft:0;
    const vy=vv&&Number.isFinite(vv.offsetTop)?vv.offsetTop:0;
    const vw=(vv&&vv.width)||window.innerWidth||document.documentElement.clientWidth||0;
    const vh=(vv&&vv.height)||window.innerHeight||document.documentElement.clientHeight||0;
    return {left:vx,top:vy,right:vx+vw,bottom:vy+vh,width:vw,height:vh};
}

function isFloatingWindowOffscreen(win,minVisibleWidth,minVisibleHeight){
    if(!win||!win.getBoundingClientRect)return false;
    const rect=win.getBoundingClientRect();
    const vp=getViewportBox();
    if(!vp.width||!vp.height||!rect.width||!rect.height)return false;
    const visibleW=Math.max(0,Math.min(rect.right,vp.right)-Math.max(rect.left,vp.left));
    const visibleH=Math.max(0,Math.min(rect.bottom,vp.bottom)-Math.max(rect.top,vp.top));
    return visibleW<Math.min(minVisibleWidth||160,Math.max(80,rect.width*0.45))||
        visibleH<Math.min(minVisibleHeight||80,Math.max(50,rect.height*0.35))||
        rect.left<vp.left-20||rect.top<vp.top-20||rect.right>vp.right+20||rect.bottom>vp.bottom+20;
}

function clampMainPanelPosition(p){
    try{
        if(isFloatingWindowOffscreen(p,180,80))resetMainPanelPosition(p);
    }catch(e){}
}

function cleanupDuplicateMainPanels(){
    ensureMainPanelPositionStyle();
    cleanupLegacyMainPanels();
    const panels=Array.from(document.querySelectorAll("#tiktok-auto-print-panel-windows"));
    if(panels.length<=1)return panels[0]||null;
    const current=panels.find(p=>!isOldMainPanelVersion(p))||panels[panels.length-1];
    panels.forEach(p=>{
        if(p!==current){
            try{p.remove();}catch(e){}
        }
    });
    return current;
}

function addPanel(){
    let p=cleanupDuplicateMainPanels();
    if(isOldMainPanelVersion(p)){
        try{p.remove();}catch(e){}
        p=null;
    }
    if(!p){
        p=document.createElement("div");
        p.id="tiktok-auto-print-panel-windows";
        p.style.cssText="position:fixed;right:20px;bottom:20px;z-index:2147483647;background:white;border:2px solid #111;border-radius:10px;width:360px;max-width:calc(100vw - 40px);font-size:13px;box-shadow:0 6px 22px rgba(0,0,0,.28);font-family:Arial,'Microsoft YaHei',sans-serif;overflow:visible;";
        p.setAttribute("data-tk-printer-panel","main");
        p.innerHTML=
            '<div id="panelHeader" style="background:#111;color:#fff;padding:8px 10px;border-radius:7px 7px 0 0;cursor:move;display:flex;justify-content:space-between;align-items:center;gap:8px;">'+
                '<span style="font-weight:900;">'+esc(tr("appTitle"))+' v'+SCRIPT_VERSION+'</span>'+
                '<div style="display:flex;gap:5px;align-items:center;">'+
                    '<select id="uiLanguageSelect" title="'+esc(tr("language"))+'" style="height:24px;border:1px solid #fff;border-radius:4px;background:#222;color:#fff;font-weight:bold;cursor:pointer;">'+
                        '<option value="zh">中文</option><option value="en">EN</option>'+
                    '</select>'+
                    '<button id="headerListenToggleBtn" style="padding:2px 8px;border:1px solid #fff;border-radius:4px;background:#d8f5d1;color:#111;cursor:pointer;font-weight:bold;">'+esc(tr("start"))+'</button>'+
                    '<button id="togglePanelMiniBtn" style="padding:2px 8px;border:1px solid #fff;border-radius:4px;background:#fff;color:#111;cursor:pointer;font-weight:bold;">'+esc(tr("collapse"))+'</button>'+
                '</div>'+
            '</div>'+
            '<div id="stableStatusBar" style="padding:8px 10px;background:#f7f7f7;border-bottom:1px solid #ddd;line-height:1.45;"></div>'+
            '<div id="panelBody" style="padding:8px 10px;">'+
                '<div id="autoRefreshText" style="display:none;"></div>'+
                '<button id="listenToggleBtn" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid #333;border-radius:6px;cursor:pointer;font-weight:bold;">'+esc(tr("startListening"))+'</button>'+
                '<button id="bindRefreshMainBtn" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid #333;border-radius:6px;cursor:pointer;background:#fff7d6;font-weight:bold;">'+esc(tr("bindRefresh"))+'</button>'+
                '<button id="downloadLauncherBtn" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid #0a7a0a;border-radius:6px;cursor:pointer;background:#eaffea;color:#0a5d0a;font-weight:bold;">'+esc(tr("downloadLauncher"))+'</button>'+
                '<button id="versionCenterBtn" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid #0b67c2;border-radius:6px;cursor:pointer;background:#e8f0ff;color:#073b78;font-weight:bold;">'+esc(tr("versionCenter"))+'</button>'+
                '<button id="printCurrentBtn" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid #333;border-radius:6px;cursor:pointer;background:#f5f5f5;">'+esc(tr("printCurrent"))+'</button>'+
                '<button id="historyBtn" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid #333;border-radius:6px;cursor:pointer;background:#f5f5f5;">'+esc(tr("history"))+'</button>'+
                '<button id="reviewRecentBtn" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid #333;border-radius:6px;cursor:pointer;background:#e8f0ff;font-weight:bold;">'+esc(tr("review"))+'</button>'+
                '<div id="statusText" style="color:green;font-size:12px;line-height:1.4;word-break:break-all;margin-top:4px;">'+esc(tr("scriptRunning"))+'</div>'+
            '</div>';
        document.body.appendChild(p);
        makeFloatingWindowDraggable(p,"#panelHeader");
        const languageSelect=document.getElementById("uiLanguageSelect");
        languageSelect.value=getUiLanguage();
        ["mousedown","click","touchstart"].forEach(function(eventName){
            languageSelect.addEventListener(eventName,function(e){
                e.stopPropagation();
            },true);
        });
        languageSelect.onchange=function(e){
            e.preventDefault();e.stopPropagation();
            setUiLanguage(this.value);
        };
        document.getElementById("togglePanelMiniBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            const body=document.getElementById("panelBody");
            const hide=body.style.display!=="none";
            setMainPanelCollapsed(hide);
            applyMainPanelCollapsedState(p,hide);
            updateStablePanelSoon();
        };
        document.getElementById("listenToggleBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            if(isListening)pauseListening();else startListening();
            updateStablePanelSoon();
        };
        document.getElementById("headerListenToggleBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            if(isListening)pauseListening();else startListening();
            updateStablePanelSoon();
        };
        document.getElementById("bindRefreshMainBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            startBindRefreshButton();
            updateStablePanelSoon();
        };
        document.getElementById("downloadLauncherBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            downloadDirectPrintLauncher();
        };
        document.getElementById("versionCenterBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            openVersionCenter();
        };
        document.getElementById("printCurrentBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            if(!ensureOperatorName())return;
            if(!requireListeningPausedForAction("打印当前页"))return;
            openCurrentPagePrintDialog();
        };
        document.getElementById("historyBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            if(!ensureOperatorName())return;
            openHistory();
        };
        document.getElementById("reviewRecentBtn").onclick=function(e){
            e.preventDefault();e.stopPropagation();
            if(!ensureOperatorName())return;
            if(!requireListeningPausedForAction("复核网页与云端"))return;
            openReviewWindow();
        };
    }
    if(!applySavedMainPanelPosition(p))resetMainPanelPosition(p);
    applyMainPanelCollapsedState(p,getMainPanelCollapsed());
    clampMainPanelPosition(p);
    updateStablePanel();
    startMainPanelTextGuard();
    showCancelNoteAlertBox();
    clearBootNotice();
}

let stablePanelTimer=null;
let mainPanelTextGuardStarted=false;
let mainPanelTextGuardObserver=null;
let mainPanelTextGuardObserved=null;

function getMainPanelTitle(){
    return tr("appTitle")+" v"+SCRIPT_VERSION;
}

function normalizeMainPanelUiText(){
    const p=document.getElementById("tiktok-auto-print-panel-windows");
    if(!p)return;

    p.setAttribute("data-tk-printer-version",SCRIPT_VERSION);

    const collapsed=getMainPanelCollapsed();
    applyMainPanelCollapsedState(p,collapsed);

    const title=p.querySelector("#panelHeader span");
    const expectedTitle=collapsed?(tr("collapsedTitle")+" v"+SCRIPT_VERSION):getMainPanelTitle();
    if(title&&title.textContent!==expectedTitle)title.textContent=expectedTitle;

    const lang=document.getElementById("uiLanguageSelect");
    if(lang&&lang.value!==getUiLanguage())lang.value=getUiLanguage();

    const mini=document.getElementById("togglePanelMiniBtn");
    if(mini)mini.textContent=collapsed?tr("expand"):tr("collapse");

    const launcher=document.getElementById("downloadLauncherBtn");
    if(launcher)launcher.textContent=tr("downloadLauncher");

    const versionBtn=document.getElementById("versionCenterBtn");
    if(versionBtn)versionBtn.textContent=tr("versionCenter");

    const printBtn=document.getElementById("printCurrentBtn");
    if(printBtn)printBtn.textContent=tr("printCurrent");

    const historyBtn=document.getElementById("historyBtn");
    if(historyBtn)historyBtn.textContent=tr("history");

    const reviewBtn=document.getElementById("reviewRecentBtn");
    if(reviewBtn)reviewBtn.textContent=tr("review");

    const btn=document.getElementById("listenToggleBtn");
    if(btn){
        const text=isListening?tr("pauseListening"):tr("startListening");
        if(btn.textContent!==text)btn.textContent=text;
        btn.setAttribute("data-tk-normalized-by",SCRIPT_VERSION);
    }
    const headerBtn=document.getElementById("headerListenToggleBtn");
    if(headerBtn){
        const headerText=isListening?tr("pause"):tr("start");
        if(headerBtn.textContent!==headerText)headerBtn.textContent=headerText;
        headerBtn.style.background=isListening?"#ffd6d6":"#d8f5d1";
    }

    const oldListenMonitor=document.getElementById("tk-listen-monitor-v101");
    if(oldListenMonitor){
        try{oldListenMonitor.remove();}catch(e){}
    }
}

function startMainPanelTextGuard(){
    const run=function(){
        try{
            normalizeMainPanelUiText();

            const p=document.getElementById("tiktok-auto-print-panel-windows");
            if(p&&p!==mainPanelTextGuardObserved&&typeof MutationObserver!=="undefined"){
                if(mainPanelTextGuardObserver){
                    try{mainPanelTextGuardObserver.disconnect();}catch(e){}
                }

                mainPanelTextGuardObserved=p;
                mainPanelTextGuardObserver=new MutationObserver(function(){
                    setTimeout(normalizeMainPanelUiText,0);
                });
                mainPanelTextGuardObserver.observe(p,{childList:true,subtree:true,characterData:true});
            }
        }catch(e){}
    };

    run();
    if(!mainPanelTextGuardStarted){
        mainPanelTextGuardStarted=true;
        setTimeout(run,1000);
        setTimeout(run,4000);
    }
}

function updateStablePanelSoon(){
    if(stablePanelTimer)clearTimeout(stablePanelTimer);
    stablePanelTimer=setTimeout(updateStablePanel,120);
}

function getRefreshStatusText(){
    const bind=!!getRefreshBind();
    if(isListening&&autoRefreshTimer){
        const remain=Math.max(0,Math.ceil((autoRefreshNextAt-Date.now())/1000));
        return (bind?tr("refreshBound"):tr("refreshAutoFinding"))+"，"+tr("nextRefresh")+": "+remain+"s";
    }
    return bind?tr("refreshBound"):tr("refreshUnbound");
}

function updateStablePanel(){
    const bar=document.getElementById("stableStatusBar");
    if(!bar)return;
    const p=document.getElementById("tiktok-auto-print-panel-windows");
    const collapsed=!!(p&&p.classList&&p.classList.contains("tk-main-panel-collapsed"));
    const op=getOperatorName()||tr("operatorUnset");
    const listenText=isListening?tr("listeningOn"):tr("listeningOff");
    const listenColor=isListening?"#078b2f":"#d60000";
    const refreshText=getRefreshStatusText();
    const pendingCloud=getCloudPendingPrintCount();
    const queueText=tr("queue")+": "+(printQueue?printQueue.length:0)+(pendingCloud?" ｜ "+tr("cloudPending")+": "+pendingCloud:"");
    const pauseReason=isListening?"":(tr("pauseReason")+": "+getListenPauseReasonText());
    const directPrintText=getDirectPrintStatusText();
    const directPrintConfirmed=isDirectPrintLaunchConfirmed();
    const opHtml=esc(op).replace(/ /g,"&nbsp;");
    const directConfirmButton=directPrintConfirmed?"":'<button id="stableConfirmDirectPrintBtn" style="padding:2px 8px;border:1px solid #0a7a0a;border-radius:4px;background:#eaffea;color:#0a5d0a;cursor:pointer;white-space:nowrap;font-weight:bold;">'+esc(tr("confirmEntry"))+'</button>';
    const directDownloadButton=directPrintConfirmed?"":'<button id="stableDownloadLauncherBtn" style="padding:2px 8px;border:1px solid #0a7a0a;border-radius:4px;background:#eaffea;color:#0a5d0a;cursor:pointer;white-space:nowrap;font-weight:bold;">'+esc(tr("downloadStart"))+'</button>';
    if(collapsed){
        bar.style.padding="6px 8px";
        bar.style.fontSize="12px";
        bar.innerHTML=
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">'+
                '<b style="color:'+listenColor+';">'+listenText+'</b>'+
                '<div style="display:flex;gap:4px;align-items:center;">'+directConfirmButton+directDownloadButton+'<button id="stableBindRefreshBtn" title="'+esc(tr("rebindRefresh"))+'" style="padding:2px 6px;border:1px solid #b36b00;border-radius:4px;background:#fff7d6;cursor:pointer;white-space:nowrap;font-weight:bold;">'+esc(tr("refreshShort"))+'</button></div>'+
            '</div>'+
            '<div style="margin-top:2px;color:#555;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(directPrintText)+' ｜ '+esc(tkCloudStatus||"云同步：未连接")+(pauseReason?' ｜ '+esc(pauseReason):'')+'</div>';
    }else{
        bar.style.padding="8px 10px";
        bar.style.fontSize="13px";
        bar.innerHTML=
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">'+
            '<div style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(tr("listening"))+': <b style="color:'+listenColor+';">'+listenText+'</b> ｜ '+esc(tr("currentOperator"))+': <b>'+opHtml+'</b></div>'+
            '<div style="display:flex;gap:5px;align-items:center;">'+
                directConfirmButton+
                directDownloadButton+
                '<button id="stableRetryCloudBtn" style="padding:2px 8px;border:1px solid #0b67c2;border-radius:4px;background:#e8f0ff;cursor:pointer;white-space:nowrap;font-weight:bold;">'+esc(tr("cloudReconnect"))+'</button>'+
                '<button id="stableBindRefreshBtn" style="padding:2px 8px;border:1px solid #b36b00;border-radius:4px;background:#fff7d6;cursor:pointer;white-space:nowrap;font-weight:bold;">'+esc(tr("rebindRefresh"))+'</button>'+
                '<button id="stableChangeUserBtn" style="padding:2px 8px;border:1px solid #777;border-radius:4px;background:#fff;cursor:pointer;white-space:nowrap;">'+esc(tr("switchUser"))+'</button>'+
            '</div>'+
        '</div>'+
        '<div style="margin-top:3px;color:#555;font-size:12px;">'+esc(directPrintText)+' ｜ '+esc(tkCloudStatus||"云同步：未连接")+' ｜ '+esc(refreshText)+' ｜ '+esc(queueText)+(pauseReason?' ｜ '+esc(pauseReason):'')+'</div>';
    }
    const change=document.getElementById("stableChangeUserBtn");
    if(change)change.onclick=function(e){e.preventDefault();e.stopPropagation();changeOperatorName();};
    const retryCloud=document.getElementById("stableRetryCloudBtn");
    if(retryCloud)retryCloud.onclick=function(e){e.preventDefault();e.stopPropagation();retryCloudSyncNow();};
    const bindRefresh=document.getElementById("stableBindRefreshBtn");
    if(bindRefresh)bindRefresh.onclick=function(e){e.preventDefault();e.stopPropagation();startBindRefreshButton();};
    const confirmDirect=document.getElementById("stableConfirmDirectPrintBtn");
    if(confirmDirect)confirmDirect.onclick=function(e){e.preventDefault();e.stopPropagation();confirmDirectPrintLaunchManually();};
    const downloadLauncher=document.getElementById("stableDownloadLauncherBtn");
    if(downloadLauncher)downloadLauncher.onclick=function(e){e.preventDefault();e.stopPropagation();downloadDirectPrintLauncher();};
    const btn=document.getElementById("listenToggleBtn");
    if(btn){
        btn.innerText=isListening?tr("pauseListening"):tr("startListening");
        btn.style.background=isListening?"#ffd6d6":"#d8f5d1";
    }
    const mainBind=document.getElementById("bindRefreshMainBtn");
    if(mainBind)mainBind.innerText=getRefreshBind()?tr("bindRefreshBound"):tr("bindRefreshUnbound");
    normalizeMainPanelUiText();
}

function openListenMonitor(){
    closeListenMonitor();
}
function closeListenMonitor(){
    const m=document.getElementById("tk-listen-monitor-v101");
    if(m)m.remove();
}
function positionListenMonitor(){
    closeListenMonitor();
}
function updateListenMonitor(){
    closeListenMonitor();
}

setTimeout(function(){
    try{
        bootV88();
    }catch(e){
        console.error("[TikTok v"+SCRIPT_VERSION+"] early boot error:",e);
        showBootError("早期启动失败",e);
    }
},3000);

setTimeout(function(){
    showCancelNoteAlertBox();
},4000);function getRefreshBind(){
    return getJson(REFRESH_BIND_KEY,null);
}

function saveRefreshBind(bind){
    setJson(REFRESH_BIND_KEY,bind);
}

function clearRefreshBind(){
    localStorage.removeItem(REFRESH_BIND_KEY);
}

function getNextBind(){
    return getJson(NEXT_BIND_KEY,null);
}

function saveNextBind(bind){
    setJson(NEXT_BIND_KEY,bind);
}

function clearNextBind(){
    localStorage.removeItem(NEXT_BIND_KEY);
}

function isDangerousRefreshCandidate(el){
    if(!el)return true;
    if(isInsideScriptUI(el))return true;

    const text=norm(el.innerText||el.textContent||safeAttr(el,"aria-label")||safeAttr(el,"title"));
    const lower=text.toLowerCase();

    if(text==="All"||text==="To ship"||text==="Shipped"||text==="Completed"||text==="Pending"||text==="Canceled")return true;
    if(lower.includes("cancel"))return true;
    if(lower.includes("arrange shipment"))return true;
    if(lower.includes("shipping labels"))return true;
    if(lower.includes("upload"))return true;
    if(lower.includes("filter"))return true;
    if(lower.includes("download"))return true;
    if(lower.includes("next"))return true;
    if(lower.includes("previous"))return true;
    if(lower.includes("search"))return true;

    return false;
}

function isDisabledLike(el){
    if(!el)return true;

    const ariaDisabled=safeAttr(el,"aria-disabled").toLowerCase();
    const disabledAttr=el.disabled===true;
    const cls=String(el.className||"").toLowerCase();
    const style=window.getComputedStyle(el);
    const rect=el.getBoundingClientRect();

    if(disabledAttr)return true;
    if(ariaDisabled==="true")return true;
    if(cls.includes("disabled"))return true;
    if(style.pointerEvents==="none")return true;
    if(Number(style.opacity||1)<0.35)return true;
    if(rect.width<=0||rect.height<=0)return true;

    return false;
}

function scoreBoundCandidate(el,bind,mode){
    if(!el||!bind||!isVisibleElement(el))return -9999;
    if(mode==="refresh"&&isDangerousRefreshCandidate(el))return -9999;

    const text=norm(el.innerText||el.textContent||"");
    const aria=safeAttr(el,"aria-label");
    const title=safeAttr(el,"title");
    const cls=norm(String(el.className||""));
    const role=safeAttr(el,"role");
    const tagName=el.tagName||"";
    const path=getElementPath(el);
    const idx=getElementIndexInParent(el);
    const rect=el.getBoundingClientRect();
    const svg=getSvgSignature(el);
    const all=(text+" "+aria+" "+title).toLowerCase();

    let score=0;

    if(mode==="refresh"&&(all.includes("refresh")||all.includes("刷新")))score+=260;
    if(mode==="next"&&(all.includes("next")||all.includes("下一页")||text===">"||text==="›"))score+=220;

    if(bind.aria&&aria&&bind.aria===aria)score+=160;
    if(bind.title&&title&&bind.title===title)score+=130;
    if(bind.text&&text&&bind.text===text)score+=110;
    if(bind.svgSignature&&svg&&bind.svgSignature===svg)score+=190;
    if(bind.tagName&&tagName===bind.tagName)score+=20;
    if(bind.role&&role&&role===bind.role)score+=25;
    if(bind.id&&safeAttr(el,"id")&&safeAttr(el,"id")===bind.id)score+=80;
    if(bind.className&&cls&&cls===bind.className)score+=75;
    if(bind.path&&path&&path===bind.path)score+=90;
    if(bind.indexInParent>=0&&idx===bind.indexInParent)score+=35;
    if(bind.width&&Math.abs(rect.width-bind.width)<=10)score+=20;
    if(bind.height&&Math.abs(rect.height-bind.height)<=10)score+=20;

    if(typeof bind.centerRatioX==="number"&&typeof bind.centerRatioY==="number"){
        const cx=(rect.left+rect.width/2)/window.innerWidth;
        const cy=(rect.top+rect.height/2)/window.innerHeight;
        const dist=Math.sqrt(Math.pow(cx-bind.centerRatioX,2)+Math.pow(cy-bind.centerRatioY,2));

        if(dist<0.03)score+=75;
        else if(dist<0.06)score+=45;
        else if(dist<0.10)score+=20;
    }

    return score;
}

function findBoundButton(bind,mode){
    if(!bind)return null;

    const candidates=new Set();

    Array.from(document.querySelectorAll("button,[role='button'],a,[tabindex],span,div,li")).forEach(el=>{
        if(isVisibleElement(el))candidates.add(el);
    });

    if(typeof bind.centerRatioX==="number"&&typeof bind.centerRatioY==="number"){
        const x=Math.round(bind.centerRatioX*window.innerWidth);
        const y=Math.round(bind.centerRatioY*window.innerHeight);
        let el=document.elementFromPoint(x,y);

        for(let i=0;i<6&&el;i++){
            if(isVisibleElement(el))candidates.add(el);

            if(el.closest){
                const clickable=el.closest("button,[role='button'],a,[tabindex],li");
                if(clickable&&isVisibleElement(clickable))candidates.add(clickable);
            }

            el=el.parentElement;
        }
    }

    let best=null;
    let bestScore=-9999;

    candidates.forEach(el=>{
        const clickable=getInteractiveElement(el)||el;
        const s=scoreBoundCandidate(clickable,bind,mode);

        if(s>bestScore){
            bestScore=s;
            best=clickable;
        }
    });

    if(!best)return null;

    const all=(norm(best.innerText||best.textContent||"")+" "+safeAttr(best,"aria-label")+" "+safeAttr(best,"title")).toLowerCase();
    const svg=getSvgSignature(best);
    const sameSvg=bind.svgSignature&&svg&&bind.svgSignature===svg;
    const samePath=bind.path&&getElementPath(best)===bind.path;
    const goodScore=bestScore>=150;
    const veryGoodScore=bestScore>=220;

    if(mode==="refresh"&&(all.includes("refresh")||all.includes("刷新"))&&bestScore>=120)return best;
    if(mode==="next"&&(all.includes("next")||all.includes("下一页")||norm(best.innerText||best.textContent)===">"||norm(best.innerText||best.textContent)==="›")&&bestScore>=100)return best;
    if(sameSvg&&goodScore)return best;
    if(samePath&&goodScore)return best;
    if(veryGoodScore)return best;

    return null;
}

function findRefreshButton(){
    return findBoundButton(getRefreshBind(),"refresh");
}

function getRefreshCandidateText(el){
    return norm(
        safeAttr(el,"aria-label")+" "+
        safeAttr(el,"title")+" "+
        safeAttr(el,"data-testid")+" "+
        safeAttr(el,"data-e2e")+" "+
        (el.innerText||el.textContent||"")
    );
}

function isRefreshText(text){
    const s=norm(text).toLowerCase();

    if(!s)return false;
    if(s.includes("refresh"))return true;
    if(s.includes("reload"))return true;
    if(s.includes("刷新"))return true;
    if(s.includes("重新加载"))return true;

    return false;
}

function scoreDynamicRefreshCandidate(el){
    if(!isVisibleElement(el))return -9999;
    if(isDisabledLike(el))return -9999;
    if(isDangerousRefreshCandidate(el))return -9999;

    const text=getRefreshCandidateText(el);
    const lower=text.toLowerCase();
    const rect=el.getBoundingClientRect();
    const svg=getSvgSignature(el);

    let score=0;

    if(isRefreshText(text))score+=300;
    if(lower.includes("refresh"))score+=90;
    if(lower.includes("reload"))score+=60;
    if(text.includes("刷新"))score+=90;

    if(el.tagName==="BUTTON")score+=45;
    if(safeAttr(el,"role")==="button")score+=35;
    if(el.matches&&el.matches("button,[role='button'],a,[tabindex]"))score+=35;
    if(svg)score+=12;

    if(rect.left>window.innerWidth*0.45)score+=25;
    if(rect.top<window.innerHeight*0.70)score+=20;
    if(rect.width>=20&&rect.width<=90)score+=18;
    if(rect.height>=20&&rect.height<=70)score+=18;

    const parent=el.parentElement;
    if(parent){
        const pText=norm(parent.innerText||parent.textContent||"").toLowerCase();
        if(pText.includes("order")||pText.includes("订单"))score+=12;
        if(pText.includes("filter")||pText.includes("search")||pText.includes("download"))score-=80;
    }

    return score;
}

function findDynamicRefreshButton(){
    const raw=Array.from(document.querySelectorAll("button,[role='button'],a,[tabindex],li,span,div"));
    const candidates=new Set();

    raw.forEach(el=>{
        if(!isVisibleElement(el))return;
        const text=getRefreshCandidateText(el);
        if(isRefreshText(text))candidates.add(getInteractiveElement(el)||el);
    });

    let best=null;
    let bestScore=-9999;

    candidates.forEach(el=>{
        const clickable=getInteractiveElement(el)||el;
        const score=scoreDynamicRefreshCandidate(clickable);

        if(score>bestScore){
            bestScore=score;
            best=clickable;
        }
    });

    if(best&&bestScore>=180)return best;
    return null;
}

function makeFingerprintFromElement(el,label){
    if(!el||!el.getBoundingClientRect)return null;
    const rect=el.getBoundingClientRect();
    return makeFingerprint(el,Math.round(rect.left+rect.width/2),Math.round(rect.top+rect.height/2),label||"auto");
}

function autoRebindRefreshButton(reason){
    const nowMs=Date.now();
    if(nowMs-refreshAutoRebindLastAt<1200)return null;

    refreshAutoRebindLastAt=nowMs;

    const btn=findDynamicRefreshButton();

    if(!btn){
        refreshAutoRebindFailCount++;
        return null;
    }

    const bind=makeFingerprintFromElement(btn,"refresh-auto");
    if(!bind)return null;

    saveRefreshBind(bind);
    refreshAutoRebindFailCount=0;
    autoRefreshPausedReason="";
    updateStatus("刷新按钮绑定失效，已自动重新绑定"+(reason?"："+reason:"")+"。");
    updateAutoRefreshText();
    updateStablePanelSoon();

    return btn;
}

function getNextCandidateText(el){
    return norm(
        safeAttr(el,"aria-label")+" "+
        safeAttr(el,"title")+" "+
        safeAttr(el,"data-testid")+" "+
        safeAttr(el,"data-e2e")+" "+
        (el.innerText||el.textContent||"")
    );
}

function isNextText(text){
    const s=norm(text).toLowerCase();

    if(!s)return false;
    if(s===">"||s==="›"||s==="»")return true;
    if(s.includes("next"))return true;
    if(s.includes("next page"))return true;
    if(s.includes("下一页"))return true;
    if(s.includes("后一页"))return true;
    if(s.includes("下页"))return true;
    if(s.includes("page down"))return true;

    return false;
}

function isPreviousText(text){
    const s=norm(text).toLowerCase();

    if(!s)return false;
    if(s==="<"||s==="‹"||s==="«")return true;
    if(s.includes("previous"))return true;
    if(s.includes("prev"))return true;
    if(s.includes("上一页"))return true;
    if(s.includes("前一页"))return true;
    if(s.includes("上页"))return true;

    return false;
}

function scoreDynamicNextCandidate(el){
    if(!isVisibleElement(el))return -9999;
    if(isDisabledLike(el))return -9999;
    if(isInsideScriptUI(el))return -9999;

    const text=getNextCandidateText(el);
    const lower=text.toLowerCase();
    const rect=el.getBoundingClientRect();
    const svg=getSvgSignature(el);

    if(isPreviousText(text))return -9999;

    let score=0;

    if(isNextText(text))score+=260;
    if(lower.includes("next page"))score+=90;
    if(lower.includes("next"))score+=70;
    if(text.includes("下一页"))score+=90;
    if(text.includes("后一页"))score+=70;
    if(norm(el.innerText||el.textContent)===">"||norm(el.innerText||el.textContent)==="›")score+=70;

    if(el.tagName==="BUTTON")score+=45;
    if(safeAttr(el,"role")==="button")score+=35;
    if(el.matches&&el.matches("button,[role='button'],a,[tabindex]"))score+=40;
    if(svg)score+=10;

    if(rect.left>window.innerWidth*0.45)score+=45;
    if(rect.top>window.innerHeight*0.55)score+=55;
    if(rect.top>window.innerHeight*0.75)score+=35;
    if(rect.width>=20&&rect.width<=90)score+=20;
    if(rect.height>=20&&rect.height<=70)score+=20;

    const parent=el.parentElement;

    if(parent){
        const pText=norm(parent.innerText||parent.textContent||"").toLowerCase();

        if(
            pText.includes("per page") ||
            pText.includes("page") ||
            pText.includes("items/page") ||
            pText.includes("rows per page")
        ){
            score+=30;
        }

        if(pText.includes("上一页")||pText.includes("下一页")){
            score+=35;
        }
    }

    return score;
}

function findDynamicNextCandidates(limit){
    const raw=Array.from(document.querySelectorAll("button,[role='button'],a,[tabindex],li,span,div"));
    const candidates=new Set();

    raw.forEach(el=>{
        if(!isVisibleElement(el))return;

        const text=getNextCandidateText(el);

        if(isNextText(text))candidates.add(getInteractiveElement(el)||el);

        const children=Array.from(el.querySelectorAll?el.querySelectorAll("svg,path"):[]);
        if(children.length&&isNextText(text))candidates.add(getInteractiveElement(el)||el);
    });

    const bound=findBoundButton(getNextBind(),"next");
    if(bound)candidates.add(bound);

    const byPoint=getBoundNextButtonByPointV103();
    if(byPoint)candidates.add(byPoint);

    const ranked=[];
    const seen=new Set();

    function addRanked(el,score){
        const clickable=getInteractiveElement(el)||el;
        if(!clickable||seen.has(clickable))return;
        seen.add(clickable);
        if(score>=100)ranked.push({el:clickable,score});
    }

    candidates.forEach(el=>{
        const clickable=getInteractiveElement(el)||el;
        const score=scoreDynamicNextCandidate(clickable);
        addRanked(clickable,score);
    });

    Array.from(document.querySelectorAll("button,[role='button']"))
        .filter(el=>isVisibleElement(el)&&!isDisabledLike(el)&&!isPreviousText(getNextCandidateText(el)))
        .map(el=>({el,score:scoreDynamicNextCandidate(el)}))
        .forEach(x=>addRanked(x.el,x.score));

    ranked.sort((a,b)=>b.score-a.score);
    return ranked.slice(0,limit||5).map(x=>x.el);
}

function findDynamicNextButton(){
    const candidates=findDynamicNextCandidates(1);
    return candidates.length?candidates[0]:null;
}

function findNextButton(){
    return findDynamicNextButton();
}

function hidePluginWindowsForPageClickV103(){
    // v11.0：复核窗口必须保持可见并置顶。这里不再 display:none，
    // 只临时让插件浮窗 mouse-through，方便 elementFromPoint / 点击落到 TikTok 下一页按钮。
    const ids=["tk-review-window","tk-print-floating-window","tk-cloud-history-window","tiktok-auto-print-panel-windows","tk-stable-panel-v101","tk-bind-tip"];
    const old={};
    ids.forEach(id=>{
        const el=document.getElementById(id);
        if(el){
            old[id]={pointerEvents:el.style.pointerEvents,zIndex:el.style.zIndex};
            el.style.pointerEvents="none";
            if(id==="tk-review-window")el.style.zIndex="2147483000";
        }
    });
    return function restore(){
        ids.forEach(id=>{
            const el=document.getElementById(id);
            if(el&&old[id]){
                el.style.pointerEvents=old[id].pointerEvents||"";
                el.style.zIndex=old[id].zIndex||el.style.zIndex||"";
            }
        });
        bringReviewWindowToFrontV110();
    };
}

function bringReviewWindowToFrontV110(){
    const win=document.getElementById("tk-review-window");
    if(!win)return;
    win.style.zIndex="2147483000";
    win.style.display="flex";
    win.style.visibility="visible";
}

function pauseListeningForReviewV110(){
    try{
        if(typeof pauseListening==="function")pauseListening();
    }catch(e){}
    setListenPauseReason("stoppedForReview","");
    try{
        if(typeof clearPrintQueue==="function")clearPrintQueue("开始复核，已暂停监听并清空打印队列。");
        else{printQueue=[];printingQueue=false;}
    }catch(e){
        try{printQueue=[];printingQueue=false;}catch(err){}
    }
    try{
        isListening=false;
        viewChangeProtecting=false;
        stopAutoRefresh(true);
        if(scanTimer){clearInterval(scanTimer);scanTimer=null;}
        updateListenButton();
    }catch(e){}
}

function requireListeningPausedForAction(actionText){
    if(!isListening)return true;

    const msg="请先点击“暂停监听”，再"+(actionText||"继续操作")+"。这样可以避免监听刷新/自动打印和当前操作冲突。";

    updateStatus(msg);

    try{
        alert(msg);
    }catch(e){}

    return false;
}

function fireRealMouseClickV103(el){
    if(!el)return false;
    try{
        el.scrollIntoView({block:"center",inline:"center"});
    }catch(e){}
    try{
        const r=el.getBoundingClientRect();
        const x=Math.round(r.left+r.width/2);
        const y=Math.round(r.top+r.height/2);
        ["pointerdown","mousedown","pointerup","mouseup","click"].forEach(type=>{
            const evt=new MouseEvent(type,{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y});
            el.dispatchEvent(evt);
        });
        if(typeof el.click==="function")el.click();
        return true;
    }catch(e){
        try{el.click();return true;}catch(err){return false;}
    }
}

function getBoundNextButtonByPointV103(){
    const bind=getNextBind();
    if(!bind||typeof bind.centerRatioX!=="number"||typeof bind.centerRatioY!=="number")return null;
    const x=Math.round(bind.centerRatioX*window.innerWidth);
    const y=Math.round(bind.centerRatioY*window.innerHeight);
    let el=document.elementFromPoint(x,y);
    for(let i=0;i<8&&el;i++){
        const clickable=el.closest?el.closest("button,[role='button'],a,[tabindex],li,div,span"):el;
        if(clickable&&isVisibleElement(clickable)&&!isPreviousText(getNextCandidateText(clickable))){
            const text=getNextCandidateText(clickable);
            if(isNextText(text)||scoreDynamicNextCandidate(clickable)>=80)return clickable;
        }
        el=el.parentElement;
    }
    return null;
}

async function clickNextPageSmart(){
    // v11.0 修复：复核弹窗在上层时，脚本会误点到自己浮窗，或者等待签名时读到浮窗里的旧订单号。
    // 所以翻页动作期间临时隐藏插件浮窗，直接点击 TikTok 真实下一页按钮。
    let restore=null;
    let lastReason="";
    try{
        restore=hidePluginWindowsForPageClickV103();
        await wait(120);
        await scrollMainToBottom();
        await wait(250);

        const oldSig=getVisibleOrderSignature();
        const oldTurnSig=getReviewPageTurnSignature();
        let candidates=findDynamicNextCandidates(5);

        if(!candidates.length){
            await wait(600);
            candidates=findDynamicNextCandidates(5);
        }

        if(!candidates.length){
            return {ok:false,reason:"找不到下一页按钮。请重新绑定页面底部真正的下一页箭头。"};
        }

        for(let i=0;i<candidates.length;i++){
            const nextBtn=candidates[i];

            if(isDisabledLike(nextBtn)){
                lastReason="下一页按钮不可用，可能已经到最后一页。";
                continue;
            }

            const bind=makeFingerprintFromElement(nextBtn,"next-auto");
            if(bind)saveNextBind(bind);

            const clicked=fireRealMouseClickV103(nextBtn);
            if(!clicked){
                lastReason="找到了下一页按钮，但无法触发真实点击。";
                continue;
            }

            // 等待TikTok列表刷新。这里继续隐藏插件UI，避免签名读到复核弹窗里的旧订单号。
            const changed=await waitReviewPageTurnChanged(oldTurnSig,16000);
            await wait(2000);

            const newSig=getVisibleOrderSignature();
            const newTurnSig=getReviewPageTurnSignature();

            if(changed||(newSig&&newSig!==oldSig)||(newTurnSig&&newTurnSig!==oldTurnSig)){
                return {ok:true,reason:i===0?"已进入下一页":"已换用备用下一页按钮并进入下一页"};
            }

            lastReason="已点击下一页候选按钮，但订单列表没有变化。";
            await wait(500);
        }

        return {ok:false,reason:(lastReason||"已尝试多个下一页候选按钮，但订单列表没有变化。")+" 请重新绑定页面底部真正的下一页箭头。"};
    }catch(e){
        return {ok:false,reason:"翻页异常："+(e&&e.message?e.message:String(e))};
    }finally{
        if(restore){
            try{restore();}catch(e){}
        }
    }
}

function showBindTip(text){
    let tip=document.getElementById("tk-bind-tip");

    if(!tip){
        tip=document.createElement("div");
        tip.id="tk-bind-tip";
        tip.style.cssText=`
            position:fixed;
            left:50%;
            top:18px;
            transform:translateX(-50%);
            z-index:1000003;
            background:#ff3b30;
            color:white;
            border:4px solid #fff;
            box-shadow:0 6px 28px rgba(0,0,0,.45);
            border-radius:12px;
            padding:16px 26px;
            font-family:Arial,"Microsoft YaHei",sans-serif;
            font-size:22px;
            font-weight:900;
            text-align:center;
            min-width:520px;
            max-width:90vw;
        `;

        document.body.appendChild(tip);
    }

    tip.innerHTML=text;
    tip.style.display="block";
}

function hideBindTip(){
    const tip=document.getElementById("tk-bind-tip");
    if(tip)tip.style.display="none";
}

function hideReviewWindowForBinding(){
    const win=document.getElementById("tk-review-window");
    if(win)win.style.display="none";
}

function restoreReviewWindowAfterBinding(){
    const win=ensureReviewWindow();
    win.style.display="flex";
    renderReviewBindState();
    updateReviewStepVisual();
}

function startBindRefreshButton(){
    clearRefreshBind();
    autoRefreshPausedReason="";
    refreshAutoRebindFailCount=0;
    stopAutoRefresh(false);
    bindRefreshMode=true;
    updateAutoRefreshText();
    updateStablePanelSoon();
    updateStatus("已进入重新绑定模式：请点击 TikTok 页面真正的刷新按钮。旧绑定已清空。");
    showBindTip("正在绑定刷新按钮<br>请点击 TikTok 页面真正的刷新图标");
}

function startBindNextButton(){
    bindNextMode=true;
    clearNextBind();
    updateReviewStatus("请点击 TikTok 页面上的下一页按钮。复核窗口已自动隐藏。");
    showBindTip("正在绑定 下一页 按钮<br>请点击 TikTok 页面底部的下一页按钮");
    hideReviewWindowForBinding();
}

document.addEventListener("click",function(e){
    if(!bindRefreshMode&&!bindNextMode)return;

    const panel=document.getElementById("tiktok-auto-print-panel-windows");
    const floatWin=document.getElementById("tk-print-floating-window");
    const reviewWin=document.getElementById("tk-review-window");
    const tip=document.getElementById("tk-bind-tip");

    if(panel&&panel.contains(e.target))return;
    if(floatWin&&floatWin.contains(e.target))return;
    if(reviewWin&&reviewWin.contains(e.target))return;
    if(tip&&tip.contains(e.target))return;

    const clickable=getInteractiveElement(e.target)||e.target;

    if(bindRefreshMode){
        if(isDangerousRefreshCandidate(clickable)){
            updateStatus("这个按钮不像刷新按钮，未绑定。请点击订单列表右侧真正的刷新图标。");
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        bindRefreshMode=false;
        saveRefreshBind(makeFingerprint(clickable,e.clientX,e.clientY,"refresh"));
        autoRefreshPausedReason="";
        updateStatus("已重新绑定刷新按钮DOM特征。");
        hideBindTip();

        if(isListening){
            startAutoRefresh();
            updateStatus("已重新绑定刷新按钮，并已重新开启自动刷新。");
        }

        updateAutoRefreshText();
        renderReviewBindState();
        updateStablePanelSoon();

        e.preventDefault();
        e.stopPropagation();
        return;
    }

    if(bindNextMode){
        bindNextMode=false;
        saveNextBind(makeFingerprint(clickable,e.clientX,e.clientY,"next"));
        hideBindTip();
        restoreReviewWindowAfterBinding();
        updateReviewStatus("下一页按钮已绑定。后续会滚到底部并动态重新查找下一页。");

        e.preventDefault();
        e.stopPropagation();
    }
},true);

function autoRefreshPage(){
    if(!isListening)return;
    if(viewChangeProtecting)return;
    if(guardTikTokVerification("自动刷新已暂停"))return;

    let btn=findRefreshButton();

    if(!btn){
        btn=autoRebindRefreshButton("自动刷新前重新查找");
    }

    if(!btn){
        autoRefreshPausedReason="刷新按钮失效，自动重绑失败。请点状态栏“重绑刷新”";
        stopAutoRefresh(false);
        updateAutoRefreshText();
        updateStablePanelSoon();
        updateStatus("自动刷新已暂停：刷新按钮失效，自动重绑失败。监听仍在继续，可直接点状态栏“重绑刷新”。");
        return;
    }

    btn.click();
    updateStatus("已精确点击绑定的刷新按钮，等待新订单加载...");
    autoRefreshNextAt=Date.now()+AUTO_REFRESH_INTERVAL;
    updateAutoRefreshText();
    updateStablePanelSoon();

    setTimeout(function(){
        scan();
    },2200);
}

function startAutoRefresh(){
    stopAutoRefresh(false);

    if(!getRefreshBind()){
        const btn=autoRebindRefreshButton("启动自动刷新时自动查找");
        if(!btn){
            autoRefreshPausedReason="未绑定刷新按钮，自动查找失败。请点状态栏“重绑刷新”";
            updateAutoRefreshText();
            updateStablePanelSoon();
            return;
        }
    }

    autoRefreshPausedReason="";
    autoRefreshNextAt=Date.now()+AUTO_REFRESH_INTERVAL;
    autoRefreshTimer=setInterval(function(){
        autoRefreshPage();
        autoRefreshNextAt=Date.now()+AUTO_REFRESH_INTERVAL;
        updateAutoRefreshText();
        updateStablePanelSoon();
    },AUTO_REFRESH_INTERVAL);
    if(autoRefreshCountdownTimer)clearInterval(autoRefreshCountdownTimer);
    autoRefreshCountdownTimer=setInterval(function(){
        updateAutoRefreshText();
        updateStablePanelSoon();
    },1000);

    updateAutoRefreshText();
    updateStablePanelSoon();
}

function stopAutoRefresh(clearReason){
    if(autoRefreshTimer){
        clearInterval(autoRefreshTimer);
        autoRefreshTimer=null;
    }
    if(autoRefreshCountdownTimer){
        clearInterval(autoRefreshCountdownTimer);
        autoRefreshCountdownTimer=null;
    }
    autoRefreshNextAt=0;

    if(clearReason)autoRefreshPausedReason="";

    updateAutoRefreshText();
    updateStablePanelSoon();
}

function updateAutoRefreshText(){
    const el=document.getElementById("autoRefreshText");

    if(!el)return;

    const bind=getRefreshBind();

    if(isListening&&autoRefreshTimer){
        const remain=Math.max(0,Math.ceil((autoRefreshNextAt-Date.now())/1000));
        el.innerText="自动刷新：已开启，下次刷新："+remain+"秒；失效会自动重绑";
        el.style.color="green";
    }else if(isListening&&!bind){
        el.innerText="自动刷新：未开启；请点状态栏“重绑刷新”";
        el.style.color="red";
    }else if(isListening&&autoRefreshPausedReason){
        el.innerText="自动刷新：已暂停；"+autoRefreshPausedReason;
        el.style.color="red";
    }else if(isListening&&bind){
        el.innerText="自动刷新：未开启；已绑定刷新按钮，可直接点状态栏“重绑刷新”";
        el.style.color="#b36b00";
    }else{
        el.innerText=bind?"自动刷新：未开启；已绑定刷新按钮DOM特征":"自动刷新：未开启；未绑定刷新按钮";
        el.style.color="#666";
    }
}

function requestListeningWakeLock(reason){
    if(!isListening)return;
    if(!navigator.wakeLock)return;
    if(document.visibilityState==="hidden")return;
    if(listeningWakeLock||listeningWakeLockPending)return;

    listeningWakeLockPending=true;

    navigator.wakeLock.request("screen").then(function(lock){
        listeningWakeLock=lock;
        listeningWakeLockPending=false;

        lock.addEventListener("release",function(){
            if(listeningWakeLock===lock)listeningWakeLock=null;
            updateStablePanelSoon();
        });

        updateStablePanelSoon();
    }).catch(function(e){
        listeningWakeLockPending=false;
        console.warn("[TikTok v"+SCRIPT_VERSION+"] wake lock failed:",reason,e);
    });
}

function releaseListeningWakeLock(){
    const lock=listeningWakeLock;
    listeningWakeLock=null;

    if(lock&&typeof lock.release==="function"){
        try{
            lock.release().catch(function(){});
        }catch(e){}
    }
}

function ensureListeningTimers(reason){
    let restarted=false;

    if(!isListening)return false;

    if(!scanTimer){
        scanTimer=setInterval(scan,SCAN_INTERVAL);
        restarted=true;
    }

    if(!autoRefreshTimer&&!autoRefreshPausedReason&&getRefreshBind()){
        startAutoRefresh();
        restarted=true;
    }

    if(restarted){
        console.info("[TikTok v"+SCRIPT_VERSION+"] listening timers recovered:",reason||"unknown");
        updateListenButton();
        updateStablePanelSoon();
    }

    return restarted;
}

function recoverListeningContinuity(reason){
    if(!isListening)return;

    const nowMs=Date.now();

    if(nowMs-lastContinuityRecoverAt<1500)return;
    lastContinuityRecoverAt=nowMs;

    ensureListeningTimers(reason);
    requestListeningWakeLock(reason);

    updateStatus("监听后台恢复："+(reason||"焦点恢复")+"，正在补扫当前页...");
    updateStablePanelSoon();

    setTimeout(function(){
        scan();
    },0);

    if(autoRefreshTimer&&autoRefreshNextAt&&nowMs>autoRefreshNextAt+3000&&!viewChangeProtecting){
        setTimeout(function(){
            if(isListening&&!viewChangeProtecting)autoRefreshPage();
        },500);
    }
}

function setupBackgroundContinuity(){
    if(backgroundContinuityReady)return;

    backgroundContinuityReady=true;

    document.addEventListener("visibilitychange",function(){
        if(!isListening)return;

        if(document.visibilityState==="visible"){
            recoverListeningContinuity("页面重新可见");
        }else{
            ensureListeningTimers("页面进入后台");
            updateStatus("页面已进入后台：监听不会主动暂停，切回时会自动补扫。");
            updateStablePanelSoon();
        }
    },false);

    window.addEventListener("focus",function(){
        recoverListeningContinuity("窗口重新获得焦点");
    },false);

    window.addEventListener("pageshow",function(){
        recoverListeningContinuity("页面恢复");
    },false);

    document.addEventListener("resume",function(){
        recoverListeningContinuity("浏览器恢复");
    },false);

    backgroundWatchdogTimer=setInterval(function(){
        if(!isListening){
            releaseListeningWakeLock();
            return;
        }

        ensureListeningTimers("心跳自检");
        requestListeningWakeLock("心跳自检");

        if(!lastScanAt||Date.now()-lastScanAt>BACKGROUND_STALE_MS){
            recoverListeningContinuity("监听心跳超时");
        }
    },BACKGROUND_WATCHDOG_INTERVAL);
}

function protectAfterViewChange(reason){
    if(!isListening)return;

    viewChangeProtecting=true;
    pageChangeGuardUntil=Date.now()+9000;

    if(viewChangeTimer)clearTimeout(viewChangeTimer);

    // v11.0：用户手动翻页/切TAB/筛选时，立即清空未打印队列，防止旧页面队列继续打印。
    try{
        if(typeof clearPrintQueue==="function"){
            clearPrintQueue("检测到页面切换/翻页，已清空未打印队列，防止旧单误打印。");
        }
    }catch(e){}

    const oldSig=getVisibleOrderSignature();
    updateStatus("检测到切换/筛选/翻页："+reason+"，暂停监听并把新页面作为起点，不会自动打印当前页旧订单...");

    viewChangeTimer=setTimeout(async function(){
        try{
            // 等 TikTok SPA 渲染稳定，再把当前可见订单标记为 seen。
            // 连续标记两次，避免第一次还在旧DOM或半加载状态。
            await wait(900);
            let count=markCurrentPageAsSeenForListening();
            await wait(1300);
            count=markCurrentPageAsSeenForListening();
            lastKnownVisibleSig=getVisibleOrderSignature()||oldSig||"";
            updateStatus("页面保护完成。当前页作为新起点，已记录 LIVE 订单 "+count+" 个；之后真正新增/Note变化才会打印。");
        }catch(e){
            updateStatus("页面保护完成时出错，但已阻止本次翻页误打印："+(e&&e.message?e.message:e));
        }finally{
            viewChangeProtecting=false;
            pageChangeGuardUntil=0;
        }
    },5200);
}

function isLikelyPaginationClick(btn,text){
    const s=norm(text);
    if(!s)return false;

    const lower=s.toLowerCase();
    if(
        lower.includes("next") || lower.includes("previous") || lower.includes("prev") ||
        s.includes("上一页") || s.includes("下一页") || s.includes("前一页") || s.includes("后一页")
    ) return true;

    if(lower.includes("per page") || lower.includes("/page") || lower.includes("items/page"))return true;

    // TikTok 底部页码常常只是 1 / 2 / 3 / ... / 263，旧逻辑没识别，所以翻页后会误打印。
    const isNumericPage=/^(\d{1,4}|…|\.\.\.)$/.test(s);
    if(!isNumericPage)return false;

    try{
        const el=btn;
        const rect=el&&el.getBoundingClientRect?el.getBoundingClientRect():null;
        const nearBottom=rect ? rect.top>window.innerHeight*0.55 : false;
        let p=el;
        let around="";
        for(let i=0;i<5&&p;i++){
            around += " "+norm(p.className||"")+" "+norm(p.getAttribute&&p.getAttribute("aria-label")||"")+" "+norm(p.innerText||p.textContent||"");
            p=p.parentElement;
        }
        around=around.toLowerCase();
        const looksPagination=around.includes("pagination")||around.includes("pager")||around.includes("page")||around.includes("/page")||around.includes("per page");
        const clickable=el&&el.matches&&el.matches("button,[role='button'],a,li,[tabindex],span,div");
        return !!(clickable&&(nearBottom||looksPagination));
    }catch(e){
        return false;
    }
}

function setupViewChangeProtect(){
    lastUrlForProtect=location.href;

    document.addEventListener("click",function(e){
        if(bindRefreshMode||bindNextMode)return;

        const panel=document.getElementById("tiktok-auto-print-panel-windows");
        const floatWin=document.getElementById("tk-print-floating-window");
        const reviewWin=document.getElementById("tk-review-window");
        const tip=document.getElementById("tk-bind-tip");

        if(panel&&panel.contains(e.target))return;
        if(floatWin&&floatWin.contains(e.target))return;
        if(reviewWin&&reviewWin.contains(e.target))return;
        if(tip&&tip.contains(e.target))return;

        const el=e.target;

        if(!el)return;

        const btn=el.closest?el.closest("button,[role='button'],a,li,div,span"):el;

        const text=norm(
            (btn&&(btn.innerText||btn.textContent||btn.getAttribute("aria-label")||btn.getAttribute("title"))) ||
            (el.innerText||el.textContent||el.getAttribute("aria-label")||el.getAttribute("title")) ||
            ""
        );

        const textLower=text.toLowerCase();

        const isTab=
            text==="All" ||
            text==="To ship" ||
            text==="Shipped" ||
            text==="Completed" ||
            text==="Pending" ||
            text==="Canceled";

        const isFilter=
            text.includes("Filter") ||
            text.includes("Apply") ||
            text.includes("Reset") ||
            text.includes("筛选") ||
            text.includes("应用") ||
            text.includes("重置");

        const isPage=
            textLower.includes("next") ||
            textLower.includes("previous") ||
            textLower.includes("prev") ||
            text.includes("上一页") ||
            text.includes("下一页") ||
            text.includes("前一页") ||
            text.includes("后一页") ||
            isLikelyPaginationClick(btn,text);

        const isRefresh=
            textLower.includes("refresh") ||
            text.includes("刷新");

        if(!isRefresh&&(isTab||isFilter||isPage)){
            protectAfterViewChange(text||"查看类型变化");
        }
    },true);

    setInterval(function(){
        if(!isListening)return;

        if(location.href!==lastUrlForProtect){
            lastUrlForProtect=location.href;
            protectAfterViewChange("页面地址变化");
        }
    },1200);
}

function summarizeInfos(infos){
    const total=infos.length;
    const live=infos.filter(x=>x.shouldPrint).length;
    const canceled=infos.filter(x=>x.isCanceled).length;
    const printed=infos.filter(x=>getTotalPrintCount(x.order)>0).length;
    const normalPrinted=infos.filter(x=>!x.isCanceled&&getTotalPrintCount(x.order)>0).length;
    const printedCanceled=infos.filter(x=>x.isCanceled&&getTotalPrintCount(x.order)>0).length;
    const missed=infos.filter(x=>canPrintInfo(x)&&getTotalPrintCount(x.order)===0).length;
    const cannot=infos.filter(cannotPrintInfo).length;

    return {
        total,
        live,
        canceled,
        printed,
        normalPrinted,
        printedCanceled,
        missed,
        cannot
    };
}

function scan(){
    if(!isListening)return;

    lastScanAt=Date.now();

    if(guardTikTokVerification("监听扫描已暂停"))return;

    if(viewChangeProtecting || Date.now()<pageChangeGuardUntil){
        updateStatus("页面切换/筛选/翻页保护中，当前页旧订单不会自动打印...");
        return;
    }

    const blocks=getOrderBlocks();
    const seen=getSeen();

    let empty=[];
    let skip=0;
    let toPrint=[];
    let infos=[];
    let canceledNoteBlocked=[];

    for(const block of blocks){
        const info=infoFromBlock(block);
        infos.push(info);

        const nNow=effectiveNote(info);
        const nOld=getLastNote(info.order);

        if(info.isCanceled){
            skip++;

            if(info.shouldPrint&&nNow){
                canceledNoteBlocked.push(info);

                if(!seen.has(info.order)){
                    raiseCanceledNoteAlert(
                        info,
                        "新增订单状态为 Canceled，但存在 Note，已阻止自动打印"
                    );
                }else{
                    raiseCanceledNoteAlert(
                        info,
                        "订单状态为 Canceled，但存在 Note，已阻止自动打印"
                    );
                }
            }

            seen.add(info.order);
            continue;
        }

        if(!info.shouldPrint){
            skip++;
            continue;
        }

        if(!nNow){
            empty.push(info.shortId);
            continue;
        }

        if(!seen.has(info.order)){
            toPrint.push({
                info,
                reason:"新增订单监听打印",
                opt:{}
            });
            continue;
        }

        if(nOld&&nNow!==nOld){
            toPrint.push({
                info,
                reason:"NOTE更新重打",
                opt:{
                    historyExtra:{
                        oldNote:nOld,
                        newNote:nNow
                    }
                }
            });
            continue;
        }

        if(seen.has(info.order)&&!nOld&&nNow){
            toPrint.push({
                info,
                reason:"Note补充后补打",
                opt:{}
            });
            continue;
        }
    }

    saveSeen(seen);

    const sum=summarizeInfos(infos);
    if(toPrint.length){
        toPrint.forEach(x=>enqueuePrint(x.info,x.reason,x.opt));

        updateStatus(
            "当前可见订单 "+sum.total+
            " 个，LIVE "+sum.live+
            " 个，Canceled "+sum.canceled+
            " 个，不能打印 "+sum.cannot+
            " 个，已打印后变Canceled "+sum.printedCanceled+
            " 个；发现 "+toPrint.length+
            " 个待打印订单，已加入队列。"+
            (canceledNoteBlocked.length?" 另有 "+canceledNoteBlocked.length+" 个 Canceled+Note 订单已报警并阻止打印。":"")
        );

        showCancelNoteAlertBox();
        return;
    }

    updateStatus(
        (
            empty.length
            ? "监听中：当前可见订单 "+sum.total+
              " 个，LIVE "+sum.live+
              " 个，Canceled "+sum.canceled+
              " 个，不能打印 "+sum.cannot+
              " 个，已打印后变Canceled "+sum.printedCanceled+
              " 个；有 "+empty.length+
              " 个 LIVE 订单 Note 为空："+empty.join(", ")+
              "；其他订单跳过 "+skip+" 个"
            : "监听中：当前可见订单 "+sum.total+
              " 个，LIVE "+sum.live+
              " 个，Canceled "+sum.canceled+
              " 个，不能打印 "+sum.cannot+
              " 个，已打印后变Canceled "+sum.printedCanceled+
              " 个；无新增待打印订单；其他订单跳过 "+skip+" 个"
        )+
        (
            canceledNoteBlocked.length
            ? "；报警："+canceledNoteBlocked.length+" 个 Canceled+Note 订单已阻止打印。"
            : ""
        )
    );

    showCancelNoteAlertBox();
    updateAutoRefreshText();
}

function collapseMainPanel(){
    const p=document.getElementById("tiktok-auto-print-panel-windows");

    if(p){
        setMainPanelCollapsed(true);
        applyMainPanelCollapsedState(p,true);
        normalizeMainPanelUiText();
        updateStablePanelSoon();
    }
}

function startListening(){
    if(!ensureOperatorName())return;
    if(guardTikTokVerification("暂不能启动监听"))return;
    clearListenPauseReason();
    isListening=true;
    viewChangeProtecting=false;
    lastScanAt=Date.now();

    const count=markCurrentPageAsSeenForListening();
    lastKnownVisibleSig=getVisibleOrderSignature()||"";

    lastUrlForProtect=location.href;

    updateListenButton();

    updateStatus("已启动监听。当前页作为起点，不会自动补打旧订单。已记录当前页有效 LIVE 订单 "+count+" 个。");

    if(scanTimer)clearInterval(scanTimer);

    scanTimer=setInterval(scan,SCAN_INTERVAL);

    setupBackgroundContinuity();
    requestListeningWakeLock("启动监听");
    startAutoRefresh();
    collapseMainPanel();
    normalizeMainPanelUiText();
}

function pauseListening(){
    setListenPauseReason("stoppedByUser","");
    clearPrintQueue("已暂停监听，并清空未打印队列。");
    isListening=false;
    viewChangeProtecting=false;
    stopAutoRefresh(true);

    if(viewChangeTimer){
        clearTimeout(viewChangeTimer);
        viewChangeTimer=null;
    }

    if(scanTimer){
        clearInterval(scanTimer);
        scanTimer=null;
    }

    releaseListeningWakeLock();
    updateListenButton();
    updateStatus("已暂停监听。不会自动打印新增订单。");
    normalizeMainPanelUiText();
}

function toggleListening(){
    if(isListening)pauseListening();
    else startListening();
}

function updateListenButton(){
    const btn=document.getElementById("listenToggleBtn");
    const headerBtn=document.getElementById("headerListenToggleBtn");

    if(isListening){
        if(btn){
            btn.innerText=tr("pauseListening");
            btn.style.background="#ffd6d6";
        }
        if(headerBtn){
            headerBtn.innerText=tr("pause");
            headerBtn.style.background="#ffd6d6";
        }
    }else{
        if(btn){
            btn.innerText=tr("startListening");
            btn.style.background="#d8f5d1";
        }
        if(headerBtn){
            headerBtn.innerText=tr("start");
            headerBtn.style.background="#d8f5d1";
        }
    }

    updateAutoRefreshText();
    normalizeMainPanelUiText();
}function matchSeparateFilters(o,noteFilter,liveFilter,statusFilter,printCountFilter){
    const hasNote=!!norm(effectiveNote(o));
    const printedCount=getTotalPrintCount(o.order);

    if(noteFilter==="hasNote"&&!hasNote)return false;
    if(noteFilter==="emptyNote"&&hasNote)return false;

    if(liveFilter==="live"&&!o.shouldPrint)return false;
    if(liveFilter==="notLive"&&o.shouldPrint)return false;

    if(statusFilter==="normal"&&o.isCanceled)return false;
    if(statusFilter==="canceled"&&!o.isCanceled)return false;
    if(statusFilter==="printedCanceled"&&!(o.isCanceled&&printedCount>0))return false;
    if(statusFilter==="cannotPrint"&&!cannotPrintInfo(o))return false;

    if(printCountFilter==="0"&&printedCount!==0)return false;
    if(printCountFilter==="1"&&printedCount!==1)return false;
    if(printCountFilter==="2"&&printedCount!==2)return false;
    if(printCountFilter==="3plus"&&printedCount<3)return false;

    return true;
}

function getSummaryFromInfos(infos){
    const allOrders=infos.slice();
    const liveOrders=allOrders.filter(x=>x.shouldPrint);
    const liveNoNote=liveOrders.filter(x=>x.orderType!=="LIVE Giveaway"&&!norm(stripPrintedMark(x.cleanNote||x.note)));
    const canceledOrders=allOrders.filter(x=>x.isCanceled);
    const printedCanceledOrders=allOrders.filter(x=>x.isCanceled&&getTotalPrintCount(x.order)>0);
    const cannotOrders=allOrders.filter(cannotPrintInfo);

    return {
        allOrders,
        liveOrders,
        totalCount:allOrders.length,
        liveCount:liveOrders.length,
        liveNoNoteCount:liveNoNote.length,
        canceledCount:canceledOrders.length,
        printedCanceledCount:printedCanceledOrders.length,
        cannotCount:cannotOrders.length
    };
}

function ensurePrintFloatingWindow(){
    let win=document.getElementById("tk-print-floating-window");

    if(win)return win;

    win=document.createElement("div");
    win.id="tk-print-floating-window";
    win.style.cssText=`
        position:fixed;
        right:18px;
        top:70px;
        width:1250px;
        max-width:86vw;
        max-height:88vh;
        background:white;
        z-index:1000000;
        border:2px solid #111;
        border-radius:10px;
        box-shadow:0 4px 30px rgba(0,0,0,.35);
        overflow:hidden;
        font-family:Arial;
        display:flex;
        flex-direction:column;
    `;

    win.innerHTML=`
        <div id="tkFloatHeader" style="padding:10px 12px;background:#111;color:white;font-weight:bold;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;user-select:none;">
            <span>WINDOWS电脑 - 当前页面订单打印 v${SCRIPT_VERSION}</span>
            <div style="display:flex;gap:6px;align-items:center;">
                <button id="tkFloatRescanBtn" style="background:#fff;color:#111;border:0;border-radius:4px;padding:4px 8px;cursor:pointer;">重新扫描</button>
                <button id="tkFloatRefreshRescanBtn" style="background:#fff7d6;color:#111;border:0;border-radius:4px;padding:4px 8px;cursor:pointer;">精确刷新后重新扫描</button>
                <button id="tkFloatMiniBtn" style="background:#eee;color:#111;border:0;border-radius:4px;padding:4px 8px;cursor:pointer;">收起</button>
                <button id="tkFloatCloseBtn" style="background:white;color:#111;border:0;border-radius:4px;padding:4px 8px;cursor:pointer;">关闭</button>
            </div>
        </div>

        <div id="tkFloatBody" style="display:flex;flex-direction:column;min-height:0;flex:1;">
            <div id="tkSummaryBox" style="padding:10px 12px;background:#fff7d6;border-bottom:1px solid #e6d28a;font-size:13px;line-height:1.5;"></div>

            <div style="padding:8px 12px;border-bottom:1px solid #ddd;display:grid;grid-template-columns:1fr 115px 115px 145px 130px 130px 165px 155px;gap:8px;align-items:center;">
                <input id="tkOrderSearchInput" placeholder="搜索订单号/后6位/Note/Title/快递单号" style="padding:7px 9px;border:1px solid #aaa;border-radius:5px;">

                <input id="tkDateFrom" type="date" style="padding:6px;border:1px solid #aaa;border-radius:5px;">
                <input id="tkDateTo" type="date" style="padding:6px;border:1px solid #aaa;border-radius:5px;">

                <select id="tkSortSelect" style="padding:7px;border:1px solid #aaa;border-radius:5px;">
                    <option value="new">订单时间：新到旧</option>
                    <option value="old">订单时间：旧到新</option>
                    <option value="printCount">历史打印次数：多到少</option>
                    <option value="canceled">Canceled优先</option>
                </select>

                <select id="tkNoteFilter" style="padding:7px;border:1px solid #aaa;border-radius:5px;">
                    <option value="all">NOTE：全部</option>
                    <option value="hasNote">有NOTE</option>
                    <option value="emptyNote">NOTE为空</option>
                </select>

                <select id="tkLiveFilter" style="padding:7px;border:1px solid #aaa;border-radius:5px;">
                    <option value="all">类型：全部</option>
                    <option value="live">LIVE订单</option>
                    <option value="notLive">橱窗订单</option>
                </select>

                <select id="tkOrderStatusFilter" style="padding:7px;border:1px solid #aaa;border-radius:5px;">
                    <option value="all">状态：全部</option>
                    <option value="normal">正常订单</option>
                    <option value="canceled">Canceled</option>
                    <option value="printedCanceled">已打印后Canceled</option>
                    <option value="cannotPrint">不能打印</option>
                </select>

                <select id="tkPrintCountFilter" style="padding:7px;border:1px solid #aaa;border-radius:5px;">
                    <option value="all">打印次数：全部</option>
                    <option value="0">打印0次</option>
                    <option value="1">打印1次</option>
                    <option value="2">打印2次</option>
                    <option value="3plus">打印3次以上</option>
                </select>
            </div>

            <div style="padding:8px 12px;border-bottom:1px solid #ddd;">
                <label style="font-weight:bold;cursor:pointer;">
                    <input type="checkbox" id="tkSelectAllBtn"> 全选当前筛选后的可打印订单
                </label>
                <span style="font-size:12px;color:#666;margin-left:10px;">v${SCRIPT_VERSION}：当前页面订单打印</span>
            </div>

            <div id="tkRowsBox" style="padding:0 12px;overflow:auto;min-height:160px;flex:1;"></div>

            <div style="padding:10px 12px;border-top:1px solid #ddd;display:flex;gap:10px;justify-content:flex-end;align-items:center;background:white;">
                <span id="tkSelectedCountText" style="font-size:13px;font-weight:bold;color:#111;margin-right:8px;">已选择 0 个订单</span>
                <button id="tkConfirmPrintBtn" style="padding:8px 18px;border:0;background:#111;color:white;border-radius:6px;cursor:pointer;font-weight:bold;">批量打印勾选订单</button>
            </div>
        </div>
    `;

    document.body.appendChild(win);

    makeFloatingWindowDraggable(win,"#tkFloatHeader");
    focusFloatingWorkWindow(win);

    document.getElementById("tkFloatCloseBtn").onclick=function(){
        removeFloatingWorkWindow(win);
    };

    document.getElementById("tkFloatMiniBtn").onclick=function(e){
        e.stopPropagation();

        const body=document.getElementById("tkFloatBody");
        const isHidden=body.style.display==="none";

        if(isHidden){
            body.style.display="flex";
            this.innerText="收起";
            win.style.width="1250px";
        }else{
            body.style.display="none";
            this.innerText="展开";
            win.style.width="410px";
        }
    };

    document.getElementById("tkFloatRescanBtn").onclick=function(e){
        e.stopPropagation();
        refreshPrintListFloatingWindow(false);
    };

    document.getElementById("tkFloatRefreshRescanBtn").onclick=function(e){
        e.stopPropagation();
        refreshPrintListFloatingWindow(true);
    };

    [
        "tkOrderSearchInput",
        "tkDateFrom",
        "tkDateTo",
        "tkSortSelect",
        "tkNoteFilter",
        "tkLiveFilter",
        "tkOrderStatusFilter",
        "tkPrintCountFilter"
    ].forEach(id=>{
        const el=document.getElementById(id);
        el.addEventListener("input",renderPrintFloatingRows);
        el.addEventListener("change",renderPrintFloatingRows);
    });

    document.getElementById("tkSelectAllBtn").onchange=function(){
        const checked=this.checked;

        win.querySelectorAll(".tk-print-check:not(:disabled)").forEach(chk=>{
            chk.checked=checked;
        });

        updateSelectedCountInFloatingWindow();
    };

    document.getElementById("tkConfirmPrintBtn").onclick=function(){
        if(!requireListeningPausedForAction("批量打印勾选订单"))return;

        const selected=[...win.querySelectorAll(".tk-print-check:checked")].map(x=>x.value);

        if(!selected.length){
            alert("请至少勾选一个可打印订单。");
            return;
        }

        const infos=selected
            .map(id=>currentPrintListInfos.find(o=>o.order===id))
            .filter(Boolean);

        printLabelsBatch(sortCurrentPagePrintQueueByTitle(infos),"手动批量打印当前页面订单",{force:true});
        renderPrintFloatingRows();
    };

    return win;
}

async function refreshPrintListFloatingWindow(refreshBeforeScan){
    ensurePrintFloatingWindow();

    currentPrintListInfos=[];
    currentPrintListLastScanAt="";

    const rowsBox=document.getElementById("tkRowsBox");
    const summaryBox=document.getElementById("tkSummaryBox");

    if(rowsBox){
        rowsBox.innerHTML='<div style="padding:24px;text-align:center;color:#666;">正在扫描当前页面订单，请稍等...</div>';
    }

    if(summaryBox){
        summaryBox.innerHTML="正在扫描当前页面订单...";
    }

    updateStatus(refreshBeforeScan?"准备精确刷新后重新扫描...":"正在重新扫描当前页面订单...");

    if(refreshBeforeScan){
        const btn=findRefreshButton();

        if(!btn){
            updateStatus("无法精确确认刷新按钮，未刷新。请重新绑定刷新按钮。");

            if(summaryBox){
                summaryBox.innerHTML='<span style="color:red;font-weight:bold;">无法精确确认刷新按钮，未刷新。请重新绑定刷新按钮。</span>';
            }

            return;
        }

        btn.click();
        updateStatus("已精确点击刷新按钮，等待页面更新后扫描...");
        await wait(2600);
    }

    const blocks=await collectCurrentListOrderBlocksByScroll();
    const infoMap={};

    blocks.forEach(b=>{
        const info=infoFromBlock(b);
        infoMap[info.order]=info;
    });

    currentPrintListInfos=Object.values(infoMap).sort((a,b)=>(b.orderDateValue||0)-(a.orderDateValue||0));
    currentPrintListLastScanAt=now();
    renderPrintFloatingRows();

    updateStatus("当前页面订单打印窗口已更新：扫描到 "+currentPrintListInfos.length+" 个订单。");
}

function getFilteredPrintListInfos(){
    const qEl=document.getElementById("tkOrderSearchInput");
    const fromEl=document.getElementById("tkDateFrom");
    const toEl=document.getElementById("tkDateTo");
    const sortEl=document.getElementById("tkSortSelect");
    const noteFilterEl=document.getElementById("tkNoteFilter");
    const liveFilterEl=document.getElementById("tkLiveFilter");
    const statusFilterEl=document.getElementById("tkOrderStatusFilter");
    const printCountFilterEl=document.getElementById("tkPrintCountFilter");

    const q=qEl?norm(qEl.value).toLowerCase():"";
    const from=fromEl?fromEl.value:"";
    const to=toEl?toEl.value:"";
    const sort=sortEl?sortEl.value:"new";
    const noteFilter=noteFilterEl?noteFilterEl.value:"all";
    const liveFilter=liveFilterEl?liveFilterEl.value:"all";
    const statusFilter=statusFilterEl?statusFilterEl.value:"all";
    const printCountFilter=printCountFilterEl?printCountFilterEl.value:"all";

    let arr=currentPrintListInfos.filter(o=>{
        if(from&&(!o.orderDate||o.orderDate<from))return false;
        if(to&&(!o.orderDate||o.orderDate>to))return false;

        if(!matchSeparateFilters(o,noteFilter,liveFilter,statusFilter,printCountFilter))return false;

        if(q){
            const txt=[
                o.order,
                o.shortId,
                o.title,
                effectiveNote(o),
                o.note,
                o.orderType,
                o.orderStatus,
                o.time,
                o.trackingText,
                String(getTotalPrintCount(o.order))
            ].join(" ").toLowerCase();

            if(!txt.includes(q))return false;
        }

        return true;
    });

    arr.sort((a,b)=>{
        if(sort==="old")return (a.orderDateValue||0)-(b.orderDateValue||0);
        if(sort==="printCount")return getTotalPrintCount(b.order)-getTotalPrintCount(a.order);
        if(sort==="canceled")return Number(b.isCanceled)-Number(a.isCanceled)||(b.orderDateValue||0)-(a.orderDateValue||0);
        return (b.orderDateValue||0)-(a.orderDateValue||0);
    });

    return arr;
}

function currentPagePrintTitleSortKey(info){
    const title=norm(info&&info.title);
    return title?title.toLowerCase():"\uffff";
}

function sortCurrentPagePrintQueueByTitle(infos){
    return (infos||[]).slice().sort((a,b)=>{
        const titleCompare=currentPagePrintTitleSortKey(a).localeCompare(currentPagePrintTitleSortKey(b),undefined,{numeric:true,sensitivity:"base"});
        if(titleCompare)return titleCompare;
        return (b&&b.orderDateValue||0)-(a&&a.orderDateValue||0) || String(a&&a.order||"").localeCompare(String(b&&b.order||""));
    });
}

function updateSelectedCountInFloatingWindow(){
    const win=document.getElementById("tk-print-floating-window");

    if(!win)return;

    const count=win.querySelectorAll(".tk-print-check:checked").length;
    const el=document.getElementById("tkSelectedCountText");

    if(el){
        el.innerText="已选择 "+count+" 个订单";
        el.style.color=count?"green":"#111";
    }
}

function renderPrintFloatingRows(){
    const win=ensurePrintFloatingWindow();
    const rowsBox=document.getElementById("tkRowsBox");
    const summaryBox=document.getElementById("tkSummaryBox");
    const arr=getFilteredPrintListInfos();
    const s=getSummaryFromInfos(arr);
    const fullSummary=getSummaryFromInfos(currentPrintListInfos);

    if(summaryBox){
        summaryBox.innerHTML=`
            <b>当前筛选汇总：</b>
            订单 <b>${s.totalCount}</b> 个；
            LIVE <b>${s.liveCount}</b> 个；
            Canceled <b style="color:red;">${s.canceledCount}</b> 个；
            不能打印 <b style="color:red;">${s.cannotCount}</b> 个；
            已打印后变Canceled <b style="color:red;">${s.printedCanceledCount}</b> 个；
            LIVE但没有Note <b style="color:red;">${s.liveNoNoteCount}</b> 个；
            可打印 <b>${arr.filter(canPrintInfo).length}</b> 个。
            <br>
            <span style="color:#666;">
                原始扫描：订单 ${fullSummary.totalCount} 个，
                LIVE ${fullSummary.liveCount} 个，
                Canceled ${fullSummary.canceledCount} 个，
                不能打印 ${fullSummary.cannotCount} 个。
                最后扫描：${esc(currentPrintListLastScanAt||"未扫描")}
            </span>
        `;
    }

    if(rowsBox){
        rowsBox.innerHTML=arr.map(o=>{
            const cleanNote=effectiveNote(o);
            const hasNote=!!norm(cleanNote);
            const printedCount=getTotalPrintCount(o.order);
            const printedCanceled=o.isCanceled&&printedCount>0;
            const disabled=!canPrintInfo(o)?"disabled":"";
            const printedColor=printedCount?"red":"green";
            const borderColor=printedCanceled?"#ff3333":(o.isCanceled?"#ff9999":(cannotPrintInfo(o)?"#999":"#cfcfcf"));
            const bgColor=printedCanceled?"#ffe6e6":(o.isCanceled?"#fff1f1":(cannotPrintInfo(o)?"#f3f3f3":"white"));

            return `
                <label style="display:block;border:2px solid ${borderColor};border-radius:8px;margin:8px 0;padding:10px;cursor:${disabled?"not-allowed":"pointer"};opacity:${disabled?".72":"1"};background:${bgColor};">
                    <input class="tk-print-check" type="checkbox" value="${esc(o.order)}" ${disabled}>

                    <b style="font-size:18px;">${esc(o.shortId)}</b>
                    <span style="margin-left:6px;color:#555;">${esc(o.orderType||"橱窗订单")}</span>
                    <span style="margin-left:6px;color:#555;">${esc(o.orderStatus||"Unknown")}</span>

                    ${isGiftOrder(o)?'<span style="margin-left:8px;color:#0a7a0a;font-weight:bold;">FOR FREE</span>':""}
                    ${o.isCanceled?'<span style="margin-left:8px;color:red;font-weight:bold;">Canceled</span>':""}
                    ${printedCanceled?'<span style="margin-left:8px;color:red;font-weight:bold;">已打印后变Canceled，请注意</span>':""}
                    ${cannotPrintInfo(o)?'<span style="margin-left:8px;color:#555;font-weight:bold;">不能打印</span>':""}

                    <span style="margin-left:10px;font-size:12px;font-weight:bold;">
                        历史打印次数：
                        <span style="font-size:16px;color:${printedColor};">${printedCount}</span> 次
                    </span>

                    <div style="font-size:12px;color:#333;margin-top:4px;word-break:break-all;">
                        完整订单号：${esc(o.order)}
                        <button class="copyOrderBtn" data-order="${esc(o.order)}" style="margin-left:8px;padding:2px 8px;border:1px solid #888;border-radius:4px;background:#f5f5f5;cursor:pointer;font-size:12px;">复制</button>
                    </div>

                    <div style="font-size:13px;color:#111;margin-top:4px;font-weight:bold;">
                        订单时间：${esc(formatTimeNoYear(o.time))}
                    </div>

                    <div style="font-size:13px;color:#111;margin-top:4px;font-weight:bold;">
                        Title: ${esc(o.title)}
                    </div>

                    <div style="font-size:13px;color:#000;margin-top:4px;font-weight:bold;">
                        Note: ${hasNote?esc(cleanNote):"Note为空，不能打印"}
                    </div>

                    <div style="font-size:12px;color:#333;margin-top:4px;">
                        快递单号：${esc(o.trackingText||"无/未识别")}
                    </div>
                </label>
            `;
        }).join("")||'<div style="padding:24px;text-align:center;color:#666;">没有符合筛选条件的订单</div>';
    }

    win.querySelectorAll(".tk-print-check").forEach(chk=>{
        chk.addEventListener("change",updateSelectedCountInFloatingWindow);
    });

    win.querySelectorAll(".copyOrderBtn").forEach(btn=>{
        btn.addEventListener("click",function(e){
            e.preventDefault();
            e.stopPropagation();

            const order=this.getAttribute("data-order")||"";

            copyTextToClipboard(order).then(()=>{
                this.innerText="已复制";
                setTimeout(()=>{
                    this.innerText="复制";
                },1000);
            });
        });
    });

    const allBtn=document.getElementById("tkSelectAllBtn");
    if(allBtn)allBtn.checked=false;

    updateSelectedCountInFloatingWindow();
}

async function openCurrentPagePrintDialog(){
    if(!requireListeningPausedForAction("打印当前页"))return;
    ensurePrintFloatingWindow();
    await refreshPrintListFloatingWindow(false);
}async function openHistory(){
    if(!ensureOperatorName())return;
    const winId="tk-cloud-history-window-v101";
    let win=document.getElementById(winId);
    if(!win){
        win=document.createElement("div");
        win.id=winId;
        win.style.cssText="position:fixed;left:80px;top:70px;width:980px;height:640px;max-width:94vw;max-height:90vh;resize:both;overflow:hidden;z-index:2147483600;background:#fff;border:2px solid #111;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.35);font-family:Arial,'Microsoft YaHei',sans-serif;display:flex;flex-direction:column;";
        win.innerHTML=
            '<div id="tkHistHeader" style="background:#111;color:#fff;padding:9px 12px;font-weight:900;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;">'+
                '<span>查看历史 v'+SCRIPT_VERSION+'</span><div style="display:flex;gap:6px;"><button id="tkHistReload" style="background:#fff;color:#111;border:0;border-radius:4px;padding:4px 9px;cursor:pointer;">重新读取</button><button id="tkHistClose" style="background:#ff3b30;color:#fff;border:0;border-radius:4px;padding:4px 9px;cursor:pointer;">关闭</button></div>'+
            '</div>'+
            '<div style="padding:8px 12px;border-bottom:1px solid #ddd;display:grid;grid-template-columns:1fr 120px 120px 140px 130px;gap:8px;align-items:center;">'+
                '<input id="tkHistSearch" placeholder="搜索订单号/后6位/Note/Title/操作人" style="padding:7px;border:1px solid #aaa;border-radius:5px;">'+
                '<input id="tkHistFrom" type="date" style="padding:6px;border:1px solid #aaa;border-radius:5px;">'+
                '<input id="tkHistTo" type="date" style="padding:6px;border:1px solid #aaa;border-radius:5px;">'+
                '<select id="tkHistStatus" style="padding:7px;border:1px solid #aaa;border-radius:5px;"><option value="all">状态：全部</option><option value="Canceled">Canceled</option><option value="Awaiting collection">Awaiting collection</option><option value="Awaiting shipment">Awaiting shipment</option><option value="In transit">In transit</option><option value="Delivered">Delivered</option></select>'+
                '<select id="tkHistPrintCount" style="padding:7px;border:1px solid #aaa;border-radius:5px;"><option value="all">打印次数：全部</option><option value="0">0次</option><option value="1">1次</option><option value="2">2次</option><option value="3plus">3次以上</option></select>'+
            '</div>'+
            '<div id="tkHistSummary" style="padding:8px 12px;background:#fff7d6;border-bottom:1px solid #e6d28a;font-size:13px;"></div>'+
            '<div id="tkHistRows" style="padding:8px 12px;overflow:auto;flex:1;background:#fafafa;"></div>';
        document.body.appendChild(win);
        makeFloatingWindowDraggable(win,"#tkHistHeader");
        focusFloatingWorkWindow(win);
        document.getElementById("tkHistClose").onclick=function(){removeFloatingWorkWindow(win);};
        document.getElementById("tkHistReload").onclick=function(){loadAndRenderCloudHistory();};
        ["tkHistSearch","tkHistFrom","tkHistTo","tkHistStatus","tkHistPrintCount"].forEach(id=>{const el=document.getElementById(id);el.oninput=renderCloudHistoryRows;el.onchange=renderCloudHistoryRows;});
    }
    win.style.display="flex";
    focusFloatingWorkWindow(win);
    await loadAndRenderCloudHistory();
}
let tkHistoryCloudRows=[];
let tkHistorySourceLabel="云端";
let tkHistoryNoticeText="";
let tkHistoryOperatorHydrating=false;
function historyOperatorNameFrom(){
    for(let i=0;i<arguments.length;i++){
        const d=arguments[i]||{};
        const name=norm(
            d.latestOperatorName||
            d.operatorName||
            d.latestReviewOperatorName||
            d.reviewOperatorName||
            d.latestPrintOperatorName||
            d.printOperatorName||
            d.lastOperatorName||
            d.latestPrintedBy||
            d.printedBy||
            d.latestReviewedBy||
            d.reviewedBy||
            d.operator||
            d.operatorUser||
            d.operatorUsername||
            d.userName||
            d.username||
            d.createdBy||
            d.updatedBy||
            ""
        );
        if(name)return name;
    }
    return "";
}
function normalizeCloudHistoryDoc(id,d){
    id=id||d.order||d.orderId||d.__docId||"";
    return {
        order:id,
        shortId:d.shortId||String(id).slice(-6),
        title:d.title||"",
        time:d.time||d.orderTime||"",
        orderDate:d.orderDate||orderDateOnly(d.time||""),
        orderDateValue:Number(d.orderDateValue||parseOrderDateValue(d.time||"")||0),
        note:stripPrintedMark(d.latestNote||d.note||""),
        orderType:d.orderType||"LIVE",
        orderStatus:d.latestStatus||d.orderStatus||"Unknown",
        operatorName:historyOperatorNameFrom(d),
        printedAt:formatDisplayLocalTime(d.latestPrintedAt||d.printedAt||d.updatedAt||d.latestPrintedAtIso||d.printedAtIso||d.updatedAtIso||""),
        printedAtRaw:d.latestPrintedAt||d.printedAt||d.updatedAt||d.latestPrintedAtIso||d.printedAtIso||d.updatedAtIso||"",
        printedAtMs:Number(d.latestPrintedAtMs||d.printedAtMs||d.updatedAtMs||0),
        printCount:Number(d.printCount||0),
        latestReviewAt:formatDisplayLocalTime(d.latestReviewAt||d.latestReviewAtIso||""),
        trackingText:d.latestReviewTrackingText||d.trackingText||""
    };
}

function normalizeCloudPrintLogDoc(d){
    d=d||{};
    const order=String(d.order||d.orderId||"");
    const printedAtRaw=d.printedAt||d.latestPrintedAt||d.printedAtIso||d.latestPrintedAtIso||d.updatedAt||d.updatedAtIso||"";
    const printedAtMs=Number(d.printedAtMs||d.latestPrintedAtMs||d.updatedAtMs||0)||parseAnyDateValue(printedAtRaw)||0;

    return Object.assign({},d,{
        order,
        orderId:String(d.orderId||order||""),
        shortId:d.shortId||String(order).slice(-6),
        title:d.title||"",
        time:d.time||d.orderTime||"",
        orderDate:d.orderDate||orderDateOnly(d.time||d.orderTime||""),
        orderDateValue:Number(d.orderDateValue||parseOrderDateValue(d.time||d.orderTime||"")||0),
        note:stripPrintedMark(d.newNote||d.latestNote||d.note||d.systemNote||""),
        orderType:d.orderType||"",
        orderStatus:d.latestStatus||d.orderStatus||"",
        operatorName:historyOperatorNameFrom(d),
        printedAt:formatDisplayLocalTime(printedAtRaw),
        printedAtRaw,
        printedAtMs,
        printEventId:d.printEventId||d.__docId||""
    });
}

async function loadCloudPrintLogsForHistory(){
    let via="SDK";
    let rows=[];

    if(!shouldUseCloudRestFirst()&&await waitForFirebaseCloud(1500)){
        try{
            const snap=await runCloudOperation("读取打印流水",()=>tkCloudDb.collection("tiktok_print_logs").get(),3);
            snap.forEach(doc=>{
                rows.push(normalizeCloudPrintLogDoc(Object.assign({__docId:doc.id},doc.data()||{})));
            });
        }catch(sdkError){
            if(!isTransientCloudError(sdkError))throw sdkError;
            rows=(await listRestCollection("tiktok_print_logs",3000)).map(normalizeCloudPrintLogDoc);
            via="REST";
        }
    }else{
        rows=(await listRestCollection("tiktok_print_logs",3000)).map(normalizeCloudPrintLogDoc);
        via="REST";
    }

    rows=mergeUniqueLogRows(rows).filter(x=>x&&x.order).sort((a,b)=>(Number(b.printedAtMs||0)||parseAnyDateValue(b.printedAtRaw||b.printedAt||""))-(Number(a.printedAtMs||0)||parseAnyDateValue(a.printedAtRaw||a.printedAt||"")));
    return {rows,via};
}

function applyCloudPrintLogsToHistoryRows(historyRows,printLogs){
    const map={};

    (historyRows||[]).forEach(row=>{
        if(row&&row.order)map[String(row.order)]=row;
    });

    (printLogs||[]).forEach(log=>{
        const order=String(log.order||log.orderId||"");
        if(!order)return;

        if(!map[order]){
            map[order]={
                order,
                shortId:log.shortId||order.slice(-6),
                title:log.title||"",
                time:log.time||"",
                orderDate:log.orderDate||orderDateOnly(log.time||""),
                orderDateValue:Number(log.orderDateValue||parseOrderDateValue(log.time||"")||0),
                note:stripPrintedMark(log.note||""),
                orderType:log.orderType||"",
                orderStatus:log.orderStatus||"Unknown",
                operatorName:"",
                printedAt:"",
                printedAtRaw:"",
                printedAtMs:0,
                printCount:0,
                latestReviewAt:"",
                trackingText:"",
                cloudPrintLogs:[]
            };
        }

        const row=map[order];
        if(!Array.isArray(row.cloudPrintLogs))row.cloudPrintLogs=[];
        row.cloudPrintLogs.push(log);
    });

    Object.keys(map).forEach(order=>{
        const row=map[order];
        const logs=mergeUniqueLogRows(row.cloudPrintLogs||[]).map(normalizeCloudPrintLogDoc).filter(x=>x&&x.order);
        logs.sort((a,b)=>(Number(b.printedAtMs||0)||parseAnyDateValue(b.printedAtRaw||b.printedAt||""))-(Number(a.printedAtMs||0)||parseAnyDateValue(a.printedAtRaw||a.printedAt||"")));
        row.cloudPrintLogs=logs;

        if(logs.length){
            const latest=logs[0];
            row.printCount=Math.max(Number(row.printCount||0),logs.length);
            row.shortId=latest.shortId||row.shortId||order.slice(-6);
            row.title=latest.title||row.title||"";
            row.time=latest.time||row.time||"";
            row.orderDate=latest.orderDate||row.orderDate||orderDateOnly(latest.time||"");
            row.orderDateValue=Number(latest.orderDateValue||row.orderDateValue||parseOrderDateValue(latest.time||"")||0);
            row.note=stripPrintedMark(latest.note||row.note||"");
            row.orderType=latest.orderType||row.orderType||"";
            row.orderStatus=latest.orderStatus||row.orderStatus||"Unknown";
            row.operatorName=historyOperatorNameFrom(latest)||row.operatorName||"";
            row.printedAt=latest.printedAt||row.printedAt||"";
            row.printedAtRaw=latest.printedAtRaw||row.printedAtRaw||"";
            row.printedAtMs=Number(latest.printedAtMs||row.printedAtMs||0)||parseAnyDateValue(row.printedAtRaw||row.printedAt||"");
        }
    });

    return Object.values(map);
}

function applyLocalHistoryRowsToHistoryRows(historyRows,localRows){
    const map={};

    (historyRows||[]).forEach(row=>{
        if(row&&row.order)map[String(row.order)]=row;
    });

    (localRows||[]).forEach(local=>{
        const order=String(local&&local.order||"");
        if(!order)return;

        if(!map[order]){
            map[order]=Object.assign({},local,{
                localOnly:true,
                cloudMissing:true,
                localLogs:Array.isArray(local.localLogs)?local.localLogs.slice():[],
                cloudPrintLogs:[]
            });
            return;
        }

        const row=map[order];
        const localCount=Number(local.printCount||0);
        const cloudCount=Number(row.printCount||0);
        row.localPrintCount=localCount;
        row.printCount=Math.max(cloudCount,localCount);
        row.localLogs=mergeUniqueLogRows((Array.isArray(row.localLogs)?row.localLogs:[]).concat(Array.isArray(local.localLogs)?local.localLogs:[]));

        const localMs=Number(local.printedAtMs||0)||parseAnyDateValue(local.printedAtRaw||local.printedAt||"");
        const rowMs=Number(row.printedAtMs||0)||parseAnyDateValue(row.printedAtRaw||row.printedAt||"");

        if(localMs>=rowMs){
            row.shortId=local.shortId||row.shortId||order.slice(-6);
            row.title=local.title||row.title||"";
            row.time=local.time||row.time||"";
            row.orderDate=local.orderDate||row.orderDate||orderDateOnly(local.time||"");
            row.orderDateValue=Number(local.orderDateValue||row.orderDateValue||parseOrderDateValue(local.time||"")||0);
            row.note=stripPrintedMark(local.note||row.note||"");
            row.orderType=local.orderType||row.orderType||"";
            row.orderStatus=local.orderStatus||row.orderStatus||"Unknown";
            row.operatorName=historyOperatorNameFrom(local)||row.operatorName||"";
            row.printedAt=local.printedAt||row.printedAt||"";
            row.printedAtRaw=local.printedAtRaw||row.printedAtRaw||"";
            row.printedAtMs=localMs||rowMs||0;
            row.latestReviewAt=local.latestReviewAt||row.latestReviewAt||"";
            row.trackingText=local.trackingText||row.trackingText||"";
        }
    });

    return Object.values(map);
}

function makeLocalBackfillPrintEventId(order,log,index){
    const ms=Number(log&&log.printedAtMs||0)||parseAnyDateValue(log&&log.printedAt||log&&log.printedAtIso||"")||0;
    const op=historyOperatorNameFrom(log)||"unknown";
    return [
        "local_backfill",
        String(order).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)||"order",
        String(ms||index||0),
        op.replace(/[^a-zA-Z0-9_-]/g,"").slice(0,30)||"op",
        String(index||0)
    ].join("_");
}

function makeCloudDocFromLocalHistoryLog(row,log,index){
    const order=String(row&&row.order||log&&log.order||"");
    const printedAt=log&&log.printedAt?log.printedAt:(row&&row.printedAt?row.printedAt:now());
    const printedAtMs=Number(log&&log.printedAtMs||0)||parseAnyDateValue(log&&log.printedAt||row&&row.printedAtRaw||row&&row.printedAt||"")||Date.now();
    const printedAtIso=log&&log.printedAtIso?log.printedAtIso:new Date(printedAtMs).toISOString();
    const op=historyOperatorNameFrom(log,row)||getOperatorName()||"UNKNOWN";
    const note=stripPrintedMark(log&&log.newNote||log&&log.note||row&&row.note||"");
    const printEventId=makeLocalBackfillPrintEventId(order,log,index);

    return {
        operatorName:op,
        latestOperatorName:op,
        clientId:getClientId(),
        tabId:getTabId(),
        scriptVersion:SCRIPT_VERSION,
        pageUrl:location.href,
        order:order,
        orderId:order,
        shortId:row&&row.shortId||String(order).slice(-6),
        title:row&&row.title||"",
        time:row&&row.time||"",
        orderDate:row&&row.orderDate||orderDateOnly(row&&row.time||""),
        orderDateValue:row&&row.orderDateValue||parseOrderDateValue(row&&row.time||""),
        note:note,
        latestNote:note,
        orderType:row&&row.orderType||"",
        orderStatus:log&&log.orderStatus||row&&row.orderStatus||"",
        quantity:Number(log&&log.quantity||row&&row.quantity||1)||1,
        gmv:Number(log&&log.gmv||row&&row.gmv||0)||0,
        gmvText:log&&log.gmvText||row&&row.gmvText||formatMoneyAmount(log&&log.gmv||row&&row.gmv||0),
        latestStatus:log&&log.orderStatus||row&&row.orderStatus||"",
        latestReason:log&&log.reason||"本机历史补写",
        latestPrintedAt:printedAt,
        latestPrintedAtIso:printedAtIso,
        latestPrintedAtMs:printedAtMs,
        updatedAt:printedAt,
        updatedAtIso:printedAtIso,
        updatedAtMs:printedAtMs,
        printEventId:printEventId,
        lastPrintEventId:printEventId
    };
}

function enqueueLocalHistoryBackfillForCloud(rows,limit){
    let added=0;
    const max=Math.max(1,Number(limit||80)||80);

    (rows||[]).forEach(row=>{
        if(added>=max||!row||!row.order)return;

        const localLogs=mergeUniqueLogRows(Array.isArray(row.localLogs)?row.localLogs:[]);
        if(!localLogs.length)return;

        const cloudLogs=Array.isArray(row.cloudPrintLogs)?row.cloudPrintLogs:[];
        const deficit=Math.max(0,localLogs.length-cloudLogs.length);
        if(!deficit)return;

        localLogs
            .slice()
            .sort((a,b)=>parseAnyDateValue(b.printedAt||b.printedAtIso||"")-parseAnyDateValue(a.printedAt||a.printedAtIso||""))
            .slice(0,deficit)
            .forEach((log,index)=>{
                if(added>=max)return;
                const doc=makeCloudDocFromLocalHistoryLog(row,log,index);
                const before=getCloudPendingPrintCount();
                enqueueCloudPendingPrint(row.order,doc,log&&log.reason||"本机历史补写",{oldNote:log&&log.oldNote||"",newNote:log&&log.newNote||log&&log.note||row.note||""},null);
                if(getCloudPendingPrintCount()>before)added++;
            });
    });

    if(added)scheduleCloudPendingFlush(1500);
    return added;
}

function loadLocalHistoryRows(){
    const h=getJson(HISTORY_KEY,{});
    const map={};

    Object.keys(h).forEach(date=>{
        const day=h[date]||{};

        Object.keys(day).forEach(orderId=>{
            const item=day[orderId]||{};
            const order=String(item.order||orderId||"");

            if(!order)return;

            if(!map[order]){
                map[order]={
                    order,
                    shortId:item.shortId||order.slice(-6),
                    title:"",
                    time:"",
                    orderDate:"",
                    orderDateValue:0,
                    note:"",
                    orderType:"",
                    orderStatus:"Unknown",
                    operatorName:"",
                    printedAt:"",
                    printedAtRaw:"",
                    printedAtMs:0,
                    printCount:0,
                    latestReviewAt:"",
                    trackingText:"",
                    localLogs:[]
                };
            }

            const row=map[order];
            const itemPrintCount=Number(item.printCount||0);
            const itemPrintedMs=parseAnyDateValue(item.printedAt||date);

            row.printCount+=itemPrintCount;

            if(Array.isArray(item.logs)){
                row.localLogs=row.localLogs.concat(item.logs.map(log=>Object.assign({order:order},log||{})));
            }

            if(itemPrintedMs>=Number(row.printedAtMs||0)){
                const latestLog=Array.isArray(item.logs)&&item.logs.length?item.logs[item.logs.length-1]:null;
                row.shortId=item.shortId||row.shortId||order.slice(-6);
                row.title=item.title||row.title||"";
                row.time=item.time||row.time||"";
                row.orderDate=item.orderDate||orderDateOnly(item.time||"")||row.orderDate||date;
                row.orderDateValue=Number(item.orderDateValue||parseOrderDateValue(item.time||"")||row.orderDateValue||0);
                row.note=stripPrintedMark(item.note||row.note||"");
                row.orderType=item.orderType||row.orderType||"";
                row.orderStatus=item.latestReviewStatus||item.orderStatus||row.orderStatus||"Unknown";
                row.operatorName=historyOperatorNameFrom(item,latestLog)||row.operatorName||"";
                row.printedAt=formatDisplayLocalTime(item.printedAt||"");
                row.printedAtRaw=item.printedAt||"";
                row.printedAtMs=itemPrintedMs||0;
                row.latestReviewAt=formatDisplayLocalTime(item.latestReviewAt||item.latestReviewAtIso||"");
                row.trackingText=item.latestReviewTrackingText||row.trackingText||"";
            }
        });
    });

    return Object.values(map).sort((a,b)=>(b.printedAtMs||b.orderDateValue||0)-(a.printedAtMs||a.orderDateValue||0));
}

function loadLocalPrintLogRowsForOrder(orderId){
    const order=String(orderId||"");
    const row=tkHistoryCloudRows.find(x=>x.order===order);
    let logs=row&&Array.isArray(row.localLogs)?row.localLogs.slice():[];

    if(!logs.length){
        const h=getJson(HISTORY_KEY,{});
        Object.keys(h).forEach(date=>{
            const item=h[date]&&h[date][order];
            if(item&&Array.isArray(item.logs)){
                logs=logs.concat(item.logs.map(log=>Object.assign({order:order},log||{})));
            }
        });
    }

    return logs
        .filter(log=>{
            const reason=String(log.reason||"");
            return !log.reviewOnly&&!/^复核/.test(reason)&&reason.indexOf("复核扫描")<0;
        })
        .sort((a,b)=>parseAnyDateValue(b.printedAt||b.printedAtIso||"")-parseAnyDateValue(a.printedAt||a.printedAtIso||""));
}

async function hydrateMissingHistoryOperators(rows){
    if(tkHistoryOperatorHydrating)return;

    const targets=(rows||[])
        .filter(o=>o&&o.order&&!norm(o.operatorName)&&(Number(o.printCount||0)>0||norm(o.latestReviewAt||"")))
        .slice(0,20);

    if(!targets.length)return;

    tkHistoryOperatorHydrating=true;

    let changed=false;

    try{
        for(const row of targets){
            let logs=[];

            try{
                logs=await loadPrintLogRowsForOrder(row.order);
            }catch(e){
                logs=loadLocalPrintLogRowsForOrder(row.order);
            }

            const hit=(logs||[]).find(x=>historyOperatorNameFrom(x));

            if(hit){
                row.operatorName=historyOperatorNameFrom(hit);
                changed=true;
                continue;
            }

            try{
                const reviewLogs=await loadReviewLogRowsForOrder(row.order);
                const reviewHit=(reviewLogs||[]).find(x=>historyOperatorNameFrom(x));

                if(reviewHit){
                    row.operatorName=historyOperatorNameFrom(reviewHit);
                    changed=true;
                }
            }catch(e){}
        }
    }finally{
        tkHistoryOperatorHydrating=false;
    }

    if(changed){
        renderCloudHistoryRows();
    }
}

function mergeUniqueLogRows(rows){
    const out=[];
    const seen={};

    (rows||[]).forEach(row=>{
        if(!row)return;

        const key=row.__docId||row.printEventId||row.logId||[
            row.order||"",
            row.orderId||"",
            row.printedAtMs||row.reviewedAtMs||row.updatedAtMs||"",
            row.reason||row.logType||""
        ].join("|");

        if(seen[key])return;

        seen[key]=true;
        out.push(row);
    });

    return out;
}

async function queryCloudLogsByOrder(collection,orderId,timeField,limit){
    orderId=String(orderId||"");
    if(!orderId)return [];

    async function querySdk(field){
        const snap=await tkCloudDb.collection(collection)
            .where(field,"==",orderId)
            .orderBy(timeField,"desc")
            .limit(limit||80)
            .get();
        const rows=[];
        snap.forEach(doc=>rows.push(Object.assign({__docId:doc.id},doc.data()||{})));
        return rows;
    }

    async function queryRest(field){
        return await firestoreRestRunQuery({
            from:[{collectionId:collection}],
            where:{
                fieldFilter:{
                    field:{fieldPath:field},
                    op:"EQUAL",
                    value:{stringValue:orderId}
                }
            },
            orderBy:[{field:{fieldPath:timeField},direction:"DESCENDING"}],
            limit:limit||80
        });
    }

    let rows=[];

    if(!shouldUseCloudRestFirst()&&await waitForFirebaseCloud(1500)){
        try{
            const byOrder=await querySdk("order");
            const byOrderId=byOrder.length?[]:await querySdk("orderId");
            rows=mergeUniqueLogRows(byOrder.concat(byOrderId));
        }catch(sdkError){
            const byOrder=await queryRest("order");
            const byOrderId=byOrder.length?[]:await queryRest("orderId");
            rows=mergeUniqueLogRows(byOrder.concat(byOrderId));
        }
    }else{
        const byOrder=await queryRest("order");
        const byOrderId=byOrder.length?[]:await queryRest("orderId");
        rows=mergeUniqueLogRows(byOrder.concat(byOrderId));
    }

    return rows.sort((a,b)=>
        (Number(b[timeField]||0)||parseAnyDateValue(b.printedAt||b.printedAtIso||b.reviewedAt||b.reviewedAtIso||""))-
        (Number(a[timeField]||0)||parseAnyDateValue(a.printedAt||a.printedAtIso||a.reviewedAt||a.reviewedAtIso||""))
    );
}

async function loadCloudHistoryRowsRest(){
    const docs=await listRestCollection("tiktok_orders",1000);
    return docs
        .filter(d=>{
            const id=String(d.__docId||d.order||d.orderId||"");
            return id.indexOf(RELEASE_DOC_PREFIX)!==0;
        })
        .map(d=>normalizeCloudHistoryDoc(d.order||d.orderId||d.__docId,d));
}

async function loadAndRenderCloudHistory(){
    const rows=document.getElementById("tkHistRows");
    const sum=document.getElementById("tkHistSummary");
    if(rows)rows.innerHTML='<div style="padding:24px;text-align:center;color:#666;">正在读取 Firebase 云端历史...</div>';
    try{
        let via="SDK";
        let printLogVia="";
        let printLogNotice="";
        if(!shouldUseCloudRestFirst()&&await waitForFirebaseCloud(1500)){
            try{
                const snap=await runCloudOperation("读取历史",()=>tkCloudDb.collection("tiktok_orders").get(),3);
                tkHistoryCloudRows=[];
                snap.forEach(doc=>{
                    if(String(doc.id||"").indexOf(RELEASE_DOC_PREFIX)===0)return;
                    const d=doc.data()||{};
                    tkHistoryCloudRows.push(normalizeCloudHistoryDoc(d.order||d.orderId||doc.id,d));
                });
            }catch(sdkError){
                if(!isTransientCloudError(sdkError))throw sdkError;
                tkHistoryCloudRows=await loadCloudHistoryRowsRest();
                via="REST";
            }
        }else{
            tkHistoryCloudRows=await loadCloudHistoryRowsRest();
            via="REST";
        }
        try{
            const logResult=await loadCloudPrintLogsForHistory();
            const printLogs=logResult.rows||[];
            printLogVia=logResult.via||via;
            tkCloudPrintLogCount=printLogs.length;
            tkHistoryCloudRows=applyCloudPrintLogsToHistoryRows(tkHistoryCloudRows,printLogs);
        }catch(logError){
            tkCloudPrintLogCount=0;
            printLogNotice="云端打印流水读取失败，打印次数可能只显示汇总值："+(logError&&logError.message?logError.message:logError);
        }
        const localRows=loadLocalHistoryRows();
        if(localRows.length){
            const before=tkHistoryCloudRows.length;
            tkHistoryCloudRows=applyLocalHistoryRowsToHistoryRows(tkHistoryCloudRows,localRows);
            const added=tkHistoryCloudRows.length-before;
            const backfillAdded=enqueueLocalHistoryBackfillForCloud(tkHistoryCloudRows,80);
            if(added>0||backfillAdded>0||getCloudPendingPrintCount()>0){
                printLogNotice=(printLogNotice?printLogNotice+" ｜ ":"")+"已合并本机历史"+(added>0?"，其中 "+added+" 单云端暂未显示":"")+(backfillAdded>0?"；已加入补写 "+backfillAdded+" 条":"")+"；云待同步 "+getCloudPendingPrintCount()+" 条";
            }
        }
        tkHistoryCloudRows.sort((a,b)=>(b.printedAtMs||parseAnyDateValue(b.printedAtRaw)||parseAnyDateValue(b.printedAt)||b.orderDateValue||0)-(a.printedAtMs||parseAnyDateValue(a.printedAtRaw)||parseAnyDateValue(a.printedAt)||a.orderDateValue||0));
        tkHistorySourceLabel=(via==="REST"?"云端REST":"云端SDK")+(printLogVia?" + 打印流水"+(printLogVia==="REST"?"REST":"SDK"):"");
        tkHistoryNoticeText=printLogNotice;
        tkCloudOrderCount=tkHistoryCloudRows.length;
        tkCloudStatus="云同步：已同步 "+tkCloudOrderCount+" 单 / "+tkCloudPrintLogCount+" 次打印"+(via==="REST"||printLogVia==="REST"?"（REST读取）":"");
        updateStablePanelSoon();
        renderCloudHistoryRows();
    }catch(e){
        const localRows=loadLocalHistoryRows();
        if(localRows.length){
            tkHistoryCloudRows=localRows;
            tkHistorySourceLabel="本机缓存";
            tkHistoryNoticeText="读取云端历史失败，已显示本机缓存："+(e&&e.message?e.message:e);
            tkCloudStatus="云同步：云端读取失败，已显示本机缓存";
            updateStablePanelSoon();
            renderCloudHistoryRows();
        }else{
            if(sum)sum.innerHTML='<span style="color:red;font-weight:bold;">读取云端历史失败：'+esc(e&&e.message?e.message:e)+'</span>';
            if(rows)rows.innerHTML='';
        }
    }
}

async function loadReviewLogRowsForOrder(orderId){
    orderId=String(orderId||"");
    if(!orderId)return [];
    try{
        return await queryCloudLogsByOrder("tiktok_review_logs",orderId,"reviewedAtMs",30);
    }catch(e){
        if(!isTransientCloudError(e)){
            console.warn("[TikTok Printer] SDK读取复核流水失败，改用REST",e);
        }
    }
    return [];
}

async function loadPrintLogRowsForOrder(orderId){
    orderId=String(orderId||"");
    if(!orderId)return [];
    const cachedRow=tkHistoryCloudRows.find(x=>String(x.order||"")===orderId);
    if(cachedRow&&Array.isArray(cachedRow.cloudPrintLogs)&&cachedRow.cloudPrintLogs.length){
        return cachedRow.cloudPrintLogs.slice().sort((a,b)=>
            (Number(b.printedAtMs||0)||parseAnyDateValue(b.printedAtRaw||b.printedAt||b.printedAtIso||""))-
            (Number(a.printedAtMs||0)||parseAnyDateValue(a.printedAtRaw||a.printedAt||a.printedAtIso||""))
        );
    }
    try{
        return await queryCloudLogsByOrder("tiktok_print_logs",orderId,"printedAtMs",80);
    }catch(e){
        if(!isTransientCloudError(e)){
            console.warn("[TikTok Printer] SDK读取打印流水失败，改用REST",e);
        }
    }
    return [];
}

function renderCloudHistoryRows(){
    const rowsBox=document.getElementById("tkHistRows");
    const sum=document.getElementById("tkHistSummary");
    if(!rowsBox)return;
    const q=norm((document.getElementById("tkHistSearch")||{}).value||"").toLowerCase();
    const from=(document.getElementById("tkHistFrom")||{}).value||"";
    const to=(document.getElementById("tkHistTo")||{}).value||"";
    const st=(document.getElementById("tkHistStatus")||{}).value||"all";
    const pc=(document.getElementById("tkHistPrintCount")||{}).value||"all";
    const arr=tkHistoryCloudRows.filter(o=>{
        const printCount=Number(o.printCount||0);
        if(from&&o.orderDate&&o.orderDate<from)return false;
        if(to&&o.orderDate&&o.orderDate>to)return false;
        if(st!=="all"&&o.orderStatus!==st)return false;
        if(pc==="0"&&printCount!==0)return false;
        if(pc==="1"&&printCount!==1)return false;
        if(pc==="2"&&printCount!==2)return false;
        if(pc==="3plus"&&printCount<3)return false;
        if(q){const txt=[o.order,o.shortId,o.title,o.note,o.orderStatus,o.operatorName,o.orderType,o.trackingText].join(" ").toLowerCase();if(!txt.includes(q))return false;}
        return true;
    });
    if(sum){
        const printed=arr.filter(x=>x.printCount>0).length;
        const totalPrints=arr.reduce((s,x)=>s+Number(x.printCount||0),0);
        const hasNote=arr.filter(x=>norm(x.note)).length;
        const canceled=arr.filter(x=>x.orderStatus==="Canceled").length;
        sum.innerHTML=(tkHistoryNoticeText?'<div style="color:#b36b00;font-weight:bold;margin-bottom:4px;">'+esc(tkHistoryNoticeText)+'</div>':'')+
            esc(tkHistorySourceLabel||"历史")+'订单 <b>'+arr.length+'</b> 个；已打印订单 <b>'+printed+'</b> 个；打印次数合计 <b>'+totalPrints+'</b> 次；有Note <b>'+hasNote+'</b> 个；Canceled <b style="color:red;">'+canceled+'</b> 个。';
    }
    rowsBox.innerHTML=arr.map(o=>{
        const can=!!norm(o.note)&&o.orderStatus!=="Canceled";
        const logCount=Array.isArray(o.cloudPrintLogs)?o.cloudPrintLogs.length:0;
        const printCount=Math.max(Number(o.printCount||0),logCount);
        const printLogBtn=(printCount>1||logCount>1)?'<button class="tkHistPrintLogs" data-order="'+esc(o.order)+'" data-count="'+esc(printCount)+'" style="padding:5px 12px;border:1px solid #555;border-radius:5px;background:#eaf2ff;color:#111;cursor:pointer;">打印记录</button>':'';
        return '<div style="border:1px solid '+(o.orderStatus==="Canceled"?'#ff3333':'#d0d0d0')+';background:'+(o.orderStatus==="Canceled"?'#fff1f1':'#fff')+';border-radius:8px;padding:10px;margin:8px 0;">'+
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><div><b style="font-size:20px;">'+esc(o.shortId)+'</b> <span>'+esc(o.orderStatus)+'</span> <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:'+(printCount>1?'#ffd6d6':(printCount?'#ffe6e6':'#eaffea'))+';color:'+(printCount?'#c40000':'#087a2f')+';font-weight:900;">打印次数：'+String(printCount)+' 次</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">'+printLogBtn+'<button class="tkHistChanges" data-order="'+esc(o.order)+'" style="padding:5px 12px;border:1px solid #555;border-radius:5px;background:#fff7d6;color:#111;cursor:pointer;">变化</button><button class="tkHistReprint" data-order="'+esc(o.order)+'" '+(can?'':'disabled')+' style="padding:5px 12px;border:1px solid #111;border-radius:5px;background:'+(can?'#111':'#ddd')+';color:'+(can?'#fff':'#777')+';cursor:'+(can?'pointer':'not-allowed')+';">补打</button></div></div>'+ 
            '<div style="font-size:12px;color:#555;word-break:break-all;margin-top:4px;">订单号：'+esc(o.order)+' ｜ 类型：'+esc(o.orderType||'')+' ｜ 状态：'+esc(o.orderStatus||'')+'</div>'+ 
            '<div style="font-size:12px;color:#555;word-break:break-all;margin-top:4px;">操作人：'+esc(o.operatorName||'未记录')+' ｜ 最近打印：'+esc(o.printedAt||'')+' ｜ 最近复核：'+esc(o.latestReviewAt||'')+'</div>'+ 
            '<div style="font-size:12px;color:#555;word-break:break-all;margin-top:4px;">快递单号：'+esc(o.trackingText||'无/未识别')+'</div>'+ 
            '<div style="margin-top:4px;font-weight:bold;">Title：'+esc(o.title||'')+'</div>'+ 
            '<div style="margin-top:4px;font-weight:bold;">Note：'+esc(o.note||'空')+'</div>'+ 
            '<div style="margin-top:4px;color:#333;">订单时间：'+esc(o.time||'')+'</div>'+ 
            '<div class="tkHistPrintLogBox" data-order="'+esc(o.order)+'" style="display:none;margin-top:8px;padding:8px;background:#f6f9ff;border:1px dashed #7aa7ff;border-radius:6px;font-size:12px;line-height:1.45;"></div>'+
            '<div class="tkHistChangeBox" data-order="'+esc(o.order)+'" style="display:none;margin-top:8px;padding:8px;background:#fafafa;border:1px dashed #aaa;border-radius:6px;font-size:12px;line-height:1.45;"></div>'+
        '</div>';
    }).join('')||'<div style="padding:28px;text-align:center;color:#666;">没有符合条件的云端历史。</div>';
    rowsBox.querySelectorAll('.tkHistReprint').forEach(btn=>{
        btn.onclick=function(e){
            e.preventDefault();e.stopPropagation();
            const id=this.getAttribute('data-order');
            const o=tkHistoryCloudRows.find(x=>x.order===id);
            if(!o)return;
            const info={order:o.order,shortId:o.shortId,title:o.title,time:o.time,orderDate:o.orderDate,orderDateValue:o.orderDateValue,note:o.note,cleanNote:o.note,orderType:o.orderType||'LIVE',orderStatus:o.orderStatus||'',isCanceled:o.orderStatus==='Canceled',shouldPrint:true,trackingList:[],trackingText:''};
            printLabel(info,'历史云端补打',{force:true});
            setTimeout(loadAndRenderCloudHistory,1200);
        };
    });
    rowsBox.querySelectorAll('.tkHistPrintLogs').forEach(btn=>{
        btn.onclick=async function(e){
            e.preventDefault();e.stopPropagation();
            const id=this.getAttribute('data-order')||"";
            const expected=Number(this.getAttribute('data-count')||0);
            let box=null;
            rowsBox.querySelectorAll('.tkHistPrintLogBox').forEach(x=>{
                if(x.getAttribute('data-order')===id)box=x;
            });
            if(!box)return;
            const shouldShow=box.style.display==="none";
            if(!shouldShow){
                box.style.display="none";
                this.textContent="打印记录";
                return;
            }
            box.style.display="block";
            box.innerHTML="正在读取每次打印记录...";
            this.textContent="收起打印";
            try{
                let logs=[];
                let via="云端";
                try{
                    logs=await loadPrintLogRowsForOrder(id);
                }catch(cloudErr){
                    logs=loadLocalPrintLogRowsForOrder(id);
                    via="本机缓存";
                    if(!logs.length)throw cloudErr;
                }
                const total=Math.max(expected,logs.length);
                const warn=(expected&&logs.length<expected)
                    ? '<div style="color:#b36b00;font-weight:bold;margin-bottom:6px;">打印次数显示 '+esc(expected)+' 次，但'+esc(via)+'只找到 '+esc(logs.length)+' 条明细。</div>'
                    : '';
                box.innerHTML=warn+(logs.length?logs.map((x,i)=>{
                    const seq=Math.max(1,total-i);
                    const printedAt=formatDisplayLocalTime(x.printedAt||x.printedAtIso||"");
                    const operator=historyOperatorNameFrom(x);
                    const reason=x.reason||x.latestReason||"打印";
                    const note=stripPrintedMark(x.newNote||x.note||x.systemNote||"");
                    const oldNote=stripPrintedMark(x.oldNote||"");
                    return '<div style="border-bottom:1px solid #d7e3ff;padding:6px 0;">'+
                        '<div><b>第 '+esc(seq)+' 次打印</b> ｜ '+esc(printedAt||"时间未记录")+' ｜ 来源：'+esc(via)+'</div>'+
                        '<div>操作人：'+esc(operator||"未记录")+' ｜ 原因：'+esc(reason)+'</div>'+
                        '<div>状态：'+esc(x.orderStatus||x.latestStatus||"")+' ｜ 类型：'+esc(x.orderType||"")+'</div>'+
                        '<div>Note：'+esc(note||"空")+(oldNote&&oldNote!==note?' ｜ 旧Note：'+esc(oldNote):'')+'</div>'+
                    '</div>';
                }).join(""):'暂无打印明细。') ;
            }catch(err){
                box.innerHTML='<span style="color:red;font-weight:bold;">读取打印记录失败：'+esc(err&&err.message?err.message:err)+'</span>';
            }
        };
    });
    hydrateMissingHistoryOperators(arr);
    rowsBox.querySelectorAll('.tkHistChanges').forEach(btn=>{
        btn.onclick=async function(e){
            e.preventDefault();e.stopPropagation();
            const id=this.getAttribute('data-order')||"";
            let box=null;
            rowsBox.querySelectorAll('.tkHistChangeBox').forEach(x=>{
                if(x.getAttribute('data-order')===id)box=x;
            });
            if(!box)return;
            const shouldShow=box.style.display==="none";
            if(!shouldShow){
                box.style.display="none";
                this.textContent="变化";
                return;
            }
            box.style.display="block";
            box.innerHTML="正在读取该订单复核变化流水...";
            this.textContent="收起变化";
            try{
                const logs=await loadReviewLogRowsForOrder(id);
                box.innerHTML=logs.length?logs.map(x=>{
                    return '<div style="border-bottom:1px solid #e5e5e5;padding:5px 0;">'+
                        '<div><b>'+esc(formatDisplayLocalTime(x.reviewedAt||x.latestReviewAt||x.reviewedAtIso||x.latestReviewAtIso||""))+'</b> ｜ 操作人：'+esc(historyOperatorNameFrom(x)||"未记录")+'</div>'+
                        '<div>状态：'+esc(x.latestReviewStatus||x.orderStatus||"")+' ｜ 类型：'+esc(x.orderType||"")+' ｜ 快递：'+esc(x.latestReviewTrackingText||x.trackingText||"无/未识别")+'</div>'+
                        '<div>Note：'+esc(x.latestReviewNote||x.note||"空")+'</div>'+
                    '</div>';
                }).join(""):'暂无该订单复核流水。后续复核扫描后会显示每次订单状态、Note、快递单号记录。';
            }catch(err){
                box.innerHTML='<span style="color:red;font-weight:bold;">读取变化流水失败：'+esc(err&&err.message?err.message:err)+'</span>';
            }
        };
    });
}

function ensureReviewWindow(){
    let win=document.getElementById("tk-review-window");
    if(win){
        focusFloatingWorkWindow(win);
        return win;
    }

    win=document.createElement("div");
    win.id="tk-review-window";
    win.style.cssText=`
        position:fixed;
        left:120px;
        top:52px;
        width:1240px;
        max-width:94vw;
        height:88vh;
        max-height:88vh;
        background:white;
        z-index:2147483000;
        border:2px solid #111;
        border-radius:10px;
        box-shadow:0 4px 32px rgba(0,0,0,.35);
        font-family:Arial,"Microsoft YaHei",sans-serif;
        display:flex;
        flex-direction:column;
        overflow:hidden;
        overscroll-behavior:contain;
        box-sizing:border-box;
        resize:both;
        min-width:820px;
        min-height:560px;
    `;

    win.innerHTML=`
        <div id="tkReviewHeader" style="background:#111;color:white;padding:8px 12px;font-weight:bold;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:move;user-select:none;flex:0 0 auto;">
            <span style="font-size:17px;">订单复核 v${SCRIPT_VERSION}</span>
            <div style="display:flex;gap:8px;align-items:center;">
                <button id="tkMaxReviewBtn" style="padding:6px 12px;border:2px solid #fff;border-radius:6px;background:#fff;color:#111;cursor:pointer;font-weight:900;font-size:14px;">最大化</button>
                <button id="tkCloseReviewBtn" style="padding:6px 14px;border:2px solid #fff;border-radius:6px;background:#ff3b30;color:white;cursor:pointer;font-weight:900;font-size:14px;">关闭</button>
            </div>
        </div>

        <div id="tkReviewSteps" style="padding:8px 10px;background:#fff;border-bottom:1px solid #111;display:grid;grid-template-columns:minmax(180px,1fr) 180px minmax(260px,1.2fr);gap:8px;flex:0 0 auto;">
            <button id="tkBindNextBtn" style="padding:10px 8px;border:0;border-radius:7px;font-size:15px;font-weight:900;cursor:pointer;">第1步：绑定下一页按钮</button>
            <div style="border:1px solid #ddd;border-radius:7px;padding:7px;background:#f8f9fb;font-size:12px;font-weight:bold;display:flex;flex-direction:column;gap:4px;min-width:0;">
                <span>复核到日期，包含当天</span>
                <input id="tkReviewCutoffDate" type="date" style="padding:6px;border:1px solid #aaa;border-radius:6px;font-weight:bold;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;">
                <button id="tkStartReviewBtn" style="padding:10px 8px;border:0;border-radius:7px;font-size:15px;font-weight:900;cursor:pointer;">第2步：开始复核</button>
                <button id="tkStopReviewBtn" style="padding:10px 8px;border:0;border-radius:7px;font-size:14px;font-weight:900;cursor:pointer;background:#ff3b30;color:white;">停止/重置</button>
            </div>
        </div>

        <div id="tkReviewBody" style="overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;flex:1 1 auto;min-height:0;background:#fafafa;">
            <div id="tkReviewBindState" style="padding:6px 10px;background:#f4f4f4;border-bottom:1px solid #ddd;font-size:12px;line-height:1.35;overflow:visible;"></div>
            <div id="tkReviewSummary" style="padding:7px 10px;background:#fff7d6;border-bottom:1px solid #e6d28a;font-size:12px;line-height:1.4;overflow:visible;">请先绑定下一页按钮，然后开始复核。</div>
            <div id="tkReviewPageStats" style="padding:7px 10px;background:#e8f0ff;border-bottom:1px solid #b8c9ff;font-size:12px;line-height:1.4;white-space:normal;overflow:visible;">暂无分页扫描统计。</div>
            <div id="tkReviewReplayHistory" style="padding:7px 10px;background:#f7fbff;border-bottom:1px solid #b8c9ff;font-size:12px;line-height:1.4;overflow:visible;"></div>

            <div style="padding:7px 10px;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:white;">
                <label style="font-weight:bold;"><input id="tkReviewSelectAll" type="checkbox"> 全选当前复核结果</label>
                <select id="tkReviewTypeFilter" style="padding:6px;border:1px solid #aaa;border-radius:5px;">
                    <option value="all">差异类型：全部</option>
                    <option value="canceled">已打印后Canceled</option>
                    <option value="note">NOTE变化</option>
                    <option value="missed">疑似漏打</option>
                </select>
                <input id="tkReviewSearch" placeholder="搜索订单号/后6位/Note/Title" style="padding:7px 9px;border:1px solid #aaa;border-radius:5px;min-width:260px;flex:1;">
                <span id="tkReviewSelectedCount" style="font-weight:bold;margin-left:auto;">已选择 0 条</span>
            </div>

            <div id="tkReviewRows" style="padding:0 10px 12px;background:#fafafa;overflow:visible;min-height:180px;"></div>
        </div>

        <div style="padding:8px 10px;border-top:1px solid #ddd;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;background:white;flex:0 0 auto;">
            <button id="tkReviewUpdateStatusBtn" style="padding:8px 12px;border:0;border-radius:6px;background:#111;color:white;cursor:pointer;">批量更新选中状态</button>
            <button id="tkReviewUpdateNoteBtn" style="padding:8px 12px;border:0;border-radius:6px;background:#111;color:white;cursor:pointer;">批量更新选中Note</button>
            <button id="tkReviewPrintBtn" style="padding:8px 12px;border:0;border-radius:6px;background:#0a7a0a;color:white;cursor:pointer;font-weight:bold;">批量按当前Note打印</button>
            <button id="tkReviewIgnoreBtn" style="padding:8px 12px;border:0;border-radius:6px;background:#ddd;color:#111;cursor:pointer;">忽略选中</button>
        </div>
    `;

    document.body.appendChild(win);

    try{
        const dEl=document.getElementById("tkReviewCutoffDate");
        if(dEl && !dEl.value){
            const d=new Date();
            d.setDate(d.getDate()-REVIEW_DAYS);
            dEl.value=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
        }
    }catch(e){}

    document.getElementById("tkBindNextBtn").onclick=function(){startBindNextButton();};
    document.getElementById("tkStartReviewBtn").onclick=function(){
        if(!requireListeningPausedForAction("开始复核"))return;
        startReviewRecentOrders();
    };
    const stopReviewBtn=document.getElementById("tkStopReviewBtn");
    if(stopReviewBtn)stopReviewBtn.onclick=function(){
        reviewAbortRequested=true;
        reviewRunning=false;
        updateReviewStatus("已手动停止/重置复核。可以重新点击开始复核。");
    };
    document.getElementById("tkCloseReviewBtn").onclick=function(){removeFloatingWorkWindow(win);};
    const maxReviewBtn=document.getElementById("tkMaxReviewBtn");
    if(maxReviewBtn)maxReviewBtn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        toggleReviewWindowMaximized(win);
    };

    document.getElementById("tkReviewSelectAll").onchange=function(){
        const checked=this.checked;
        win.querySelectorAll(".tk-review-check:not(:disabled)").forEach(chk=>{chk.checked=checked;});
        updateReviewSelectedCount();
    };

    document.getElementById("tkReviewTypeFilter").onchange=renderReviewRows;
    document.getElementById("tkReviewSearch").oninput=renderReviewRows;
    document.getElementById("tkReviewUpdateStatusBtn").onclick=function(){reviewBatchUpdateStatus();};
    document.getElementById("tkReviewUpdateNoteBtn").onclick=function(){reviewBatchUpdateNote();};
    document.getElementById("tkReviewPrintBtn").onclick=function(){reviewBatchPrint();};
    document.getElementById("tkReviewIgnoreBtn").onclick=function(){reviewBatchIgnore();};

    makeFloatingWindowDraggable(win,"#tkReviewHeader");
    focusFloatingWorkWindow(win);
    renderReviewBindState();
    updateReviewStepVisual();
    renderReviewRows();
    renderReviewPageStats();
    renderReviewReplayHistoryPanel();

    return win;
}

function toggleReviewWindowMaximized(win){
    if(!win)return;

    const btn=document.getElementById("tkMaxReviewBtn");
    const maximized=win.getAttribute("data-tk-maximized")==="1";

    if(maximized){
        let prev={};

        try{
            prev=JSON.parse(win.getAttribute("data-tk-prev-rect")||"{}")||{};
        }catch(e){
            prev={};
        }

        win.setAttribute("data-tk-maximized","0");
        win.style.setProperty("left",(Number(prev.left)||120)+"px","important");
        win.style.setProperty("top",(Number(prev.top)||52)+"px","important");
        win.style.setProperty("width",(Number(prev.width)||1240)+"px","important");
        win.style.setProperty("height",(Number(prev.height)||Math.floor(window.innerHeight*0.88))+"px","important");
        win.style.setProperty("max-width","94vw","important");
        win.style.setProperty("max-height","88vh","important");
        win.style.setProperty("border-radius","10px","important");
        win.style.setProperty("resize","both","important");
        if(btn)btn.textContent="最大化";
        return;
    }

    const rect=win.getBoundingClientRect();
    win.setAttribute("data-tk-prev-rect",JSON.stringify({
        left:rect.left,
        top:rect.top,
        width:rect.width,
        height:rect.height
    }));
    win.setAttribute("data-tk-maximized","1");
    win.style.setProperty("left","8px","important");
    win.style.setProperty("top","8px","important");
    win.style.setProperty("width","calc(100vw - 16px)","important");
    win.style.setProperty("height","calc(100vh - 16px)","important");
    win.style.setProperty("max-width","calc(100vw - 16px)","important");
    win.style.setProperty("max-height","calc(100vh - 16px)","important");
    win.style.setProperty("border-radius","8px","important");
    win.style.setProperty("resize","none","important");
    if(btn)btn.textContent="还原";
}

function activeWorkWindowIds(){
    return [
        "tk-review-window",
        "tk-review-product-analysis-window",
        "tk-review-product-detail-window",
        "tk-print-floating-window",
        "tk-cloud-history-window-v101"
    ];
}

function hasOpenWorkWindow(){
    return activeWorkWindowIds().some(id=>document.getElementById(id));
}

function updateMainPanelLayerForWorkWindows(){
    const panel=document.getElementById("tiktok-auto-print-panel-windows");
    if(!panel)return;

    if(hasOpenWorkWindow()){
        panel.style.setProperty("z-index","2147482500","important");
        panel.style.setProperty("opacity","0.88","important");
    }else{
        panel.style.setProperty("z-index","2147483647","important");
        panel.style.setProperty("opacity","1","important");
    }
}

function focusFloatingWorkWindow(win){
    if(!win)return;

    win.style.setProperty("z-index","2147483646","important");
    document.querySelectorAll("#tk-review-window,#tk-review-product-analysis-window,#tk-review-product-detail-window,#tk-print-floating-window,#tk-cloud-history-window-v101").forEach(other=>{
        if(other!==win)other.style.setProperty("z-index","2147483300","important");
    });
    updateMainPanelLayerForWorkWindows();
}

function removeFloatingWorkWindow(win){
    if(!win)return;
    win.remove();
    setTimeout(updateMainPanelLayerForWorkWindows,0);
}

function toggleFloatingWorkWindowMaximized(win,btn,fallback){
    if(!win)return;

    fallback=fallback||{};
    const maximized=win.getAttribute("data-tk-maximized")==="1";

    if(maximized){
        let prev={};

        try{
            prev=JSON.parse(win.getAttribute("data-tk-prev-rect")||"{}")||{};
        }catch(e){
            prev={};
        }

        win.setAttribute("data-tk-maximized","0");
        win.style.setProperty("left",(Number(prev.left)||fallback.left||110)+"px","important");
        win.style.setProperty("top",(Number(prev.top)||fallback.top||48)+"px","important");
        win.style.setProperty("width",(Number(prev.width)||fallback.width||1120)+"px","important");
        win.style.setProperty("height",(Number(prev.height)||fallback.height||Math.floor(window.innerHeight*0.82))+"px","important");
        win.style.setProperty("max-width",fallback.maxWidth||"94vw","important");
        win.style.setProperty("max-height",fallback.maxHeight||"88vh","important");
        win.style.setProperty("border-radius","10px","important");
        win.style.setProperty("resize","both","important");
        if(btn)btn.textContent="最大化";
        focusFloatingWorkWindow(win);
        return;
    }

    const rect=win.getBoundingClientRect();
    win.setAttribute("data-tk-prev-rect",JSON.stringify({
        left:rect.left,
        top:rect.top,
        width:rect.width,
        height:rect.height
    }));
    win.setAttribute("data-tk-maximized","1");
    win.style.setProperty("left","8px","important");
    win.style.setProperty("top","8px","important");
    win.style.setProperty("width","calc(100vw - 16px)","important");
    win.style.setProperty("height","calc(100vh - 16px)","important");
    win.style.setProperty("max-width","calc(100vw - 16px)","important");
    win.style.setProperty("max-height","calc(100vh - 16px)","important");
    win.style.setProperty("border-radius","8px","important");
    win.style.setProperty("resize","none","important");
    if(btn)btn.textContent="还原";
    focusFloatingWorkWindow(win);
}

function updateReviewStatus(t){
    const el=document.getElementById("tkReviewSummary");
    if(el)el.innerHTML=esc(t);
}

function renderReviewBindState(){
    const el=document.getElementById("tkReviewBindState");
    if(!el)return;

    const nextBind=getNextBind();
    const refreshBind=getRefreshBind();

    el.innerHTML=
        "当前页面：<b>"+esc(getCurrentTabTitle())+"</b>；"+
        "刷新按钮："+(refreshBind?'<b style="color:green;">已绑定</b>':'<b style="color:red;">未绑定</b>')+
        "；下一页按钮："+(nextBind?'<b style="color:green;">已绑定</b>':'<b style="color:red;">未绑定</b>')+
        "。v"+SCRIPT_VERSION+" 从当前 TAB 当前页开始扫描，按指定日期截止。";
}

function updateReviewStepVisual(){
    const nextBtn=document.getElementById("tkBindNextBtn");
    const startBtn=document.getElementById("tkStartReviewBtn");

    if(!nextBtn||!startBtn)return;

    const nextBind=!!getNextBind();

    nextBtn.innerText=nextBind?"第1步：下一页已绑定":"第1步：绑定下一页按钮";
    nextBtn.style.background=nextBind?"#14b85a":"#ff9500";
    nextBtn.style.color="white";

    if(nextBind){
        startBtn.disabled=false;
        startBtn.style.background="#14b85a";
        startBtn.style.color="white";
        startBtn.style.opacity="1";
    }else{
        startBtn.disabled=true;
        startBtn.style.background="#999";
        startBtn.style.color="white";
        startBtn.style.opacity=".55";
    }
}

function openReviewWindow(){
    ensureReviewWindow();
}

function getReviewIgnoreSet(){
    return new Set(getJson(REVIEW_IGNORE_KEY,[]));
}

function saveReviewIgnoreSet(s){
    setJson(REVIEW_IGNORE_KEY,[...s].slice(-5000));
}

function makeDiffKey(diff){
    return diff.order+"|"+diff.type+"|"+diff.currentStatus+"|"+diff.currentNote+"|"+diff.trackingText;
}

function isDiffIgnored(diff){
    return getReviewIgnoreSet().has(makeDiffKey(diff));
}

function getCurrentTabTitle(){
    const title=norm(document.title||"");

    const candidates=Array.from(document.querySelectorAll("[aria-selected='true'],.active,[class*='active'],button,[role='tab']"))
        .map(el=>norm(el.innerText||el.textContent||""))
        .filter(x=>x&&x.length<80);

    const tabs=candidates.filter(x=>
        /All|To ship|Shipped|Completed|Canceled|Pending|Late|Overdue|超时|发货|订单|Cancellation|Return/i.test(x)
    );

    return tabs[0]||title||location.pathname;
}

function makeSnapshotFromInfo(info,scanId){
    return {
        order:info.order,
        shortId:info.shortId,
        title:info.title||"",
        time:info.time||"",
        orderDate:info.orderDate||"",
        orderDateValue:info.orderDateValue||0,
        orderType:info.orderType||"",
        orderStatus:info.orderStatus||"Unknown",
        note:effectiveNote(info)||"",
        rawNote:info.note||"",
        quantity:Number(info.quantity||info.qty||1)||1,
        gmv:Number(info.gmv||info.amount||0)||0,
        gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
        trackingText:info.trackingText||"",
        tabTitle:getCurrentTabTitle(),
        url:location.href,
        scanId:scanId||"",
        scannedAt:now()
    };
}

function compareSnapshot(oldSnap,newSnap){
    const arr=[];

    if(!oldSnap)return arr;

    if((oldSnap.orderStatus||"Unknown")!==(newSnap.orderStatus||"Unknown")){
        arr.push({
            field:"status",
            fieldText:"订单状态",
            oldValue:oldSnap.orderStatus||"Unknown",
            newValue:newSnap.orderStatus||"Unknown"
        });
    }

    if((oldSnap.note||"")!==(newSnap.note||"")){
        arr.push({
            field:"note",
            fieldText:"Note",
            oldValue:oldSnap.note||"空",
            newValue:newSnap.note||"空"
        });
    }

    if((oldSnap.trackingText||"")!==(newSnap.trackingText||"")){
        arr.push({
            field:"tracking",
            fieldText:"快递单号",
            oldValue:oldSnap.trackingText||"无/未识别",
            newValue:newSnap.trackingText||"无/未识别"
        });
    }

    return arr;
}

function saveReviewSnapshotsAndDiffs(infos,scanId){
    const map=getJson(REVIEW_SNAPSHOT_KEY,{});
    const diffs=[];
    const tabTitle=getCurrentTabTitle();

    infos.forEach(info=>{
        if(!info||!info.order)return;

        const newSnap=makeSnapshotFromInfo(info,scanId);
        const oldSnap=map[info.order]||null;
        const changes=compareSnapshot(oldSnap,newSnap);

        if(changes.length){
            diffs.push({
                type:"snapshot",
                typeText:"状态/Note/单号变化",
                order:info.order,
                shortId:info.shortId,
                title:info.title||"",
                time:info.time||"",
                orderDateValue:info.orderDateValue||0,
                orderType:info.orderType||"",
                gmv:Number(info.gmv||info.amount||0)||0,
                gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
                currentStatus:info.orderStatus||"Unknown",
                currentNote:effectiveNote(info)||"",
                trackingText:info.trackingText||"",
                tabTitle:tabTitle,
                oldSnapshot:oldSnap,
                newSnapshot:newSnap,
                changes:changes,
                printCount:getTotalPrintCount(info.order),
                info:info,
                detectedAt:now(),
                scanId:scanId
            });
        }

        map[info.order]=newSnap;
    });

    setJson(REVIEW_SNAPSHOT_KEY,map);

    if(diffs.length){
        const hist=getJson(REVIEW_DIFF_HISTORY_KEY,[]);

        hist.unshift({
            scanId:scanId,
            createdAt:now(),
            tabTitle:tabTitle,
            url:location.href,
            diffCount:diffs.length,
            diffs:diffs
        });

        setJson(REVIEW_DIFF_HISTORY_KEY,hist.slice(0,100));
    }

    return diffs;
}

function makeReviewDiffsFromInfos(infos){
    const map={};

    infos.forEach(info=>{
        if(!info||!info.order)return;
        map[info.order]=info;
    });

    const diffs=[];

    Object.values(map).forEach(info=>{
        const agg=getHistoryAggregate(info.order);
        const currentNote=effectiveNote(info);
        const historyNote=stripPrintedMark(agg.note||agg.systemNote||"");
        const currentStatus=info.orderStatus||"Unknown";
        const historyStatus=agg.orderStatus||"";
        const printCount=Number(agg.printCount||0);

        if(printCount>0&&currentStatus==="Canceled"&&historyStatus!=="Canceled"){
            diffs.push({
                type:"canceled",
                typeText:"已打印后变Canceled",
                order:info.order,
                shortId:info.shortId,
                title:info.title,
                time:info.time,
                orderDateValue:info.orderDateValue,
                orderType:info.orderType,
                gmv:Number(info.gmv||info.amount||0)||0,
                gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
                currentStatus,
                historyStatus,
                currentNote,
                historyNote,
                trackingText:info.trackingText||"",
                printCount,
                info
            });
        }

        if(currentStatus!=="Canceled"&&printCount>0&&currentNote!==historyNote&&(currentNote||historyNote)){
            diffs.push({
                type:"note",
                typeText:"NOTE变化",
                order:info.order,
                shortId:info.shortId,
                title:info.title,
                time:info.time,
                orderDateValue:info.orderDateValue,
                orderType:info.orderType,
                gmv:Number(info.gmv||info.amount||0)||0,
                gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
                currentStatus,
                historyStatus,
                currentNote,
                historyNote,
                trackingText:info.trackingText||"",
                printCount,
                info
            });
        }

        if(info.shouldPrint&&currentStatus!=="Canceled"&&currentNote&&printCount===0){
            diffs.push({
                type:"missed",
                typeText:"疑似漏打",
                order:info.order,
                shortId:info.shortId,
                title:info.title,
                time:info.time,
                orderDateValue:info.orderDateValue,
                orderType:info.orderType,
                gmv:Number(info.gmv||info.amount||0)||0,
                gmvText:info.gmvText||formatMoneyAmount(info.gmv||info.amount||0),
                currentStatus,
                historyStatus,
                currentNote,
                historyNote,
                trackingText:info.trackingText||"",
                printCount,
                info
            });
        }
    });

    return diffs.filter(d=>!isDiffIgnored(d)).sort((a,b)=>(b.orderDateValue||0)-(a.orderDateValue||0));
}

function summarizePageForReview(infos,cutoff){
    const inRange=infos.filter(x=>!x.orderDateValue||x.orderDateValue>=cutoff);
    const old=infos.filter(x=>x.orderDateValue&&x.orderDateValue<cutoff);
    const unknown=infos.filter(x=>!x.orderDateValue);

    const byStatus={};
    let withTracking=0;
    let withoutTracking=0;

    infos.forEach(info=>{
        const s=info.orderStatus||"Unknown";
        byStatus[s]=(byStatus[s]||0)+1;

        if(info.trackingText)withTracking++;
        else withoutTracking++;
    });

    return {
        total:infos.length,
        inRange:inRange.length,
        old:old.length,
        unknown:unknown.length,
        withTracking,
        withoutTracking,
        byStatus
    };
}

function isReviewLiveOrder(info){
    const type=String((info&&info.orderType)||"");
    return !!(info&&(info.shouldPrint||/\bLIVE\b/i.test(type)));
}

function isReviewCanceledOrder(info,status){
    return !!(info&&(info.isCanceled||status==="Canceled"));
}

function reviewOrderGmv(info){
    const n=Number(info&&(info.gmv||info.amount)||0);
    return Number.isFinite(n)&&n>0?n:0;
}

function makeReviewDateBucket(date){
    return {
        date,
        total:0,
        totalGmv:0,
        live:0,
        notLive:0,
        canceled:0,
        canceledGmv:0,
        nonCanceledLive:0,
        nonCanceledLiveGmv:0,
        nonCanceledNotLive:0,
        nonCanceledNotLiveGmv:0,
        withTracking:0,
        withoutTracking:0,
        byStatus:{}
    };
}

function addReviewDateBucketInfo(bucket,info,status){
    const gmv=reviewOrderGmv(info);
    const canceled=isReviewCanceledOrder(info,status);
    const live=isReviewLiveOrder(info);

    bucket.total++;
    bucket.totalGmv+=gmv;

    if(live)bucket.live++;
    else bucket.notLive++;

    if(canceled){
        bucket.canceled++;
        bucket.canceledGmv+=gmv;
    }else if(live){
        bucket.nonCanceledLive++;
        bucket.nonCanceledLiveGmv+=gmv;
    }else{
        bucket.nonCanceledNotLive++;
        bucket.nonCanceledNotLiveGmv+=gmv;
    }

    if(info.trackingText)bucket.withTracking++;
    else bucket.withoutTracking++;

    bucket.byStatus[status]=(bucket.byStatus[status]||0)+1;
}

function buildReviewResult(scanId,stopDate,reason){
    const unique={};

    reviewScannedInfos.forEach(info=>{
        if(info&&info.order)unique[info.order]=info;
    });

    const orders=Object.values(unique).sort((a,b)=>(b.orderDateValue||0)-(a.orderDateValue||0));

    const byStatus={};
    const byDate={};
    let withTracking=0;
    let withoutTracking=0;
    let totalGmv=0;
    let canceledGmv=0;
    let nonCanceledLive=0;
    let nonCanceledLiveGmv=0;
    let nonCanceledNotLive=0;
    let nonCanceledNotLiveGmv=0;

    orders.forEach(info=>{
        const status=info.orderStatus||"Unknown";
        const gmv=reviewOrderGmv(info);
        const canceled=isReviewCanceledOrder(info,status);
        const live=isReviewLiveOrder(info);
        byStatus[status]=(byStatus[status]||0)+1;
        totalGmv+=gmv;

        if(canceled){
            canceledGmv+=gmv;
        }else if(live){
            nonCanceledLive++;
            nonCanceledLiveGmv+=gmv;
        }else{
            nonCanceledNotLive++;
            nonCanceledNotLiveGmv+=gmv;
        }

        if(info.trackingText)withTracking++;
        else withoutTracking++;

        const d=info.orderDate||"日期未识别";

        if(!byDate[d]){
            byDate[d]=makeReviewDateBucket(d);
        }

        addReviewDateBucketInfo(byDate[d],info,status);
    });

    return {
        scanId:scanId||"",
        createdAt:now(),
        stopDate:stopDate||"",
        tabTitle:getCurrentTabTitle(),
        url:location.href,
        reason:reason||"",
        pageCount:reviewPageStats.length,
        totalOrders:orders.length,
        totalGmv,
        canceledGmv,
        nonCanceledLive,
        nonCanceledLiveGmv,
        nonCanceledNotLive,
        nonCanceledNotLiveGmv,
        withTracking,
        withoutTracking,
        byStatus,
        daily:Object.values(byDate).sort((a,b)=>String(b.date).localeCompare(String(a.date))),
        pageStats:reviewPageStats.slice(),
        diffs:reviewDifferences.slice(),
        orders
    };
}

function makeCompactReviewHistoryItem(result){
    result=result||{};
    return {
        scanId:result.scanId||'',
        createdAt:result.createdAt||now(),
        stopDate:result.stopDate||'',
        tabTitle:result.tabTitle||'',
        reason:result.reason||'',
        pageCount:Number(result.pageCount||0),
        totalOrders:Number(result.totalOrders||0),
        totalGmv:Number(result.totalGmv||0),
        canceledGmv:Number(result.canceledGmv||0),
        nonCanceledLive:Number(result.nonCanceledLive||0),
        nonCanceledLiveGmv:Number(result.nonCanceledLiveGmv||0),
        nonCanceledNotLive:Number(result.nonCanceledNotLive||0),
        nonCanceledNotLiveGmv:Number(result.nonCanceledNotLiveGmv||0),
        withTracking:Number(result.withTracking||0),
        withoutTracking:Number(result.withoutTracking||0),
        byStatus:result.byStatus||{},
        daily:(result.daily||[]).slice(0,60),
        diffCount:Array.isArray(result.diffs)?result.diffs.length:Number(result.diffCount||0)
    };
}

function makeCompactReviewInfoForReplay(info){
    info=info||{};
    const status=info.orderStatus||"Unknown";
    const gmv=reviewOrderGmv(info);

    return {
        order:String(info.order||""),
        shortId:info.shortId||String(info.order||"").slice(-6),
        title:info.title||"",
        time:info.time||"",
        orderDate:info.orderDate||orderDateOnly(info.time||""),
        orderDateValue:Number(info.orderDateValue||parseOrderDateValue(info.time||"")||0),
        note:info.note||"",
        cleanNote:info.cleanNote||stripPrintedMark(info.note||""),
        orderType:info.orderType||"",
        orderStatus:status,
        isCanceled:isReviewCanceledOrder(info,status),
        shouldPrint:!!(info.shouldPrint||info.orderType),
        trackingText:info.trackingText||"",
        trackingList:Array.isArray(info.trackingList)?info.trackingList.slice(0,5):[],
        quantity:Number(info.quantity||info.qty||1)||1,
        qty:Number(info.quantity||info.qty||1)||1,
        gmv:gmv,
        amount:gmv,
        gmvText:info.gmvText||formatMoneyAmount(gmv)
    };
}

function makeCompactReviewDiffForReplay(diff,infoMap){
    diff=diff||{};
    const info=diff.info?makeCompactReviewInfoForReplay(diff.info):makeCompactReviewInfoForReplay(infoMap&&infoMap[diff.order]||{order:diff.order,shortId:diff.shortId,title:diff.title,time:diff.time,orderType:diff.orderType,orderStatus:diff.currentStatus,note:diff.currentNote,trackingText:diff.trackingText,gmv:diff.gmv});

    return {
        type:diff.type||"",
        typeText:diff.typeText||diff.type||"差异",
        order:diff.order||info.order,
        shortId:diff.shortId||info.shortId,
        title:diff.title||info.title||"",
        time:diff.time||info.time||"",
        orderDateValue:Number(diff.orderDateValue||info.orderDateValue||0),
        orderType:diff.orderType||info.orderType||"",
        gmv:Number(diff.gmv||info.gmv||0)||0,
        gmvText:diff.gmvText||info.gmvText||formatMoneyAmount(diff.gmv||info.gmv||0),
        currentStatus:diff.currentStatus||info.orderStatus||"Unknown",
        historyStatus:diff.historyStatus||"",
        currentNote:diff.currentNote||effectiveNote(info)||"",
        historyNote:diff.historyNote||"",
        trackingText:diff.trackingText||info.trackingText||"",
        printCount:Number(diff.printCount||0),
        changes:Array.isArray(diff.changes)?diff.changes.slice(0,12):[],
        oldSnapshot:diff.oldSnapshot?makeCompactReviewInfoForReplay(diff.oldSnapshot):null,
        newSnapshot:diff.newSnapshot?makeCompactReviewInfoForReplay(diff.newSnapshot):null,
        detectedAt:diff.detectedAt||"",
        scanId:diff.scanId||"",
        info:info
    };
}

function makeCompactReviewReplayItem(result,maxOrders,maxDiffs){
    result=result||{};
    maxOrders=Number(maxOrders||1500);
    maxDiffs=Number(maxDiffs||600);

    const orders=(Array.isArray(result.orders)?result.orders:[]).slice(0,maxOrders).map(makeCompactReviewInfoForReplay);
    const infoMap={};
    orders.forEach(info=>{if(info&&info.order)infoMap[info.order]=info;});
    const diffs=(Array.isArray(result.diffs)?result.diffs:[]).slice(0,maxDiffs).map(d=>makeCompactReviewDiffForReplay(d,infoMap));

    return Object.assign({},makeCompactReviewHistoryItem(result),{
        scriptVersion:SCRIPT_VERSION,
        conditions:{
            stopDate:result.stopDate||"",
            tabTitle:result.tabTitle||"",
            url:result.url||"",
            pageCount:Number(result.pageCount||0)
        },
        totalGmv:Number(result.totalGmv||0),
        canceledGmv:Number(result.canceledGmv||0),
        nonCanceledLive:Number(result.nonCanceledLive||0),
        nonCanceledLiveGmv:Number(result.nonCanceledLiveGmv||0),
        nonCanceledNotLive:Number(result.nonCanceledNotLive||0),
        nonCanceledNotLiveGmv:Number(result.nonCanceledNotLiveGmv||0),
        pageStats:Array.isArray(result.pageStats)?result.pageStats.slice(0,200):[],
        byStatus:result.byStatus||{},
        daily:Array.isArray(result.daily)?result.daily.slice(0,120):[],
        orders:orders,
        diffs:diffs,
        orderCountSaved:orders.length,
        diffCountSaved:diffs.length,
        ordersTruncated:Array.isArray(result.orders)&&result.orders.length>orders.length,
        diffsTruncated:Array.isArray(result.diffs)&&result.diffs.length>diffs.length
    });
}

function saveReviewScanHistory(result){
    // v11.0：不要再把 orders / diffs 全量写入 localStorage。
    // 全量订单已经在当前页面内存里，云端历史在 Firebase；本地只保存轻量复核摘要，避免 QuotaExceededError。
    const hist=getJson(REVIEW_SCAN_HISTORY_KEY,[]);
    hist.unshift(makeCompactReviewHistoryItem(result));
    setJson(REVIEW_SCAN_HISTORY_KEY,hist.slice(0,10));
}

function saveReviewReplayHistory(result){
    const hist=getJson(REVIEW_RESULT_HISTORY_KEY,[]);
    const tiers=[
        {keep:6,orders:1500,diffs:600,label:"完整"},
        {keep:4,orders:900,diffs:320,label:"压缩"},
        {keep:3,orders:500,diffs:180,label:"强压缩"},
        {keep:2,orders:220,diffs:80,label:"摘要压缩"}
    ];

    let lastItem=null;

    for(const tier of tiers){
        const item=makeCompactReviewReplayItem(result,tier.orders,tier.diffs);
        item.saveLevel=tier.label;
        lastItem=item;

        const next=[item]
            .concat(hist.filter(x=>x&&x.scanId!==item.scanId).map(x=>makeCompactReviewReplayItem(x,tier.orders,tier.diffs)))
            .slice(0,tier.keep);

        if(setJson(REVIEW_RESULT_HISTORY_KEY,next)){
            renderReviewReplayHistoryPanel();
            return {
                ok:true,
                level:tier.label,
                orders:item.orderCountSaved||0,
                diffs:item.diffCountSaved||0,
                truncated:!!(item.ordersTruncated||item.diffsTruncated)
            };
        }
    }

    const summaryHist=getJson(REVIEW_SCAN_HISTORY_KEY,[]);
    const summary=Object.assign({},makeCompactReviewHistoryItem(result),{
        scanId:result&&result.scanId||("summary_"+Date.now()),
        summaryOnly:true,
        saveLevel:"仅摘要",
        saveFailed:true,
        orderCountSaved:lastItem&&lastItem.orderCountSaved||0,
        diffCountSaved:lastItem&&lastItem.diffCountSaved||0
    });

    setJson(REVIEW_SCAN_HISTORY_KEY,[summary].concat(summaryHist.filter(x=>x&&x.scanId!==summary.scanId)).slice(0,10));
    renderReviewReplayHistoryPanel();
    return {
        ok:false,
        level:"失败，仅保存摘要",
        orders:0,
        diffs:0,
        truncated:true
    };
}

function getReviewReplayHistory(){
    const full=(getJson(REVIEW_RESULT_HISTORY_KEY,[])||[]).filter(x=>x&&x.scanId);
    const seen={};
    full.forEach(x=>{seen[x.scanId]=true;});
    const summaries=(getJson(REVIEW_SCAN_HISTORY_KEY,[])||[])
        .filter(x=>x&&x.scanId&&!seen[x.scanId])
        .map(x=>Object.assign({},x,{summaryOnly:true}));

    return full.concat(summaries).filter(x=>x&&x.scanId);
}

function restoreReviewReplayHistory(scanId){
    const item=getReviewReplayHistory().find(x=>x.scanId===scanId);

    if(!item){
        alert("没有找到这次复核历史。");
        return;
    }

    if(item.summaryOnly&&!Array.isArray(item.orders)){
        reviewScannedInfos=[];
        reviewDifferences=[];
        reviewPageStats=Array.isArray(item.pageStats)?item.pageStats.slice():[];
        reviewLastResult=Object.assign({},item,{restoredFromHistory:true});
        renderReviewRows();
        renderReviewPageStats();
        renderReviewReplayHistoryPanel();
        updateReviewStatus(
            "这条复核历史只有摘要，不能复现每条订单明细。时间："+(item.createdAt||"")+
            "；订单 "+(item.totalOrders||0)+
            " 个；差异 "+(item.diffCount||0)+
            " 条。后续 v"+SCRIPT_VERSION+" 会每页自动保存可复现结果。"
        );
        return;
    }

    reviewScannedInfos=(item.orders||[]).map(makeCompactReviewInfoForReplay).filter(x=>x.order);
    const infoMap={};
    reviewScannedInfos.forEach(info=>{infoMap[info.order]=info;});
    reviewDifferences=(item.diffs||[]).map(d=>makeCompactReviewDiffForReplay(d,infoMap));
    reviewPageStats=Array.isArray(item.pageStats)?item.pageStats.slice():[];
    reviewLastResult=Object.assign({},item,{orders:reviewScannedInfos,diffs:reviewDifferences,restoredFromHistory:true});
    reviewRunning=false;
    reviewAbortRequested=false;

    try{
        const dateEl=document.getElementById("tkReviewCutoffDate");
        const stopDate=(item.conditions&&item.conditions.stopDate)||item.stopDate||"";
        if(dateEl&&/^\d{4}-\d{2}-\d{2}$/.test(stopDate))dateEl.value=stopDate;
    }catch(e){}

    renderReviewRows();
    renderReviewPageStats();
    renderReviewReplayHistoryPanel();

    updateReviewStatus(
        "已复现复核历史："+(item.createdAt||"")+
        "；条件：复核到 "+((item.conditions&&item.conditions.stopDate)||item.stopDate||"未记录")+
        "；订单 "+reviewScannedInfos.length+
        " 个；差异 "+reviewDifferences.length+
        " 条。"+(item.ordersTruncated||item.diffsTruncated?"（该历史因存储限制有截取）":"")
    );
}

function renderReviewReplayHistoryPanel(){
    const box=document.getElementById("tkReviewReplayHistory");
    if(!box)return;

    const hist=getReviewReplayHistory();

    if(!hist.length){
        box.innerHTML='<div style="color:#666;font-weight:bold;">复核历史：暂无可复现历史。完成一次复核后会自动保存。</div>';
        return;
    }

    const currentScanId=reviewLastResult&&reviewLastResult.scanId?reviewLastResult.scanId:"";

    box.innerHTML=
        '<div style="display:grid;grid-template-columns:86px minmax(260px,1fr) auto;gap:8px;align-items:center;">'+
            '<label for="tkReviewReplaySelect" style="font-weight:900;white-space:nowrap;">复核历史</label>'+
            '<select id="tkReviewReplaySelect" style="padding:7px;border:1px solid #8aa7e8;border-radius:6px;background:white;font-weight:bold;min-width:0;width:100%;">'+
                '<option value="">选择历史结果复现...</option>'+
                hist.map(item=>{
                    const active=currentScanId&&currentScanId===item.scanId;
                    const stopDate=(item.conditions&&item.conditions.stopDate)||item.stopDate||"未记录";
                    const tab=(item.conditions&&item.conditions.tabTitle)||item.tabTitle||"";
                    const summaryOnly=!!item.summaryOnly&&!Array.isArray(item.orders);
                    const label=summaryOnly?"仅摘要":(item.saveLevel||"可复现");
                    const text=[
                        item.createdAt||"",
                        label,
                        "到 "+stopDate,
                        "订单 "+(item.orderCountSaved||item.totalOrders||0),
                        "差异 "+(item.diffCountSaved||item.diffCount||0),
                        "GMV "+formatMoneyAmount(item.totalGmv||0),
                        tab
                    ].filter(Boolean).join(" ｜ ");

                    return '<option value="'+esc(item.scanId)+'" '+(active?'selected':'')+'>'+esc(text)+'</option>';
                }).join("")+
            '</select>'+
            '<button id="tkReviewReplayGo" style="padding:7px 12px;border:1px solid #111;border-radius:6px;background:#111;color:white;font-weight:900;cursor:pointer;">复现</button>'+
        '</div>'+
        '<div id="tkReviewReplayHint" style="margin-top:4px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+
            (currentScanId?'当前已载入所选复核历史。':'选择历史后会自动恢复当时的统计和差异结果。')+
        '</div>';

    function restoreSelectedHistory(){
        const select=document.getElementById("tkReviewReplaySelect");
        const scanId=select&&select.value?select.value:"";

        if(scanId)restoreReviewReplayHistory(scanId);
    }

    const select=document.getElementById("tkReviewReplaySelect");
    if(select)select.onchange=function(e){
        e.preventDefault();
        e.stopPropagation();
        restoreSelectedHistory();
    };

    const goBtn=document.getElementById("tkReviewReplayGo");
    if(goBtn)goBtn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        restoreSelectedHistory();
    };
}

function reviewOrderQuantity(info){
    const n=Number(info&&(info.quantity||info.qty)||1);
    return Number.isFinite(n)&&n>0?n:1;
}

function reviewProductTitleKey(info){
    return norm((info&&info.title)||"未识别标题")||"未识别标题";
}

function buildReviewProductAnalysisRows(){
    const map={};

    (reviewScannedInfos||[]).forEach(info=>{
        if(!info||!info.order)return;

        const title=reviewProductTitleKey(info);
        const status=info.orderStatus||"Unknown";
        const canceled=isReviewCanceledOrder(info,status);
        const live=isReviewLiveOrder(info);
        const qty=reviewOrderQuantity(info);
        const gmv=reviewOrderGmv(info);

        if(!map[title]){
            map[title]={
                title,
                orderCount:0,
                unitCount:0,
                gmv:0,
                canceledOrders:0,
                canceledUnits:0,
                canceledGmv:0,
                liveOrders:0,
                liveUnits:0,
                liveGmv:0,
                windowOrders:0,
                windowUnits:0,
                windowGmv:0,
                statuses:{},
                orders:[]
            };
        }

        const row=map[title];
        row.orderCount++;
        row.unitCount+=qty;
        row.gmv+=gmv;
        row.statuses[status]=(row.statuses[status]||0)+1;

        if(canceled){
            row.canceledOrders++;
            row.canceledUnits+=qty;
            row.canceledGmv+=gmv;
        }else if(live){
            row.liveOrders++;
            row.liveUnits+=qty;
            row.liveGmv+=gmv;
        }else{
            row.windowOrders++;
            row.windowUnits+=qty;
            row.windowGmv+=gmv;
        }

        row.orders.push(info);
    });

    return Object.values(map).sort((a,b)=>(b.gmv-a.gmv)||(b.unitCount-a.unitCount)||a.title.localeCompare(b.title));
}

function ensureReviewProductAnalysisWindow(){
    let win=document.getElementById("tk-review-product-analysis-window");
    if(win){
        focusFloatingWorkWindow(win);
        return win;
    }

    win=document.createElement("div");
    win.id="tk-review-product-analysis-window";
    win.style.cssText=`
        position:fixed;
        left:110px;
        top:48px;
        width:1280px;
        max-width:94vw;
        height:88vh;
        background:white;
        z-index:2147483200;
        border:2px solid #111;
        border-radius:10px;
        box-shadow:0 6px 36px rgba(0,0,0,.35);
        font-family:Arial,"Microsoft YaHei",sans-serif;
        display:flex;
        flex-direction:column;
        overflow:hidden;
        resize:both;
        min-width:820px;
        min-height:520px;
        box-sizing:border-box;
    `;

    win.innerHTML=`
        <div id="tkReviewProductHeader" style="background:#111;color:white;padding:8px 12px;font-weight:900;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:move;user-select:none;flex:0 0 auto;">
            <span>商品维度分析 v${SCRIPT_VERSION}</span>
            <div style="display:flex;gap:8px;align-items:center;">
                <button id="tkReviewProductCopy" style="padding:5px 10px;border:0;border-radius:5px;background:white;color:#111;font-weight:bold;cursor:pointer;">复制汇总</button>
                <button id="tkReviewProductMax" style="padding:5px 10px;border:0;border-radius:5px;background:white;color:#111;font-weight:bold;cursor:pointer;">最大化</button>
                <button id="tkReviewProductClose" style="padding:5px 12px;border:0;border-radius:5px;background:#ff3b30;color:white;font-weight:bold;cursor:pointer;">关闭</button>
            </div>
        </div>
        <div style="padding:7px 10px;background:#fff7d6;border-bottom:1px solid #e6d28a;font-size:12px;line-height:1.4;flex:0 0 auto;">
            <div id="tkReviewProductSummary"></div>
            <div style="display:flex;gap:8px;margin-top:7px;align-items:center;flex-wrap:wrap;">
                <input id="tkReviewProductSearch" placeholder="搜索Title/订单号/Note" style="padding:7px 9px;border:1px solid #aaa;border-radius:5px;min-width:280px;flex:1;">
                <select id="tkReviewProductSort" style="padding:7px;border:1px solid #aaa;border-radius:5px;">
                    <option value="gmv">按GMV降序</option>
                    <option value="units">按件数降序</option>
                    <option value="orders">按订单数降序</option>
                    <option value="title">按Title排序</option>
                </select>
            </div>
        </div>
        <div id="tkReviewProductRows" style="padding:7px 10px;overflow:auto;flex:1 1 auto;min-height:260px;background:#fafafa;"></div>
    `;

    document.body.appendChild(win);
    makeFloatingWindowDraggable(win,"#tkReviewProductHeader");
    focusFloatingWorkWindow(win);

    document.getElementById("tkReviewProductClose").onclick=function(){
        const detail=document.getElementById("tk-review-product-detail-window");
        if(detail)detail.remove();
        removeFloatingWorkWindow(win);
    };
    document.getElementById("tkReviewProductMax").onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        toggleFloatingWorkWindowMaximized(win,this,{left:110,top:48,width:1280,height:Math.floor(window.innerHeight*0.88),maxWidth:"94vw",maxHeight:"88vh"});
    };
    document.getElementById("tkReviewProductSearch").oninput=renderReviewProductAnalysis;
    document.getElementById("tkReviewProductSort").onchange=renderReviewProductAnalysis;
    document.getElementById("tkReviewProductCopy").onclick=function(){
        const text=makeReviewProductAnalysisText();
        copyTextToClipboard(text).then(()=>{
            this.innerText="已复制";
            setTimeout(()=>{this.innerText="复制汇总";},1000);
        });
    };

    return win;
}

function getFilteredReviewProductRows(){
    const q=norm((document.getElementById("tkReviewProductSearch")||{}).value||"").toLowerCase();
    const sort=(document.getElementById("tkReviewProductSort")||{}).value||"gmv";
    let rows=buildReviewProductAnalysisRows();

    if(q){
        rows=rows.filter(row=>{
            const txt=[
                row.title,
                row.orders.map(o=>[o.order,o.shortId,o.note,o.cleanNote,o.orderStatus,o.orderType].join(" ")).join(" ")
            ].join(" ").toLowerCase();

            return txt.includes(q);
        });
    }

    rows.sort((a,b)=>{
        if(sort==="units")return (b.unitCount-a.unitCount)||(b.gmv-a.gmv);
        if(sort==="orders")return (b.orderCount-a.orderCount)||(b.gmv-a.gmv);
        if(sort==="title")return a.title.localeCompare(b.title);
        return (b.gmv-a.gmv)||(b.unitCount-a.unitCount);
    });

    return rows;
}

function statusSummaryText(statuses){
    return Object.keys(statuses||{}).sort().map(k=>k+":"+statuses[k]).join("，")||"无";
}

function renderReviewProductAnalysis(){
    const win=ensureReviewProductAnalysisWindow();
    const rowsBox=document.getElementById("tkReviewProductRows");
    const summary=document.getElementById("tkReviewProductSummary");
    const rows=getFilteredReviewProductRows();
    const all=buildReviewProductAnalysisRows();
    const orderTotal=all.reduce((s,x)=>s+x.orderCount,0);
    const unitTotal=all.reduce((s,x)=>s+x.unitCount,0);
    const gmvTotal=all.reduce((s,x)=>s+x.gmv,0);
    const liveOrders=all.reduce((s,x)=>s+x.liveOrders,0);
    const liveUnits=all.reduce((s,x)=>s+x.liveUnits,0);
    const liveGmv=all.reduce((s,x)=>s+x.liveGmv,0);
    const windowOrders=all.reduce((s,x)=>s+x.windowOrders,0);
    const windowUnits=all.reduce((s,x)=>s+x.windowUnits,0);
    const windowGmv=all.reduce((s,x)=>s+x.windowGmv,0);
    const canceledOrders=all.reduce((s,x)=>s+x.canceledOrders,0);
    const canceledUnits=all.reduce((s,x)=>s+x.canceledUnits,0);
    const canceledGmv=all.reduce((s,x)=>s+x.canceledGmv,0);

    if(summary){
        const source=reviewLastResult&&reviewLastResult.createdAt?("当前结果："+reviewLastResult.createdAt):"当前复核结果";
        summary.innerHTML=
            '<b>'+esc(source)+'</b> ｜ Title '+esc(all.length)+' 个 ｜ 订单 '+esc(orderTotal)+' 单 ｜ 件数 '+esc(unitTotal)+' 个 ｜ GMV '+esc(formatMoneyAmount(gmvTotal))+
            ' ｜ 非Canceled LIVE '+esc(liveOrders)+' 单 / '+esc(liveUnits)+' 个 / '+esc(formatMoneyAmount(liveGmv))+
            ' ｜ 橱窗订单 '+esc(windowOrders)+' 单 / '+esc(windowUnits)+' 个 / '+esc(formatMoneyAmount(windowGmv))+
            ' ｜ Canceled '+esc(canceledOrders)+' 单 / '+esc(canceledUnits)+' 个 / '+esc(formatMoneyAmount(canceledGmv));
    }

    if(!rowsBox)return;

    if(!all.length){
        rowsBox.innerHTML='<div style="padding:30px;text-align:center;color:#666;">当前没有可分析的复核订单。请先完成复核，或点击一个可复现的复核历史。</div>';
        return;
    }

    rowsBox.innerHTML=`
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:white;">
            <thead>
                <tr>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;text-align:left;min-width:260px;">Title / SKU</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">总单</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">总件数</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">总GMV</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">LIVE单/件/GMV</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">橱窗单/件/GMV</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">Canceled单/件/GMV</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">状态</th>
                    <th style="position:sticky;top:0;background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">明细</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((row,i)=>`
                    <tr class="tkReviewProductRow" data-index="${i}" style="cursor:pointer;background:${i%2?'#fff':'#fbfdff'};">
                        <td style="border:1px solid #d8dee4;padding:7px;word-break:break-word;"><b>${esc(row.title)}</b></td>
                        <td style="border:1px solid #d8dee4;padding:7px;text-align:center;font-weight:900;">${esc(row.orderCount)}</td>
                        <td style="border:1px solid #d8dee4;padding:7px;text-align:center;font-weight:900;">${esc(row.unitCount)}</td>
                        <td style="border:1px solid #d8dee4;padding:7px;text-align:right;font-weight:900;">${esc(formatMoneyAmount(row.gmv))}</td>
                        <td style="border:1px solid #d8dee4;padding:7px;color:#0a7f3f;font-weight:900;">${esc(row.liveOrders)} / ${esc(row.liveUnits)} / ${esc(formatMoneyAmount(row.liveGmv))}</td>
                        <td style="border:1px solid #d8dee4;padding:7px;font-weight:900;">${esc(row.windowOrders)} / ${esc(row.windowUnits)} / ${esc(formatMoneyAmount(row.windowGmv))}</td>
                        <td style="border:1px solid #d8dee4;padding:7px;color:#d60000;font-weight:900;">${esc(row.canceledOrders)} / ${esc(row.canceledUnits)} / ${esc(formatMoneyAmount(row.canceledGmv))}</td>
                        <td style="border:1px solid #d8dee4;padding:7px;">${esc(statusSummaryText(row.statuses))}</td>
                        <td style="border:1px solid #d8dee4;padding:7px;text-align:center;"><button class="tkReviewProductOpenDetail" data-index="${i}" style="padding:4px 9px;border:1px solid #111;border-radius:5px;background:white;color:#111;font-weight:bold;cursor:pointer;">打开</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    rowsBox.querySelectorAll(".tkReviewProductRow").forEach(tr=>{
        tr.onclick=function(){
            const index=Number(this.getAttribute("data-index")||0);
            const row=rows[index];
            if(row)renderReviewProductDetail(row);
        };
    });
}

function ensureReviewProductDetailWindow(){
    let win=document.getElementById("tk-review-product-detail-window");
    if(win){
        focusFloatingWorkWindow(win);
        return win;
    }

    win=document.createElement("div");
    win.id="tk-review-product-detail-window";
    win.style.cssText=`
        position:fixed;
        left:170px;
        top:78px;
        width:1120px;
        max-width:92vw;
        height:76vh;
        max-height:88vh;
        background:white;
        z-index:2147483300;
        border:2px solid #111;
        border-radius:10px;
        box-shadow:0 8px 38px rgba(0,0,0,.38);
        font-family:Arial,"Microsoft YaHei",sans-serif;
        display:flex;
        flex-direction:column;
        overflow:hidden;
        resize:both;
        box-sizing:border-box;
    `;

    win.innerHTML=`
        <div id="tkReviewProductDetailHeader" style="background:#111;color:white;padding:8px 12px;font-weight:900;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:move;user-select:none;flex:0 0 auto;">
            <span id="tkReviewProductDetailTitle">商品订单明细 v${SCRIPT_VERSION}</span>
            <div style="display:flex;gap:8px;align-items:center;">
                <button id="tkReviewProductCopyOrders" style="padding:5px 10px;border:0;border-radius:5px;background:white;color:#111;font-weight:bold;cursor:pointer;">复制明细</button>
                <button id="tkReviewProductDetailMax" style="padding:5px 10px;border:0;border-radius:5px;background:white;color:#111;font-weight:bold;cursor:pointer;">最大化</button>
                <button id="tkReviewProductDetailClose" style="padding:5px 12px;border:0;border-radius:5px;background:#ff3b30;color:white;font-weight:bold;cursor:pointer;">关闭</button>
            </div>
        </div>
        <div id="tkReviewProductDetailSummary" style="padding:8px 10px;background:#fff7d6;border-bottom:1px solid #e6d28a;font-size:12px;line-height:1.45;flex:0 0 auto;"></div>
        <div id="tkReviewProductDetailRows" style="padding:8px 10px;overflow:auto;flex:1 1 auto;min-height:220px;background:#fafafa;"></div>
    `;

    document.body.appendChild(win);
    makeFloatingWindowDraggable(win,"#tkReviewProductDetailHeader");
    focusFloatingWorkWindow(win);
    document.getElementById("tkReviewProductDetailClose").onclick=function(){removeFloatingWorkWindow(win);};
    document.getElementById("tkReviewProductDetailMax").onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        toggleFloatingWorkWindowMaximized(win,this,{left:170,top:78,width:1120,height:Math.floor(window.innerHeight*0.76),maxWidth:"92vw",maxHeight:"88vh"});
    };
    return win;
}

function renderReviewProductDetail(row){
    if(!row)return;

    const win=ensureReviewProductDetailWindow();
    const titleEl=document.getElementById("tkReviewProductDetailTitle");
    const summary=document.getElementById("tkReviewProductDetailSummary");
    const box=document.getElementById("tkReviewProductDetailRows");
    if(!box)return;

    const orders=row.orders.slice().sort((a,b)=>(b.orderDateValue||0)-(a.orderDateValue||0));

    if(titleEl)titleEl.textContent="商品订单明细 v"+SCRIPT_VERSION+" ｜ "+String(row.title||"").slice(0,48);
    if(summary){
        summary.innerHTML=
            '<b>'+esc(row.title)+'</b><br>'+
            '订单 '+esc(row.orderCount)+' 单 ｜ 件数 '+esc(row.unitCount)+' 个 ｜ GMV '+esc(formatMoneyAmount(row.gmv))+
            ' ｜ LIVE '+esc(row.liveOrders)+' 单 / '+esc(row.liveUnits)+' 个 / '+esc(formatMoneyAmount(row.liveGmv))+
            ' ｜ 橱窗订单 '+esc(row.windowOrders)+' 单 / '+esc(row.windowUnits)+' 个 / '+esc(formatMoneyAmount(row.windowGmv))+
            ' ｜ Canceled '+esc(row.canceledOrders)+' 单 / '+esc(row.canceledUnits)+' 个 / '+esc(formatMoneyAmount(row.canceledGmv));
    }

    box.innerHTML=`
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;text-align:left;">订单</th>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">时间</th>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">类型</th>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">状态</th>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">数量</th>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">GMV</th>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">Note</th>
                <th style="background:#f6f8fa;border:1px solid #d8dee4;padding:6px;">快递</th>
            </tr></thead>
            <tbody>
                ${orders.map(info=>{
                    const status=info.orderStatus||"Unknown";
                    const type=isReviewLiveOrder(info)?"LIVE":"橱窗订单";
                    const note=effectiveNote(info)||"";
                    return `<tr>
                        <td style="border:1px solid #d8dee4;padding:6px;"><b>${esc(info.shortId||String(info.order).slice(-6))}</b><br><span style="color:#666;">${esc(info.order||"")}</span></td>
                        <td style="border:1px solid #d8dee4;padding:6px;">${esc(info.time||"")}</td>
                        <td style="border:1px solid #d8dee4;padding:6px;font-weight:900;">${esc(type)}</td>
                        <td style="border:1px solid #d8dee4;padding:6px;color:${status==="Canceled"?'#d60000':'#111'};font-weight:900;">${esc(status)}</td>
                        <td style="border:1px solid #d8dee4;padding:6px;text-align:center;font-weight:900;">${esc(reviewOrderQuantity(info))}</td>
                        <td style="border:1px solid #d8dee4;padding:6px;text-align:right;font-weight:900;">${esc(formatMoneyAmount(reviewOrderGmv(info)))}</td>
                        <td style="border:1px solid #d8dee4;padding:6px;word-break:break-word;">${esc(note||"空")}</td>
                        <td style="border:1px solid #d8dee4;padding:6px;word-break:break-word;">${esc(info.trackingText||"无/未识别")}</td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>
    `;

    const copyBtn=document.getElementById("tkReviewProductCopyOrders");
    if(copyBtn)copyBtn.onclick=function(){
        const lines=[
            "Title: "+row.title,
            "订单 "+row.orderCount+" 单；件数 "+row.unitCount+" 个；GMV "+formatMoneyAmount(row.gmv),
            "订单号\t时间\t类型\t状态\t数量\tGMV\tNote\t快递"
        ];

        orders.forEach(info=>{
            lines.push([
                info.order||"",
                info.time||"",
                isReviewLiveOrder(info)?"LIVE":"橱窗订单",
                info.orderStatus||"",
                reviewOrderQuantity(info),
                formatMoneyAmount(reviewOrderGmv(info)),
                effectiveNote(info)||"",
                info.trackingText||""
            ].join("\t"));
        });

        copyTextToClipboard(lines.join("\n")).then(()=>{
            copyBtn.innerText="已复制";
            setTimeout(()=>{copyBtn.innerText="复制明细";},1000);
        });
    };

    win.style.display="flex";
}

function makeReviewProductAnalysisText(){
    const rows=buildReviewProductAnalysisRows();
    const lines=[
        "商品维度分析 v"+SCRIPT_VERSION,
        "生成时间："+now(),
        "Title\t总单\t总件数\t总GMV\tLIVE单\tLIVE件\tLIVE GMV\t橱窗单\t橱窗件\t橱窗GMV\tCanceled单\tCanceled件\tCanceled GMV\t状态"
    ];

    rows.forEach(row=>{
        lines.push([
            row.title,
            row.orderCount,
            row.unitCount,
            formatMoneyAmount(row.gmv),
            row.liveOrders,
            row.liveUnits,
            formatMoneyAmount(row.liveGmv),
            row.windowOrders,
            row.windowUnits,
            formatMoneyAmount(row.windowGmv),
            row.canceledOrders,
            row.canceledUnits,
            formatMoneyAmount(row.canceledGmv),
            statusSummaryText(row.statuses)
        ].join("\t"));
    });

    return lines.join("\n");
}

function openReviewProductAnalysis(){
    if(!reviewScannedInfos||!reviewScannedInfos.length){
        alert("当前没有可分析的复核订单。请先完成复核，或点击复核历史复现结果。");
        return;
    }

    ensureReviewProductAnalysisWindow();
    renderReviewProductAnalysis();
}

function renderReviewPageStats(){
    const el=document.getElementById("tkReviewPageStats");
    if(!el)return;

    if((!reviewScannedInfos||!reviewScannedInfos.length)&&reviewLastResult&&reviewLastResult.summaryOnly&&Array.isArray(reviewLastResult.daily)&&reviewLastResult.daily.length){
        const rows=reviewLastResult.daily.map(x=>`<tr>
            <td><b>${esc(x.date||"日期未识别")}</b></td>
            <td>${esc(x.total||0)}</td>
            <td>${esc(formatMoneyAmount(x.totalGmv||0))}</td>
            <td>${esc(x.canceled||0)}</td>
            <td>${esc(formatMoneyAmount(x.canceledGmv||0))}</td>
            <td>${esc(x.nonCanceledLive||0)}</td>
            <td>${esc(formatMoneyAmount(x.nonCanceledLiveGmv||0))}</td>
            <td>${esc(x.nonCanceledNotLive||0)}</td>
            <td>${esc(formatMoneyAmount(x.nonCanceledNotLiveGmv||0))}</td>
        </tr>`).join("");
        el.innerHTML=`
            <style>
                #tkReviewPageStats table{width:100%;border-collapse:collapse;font-size:12px;}
                #tkReviewPageStats th{background:#f6f8fa;text-align:left;border:1px solid #d8dee4;padding:6px;}
                #tkReviewPageStats td{border:1px solid #d8dee4;padding:6px;vertical-align:top;}
            </style>
            <div style="background:#fff7d6;border:1px solid #e6d28a;border-radius:8px;padding:8px;margin-bottom:8px;font-weight:bold;">这次历史只有摘要，无法复现每条订单明细；下面显示当时保存下来的每日统计。</div>
            <div style="overflow-x:auto;background:white;border:1px solid #d0d7de;border-radius:8px;padding:9px;">
                <div style="font-weight:900;margin-bottom:7px;">按日期统计摘要</div>
                <table><thead><tr><th>日期</th><th>总单</th><th>总GMV</th><th>Canceled</th><th>Canceled GMV</th><th>非Canceled LIVE</th><th>LIVE GMV</th><th>非Canceled 橱窗订单</th><th>橱窗订单 GMV</th></tr></thead><tbody>${rows}</tbody></table>
            </div>
        `;
        return;
    }

    const infos=(reviewScannedInfos||[]).filter(x=>x&&x.order);
    const diffs=(reviewDifferences||[]).filter(Boolean);

    if(!reviewPageStats.length && !infos.length){
        el.innerHTML="暂无分页扫描统计。复核开始后这里会显示卡片+表格汇总。";
        return;
    }

    const dateMap={};
    const statusMap={};
    const diffMap={};
    let total=infos.length;
    let live=0,notLive=0,canceled=0,withNote=0,noNote=0,withTracking=0,noTracking=0;
    let printed=0,noteAndPrinted=0,noteButNoPrint=0,printedButNoteDiff=0;
    let totalGmv=0,canceledGmv=0,nonCanceledLive=0,nonCanceledLiveGmv=0,nonCanceledNotLive=0,nonCanceledNotLiveGmv=0;

    function addMap(obj,k,n){k=k||"Unknown";obj[k]=(obj[k]||0)+(n||1);}
    function statusLine(obj){return Object.keys(obj||{}).sort().map(k=>esc(k)+" <b>"+obj[k]+"</b>").join("；")||"无";}

    infos.forEach(info=>{
        const date=info.orderDate||orderDateOnly(info.time)||"日期未识别";
        const status=info.orderStatus||"Unknown";
        const note=effectiveNote(info)||"";
        const gmv=reviewOrderGmv(info);
        const isCanceled=isReviewCanceledOrder(info,status);
        const isLive=isReviewLiveOrder(info);
        const pCount=getTotalPrintCount(info.order)||0;
        const agg=getHistoryAggregate(info.order)||{};
        const hNote=stripPrintedMark(agg.note||agg.systemNote||"");
        if(!dateMap[date])dateMap[date]={date,total:0,totalGmv:0,live:0,notLive:0,canceled:0,canceledGmv:0,nonCanceledLive:0,nonCanceledLiveGmv:0,nonCanceledNotLive:0,nonCanceledNotLiveGmv:0,byStatus:{},withNote:0,noNote:0,withTracking:0,noTracking:0,printed:0,notePrintedMatch:0,noteNoPrint:0,printedNoteDiff:0,abnormal:0};
        const d=dateMap[date];
        d.total++;
        d.totalGmv+=gmv;
        totalGmv+=gmv;
        addMap(d.byStatus,status); addMap(statusMap,status);
        if(isLive){live++;d.live++;}else{notLive++;d.notLive++;}
        if(isCanceled){
            canceled++;
            canceledGmv+=gmv;
            d.canceled++;
            d.canceledGmv+=gmv;
        }else if(isLive){
            nonCanceledLive++;
            nonCanceledLiveGmv+=gmv;
            d.nonCanceledLive++;
            d.nonCanceledLiveGmv+=gmv;
        }else{
            nonCanceledNotLive++;
            nonCanceledNotLiveGmv+=gmv;
            d.nonCanceledNotLive++;
            d.nonCanceledNotLiveGmv+=gmv;
        }
        if(note){withNote++;d.withNote++;}else{noNote++;d.noNote++;}
        if(info.trackingText){withTracking++;d.withTracking++;}else{noTracking++;d.noTracking++;}
        if(pCount>0){printed++;d.printed++;}
        if(note && pCount>0 && (!hNote || hNote===note)){noteAndPrinted++;d.notePrintedMatch++;}
        if(note && pCount===0){noteButNoPrint++;d.noteNoPrint++;}
        if(note && pCount>0 && hNote && hNote!==note){printedButNoteDiff++;d.printedNoteDiff++;}
    });

    diffs.forEach(d=>{
        addMap(diffMap,d.typeText||d.type||"差异");
        const date=(d.info&&d.info.orderDate)||orderDateOnly(d.time||"")||"日期未识别";
        if(dateMap[date])dateMap[date].abnormal++;
    });

    const totalPages=reviewPageStats.length;
    const totalOrders=reviewPageStats.reduce((s,x)=>s+x.total,0);
    const totalInRange=reviewPageStats.reduce((s,x)=>s+(x.inRange||x.recent||0),0);
    const totalOld=reviewPageStats.reduce((s,x)=>s+(x.old||0),0);
    const totalUnknown=reviewPageStats.reduce((s,x)=>s+(x.unknown||0),0);
    const totalDiffs=diffs.length || reviewPageStats.reduce((s,x)=>s+(x.diffCount||0),0);
    const nonCanceledGmv=nonCanceledLiveGmv+nonCanceledNotLiveGmv;

    const statusCards=Object.keys(statusMap).sort().map(k=>{
        const danger=/cancel/i.test(k)?"color:#d60000;background:#fff0f0;border-color:#ffb3b3;":"";
        return `<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 9px;border:1px solid #e5e7eb;border-radius:6px;background:#f6f8fa;${danger}"><span>${esc(k)}</span><b>${statusMap[k]}</b></div>`;
    }).join("")||'<div style="padding:8px;color:#666;">暂无状态统计</div>';

    const diffRows=Object.keys(diffMap).sort().map(k=>`<tr><td>${esc(k)}</td><td style="color:#b36b00;font-weight:900;">${diffMap[k]}</td></tr>`).join("")||'<tr><td>无</td><td>0</td></tr>';

    const dateRows=Object.keys(dateMap).sort().reverse().map(date=>{
        const x=dateMap[date];
        return `<tr>
            <td><b>${esc(date)}</b></td>
            <td>${x.total}</td>
            <td style="font-weight:900;">${esc(formatMoneyAmount(x.totalGmv||0))}</td>
            <td style="color:#d60000;font-weight:900;">${x.canceled||0}</td>
            <td style="color:#d60000;font-weight:900;">${esc(formatMoneyAmount(x.canceledGmv||0))}</td>
            <td style="color:#0a7f3f;font-weight:900;">${x.nonCanceledLive||0}</td>
            <td style="color:#0a7f3f;font-weight:900;">${esc(formatMoneyAmount(x.nonCanceledLiveGmv||0))}</td>
            <td>${x.nonCanceledNotLive||0}</td>
            <td>${esc(formatMoneyAmount(x.nonCanceledNotLiveGmv||0))}</td>
            <td>${statusLine(x.byStatus)}</td>
            <td>${x.withNote}</td>
            <td>${x.noNote}</td>
            <td>${x.printed}</td>
            <td style="color:#d60000;font-weight:900;">${x.noteNoPrint}</td>
            <td style="color:#b36b00;font-weight:900;">${x.printedNoteDiff}</td>
            <td style="color:#b36b00;font-weight:900;">${x.abnormal}</td>
        </tr>`;
    }).join("")||'<tr><td colspan="16">暂无日期数据</td></tr>';

    const textLines=[];
    textLines.push('TikTok订单复核汇总 v'+SCRIPT_VERSION);
    textLines.push('复核时间：'+now());
    textLines.push('复核页数：'+totalPages+' 页；页面扫描订单：'+totalOrders+'；范围内订单：'+(total||totalInRange)+'；早于截止：'+totalOld+'；日期未识别：'+totalUnknown);
    textLines.push('物流状态统计：'+Object.keys(statusMap).sort().map(k=>k+': '+statusMap[k]).join('，'));
    textLines.push('GMV统计：总 '+formatMoneyAmount(totalGmv)+'；Canceled '+formatMoneyAmount(canceledGmv)+'；非Canceled '+formatMoneyAmount(nonCanceledGmv));
    textLines.push('订单类型统计：总LIVE '+live+'；总橱窗订单 '+notLive+'；非Canceled LIVE '+nonCanceledLive+' 单 / '+formatMoneyAmount(nonCanceledLiveGmv)+'；非Canceled 橱窗订单 '+nonCanceledNotLive+' 单 / '+formatMoneyAmount(nonCanceledNotLiveGmv));
    textLines.push('Note统计：有Note '+withNote+'；Note为空 '+noNote+'；有Note且已打印/匹配 '+noteAndPrinted+'；有Note但0次打印 '+noteButNoPrint+'；已打印但Note不一致 '+printedButNoteDiff);
    textLines.push('快递单号：有 '+withTracking+'；无/未识别 '+noTracking);
    textLines.push('差异/异常合计：'+totalDiffs+'；'+Object.keys(diffMap).sort().map(k=>k+': '+diffMap[k]).join('，'));
    textLines.push('按日期统计：');
    Object.keys(dateMap).sort().reverse().forEach(date=>{
        const x=dateMap[date];
        textLines.push(date+'：总 '+x.total+' / GMV '+formatMoneyAmount(x.totalGmv||0)+'；Canceled '+(x.canceled||0)+' / '+formatMoneyAmount(x.canceledGmv||0)+'；非Canceled LIVE '+(x.nonCanceledLive||0)+' / '+formatMoneyAmount(x.nonCanceledLiveGmv||0)+'；非Canceled 橱窗订单 '+(x.nonCanceledNotLive||0)+' / '+formatMoneyAmount(x.nonCanceledNotLiveGmv||0)+'；状态：'+Object.keys(x.byStatus).sort().map(k=>k+': '+x.byStatus[k]).join('，')+'；有Note '+x.withNote+'；Note空 '+x.noNote+'；已打印 '+x.printed+'；有Note未打印 '+x.noteNoPrint+'；Note不一致 '+x.printedNoteDiff+'；异常 '+x.abnormal);
    });
    const summaryText=textLines.join('\\n');

    el.innerHTML=`
        <style>
            #tkReviewPageStats .rv-card{background:white;border:1px solid #d0d7de;border-radius:8px;padding:9px;min-width:0;}
            #tkReviewPageStats .rv-label{font-size:12px;color:#555;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #tkReviewPageStats .rv-value{font-size:24px;font-weight:900;margin-top:3px;}
            #tkReviewPageStats .rv-section{background:white;border:1px solid #d0d7de;border-radius:8px;padding:9px;margin-top:9px;}
            #tkReviewPageStats table{width:100%;border-collapse:collapse;font-size:12px;}
            #tkReviewPageStats th{background:#f6f8fa;text-align:left;border:1px solid #d8dee4;padding:6px;}
            #tkReviewPageStats td{border:1px solid #d8dee4;padding:6px;vertical-align:top;}
        </style>
        <div style="background:#111;color:white;border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px;">
            <div><div style="font-size:16px;font-weight:900;">复核汇总 v${SCRIPT_VERSION}</div><div style="font-size:12px;color:#ddd;margin-top:3px;">${esc(now())}</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;"><button id="tkOpenReviewProductAnalysis" style="border:0;background:#14b85a;color:white;border-radius:6px;padding:6px 10px;font-weight:bold;cursor:pointer;">商品维度分析</button><button id="tkCopyReviewSummaryV102" style="border:0;background:white;color:#111;border-radius:6px;padding:6px 10px;font-weight:bold;cursor:pointer;">复制汇总文本</button><button id="tkToggleRawReviewSummaryV102" style="border:0;background:white;color:#111;border-radius:6px;padding:6px 10px;font-weight:bold;cursor:pointer;">显示纯文本</button></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin-bottom:9px;">
            <div class="rv-card"><div class="rv-label">复核订单</div><div class="rv-value">${total||totalInRange}</div><div style="font-size:11px;color:#777;">范围内订单</div></div>
            <div class="rv-card"><div class="rv-label">总 GMV</div><div class="rv-value" style="font-size:20px;">${esc(formatMoneyAmount(totalGmv))}</div><div style="font-size:11px;color:#777;">扫描金额</div></div>
            <div class="rv-card"><div class="rv-label">非Canceled GMV</div><div class="rv-value" style="font-size:20px;">${esc(formatMoneyAmount(nonCanceledGmv))}</div><div style="font-size:11px;color:#777;">LIVE/橱窗订单合计</div></div>
            <div class="rv-card" style="background:${totalDiffs?'#fff0f0':'#fff'};border-color:${totalDiffs?'#ff4d4f':'#d0d7de'};"><div class="rv-label">差异/异常</div><div class="rv-value">${totalDiffs}</div><div style="font-size:11px;color:#777;">需要人工复核</div></div>
            <div class="rv-card"><div class="rv-label">有 Note</div><div class="rv-value">${withNote}</div><div style="font-size:11px;color:#777;">Seller Note不为空</div></div>
            <div class="rv-card" style="background:${noteButNoPrint?'#fff0f0':'#fff'};border-color:${noteButNoPrint?'#ff4d4f':'#d0d7de'};"><div class="rv-label">有 Note 未打印</div><div class="rv-value">${noteButNoPrint}</div><div style="font-size:11px;color:#777;">重点检查</div></div>
        </div>
        <div class="rv-section"><div style="font-weight:900;margin-bottom:7px;">物流状态统计</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">${statusCards}</div></div>
        <div class="rv-section"><div style="font-weight:900;margin-bottom:7px;">Note 与打印匹配</div><table><thead><tr><th>项目</th><th>数量</th><th>说明</th></tr></thead><tbody>
            <tr><td>有 Note</td><td>${withNote}</td><td>网页 Seller Note 不为空</td></tr>
            <tr><td>Note 为空</td><td>${noNote}</td><td>一般不触发自动打印</td></tr>
            <tr><td>有 Note 且已打印/匹配</td><td>${noteAndPrinted}</td><td>历史已有打印记录</td></tr>
            <tr><td>有 Note 但 0 次打印</td><td style="color:#d60000;font-weight:900;">${noteButNoPrint}</td><td>重点检查，可能漏打</td></tr>
            <tr><td>已打印但 Note 不一致</td><td style="color:#b36b00;font-weight:900;">${printedButNoteDiff}</td><td>需要判断是否补打</td></tr>
        </tbody></table></div>
        <div class="rv-section"><div style="font-weight:900;margin-bottom:7px;">差异 / 物流异常</div><table><thead><tr><th>异常类型</th><th>数量</th></tr></thead><tbody>${diffRows}</tbody></table></div>
        <div class="rv-section" style="overflow-x:auto;"><div style="font-weight:900;margin-bottom:7px;">按日期统计</div><table><thead><tr><th>日期</th><th>总单</th><th>总GMV</th><th>Canceled</th><th>Canceled GMV</th><th>非Canceled LIVE</th><th>LIVE GMV</th><th>非Canceled 橱窗订单</th><th>橱窗订单 GMV</th><th>状态</th><th>有Note</th><th>Note空</th><th>已打印</th><th>Note未打印</th><th>Note不一致</th><th>异常</th></tr></thead><tbody>${dateRows}</tbody></table></div>
        <textarea id="tkReviewSummaryTextV102" readonly style="display:none;width:100%;height:130px;margin-top:8px;box-sizing:border-box;border:1px solid #aaa;border-radius:6px;padding:8px;font-family:Consolas,monospace;font-size:12px;">${esc(summaryText)}</textarea>
    `;

    const copyBtn=document.getElementById("tkCopyReviewSummaryV102");
    if(copyBtn)copyBtn.onclick=function(){copyTextToClipboard(summaryText).then(()=>{copyBtn.innerText="已复制";setTimeout(()=>{copyBtn.innerText="复制汇总文本";},1000);});};
    const productBtn=document.getElementById("tkOpenReviewProductAnalysis");
    if(productBtn)productBtn.onclick=function(e){e.preventDefault();e.stopPropagation();openReviewProductAnalysis();};
    const toggleBtn=document.getElementById("tkToggleRawReviewSummaryV102");
    const raw=document.getElementById("tkReviewSummaryTextV102");
    if(toggleBtn&&raw)toggleBtn.onclick=function(){const show=raw.style.display==="none";raw.style.display=show?"block":"none";toggleBtn.innerText=show?"隐藏纯文本":"显示纯文本";};
}


function getReviewSelectedCutoffValueV102(){
    try{
        const el=document.getElementById("tkReviewCutoffDate");
        let dateStr=el&&el.value?String(el.value).trim():"";
        if(!dateStr){
            const d=new Date();
            d.setDate(d.getDate()-REVIEW_DAYS);
            dateStr=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
            if(el)el.value=dateStr;
        }
        const v=dayStartValue(dateStr);
        if(v)return v;
    }catch(e){
        console.warn("[TikTok复核] 获取截止日期失败，使用默认近3天",e);
    }
    return getReviewCutoffValue();
}

async function startReviewRecentOrdersCoreV104(){
    ensureReviewWindow();
    bringReviewWindowToFrontV110();

    if(!requireListeningPausedForAction("开始复核")){
        updateReviewStatus("监听正在开启。请先点击“暂停监听”，再开始复核。");
        return;
    }

    if(!getNextBind()){
        updateReviewStatus("请先绑定下一页按钮。v"+SCRIPT_VERSION+" 从当前页面开始扫描，按指定日期截止。");
        return;
    }

    if(reviewRunning){
        updateReviewStatus("复核扫描正在运行中，请等待完成。");
        return;
    }

    // v11.0：复核已在入口处强制暂停监听，复核结束也不自动恢复。

    reviewRunning=true;
    reviewAbortRequested=false;
    reviewDifferences=[];
    reviewScannedInfos=[];
    reviewPageStats=[];
    reviewLastResult=null;

    const cutoff=getReviewSelectedCutoffValueV102();
    const stopDate=dateOnlyFromValue(cutoff);
    const seenOrders=new Set();
    const scanId="scan_"+Date.now();

    updateReviewStatus(
        "开始复核：从当前页面【"+esc(getCurrentTabTitle())+
        "】开始扫描，直到订单时间早于 "+stopDate+
        "。v"+SCRIPT_VERSION+" 不要求 ALL 页面。"
    );

    for(let page=1;page<=REVIEW_MAX_PAGES;page++){
        if(reviewAbortRequested){
            updateReviewStatus("复核已停止。已扫描范围内订单 "+reviewScannedInfos.length+" 个。");
            break;
        }
        bringReviewWindowToFrontV110();
        updateReviewStatus("正在复核第 "+page+" 页，复核到 "+stopDate+"，包含当天...");

        const blocks=await collectCurrentListOrderBlocksByScroll();
        const infos=blocks.map(infoFromBlock).filter(x=>x.order);

        const pageSummary=summarizePageForReview(infos,cutoff);

        let pageRecentInfos=[];
        let pageOldInfos=[];
        let unknownDateInfos=[];

        infos.forEach(info=>{
            if(!info.orderDateValue){
                unknownDateInfos.push(info);
                return;
            }

            if(info.orderDateValue>=cutoff){
                pageRecentInfos.push(info);
            }else{
                pageOldInfos.push(info);
            }
        });

        pageRecentInfos.forEach(info=>{
            if(!seenOrders.has(info.order)){
                seenOrders.add(info.order);
                reviewScannedInfos.push(info);
            }
        });

        const cloudSaveResult=await saveReviewOrdersCloud(pageRecentInfos,scanId,page);
        if(cloudSaveResult&&cloudSaveResult.count){
            updateReviewStatus("第 "+page+" 页扫描完成，已同步复核订单到云端："+cloudSaveResult.count+" 单。正在生成差异...");
        }else if(cloudSaveResult&&cloudSaveResult.ok===false){
            updateReviewStatus("第 "+page+" 页扫描完成，但复核订单写入云端失败："+esc(cloudSaveResult.reason||"未知错误")+"。继续生成差异...");
        }

        const localReviewSave=saveReviewInfoToLocalHistory(pageRecentInfos,scanId,page);
        if(localReviewSave&&localReviewSave.count){
            updateReviewStatus(
                "第 "+page+" 页扫描完成，已写入本机最新复核状态/快递单号："+
                localReviewSave.count+
                " 单；其中变化 "+
                localReviewSave.changed+
                " 条。正在生成差异..."
            );
        }

        const printHistoryDiffs=makeReviewDiffsFromInfos(pageRecentInfos);
        const snapshotDiffs=saveReviewSnapshotsAndDiffs(pageRecentInfos,scanId);

        const combinedPageDiffs=printHistoryDiffs.concat(snapshotDiffs);

        const printed=pageRecentInfos.filter(x=>getTotalPrintCount(x.order)>0).length;
        const normalPrinted=pageRecentInfos.filter(x=>!x.isCanceled&&getTotalPrintCount(x.order)>0).length;
        const canceled=pageRecentInfos.filter(x=>x.isCanceled).length;
        const printedCanceled=pageRecentInfos.filter(x=>x.isCanceled&&getTotalPrintCount(x.order)>0).length;
        const missed=pageRecentInfos.filter(x=>canPrintInfo(x)&&getTotalPrintCount(x.order)===0).length;
        const noteChanged=printHistoryDiffs.filter(x=>x.type==="note").length;

        reviewPageStats.push({
            page,
            total:infos.length,
            recent:pageRecentInfos.length,
            inRange:pageRecentInfos.length,
            old:pageOldInfos.length,
            unknown:unknownDateInfos.length,
            printed,
            normalPrinted,
            canceled,
            printedCanceled,
            missed,
            noteChanged,
            withTracking:pageSummary.withTracking,
            withoutTracking:pageSummary.withoutTracking,
            byStatus:pageSummary.byStatus,
            diffCount:combinedPageDiffs.length
        });

        reviewDifferences=makeReviewDiffsFromInfos(reviewScannedInfos).concat(
            getJson(REVIEW_DIFF_HISTORY_KEY,[])
                .filter(h=>h.scanId===scanId)
                .flatMap(h=>h.diffs||[])
        );

        renderReviewRows();
        renderReviewPageStats();

        const draftResult=buildReviewResult(scanId,stopDate,"扫描中，第 "+page+" 页");
        const draftSave=saveReviewReplayHistory(draftResult);

        updateReviewStatus(
            "第 "+page+" 页扫描完成：本页订单 "+infos.length+
            " 个，范围内 "+pageRecentInfos.length+
            " 个，已打印 "+printed+
            " 个，正常已打印 "+normalPrinted+
            " 个，Canceled "+canceled+
            " 个，快递单号 "+pageSummary.withTracking+
            " 个，本页差异 "+combinedPageDiffs.length+
            " 条。累计范围内订单 "+reviewScannedInfos.length+
            " 个，累计差异 "+reviewDifferences.length+
            " 条。历史草稿："+(draftSave&&draftSave.ok?("已保存（"+draftSave.level+"）"):"保存失败，仅保留摘要")
        );

        if(infos.length===0){
            updateReviewStatus("复核结束：当前页没有订单。累计发现差异 "+reviewDifferences.length+" 条。");
            break;
        }

        if(pageRecentInfos.length===0&&infos.every(x=>x.orderDateValue&&x.orderDateValue<cutoff)){
            updateReviewStatus(
                "复核结束：第 "+page+
                " 页全部订单都早于 "+stopDate+
                "，说明范围内订单已经扫描完。累计范围内订单 "+
                reviewScannedInfos.length+
                " 个，累计差异 "+reviewDifferences.length+" 条。"
            );
            break;
        }

        updateReviewStatus("第 "+page+" 页处理完成，正在滚到底部并动态查找下一页按钮...");

        if(reviewAbortRequested){
            updateReviewStatus("复核已停止。已扫描范围内订单 "+reviewScannedInfos.length+" 个。");
            break;
        }

        const nextResult=await clickNextPageSmart();

        if(!nextResult.ok){
            updateReviewStatus(
                "复核暂停：第 "+page+
                " 页后无法继续翻页。原因："+nextResult.reason+
                "。当前已扫范围内订单 "+reviewScannedInfos.length+
                " 个，差异 "+reviewDifferences.length+" 条。"
            );
            break;
        }

        updateReviewStatus((nextResult.reason||"已进入下一页")+"，继续扫描...");
    }

    reviewDifferences=makeReviewDiffsFromInfos(reviewScannedInfos).concat(
        getJson(REVIEW_DIFF_HISTORY_KEY,[])
            .filter(h=>h.scanId===scanId)
            .flatMap(h=>h.diffs||[])
    );

    reviewLastResult=buildReviewResult(scanId,stopDate,"扫描完成");
    saveReviewScanHistory(reviewLastResult);
    const finalHistorySave=saveReviewReplayHistory(reviewLastResult);

    reviewRunning=false;

    renderReviewRows();
    renderReviewPageStats();

    const finalTotal=reviewScannedInfos.length;
    const finalPrinted=reviewScannedInfos.filter(x=>getTotalPrintCount(x.order)>0).length;
    const finalNormalPrinted=reviewScannedInfos.filter(x=>!x.isCanceled&&getTotalPrintCount(x.order)>0).length;
    const finalCanceled=reviewScannedInfos.filter(x=>x.isCanceled).length;
    const finalPrintedCanceled=reviewScannedInfos.filter(x=>x.isCanceled&&getTotalPrintCount(x.order)>0).length;
    const finalMissed=reviewScannedInfos.filter(x=>canPrintInfo(x)&&getTotalPrintCount(x.order)===0).length;
    const finalNoteChanged=reviewDifferences.filter(x=>x.type==="note").length;
    const finalSnapshotChanged=reviewDifferences.filter(x=>x.type==="snapshot").length;

    updateReviewStatus(
        "复核完成：范围内订单 "+finalTotal+
        " 个；已打印 "+finalPrinted+
        " 个；正常已打印 "+finalNormalPrinted+
        " 个；Canceled "+finalCanceled+
        " 个；已打印后Canceled "+finalPrintedCanceled+
        " 个；疑似漏打 "+finalMissed+
        " 个；NOTE变化 "+finalNoteChanged+
        " 个；状态/Note/单号快照变化 "+finalSnapshotChanged+
        " 个；差异合计 "+reviewDifferences.length+
        " 条。复核历史："+(finalHistorySave&&finalHistorySave.ok?("已保存（"+finalHistorySave.level+"，订单 "+finalHistorySave.orders+"，差异 "+finalHistorySave.diffs+"）"):"保存失败，已保留摘要")+
        "。监听已暂停，如需继续自动监听，请手动点击“启动监听”。"
    );
}
async function startReviewRecentOrders(){
    if(reviewRunning){
        updateReviewStatus("复核扫描正在运行中，请等待完成。若长时间无变化，请点“停止/重置”。");
        return;
    }
    reviewAbortRequested=false;
    try{
        await startReviewRecentOrdersCoreV104();
    }catch(e){
        reviewRunning=false;
        reviewAbortRequested=false;
        const msg=(e&&e.stack)?e.stack:(e&&e.message?e.message:String(e));
        console.error("[TikTok Printer v"+SCRIPT_VERSION+"] 复核异常",e);
        updateReviewStatus("复核出错，已自动解锁："+esc(msg.slice(0,800))+"。可以重新点击开始复核。");
    }finally{
        if(reviewAbortRequested){
            reviewAbortRequested=false;
            reviewRunning=false;
        }
    }
}

function getFilteredReviewDiffs(){
    const typeEl=document.getElementById("tkReviewTypeFilter");
    const searchEl=document.getElementById("tkReviewSearch");
    const type=typeEl?typeEl.value:"all";
    const q=searchEl?norm(searchEl.value).toLowerCase():"";

    return reviewDifferences.filter(d=>{
        if(type!=="all"&&d.type!==type)return false;
        if(q){
            const txt=[d.order,d.shortId,d.title,d.time,d.orderType,d.currentStatus,d.historyStatus,d.currentNote,d.historyNote,d.typeText,String(d.printCount),d.gmv,d.gmvText].join(" ").toLowerCase();
            if(!txt.includes(q))return false;
        }
        return true;
    });
}

function renderReviewRows(){
    const rows=document.getElementById("tkReviewRows");
    if(!rows)return;
    const arr=getFilteredReviewDiffs();

    if(!arr.length){
        rows.innerHTML='<div style="padding:30px;text-align:center;color:#666;">暂无复核差异。开始复核后会显示：已打印后Canceled、NOTE变化、疑似漏打、状态/Note/单号变化。</div>';
        updateReviewSelectedCount();
        return;
    }

    rows.innerHTML=arr.map(d=>{
        const color=d.type==="canceled"?"#ff3333":(d.type==="missed"?"#0a7a0a":"#ff9f1a");
        const bg=d.type==="canceled"?"#fff0f0":(d.type==="missed"?"#f0fff3":"#fff8e6");
        const changesHtml=(Array.isArray(d.changes)&&d.changes.length)
            ? '<div style="margin-top:7px;padding:6px 8px;background:#fff;border:1px dashed #c28b00;border-radius:6px;font-size:12px;line-height:1.45;">'+
                d.changes.map(c=>'<div><b>'+esc(c.fieldText||c.field||"变化")+'</b>：'+esc(c.oldValue||"空")+' → '+esc(c.newValue||"空")+'</div>').join("")+
              '</div>'
            : "";
        return `
            <label style="display:block;border:2px solid ${color};background:${bg};border-radius:9px;padding:10px 12px;margin:10px 0;cursor:pointer;">
                <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
                    <div>
                        <input class="tk-review-check" type="checkbox" value="${esc(d.order)}|${esc(d.type)}">
                        <b style="font-size:18px;">${esc(d.shortId)}</b>
                        <span style="margin-left:8px;font-weight:bold;color:${color};">${esc(d.typeText)}</span>
                        <span style="margin-left:8px;color:#555;">${esc(d.orderType||"无类型")}</span>
                        <span style="margin-left:8px;color:#111;font-weight:900;">GMV ${esc(formatMoneyAmount(d.gmv||(d.info&&d.info.gmv)||0))}</span>
                    </div>
                    <div style="font-size:12px;">历史打印次数：<b style="font-size:17px;color:${d.printCount?'red':'green'};">${esc(d.printCount)}</b> 次</div>
                </div>
                <div style="font-size:12px;margin-top:5px;word-break:break-all;">
                    完整订单号：${esc(d.order)}
                    <button class="tkReviewCopyBtn" data-order="${esc(d.order)}" style="margin-left:8px;padding:2px 8px;border:1px solid #888;border-radius:4px;background:#f5f5f5;cursor:pointer;font-size:12px;">复制</button>
                </div>
                <div style="display:grid;grid-template-columns:110px 1fr;gap:5px 10px;font-size:13px;margin-top:7px;line-height:1.4;">
                    <div style="font-weight:bold;color:#555;">订单时间</div><div>${esc(formatTimeNoYear(d.time))}</div>
                    <div style="font-weight:bold;color:#555;">Title</div><div>${esc(d.title)}</div>
                    <div style="font-weight:bold;color:#555;">当前状态</div><div><b style="color:${d.currentStatus==='Canceled'?'red':'green'};">${esc(d.currentStatus||"正常/未识别")}</b></div>
                    <div style="font-weight:bold;color:#555;">历史状态</div><div>${esc(d.historyStatus||"无历史状态")}</div>
                    <div style="font-weight:bold;color:#555;">当前Note</div><div><b style="font-size:16px;">${esc(d.currentNote||"空")}</b></div>
                    <div style="font-weight:bold;color:#555;">历史Note</div><div>${esc(d.historyNote||"空")}</div>
                    <div style="font-weight:bold;color:#555;">快递单号</div><div>${esc(d.trackingText||"无/未识别")}</div>
                </div>
                ${changesHtml}
            </label>
        `;
    }).join("");

    document.querySelectorAll(".tk-review-check").forEach(chk=>{chk.addEventListener("change",updateReviewSelectedCount);});
    document.querySelectorAll(".tkReviewCopyBtn").forEach(btn=>{
        btn.addEventListener("click",function(e){
            e.preventDefault();
            e.stopPropagation();
            const order=this.getAttribute("data-order")||"";
            copyTextToClipboard(order).then(()=>{this.innerText="已复制";setTimeout(()=>{this.innerText="复制";},1000);});
        });
    });

    const allBtn=document.getElementById("tkReviewSelectAll");
    if(allBtn)allBtn.checked=false;
    updateReviewSelectedCount();
}

function updateReviewSelectedCount(){
    const el=document.getElementById("tkReviewSelectedCount");
    if(!el)return;
    const count=document.querySelectorAll(".tk-review-check:checked").length;
    el.innerText="已选择 "+count+" 条";
    el.style.color=count?"green":"#111";
}

function getSelectedReviewDiffs(){
    const checked=[...document.querySelectorAll(".tk-review-check:checked")].map(x=>x.value);
    return checked.map(v=>{
        const parts=v.split("|");
        return reviewDifferences.find(d=>d.order===parts[0]&&d.type===parts[1]);
    }).filter(Boolean);
}

function reviewBatchUpdateStatus(){
    const selected=getSelectedReviewDiffs();
    if(!selected.length){alert("请先勾选复核结果。");return;}

    selected.forEach(d=>{
        updateHistoryOrder(d.order,{
            title:d.title,
            time:d.time,
            note:d.historyNote||d.currentNote,
            systemNote:d.currentNote,
            orderType:d.orderType,
            orderStatus:d.currentStatus
        },"复核批量更新订单状态");
    });

    updateReviewStatus("已更新选中订单状态："+selected.length+" 条。");
    reviewDifferences=reviewDifferences.filter(d=>!selected.includes(d));
    renderReviewRows();
}

function reviewBatchUpdateNote(){
    const selected=getSelectedReviewDiffs().filter(d=>d.type==="note");
    if(!selected.length){alert("请先勾选 NOTE变化 类型。Canceled订单不会更新Note。");return;}

    selected.forEach(d=>{
        updateHistoryOrder(d.order,{
            title:d.title,
            time:d.time,
            note:d.currentNote,
            systemNote:d.currentNote,
            orderType:d.orderType,
            orderStatus:d.currentStatus
        },"复核批量更新历史Note");
        saveNote(d.order,d.currentNote);
    });

    updateReviewStatus("已更新选中历史Note："+selected.length+" 条。Canceled订单不会被更新Note。");
    reviewDifferences=reviewDifferences.filter(d=>!selected.includes(d));
    renderReviewRows();
}

function reviewBatchPrint(){
    if(!requireListeningPausedForAction("复核后批量打印"))return;

    const selected=getSelectedReviewDiffs().filter(d=>d.info&&!d.info.isCanceled);
    if(!selected.length){alert("请先勾选可打印的非Canceled复核结果。");return;}

    const infos=selected.map(d=>d.info).filter(Boolean);
    printLabelsBatch(infos,"复核后按当前页面Note打印",{force:true});
    reviewDifferences=reviewDifferences.filter(d=>!selected.includes(d));
    renderReviewRows();
}

function reviewBatchIgnore(){
    const selected=getSelectedReviewDiffs();
    if(!selected.length){alert("请先勾选复核结果。");return;}

    const ignoreSet=getReviewIgnoreSet();
    selected.forEach(d=>{ignoreSet.add(makeDiffKey(d));});
    saveReviewIgnoreSet(ignoreSet);

    reviewDifferences=reviewDifferences.filter(d=>!selected.includes(d));
    updateReviewStatus("已忽略选中复核结果："+selected.length+" 条。");
    renderReviewRows();
}function getCancelNoteAlertMap(){
    return getJson(CANCEL_NOTE_ALERT_KEY,{});
}

function saveCancelNoteAlertMap(map){
    setJson(CANCEL_NOTE_ALERT_KEY,map);
}

function getCancelNoteAlertIgnoreSet(){
    return new Set(getJson(CANCEL_NOTE_ALERT_IGNORE_KEY,[]));
}

function saveCancelNoteAlertIgnoreSet(s){
    setJson(CANCEL_NOTE_ALERT_IGNORE_KEY,[...s].slice(-5000));
}

function isCancelAlertIgnoredKey(key){
    return getCancelNoteAlertIgnoreSet().has(key);
}

function ignoreCurrentCancelNoteAlerts(){
    const map=getCancelNoteAlertMap();
    const ignore=getCancelNoteAlertIgnoreSet();
    Object.keys(map).forEach(k=>ignore.add(k));
    saveCancelNoteAlertIgnoreSet(ignore);
    localStorage.removeItem(CANCEL_NOTE_ALERT_KEY);
    showCancelNoteAlertBox();
    updateStatus("已清空并忽略这些 Canceled+Note 报警。相同订单/状态/Note 不会再次弹出。");
}

function makeCancelAlertKey(info){
    return [
        info.order||"",
        info.orderStatus||"",
        effectiveNote(info)||"",
        info.time||""
    ].join("|");
}

function raiseCanceledNoteAlert(info,reason){
    if(!info||!info.order)return;

    const note=effectiveNote(info);

    if(isBadNoteValue(note))return;

    const alertMap=getCancelNoteAlertMap();
    const key=makeCancelAlertKey(info);

    if(isCancelAlertIgnoredKey(key))return;
    if(alertMap[key])return;

    alertMap[key]={
        order:info.order,
        shortId:info.shortId,
        title:info.title||"",
        time:info.time||"",
        note:note||"",
        orderType:info.orderType||"",
        orderStatus:info.orderStatus||"",
        reason:reason||"Canceled订单存在Note，已阻止自动打印",
        createdAt:now()
    };

    saveCancelNoteAlertMap(alertMap);

    const msg=
        "报警：订单 "+info.shortId+
        " 当前状态为 Canceled，但存在 Note【"+note+
        "】，已阻止自动打印。请人工复核。";

    updateStatus(msg);
    showCancelNoteAlertBox();

    try{
        console.warn("[TikTok打印报警]",msg,info);
    }catch(e){}
}

function getRecentCancelAlerts(limit){
    limit=limit||20;

    const map=getCancelNoteAlertMap();
    let changed=false;

    Object.keys(map).forEach(k=>{
        if(!map[k]||isBadNoteValue(map[k].note||"")){
            delete map[k];
            changed=true;
        }
    });

    if(changed)saveCancelNoteAlertMap(map);

    return Object.keys(map)
        .map(k=>map[k])
        .sort((a,b)=>parseAnyDateValue(b.createdAt)-parseAnyDateValue(a.createdAt))
        .slice(0,limit);
}

function clearCancelNoteAlerts(){
    ignoreCurrentCancelNoteAlerts();
}

function showCancelNoteAlertBox(){
    let box=document.getElementById("tkCancelNoteAlertBox");
    const panelBody=document.getElementById("panelBody");

    if(!panelBody)return;

    if(!box){
        box=document.createElement("div");
        box.id="tkCancelNoteAlertBox";
        box.style.cssText=`
            margin-top:6px;
            padding:8px;
            border:2px solid #ff3b30;
            background:#fff1f1;
            color:#111;
            border-radius:6px;
            font-size:12px;
            line-height:1.45;
            max-height:220px;
            overflow:auto;
        `;
        panelBody.appendChild(box);
    }

    const alerts=getRecentCancelAlerts(20);

    if(!alerts.length){
        box.style.display="none";
        box.innerHTML="";
        return;
    }

    box.style.display="block";

    box.innerHTML=`
        <div style="font-weight:900;color:#d60000;margin-bottom:5px;">
            Canceled订单报警：${alerts.length} 条（清空会同时忽略相同报警）
        </div>

        ${alerts.map(a=>`
            <div style="border-top:1px dashed #ff9999;padding-top:5px;margin-top:5px;">
                <div><b>${esc(a.shortId)}</b>：${esc(a.reason||"")}</div>
                <div>状态：<b style="color:red;">${esc(a.orderStatus||"Canceled")}</b></div>
                <div>Note：<b>${esc(a.note||"空")}</b></div>
                <div>类型：${esc(a.orderType||"")}</div>
                <div>时间：${esc(a.time||"")}</div>
                <div style="word-break:break-all;">订单号：${esc(a.order||"")}</div>
                <button class="tkCopyCancelAlertOrder" data-order="${esc(a.order||"")}" style="margin-top:3px;padding:2px 8px;border:1px solid #888;border-radius:4px;background:white;cursor:pointer;">复制订单号</button>
            </div>
        `).join("")}

        <button id="tkClearCancelAlertBtn" style="margin-top:8px;width:100%;padding:5px;border:1px solid #d60000;border-radius:5px;background:#fff;color:#d60000;font-weight:bold;cursor:pointer;">
            清空并忽略这些报警
        </button>
    `;

    box.querySelectorAll(".tkCopyCancelAlertOrder").forEach(btn=>{
        btn.onclick=function(e){
            e.preventDefault();
            e.stopPropagation();

            const order=this.getAttribute("data-order")||"";

            copyTextToClipboard(order).then(()=>{
                this.innerText="已复制";
                setTimeout(()=>{
                    this.innerText="复制订单号";
                },1000);
            });
        };
    });

    const clearBtn=document.getElementById("tkClearCancelAlertBtn");

    if(clearBtn){
        clearBtn.onclick=function(e){
            e.preventDefault();
            e.stopPropagation();
            clearCancelNoteAlerts();
        };
    }
}

function updateStatus(t){
    const el=document.getElementById("statusText");
    if(el)el.innerText=t;
}

function isFloatingWindowInteractiveTarget(target,header){
    let el=target;
    while(el&&el!==header){
        const tag=(el.tagName||"").toUpperCase();
        if(["BUTTON","SELECT","OPTION","INPUT","TEXTAREA","A","LABEL"].includes(tag))return true;
        if(el.getAttribute){
            const role=String(el.getAttribute("role")||"").toLowerCase();
            if(role==="button"||role==="menuitem"||role==="option"||role==="combobox")return true;
            if(String(el.getAttribute("contenteditable")||"").toLowerCase()==="true")return true;
        }
        el=el.parentElement;
    }
    return false;
}

function makeFloatingWindowDraggable(win,headerSelector){
    const header=win.querySelector(headerSelector||"#panelHeader");
    if(!header)return;
    const isWorkWindow=activeWorkWindowIds().includes(win.id);

    if(isWorkWindow&&!win.getAttribute("data-tk-layer-bound")){
        win.setAttribute("data-tk-layer-bound","1");
        win.addEventListener("mousedown",function(){
            focusFloatingWorkWindow(win);
        },true);
    }

    let dragging=false;
    let startX=0;
    let startY=0;
    let startLeft=0;
    let startTop=0;

    header.addEventListener("mousedown",function(e){
        if(isFloatingWindowInteractiveTarget(e.target,header))return;
        if(win.getAttribute("data-tk-maximized")==="1")return;

        if(isWorkWindow)focusFloatingWorkWindow(win);

        dragging=true;
        startX=e.clientX;
        startY=e.clientY;

        const rect=win.getBoundingClientRect();

        startLeft=rect.left;
        startTop=rect.top;

        win.style.setProperty("left",startLeft+"px","important");
        win.style.setProperty("top",startTop+"px","important");
        win.style.setProperty("right","auto","important");
        win.style.setProperty("bottom","auto","important");
        win.style.setProperty("transform","none","important");

        e.preventDefault();
    });

    document.addEventListener("mousemove",function(e){
        if(!dragging)return;

        const dx=e.clientX-startX;
        const dy=e.clientY-startY;
        const vp=getViewportBox();
        const rect=win.getBoundingClientRect();
        const maxLeft=Math.max(vp.left+8,vp.right-Math.max(120,rect.width)-8);
        const maxTop=Math.max(vp.top+8,vp.bottom-Math.max(60,rect.height)-8);
        const nextLeft=Math.min(Math.max(vp.left+8,startLeft+dx),maxLeft);
        const nextTop=Math.min(Math.max(vp.top+8,startTop+dy),maxTop);

        win.style.setProperty("left",nextLeft+"px","important");
        win.style.setProperty("top",nextTop+"px","important");
        win.style.setProperty("right","auto","important");
        win.style.setProperty("bottom","auto","important");
    });

    document.addEventListener("mouseup",function(){
        if(dragging&&win.id==="tiktok-auto-print-panel-windows"){
            clampMainPanelPosition(win);
            saveMainPanelPosition(win);
        }
        dragging=false;
    });
}

/*
 * v8.8 右下角主控制面板
 * 注意：第3段里已经定义过 addPanel()。
 * 这里不重复定义，避免覆盖。
 * 下面只做兜底启动和强制修复显示。
 */

function forceShowMainPanel(){
    const p=cleanupDuplicateMainPanels()||document.getElementById("tiktok-auto-print-panel-windows");
    if(!p)return;
    try{
        if(document.body&&p.parentNode===document.body)document.body.appendChild(p);
    }catch(e){}
    p.style.display="block";
    p.style.position="fixed";
    p.style.setProperty("z-index","2147483647","important");
    p.style.opacity="1";
    p.style.visibility="visible";
    updateMainPanelLayerForWorkWindows();
    if(!applySavedMainPanelPosition(p)&&isFloatingWindowOffscreen(p,180,80))resetMainPanelPosition(p);
    clampMainPanelPosition(p);
}

function ensureMainPanelAlive(){
    try{
        if(!document.body)return;
        ensureMainPanelPositionStyle();
        cleanupLegacyMainPanels();

        const p=document.getElementById("tiktok-auto-print-panel-windows");

        if(!p||isOldMainPanelVersion(p)){
            addPanel();
        }else{
            forceShowMainPanel();
            normalizeMainPanelUiText();
            startMainPanelTextGuard();
        }
    }catch(e){
        console.error("[TikTok v8.8] ensureMainPanelAlive error:",e);
        showBootError("主面板检查失败",e);
    }
}

function bootV88(){
    if(tkBootInitialized){
        ensureMainPanelAlive();
        return;
    }
    tkBootInitialized=true;

    try{
        migrateOldStorageToMaster();
    }catch(e){
        console.warn("[TikTok v8.8] migrate error:",e);
    }

    try{
        addPanel();
        forceShowMainPanel();
        normalizeMainPanelUiText();
        startUiI18nObserver();
        localizePluginWindowsSoon();
        startMainPanelTextGuard();
        startUtilityScriptWarmup();
    }catch(e){
        console.error("[TikTok v8.8] addPanel error:",e);
        showBootError("主面板创建失败",e);
    }

    try{
        setupViewChangeProtect();
    }catch(e){
        console.warn("[TikTok v8.8] setupViewChangeProtect error:",e);
    }

    try{
        setupBackgroundContinuity();
    }catch(e){
        console.warn("[TikTok v"+SCRIPT_VERSION+"] setupBackgroundContinuity error:",e);
    }

    try{
        showCancelNoteAlertBox();
    }catch(e){}

    try{
        startCloudSyncWarmup();
        scheduleCloudPendingFlush(4000);
    }catch(e){
        console.warn("[TikTok v"+SCRIPT_VERSION+"] cloud warmup error:",e);
    }

}

/*
 * 多次兜底启动：
 * TikTok 页面是 SPA，有时 document-idle 时 body 或订单页还没完全出来。
 * 这里做 1秒、3秒、6秒、10秒多次检查，保证右下角面板能出现。
 */

setTimeout(bootV88,1000);
setTimeout(ensureMainPanelAlive,3000);
setTimeout(ensureMainPanelAlive,6000);
setTimeout(ensureMainPanelAlive,10000);

setInterval(function(){
    ensureMainPanelAlive();
    if(getCloudPendingPrintCount())scheduleCloudPendingFlush(2000);
},3000);

/*
 * Tampermonkey 某些页面 document.body 还没出现时，监听 DOMContentLoaded 再补一次。
 */
if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",function(){
        setTimeout(bootV88,800);
    });
}else{
    setTimeout(bootV88,800);
}

})();




