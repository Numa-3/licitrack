# LiciTrack Worker - Setup para Windows Server
# Ejecutar en PowerShell como Administrador:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   C:\setup-server.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LiciTrack Worker - Setup Servidor" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. Instalar Node.js ---
$nodeOk = $false
try { node --version | Out-Null; $nodeOk = $true } catch {}

if ($nodeOk) {
    $v = node --version
    Write-Host "Node.js ya instalado: $v" -ForegroundColor Green
} else {
    Write-Host "Instalando Node.js 22 LTS..." -ForegroundColor Yellow
    $installer = "$env:TEMP\node.msi"
    (New-Object Net.WebClient).DownloadFile("https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi", $installer)
    Start-Process msiexec.exe -ArgumentList "/i `"$installer`" /qn" -Wait
    Remove-Item $installer
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "Node.js instalado" -ForegroundColor Green
}

# --- 2. Instalar Git ---
$gitOk = $false
try { git --version | Out-Null; $gitOk = $true } catch {}

if ($gitOk) {
    Write-Host "Git ya instalado" -ForegroundColor Green
} else {
    Write-Host "Instalando Git..." -ForegroundColor Yellow
    $installer = "$env:TEMP\git.exe"
    (New-Object Net.WebClient).DownloadFile("https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe", $installer)
    Start-Process $installer -ArgumentList "/VERYSILENT /NORESTART" -Wait
    Remove-Item $installer
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "Git instalado" -ForegroundColor Green
}

# --- 3. Clonar repo ---
$dir = "C:\licitrack"
if (Test-Path "$dir\worker\package.json") {
    Write-Host "Repo ya existe - actualizando..." -ForegroundColor Yellow
    Set-Location $dir
    git pull origin main
} else {
    Write-Host "Clonando repo..." -ForegroundColor Yellow
    git clone https://github.com/Numa-3/licitrack.git $dir
    Write-Host "Repo clonado" -ForegroundColor Green
}

Set-Location "$dir\worker"

# --- 4. Dependencias ---
Write-Host "Instalando dependencias npm..." -ForegroundColor Yellow
npm install
Write-Host "Instalando Playwright Chromium..." -ForegroundColor Yellow
npx playwright install chromium
Write-Host "Dependencias listas" -ForegroundColor Green

# --- 5. Crear .env ---
$envFile = "$dir\worker\.env"
if (Test-Path $envFile) {
    Write-Host ".env ya existe - no se sobreescribe" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Ingresa las variables de configuracion:" -ForegroundColor Cyan
    $a = Read-Host "SUPABASE_URL"
    $b = Read-Host "SUPABASE_SERVICE_ROLE_KEY"
    $c = Read-Host "CAPSOLVER_API_KEY"
    $d = Read-Host "SECOP_ENCRYPTION_KEY"
    $content = "SUPABASE_URL=$a`r`nSUPABASE_SERVICE_ROLE_KEY=$b`r`nCAPSOLVER_API_KEY=$c`r`nSECOP_ENCRYPTION_KEY=$d`r`nMONITOR_INTERVAL_MS=3600000`r`nDELAY_BETWEEN_REQUESTS_MS=3000"
    Set-Content -Path $envFile -Value $content
    Write-Host ".env creado" -ForegroundColor Green
}

# --- 6. Instalar PM2 ---
Write-Host "Instalando PM2..." -ForegroundColor Yellow
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install

# --- 7. Iniciar worker ---
Write-Host "Iniciando worker..." -ForegroundColor Yellow
Set-Location "$dir\worker"
pm2 start "npx tsx src/index.ts -- --loop" --name licitrack-worker
pm2 save

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  LISTO! Worker corriendo 24/7" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Comandos utiles:" -ForegroundColor Yellow
Write-Host "  pm2 status" -ForegroundColor White
Write-Host "  pm2 logs licitrack-worker" -ForegroundColor White
Write-Host "  pm2 restart licitrack-worker" -ForegroundColor White
