/**
 * Filtros del radar aplicados del lado nuestro a las filas parseadas.
 *
 * El buscador público de SECOP solo permite BUSCAR por descripción (inclusión),
 * no EXCLUIR. Por eso la exclusión por palabra clave (ej. "CONTRATO DE
 * PRESTACION DE SERVICIOS" — personal de régimen especial, no licitaciones) se
 * hace acá tras parsear los resultados.
 *
 * Match insensible a mayúsculas y tildes.
 */
import type { RadarSearchRow } from './parse-search-results.js'

export type RadarFilter = {
  exclude_keywords?: string[]   // descarta si referencia/descripción contiene alguna
  include_keywords?: string[]   // si está, solo pasa si contiene alguna
  min_value?: number | null     // cuantía mínima (COP)
  max_value?: number | null     // cuantía máxima (COP)
}

/** minúsculas, sin tildes, espacios colapsados — para comparar de forma robusta. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿esta fila pasa el filtro (es decir, SÍ nos interesa)? */
export function passesFilter(row: RadarSearchRow, f: RadarFilter): boolean {
  const hay = norm(`${row.referencia ?? ''} ${row.descripcion ?? ''} ${row.entidad ?? ''}`)

  if (f.exclude_keywords?.length) {
    for (const kw of f.exclude_keywords) {
      if (kw && hay.includes(norm(kw))) return false
    }
  }

  if (f.include_keywords?.length) {
    const hit = f.include_keywords.some((kw) => kw && hay.includes(norm(kw)))
    if (!hit) return false
  }

  if (f.min_value != null && (row.cuantia_cop ?? 0) < f.min_value) return false
  if (f.max_value != null && row.cuantia_cop != null && row.cuantia_cop > f.max_value) return false

  return true
}

/** Aplica el filtro a una lista, devolviendo solo las que interesan. */
export function applyFilter(rows: RadarSearchRow[], f: RadarFilter): RadarSearchRow[] {
  return rows.filter((r) => passesFilter(r, f))
}
