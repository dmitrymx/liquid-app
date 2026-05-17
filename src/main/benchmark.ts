/**
 * Benchmark Engine
 * CPU, RAM, Disk performance tests
 * NOTE: All progress messages are in English (technical log format).
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export interface BenchmarkResult {
  type: string
  score: number
  unit: string
  details: Record<string, number | string>
  duration: number
}

type ProgressCallback = (progress: { type: string; percent: number; message: string }) => void

/** CPU Benchmark: Prime Sieve + Matrix Multiply */
async function benchmarkCPU(onProgress: ProgressCallback): Promise<BenchmarkResult> {
  const start = Date.now()
  onProgress({ type: 'cpu', percent: 0, message: 'Starting CPU benchmark...' })

  /* Prime sieve up to 2 million */
  const limit = 2_000_000
  const sieve = new Uint8Array(limit + 1)
  let primeCount = 0
  for (let i = 2; i <= limit; i++) {
    if (sieve[i] === 0) {
      primeCount++
      for (let j = i * 2; j <= limit; j += i) {
        sieve[j] = 1
      }
    }
    if (i % 500000 === 0) {
      onProgress({ type: 'cpu', percent: Math.round((i / limit) * 50), message: `Prime sieve: ${i.toLocaleString()}...` })
    }
  }

  onProgress({ type: 'cpu', percent: 50, message: 'Matrix multiply...' })

  /* Matrix multiply 256x256 */
  const size = 256
  const a = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.random()))
  const b = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.random()))
  const c = Array.from({ length: size }, () => new Array(size).fill(0))

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let sum = 0
      for (let k = 0; k < size; k++) {
        sum += a[i][k] * b[k][j]
      }
      c[i][j] = sum
    }
    if (i % 64 === 0) {
      onProgress({ type: 'cpu', percent: 50 + Math.round((i / size) * 50), message: `Matrix: row ${i}/${size}` })
    }
  }

  const duration = Date.now() - start
  const score = Math.round(10000 / (duration / 1000))

  onProgress({ type: 'cpu', percent: 100, message: 'CPU benchmark complete!' })

  return {
    type: 'cpu',
    score,
    unit: 'pts',
    details: {
      primes: primeCount,
      matrixSize: `${size}x${size}`,
      duration: `${duration}ms`
    },
    duration
  }
}

/** RAM Benchmark: Sequential read/write speed */
async function benchmarkRAM(onProgress: ProgressCallback): Promise<BenchmarkResult> {
  const start = Date.now()
  onProgress({ type: 'ram', percent: 0, message: 'RAM speed test...' })

  const blockSize = 64 * 1024 * 1024 /* 64MB */
  const iterations = 10

  /* Write test */
  const writeStart = Date.now()
  for (let i = 0; i < iterations; i++) {
    const buffer = Buffer.alloc(blockSize, i % 256)
    buffer.fill(0) /* Force allocation */
    onProgress({ type: 'ram', percent: Math.round((i / iterations) * 50), message: `Write: ${i + 1}/${iterations}` })
  }
  const writeTime = Date.now() - writeStart
  const writeBW = (blockSize * iterations) / (writeTime / 1000) / (1024 * 1024 * 1024)

  /* Read test */
  const readStart = Date.now()
  const testBuf = Buffer.alloc(blockSize)
  for (let i = 0; i < iterations; i++) {
    let sum = 0
    for (let j = 0; j < testBuf.length; j += 4096) {
      sum += testBuf[j]
    }
    onProgress({ type: 'ram', percent: 50 + Math.round((i / iterations) * 50), message: `Read: ${i + 1}/${iterations}` })
  }
  const readTime = Date.now() - readStart
  const readBW = (blockSize * iterations) / (readTime / 1000) / (1024 * 1024 * 1024)

  const duration = Date.now() - start
  const score = Math.round((readBW + writeBW) * 100)

  onProgress({ type: 'ram', percent: 100, message: 'RAM benchmark complete!' })

  return {
    type: 'ram',
    score,
    unit: 'pts',
    details: {
      readBW: `${readBW.toFixed(1)} GB/s`,
      writeBW: `${writeBW.toFixed(1)} GB/s`,
      blockSize: '64 MB',
      iterations
    },
    duration
  }
}

/** Disk Benchmark: Sequential write/read */
async function benchmarkDisk(onProgress: ProgressCallback): Promise<BenchmarkResult> {
  const start = Date.now()
  onProgress({ type: 'disk', percent: 0, message: 'Disk speed test...' })

  const tempFile = path.join(os.tmpdir(), `liquid-app-bench-${Date.now()}.tmp`)
  const blockSize = 1024 * 1024 /* 1MB blocks */
  const totalBlocks = 256 /* 256MB total */
  const block = Buffer.alloc(blockSize, 0xAA)

  /* Sequential Write */
  const writeStart = Date.now()
  const fd = await fs.open(tempFile, 'w')
  for (let i = 0; i < totalBlocks; i++) {
    await fd.write(block)
    if (i % 32 === 0) {
      onProgress({ type: 'disk', percent: Math.round((i / totalBlocks) * 50), message: `Write: ${i}/${totalBlocks} MB` })
    }
  }
  await fd.close()
  const writeTime = Date.now() - writeStart
  const writeSpeed = (blockSize * totalBlocks) / (writeTime / 1000) / (1024 * 1024)

  /* Sequential Read */
  const readStart = Date.now()
  const fdRead = await fs.open(tempFile, 'r')
  const readBuf = Buffer.alloc(blockSize)
  for (let i = 0; i < totalBlocks; i++) {
    await fdRead.read(readBuf, 0, blockSize)
    if (i % 32 === 0) {
      onProgress({ type: 'disk', percent: 50 + Math.round((i / totalBlocks) * 50), message: `Read: ${i}/${totalBlocks} MB` })
    }
  }
  await fdRead.close()
  const readTime = Date.now() - readStart
  const readSpeed = (blockSize * totalBlocks) / (readTime / 1000) / (1024 * 1024)

  /* Cleanup */
  try { await fs.unlink(tempFile) } catch { /* ok */ }

  const duration = Date.now() - start
  const score = Math.round((readSpeed + writeSpeed) / 2)

  onProgress({ type: 'disk', percent: 100, message: 'Disk benchmark complete!' })

  return {
    type: 'disk',
    score,
    unit: 'MB/s',
    details: {
      seqRead: `${readSpeed.toFixed(0)} MB/s`,
      seqWrite: `${writeSpeed.toFixed(0)} MB/s`,
      testSize: '256 MB'
    },
    duration
  }
}

/** Run benchmark by type */
export async function runBenchmark(
  type: string,
  onProgress: ProgressCallback
): Promise<BenchmarkResult> {
  switch (type) {
    case 'cpu': return benchmarkCPU(onProgress)
    case 'ram': return benchmarkRAM(onProgress)
    case 'disk': return benchmarkDisk(onProgress)
    default: throw new Error(`Unknown benchmark type: ${type}`)
  }
}
