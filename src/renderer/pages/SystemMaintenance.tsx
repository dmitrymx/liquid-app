/**
 * System Maintenance — Health Check + Backup & Restore
 * Full bilingual support, restore functionality, theme-aware
 */
import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'

type Tab = 'health' | 'backup'

interface CheckState {
  status: 'idle' | 'running' | 'ok' | 'warning' | 'error'
  percent: number
  messageKey: string
  log: string[]
}

/* Localized messages for health check results */
const healthMsg: Record<string, Record<string, string>> = {
  sfc_ok:        { ru: 'Нарушений целостности не обнаружено', en: 'No integrity violations found' },
  sfc_repaired:  { ru: 'Повреждённые файлы найдены и восстановлены', en: 'Found and repaired corrupt files' },
  sfc_corrupt:   { ru: 'Найдены повреждения, которые не удалось исправить', en: 'Found corrupt files that could not be repaired' },
  sfc_failed:    { ru: 'SFC не смог выполнить сканирование', en: 'SFC could not perform the scan' },
  sfc_error:     { ru: 'SFC завершился с ошибкой', en: 'SFC exited with error' },
  dism_ok:       { ru: 'Хранилище компонентов исправно', en: 'Component store is healthy' },
  dism_repairable: { ru: 'Хранилище можно восстановить', en: 'Component store is repairable' },
  dism_corrupt:  { ru: 'Обнаружено повреждение хранилища', en: 'Component store corruption detected' },
  dism_error:    { ru: 'DISM завершился с ошибкой', en: 'DISM exited with error' },
  dism_repair_ok: { ru: 'Хранилище компонентов восстановлено', en: 'Component store repaired successfully' },
  dism_repair_failed: { ru: 'Не удалось восстановить компоненты', en: 'Repair failed' },
  chkdsk_ok:     { ru: 'Проблем на диске не обнаружено', en: 'No problems found on disk' },
  chkdsk_errors: { ru: 'Обнаружены ошибки на диске', en: 'Errors found on disk' },
  chkdsk_warning:{ ru: 'CHKDSK завершился с предупреждением', en: 'CHKDSK finished with warning' },
  /* Backup messages */
  rp_created:    { ru: 'Точка восстановления создана', en: 'Restore point created' },
  rp_frequency:  { ru: 'Windows разрешает 1 точку в день. Попробуйте завтра', en: 'Windows limits to 1 per day. Try tomorrow' },
  rp_access:     { ru: 'Требуются права администратора', en: 'Requires administrator privileges' },
  rp_error:      { ru: 'Ошибка создания точки', en: 'Failed to create restore point' },
  reg_backed_up: { ru: 'Реестр сохранён', en: 'Registry backed up' },
  reg_backup_failed: { ru: 'Ошибка бэкапа реестра', en: 'Registry backup failed' },
  reg_restored:  { ru: 'Реестр восстановлен из бэкапа', en: 'Registry restored from backup' },
  reg_restore_failed: { ru: 'Ошибка восстановления реестра', en: 'Registry restore failed' },
  reg_restore_no_files: { ru: 'В папке нет .reg файлов', en: 'No .reg files found in folder' },
  sys_restore_started: { ru: 'Восстановление системы запущено (перезагрузка)', en: 'System restore started (reboot required)' },
  sys_restore_failed: { ru: 'Ошибка восстановления системы', en: 'System restore failed' },
}

const t_ = (key: string, lang: string, detail?: string) => {
  const m = healthMsg[key]
  const txt = m ? m[lang === 'ru' ? 'ru' : 'en'] : key
  return detail ? `${txt} (${detail})` : txt
}

