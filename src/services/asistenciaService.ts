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
    }
  }

  const materias = await getMateriasEstudiante(estudiante.id)
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
    asistenciasSemana: asistenciasSemanaObjetivo.length,
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

  if (estudiantesError) {
    throw estudiantesError
  }

  const resumen: ResumenAsistencia[] = []

  for (const estudiante of estudiantes) {
    const materias = await getMateriasEstudiante(estudiante.id)
    const { data: asistenciasRecord, error: asistenciasError } = await supabase
      .from('asistencias')
      .select('id')
      .eq('estudiante_id', estudiante.id)
      .eq('semana_id', semanaId)

    if (asistenciasError) {
      throw asistenciasError
    }

    const realizadas = asistenciasRecord?.length ?? 0
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
      estudianteData: estudiante as Estudiante,
    })
  }

  return resumen.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
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
  const materias = await getMateriasEstudiante(estudiante.id)
  const asistencias = await getAsistenciasSemana(estudiante.id, semana.id)

  let text = `Reporte Asistencia - Semana ${semana.semana_academica}\n`
  text += `Estudiante: ${estudiante.nombre}\n`
  text += `-----------------------------------\n`
  
  for (const m of materias) {
    const a = asistencias.find(x => x.materia_id === m.id)
    if (!a) {
      text += `• ${m.nombre}: No registrado\n`
    } else {
      text += `• ${m.nombre}: ${a.asistencia}`
      if (a.asistencia === 'No' && a.motivo_inasistencia) text += ` (Motivo: ${a.motivo_inasistencia})`
      if (a.observaciones && a.observaciones !== 'Ninguna observacion') text += ` [Obs: ${a.observaciones}]`
      text += '\n'
    }
  }
  return text
}

interface CrearEstudianteInput {
  cedula: string
  nombre: string
  email: string
  semestre: number
  grupo: number
  rol: 'Hermano_Mayor' | 'Hermano_Menor'
  hermano_mayor: number
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
      hermano_mayor: input.hermano_mayor,
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
