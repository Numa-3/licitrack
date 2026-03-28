Agrega la siguiente nota al blueprint de v2: $ARGUMENTS

El archivo destino es `docs/v2-blueprint.md`.

## Instrucciones

1. Si `docs/v2-blueprint.md` no existe, créalo con esta estructura base:

```markdown
# LiciTrack v2 — Blueprint

Documento vivo que captura las lecciones aprendidas en v1 para que v2 arranque sin repetir errores.

---

## Stack confirmado
- Next.js App Router (versión actual del proyecto)
- Supabase (auth, DB, storage)
- TypeScript strict
- Tailwind CSS
- OpenRouter API para LLM (modelo: qwen/qwen-turbo como fallback)

## Patrones confirmados que funcionan

## Bugs conocidos y sus soluciones

## Decisiones de arquitectura

## Qué NO repetir en v2

## Setup desde cero (orden de operaciones)

## Módulos y su estado
```

2. Clasifica la nota en la sección correcta según su contenido:
   - Si describe algo que funcionó bien → "Patrones confirmados que funcionan"
   - Si describe un bug y su solución → "Bugs conocidos y sus soluciones"
   - Si explica por qué se tomó una decisión → "Decisiones de arquitectura"
   - Si es algo a evitar → "Qué NO repetir en v2"
   - Si es sobre el setup inicial → "Setup desde cero"
   - Si es sobre el estado de un módulo → "Módulos y su estado"

3. Agrega la nota con formato:
   ```
   ### [fecha de hoy] — [título corto]
   [contenido de la nota]
   ```

4. Confirma qué sección se actualizó y muestra el texto agregado.
