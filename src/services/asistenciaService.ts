import { supabase } from '../lib/supabase'
import type {
  Asistencia,
  DashboardMetrics,
  Estudiante,
  EstudianteMateria,
  Materia,
  ResumenAsistencia,
  Semana,
  TipoAsistencia,
  TipoMatricula,
  TipoSemanaEspecial,
  TutorGrupoResumen,
} from '../types/domain'

function withOffset(date: Date) {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000)
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseDateOnlyUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function addDaysUtc(date: Date, days: number) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function getEasterSundayUtc(year: number) {
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

function getSecondMondayOfOctoberUtc(year: number) {
  const octoberFirst = new Date(Date.UTC(year, 9, 1))
  const weekday = octoberFirst.getUTCDay()
  const firstMondayOffset = (8 - weekday) % 7
  const firstMonday = addDaysUtc(octoberFirst, firstMondayOffset)
  return addDaysUtc(firstMonday, 7)
}

function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA <= endB && startB <= endA
}

export function getTipoSemanaEspecial(semana: Semana): TipoSemanaEspecial | null {
  const start = parseDateOnlyUtc(semana.fecha_inicio)
  const end = parseDateOnlyUtc(semana.fecha_fin)
  const year = start.getUTCFullYear()

  const easterSunday = getEasterSundayUtc(year)
  const holyWeekStart = addDaysUtc(easterSunday, -6)
  const holyWeekEnd = easterSunday

  if (rangesOverlap(start, end, holyWeekStart, holyWeekEnd)) {
    return 'Semana Santa'
  }

  const recessStart = getSecondMondayOfOctoberUtc(year)
  const recessEnd = addDaysUtc(recessStart, 6)

  if (rangesOverlap(start, end, recessStart, recessEnd)) {
    return 'Receso de octubre'
  }

  return null
}

export function isSemanaEspecialSinAsistencia(semana: Semana) {
  return getTipoSemanaEspecial(semana) !== null
}

function sortWeeksByStartDateAsc(semanas: Semana[]) {
  return [...semanas].sort((a, b) =>
    parseDateOnlyUtc(a.fecha_inicio).getTime() - parseDateOnlyUtc(b.fecha_inicio).getTime(),
  )
}

