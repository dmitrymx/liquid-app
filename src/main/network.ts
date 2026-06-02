/**
 * Network Tools Service — IP Info, Speed Test, Anonymity Checks
 * Uses free APIs: ip-api.com (no key), Cloudflare CDN for speed test
 */
import https from 'https'
import http from 'http'
import dns from 'dns'
import { promisify } from 'util'

const dnsResolve = promisify(dns.resolve4)

export interface IpInfo {
  ip: string
  country: string
  countryCode: string
  region: string
  city: string
  zip: string
  lat: number
  lon: number
  timezone: string
  isp: string
  org: string
  as: string
  query: string
}

export interface SpeedTestResult {
  downloadMbps: number
  latencyMs: number
  jitterMs: number
  serverLocation: string
}

export interface AnonymityResult {
  isVpn: boolean
  isProxy: boolean
  isTor: boolean
  isHosting: boolean
  dnsServers: string[]
  webRtcLeak: boolean | null
  publicIp: string
  reverseHost: string
}

/** Simple HTTPS GET returning JSON */
function httpGet(url: string, timeout = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const req = proto.get(url, { timeout }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve(data) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

/** Simple HTTP download measuring throughput */
function measureDownload(
  url: string,
  durationMs = 5000,
  onSpeedUpdate?: (mbps: number) => void
): Promise<{ bytesReceived: number; elapsed: number; latency: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    let firstByte = 0
    let bytesReceived = 0
    const proto = url.startsWith('https') ? https : http
    const req = proto.get(url, { timeout: durationMs + 2000 }, (res) => {
      res.on('data', chunk => {
        if (!firstByte) firstByte = Date.now()
        bytesReceived += chunk.length
        const elapsed = Date.now() - start
        if (elapsed > 200 && onSpeedUpdate) {
          const speedMbps = (bytesReceived * 8) / (elapsed / 1000) / 1_000_000
          onSpeedUpdate(speedMbps)
        }
        if (Date.now() - start > durationMs) {
          res.destroy()
        }
      })
      res.on('end', () => {
        resolve({
          bytesReceived,
          elapsed: Date.now() - start,
          mono: true, // dummy line to align
          latency: firstByte ? firstByte - start : 0
        } as any)
      })
      res.on('close', () => {
        resolve({
          bytesReceived,
          elapsed: Date.now() - start,
          latency: firstByte ? firstByte - start : 0
        })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

/** Get IP geolocation info */
export async function getIpInfo(): Promise<IpInfo | { error: string }> {
  try {
    const data = await httpGet('http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query')
    if (data.status === 'fail') return { error: data.message || 'API error' }
    return {
      ip: data.query,
      country: data.country,
      countryCode: data.countryCode,
      region: data.regionName || data.region,
      city: data.city,
      zip: data.zip,
      lat: data.lat,
      lon: data.lon,
      timezone: data.timezone,
      isp: data.isp,
      org: data.org,
      as: data.as,
      query: data.query
    }
  } catch (err) {
    return { error: `Failed to get IP: ${String(err)}` }
  }
}

/** Run a simple download speed test using public speed test servers */
export async function runSpeedTest(onProgress?: (pct: number, mbps?: number) => void): Promise<SpeedTestResult | { error: string }> {
  try {
    /* Step 1: Measure latency with HTTPS requests to Cloudflare CDN
       (ip-api.com is HTTP-only and rate-limited to 45 req/min) */
    const latencies: number[] = []
    for (let i = 0; i < 3; i++) {
      const start = Date.now()
      await httpGet(`https://www.cloudflare.com/cdn-cgi/trace?_t=${Date.now()}`)
      latencies.push(Date.now() - start)
    }
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    const jitter = Math.round(Math.max(...latencies) - Math.min(...latencies))

    if (onProgress) onProgress(20, 0)

    /* Step 2: Download speed — use reliable public test servers.
       Selectel (RU, HTTPS) → Hetzner (EU, HTTPS) → Tele2 (global, HTTP).
       speed.cloudflare.com/__down is NOT used: blocked by bot protection (403). */
    const testUrls = [
      { url: 'https://speedtest.selectel.ru/10MB', server: 'Selectel (RU)' },
      { url: 'https://ash-speed.hetzner.com/100MB.bin', server: 'Hetzner (EU)' },
      { url: 'http://speedtest.tele2.net/10MB.zip', server: 'Tele2 (Global)' },
    ]

    let bestSpeed = 0
    let bestServer = 'N/A'
    let tested = 0

    for (const { url, server } of testUrls) {
      try {
        const result = await measureDownload(url, 5000, (currentMbps) => {
          if (onProgress) {
            const pct = Math.round(20 + (tested / testUrls.length) * 70)
            onProgress(pct, currentMbps)
          }
        })
        if (result.bytesReceived > 0) {
          const speedMbps = (result.bytesReceived * 8) / (result.elapsed / 1000) / 1_000_000
          if (speedMbps > bestSpeed) {
            bestSpeed = speedMbps
            bestServer = server
          }
        }
        tested++
        if (onProgress) onProgress(20 + (tested / testUrls.length) * 70, bestSpeed)
        if (bestSpeed > 0) break /* Good enough if we got at least one measurement */
      } catch { /* try next */ }
    }

    if (onProgress) onProgress(100, bestSpeed)

    return {
      downloadMbps: Math.round(bestSpeed * 10) / 10,
      latencyMs: avgLatency,
      jitterMs: jitter,
      serverLocation: bestServer
    }
  } catch (err) {
    return { error: `Speed test error: ${String(err)}` }
  }
}

/** Check anonymity — VPN/Proxy/Tor detection via free APIs */
export async function checkAnonymity(): Promise<AnonymityResult | { error: string }> {
  try {
    /* Get IP info first */
    const ipData = await httpGet('http://ip-api.com/json/?fields=query,isp,org,as,hosting,proxy')

    const publicIp = ipData.query || '—'
    const isHosting = ipData.hosting === true
    const isProxy = ipData.proxy === true

    /* Check DNS servers */
    let dnsServers: string[] = []
    try {
      dnsServers = dns.getServers()
    } catch { /* skip */ }

    /* Reverse DNS lookup */
    let reverseHost = '—'
    try {
      const dnsReverse = promisify(dns.reverse)
      const hosts = await dnsReverse(publicIp)
      if (hosts && hosts.length > 0) reverseHost = hosts[0]
    } catch { /* no PTR record */ }

    /* Heuristic VPN/Tor detection based on ISP/org names */
    const orgLower = ((ipData.org || '') + ' ' + (ipData.isp || '') + ' ' + (ipData.as || '')).toLowerCase()
    const vpnKeywords = [
      'vpn', 'tunnel', 'private', 'mullvad', 'express', 'nord', 'proton',
      'surfshark', 'wireguard', 'warp', 'cloudflare', 'xorek', 'servers tech',
      'data center', 'datacenter', 'hostwind', 'vless', 'xtls', 'shadow',
      'psiphon', 'lantern', 'outline', 'anyconnect', 'openvpn', 'ipsec',
      'hide.me', 'cyberghost', 'private internet', 'pia', 'ivpn',
      'fzco', 'llc', 'gmbh', 'limited', 'hosting', 'server', 'cloud',
      'hetzner', 'digitalocean', 'linode', 'vultr', 'ovh', 'scaleway',
      'aeza', 'timeweb', 'selectel', 'reg.ru', 'firstbyte'
    ]
    const torKeywords = ['tor', 'exit node', 'relay', 'onion']
    const isVpn = vpnKeywords.some(k => orgLower.includes(k)) || isHosting
    const isTor = torKeywords.some(k => orgLower.includes(k))

    return {
      isVpn,
      isProxy,
      isTor,
      isHosting,
      dnsServers,
      webRtcLeak: null, /* Can only be detected client-side */
      publicIp,
      reverseHost
    }
  } catch (err) {
    return { error: `Anonymity check error: ${String(err)}` }
  }
}

/** Reset network stack (DNS flush, TCP/IP reset, Winsock reset) */
export async function resetNetwork(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = []
  const { exec } = require('child_process')
  const execAsync = promisify(exec)
  let success = true

  const commands = [
    { cmd: 'ipconfig /flushdns', label: 'Очистка кэша DNS' },
    { cmd: 'netsh winsock reset', label: 'Сброс каталога Winsock' },
    { cmd: 'netsh int ip reset', label: 'Сброс стека TCP/IP' },
    { cmd: 'ipconfig /release', label: 'Освобождение IP-адреса' },
    { cmd: 'ipconfig /renew', label: 'Обновление IP-адреса' }
  ]

  for (const item of commands) {
    try {
      log.push(`[RUN] ${item.label}...`)
      const { stdout } = await execAsync(item.cmd, { timeout: 15000 })
      log.push(stdout.trim() || 'Успешно.')
    } catch (err: any) {
      success = false
      log.push(`[ERR] Ошибка: ${err.message || err}`)
    }
  }

  return { success, log }
}
