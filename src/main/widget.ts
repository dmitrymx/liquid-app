/**
 * Widget Manager — Desktop Widgets for Liquid App
 * Creates frameless, transparent, always-on-top mini windows
 * that display real-time system telemetry on the desktop.
 *
 * Architecture: Uses a dedicated preload script + file:// HTML
 * to properly load fonts and support context isolation.
 * Shares hardware data from main app polling — NO duplicate polling.
 */
import { BrowserWindow, ipcMain, screen, app } from 'electron'
import path from 'path'
import fs from 'fs'

/* ── Types ── */
export interface WidgetConfig {
  id: string
  type: 'cpu_gpu' | 'ram'
  title: string
  titleRu: string
  enabled: boolean
  x: number
  y: number
  width: number
  height: number
}

export interface WidgetState {
  globalEnabled: boolean
  alwaysOnTop: boolean
  opacity: number
  configs: WidgetConfig[]
}

/* ── Default state ── */
const DEFAULT_STATE: WidgetState = {
  globalEnabled: false,
  alwaysOnTop: true,
  opacity: 0.92,
  configs: [
    { id: 'cpu_gpu', type: 'cpu_gpu', title: 'Temperatures', titleRu: 'Температуры', enabled: true, x: -1, y: -1, width: 220, height: 220 },
    { id: 'ram', type: 'ram', title: 'RAM Booster', titleRu: 'Память', enabled: true, x: -1, y: -1, width: 220, height: 200 },
  ]
}

let widgetWindows = new Map<string, BrowserWindow>()
let currentState: WidgetState = JSON.parse(JSON.stringify(DEFAULT_STATE))
let latestHwData: any = null
let currentLang: string = 'ru'

/** Widget HTML stored in userData (writable in both dev and production) */
function getWidgetDir(): string {
  return path.join(app.getPath('userData'), 'widgets')
}

/** Ensure widget HTML files exist on disk */
function ensureWidgetFiles(): void {
  try { fs.mkdirSync(getWidgetDir(), { recursive: true }) } catch { /* exists */ }

  /* Write widget HTML only if not present or during dev */
  writeWidgetHTML('cpu_gpu')
  writeWidgetHTML('ram')
}

