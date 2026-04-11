// PM2 entry point for Windows
// Runs: npx tsx src/index.ts --loop
const { spawn } = require('child_process')
const path = require('path')

const tsx = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd')
const script = path.join(__dirname, 'src', 'index.ts')

const child = spawn(tsx, [script, '--loop'], {
  stdio: 'inherit',
  cwd: __dirname,
})

child.on('exit', (code) => process.exit(code))
