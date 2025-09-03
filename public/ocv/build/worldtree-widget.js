(function(){
  // Minimal WorldTree Widget
  // Usage:
  // <script src="/js/worldtree-widget.js" data-server="wss://your-worldtree.example.com"></script>
  // or set window.WORLD_TREE_SERVER before loading this script.

  const serverUrl = (function(){
    // Resolution order:
    // 1) <script data-server="...">
    // 2) window.WORLD_TREE_SERVER
    // 3) <script src="...js?server=wss://...">
    // 4) Same-origin ws(s)://<location.host>
    // 5) Default production: wss://worldtree.online
    try {
      const s = document.currentScript;
      // 1) attribute
      const attr = s && s.getAttribute && s.getAttribute('data-server');
      if (attr) return attr;
      // 2) global
      if (typeof window !== 'undefined' && window.WORLD_TREE_SERVER) return String(window.WORLD_TREE_SERVER);
      // 3) script src query ?server=
      try {
        const src = s && s.src ? new URL(s.src, location.href) : null;
        const qp = src ? src.searchParams.get('server') : null;
        if (qp) return qp;
      } catch(_){}
      // 4) same-origin
      try {
        const secure = location.protocol === 'https:';
        const proto = secure ? 'wss://' : 'ws://';
        if (location.host) return proto + location.host;
      } catch(_){}
    } catch (_) {}
    // 5) default
    return 'wss://worldtree.online';
  })();

  // Optional overrides via script attrs or globals
  const currentScript = (function(){ try { return document.currentScript; } catch(e){ return null; } })();
  const initialKeyOverride = (function(){
    try {
      if (currentScript && currentScript.hasAttribute('data-crdt-key')) return currentScript.getAttribute('data-crdt-key');
      if (typeof window.WORLD_TREE_CRDT_KEY !== 'undefined') return String(window.WORLD_TREE_CRDT_KEY);
    } catch(e){}
    return null;
  })();
  const initialDocIdOverride = (function(){
    try {
      if (currentScript && currentScript.hasAttribute('data-doc-id')) return currentScript.getAttribute('data-doc-id');
      if (typeof window.WORLD_TREE_DOC_ID !== 'undefined') return String(window.WORLD_TREE_DOC_ID);
    } catch(e){}
    return null;
  })();
  const allowServerSwitch = (function(){
    try {
      if (currentScript && currentScript.hasAttribute('data-allow-server-switch')) {
        const v = currentScript.getAttribute('data-allow-server-switch');
        return v === '' || v === 'true' || v === '1';
      }
    } catch(e){}
    return false;
  })();

  // Derive REST base from WS URL
  const restBase = (function(){
    try {
      if (serverUrl.startsWith('wss://')) return 'https://' + serverUrl.slice(6);
      if (serverUrl.startsWith('ws://'))  return 'http://' + serverUrl.slice(5);
    } catch(e) {}
    return serverUrl.replace(/^ws/, 'http');
  })();

  // Startup options from script attributes or globals
  const initialOptions = (function(){
    let follow = false, minimized = false;
    try {
      const s = document.currentScript;
      if (s) {
        const f = s.getAttribute('data-follow');
        if (f !== null) follow = !(f === 'false' || f === '0');
        const m = s.getAttribute('data-minimized');
        if (m !== null) minimized = !(m === 'false' || m === '0');
      }
    } catch(e) {}
    if (typeof window.WORLD_TREE_FOLLOW !== 'undefined') follow = !!window.WORLD_TREE_FOLLOW;
    if (typeof window.WORLD_TREE_MINIMIZED !== 'undefined') minimized = !!window.WORLD_TREE_MINIMIZED;
    return { follow, minimized };
  })();

  // Create widget container
  const widget = document.createElement('div');
  widget.setAttribute('data-worldtree-widget', '');
  widget.style.cssText = [
    'position:fixed',
    'top:16px',
    'right:16px',
    'width:260px',
    'max-width:80vw',
    // Subtle translucent background so blur is visible while staying site-adaptive
    'background:rgba(255,255,255,0.06)',
    'color:inherit',
    'border:none',
    'border-radius:10px',
    'box-shadow:none',
    'backdrop-filter:blur(10px) saturate(120%)',
    '-webkit-backdrop-filter:blur(10px) saturate(120%)',
    'font:inherit',
    'z-index:2147483647',
    'user-select:none'
  ].join(';');

  // Header (drag handle)
  const header = document.createElement('div');
  header.style.cssText = [
    'padding:8px 10px',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'cursor:move',
    'background:transparent'
  ].join(';');

  const dot = document.createElement('span');
  dot.style.cssText = [
    'display:inline-block',
    'width:8px',
    'height:8px',
    'border-radius:50%'
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'WorldTree';
  title.style.cssText = 'font-weight:600; font-size:12px; color:inherit; flex:1;';


  const body = document.createElement('div');
  body.style.cssText = 'padding:10px 12px;';

  const row = (label, valueColor) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; justify-content:space-between; gap:8px; margin:6px 0;';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = 'opacity:0.8';
    const v = document.createElement('span');
    v.textContent = '—';
    v.style.cssText = `color:${valueColor}`;
    wrap.appendChild(l); wrap.appendChild(v);
    return {wrap, v};
  };

  const statusRow = row('Status', '#5cf4a9');
  const usersRow = row('Users', '#ffd86b');
  const energyRow = row('Energy', '#7ac8ff');
  const hbRow = row('Heartbeat', '#e0e6eb');
  const crdtRow = row('CRDT', '#9ad1ff');

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:8px 12px; display:flex; justify-content:space-between; align-items:center;';
  const link = document.createElement('a');
  link.href = 'https://';
  link.textContent = 'widget';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = 'color:inherit; text-decoration:underline; opacity:0.6;';
  const serverSpan = document.createElement('span');
  serverSpan.style.cssText = 'opacity:0.7; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;';
  serverSpan.title = serverUrl;
  serverSpan.textContent = serverUrl.replace(/^wss?:\/\//,'');
  const gearBtn = document.createElement('button');
  gearBtn.textContent = '⚙';
  gearBtn.title = 'Change sync server';
  gearBtn.style.cssText = 'margin-left:8px; opacity:0.8; background:transparent; border:1px solid rgba(255,255,255,0.2); color:inherit; border-radius:6px; padding:2px 6px; cursor:pointer; display:none;';
  if (allowServerSwitch) gearBtn.style.display = '';

  // Header contents: status dot and title (minimize button removed)
  header.appendChild(dot);
  header.appendChild(title);
  body.appendChild(statusRow.wrap);
  body.appendChild(usersRow.wrap);
  body.appendChild(energyRow.wrap);
  body.appendChild(hbRow.wrap);
  body.appendChild(crdtRow.wrap);
  footer.appendChild(serverSpan);
  footer.appendChild(link);
  footer.appendChild(gearBtn);
  widget.appendChild(header);
  widget.appendChild(body);
  widget.appendChild(footer);
  document.body.appendChild(widget);

  // Minimized ORB
  const orb = document.createElement('div');
  orb.setAttribute('data-worldtree-orb', '');
  orb.style.cssText = [
    'position:fixed',
    'top:20px',
    'right:20px',
    'width:18px',
    'height:18px',
    'border-radius:50%'
    ,"background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(225,225,225,0.85) 40%, rgba(170,170,170,0.55) 70%, rgba(140,140,140,0.25) 100%)"
    ,"border:1px solid rgba(255,255,255,0.25)"
    ,"box-shadow:inset 0 1px 2px rgba(255,255,255,0.6), 0 2px 10px rgba(0,0,0,0.25), 0 0 0 rgba(93, 244, 169, 0.0)"
    ,'backdrop-filter:blur(8px) saturate(120%)'
    ,'-webkit-backdrop-filter:blur(8px) saturate(120%)'
    ,'z-index:2147483646'
    ,'cursor:pointer'
    ,'display:none'
  ].join(';');
  document.body.appendChild(orb);

  // State
  let minimized = false;
  let hushHeartbeat = false;
  let showUsersActivity = true;
  let lastHeartbeatTime = null;
  let followMode = false;
  let followRAF = null;
  let mouseX = 0, mouseY = 0;
  let anyDragging = false;
  let followPaused = false; // pause on orb hover
  let followBeforeOpen = false; // remember if follow was on before opening widget
  let menuOpen = false; // track custom menu visibility
  const crdtStats = { lastIn: 0, lastOut: 0 };

  function maskKey(k){ if(!k) return '—'; if(k.length<=4) return '*'.repeat(k.length); return k.slice(0,2)+'…'+k.slice(-2); }
  function setCrdtStatus(text){ crdtRow.v.textContent = text; }
  function refreshCrdtRow(){
    const state = crdt.connected ? 'connected' : (crdt.connecting ? 'connecting' : 'idle');
    const doc = crdt.docId || '—';
    const key = maskKey(crdt.key);
    const io = `${crdtStats.lastIn}/${crdtStats.lastOut}`;
    setCrdtStatus(`${state} · doc ${doc} · key ${key} · io ${io}`);
  }

  // ===== Comments CRDT via Automerge Repo (browser) =====
  let RepoMod = null, WSAdapterMod = null, BCAdapterMod = null;
  const COMMENTS_NS = 'comments';
  const STORAGE_SERVER_OVERRIDE = 'wt.sync.server';
  let currentSyncServer = null;
  let commentsHandle = null; // Repo document handle
  let currentComments = { comments: [] };

  function getPreferredServer(){
    try {
      const ls = localStorage.getItem(STORAGE_SERVER_OVERRIDE);
      return ls || serverUrl;
    } catch(_) { return serverUrl; }
  }

  async function loadRepoModules(){
    if (RepoMod && WSAdapterMod) return { Repo: RepoMod, WebSocketClientAdapter: WSAdapterMod };
    // If the Vite bridge populated globals, use them and skip network imports.
    if (typeof window !== 'undefined' && window.AutomergeRepo && window.AutomergeRepo.Repo && window.AutomergeRepo.WebSocketClientAdapter){
      RepoMod = window.AutomergeRepo.Repo;
      WSAdapterMod = window.AutomergeRepo.WebSocketClientAdapter;
      BCAdapterMod = window.AutomergeRepo.BroadcastChannelNetworkAdapter || null;
      return { Repo: RepoMod, WebSocketClientAdapter: WSAdapterMod };
    }
    // Try unpkg (?module rewrites bare specifiers), then jsDelivr +esm, then esm.sh bundling.
    const tries = [
      ['https://unpkg.com/@automerge/automerge-repo@1.2.1?module', 'https://unpkg.com/@automerge/automerge-repo-network-websocket@1.2.1?module'],
      ['https://unpkg.com/@automerge/automerge-repo@1?module', 'https://unpkg.com/@automerge/automerge-repo-network-websocket@1?module'],
      ['https://cdn.jsdelivr.net/npm/@automerge/automerge-repo@1.2.1/+esm', 'https://cdn.jsdelivr.net/npm/@automerge/automerge-repo-network-websocket@1.2.1/+esm'],
      ['https://cdn.jsdelivr.net/npm/@automerge/automerge-repo@1/+esm', 'https://cdn.jsdelivr.net/npm/@automerge/automerge-repo-network-websocket@1/+esm'],
      ['https://esm.sh/@automerge/automerge-repo@1.2.1?bundle&target=es2020', 'https://esm.sh/@automerge/automerge-repo-network-websocket@1.2.1?bundle&target=es2020'],
      ['https://esm.sh/@automerge/automerge-repo@1?bundle&target=es2020', 'https://esm.sh/@automerge/automerge-repo-network-websocket@1?bundle&target=es2020']
    ];
    let lastErr;
    for (const [repoUrl, wsUrl] of tries){
      try {
        const [r, w] = await Promise.all([import(repoUrl), import(wsUrl)]);
        RepoMod = r.Repo || r.default || r;
        WSAdapterMod = w.WebSocketClientAdapter || w.default || w;
        return { Repo: RepoMod, WebSocketClientAdapter: WSAdapterMod };
      } catch(e){ lastErr = e; }
    }
    console.error('Failed to load Automerge Repo modules', lastErr);
    throw lastErr || new Error('Automerge Repo import failed');
  }

  function createRepo(server){
    const { Repo } = { Repo: RepoMod };
    const { WebSocketClientAdapter } = { WebSocketClientAdapter: WSAdapterMod };
    const net = [];
    if (BCAdapterMod) try { net.push(new BCAdapterMod()); } catch(_){ }
    try { net.push(new WebSocketClientAdapter(server)); } catch(_){ }
    return new Repo({
      network: net,
      // storage: new IndexedDBStorageAdapter('wt-comments') // optional
    });
  }

  function updateCrdtStatus(state){
    // state: 'connected' | 'connecting' | 'idle'
    const io = `${crdtStats.lastIn}/${crdtStats.lastOut}`;
    setCrdtStatus(`${state} · doc ${commentsHandle? commentsHandle.documentId || initialDocIdOverride || '—' : (initialDocIdOverride||'—')} · key — · io ${io}`);
  }

  function ensureDocShape(d){
    if (!d.comments) d.comments = [];
    return d;
  }

  function installCommentsBridge({ repo, docUrl }){
    try {
      commentsHandle = repo.find(docUrl);
    } catch (e) {
      console.error('Invalid Automerge document identifier', docUrl, e);
      setCrdtStatus('idle');
      return;
    }
    let current = commentsHandle.docSync() || { comments: [] };
    currentComments = current;

    const prior = window.AppComments || {};

    function emitRemoteSet(){
      try { prior.onRemoteSet && prior.onRemoteSet(current.comments || []); } catch(_){ }
    }

    function rebindChangeListener(){
      commentsHandle.on('change', () => {
        current = commentsHandle.docSync() || current;
        currentComments = current;
        try {
          const list = (current && current.comments) ? current.comments : [];
          // Update simple IO metric based on serialized size
          const payloadLen = JSON.stringify(list).length;
          crdtStats.lastIn = payloadLen; // crude but indicative
        } catch(_){}
        emitRemoteSet();
        updateCrdtStatus('connected');
      });
    }
    rebindChangeListener();

    const api = {
      ...prior,
      set(list){
        commentsHandle.change(d => {
          ensureDocShape(d);
          d.comments = Array.isArray(list) ? list : [];
        });
        try { prior.onLocalSet && prior.onLocalSet(list); } catch(_){ }
      },
      add(c){
        commentsHandle.change(d => {
          ensureDocShape(d);
          const rec = { id: crypto.randomUUID(), text: '', ...c };
          d.comments.push(rec);
        });
        try { prior.onLocalAdd && prior.onLocalAdd(c); } catch(_){ }
      },
      edit(id, patch){
        commentsHandle.change(d => {
          ensureDocShape(d);
          const i = d.comments.findIndex(x => x.id === id);
          if (i >= 0) Object.assign(d.comments[i], patch);
        });
        try { prior.onLocalEdit && prior.onLocalEdit(id, patch); } catch(_){ }
      },
      remove(id){
        commentsHandle.change(d => {
          ensureDocShape(d);
          const i = d.comments.findIndex(x => x.id === id);
          if (i >= 0) d.comments.splice(i, 1);
        });
        try { prior.onLocalRemove && prior.onLocalRemove(id); } catch(_){ }
      },
      configure(opts = {}){
        const nextServer = opts.server;
        // Accept either docUrl or legacy docId
        const nextDocUrl = (function(){
          const candidate = opts.docUrl || (opts.docId ? String(opts.docId) : null) || docUrl;
          return String(candidate).startsWith('automerge:') ? String(candidate) : ('automerge:' + String(candidate));
        })();
        if (nextServer) {
          try { localStorage.setItem(STORAGE_SERVER_OVERRIDE, nextServer); } catch(_){ }
        }
        // Close and recreate repo with new server if provided
        try { repo.close && repo.close(); } catch(_){ }
        currentSyncServer = getPreferredServer();
        const newRepo = createRepo(currentSyncServer);
        // Reinstall bridge on new repo/doc
        installCommentsBridge({ repo: newRepo, docUrl: nextDocUrl });
        // Update footer UI
        serverSpan.title = currentSyncServer;
        serverSpan.textContent = currentSyncServer.replace(/^wss?:\/\//,'');
        updateCrdtStatus('connecting');
      }
    };

    window.AppComments = api;
    // Emit initial state to app
    emitRemoteSet();
  }

  function applyVisibility(){
    usersRow.wrap.style.display = showUsersActivity ? '' : 'none';
  }
  applyVisibility();

  function alignOrbToWidget(){
    // Orb remains where user left it; no-op to keep previous API
  }

  function alignWidgetToOrb(){
    // Position widget to the left of the orb so orb remains visible
    const padding = 12;
    // Ensure widget is visible to measure
    const prevDisplay = widget.style.display;
    if (prevDisplay === 'none') widget.style.display = 'block';
    const wr = widget.getBoundingClientRect();
    const or = orb.getBoundingClientRect();
    let left = or.left - wr.width - padding;
    let top = or.top - 10; // slight upward offset
    const vw = window.innerWidth, vh = window.innerHeight;
    // Clamp into viewport
    left = Math.max(8, Math.min(left, vw - wr.width - 8));
    top = Math.max(8, Math.min(top, vh - wr.height - 8));
    widget.style.left = left + 'px';
    widget.style.top  = top + 'px';
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
    widget.style.position = 'fixed';
    if (prevDisplay === 'none') widget.style.display = 'none';
  }

  function showWidget(expand){
    minimized = !expand;
    if (expand){
      // Pause following while widget is open, but remember intent
      followBeforeOpen = !!followMode;
      if (followRAF) { stopFollow(); }
      alignWidgetToOrb();
      widget.style.display = 'block';
      // Keep orb visible underneath
    } else {
      widget.style.display = 'none';
      // Resume follow if it was active before opening
      if (followBeforeOpen && !followRAF){ startFollow(); }
      followBeforeOpen = false;
    }
  }

  // Apply initial minimized state: default to minimized unless explicitly false
  if (initialOptions.minimized === false) {
    minimized = false;
    // Keep orb visible under the widget
    orb.style.display = 'block';
    widget.style.display = 'block';
    alignWidgetToOrb();
  } else {
    // Minimized by default
    minimized = true;
    widget.style.display = 'none';
    orb.style.display = 'block';
  }

  // Dragging
  (function enableDrag(){
    let startX=0, startY=0, startLeft=0, startTop=0, dragging=false;
    const onDown = (e)=>{
      dragging = true; anyDragging = true;
      const rect = widget.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      startX = (e.touches? e.touches[0].clientX : e.clientX);
      startY = (e.touches? e.touches[0].clientY : e.clientY);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, {passive:false});
      document.addEventListener('touchend', onUp);
    };
    const onMove = (e)=>{
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      const x = (e.touches? e.touches[0].clientX : e.clientX);
      const y = (e.touches? e.touches[0].clientY : e.clientY);
      const dx = x - startX; const dy = y - startY;
      widget.style.left = (startLeft + dx) + 'px';
      widget.style.top = (startTop + dy) + 'px';
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
      widget.style.position = 'fixed';
    };
    const onUp = ()=>{
      dragging = false; anyDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    header.addEventListener('mousedown', onDown);
    header.addEventListener('touchstart', onDown, {passive:true});
  })();

  // Minimize button removed; toggling happens via orb click
  // Orb drag + click (click only if not dragged)
  (function enableOrbDrag(){
    let dragging=false, startX=0, startY=0, startLeft=0, startTop=0, moved=false;
    const getPos = (e)=>({x:(e.touches? e.touches[0].clientX : e.clientX), y:(e.touches? e.touches[0].clientY : e.clientY)});
    const onDown = (e)=>{
      // Only left mouse button or touch initiates drag
      if (e.type === 'mousedown' && e.button !== 0) return;
      const pos = getPos(e);
      dragging=true; moved=false; anyDragging = true;
      const rect = orb.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top; startX = pos.x; startY = pos.y;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, {passive:false});
      document.addEventListener('touchend', onUp);
    };
    const onMove = (e)=>{
      if(!dragging) return;
      if (e.cancelable) e.preventDefault();
      const pos = getPos(e);
      const dx = pos.x - startX, dy = pos.y - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      orb.style.left = (startLeft + dx) + 'px';
      orb.style.top = (startTop + dy) + 'px';
      orb.style.right = 'auto';
      orb.style.bottom = 'auto';
      // If widget is open, keep it aligned next to the orb
      if (!minimized) alignWidgetToOrb();
    };
    const onUp = (e)=>{
      dragging=false; anyDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      // If mouseup came from a non-left button, do not toggle
      if (e.type === 'mouseup' && e.button !== 0) return;
      if (!moved) {
        // Clicking the orb toggles widget open/close.
        // Follow intent is preserved by showWidget() using followBeforeOpen.
        if (minimized) showWidget(true); else showWidget(false);
      }
    };
    orb.addEventListener('mousedown', onDown);
    orb.addEventListener('touchstart', onDown, {passive:true});
  })();

  // Global mouse tracking for follow mode
  document.addEventListener('mousemove', (e)=>{ mouseX = e.clientX; mouseY = e.clientY; });

  function startFollow(){
    if (followRAF) return;
    const step = ()=>{
      followRAF = requestAnimationFrame(step);
      if (!followMode) { cancelAnimationFrame(followRAF); followRAF=null; return; }
      if (anyDragging || followPaused) return; // pause while dragging or hovering orb
      // Determine which element to move
      if (minimized){
        // Move orb center towards a point near the cursor, keeping a gap radius
        const r = orb.getBoundingClientRect();
        const cx = r.left + r.width/2;
        const cy = r.top + r.height/2;
        const mx = mouseX;
        const my = mouseY;
        const dx = mx - cx;
        const dy = my - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const gap = 20; // px gap from cursor
        const tx = mx - (dx / dist) * gap;
        const ty = my - (dy / dist) * gap;
        const nx = cx + (tx - cx) * 0.045;
        const ny = cy + (ty - cy) * 0.045;
        orb.style.left = (nx - r.width/2) + 'px';
        orb.style.top  = (ny - r.height/2) + 'px';
        orb.style.right = 'auto';
        orb.style.bottom = 'auto';
      }
    };
    followRAF = requestAnimationFrame(step);
  }
  function stopFollow(){ if (followRAF){ cancelAnimationFrame(followRAF); followRAF=null; } }

  function toggleFollow(){
    followMode = !followMode;
    if (followMode) startFollow(); else stopFollow();
    buildMenu();
  }

  // Apply initial follow state if requested
  if (initialOptions.follow) {
    followMode = true; startFollow();
  }

  // Pause follow when hovering the orb so user can catch it
  orb.addEventListener('mouseenter', ()=>{ followPaused = true; });
  orb.addEventListener('mouseleave', ()=>{ followPaused = false; });

  // WebSocket client
  let ws = null;
  let reconnectTimer = null;

  function setStatus(s){ statusRow.v.textContent = s; }
  function setUsers(n){ usersRow.v.textContent = String(n); }
  function setEnergy(v){ energyRow.v.textContent = (v==null? '—' : String(v)); }
  function setHeartbeat(t){ hbRow.v.textContent = t || '—'; }
  function setDot(color){ dot.style.background = color; }
  function pulseOrb(){
    if (minimized && !hushHeartbeat){
      orb.style.transition = 'box-shadow 220ms ease, filter 220ms ease';
      orb.style.boxShadow = 'inset 0 1px 2px rgba(255,255,255,0.6), 0 2px 10px rgba(0,0,0,0.25), 0 0 28px 8px rgba(93, 244, 169, 0.95)';
      orb.style.filter = 'brightness(1.15)';
      setTimeout(()=>{
        orb.style.boxShadow = 'inset 0 1px 2px rgba(255,255,255,0.6), 0 2px 10px rgba(0,0,0,0.25), 0 0 0 rgba(93, 244, 169, 0)';
        orb.style.filter = 'none';
      }, 240);
    }
  }

  function connect(){
    cleanup();
    setStatus('Connecting...'); setDot('#7a8b98');
    try { ws = new WebSocket(serverUrl); } catch (e) { setStatus('Bad URL'); setDot('#d66'); return; }

    ws.onopen = function(){
      setStatus('Connected'); setDot('#4de38e');
    };
    ws.onclose = function(){
      setStatus('Disconnected'); setDot('#c55');
      reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = function(){ setStatus('Error'); setDot('#e6854d'); };
    ws.onmessage = function(evt){ handleMessage(evt); };
  }

  function cleanup(){
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws) { try { ws.close(); } catch(e){} ws = null; }
  }

  function sendCoordinateOnce(){
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Server accepts untyped coordinate payload OR type:'usercoordinate'. Send the latter for clarity.
    ws.send(JSON.stringify({ type:'usercoordinate', coordinates:{ tx:0, ty:0, tz:0 } }));
  }

  function handleMessage(evt){
    let msg; try { msg = JSON.parse(evt.data); } catch(e){ return; }
    switch(msg.type){
      case 'welcome':
        setStatus('Welcome');
        // After welcome, send a coordinate so this widget appears in some user lists
        sendCoordinateOnce();
        break;
      case 'ping':
        setHeartbeat(msg.time);
        lastHeartbeatTime = msg.time;
        if (typeof msg.numUsers === 'number') setUsers(msg.numUsers);
        if (typeof msg.worldtreeEnergy !== 'undefined') setEnergy(msg.worldtreeEnergy);
        pulseOrb();
        break;
      case 'serverinfo':
        if (typeof msg.numUsers === 'number') setUsers(msg.numUsers);
        break;
      case 'energy_update':
        if (typeof msg.worldtreeEnergy !== 'undefined') setEnergy(msg.worldtreeEnergy);
        break;
      case 'userupdate':
        if (typeof msg.numUsers === 'number') setUsers(msg.numUsers);
        break;
    }
  }

  // Initialize
  connect();
  // Bootstrap Automerge Repo-based comments bridge
  (async function bootstrapFromTag(){
    try {
      await loadRepoModules();
      currentSyncServer = getPreferredServer();
      const repo = createRepo(currentSyncServer);
      const raw = initialDocIdOverride; // only proceed when provided
      if (raw) {
        const docUrl = String(raw).startsWith('automerge:') ? String(raw) : ('automerge:' + String(raw));
        installCommentsBridge({ repo, docUrl });
        updateCrdtStatus('connecting');
      } else {
        // No document specified; remain idle and show server only
        setCrdtStatus('idle');
      }
      // Footer UI reflecting current sync server
      serverSpan.title = currentSyncServer;
      serverSpan.textContent = currentSyncServer.replace(/^wss?:\/\//,'');
    } catch(e){ setCrdtStatus('idle'); }
  })();

  // Expose a tiny API (no raw Automerge v2 primitives anymore)
  window.WorldTreeWidget = {
    reconnect: connect, // heartbeat ws
    destroy: function(){ cleanup(); widget.remove(); },
    element: widget,
    heartbeatServer: serverUrl,
    getSyncServer: ()=> currentSyncServer || getPreferredServer(),
    configureComments: (opts)=>{ try { window.AppComments && window.AppComments.configure && window.AppComments.configure(opts||{}); } catch(_){} },
    getComments: ()=> { try { return (currentComments && currentComments.comments) ? currentComments.comments.slice() : []; } catch(_){ return []; } },
    AppComments: ()=> window.AppComments
  };

  // Context menu
  const menu = document.createElement('div');
  menu.style.cssText = [
    'position:fixed',
    'min-width:180px',
    'background:rgba(255,255,255,0.08)',
    'color:inherit',
    'backdrop-filter:blur(10px) saturate(120%)',
    '-webkit-backdrop-filter:blur(10px) saturate(120%)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:10px',
    'padding:6px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.2)',
    'z-index:2147483647',
    'display:none'
  ].join(';');
  document.body.appendChild(menu);

  function addMenuItem(label, onClick){
    const item = document.createElement('div');
    item.textContent = label;
    item.style.cssText = 'padding:8px 10px; border-radius:8px; cursor:pointer;';
    item.addEventListener('mouseenter', ()=> item.style.background = 'rgba(255,255,255,0.08)');
    item.addEventListener('mouseleave', ()=> item.style.background = 'transparent');
    item.addEventListener('click', ()=>{ hideMenu(); onClick(); });
    menu.appendChild(item);
  }

  function showMenu(x,y){
    // Show left/up of cursor by default, but keep on-screen
    menu.style.display = 'block';
    menuOpen = true;
    // Pause follow while menu is open
    if (followMode && followRAF){ stopFollow(); }
    // place offscreen to measure
    menu.style.left = '-9999px';
    menu.style.top = '-9999px';
    const mw = menu.offsetWidth || 180;
    const mh = menu.offsetHeight || 120;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let px = x - mw - 8; // left of cursor
    let py = y - mh - 8; // above cursor
    if (px < 8) px = Math.min(x + 8, vw - mw - 8);
    if (py < 8) py = Math.min(y + 8, vh - mh - 8);
    px = Math.max(8, Math.min(px, vw - mw - 8));
    py = Math.max(8, Math.min(py, vh - mh - 8));
    menu.style.left = px + 'px';
    menu.style.top  = py + 'px';
  }
  function hideMenu(){
    menu.style.display = 'none';
    menuOpen = false;
    // Resume follow if applicable and widget is minimized
    if (followMode && minimized && !followRAF){ startFollow(); }
  }
  document.addEventListener('click', (e)=>{ if (menu.style.display==='block' && !menu.contains(e.target)) hideMenu(); });
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') hideMenu(); });

  function sendSummon(){
    if (ws && ws.readyState === WebSocket.OPEN){
      const url = location.href;
      try { ws.send(JSON.stringify({ type:'chat', text:`summon:${url}` })); } catch(e){}
    }
  }

  function toggleUsers(){
    showUsersActivity = !showUsersActivity; applyVisibility(); buildMenu();
  }
  function toggleHush(){
    hushHeartbeat = !hushHeartbeat; buildMenu();
  }

  function buildMenu(){
    menu.innerHTML = '';
    addMenuItem('Visit WorldTree', ()=> window.open('https://worldtree.online', '_blank', 'noopener'));
    addMenuItem((showUsersActivity?'Turn off':'Turn on') + ' users activity', toggleUsers);
    addMenuItem((hushHeartbeat?'Unhush':'Hush') + ' heartbeat', toggleHush);
    addMenuItem((followMode?'Stop ':'') + 'Follow cursor', toggleFollow);
    addMenuItem('Summon (invite others here)', sendSummon);
    if (allowServerSwitch) {
      addMenuItem('Change sync server…', ()=> gearBtn.click());
    }
    addMenuItem('Comments: Append test', async ()=>{
      const text = 'test:' + new Date().toISOString();
      if (window.AppComments && window.AppComments.add) {
        window.AppComments.add({ text, ts: Date.now() });
      }
    });
  }
  buildMenu();

  // Gear button handler to switch server at runtime
  gearBtn.addEventListener('click', ()=>{
    const cur = (function(){ try { return localStorage.getItem(STORAGE_SERVER_OVERRIDE) || currentSyncServer || serverUrl; } catch(_){ return currentSyncServer || serverUrl; } })();
    const next = prompt('Enter sync server WebSocket URL', cur || 'ws://localhost:3030');
    if (!next) return;
    try { localStorage.setItem(STORAGE_SERVER_OVERRIDE, next); } catch(_){ }
    if (window.AppComments && window.AppComments.configure) {
      window.AppComments.configure({ server: next });
    }
  });

  function onContextMenu(e){
    // Use our custom menu; prevent native menu and do not toggle widget
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY);
  }
  widget.addEventListener('contextmenu', onContextMenu);
  orb.addEventListener('contextmenu', onContextMenu);

  // Hover HUD (mouse-locked)
  const hud = document.createElement('div');
  hud.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'transform:translate(12px, 12px)',
    'padding:6px 8px',
    'border-radius:8px',
    'background:rgba(0,0,0,0.25)',
    'color:inherit',
    'backdrop-filter:blur(8px) saturate(120%)',
    '-webkit-backdrop-filter:blur(8px) saturate(120%)',
    'font:11px/1.3 inherit',
    'white-space:nowrap',
    'z-index:2147483647',
    'display:none'
  ].join(';');
  document.body.appendChild(hud);

  function hudContent(){
    const hb = lastHeartbeatTime ? `${lastHeartbeatTime}` : '—';
    return `worldtree seed · users ${usersRow.v.textContent} · energy ${energyRow.v.textContent} · hb ${hb}`;
  }
  function showHud(x,y){
    hud.textContent = hudContent();
    hud.style.left = x + 'px';
    hud.style.top  = y + 'px';
    hud.style.display = 'block';
  }
  function hideHud(){ hud.style.display = 'none'; }
  function attachHover(el){
    el.addEventListener('mousemove', (e)=> showHud(e.clientX, e.clientY));
    el.addEventListener('mouseenter', (e)=> showHud(e.clientX, e.clientY));
    el.addEventListener('mouseleave', hideHud);
  }
  attachHover(widget);
  attachHover(orb);
})();
