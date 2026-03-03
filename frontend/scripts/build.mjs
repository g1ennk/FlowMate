import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`))
    })
  })
}

async function main() {
  const viteArgs = process.argv.slice(2)

  await run('pnpm', ['exec', 'tsc', '-b'])
  await run('pnpm', ['exec', 'vite', 'build', ...viteArgs])
  await run('node', ['./scripts/check-sound-assets.mjs'])
}

main().catch((error) => {
  console.error('[build] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
