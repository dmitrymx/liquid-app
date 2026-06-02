/**
 * Network Tools — IP Info, Speed Test, Anonymity Check
 * Premium glassmorphism UI with animated gauges and real-time feedback
 */
import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '../lib/ipc'

/* ── Country flag emoji from country code ── */
const flag = (code: string) => {
  if (!code || code.length !== 2) return '🌐'
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0))
  )
}

const NetworkTools: React.FC = () => {
  const { t, i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  /* ── IP ── */
  const [ipData, setIpData] = useState<any>(null)
  const [ipLoading, setIpLoading] = useState(false)
  /* ── Speed ── */
  const [speedResult, setSpeedResult] = useState<any>(null)
  const [speedLoading, setSpeedLoading] = useState(false)
  const [speedProgress, setSpeedProgress] = useState(0)
  /* ── Anonymity ── */
  const [anonData, setAnonData] = useState<any>(null)
  const [anonLoading, setAnonLoading] = useState(false)
  /* ── WebRTC ── */
  const [webRtcIps, setWebRtcIps] = useState<string[]>([])
  
  /* ── Network Reset ── */
  const [resetLog, setResetLog] = useState<string[]>([])
  const [resetRunning, setResetRunning] = useState(false)
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const resetLogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resetLogRef.current) {
      resetLogRef.current.scrollTop = resetLogRef.current.scrollHeight
    }
  }, [resetLog])


  /* Auto-load IP on mount */
  useEffect(() => { fetchIp() }, [])

  const fetchIp = async () => {
    setIpLoading(true)
    try {
      const data = await ipc.getIpInfo()
      setIpData(data)
    } catch { setIpData({ error: 'Failed' }) }
    setIpLoading(false)
  }

  const runSpeed = async () => {
    setSpeedLoading(true)
    setSpeedResult(null)
    setSpeedProgress(0)
    
    /* Subscribe to real-time progress events from the backend */
    const unsubscribe = ipc.onSpeedTestProgress((data) => {
      setSpeedProgress(data.percent)
      if (data.mbps > 0) {
        setSpeedResult({ downloadMbps: data.mbps, latencyMs: 0, jitterMs: 0, serverLocation: '' })
      }
    })

    try {
      const data = await ipc.runSpeedTest()
      setSpeedResult(data)
      setSpeedProgress(100)
    } catch { setSpeedResult({ error: 'Failed' }) }
    
    unsubscribe()
    setSpeedLoading(false)
  }

  const checkAnon = async () => {
    setAnonLoading(true)
    try {
      const data = await ipc.checkAnonymity()
      setAnonData(data)
    } catch { setAnonData({ error: 'Failed' }) }
    setAnonLoading(false)
    /* WebRTC leak test (client-side) */
    testWebRtc()
  }

  const isPrivateIp = (ip: string) => {
    return ip.startsWith('10.') ||
           ip.startsWith('192.168.') ||
           ip.startsWith('169.254.') ||
           /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) ||
           ip.startsWith('127.')
  }

  const testWebRtc = () => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      const ips: string[] = []
      pc.createDataChannel('')
      pc.createOffer().then(o => pc.setLocalDescription(o))
      pc.onicecandidate = (e) => {
        if (!e.candidate) { pc.close(); setWebRtcIps(ips); return }
        const parts = e.candidate.candidate.split(' ')
        const ip = parts[4]
        /* Only flag public IPs — private/LAN addresses are NOT leaks */
        if (ip && !ips.includes(ip) && !ip.includes(':') && ip !== '0.0.0.0' && !isPrivateIp(ip)) {
          ips.push(ip)
        }
      }
      setTimeout(() => { try { pc.close() } catch {} setWebRtcIps(ips) }, 3000)
    } catch { /* WebRTC not available */ }
  }

  const runReset = async () => {
    const confirmMsg = isRu 
      ? 'Вы действительно хотите выполнить сброс параметров сети? Это временно прервет ваше подключение к интернету.' 
      : 'Are you sure you want to reset network parameters? This will temporarily interrupt your internet connection.'
    if (!confirm(confirmMsg)) return

    setResetRunning(true)
    setResetStatus('idle')
    setResetLog([isRu ? '[START] Запуск процесса восстановления сети...' : '[START] Launching network restoration...'])

    try {
      const res = await ipc.resetNetwork()
      setResetLog(res.log || [])
      setResetStatus(res.success ? 'success' : 'error')
    } catch (err: any) {
      setResetLog(prev => [...prev, `[ERR] ${err.message || err}`])
      setResetStatus('error')
    }
    setResetRunning(false)
  }

  /* ── Reusable components ── */
  const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
    <div className="glass-panel liquid-glass-high" style={{ padding: 24, ...style }}>{children}</div>
  )

  const CardHeader: React.FC<{ icon: string; title: string; action?: React.ReactNode }> = ({ icon, title, action }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--neon-cyan)' }}>{icon}</span>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h3>
      </div>
      {action}
    </div>
  )

  const InfoRow: React.FC<{ label: string; value: string; accent?: boolean; mono?: boolean }> = ({ label, value, accent, mono }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'
    }}>
      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 600,
        color: accent ? 'var(--neon-cyan)' : 'var(--on-surface)',
        fontFamily: mono ? 'monospace' : 'inherit'
      }}>{value}</span>
    </div>
  )

  const StatusBadge: React.FC<{ ok: boolean; labelOk: string; labelBad: string }> = ({ ok, labelOk, labelBad }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: ok ? 'rgba(0, 200, 100, 0.1)' : 'rgba(255, 80, 80, 0.1)',
      border: `1px solid ${ok ? 'rgba(0, 200, 100, 0.3)' : 'rgba(255, 80, 80, 0.3)'}`,
      color: ok ? '#15ffd1' : '#ff5555'
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{ok ? 'check_circle' : 'warning'}</span>
      {ok ? labelOk : labelBad}
    </span>
  )

  const SmallBtn: React.FC<{ onClick: () => void; loading: boolean; icon: string; label: string }> = ({ onClick, loading, icon, label }) => (
    <button className="glass-btn-ghost" onClick={onClick} disabled={loading}
      style={{ padding: '6px 14px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{loading ? 'progress_activity' : icon}</span>
      {label}
    </button>
  )

  /* Speed gauge arc */
  const SpeedGauge: React.FC<{ mbps: number }> = ({ mbps }) => {
    const maxMbps = 200
    const pct = Math.min(mbps / maxMbps, 1)
    const dashLen = 251 * pct
    const color = mbps > 50 ? '#15ffd1' : mbps > 20 ? '#00f2ff' : mbps > 5 ? '#ffbe3c' : '#ff4444'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width="140" height="80" viewBox="0 0 140 80">
          <path d="M 10 75 A 60 60 0 0 1 130 75" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeLinecap="round" />
          <path d="M 10 75 A 60 60 0 0 1 130 75" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${dashLen} 251`}
            style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s' }} />
        </svg>
        <div style={{ marginTop: -20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
            {mbps.toFixed(1)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--outline)', marginTop: 2 }}>Mbps</div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1>{t('network.title')}</h1>
        <p>{t('network.subtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── IP INFO ── */}
        <Card>
          <CardHeader icon="language" title={t('network.ipInfo')}
            action={<SmallBtn onClick={fetchIp} loading={ipLoading} icon="refresh" label={t('network.refresh')} />}
          />
          {ipLoading ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--outline)' }}>
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28 }}>progress_activity</span>
            </div>
          ) : ipData?.error ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#ff5555' }}>{ipData.error}</div>
          ) : ipData ? (
            <>
              {/* Big IP display */}
              <div style={{
                textAlign: 'center', padding: '16px 0 12px',
                borderRadius: 12, background: 'rgba(0, 242, 255, 0.04)',
                border: '1px solid rgba(0, 242, 255, 0.08)', marginBottom: 12
              }}>
                <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  {t('network.ipAddress')}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: 'var(--neon-cyan)', letterSpacing: '0.02em' }}>
                  {ipData.ip}
                </div>
              </div>
              <InfoRow label={t('network.country')} value={`${flag(ipData.countryCode)} ${ipData.country}`} accent />
              <InfoRow label={t('network.region')} value={ipData.region || '—'} />
              <InfoRow label={t('network.city')} value={ipData.city || '—'} />
              <InfoRow label={t('network.isp')} value={ipData.isp || '—'} accent />
              <InfoRow label={t('network.org')} value={ipData.org || '—'} />
              <InfoRow label={t('network.timezone')} value={ipData.timezone || '—'} />
              <InfoRow label={t('network.coordinates')} value={ipData.lat && ipData.lon ? `${ipData.lat}, ${ipData.lon}` : '—'} mono />
            </>
          ) : null}
        </Card>

        {/* ── SPEED TEST ── */}
        <Card>
          <CardHeader icon="speed" title={t('network.speedTest')} />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {speedResult && !speedResult.error ? (
              <SpeedGauge mbps={speedResult.downloadMbps} />
            ) : (
              <SpeedGauge mbps={0} />
            )}
          </div>

          {/* Progress bar */}
          {speedLoading && (
            <div style={{ margin: '12px 0' }}>
              <div style={{
                width: '100%', height: 3, borderRadius: 2,
                background: 'rgba(255,255,255,0.05)', overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'linear-gradient(90deg, #00f2ff, #15ffd1)',
                  width: `${speedProgress}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--outline)', textAlign: 'center', marginTop: 4 }}>
                {t('network.testing')} {Math.round(speedProgress)}%
              </div>
            </div>
          )}

          {/* Results */}
          {speedResult && !speedResult.error && (
            <div style={{ marginTop: 12 }}>
              <InfoRow label={t('network.download')} value={`${speedResult.downloadMbps} Mbps`} accent />
              <InfoRow label={t('network.latency')} value={`${speedResult.latencyMs} ms`} />
              <InfoRow label={t('network.jitter')} value={`${speedResult.jitterMs} ms`} />
              <InfoRow label={t('network.server')} value={speedResult.serverLocation || 'CDN'} />
            </div>
          )}
          {speedResult?.error && (
            <div style={{ textAlign: 'center', padding: 16, color: '#ff5555', fontSize: 12 }}>{speedResult.error}</div>
          )}

          <button className="glass-btn-primary" onClick={runSpeed} disabled={speedLoading}
            style={{ width: '100%', marginTop: 16, padding: '10px', fontSize: 13 }}>
            {speedLoading ? (
              <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span> {t('network.testing')}</>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>speed</span> {t('network.startTest')}</>
            )}
          </button>
        </Card>

        {/* ── ANONYMITY CHECK ── full-width */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardHeader icon="shield" title={t('network.anonymity')}
            action={<SmallBtn onClick={checkAnon} loading={anonLoading} icon="verified_user" label={t('network.checkAnonymity')} />}
          />

          {anonLoading ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--outline)' }}>
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28 }}>progress_activity</span>
              <div style={{ marginTop: 8, fontSize: 12 }}>{t('network.checking')}</div>
            </div>
          ) : anonData && !anonData.error ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {/* Status cards */}
              {[
                { label: 'VPN', ok: anonData.isVpn, okText: t('network.vpnDetected'), badText: t('network.vpnNotDetected'), icon: 'vpn_lock' },
                { label: 'Proxy', ok: anonData.isProxy, okText: t('network.proxyDetected'), badText: t('network.proxyNotDetected'), icon: 'public' },
                { label: 'Tor', ok: anonData.isTor, okText: t('network.torDetected'), badText: t('network.torNotDetected'), icon: 'security' },
                { label: 'IP', ok: !anonData.isHosting, okText: t('network.residentialIp'), badText: t('network.hostingIp'), icon: 'home' },
              ].map(item => (
                <div key={item.label} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(0,0,0,0.15)',
                  border: `1px solid ${item.ok ? 'rgba(0, 200, 100, 0.15)' : 'rgba(255,255,255,0.04)'}`,
                  display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: 20,
                    color: item.ok ? '#15ffd1' : 'var(--on-surface-variant)'
                  }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, marginTop: 2,
                      color: item.ok ? '#15ffd1' : 'var(--on-surface-variant)'
                    }}>{item.ok ? item.okText : item.badText}</div>
                  </div>
                </div>
              ))}

              {/* WebRTC */}
              <div style={{
                padding: '14px 16px', borderRadius: 12,
                background: 'rgba(0,0,0,0.15)',
                border: `1px solid ${webRtcIps.length > 0 ? 'rgba(255, 80, 80, 0.2)' : 'rgba(0, 200, 100, 0.15)'}`,
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                <span className="material-symbols-outlined" style={{
                  fontSize: 20,
                  color: webRtcIps.length > 0 ? '#ff5555' : '#15ffd1'
                }}>leak_add</span>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('network.webRtcLeak')}</div>
                  <div style={{
                    fontSize: 12, fontWeight: 600, marginTop: 2,
                    color: webRtcIps.length > 0 ? '#ff5555' : '#15ffd1'
                  }}>
                    {webRtcIps.length > 0
                      ? `⚠️ ${webRtcIps.join(', ')}`
                      : `✅ ${t('network.protected')}`}
                  </div>
                </div>
              </div>

              {/* DNS + Reverse */}
              <div style={{
                padding: '14px 16px', borderRadius: 12,
                background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-cyan)' }}>dns</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('network.dnsServers')}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--on-surface)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {anonData.dnsServers?.slice(0, 3).join(', ') || '—'}
                  </div>
                </div>
              </div>

              <div style={{
                padding: '14px 16px', borderRadius: 12,
                background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--neon-cyan)' }}>travel_explore</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('network.reverseHost')}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--on-surface)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {anonData.reverseHost || '—'}
                  </div>
                </div>
              </div>
            </div>
          ) : anonData?.error ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#ff5555', fontSize: 12 }}>{anonData.error}</div>
          ) : (
            <div style={{
              textAlign: 'center', padding: 30, color: 'var(--outline)', fontSize: 12
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.3 }}>verified_user</span>
              {t('network.notTested')}
            </div>
          )}
        </Card>

        {/* ── NETWORK RESET ── full-width */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardHeader icon="construction" title={isRu ? 'Восстановление и сброс сети' : 'Network Repair & Reset'} />
          <div style={{ display: 'flex', gap: 24, flexDirection: 'row', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: 0 }}>
                {isRu ? 'Очищает кэш DNS (DNS Cache), сбрасывает стек сетевых протоколов TCP/IP и каталог Winsock. Помогает восстановить интернет-подключение при сбоях и ошибках сети, очищает мусорные маршруты и обновляет локальный IP-адрес.'
                      : 'Clears DNS Resolver Cache, resets the TCP/IP stack policies, and rebuilds Winsock catalog. Helps fix connectivity issues, DNS failures, or invalid routing parameters.'}
              </p>
              <button 
                className="glass-btn-primary" 
                onClick={runReset} 
                disabled={resetRunning}
                style={{ marginTop: 20, padding: '12px 24px', fontSize: 13 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, animation: resetRunning ? 'spin 1s linear infinite' : 'none', marginRight: 8, verticalAlign: 'middle' }}>
                  {resetRunning ? 'progress_activity' : 'construction'}
                </span>
                {resetRunning ? (isRu ? 'Сброс параметров...' : 'Resetting network...') : (isRu ? 'Запустить сброс сети' : 'Run Network Reset')}
              </button>
            </div>
            
            {resetLog.length > 0 && (
              <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--on-surface)' }}>
                  {isRu ? 'Журнал выполнения:' : 'Execution log:'}
                </div>
                <div 
                  ref={resetLogRef}
                  style={{
                    height: 140, overflowY: 'auto', padding: 12, borderRadius: 8,
                    background: 'var(--card-inset-bg)', fontFamily: 'Consolas, monospace',
                    fontSize: 11, color: 'var(--on-surface-variant)', lineHeight: 1.6,
                    border: '1px solid var(--card-inset-border)'
                  }}
                >
                  {resetLog.map((line, i) => (
                    <div key={i} style={{ color: line.startsWith('[ERR]') ? 'var(--badge-danger-text)' : line.startsWith('[START]') ? 'var(--neon-cyan)' : undefined }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default NetworkTools
