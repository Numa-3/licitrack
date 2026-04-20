/**
 * Types for the precontractual (Proceso de Contratación) tracker.
 *
 * Data source: SECOP II Procesos de Contratación dataset (p6dx-8zbt).
 * https://www.datos.gov.co/resource/p6dx-8zbt.json
 *
 * A single "process" (identified by notice_uid) can have multiple phase records
 * in the dataset, each with its own id_del_proceso but sharing the same
 * id_del_portafolio. We capture all phase rows into a PhaseSnapshot[] so we can
 * detect when a new phase begins.
 */

/** One row from the SECOP II Procesos dataset. */
export type PhaseSnapshot = {
  id_del_proceso: string            // CO1.REQ.xxxxxxx
  id_del_portafolio: string | null  // CO1.BDOS.xxxxxxx (groups phases of same process)
  referencia: string | null
  fase: string | null               // "Presentación de observaciones" | "Presentación de oferta" | ...
  estado_del_procedimiento: string | null  // "Evaluación" | "Seleccionado" | "Adjudicado" | ...
  estado_resumen: string | null
  estado_apertura: string | null    // "Abierto" | "Cerrado"
  fecha_publicacion: string | null
  fecha_ultima_publicacion: string | null
  fecha_recepcion: string | null
  fecha_apertura_respuesta: string | null
  fecha_apertura_efectiva: string | null
  respuestas_al_procedimiento: number
  respuestas_externas: number
  conteo_respuestas_ofertas: number
  proveedores_unicos: number
  adjudicado: boolean               // true if estado reached "Adjudicado"
  id_adjudicacion: string | null    // CO1.AWD.xxxxx (null if not awarded)
  nombre_proveedor_adjudicado: string | null
  nit_proveedor_adjudicado: string | null
  valor_adjudicacion: string | null
}

/** Snapshot of everything we track for a precontractual process. */
export type PrecontractualSnapshot = {
  // Core identifiers
  notice_uid: string                // CO1.NTC.xxxxxxx (from the user-pasted URL)
  url_publica: string

  // Entidad
  entidad: string | null
  nit_entidad: string | null
  departamento: string | null
  ciudad: string | null
  orden_entidad: string | null      // Nacional / Territorial
  unidad_contratacion: string | null

  // Proceso
  nombre_procedimiento: string | null
  descripcion: string | null
  modalidad: string | null
  justificacion_modalidad: string | null
  tipo_contrato: string | null
  categoria_principal: string | null
  precio_base: string | null

  // Fase actual (derived from the latest phase row)
  fase_actual: string | null
  estado_actual: string | null
  adjudicado: boolean
  proveedor_adjudicado: {
    nombre: string | null
    nit: string | null
    valor: string | null
  } | null

  // All phase rows captured for this process (ordered by fecha_publicacion ASC)
  phases: PhaseSnapshot[]

  /**
   * Cronograma with exact times (date + hour).
   * Populated ONLY by the authenticated OpportunityDetail scraper (scraper.ts).
   * The regular API polling keeps this as `null` to signal "no fresh capture
   * this cycle" — the monitor then knows it can keep the last value intact.
   */
  cronograma: {
    nombre: string
    fecha_inicio: string | null
    fecha_fin: string | null
    estado: string | null
  }[] | null
  cronograma_captured_at: string | null

  // Metadata
  scraped_at: string
}

/** Change records produced by the precontractual diff engine. */
export type PrecontractualChangeRecord = {
  change_type:
    | 'phase_changed'               // new phase appeared (e.g. observaciones → oferta)
    | 'process_state_changed'       // estado_del_procedimiento changed
    | 'process_awarded'             // adjudicado: false → true (we don't know yet to whom)
    | 'process_awarded_to_us'       // adjudicado AND nit matches one of our companies
    | 'process_awarded_to_other'    // adjudicado but not our nit
    | 'process_declared_void'       // adjudicado=false but estado indicates "Desierto"
    | 'process_value_changed'       // precio_base changed
    | 'process_deadline_changed'    // fecha_recepcion or fecha_apertura changed
    | 'new_responses'               // respuestas_al_procedimiento increased
    | 'cronograma_event_added'      // a new event appeared in the detailed cronograma (with hours)
    | 'cronograma_event_removed'    // an event disappeared
    | 'cronograma_event_changed'    // an event's dates/hours changed
  priority: 'low' | 'medium' | 'high'
  before_json: unknown
  after_json: unknown
  summary: string
}
