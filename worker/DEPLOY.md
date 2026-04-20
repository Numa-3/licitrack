# Worker — Contexto de Deploy (LEER ANTES DE CAMBIAR ALGO)

> **Para futuras sesiones de IA**: si vas a tocar código del worker, o ayudar al
> usuario a debuggear un problema de discovery/login/monitor, **empezá leyendo
> este documento**. El worker NO corre localmente — vive en un servidor Windows
> físico en la oficina del usuario, y cualquier cambio de código requiere un
> ciclo de deploy específico.

## Dónde corre

| | |
|---|---|
| **Host** | Servidor Windows en la oficina del usuario (no en la cloud) |
| **OS** | Windows Server |
| **Path** | `C:\licitrack\worker` |
| **Proceso** | Servicio Windows gestionado por NSSM: `LiciTrack-Worker` |
| **Log file** | `C:\licitrack\worker\logs\service.log` |
| **Acceso remoto** | El usuario entra por **AnyDesk** a ese servidor |
| **Node** | v22 LTS (instalado por `setup-server.ps1`) |
| **Entrada del servicio** | `start.js` → que ejecuta `tsx src/index.ts --loop` |

El código del repo se actualiza con `git pull` dentro de `C:\licitrack\worker`
y luego se reinicia el servicio con `nssm restart`.

## Comandos que el usuario corre en el servidor (PowerShell como Admin)

```powershell
# Posicionarse
cd C:\licitrack\worker

# Traer código nuevo
git pull

# Reiniciar el servicio para que tome el código nuevo
C:\licitrack\worker\nssm.exe restart LiciTrack-Worker

# Ver últimas N líneas del log (diagnóstico)
Get-Content C:\licitrack\worker\logs\service.log -Tail 300

# Seguir el log en tiempo real
Get-Content C:\licitrack\worker\logs\service.log -Wait -Tail 50

# Estado del servicio
C:\licitrack\worker\nssm.exe status LiciTrack-Worker
```

## Variables de entorno del worker

Están en `C:\licitrack\worker\.env` (archivo local del servidor, NO commiteado).
Las más críticas:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — acceso a la DB
- `SECOP_ENCRYPTION_KEY` — debe ser la **misma** que la del app Next en Vercel,
  si no, no puede desencriptar las passwords que el app guardó
- `CAPSOLVER_API_KEY` — resuelve los reCAPTCHA de SECOP durante el login
- `MONITOR_INTERVAL_MS` — default 3,600,000 (1h) entre ciclos completos
- `DELAY_BETWEEN_REQUESTS_MS` — default 3000, throttling contra SECOP

## Flujo del worker (en modo `--loop`)

```
iniciar
 ↓
runFullCycle()                      ← 1 ciclo completo
 ├── lee secop_accounts activas
 ├── para cada cuenta:
 │    ├── login (si no hay sesión válida) ← captcha aquí
 │    ├── discovery por cada entidad monitoreada
 │    └── si no hay entidades: discovery default (llena discovered_entities)
 └── clear sync_requested_at si estaba seteado
 ↓
runMonitorCycle() (contractual)     ← scrape de 6 tabs por contrato con monitoring_enabled
 ↓
runPrecontractualMonitorCycle()     ← API pública + captcha cuando hay cambios
 ↓
wait MONITOR_INTERVAL_MS (1h default)
 ├── cada 30s durante ese wait:
 │    ├── processPendingSyncs()         ← cuentas con sync_requested_at != null
 │    └── bootstrapNewPrecontractual()  ← procesos con tipo_proceso=precontractual y sin snapshot
 └── (fin del wait)
 ↓
loop → runFullCycle()
```

**Consecuencia práctica**: cuando el usuario pega click a "Descubrir entidades"
en el UI, el efecto no es inmediato — el flag se lee cada 30s durante el wait
intermedio. Si el ciclo completo está en curso, puede demorar más.

## Problemas comunes y dónde mirar

| Síntoma | Primer lugar donde mirar |
|---|---|
| Cuenta nueva queda "Sin sesión" indefinidamente | log de `service.log` → buscar nombre de la cuenta y `[Login]` |
| Discovery "no pasa nada" al hacer click | ¿está `sync_requested_at` seteado? ¿el worker lee el flag? |
| Captcha failing | `[Captcha] CapSolver error:` en el log + estado de CAPSOLVER_API_KEY |
| Worker crasheó | `nssm status LiciTrack-Worker` + stderr del log |
| Sesión expirada recurrente | Probablemente SECOP invalidó cookies, re-login no resuelve → verificar credenciales |

## Lo que el worker **NO** hace

- NO sirve el app Next (eso vive en Vercel en `licitrackk.vercel.app`)
- NO recibe requests HTTP — solo lee/escribe la DB Supabase compartida
- NO tiene UI propia — el feedback es solo logs y cambios en DB

## Si necesitás hacer cambios al código del worker

1. Editás el código en tu Mac local (en `/Users/brandon/Desktop/licitrack/worker`)
2. Commit + push a `main`
3. El usuario desde AnyDesk:
   ```powershell
   cd C:\licitrack\worker
   git pull
   C:\licitrack\worker\nssm.exe restart LiciTrack-Worker
   ```
4. Esperar ~30s y revisar logs

NO hay deploy automatizado del worker — requiere intervención manual del usuario
en el servidor. Si agregás una dependencia npm nueva, también hay que correr
`npm install` en el servidor antes del restart.
