import { supabase } from '../lib/supabase'
import type {
  Asistencia,
  DashboardMetrics,
  Estudiante,
  Materia,
  ResumenAsistencia,
  Semana,
  TipoAsistencia,
} from '../types/domain'

function withOffset(date: Date) {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000)
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function getSemanaActual(): Promise<Semana | null> {
  const now = toDateOnly(withOffset(new Date()))

  const { data, error } = await supabase
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

  return data
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

export async function getDashboardMetrics(
  estudiante: Estudiante,
): Promise<DashboardMetrics> {
  const semanaActual = await getSemanaActual()

  if (!semanaActual) {
    return {
      totalMaterias: 0,
      asistenciaSemanalPorcentaje: 0,
      asistenciaSemestralPorcentaje: 0,
      asistenciasTotales: 0,
      totalEsperadoSemestre: 0,
      semanaObjetivo: null,
      semanaActual: null,
    }
  }

  const materias = await getMateriasSemestre(estudiante.semestre)
  const totalMaterias = materias.length

  const asistenciasSemestrales = await getAsistenciasEstudiante(
    estudiante.id,
    semanaActual.corte_semestre,
  )

  const asistenciasTotales = asistenciasSemestrales.length
  const semanaPendienteIndex =
    totalMaterias > 0 ? Math.floor(asistenciasTotales / totalMaterias) + 1 : 1

  const { data: semanaObjetivoData, error: semanaObjetivoError } = await supabase
    .from('semanas')
    .select('*')
    .eq('corte_semestre', semanaActual.corte_semestre)
    .eq('semana_academica', semanaPendienteIndex)
    .maybeSingle()

  if (semanaObjetivoError) {
    throw semanaObjetivoError
  }

  const semanaObjetivo = semanaObjetivoData

  const asistenciasSemanaObjetivo = semanaObjetivo
    ? await getAsistenciasSemana(estudiante.id, semanaObjetivo.id)
    : []

  const asistenciaSemanalPorcentaje =
    totalMaterias > 0 ? (asistenciasSemanaObjetivo.length * 100) / totalMaterias : 0

  const divisor = totalMaterias * Math.max(semanaActual.semana_academica - 1, 1)
  const asistenciaSemestralPorcentaje = divisor > 0 ? (asistenciasTotales * 100) / divisor : 0

  const totalEsperadoSemestre = totalMaterias * semanaActual.semana_academica

  return {
    totalMaterias,
    asistenciaSemanalPorcentaje,
    asistenciaSemestralPorcentaje,
    asistenciasTotales,
    totalEsperadoSemestre,
    semanaObjetivo,
    semanaActual,
  }
}

export async function getMateriasConRegistroSemana(
  estudiante: Estudiante,
  semanaId: number,
): Promise<Array<Materia & { registro: boolean }>> {
  const materias = await getMateriasSemestre(estudiante.semestre)
  const asistencias = await getAsistenciasSemana(estudiante.id, semanaId)

  return materias.map((materia) => ({
    ...materia,
    registro: asistencias.some((asistencia) => asistencia.materia_id === materia.id),
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
    .select('id,nombre,semestre')
    .eq('hermano_mayor', hermanoMayorId)
    .eq('status', 'Activo')

  if (estudiantesError) {
    throw estudiantesError
  }

  const resumen: ResumenAsistencia[] = []

  for (const estudiante of estudiantes) {
    const materias = await getMateriasSemestre(estudiante.semestre)
    const { count, error: asistenciasError } = await supabase
      .from('asistencias')
      .select('*', { count: 'exact', head: true })
      .eq('estudiante_id', estudiante.id)
      .eq('semana_id', semanaId)

    if (asistenciasError) {
      throw asistenciasError
    }

    const realizadas = count ?? 0
    const totalMaterias = materias.length

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
    })
  }

  return resumen.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
