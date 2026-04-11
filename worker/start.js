// PM2 entry point for Windows (ESM compatible)
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tsx = join(__dirname, 'node_modules', '.bin', 'tsx.cmd')
const script = join(__dirname, 'src', 'index.ts')

const child = spawn(tsx, [script, '--loop'], {
  stdio: 'inherit',
  cwd: __dirname,
})

child.on('exit', (code) => process.exit(code ?? 0))
