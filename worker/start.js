import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const script = join(__dirname, 'src', 'index.ts')

const child = spawn('npx', ['tsx', script, '--loop'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
