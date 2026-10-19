import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MB = 1024 * 1024
const MAX_TOTAL_BYTES = 60 * MB
const MAX_FILE_BYTES = { music: 5 * MB, ambient: 3 * MB }
const LICENSES = ['CC0', 'generated']
const CREDIT_FIELDS = ['file', 'title', 'author', 'sourceUrl', 'license']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const sourceSoundsDir = path.join(projectRoot, 'public', 'sounds')
const distSoundsDir = path.join(projectRoot, 'dist', 'sounds')
const creditsPath = path.join(projectRoot, 'src', 'features', 'timer', 'soundCredits.json')

function formatMb(bytes) {
  return `${(bytes / MB).toFixed(2)} MB`
}

// public/sounds 기준 상대 경로(`/` 구분)와 크기를 재귀로 모은다
async function listMp3Files(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mp3'))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()
  return Promise.all(files.map(async (file) => ({ file, bytes: (await stat(path.join(root, file))).size })))
}

async function dirExists(dir) {
  try {
    return (await stat(dir)).isDirectory()
  } catch {
    return false
  }
}

function sumBytes(files) {
  return files.reduce((sum, item) => sum + item.bytes, 0)
}

async function main() {
  const errors = []
  const sources = await listMp3Files(sourceSoundsDir)
  const credits = JSON.parse(await readFile(creditsPath, 'utf8'))
  if (!Array.isArray(credits)) throw new Error('soundCredits.json must be an array.')

  credits.forEach((credit, index) => {
    for (const field of CREDIT_FIELDS) {
      if (typeof credit?.[field] !== 'string' || credit[field].trim() === '') {
        errors.push(`Credit #${index} has empty field: ${field}`)
      }
    }
    if (credit?.license && !LICENSES.includes(credit.license)) {
      errors.push(`Credit for ${credit.file} has invalid license: ${credit.license}`)
    }
  })

  const sourceSet = new Set(sources.map((item) => item.file))
  const creditSet = new Set(credits.map((credit) => credit?.file))
  for (const file of sourceSet) if (!creditSet.has(file)) errors.push(`Missing credit: ${file}`)
  for (const file of creditSet) if (!sourceSet.has(file)) errors.push(`Credit for missing file: ${file}`)

  for (const { file, bytes } of sources) {
    const limit = MAX_FILE_BYTES[file.split('/')[0]]
    if (limit === undefined) errors.push(`Sound outside music/ or ambient/: ${file}`)
    else if (bytes > limit) errors.push(`Too large: ${file} ${formatMb(bytes)} > ${formatMb(limit)}`)
  }

  const sourceBytes = sumBytes(sources)
  if (sourceBytes > MAX_TOTAL_BYTES) {
    errors.push(`Sound assets exceed limit: ${formatMb(sourceBytes)} > ${formatMb(MAX_TOTAL_BYTES)}`)
  }

  if (await dirExists(distSoundsDir)) {
    const built = await listMp3Files(distSoundsDir)
    if (built.length !== sources.length || sumBytes(built) !== sourceBytes) {
      errors.push(
        `Built sounds (${built.length} files, ${formatMb(sumBytes(built))}) do not match source (${sources.length} files, ${formatMb(sourceBytes)})`,
      )
    }
  }

  if (errors.length > 0) throw new Error(`\n  ${errors.join('\n  ')}`)
  console.log(`[check-sounds] ${sources.length} files, ${formatMb(sourceBytes)} total`)
}

main().catch((error) => {
  console.error('[check-sounds] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
