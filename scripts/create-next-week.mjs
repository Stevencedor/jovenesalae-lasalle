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

function getEasterSundayUtc(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(Date.UTC(year, month - 1, day))
}

function getSecondMondayOfOctoberUtc(year) {
  const octoberFirst = new Date(Date.UTC(year, 9, 1))
  const weekday = octoberFirst.getUTCDay()
  const firstMondayOffset = (8 - weekday) % 7
  const firstMonday = addDaysUtc(octoberFirst, firstMondayOffset)
  return addDaysUtc(firstMonday, 7)
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA
}

function getSpecialWeekType(startDate, endDate) {
  const year = startDate.getUTCFullYear()

  const easterSunday = getEasterSundayUtc(year)
  const holyWeekStart = addDaysUtc(easterSunday, -6)
  const holyWeekEnd = easterSunday

  if (rangesOverlap(startDate, endDate, holyWeekStart, holyWeekEnd)) {
    return 'semana_santa'
  }

  const recessStart = getSecondMondayOfOctoberUtc(year)
  const recessEnd = addDaysUtc(recessStart, 6)

  if (rangesOverlap(startDate, endDate, recessStart, recessEnd)) {
    return 'receso_octubre'
  }

  return null
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
  }

  const specialWeekType = getSpecialWeekType(nextStart, nextEnd)

  if (DRY_RUN) {
    console.log('DRY_RUN=true: no se inserta en base de datos. Payload calculado:')
    console.log(payload)
    if (specialWeekType) {
      console.log(`Semana especial detectada: ${specialWeekType}.`)
      console.log('Esta semana debe crearse, pero no se debe usar para toma de asistencia.')
    }
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
  if (specialWeekType) {
    console.log(`Semana especial detectada: ${specialWeekType}.`)
    console.log('Esta semana debe crearse, pero no se debe usar para toma de asistencia.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