export async function getSemanaActual(): Promise<Semana | null> {
  const nowDate = withOffset(new Date())
  const now = toDateOnly(nowDate)

  const { data: currentWeek, error } = await supabase
    .from('semanas')
    .select('*')
    .lte('fecha_inicio', now)
    .gte('fecha_fin', now)
    .order('semana_academica', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (currentWeek) {
    if (isSemanaEspecialSinAsistencia(currentWeek)) {
      return currentWeek
    }

    const currentDay = nowDate.getDay()

    if (currentDay < 5) {
      const { data: previousWeek, error: previousWeekError } = await supabase
        .from('semanas')
        .select('*')
        .eq('corte_semestre', currentWeek.corte_semestre)
        .lt('semana_academica', currentWeek.semana_academica)
        .order('semana_academica', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (previousWeekError) {
        throw previousWeekError
      }

      return previousWeek ?? currentWeek
    }

    return currentWeek
  }

  const { data: latestWeek, error: latestWeekError } = await supabase
    .from('semanas')
    .select('*')
    .lte('fecha_inicio', now)
    .order('fecha_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestWeekError) {
    throw latestWeekError
  }

  return latestWeek
}

export async function getMateriasSemestre(semestre: number): Promise<Materia[]> {
  const { data, error } = await supabase
    .from('materias')
    .select('*')
    .eq('semestre', semestre)
    .order('nombre', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

function mapMateriaJoinValue(value: unknown): Materia | undefined {
  if (!value) {
    return undefined
  }

  if (Array.isArray(value)) {
    return value[0] as Materia | undefined
  }

  return value as Materia
}

export async function getMatriculasEstudiante(estudianteId: number): Promise<EstudianteMateria[]> {
  const { data, error } = await supabase
    .from('estudiante_materias')
    .select('id, estudiante_id, materia_id, tipo, materia:materias(id, nombre, semestre)')
    .eq('estudiante_id', estudianteId)

  if (error) {
    throw error
  }

  const rows = (data ?? []).map((row) => {
    const materia = mapMateriaJoinValue(row.materia)
    return {
      id: row.id,
      estudiante_id: row.estudiante_id,
      materia_id: row.materia_id,
      tipo: row.tipo as TipoMatricula,
      materia,
    }
  })

  return rows.sort((a, b) => (a.materia?.nombre ?? '').localeCompare(b.materia?.nombre ?? '', 'es'))
}

export async function getMateriasEstudiante(estudianteId: number): Promise<Materia[]> {
  const matriculas = await getMatriculasEstudiante(estudianteId)
  return matriculas
    .map((m) => m.materia)
    .filter((materia): materia is Materia => Boolean(materia))
}

export async function agregarMatricula(
  estudianteId: number,
  materiaId: number,
  tipo: TipoMatricula,
) {
  const { error } = await supabase.from('estudiante_materias').insert({
    estudiante_id: estudianteId,
    materia_id: materiaId,
    tipo,
  })

  if (error) {
    throw error
  }
}

export async function eliminarMatricula(estudianteId: number, materiaId: number) {
  const { error } = await supabase
    .from('estudiante_materias')
    .delete()
    .eq('estudiante_id', estudianteId)
    .eq('materia_id', materiaId)

  if (error) {
    throw error
  }
}

export async function confirmarMatriculaEstudiante(estudianteId: number) {
  const { error } = await supabase
    .from('estudiantes')
    .update({ matricula_confirmada: true })
    .eq('id', estudianteId)

  if (error) {
    throw error
  }
}

export async function getAsistenciasEstudiante(
  estudianteId: number,
  corteSemestral: string,
): Promise<Asistencia[]> {
  const { data: semanas, error: semanasError } = await supabase
    .from('semanas')
    .select('id')
    .eq('corte_semestre', corteSemestral)

  if (semanasError) {
    throw semanasError
  }

  const semanaIds = semanas.map((s) => s.id)

  if (semanaIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('asistencias')
    .select('*')
    .eq('estudiante_id', estudianteId)
    .in('semana_id', semanaIds)

  if (error) {
    throw error
  }

  return data
}

export async function getAsistenciasSemana(
  estudianteId: number,
  semanaId: number,
): Promise<Asistencia[]> {
  const { data, error } = await supabase
    .from('asistencias')
    .select('*')
    .eq('estudiante_id', estudianteId)
    .eq('semana_id', semanaId)

  if (error) {
    throw error
  }

  return data
}

export async function getResumenSemestralPorEstudiantes(
  estudianteIds: number[],
  corteSemestral: string,
  semanaAcademica: number,
): Promise<
  Map<
    number,
    {
      totalMateriasSemana: number
      asistenciasTotales: number
      totalEsperadoSemestre: number
    }
  >
> {
  const idsUnicos = Array.from(new Set(estudianteIds))

  if (idsUnicos.length === 0) {
    return new Map()
  }

  const { data: semanasRows, error: semanasError } = await supabase
    .from('semanas')
    .select('id')
    .eq('corte_semestre', corteSemestral)

  if (semanasError) {
    throw semanasError
  }

  const semanaIds = (semanasRows ?? []).map((s) => s.id)

  const [{ data: matriculasRows, error: matriculasError }, { data: asistenciasRows, error: asistenciasError }] =
    await Promise.all([
      supabase
        .from('estudiante_materias')
        .select('estudiante_id')
        .in('estudiante_id', idsUnicos),
      semanaIds.length > 0
        ? supabase
            .from('asistencias')
            .select('estudiante_id')
            .in('estudiante_id', idsUnicos)
            .in('semana_id', semanaIds)
        : Promise.resolve({ data: [], error: null }),
    ])

  if (matriculasError) {
    throw matriculasError
  }

  if (asistenciasError) {
    throw asistenciasError
  }

  const materiasCount = new Map<number, number>()
  for (const row of matriculasRows ?? []) {
    materiasCount.set(row.estudiante_id, (materiasCount.get(row.estudiante_id) ?? 0) + 1)
  }

  const asistenciasCount = new Map<number, number>()
  for (const row of asistenciasRows ?? []) {
    asistenciasCount.set(row.estudiante_id, (asistenciasCount.get(row.estudiante_id) ?? 0) + 1)
  }

  const resumenMap = new Map<
    number,
    {
      totalMateriasSemana: number
      asistenciasTotales: number
      totalEsperadoSemestre: number
    }
  >()

  for (const estudianteId of idsUnicos) {
    const totalMateriasSemana = materiasCount.get(estudianteId) ?? 0
    const asistenciasTotales = asistenciasCount.get(estudianteId) ?? 0

    resumenMap.set(estudianteId, {
      totalMateriasSemana,
      asistenciasTotales,
      totalEsperadoSemestre: totalMateriasSemana * semanaAcademica,
    })
  }

  return resumenMap
}

export async function getDashboardMetrics(
  estudiante: Estudiante,
): Promise<DashboardMetrics> {
  const semanaActual = await getSemanaActual()

  if (!semanaActual) {
    return {
      totalMaterias: 0,
      asistenciaSemanalPorcentaje: 0,
      asistenciasSemana: 0,
      asistenciaSemestralPorcentaje: 0,
      asistenciasTotales: 0,
      totalEsperadoSemestre: 0,
      semanaObjetivo: null,
      semanaActual: null,
      tipoSemanaEspecial: null,
    }
  }

  const tipoSemanaEspecial = getTipoSemanaEspecial(semanaActual)

  const materias = await getMateriasEstudiante(estudiante.id)
  const totalMaterias = materias.length

  const asistenciasSemestrales = await getAsistenciasEstudiante(
    estudiante.id,
    semanaActual.corte_semestre,
  )

  const { data: semanasCorte, error: semanasCorteError } = await supabase
    .from('semanas')
    .select('*')
    .eq('corte_semestre', semanaActual.corte_semestre)

  if (semanasCorteError) {
    throw semanasCorteError
  }

  const semanasHabilitadas = sortWeeksByStartDateAsc(
    (semanasCorte ?? []).filter((semana) => !isSemanaEspecialSinAsistencia(semana as Semana)) as Semana[],
  )

  if (tipoSemanaEspecial) {
    const semanasHabilitadasHastaSemanaActual = semanasHabilitadas.filter(
      (semana) =>
        parseDateOnlyUtc(semana.fecha_inicio) <= parseDateOnlyUtc(semanaActual.fecha_inicio),
    ).length

    const divisor = totalMaterias * Math.max(semanasHabilitadasHastaSemanaActual - 1, 1)
    const asistenciaSemestralPorcentaje = divisor > 0 ? (asistenciasSemestrales.length * 100) / divisor : 0

    return {
      totalMaterias,
      asistenciaSemanalPorcentaje: 0,
      asistenciasSemana: 0,
      asistenciaSemestralPorcentaje,
      asistenciasTotales: asistenciasSemestrales.length,
      totalEsperadoSemestre: totalMaterias * semanasHabilitadasHastaSemanaActual,
      semanaObjetivo: null,
      semanaActual,
      tipoSemanaEspecial,
    }
  }

  const asistenciasTotales = asistenciasSemestrales.length
  const semanasCompletadas = totalMaterias > 0 ? Math.floor(asistenciasTotales / totalMaterias) : 0
  const semanaObjetivo =
    totalMaterias > 0 && semanasHabilitadas.length > 0
      ? semanasHabilitadas[semanasCompletadas] ?? null
      : null

  const asistenciasSemanaObjetivo = semanaObjetivo
    ? await getAsistenciasSemana(estudiante.id, semanaObjetivo.id)
    : []

  const asistenciaSemanalPorcentaje =
    totalMaterias > 0 ? (asistenciasSemanaObjetivo.length * 100) / totalMaterias : 0

  const semanasHabilitadasHastaSemanaActual = semanasHabilitadas.filter(
    (semana) => parseDateOnlyUtc(semana.fecha_inicio) <= parseDateOnlyUtc(semanaActual.fecha_inicio),
  ).length

  const divisor = totalMaterias * Math.max(semanasHabilitadasHastaSemanaActual - 1, 1)
  const asistenciaSemestralPorcentaje = divisor > 0 ? (asistenciasTotales * 100) / divisor : 0

  const totalEsperadoSemestre = totalMaterias * semanasHabilitadasHastaSemanaActual

  return {
    totalMaterias,
    asistenciaSemanalPorcentaje,
    asistenciasSemana: asistenciasSemanaObjetivo.length,
    asistenciaSemestralPorcentaje,
    asistenciasTotales,
    totalEsperadoSemestre,
    semanaObjetivo,
    semanaActual,
    tipoSemanaEspecial: null,
  }
}

export async function getMateriasConRegistroSemana(
  estudiante: Estudiante,
  semanaId: number,
): Promise<Array<Materia & { registro: boolean; tipo: TipoMatricula }>> {
  const matriculas = await getMatriculasEstudiante(estudiante.id)
  const asistencias = await getAsistenciasSemana(estudiante.id, semanaId)

  return matriculas
    .filter((matricula) => Boolean(matricula.materia))
    .map((matricula) => ({
      ...(matricula.materia as Materia),
      tipo: matricula.tipo,
      registro: asistencias.some((asistencia) => asistencia.materia_id === matricula.materia_id),
    }))
}

interface CrearAsistenciaInput {
  estudianteId: number
  semanaId: number
  materiaId: number
  asistencia: TipoAsistencia
  motivoInasistencia?: string
  rating?: number
  razonRating?: string
  observaciones?: string
}

export async function crearAsistencia(input: CrearAsistenciaInput) {
  const payload = {
    estudiante_id: input.estudianteId,
    semana_id: input.semanaId,
    materia_id: input.materiaId,
    asistencia: input.asistencia,
    motivo_inasistencia: input.motivoInasistencia ?? null,
    rating: input.rating ?? null,
    razon_rating: input.razonRating ?? null,
    observaciones: input.observaciones ?? null,
  }

  const { error } = await supabase.from('asistencias').insert(payload)

  if (error) {
    throw error
  }
}

export async function getResumenHermanoMayor(
  hermanoMayorId: number,
  semanaId: number,
): Promise<ResumenAsistencia[]> {
  const { data: estudiantes, error: estudiantesError } = await supabase
    .from('estudiantes')
    .select('*')
    .eq('hermano_mayor', hermanoMayorId)
    .eq('rol', 'Hermano_Menor')

  if (estudiantesError) {
    throw estudiantesError
  }

  if (!estudiantes || estudiantes.length === 0) {
    return []
  }

  const estudianteIds = estudiantes.map((e) => e.id)

  const [{ data: matriculasRows, error: matriculasError }, { data: asistenciasRows, error: asistenciasError }] = await Promise.all([
    supabase
      .from('estudiante_materias')
      .select('estudiante_id')
      .in('estudiante_id', estudianteIds),
    supabase
      .from('asistencias')
      .select('estudiante_id')
      .eq('semana_id', semanaId)
      .in('estudiante_id', estudianteIds),
  ])

  if (matriculasError) {
    throw matriculasError
  }

  if (asistenciasError) {
    throw asistenciasError
  }

  const materiasCount = new Map<number, number>()
  for (const row of matriculasRows ?? []) {
    materiasCount.set(row.estudiante_id, (materiasCount.get(row.estudiante_id) ?? 0) + 1)
  }

  const asistenciasCount = new Map<number, number>()
  for (const row of asistenciasRows ?? []) {
    asistenciasCount.set(row.estudiante_id, (asistenciasCount.get(row.estudiante_id) ?? 0) + 1)
  }

  const resumen: ResumenAsistencia[] = []

  for (const estudiante of estudiantes) {
    const realizadas = asistenciasCount.get(estudiante.id) ?? 0
    const totalMaterias = materiasCount.get(estudiante.id) ?? 0

    const progreso =
      realizadas === 0
        ? 'Sin registro'
        : realizadas < totalMaterias
          ? 'En progreso'
          : 'Completado'

    resumen.push({
      estudianteId: estudiante.id,
      nombre: estudiante.nombre,
      asistenciaRealizada: realizadas,
      materias: totalMaterias,
      progreso,
      estudianteData: estudiante as Estudiante,
    })
  }

  return resumen.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function getResumenTutorGeneral(semanaId: number): Promise<TutorGrupoResumen[]> {
  const [{ data: hmRows, error: hmError }, { data: menoresRows, error: menoresError }] = await Promise.all([
    supabase
      .from('estudiantes')
      .select('*')
      .eq('rol', 'Hermano_Mayor')
      .eq('status', 'Activo')
      .order('nombre', { ascending: true }),
    supabase
      .from('estudiantes')
      .select('*')
      .eq('rol', 'Hermano_Menor')
      .eq('status', 'Activo')
      .order('nombre', { ascending: true }),
  ])

  if (hmError) {
    throw hmError
  }

  if (menoresError) {
    throw menoresError
  }

  const hmList = (hmRows ?? []) as Estudiante[]
  const menores = (menoresRows ?? []) as Estudiante[]

  const menoresIds = menores.map((e) => e.id)

  const [{ data: matriculasRows, error: matriculasError }, { data: asistenciasRows, error: asistenciasError }] =
    menoresIds.length > 0
      ? await Promise.all([
          supabase
            .from('estudiante_materias')
            .select('estudiante_id')
            .in('estudiante_id', menoresIds),
          supabase
            .from('asistencias')
            .select('estudiante_id')
            .eq('semana_id', semanaId)
            .in('estudiante_id', menoresIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]

  if (matriculasError) {
    throw matriculasError
  }

  if (asistenciasError) {
    throw asistenciasError
  }

  const materiasCount = new Map<number, number>()
  for (const row of matriculasRows ?? []) {
    materiasCount.set(row.estudiante_id, (materiasCount.get(row.estudiante_id) ?? 0) + 1)
  }

  const asistenciasCount = new Map<number, number>()
  for (const row of asistenciasRows ?? []) {
    asistenciasCount.set(row.estudiante_id, (asistenciasCount.get(row.estudiante_id) ?? 0) + 1)
  }

  const gruposMap = new Map<number | 'sin_asignar', TutorGrupoResumen>()

  for (const hm of hmList) {
    gruposMap.set(hm.id, {
      hermanoMayor: hm,
      estudiantes: [],
      totalEstudiantes: 0,
      completados: 0,
      enProgreso: 0,
      sinRegistro: 0,
    })
  }

  if (!gruposMap.has('sin_asignar')) {
    gruposMap.set('sin_asignar', {
      hermanoMayor: null,
      estudiantes: [],
      totalEstudiantes: 0,
      completados: 0,
      enProgreso: 0,
      sinRegistro: 0,
    })
  }

  for (const estudiante of menores) {
    const realizadas = asistenciasCount.get(estudiante.id) ?? 0
    const totalMaterias = materiasCount.get(estudiante.id) ?? 0

    const progreso =
      realizadas === 0
        ? 'Sin registro'
        : realizadas < totalMaterias
          ? 'En progreso'
          : 'Completado'

    const item: ResumenAsistencia = {
      estudianteId: estudiante.id,
      nombre: estudiante.nombre,
      asistenciaRealizada: realizadas,
      materias: totalMaterias,
      progreso,
      estudianteData: estudiante,
    }

    const groupKey = estudiante.hermano_mayor ?? 'sin_asignar'
    const existing = gruposMap.get(groupKey)

    if (existing) {
      existing.estudiantes.push(item)
    } else {
      gruposMap.set('sin_asignar', {
        hermanoMayor: null,
        estudiantes: [item],
        totalEstudiantes: 0,
        completados: 0,
        enProgreso: 0,
        sinRegistro: 0,
      })
    }
  }

  const grupos = Array.from(gruposMap.values())
    .map((grupo) => {
      const estudiantesOrdenados = grupo.estudiantes.sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es'),
      )

      const completados = estudiantesOrdenados.filter((e) => e.progreso === 'Completado').length
      const enProgreso = estudiantesOrdenados.filter((e) => e.progreso === 'En progreso').length
      const sinRegistro = estudiantesOrdenados.filter((e) => e.progreso === 'Sin registro').length

      return {
        ...grupo,
        estudiantes: estudiantesOrdenados,
        totalEstudiantes: estudiantesOrdenados.length,
        completados,
        enProgreso,
        sinRegistro,
      }
    })
    .filter((grupo) => grupo.hermanoMayor !== null || grupo.totalEstudiantes > 0)
    .sort((a, b) => {
      if (!a.hermanoMayor && b.hermanoMayor) return 1
      if (a.hermanoMayor && !b.hermanoMayor) return -1
      return (a.hermanoMayor?.nombre ?? '').localeCompare(b.hermanoMayor?.nombre ?? '', 'es')
    })

  return grupos
}

export async function getHermanosMayores(): Promise<Pick<Estudiante, 'id' | 'nombre'>[]> {
  const { data, error } = await supabase
    .from('estudiantes')
    .select('id, nombre')
    .eq('rol', 'Hermano_Mayor')
    .eq('status', 'Activo')
    .order('nombre')

  if (error) throw error
  return data
}

export async function updateEstudiante(id: number, data: Partial<Estudiante>) {
  const { error } = await supabase.from('estudiantes').update(data).eq('id', id)
  if (error) {
    throw error
  }
}

export async function getTodasLasSemanas(): Promise<Semana[]> {
  const { data, error } = await supabase.from('semanas').select('*').order('semana_academica')
  if (error) throw error
  return data
}

export async function getTextoReporteAsistencia(estudiante: Estudiante, semana: Semana): Promise<string> {
  const tipoSemanaEspecial = getTipoSemanaEspecial(semana)

  const fechaInicio = semana.fecha_inicio ?? ''
  const fechaFin = semana.fecha_fin ?? ''

  let text = `Semana ${semana.semana_academica}\n`
  text += `Identificacion: ${estudiante.cedula ?? ''}\n`
  text += `Nombre Completo: ${estudiante.nombre ?? ''}\n`
  text += `Telefono: ${estudiante.telefono ?? ''}\n`
  text += `Correo personal: ${estudiante.email_personal ?? ''}\n`
  text += `Correo institucional: ${estudiante.email ?? ''}\n\n`
  text += `Fecha: ${fechaInicio} - ${fechaFin}\n\n`

  if (tipoSemanaEspecial) {
    text += `SEMANA ${tipoSemanaEspecial}\n`
    return text.trimEnd()
  }

  const materias = await getMateriasEstudiante(estudiante.id)
  const asistencias = await getAsistenciasSemana(estudiante.id, semana.id)

  for (const m of materias) {
    const a = asistencias.find((x) => x.materia_id === m.id)
    const materiaWithDocente = m as Materia & {
      profesor?: string | null
      docente?: string | null
      docente_nombre?: string | null
      nombre_docente?: string | null
    }

    const profesor =
      materiaWithDocente.profesor ??
      materiaWithDocente.docente ??
      materiaWithDocente.docente_nombre ??
      materiaWithDocente.nombre_docente ??
      ''

    const observaciones =
      a?.observaciones && a.observaciones !== 'Ninguna observacion'
        ? a.observaciones
        : a?.motivo_inasistencia ?? ''

    text += `Asignatura: ${m.nombre}\n`
    text += `Profesor: ${profesor}\n`
    text += `Asistencia: ${a?.asistencia ?? 'Sin registro'}\n`
    text += `Observaciones: ${observaciones}\n\n`
  }

  return text.trimEnd()
}

interface CrearEstudianteInput {
  cedula: string
  nombre: string
  email: string
  semestre: number
  grupo: number
  rol: 'Hermano_Mayor' | 'Hermano_Menor'
  hermano_mayor: number | null
  telefono?: string
  ciudad?: string
  materiasRepeticionIds?: number[]
  materiasAdelantoIds?: number[]
}

export async function crearEstudiante(input: CrearEstudianteInput) {
  const password = `LaSalle${input.cedula}`

  const { error: authError } = await supabase.auth.signUp({
    email: input.email,
    password,
  })

  if (authError) {
    throw authError
  }

  const { data: estudianteCreado, error: dbError } = await supabase
    .from('estudiantes')
    .insert({
      cedula: input.cedula,
      nombre: input.nombre,
      email: input.email,
      semestre: input.semestre,
      grupo: input.grupo,
      rol: input.rol,
      hermano_mayor: input.hermano_mayor ?? null,
      telefono: input.telefono ?? null,
      ciudad: input.ciudad ?? null,
      status: 'Activo',
      matricula_confirmada: false,
    })
    .select('id')
    .single()

  if (dbError) {
    throw dbError
  }

  if (input.rol !== 'Hermano_Menor') {
    return
  }

  const materiasNormales = await getMateriasSemestre(input.semestre)
  const normalIds = materiasNormales.map((materia) => materia.id)
  const repeticionIds = input.materiasRepeticionIds ?? []
  const adelantoIds = input.materiasAdelantoIds ?? []

  const materiaTipoMap = new Map<number, TipoMatricula>()

  for (const id of normalIds) {
    materiaTipoMap.set(id, 'normal')
  }

  for (const id of repeticionIds) {
    if (!materiaTipoMap.has(id)) {
      materiaTipoMap.set(id, 'repeticion')
    }
  }

  for (const id of adelantoIds) {
    if (!materiaTipoMap.has(id)) {
      materiaTipoMap.set(id, 'adelanto')
    }
  }

  const payload = Array.from(materiaTipoMap.entries()).map(([materiaId, tipo]) => ({
    estudiante_id: estudianteCreado.id,
    materia_id: materiaId,
    tipo,
  }))

  if (payload.length > 0) {
    const { error: matriculaError } = await supabase.from('estudiante_materias').insert(payload)

    if (matriculaError) {
      throw matriculaError
    }
  }
}
