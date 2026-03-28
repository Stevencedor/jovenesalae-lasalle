import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function parseDate(value) {
  if (value instanceof Date) return value
  return new Date(value)
}

function addDaysUtc(date, days) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function toDateOnlyUtc(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getAcademicPeriod(date) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const semester = month <= 6 ? 1 : 2
  return `${year}-${semester}`
}

async function main() {
  const { data: lastWeek, error: lastWeekError } = await supabase
    .from('semanas')
    .select('id, corte_semestre, semana_academica, fecha_inicio, fecha_fin')
    .order('fecha_fin', { ascending: false })
    .limit(1)
    .single()

  if (lastWeekError || !lastWeek) {
    throw new Error(`No se pudo obtener la ultima semana: ${lastWeekError?.message || 'sin datos'}`)
  }

  const lastEnd = parseDate(lastWeek.fecha_fin)
  const nextStart = addDaysUtc(lastEnd, 1)
  const nextEnd = addDaysUtc(nextStart, 6)

  const nextPeriod = getAcademicPeriod(nextStart)
  const nextWeekNumber =
    lastWeek.corte_semestre === nextPeriod ? Number(lastWeek.semana_academica) + 1 : 1

  const nextStartStr = toDateOnlyUtc(nextStart)
  const nextEndStr = toDateOnlyUtc(nextEnd)

  const { data: alreadyExistingWeek, error: existsError } = await supabase
    .from('semanas')
    .select('id, corte_semestre, semana_academica, fecha_inicio, fecha_fin')
    .eq('fecha_inicio', nextStartStr)
    .eq('fecha_fin', nextEndStr)
    .maybeSingle()

  if (existsError) {
    throw new Error(`Error validando si la semana ya existe: ${existsError.message}`)
  }

  if (alreadyExistingWeek) {
    console.log('No-op: la semana ya existe, no se insertan duplicados.')
    console.log(alreadyExistingWeek)
    return
  }

  const payload = {
    corte_semestre: nextPeriod,
    semana_academica: nextWeekNumber,
    fecha_inicio: nextStartStr,
    fecha_fin: nextEndStr,
    activa: true,
  }

  if (DRY_RUN) {
    console.log('DRY_RUN=true: no se inserta en base de datos. Payload calculado:')
    console.log(payload)
    return
  }

  const { data: insertedWeek, error: insertError } = await supabase
    .from('semanas')
    .insert(payload)
    .select('id, corte_semestre, semana_academica, fecha_inicio, fecha_fin')
    .single()

  if (insertError) {
    throw new Error(`Error insertando nueva semana: ${insertError.message}`)
  }

  console.log('Semana creada correctamente:')
  console.log(insertedWeek)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
