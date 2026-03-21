# LiciTrack

Sistema de tracking de obligaciones para contratos de licitación pública. Gestiona el ciclo completo de compras, logística y servicios por empresa, con integración WhatsApp y facturación electrónica.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **IA**: OpenRouter (clasificación automática de ítems del Excel)
- **Hosting**: Vercel

## Setup local

### 1. Cloná el repositorio

```bash
git clone https://github.com/tu-usuario/licitrack.git
cd licitrack
```

### 2. Instalá dependencias

```bash
npm install
```

### 3. Configurá las variables de entorno

```bash
cp .env.local.example .env.local
```

Abrí `.env.local` y completá los valores:

- `NEXT_PUBLIC_SUPABASE_URL`: URL de tu proyecto Supabase (Settings → API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anon key de tu proyecto Supabase (Settings → API)
- `OPENROUTER_API_KEY`: API key de OpenRouter (para clasificar ítems por IA)
- `LLM_MODEL`: Modelo de IA a usar (default: `qwen/qwen-turbo`)

### 4. Configurá Supabase

Ve al siguiente chat del build-plan para crear las tablas en Supabase.

### 5. Corré el servidor de desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000) en tu navegador.

## Estructura del proyecto

```
licitrack/
├── app/                    # Páginas (Next.js App Router)
│   ├── page.tsx            # Redirect a /dashboard
│   ├── login/              # Login con Supabase Auth
│   ├── dashboard/          # Vista principal + detalle de contrato
│   ├── contracts/new/      # Crear contrato + subir Excel + revisar IA
│   ├── shipments/          # Vista global de envíos
│   ├── activity/           # Feed de actividad (solo jefe)
│   ├── organizations/      # Mis empresas
│   ├── suppliers/          # Proveedores
│   └── invoices/           # Facturas electrónicas
├── components/
│   ├── ui/                 # Botones, inputs, modals, badges
│   └── features/           # Componentes de dominio
├── lib/
│   ├── supabase/           # Cliente de Supabase
│   ├── excel/              # Parseo de Excel con SheetJS
│   └── utils/              # Helpers (moneda COP, fechas, etc.)
└── spec.md                 # Especificación técnica completa
```

## Despliegue

El proyecto se despliega automáticamente en Vercel al hacer push a `main`.

1. Conectá el repositorio en [vercel.com](https://vercel.com)
2. Agregá las variables de entorno en Vercel (Settings → Environment Variables)
3. Cada push a `main` dispara un nuevo deploy

## Documentación

Ver [spec.md](./spec.md) para la especificación técnica completa del proyecto.
