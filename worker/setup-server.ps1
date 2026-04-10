# ============================================================
# LiciTrack Worker — Setup para Windows 11 Server
# ============================================================
#
# Ejecutar en PowerShell como Administrador:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-server.ps1
#
# Este script:
#   1. Instala Node.js 22 LTS (si no esta instalado)
#   2. Instala Git (si no esta instalado)
#   3. Clona el repo
#   4. Instala dependencias + Playwright Chromium
#   5. Crea el archivo .env
#   6. Instala PM2 y configura auto-start
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LiciTrack Worker — Setup Servidor"     -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Verificar/Instalar Node.js ---
$nodeInstalled = $false
try { $nodeVersion = node --version 2>$null; $nodeInstalled = $true } catch {}

if ($nodeInstalled) {
    Write-Host "[OK] Node.js ya instalado: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "[...] Instalando Node.js 22 LTS..." -ForegroundColor Yellow

    # Descargar instalador
    $nodeUrl = "https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller

    # Instalar silenciosamente
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /qn" -Wait -NoNewWindow
    Remove-Item $nodeInstaller

    # Refrescar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    Write-Host "[OK] Node.js instalado: $(node --version)" -ForegroundColor Green
}

# --- 2. Verificar/Instalar Git ---
$gitInstalled = $false
try { $gitVersion = git --version 2>$null; $gitInstalled = $true } catch {}

if ($gitInstalled) {
    Write-Host "[OK] Git ya instalado: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "[...] Instalando Git..." -ForegroundColor Yellow

    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe"
    $gitInstaller = "$env:TEMP\git-installer.exe"
    Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller

    Start-Process $gitInstaller -ArgumentList "/VERYSILENT /NORESTART" -Wait -NoNewWindow
    Remove-Item $gitInstaller

    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    Write-Host "[OK] Git instalado" -ForegroundColor Green
}

# --- 3. Clonar repo ---
$installDir = "C:\licitrack"

if (Test-Path "$installDir\worker\package.json") {
    Write-Host "[OK] Repo ya existe en $installDir" -ForegroundColor Green
    Set-Location "$installDir\worker"

    Write-Host "[...] Actualizando repo..." -ForegroundColor Yellow
    Set-Location $installDir
    git pull origin main
    Set-Location "$installDir\worker"
} else {
    Write-Host "[...] Clonando repo en $installDir..." -ForegroundColor Yellow
    git clone https://github.com/Numa-3/licitrack.git $installDir
    Set-Location "$installDir\worker"
    Write-Host "[OK] Repo clonado" -ForegroundColor Green
}

# --- 4. Instalar dependencias ---
Write-Host "[...] Instalando dependencias npm..." -ForegroundColor Yellow
npm install
Write-Host "[OK] Dependencias instaladas" -ForegroundColor Green

Write-Host "[...] Instalando Playwright Chromium..." -ForegroundColor Yellow
npx playwright install chromium
Write-Host "[OK] Chromium instalado" -ForegroundColor Green

# --- 5. Crear .env ---
$envFile = "$installDir\worker\.env"

if (Test-Path $envFile) {
    Write-Host "[OK] .env ya existe — no se sobreescribe" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Configuracion de variables .env"       -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Necesitas estos valores (los mismos que usas en tu Mac):" -ForegroundColor Yellow
    Write-Host ""

    $supabaseUrl = Read-Host "SUPABASE_URL"
    $supabaseKey = Read-Host "SUPABASE_SERVICE_ROLE_KEY"
    $capsolverKey = Read-Host "CAPSOLVER_API_KEY"
    $encryptionKey = Read-Host "SECOP_ENCRYPTION_KEY"

    $envContent = @"
# Supabase
SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_ROLE_KEY=$supabaseKey

# CapSolver
CAPSOLVER_API_KEY=$capsolverKey

# Encriptacion
SECOP_ENCRYPTION_KEY=$encryptionKey

# Monitoreo
MONITOR_INTERVAL_MS=3600000
DELAY_BETWEEN_REQUESTS_MS=3000
"@

    Set-Content -Path $envFile -Value $envContent
    Write-Host "[OK] .env creado" -ForegroundColor Green
}

# --- 6. Test rapido ---
Write-Host ""
Write-Host "[...] Verificando que el worker compila..." -ForegroundColor Yellow
npx tsc --noEmit
Write-Host "[OK] TypeScript compila sin errores" -ForegroundColor Green

# --- 7. Instalar PM2 ---
Write-Host "[...] Instalando PM2..." -ForegroundColor Yellow
npm install -g pm2

# Instalar pm2-windows-startup para auto-inicio
npm install -g pm2-windows-startup
pm2-startup install

# --- 8. Iniciar worker ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Iniciando Worker"                      -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location "$installDir\worker"
pm2 start "npx tsx src/index.ts -- --loop" --name licitrack-worker
pm2 save

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  LISTO!"                                -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "El worker esta corriendo 24/7." -ForegroundColor White
Write-Host ""
Write-Host "Comandos utiles:" -ForegroundColor Yellow
Write-Host "  pm2 status                    Ver estado" -ForegroundColor White
Write-Host "  pm2 logs licitrack-worker     Ver logs en vivo" -ForegroundColor White
Write-Host "  pm2 restart licitrack-worker  Reiniciar" -ForegroundColor White
Write-Host "  pm2 stop licitrack-worker     Parar" -ForegroundColor White
Write-Host ""
Write-Host "Para actualizar el worker despues de cambios:" -ForegroundColor Yellow
Write-Host "  cd C:\licitrack && git pull && cd worker && npm install" -ForegroundColor White
Write-Host "  pm2 restart licitrack-worker" -ForegroundColor White
Write-Host ""