/** Generate and write widget HTML file */
function writeWidgetHTML(type: string): void {
  const filePath = path.join(getWidgetDir(), `${type}.html`)

  const commonCSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
      background: transparent;
      color: #e0e8ec;
      overflow: hidden;
      app-region: drag;
    }
    .w {
      border-radius: 16px;
      background: rgba(10, 18, 22, 0.82);
      backdrop-filter: blur(30px) saturate(160%);
      -webkit-backdrop-filter: blur(30px) saturate(160%);
      border: 1px solid rgba(0, 242, 255, 0.1);
      box-shadow: 0 6px 24px rgba(0,0,0,0.45), 0 0 12px rgba(0,242,255,0.04);
      padding: 14px 16px;
      position: relative;
    }
    .hdr {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.1em;
      color: rgba(0,242,255,0.75);
    }
    .close-btn {
      app-region: no-drag;
      cursor: pointer; width: 16px; height: 16px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
      font-size: 10px; color: #888; opacity: 0; transition: opacity 0.2s;
    }
    .w:hover .close-btn { opacity: 1; }
    .close-btn:hover { background: rgba(255,80,80,0.3); color: #fff; }
    .row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .row:last-of-type { border-bottom: none; }
    .lbl { font-size: 11px; color: rgba(224,232,236,0.55); font-weight: 500; }
    .val { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .c-ok { color: #15ffd1; } .c-warm { color: #00f2ff; }
    .c-hot { color: #ffbe3c; } .c-crit { color: #ff4444; }
    .bar { width: 100%; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.05); margin-top: 6px; overflow: hidden; }
    .bar-f { height: 100%; border-radius: 2px; background: linear-gradient(90deg,#00f2ff,#15ffd1); transition: width 0.6s ease; }
    .bar-f.w2 { background: linear-gradient(90deg,#ffbe3c,#ff8c00); }
    .bar-f.w3 { background: linear-gradient(90deg,#ff4444,#ff0000); }
    .btn {
      app-region: no-drag;
      width: 100%; margin-top: 8px; padding: 7px; border-radius: 8px;
      border: 1px solid rgba(0,242,255,0.18); background: rgba(0,242,255,0.06);
      color: #00f2ff; font-family: inherit; font-size: 10px; font-weight: 600;
      cursor: pointer; transition: all 0.3s; text-align: center;
    }
    .btn:hover { background: rgba(0,242,255,0.14); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.success { background: rgba(0,200,100,0.12); border-color: rgba(0,200,100,0.3); color: #15ffd1; }
    .sub { font-size: 10px; color: rgba(224,232,236,0.35); margin-top: 4px; display: flex; justify-content: space-between; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .pulsing { animation: pulse 1s ease infinite; }
  `

  let body = ''
  if (type === 'cpu_gpu') {
    body = `
      <div class="hdr"><span id="wt">🌡 Temperatures</span><div class="close-btn" onclick="window.w.close()">✕</div></div>
      <div class="row"><span class="lbl">CPU</span><span class="val c-ok" id="ct">—</span></div>
      <div class="row"><span class="lbl" id="cl_lbl">CPU Load</span><span class="val c-warm" id="cl">—</span></div>
      <div class="bar"><div class="bar-f" id="cb" style="width:0%"></div></div>
      <div class="row" style="margin-top:6px"><span class="lbl">GPU</span><span class="val c-ok" id="gt">—</span></div>
      <div class="row"><span class="lbl" id="gl_lbl">GPU Load</span><span class="val c-warm" id="gl">—</span></div>
      <div class="bar"><div class="bar-f" id="gb" style="width:0%"></div></div>
    `
  } else if (type === 'ram') {
    body = `
      <div class="hdr"><span id="wt">🧠 Memory</span><div class="close-btn" onclick="window.w.close()">✕</div></div>
      <div class="row"><span class="lbl" id="used_lbl">Used</span><span class="val c-warm" id="ru">—</span></div>
      <div class="row"><span class="lbl" id="total_lbl">Total</span><span class="val" id="rt" style="color:rgba(224,232,236,0.5)">—</span></div>
      <div class="bar"><div class="bar-f" id="rb" style="width:0%"></div></div>
      <div class="sub"><span id="rp">0%</span><span id="rf">—</span></div>
      <button class="btn" id="pb" onclick="window.w.purge()">⚡ Free Memory</button>
    `
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${commonCSS}</style></head>
<body><div class="w">${body}</div>
<script>
window.w = {};
const L = { en: {
  temp: '🌡 Temperatures', mem: '🧠 Memory', used: 'Used', total: 'Total',
  free: 'Free', cpuLoad: 'CPU Load', gpuLoad: 'GPU Load',
  purge: '⚡ Free Memory', purging: '⏳ Optimizing...', purged: '✅ Freed: '
}, ru: {
  temp: '🌡 Температуры', mem: '🧠 Память', used: 'Используется', total: 'Всего',
  free: 'Свободно', cpuLoad: 'Загрузка CPU', gpuLoad: 'Загрузка GPU',
  purge: '⚡ Освободить память', purging: '⏳ Оптимизация...', purged: '✅ Освобождено: '
}};
let lang = 'en';
function tr(key) { return (L[lang] || L.en)[key] || key; }
function applyLang() {
  const type = '${type}';
  const wt = document.getElementById('wt');
  if (type === 'cpu_gpu' && wt) wt.textContent = tr('temp');
  if (type === 'ram' && wt) wt.textContent = tr('mem');
  const ul = document.getElementById('used_lbl'); if (ul) ul.textContent = tr('used');
  const tl = document.getElementById('total_lbl'); if (tl) tl.textContent = tr('total');
  const cl = document.getElementById('cl_lbl'); if (cl) cl.textContent = tr('cpuLoad');
  const gl = document.getElementById('gl_lbl'); if (gl) gl.textContent = tr('gpuLoad');
  const pb = document.getElementById('pb'); if (pb && !pb.disabled) pb.textContent = tr('purge');
}
function fmtB(b){if(!b)return'0 B';const k=1024,s=['B','KB','MB','GB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
function tc(t){if(t==null)return'c-ok';if(t<50)return'c-ok';if(t<65)return'c-warm';if(t<80)return'c-hot';return'c-crit'}
function bc(p){if(p>85)return'bar-f w3';if(p>65)return'bar-f w2';return'bar-f'}
window.addEventListener('message',e=>{
  const d=e.data;if(!d)return;
  if(d.type==='lang'){lang=d.lang||'en';applyLang();return}
  if(d.type!=='hw')return;
  const type='${type}';
  if(type==='cpu_gpu'){
    const cpuT=d.cpu?.temperature;
    const el=document.getElementById('ct');if(el){el.textContent=cpuT!=null?cpuT+'°C':'N/A';el.className='val '+tc(cpuT)}
    const cpuL=d.cpu?.load??0;
    const cl2=document.getElementById('cl');if(cl2)cl2.textContent=Math.round(cpuL)+'%';
    const cb2=document.getElementById('cb');if(cb2){cb2.style.width=cpuL+'%';cb2.className=bc(cpuL)}
    const gpu=d.gpu?.[0];
    const gt2=document.getElementById('gt');if(gt2&&gpu){gt2.textContent=gpu.temperature!=null?gpu.temperature+'°C':'N/A';gt2.className='val '+tc(gpu.temperature)}
    const gl2=document.getElementById('gl');if(gl2&&gpu)gl2.textContent=(gpu.utilizationGpu??0)+'%';
    const gb2=document.getElementById('gb');if(gb2&&gpu){gb2.style.width=(gpu.utilizationGpu??0)+'%';gb2.className=bc(gpu.utilizationGpu??0)}
  }else if(type==='ram'){
    const m=d.memory;if(!m)return;
    const ru2=document.getElementById('ru');if(ru2)ru2.textContent=fmtB(m.active);
    const rt2=document.getElementById('rt');if(rt2)rt2.textContent=fmtB(m.total);
    const rb2=document.getElementById('rb');if(rb2){rb2.style.width=m.usage+'%';rb2.className=bc(m.usage)}
    const rp2=document.getElementById('rp');if(rp2)rp2.textContent=Math.round(m.usage)+'%';
    const rf2=document.getElementById('rf');if(rf2)rf2.textContent=tr('free')+': '+fmtB(m.available);
  }
});
</script></body></html>`

  fs.writeFileSync(filePath, html, 'utf-8')
}

/** Create a single widget window */
function createWidgetWindow(config: WidgetConfig): BrowserWindow | null {
  if (widgetWindows.has(config.id)) {
    const existing = widgetWindows.get(config.id)!
    if (!existing.isDestroyed()) { existing.focus(); return existing }
  }

  const display = screen.getPrimaryDisplay()
  const { width: screenW } = display.workAreaSize
  const x = config.x >= 0 ? config.x : screenW - config.width - 30
  const y = config.y >= 0 ? config.y : (config.type === 'cpu_gpu' ? 40 : 290)

  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    x, y,
    frame: false,
    transparent: true,
    alwaysOnTop: currentState.alwaysOnTop,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    opacity: currentState.opacity,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  if (currentState.alwaysOnTop) {
    win.setAlwaysOnTop(true, 'floating')
  }

  const htmlPath = path.join(getWidgetDir(), `${config.type}.html`)
  win.loadFile(htmlPath)

  /* Inject close & purge API once loaded */
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      window.__widgetAPI = {
        close: function() {
          if (window.electronAPI && window.electronAPI.closeWidget) {
            window.electronAPI.closeWidget('${config.id}');
          }
        },
        purge: function() {
          var btn = document.getElementById('pb');
          if (btn) {
            btn.textContent = tr('purging');
            btn.disabled = true;
            btn.classList.add('pulsing');
          }
          if (window.electronAPI && window.electronAPI.purgeRam) {
            window.electronAPI.purgeRam().then(function(r) {
              if (btn) {
                btn.classList.remove('pulsing');
                btn.classList.add('success');
                btn.textContent = tr('purged') + (r && r.freedMB ? r.freedMB : 0) + ' MB';
                setTimeout(function() {
                  btn.textContent = tr('purge');
                  btn.disabled = false;
                  btn.classList.remove('success');
                }, 3500);
              }
            }).catch(function() {
              if (btn) {
                btn.classList.remove('pulsing');
                btn.textContent = tr('purge');
                btn.disabled = false;
              }
            });
          } else {
            if (btn) {
              btn.classList.remove('pulsing');
              btn.textContent = '⚠ No API';
              btn.disabled = false;
            }
          }
        }
      };
      window.w = window.__widgetAPI;
    `)
    /* Send initial data if available */
    if (latestHwData) {
      win.webContents.executeJavaScript(`window.postMessage({type:'hw',...${JSON.stringify(latestHwData)}})`)
    }
    /* Send current language */
    if (currentLang) {
      win.webContents.executeJavaScript(`window.postMessage({type:'lang',lang:'${currentLang}'})`)
    }
  })

  win.on('closed', () => { widgetWindows.delete(config.id) })

  /* Save position on move */
  win.on('moved', () => {
    if (win.isDestroyed()) return
    const [wx, wy] = win.getPosition()
    const cfg = currentState.configs.find(c => c.id === config.id)
    if (cfg) { cfg.x = wx; cfg.y = wy }
  })

  widgetWindows.set(config.id, win)
  return win
}

/** Broadcast hardware data to all widget windows — called FROM main app polling, NO separate timer */
export function broadcastHardwareData(data: any): void {
  latestHwData = data
  if (!currentState.globalEnabled) return
  for (const [, win] of widgetWindows) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.executeJavaScript(`window.postMessage({type:'hw',...${JSON.stringify(data)}})`)
      } catch { /* skip */ }
    }
  }
}

/* ── Public API ── */

export function showWidgets(): void {
  currentState.globalEnabled = true
  ensureWidgetFiles()
  for (const config of currentState.configs) {
    if (config.enabled) createWidgetWindow(config)
  }
}

export function hideWidgets(): void {
  currentState.globalEnabled = false
  for (const [, win] of widgetWindows) {
    if (!win.isDestroyed()) win.close()
  }
  widgetWindows.clear()
}

export function toggleWidgets(enabled: boolean): void {
  if (enabled) showWidgets(); else hideWidgets()
}

export function setWidgetOpacity(opacity: number): void {
  currentState.opacity = opacity
  for (const [, win] of widgetWindows) {
    if (!win.isDestroyed()) win.setOpacity(opacity)
  }
}

export function setWidgetAlwaysOnTop(on: boolean): void {
  currentState.alwaysOnTop = on
  for (const [, win] of widgetWindows) {
    if (!win.isDestroyed()) {
      win.setAlwaysOnTop(on, on ? 'floating' : 'normal')
    }
  }
}

export function toggleSingleWidget(widgetId: string, enabled: boolean): void {
  const cfg = currentState.configs.find(c => c.id === widgetId)
  if (!cfg) return
  cfg.enabled = enabled
  if (enabled && currentState.globalEnabled) {
    createWidgetWindow(cfg)
  } else {
    const win = widgetWindows.get(widgetId)
    if (win && !win.isDestroyed()) win.close()
    widgetWindows.delete(widgetId)
  }
}

export function getWidgetState(): WidgetState {
  return JSON.parse(JSON.stringify(currentState))
}

/** Register widget IPC handlers */
export function registerWidgetIPC(): void {
  ipcMain.handle('widgets:toggle', (_e, enabled: boolean) => {
    toggleWidgets(enabled)
    return { success: true, enabled }
  })
  ipcMain.handle('widgets:setOpacity', (_e, opacity: number) => {
    setWidgetOpacity(opacity)
    return { success: true, opacity }
  })
  ipcMain.handle('widgets:setAlwaysOnTop', (_e, on: boolean) => {
    setWidgetAlwaysOnTop(on)
    return { success: true, on }
  })
  ipcMain.handle('widgets:toggleSingle', (_e, widgetId: string, enabled: boolean) => {
    toggleSingleWidget(widgetId, enabled)
    return { success: true, widgetId, enabled }
  })
  ipcMain.handle('widgets:getState', () => getWidgetState())
  ipcMain.handle('widgets:setLang', (_e, lang: string) => {
    setWidgetLang(lang)
    return { success: true, lang }
  })
  ipcMain.on('widget:close', (_e, widgetId: string) => {
    const win = widgetWindows.get(widgetId)
    if (win && !win.isDestroyed()) win.close()
    widgetWindows.delete(widgetId)
    const cfg = currentState.configs.find(c => c.id === widgetId)
    if (cfg) cfg.enabled = false
  })
}

export function setWidgetLang(lang: string): void {
  currentLang = lang
  for (const [, win] of widgetWindows) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.executeJavaScript(`window.postMessage({type:'lang',lang:'${lang}'})`)
      } catch { /* skip */ }
    }
  }
}

export function cleanupWidgets(): void {
  for (const [, win] of widgetWindows) {
    if (!win.isDestroyed()) win.close()
  }
  widgetWindows.clear()
}
