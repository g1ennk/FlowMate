import { access, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_TRACKS = 3
const MAX_BYTES = 15 * 1024 * 1024

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const sourceSoundsDir = path.join(projectRoot, 'public', 'sounds')
const distSoundsDir = path.join(projectRoot, 'dist', 'sounds')
const manifestPath = path.join(sourceSoundsDir, 'asset-manifest.json')

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function listMp3Files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mp3'))
    .map((entry) => entry.name)
    .sort()
}

async function getTotalBytes(dir, files) {
  const sizes = await Promise.all(files.map((file) => stat(path.join(dir, file)).then((item) => item.size)))
  return sizes.reduce((sum, size) => sum + size, 0)
}

async function ensureDirExists(dir) {
  try {
    await access(dir)
    return true
  } catch {
    return false
  }
}

async function main() {
  const [sourceFiles, manifestRaw] = await Promise.all([
    listMp3Files(sourceSoundsDir),
    readFile(manifestPath, 'utf8'),
  ])
  const manifest = JSON.parse(manifestRaw)

  if (!Array.isArray(manifest) || manifest.some((entry) => typeof entry !== 'string')) {
    throw new Error('asset-manifest.json must be an array of filenames.')
  }

  if (sourceFiles.length > MAX_TRACKS) {
    throw new Error(`Too many bundled music tracks: ${sourceFiles.length}. Maximum is ${MAX_TRACKS}.`)
  }

  if (new Set(manifest).size !== manifest.length) {
    throw new Error('asset-manifest.json must not contain duplicate filenames.')
  }

  const missingManifestFiles = sourceFiles.filter(
    (filename) => !manifest.includes(filename),
  )
  if (missingManifestFiles.length > 0) {
    throw new Error(`Missing manifest entries for: ${missingManifestFiles.join(', ')}`)
  }

  const unexpectedManifestFiles = manifest.filter((filename) => !sourceFiles.includes(filename))
  if (unexpectedManifestFiles.length > 0) {
    throw new Error(`Manifest includes missing files: ${unexpectedManifestFiles.join(', ')}`)
  }

  const sourceBytes = await getTotalBytes(sourceSoundsDir, sourceFiles)
  if (sourceBytes > MAX_BYTES) {
    throw new Error(`Source sound assets exceed limit: ${formatMb(sourceBytes)} > ${formatMb(MAX_BYTES)}`)
  }

  const distExists = await ensureDirExists(distSoundsDir)
  if (distExists) {
    const distFiles = await listMp3Files(distSoundsDir)
    const distBytes = await getTotalBytes(distSoundsDir, distFiles)

    if (distFiles.length !== sourceFiles.length) {
      throw new Error(`Built sound assets (${distFiles.length}) do not match source assets (${sourceFiles.length}).`)
    }

    if (distBytes > MAX_BYTES) {
      throw new Error(`Built sound assets exceed limit: ${formatMb(distBytes)} > ${formatMb(MAX_BYTES)}`)
    }
  }

  console.log(`[check-sounds] ${sourceFiles.length} tracks, ${formatMb(sourceBytes)} total`)
}

main().catch((error) => {
  console.error('[check-sounds] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
