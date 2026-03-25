export type RolUsuario = 'Hermano_Mayor' | 'Hermano_Menor' | 'Tutor'

export type EstadoProgreso = 'Sin registro' | 'En progreso' | 'Completado'

export interface Estudiante {
  id: number
  cedula: string
  nombre: string
  email: string
  email_personal?: string | null
  telefono?: string | null
  direccion?: string | null
  ciudad?: string | null
  semestre: number
  grupo: number
  rol: RolUsuario
  hermano_mayor: number | null
  status: 'Activo' | 'Inactivo' | 'Graduado' | 'Retirado'
  matricula_confirmada: boolean
}

export interface Materia {
  id: number
  nombre: string
  semestre: number
}

export type TipoMatricula = 'normal' | 'repeticion' | 'adelanto'

export interface EstudianteMateria {
  id: number
  estudiante_id: number
  materia_id: number
  tipo: TipoMatricula
  materia?: Materia
}

export interface Semana {
  id: number
  corte_semestre: string
  semana_academica: number
  fecha_inicio: string
  fecha_fin: string
}

export type TipoAsistencia =
  | 'Si'
  | 'No'
  | 'No_sesion'
  | 'Sesion_aplazada_cancelada'

export interface Asistencia {
  id: number
  estudiante_id: number
  semana_id: number
  materia_id: number
  asistencia: TipoAsistencia
  motivo_inasistencia: string | null
  rating: number | null
  razon_rating: string | null
  observaciones: string | null
  fecha_creacion: string
}

export interface ResumenAsistencia {
  estudianteId: number
  nombre: string
  asistenciaRealizada: number
  materias: number
  progreso: EstadoProgreso
  estudianteData: Estudiante
}

export interface TutorGrupoResumen {
  hermanoMayor: Estudiante | null
  estudiantes: ResumenAsistencia[]
  totalEstudiantes: number
  completados: number
  enProgreso: number
  sinRegistro: number
}

export interface DashboardMetrics {
  totalMaterias: number
  asistenciaSemanalPorcentaje: number
  asistenciasSemana: number
  asistenciaSemestralPorcentaje: number
  asistenciasTotales: number
  totalEsperadoSemestre: number
  semanaObjetivo: Semana | null
  semanaActual: Semana | null
}