const SystemMaintenance: React.FC = () => {
  const { i18n } = useTranslation()
  const l = i18n.language === 'ru' ? 'ru' : 'en'
  const [tab, setTab] = useState<Tab>('health')

  const [checks, setChecks] = useState<Record<string, CheckState>>({
    sfc: { status: 'idle', percent: 0, messageKey: '', log: [] },
    dism: { status: 'idle', percent: 0, messageKey: '', log: [] },
    dism_repair: { status: 'idle', percent: 0, messageKey: '', log: [] },
    chkdsk: { status: 'idle', percent: 0, messageKey: '', log: [] },
  })
  const [running, setRunning] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const [restorePoints, setRestorePoints] = useState<any[]>([])
  const [backups, setBackups] = useState<any[]>([])
  const [rpLoading, setRpLoading] = useState(false)
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [backingUp, setBackingUp] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [protEnabled, setProtEnabled] = useState<boolean|null>(null)
  const [restoreMsg, setRestoreMsg] = useState('')

  useEffect(() => {
    const cleanup = ipc.onHealthProgress((data: any) => {
      setChecks(prev => {
        const cur = prev[data.type]
        if (!cur) return prev
        return { ...prev, [data.type]: { ...cur, percent: data.percent ?? cur.percent, log: [...cur.log, data.line].slice(-100) } }
      })
    })
    return cleanup
  }, [])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [checks])

  useEffect(() => { if (tab === 'backup') loadBackupData() }, [tab])

  const loadBackupData = async () => {
    setRpLoading(true)
    const [rps, bks, prot] = await Promise.all([ipc.listRestorePoints(), ipc.listBackups(), ipc.isSystemProtectionEnabled()])
    setRestorePoints(Array.isArray(rps) ? rps : [])
    setBackups(Array.isArray(bks) ? bks : [])
    setProtEnabled(prot)
    setRpLoading(false)
  }

  const runCheck = async (type: string, fn: () => Promise<any>) => {
    setChecks(prev => ({ ...prev, [type]: { status: 'running', percent: 0, messageKey: '', log: [] } }))
    setRunning(true)
    try {
      const r = await fn()
      setChecks(prev => ({ ...prev, [type]: { ...prev[type], status: r?.status||'ok', percent: 100, messageKey: r?.messageKey||'', log: [...prev[type].log, `── ${t_(r?.messageKey||'',l)} (${Math.round((r?.duration||0)/1000)}s) ──`] } }))
    } catch { setChecks(prev => ({ ...prev, [type]: { ...prev[type], status: 'error', percent: 100, messageKey: 'sfc_error' } })) }
    setRunning(false)
  }

  const runAllChecks = async () => {
    setRunning(true)
    for (const [type, fn] of [['sfc', ipc.runSfc], ['dism', ipc.runDism], ['chkdsk', ipc.runChkdsk]] as [string, ()=>Promise<any>][]) {
      setChecks(prev => ({ ...prev, [type]: { status: 'running', percent: 0, messageKey: '', log: [] } }))
      try { const r = await fn(); setChecks(prev => ({ ...prev, [type]: { ...prev[type], status: r?.status||'ok', percent: 100, messageKey: r?.messageKey||'', log: [...prev[type].log, `── ${t_(r?.messageKey||'',l)} ──`] } }))
      } catch { setChecks(prev => ({ ...prev, [type]: { ...prev[type], status: 'error', percent: 100, messageKey: 'sfc_error' } })) }
    }
    setRunning(false)
  }

  const handleCreateRP = async () => { if (!createDesc.trim()) return; setCreating(true); setCreateMsg(''); const r = await ipc.createRestorePoint(createDesc.trim()); setCreateMsg(t_(r?.messageKey||'rp_error', l, r?.detail)); setCreating(false); setCreateDesc(''); loadBackupData() }
  const handleBackupReg = async () => { setBackingUp(true); setBackupMsg(''); const r = await ipc.backupRegistryFull(); setBackupMsg(t_(r?.messageKey||'reg_backup_failed', l, r?.detail)); setBackingUp(false); loadBackupData() }
  const handleRestoreReg = async (dir: string) => { if (!confirm(l==='ru'?'Восстановить реестр из этого бэкапа? Это может потребовать перезагрузки.':'Restore registry from this backup? May require reboot.')) return; setRestoreMsg('...'); const r = await ipc.restoreRegistryFromBackup(dir); setRestoreMsg(t_(r?.messageKey||'reg_restore_failed',l,r?.detail)); loadBackupData() }
  const handleRestoreSystem = async (seq: number, desc: string) => { if (!confirm(l==='ru'?`Восстановить систему к "${desc}"? Компьютер будет перезагружен!`:`Restore system to "${desc}"? Computer will reboot!`)) return; const r = await ipc.restoreSystem(seq); setRestoreMsg(t_(r?.messageKey||'sys_restore_failed',l,r?.detail)) }

  const checkMeta = [
    { id: 'sfc', icon: 'verified_user', name: l==='ru'?'Проверка системных файлов':'System File Checker', desc: l==='ru'?'SFC /scannow — проверяет и восстанавливает системные файлы':'SFC /scannow — scans and repairs system files', fn: ()=>runCheck('sfc',ipc.runSfc) },
    { id: 'dism', icon: 'inventory_2', name: l==='ru'?'Хранилище компонентов':'Component Store', desc: l==='ru'?'DISM — проверяет целостность компонентов Windows':'DISM — checks component store integrity', fn: ()=>runCheck('dism',ipc.runDism) },
    { id: 'dism_repair', icon: 'build_circle', name: l==='ru'?'Ремонт компонентов':'Component Repair', desc: l==='ru'?'DISM RestoreHealth — восстанавливает компоненты':'DISM RestoreHealth — repairs components', fn: ()=>runCheck('dism_repair',ipc.runDismRepair) },
    { id: 'chkdsk', icon: 'hard_drive_2', name: l==='ru'?'Проверка диска':'Disk Check', desc: l==='ru'?'CHKDSK — проверяет файловую систему C:':'CHKDSK — scans C: file system', fn: ()=>runCheck('chkdsk',ipc.runChkdsk) },
  ]

  const stIcon = (s: string) => s==='ok'?'check_circle':s==='warning'?'warning':s==='error'?'error':s==='running'?'progress_activity':'radio_button_unchecked'
  const stColor = (s: string) => s==='ok'?'var(--badge-success-text)':s==='warning'?'var(--status-warning)':s==='error'?'var(--badge-danger-text)':s==='running'?'var(--neon-cyan)':'var(--outline)'
  const activeLog = Object.values(checks).flatMap(c => c.log)

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{l==='ru'?'Обслуживание Системы':'System Maintenance'}</h1>
        <p>{l==='ru'?'Проверка целостности, точки восстановления и бэкапы':'Integrity checks, restore points and backups'}</p>
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:20 }}>
        {([['health','health_and_safety',l==='ru'?'Здоровье системы':'System Health'],['backup','backup',l==='ru'?'Бэкап и восстановление':'Backup & Restore']] as const).map(([k,ic,lb]) => (
          <button key={k} onClick={()=>setTab(k as Tab)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', borderRadius:12, background:tab===k?'var(--neon-cyan)':'var(--surface-container)', color:tab===k?'var(--on-primary)':'var(--on-surface-variant)', border:'none', cursor:'pointer', fontWeight:600, fontSize:13, transition:'all 0.2s' }}>
            <span className="material-symbols-outlined" style={{fontSize:18}}>{ic}</span>{lb}
          </button>
        ))}
      </div>

      {tab === 'health' && (<div>
        <button className="glass-btn-primary" onClick={runAllChecks} disabled={running} style={{marginBottom:20,padding:'12px 32px'}}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>{running?'progress_activity':'play_arrow'}</span>
          {running?(l==='ru'?'Выполняется...':'Running...'):(l==='ru'?'Запустить все проверки':'Run All Checks')}
        </button>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          {checkMeta.map(cm => { const st = checks[cm.id]; return (
            <div key={cm.id} className="glass-panel liquid-glass-high" style={{padding:20}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <span className="material-symbols-outlined" style={{fontSize:28,color:stColor(st.status),animation:st.status==='running'?'spin 1s linear infinite':'none'}}>{stIcon(st.status)}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--on-surface)'}}>{cm.name}</div>
                  <div style={{fontSize:11,color:'var(--on-surface-variant)',marginTop:2}}>{cm.desc}</div>
                </div>
                <button className="glass-btn-ghost" onClick={cm.fn} disabled={running||st.status==='running'} style={{padding:'6px 14px',fontSize:11}}>
                  <span className="material-symbols-outlined" style={{fontSize:14}}>{st.status==='running'?'progress_activity':'play_arrow'}</span>
                  {l==='ru'?'Запуск':'Run'}
                </button>
              </div>
              {st.status==='running' && <div style={{height:3,borderRadius:2,background:'var(--gauge-track)',overflow:'hidden'}}><div style={{height:'100%',borderRadius:2,background:'linear-gradient(90deg,var(--neon-cyan),var(--neon-teal))',width:`${st.percent}%`,transition:'width 0.5s'}}/></div>}
              {st.status!=='idle'&&st.status!=='running'&&st.messageKey && <div style={{marginTop:8,padding:'8px 12px',borderRadius:8,background:st.status==='ok'?'var(--badge-success-bg)':st.status==='warning'?'rgba(255,193,7,0.1)':'var(--badge-danger-bg)',border:`1px solid ${st.status==='ok'?'var(--badge-success-border)':st.status==='warning'?'rgba(255,193,7,0.3)':'var(--badge-danger-border)'}`,fontSize:12,fontWeight:600,color:st.status==='ok'?'var(--badge-success-text)':st.status==='warning'?'var(--status-warning)':'var(--badge-danger-text)'}}>{t_(st.messageKey,l)}</div>}
            </div>
          )})}
        </div>

        {activeLog.length > 0 && <div className="glass-panel" style={{padding:16}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <span className="material-symbols-outlined" style={{fontSize:16,color:'var(--neon-cyan)'}}>terminal</span>
            <span style={{fontSize:12,fontWeight:700,color:'var(--on-surface)'}}>{l==='ru'?'Журнал':'Log Output'}</span>
          </div>
          <div ref={logRef} style={{maxHeight:200,overflowY:'auto',padding:12,borderRadius:8,background:'var(--card-inset-bg)',fontFamily:'Consolas, monospace',fontSize:11,color:'var(--on-surface-variant)',lineHeight:1.6}}>
            {activeLog.map((line,i)=><div key={i} style={{color:line.startsWith('[ERR]')?'var(--badge-danger-text)':line.startsWith('──')?'var(--neon-cyan)':undefined}}>{line}</div>)}
          </div>
        </div>}
      </div>)}

      {tab === 'backup' && (<div>
        {protEnabled!==null && <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderRadius:12,marginBottom:20,background:protEnabled?'var(--badge-success-bg)':'var(--badge-danger-bg)',border:`1px solid ${protEnabled?'var(--badge-success-border)':'var(--badge-danger-border)'}`}}>
          <span className="material-symbols-outlined" style={{fontSize:20,color:protEnabled?'var(--badge-success-text)':'var(--badge-danger-text)'}}>{protEnabled?'check_circle':'warning'}</span>
          <span style={{fontSize:13,fontWeight:600,color:protEnabled?'var(--badge-success-text)':'var(--badge-danger-text)'}}>{l==='ru'?(protEnabled?'Защита системы включена':'Защита системы отключена — точки восстановления недоступны'):(protEnabled?'System Protection enabled':'System Protection disabled — restore points unavailable')}</span>
        </div>}

        {restoreMsg && <div style={{padding:'10px 14px',borderRadius:10,marginBottom:16,background:'var(--card-inset-bg)',border:'1px solid var(--card-inset-border)',fontSize:12,color:'var(--on-surface-variant)',textAlign:'center'}}>{restoreMsg}</div>}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="glass-panel liquid-glass-high" style={{padding:24}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--neon-cyan)'}}>add_circle</span>
              <h3 style={{fontSize:16,fontWeight:700,margin:0}}>{l==='ru'?'Создать точку восстановления':'Create Restore Point'}</h3>
            </div>
            <input type="text" value={createDesc} onChange={e=>setCreateDesc(e.target.value)} placeholder={l==='ru'?'Описание (напр: Перед установкой драйвера)':'Description (e.g: Before driver install)'} style={{width:'100%',padding:'10px 14px',borderRadius:10,background:'var(--card-inset-bg)',border:'1px solid var(--card-inset-border)',color:'var(--on-surface)',fontSize:13,fontFamily:'var(--font-family)',outline:'none',marginBottom:12}}/>
            <button className="glass-btn-primary" onClick={handleCreateRP} disabled={creating||!createDesc.trim()} style={{width:'100%',padding:'10px'}}>
              <span className="material-symbols-outlined" style={{fontSize:16}}>{creating?'progress_activity':'save'}</span>
              {creating?(l==='ru'?'Создание...':'Creating...'):(l==='ru'?'Создать':'Create')}
            </button>
            {createMsg && <div style={{marginTop:8,fontSize:12,color:'var(--on-surface-variant)',textAlign:'center'}}>{createMsg}</div>}
          </div>

          <div className="glass-panel liquid-glass-high" style={{padding:24}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <span className="material-symbols-outlined" style={{fontSize:22,color:'var(--neon-cyan)'}}>database</span>
              <h3 style={{fontSize:16,fontWeight:700,margin:0}}>{l==='ru'?'Полный бэкап реестра':'Full Registry Backup'}</h3>
            </div>
            <p style={{fontSize:12,color:'var(--on-surface-variant)',marginBottom:16,lineHeight:1.5}}>{l==='ru'?'Экспортирует HKLM и HKCU в .reg файлы':'Exports HKLM and HKCU to .reg files'}</p>
            <button className="glass-btn-primary" onClick={handleBackupReg} disabled={backingUp} style={{width:'100%',padding:'10px'}}>
              <span className="material-symbols-outlined" style={{fontSize:16}}>{backingUp?'progress_activity':'backup'}</span>
              {backingUp?(l==='ru'?'Создание...':'Backing up...'):(l==='ru'?'Создать бэкап':'Create Backup')}
            </button>
            {backupMsg && <div style={{marginTop:8,fontSize:12,color:'var(--on-surface-variant)',textAlign:'center'}}>{backupMsg}</div>}
          </div>
        </div>

        {backups.length > 0 && <div className="glass-panel liquid-glass-high" style={{padding:20,marginTop:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span className="material-symbols-outlined" style={{fontSize:18,color:'var(--neon-cyan)'}}>folder_open</span>
            <span style={{fontSize:14,fontWeight:700}}>{l==='ru'?'Сохранённые бэкапы реестра':'Saved Registry Backups'}</span>
          </div>
          {backups.map((b:any,i:number)=><div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderRadius:10,marginBottom:6,background:'var(--card-inset-bg)',border:'1px solid var(--card-inset-border)'}}>
            <div><div style={{fontSize:12,fontWeight:600,color:'var(--on-surface)'}}>{b.name}</div><div style={{fontSize:10,color:'var(--outline)',marginTop:2}}>{b.sizeMB} MB</div></div>
            <div style={{display:'flex',gap:6}}>
              <button className="glass-btn-ghost" onClick={()=>handleRestoreReg(b.path)} style={{padding:'4px 10px',fontSize:10}} title={l==='ru'?'Восстановить':'Restore'}>
                <span className="material-symbols-outlined" style={{fontSize:14}}>settings_backup_restore</span>
              </button>
              <button className="glass-btn-ghost" onClick={()=>ipc.openFolder(b.path)} style={{padding:'4px 10px',fontSize:10}} title={l==='ru'?'Открыть папку':'Open folder'}>
                <span className="material-symbols-outlined" style={{fontSize:14}}>folder_open</span>
              </button>
            </div>
          </div>)}
        </div>}

        <div className="glass-panel liquid-glass-high" style={{padding:20,marginTop:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span className="material-symbols-outlined" style={{fontSize:18,color:'var(--neon-cyan)'}}>history</span>
              <span style={{fontSize:14,fontWeight:700}}>{l==='ru'?'Точки восстановления':'Restore Points'}</span>
            </div>
            <button className="glass-btn-ghost" onClick={loadBackupData} disabled={rpLoading} style={{padding:'4px 10px',fontSize:10}}>
              <span className="material-symbols-outlined" style={{fontSize:14}}>{rpLoading?'progress_activity':'refresh'}</span>
            </button>
          </div>
          {rpLoading ? <div style={{textAlign:'center',padding:30,color:'var(--outline)'}}><span className="material-symbols-outlined" style={{fontSize:24,animation:'spin 1s linear infinite'}}>progress_activity</span></div>
          : restorePoints.length===0 ? <div style={{textAlign:'center',padding:30,color:'var(--outline)',fontSize:12}}>{l==='ru'?'Точки восстановления не найдены':'No restore points found'}</div>
          : <div style={{position:'relative',paddingLeft:24}}>
              <div style={{position:'absolute',left:8,top:8,bottom:8,width:2,background:'linear-gradient(180deg,var(--neon-cyan),var(--neon-teal),transparent)',borderRadius:2}}/>
              {restorePoints.map((rp:any,i:number)=><div key={i} style={{position:'relative',marginBottom:12,paddingLeft:16}}>
                <div style={{position:'absolute',left:-20,top:6,width:10,height:10,borderRadius:'50%',background:'var(--neon-cyan)',boxShadow:'0 0 8px rgba(0,242,255,0.3)',border:'2px solid var(--surface-container)'}}/>
                <div style={{padding:'10px 14px',borderRadius:10,background:'var(--card-inset-bg)',border:'1px solid var(--card-inset-border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--on-surface)'}}>{rp.description}</div>
                    <div style={{display:'flex',gap:12,marginTop:4}}>
                      <span style={{fontSize:10,color:'var(--outline)'}}>{rp.creationTime}</span>
                      <span style={{fontSize:10,color:'var(--neon-cyan)'}}>#{rp.sequenceNumber}</span>
                    </div>
                  </div>
                  <button className="glass-btn-ghost" onClick={()=>handleRestoreSystem(rp.sequenceNumber,rp.description)} style={{padding:'4px 10px',fontSize:10}} title={l==='ru'?'Восстановить систему':'Restore system'}>
                    <span className="material-symbols-outlined" style={{fontSize:14}}>settings_backup_restore</span>
                  </button>
                </div>
              </div>)}
            </div>}
        </div>
      </div>)}

      {/* @keyframes spin is defined in animations.css */}
    </div>
  )
}

export default SystemMaintenance
