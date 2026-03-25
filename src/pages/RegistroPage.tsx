import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../context/useAuth'
import {
  agregarMatricula,
  crearEstudiante,
  eliminarMatricula,
  getHermanosMayores,
  getMatriculasEstudiante,
  getMateriasSemestre,
  getResumenHermanoMayor,
  getResumenTutorGeneral,
  getSemanaActual,
  getTextoReporteAsistencia,
  getTodasLasSemanas,
  updateEstudiante,
} from '../services/asistenciaService'
import type {
  Estudiante,
  EstudianteMateria,
  Materia,
  ResumenAsistencia,
  Semana,
  TipoMatricula,
  TutorGrupoResumen,
} from '../types/domain'

function stateClass(text: ResumenAsistencia['progreso']) {
  if (text === 'Completado') {
    return 'pill pill-ok'
  }

  if (text === 'En progreso') {
    return 'pill pill-warn'
  }

  return 'pill pill-danger'
}

function matriculaTipoLabel(tipo: TipoMatricula) {
  if (tipo === 'repeticion') {
    return 'Recuperacion'
  }

  if (tipo === 'adelanto') {
    return 'Adelanto'
  }

  return 'Normal'
}

function matriculaTipoClass(tipo: TipoMatricula) {
  if (tipo === 'repeticion') {
    return 'pill pill-warn'
  }

  if (tipo === 'adelanto') {
    return 'pill pill-ok'
  }

  return 'pill'
}

async function getMateriasPorSemestres(semestres: number[]) {
  const semestresUnicos = Array.from(new Set(semestres)).filter((s) => s >= 1 && s <= 10)

  if (semestresUnicos.length === 0) {
    return [] as Materia[]
  }

  const rows = await Promise.all(semestresUnicos.map((semestre) => getMateriasSemestre(semestre)))

  return rows.flat().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

function toggleNumber(list: number[], value: number) {
  if (list.includes(value)) {
    return list.filter((id) => id !== value)
  }

  return [...list, value]
}

export function RegistroPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ResumenAsistencia[]>([])
  const [tutorGroups, setTutorGroups] = useState<TutorGrupoResumen[]>([])
  const [title, setTitle] = useState('Resumen semanal')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingData, setEditingData] = useState<Partial<Estudiante>>({})
  const [editingHmId, setEditingHmId] = useState<number | null>(null)
  const [editingHmData, setEditingHmData] = useState<Partial<Estudiante>>({})
  const [saving, setSaving] = useState(false)
  const [hermanosMayores, setHermanosMayores] = useState<Pick<Estudiante, 'id' | 'nombre'>[]>([])
  const [semanaActiva, setSemanaActiva] = useState<Semana | null>(null)
  const [semanas, setSemanas] = useState<Semana[]>([])

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creatingStudent, setCreatingStudent] = useState(false)
  const [newStudent, setNewStudent] = useState({
    cedula: '',
    nombre: '',
    email: '',
    semestre: 1,
    grupo: 1,
    rol: 'Hermano_Menor' as 'Hermano_Mayor' | 'Hermano_Menor',
    hermano_mayor: '' as number | '',
    telefono: '',
    ciudad: '',
    materiasRepeticionIds: [] as number[],
    materiasAdelantoIds: [] as number[],
  })

  const [materiasPrevias, setMateriasPrevias] = useState<Materia[]>([])
  const [materiasSiguiente, setMateriasSiguiente] = useState<Materia[]>([])

  const [matriculasEdicion, setMatriculasEdicion] = useState<EstudianteMateria[]>([])
  const [materiasDisponiblesEdicion, setMateriasDisponiblesEdicion] = useState<Materia[]>([])
  const [materiaAgregarId, setMateriaAgregarId] = useState<number | ''>('')
  const [tipoAgregar, setTipoAgregar] = useState<TipoMatricula>('normal')
  const [loadingMatriculas, setLoadingMatriculas] = useState(false)
  const [editingEstudianteSemestre, setEditingEstudianteSemestre] = useState<number | null>(null)
  const [assigningHmId, setAssigningHmId] = useState<number | null>(null)
  const [menorSinHmId, setMenorSinHmId] = useState<number | ''>('')

  const loadData = useCallback(async (semanaIdToLoad?: number) => {
    const targetId = semanaIdToLoad
    if (!targetId || !profile) return

    setLoading(true)
    try {
      const [hmList, allSemanas] = await Promise.all([
        getHermanosMayores(),
        semanas.length === 0 ? getTodasLasSemanas() : Promise.resolve(semanas),
      ])

      if (profile.rol === 'Tutor') {
        const grupos = await getResumenTutorGeneral(targetId)
        setTutorGroups(grupos)
        setRows([])
      } else {
        const resumen = await getResumenHermanoMayor(profile.id, targetId)
        setRows(resumen)
        setTutorGroups([])
      }

      if (semanas.length === 0) setSemanas(allSemanas)

      const current = allSemanas.find((s) => s.id === targetId)
      if (current) {
        setSemanaActiva(current)
        setTitle(`Resumen semana ${current.semana_academica}`)
      }

      setHermanosMayores(hmList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el panel')
    } finally {
      setLoading(false)
    }
  }, [profile, semanas])

  async function loadCreateOptionalMaterias(semestre: number) {
    const prev = await getMateriasPorSemestres(
      Array.from({ length: Math.max(0, semestre - 1) }, (_, idx) => idx + 1),
    )
    const next = semestre < 10 ? await getMateriasSemestre(semestre + 1) : []

    setMateriasPrevias(prev)
    setMateriasSiguiente(next)
  }

  function calcularTipoMatricula(materiaSemestre: number, estudianteSemestre: number): TipoMatricula {
    if (materiaSemestre < estudianteSemestre) {
      return 'repeticion'
    }
    if (materiaSemestre > estudianteSemestre) {
      return 'adelanto'
    }
    return 'normal'
  }

  async function loadEditorMatriculas(estudiante: Estudiante) {
    setLoadingMatriculas(true)
    try {
      const [matriculas, materiasPrevias, materiasSiguiente] = await Promise.all([
        getMatriculasEstudiante(estudiante.id),
        getMateriasPorSemestres(
          Array.from({ length: Math.max(0, estudiante.semestre - 1) }, (_, idx) => idx + 1),
        ),
        estudiante.semestre < 10 ? getMateriasSemestre(estudiante.semestre + 1) : Promise.resolve([]),
      ])

      const usadas = new Set(matriculas.map((m) => m.materia_id))
      const disponibles = [...materiasPrevias, ...materiasSiguiente]
        .filter((materia) => !usadas.has(materia.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

      setMatriculasEdicion(matriculas)
      setMateriasDisponiblesEdicion(disponibles)
      setEditingEstudianteSemestre(estudiante.semestre)
      setMateriaAgregarId('')
      setTipoAgregar('normal')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar la matricula')
    } finally {
      setLoadingMatriculas(false)
    }
  }

  useEffect(() => {
    if (!profile || (profile.rol !== 'Hermano_Mayor' && profile.rol !== 'Tutor')) return

    getSemanaActual().then((actual) => {
      if (actual) {
        loadData(actual.id)
      } else {
        setRows([])
        setTitle('No hay semana activa')
        setLoading(false)
      }
    })
  }, [loadData, profile])

  useEffect(() => {
    if (!showCreateForm) {
      return
    }

    loadCreateOptionalMaterias(newStudent.semestre).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudieron cargar materias opcionales')
    })
  }, [newStudent.semestre, showCreateForm])

  const handleSave = async (id: number) => {
    if (
      editingData.semestre !== undefined &&
      (editingData.semestre < 1 || editingData.semestre > 10)
    ) {
      toast.error('El semestre debe ser un valor numerico entre 1 y 10.')
      return
    }

    setSaving(true)
    try {
      await updateEstudiante(id, editingData)
      setEditingId(null)
      toast.success('Estudiante actualizado correctamente')
      if (semanaActiva) {
        loadData(semanaActiva.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar los datos del estudiante')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveHermanoMayor = async (id: number) => {
    if (
      editingHmData.semestre !== undefined &&
      (editingHmData.semestre < 1 || editingHmData.semestre > 10)
    ) {
      toast.error('El semestre debe ser un valor numerico entre 1 y 10.')
      return
    }

    setSaving(true)
    try {
      await updateEstudiante(id, editingHmData)
      setEditingHmId(null)
      toast.success('Hermano mayor actualizado correctamente')
      if (semanaActiva) {
        loadData(semanaActiva.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar los datos del hermano mayor')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async (estudiante: Estudiante) => {
    if (!semanaActiva) return
    try {
      const text = await getTextoReporteAsistencia(estudiante, semanaActiva)
      await navigator.clipboard.writeText(text)
      toast.success(`Reporte de ${estudiante.nombre} copiado al portapapeles`)
    } catch {
      toast.error('Ocurrio un error al generar o copiar el reporte')
    }
  }

  const handleSemanaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sId = parseInt(e.target.value, 10)
    if (sId) {
      loadData(sId)
    }
  }

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (newStudent.semestre < 1 || newStudent.semestre > 10) {
      toast.error('El semestre debe estar entre 1 y 10')
      return
    }

    const hermanoMayorAsignado =
      newStudent.rol === 'Hermano_Menor'
        ? profile.rol === 'Hermano_Mayor'
          ? profile.id
          : newStudent.hermano_mayor
            ? Number(newStudent.hermano_mayor)
            : null
        : null

    if (newStudent.rol === 'Hermano_Menor' && !hermanoMayorAsignado) {
      toast.error('Debes asignar un hermano mayor al hermano menor')
      return
    }

    setCreatingStudent(true)
    try {
      const { data: existing } = await (await import('../lib/supabase')).supabase
        .from('estudiantes')
        .select('id')
        .eq('cedula', newStudent.cedula)
        .maybeSingle()

      if (existing) {
        toast.error(`Ya existe un estudiante registrado con la cedula ${newStudent.cedula}`)
        setCreatingStudent(false)
        return
      }

      await crearEstudiante({
        ...newStudent,
        hermano_mayor: hermanoMayorAsignado,
      })

      toast.success(
        `Estudiante ${newStudent.nombre} creado. Contrasena inicial: LaSalle${newStudent.cedula}`,
      )
      setShowCreateForm(false)
      setNewStudent({
        cedula: '',
        nombre: '',
        email: '',
        semestre: 1,
        grupo: 1,
        rol: 'Hermano_Menor',
        hermano_mayor: '',
        telefono: '',
        ciudad: '',
        materiasRepeticionIds: [],
        materiasAdelantoIds: [],
      })
      if (semanaActiva) loadData(semanaActiva.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear el estudiante'
      if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('user already exists')
      ) {
        toast.error(`El email ${newStudent.email} ya tiene una cuenta registrada en el sistema`)
      } else {
        toast.error(msg)
      }
    } finally {
      setCreatingStudent(false)
    }
  }

  async function handleAddMatriculaEdicion() {
    if (!editingId || !materiaAgregarId) {
      return
    }

    try {
      const materiaId = Number(materiaAgregarId)
      await agregarMatricula(editingId, materiaId, tipoAgregar)

      const materiaAgregada = materiasDisponiblesEdicion.find((m) => m.id === materiaId)
      if (materiaAgregada) {
        const nuevaMatricula: EstudianteMateria = {
          id: 0,
          estudiante_id: editingId,
          materia_id: materiaId,
          tipo: tipoAgregar,
          materia: materiaAgregada,
        }
        setMatriculasEdicion([...matriculasEdicion, nuevaMatricula])
        setMateriasDisponiblesEdicion(
          materiasDisponiblesEdicion.filter((m) => m.id !== materiaId),
        )
        setMateriaAgregarId('')
        setTipoAgregar('repeticion')
        toast.success('Materia agregada a la matricula')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar la materia')
    }
  }

  async function handleDeleteMatriculaEdicion(materiaId: number) {
    if (!editingId) {
      return
    }

    try {
      await eliminarMatricula(editingId, materiaId)

      const materiaEliminada = matriculasEdicion.find((m) => m.materia_id === materiaId)
      if (materiaEliminada && materiaEliminada.materia) {
        setMatriculasEdicion(
          matriculasEdicion.filter((m) => m.materia_id !== materiaId),
        )
        setMateriasDisponiblesEdicion([
          ...materiasDisponiblesEdicion,
          materiaEliminada.materia,
        ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
        setMateriaAgregarId('')
        toast.success('Materia removida de la matricula')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo remover la materia')
    }
  }

  const menoresSinAsignar =
    tutorGroups.find((group) => group.hermanoMayor === null)?.estudiantes ?? []

  async function handleAsignarHermanoMenor(hmId: number) {
    if (!menorSinHmId) {
      toast.error('Selecciona un hermano menor sin asignar')
      return
    }

    try {
      await updateEstudiante(Number(menorSinHmId), { hermano_mayor: hmId })
      toast.success('Hermano menor asignado correctamente')
      setAssigningHmId(null)
      setMenorSinHmId('')
      if (semanaActiva) {
        await loadData(semanaActiva.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo asignar el hermano menor')
    }
  }

  if (loading) {
    return <div className="card">Cargando panel...</div>
  }

  if (profile?.rol !== 'Hermano_Mayor' && profile?.rol !== 'Tutor') {
    return <div className="card">Esta vista esta habilitada solo para hermano mayor.</div>
  }

  if (error) {
    return <div className="card error-text">{error}</div>
  }

  return (
    <section className="stack-lg">
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <p className="eyebrow">Panel de seguimiento</p>
          <h1>{title}</h1>
        </div>

        {semanas.length > 0 && semanaActiva?.corte_semestre && (
          <label style={{ minWidth: '220px', margin: 0 }}>
            Semana evaluada periodo {semanaActiva.corte_semestre}
            <select value={semanaActiva?.id ?? ''} onChange={handleSemanaChange}>
              {semanas
                .filter(
                  (s) =>
                    s.corte_semestre === semanaActiva.corte_semestre && s.semana_academica > 0,
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    Semana {s.semana_academica}
                  </option>
                ))}
            </select>
          </label>
        )}
        {(profile?.rol === 'Hermano_Mayor' || profile?.rol === 'Tutor') ? (
          <button className="btn-primary btn-sm" onClick={() => setShowCreateForm((v) => !v)}>
            {showCreateForm ? 'Cancelar' : 'Nuevo estudiante'}
          </button>
        ) : null}
      </div>

      {showCreateForm && (profile?.rol === 'Hermano_Mayor' || profile?.rol === 'Tutor') && (
        <form
          className="card"
          onSubmit={handleCreateStudent}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <h3 style={{ gridColumn: '1 / -1', marginBottom: '0.25rem' }}>Registrar nuevo estudiante</h3>
          <label>
            Nombre completo
            <input
              required
              value={newStudent.nombre}
              onChange={(e) => setNewStudent({ ...newStudent, nombre: e.target.value })}
            />
          </label>
          <label>
            Cedula
            <input
              required
              value={newStudent.cedula}
              onChange={(e) => setNewStudent({ ...newStudent, cedula: e.target.value })}
            />
          </label>
          <label>
            Email institucional
            <input
              required
              type="email"
              value={newStudent.email}
              onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
            />
          </label>
          <label>
            Semestre (1-10)
            <input
              required
              type="number"
              min="1"
              max="10"
              value={newStudent.semestre}
              onChange={(e) =>
                setNewStudent({ ...newStudent, semestre: parseInt(e.target.value, 10) || 1 })
              }
            />
          </label>
          <label>
            Rol
            <select
              value={newStudent.rol}
              onChange={(e) =>
                setNewStudent({
                  ...newStudent,
                  rol: e.target.value as 'Hermano_Mayor' | 'Hermano_Menor',
                })
              }
            >
              <option value="Hermano_Menor">Hermano Menor</option>
              <option value="Hermano_Mayor">Hermano Mayor</option>
            </select>
          </label>

          {profile?.rol === 'Tutor' && newStudent.rol === 'Hermano_Menor' ? (
            <label>
              Hermano Mayor asignado
              <select
                value={newStudent.hermano_mayor}
                onChange={(e) =>
                  setNewStudent({
                    ...newStudent,
                    hermano_mayor: e.target.value ? parseInt(e.target.value, 10) : '',
                  })
                }
              >
                <option value="">Selecciona un hermano mayor</option>
                {hermanosMayores.map((hm) => (
                  <option key={hm.id} value={hm.id}>
                    {hm.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            Telefono (opcional)
            <input
              value={newStudent.telefono}
              onChange={(e) => setNewStudent({ ...newStudent, telefono: e.target.value })}
            />
          </label>
          <label>
            Ciudad (opcional)
            <input
              value={newStudent.ciudad}
              onChange={(e) => setNewStudent({ ...newStudent, ciudad: e.target.value })}
            />
          </label>

          {newStudent.rol === 'Hermano_Menor' ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Debe materias de semestres anteriores</h3>
            {materiasPrevias.length === 0 ? (
              <small style={{ color: 'var(--ink-muted)' }}>No hay materias previas disponibles.</small>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                {materiasPrevias.map((materia) => (
                  <label key={materia.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={newStudent.materiasRepeticionIds.includes(materia.id)}
                      onChange={() =>
                        setNewStudent({
                          ...newStudent,
                          materiasRepeticionIds: toggleNumber(
                            newStudent.materiasRepeticionIds,
                            materia.id,
                          ),
                        })
                      }
                    />
                    <span>{materia.nombre}</span>
                  </label>
                ))}
              </div>
            )}
            </div>
          ) : null}

          {newStudent.rol === 'Hermano_Menor' ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Cursa materias del siguiente semestre</h3>
            {materiasSiguiente.length === 0 ? (
              <small style={{ color: 'var(--ink-muted)' }}>
                No hay materias del siguiente semestre disponibles.
              </small>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                {materiasSiguiente.map((materia) => (
                  <label key={materia.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={newStudent.materiasAdelantoIds.includes(materia.id)}
                      onChange={() =>
                        setNewStudent({
                          ...newStudent,
                          materiasAdelantoIds: toggleNumber(
                            newStudent.materiasAdelantoIds,
                            materia.id,
                          ),
                        })
                      }
                    />
                    <span>{materia.nombre}</span>
                  </label>
                ))}
              </div>
            )}
            </div>
          ) : null}

          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
              marginTop: '0.5rem',
            }}
          >
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setShowCreateForm(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={creatingStudent}>
              {creatingStudent ? 'Creando...' : 'Crear estudiante'}
            </button>
          </div>
        </form>
      )}

      {profile?.rol === 'Tutor' ? (
        <div className="stack-lg">
          {tutorGroups.length === 0 ? (
            <div className="card">
              <p>No hay hermanos menores registrados para mostrar.</p>
            </div>
          ) : (
            tutorGroups.map((grupo) => (
              <article key={grupo.hermanoMayor?.id ?? 'sin_asignar'} className="card stack-md">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <p className="eyebrow">Grupo liderado por</p>
                    <h3 style={{ marginBottom: '0.3rem' }}>
                      {grupo.hermanoMayor?.nombre ?? 'Sin hermano mayor asignado'}
                    </h3>
                    <small style={{ color: 'var(--ink-muted)' }}>
                      Total estudiantes: {grupo.totalEstudiantes}
                    </small>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="pill">Total: {grupo.totalEstudiantes}</span>
                    <span className="pill pill-ok">Completado: {grupo.completados}</span>
                    <span className="pill pill-warn">En progreso: {grupo.enProgreso}</span>
                    <span className="pill pill-danger">Sin registro: {grupo.sinRegistro}</span>
                  </div>
                </div>

                {grupo.hermanoMayor ? (
                  editingHmId === grupo.hermanoMayor.id ? (
                    <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
                      <h3>Editando Hermano Mayor: {grupo.hermanoMayor.nombre}</h3>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '0.75rem',
                        }}
                      >
                        <label>
                          Telefono
                          <input
                            type="text"
                            value={editingHmData.telefono ?? ''}
                            onChange={(e) =>
                              setEditingHmData({ ...editingHmData, telefono: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Direccion
                          <input
                            type="text"
                            value={editingHmData.direccion ?? ''}
                            onChange={(e) =>
                              setEditingHmData({ ...editingHmData, direccion: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Email personal
                          <input
                            type="email"
                            value={editingHmData.email_personal ?? ''}
                            onChange={(e) =>
                              setEditingHmData({ ...editingHmData, email_personal: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Ciudad
                          <input
                            type="text"
                            value={editingHmData.ciudad ?? ''}
                            onChange={(e) =>
                              setEditingHmData({ ...editingHmData, ciudad: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Semestre
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={editingHmData.semestre ?? ''}
                            onChange={(e) =>
                              setEditingHmData({
                                ...editingHmData,
                                semestre: parseInt(e.target.value, 10) || 1,
                              })
                            }
                          />
                        </label>
                        <label>
                          Estado
                          <select
                            value={editingHmData.status}
                            onChange={(e) =>
                              setEditingHmData({
                                ...editingHmData,
                                status: e.target.value as Estudiante['status'],
                              })
                            }
                          >
                            <option value="Activo">Activo</option>
                            <option value="Inactivo">Inactivo</option>
                            <option value="Graduado">Graduado</option>
                            <option value="Retirado">Retirado</option>
                          </select>
                        </label>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setEditingHmId(null)
                            setEditingHmData({})
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => handleSaveHermanoMayor(grupo.hermanoMayor!.id)}
                          disabled={saving}
                        >
                          {saving ? 'Guardando...' : 'Guardar hermano mayor'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setEditingHmId(grupo.hermanoMayor!.id)
                          setEditingHmData({ ...grupo.hermanoMayor! })
                        }}
                      >
                        Editar hermano mayor
                      </button>
                    </div>
                  )
                ) : null}

                {grupo.hermanoMayor && menoresSinAsignar.length > 0 ? (
                  <div className="card" style={{ padding: '0.85rem', display: 'grid', gap: '0.65rem' }}>
                    <small style={{ color: 'var(--ink-muted)' }}>
                      Sin hermanos menores asignados
                    </small>
                    {assigningHmId === grupo.hermanoMayor.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
                        <label style={{ margin: 0, minWidth: '250px' }}>
                          Hermano menor sin asignar
                          <select
                            value={menorSinHmId}
                            onChange={(e) =>
                              setMenorSinHmId(e.target.value ? parseInt(e.target.value, 10) : '')
                            }
                          >
                            <option value="">Selecciona un hermano menor</option>
                            {menoresSinAsignar.map((item) => (
                              <option key={item.estudianteId} value={item.estudianteId}>
                                {item.estudianteData.nombre} ({item.estudianteData.cedula})
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={!menorSinHmId}
                          onClick={() => handleAsignarHermanoMenor(grupo.hermanoMayor!.id)}
                        >
                          Confirmar asignacion
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setAssigningHmId(null)
                            setMenorSinHmId('')
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => setAssigningHmId(grupo.hermanoMayor!.id)}
                        disabled={menoresSinAsignar.length === 0}
                      >
                        {menoresSinAsignar.length === 0
                          ? 'No hay hermanos menores disponibles'
                          : 'Asignar hermanos menores'}
                      </button>
                    )}
                  </div>
                ) : null}

                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {grupo.estudiantes.map((item) => (
                    editingId === item.estudianteId ? (
                      <article
                        key={item.estudianteId}
                        className="card"
                        style={{ display: 'grid', gap: '0.75rem' }}
                      >
                        <h3>Editando a {item.estudianteData.nombre}</h3>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '0.75rem',
                          }}
                        >
                          <label>
                            Telefono
                            <input
                              type="text"
                              value={editingData.telefono ?? ''}
                              onChange={(e) =>
                                setEditingData({ ...editingData, telefono: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Direccion
                            <input
                              type="text"
                              value={editingData.direccion ?? ''}
                              onChange={(e) =>
                                setEditingData({ ...editingData, direccion: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Email personal
                            <input
                              type="email"
                              value={editingData.email_personal ?? ''}
                              onChange={(e) =>
                                setEditingData({ ...editingData, email_personal: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Ciudad
                            <input
                              type="text"
                              value={editingData.ciudad ?? ''}
                              onChange={(e) =>
                                setEditingData({ ...editingData, ciudad: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Semestre
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={editingData.semestre ?? ''}
                              onChange={(e) =>
                                setEditingData({
                                  ...editingData,
                                  semestre: parseInt(e.target.value, 10) || 1,
                                })
                              }
                            />
                          </label>
                          <label>
                            Hermano Mayor asignado
                            <select
                              value={editingData.hermano_mayor ?? ''}
                              onChange={(e) =>
                                setEditingData({
                                  ...editingData,
                                  hermano_mayor: parseInt(e.target.value, 10) || null,
                                })
                              }
                            >
                              <option value="">Sin asignar</option>
                              {hermanosMayores.map((hm) => (
                                <option key={hm.id} value={hm.id}>
                                  {hm.nombre}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Estado
                            <select
                              value={editingData.status}
                              onChange={(e) =>
                                setEditingData({
                                  ...editingData,
                                  status: e.target.value as Estudiante['status'],
                                })
                              }
                            >
                              <option value="Activo">Activo</option>
                              <option value="Inactivo">Inactivo</option>
                              <option value="Graduado">Graduado</option>
                              <option value="Retirado">Retirado</option>
                            </select>
                          </label>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                            Cancelar
                          </button>
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => handleSave(item.estudianteId)}
                            disabled={saving}
                          >
                            {saving ? 'Guardando...' : 'Guardar datos'}
                          </button>
                        </div>
                      </article>
                    ) : (
                      <div
                        key={item.estudianteId}
                        style={{
                          border: '1px solid var(--line)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.75rem',
                          display: 'grid',
                          gap: '0.35rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <strong>{item.estudianteData.nombre}</strong>
                          <span className={stateClass(item.progreso)}>{item.progreso}</span>
                        </div>
                        <small style={{ color: 'var(--ink-muted)' }}>
                          Cedula: {item.estudianteData.cedula} | Semestre: {item.estudianteData.semestre} | Grupo: {item.estudianteData.grupo}
                        </small>
                        <small style={{ color: 'var(--ink-muted)' }}>
                          Asistencia semanal: {item.asistenciaRealizada}/{item.materias} | Estado: {item.estudianteData.status}
                        </small>
                        <small style={{ color: 'var(--ink-muted)' }}>
                          Telefono: {item.estudianteData.telefono ?? '-'} | Ciudad: {item.estudianteData.ciudad ?? '-'}
                        </small>
                        <small style={{ color: 'var(--ink-muted)' }}>
                          Correo institucional: {item.estudianteData.email} | Correo personal: {item.estudianteData.email_personal ?? '-'}
                        </small>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => {
                              setEditingId(item.estudianteId)
                              setEditingData(item.estudianteData)
                            }}
                          >
                            Editar
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="list-card">
          {rows.length === 0 ? (
            <p>No hay estudiantes asignados para mostrar.</p>
          ) : (
          rows.map((item) => {
            if (editingId === item.estudianteId) {
              return (
                <article
                  className="card"
                  key={item.estudianteId}
                  style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                >
                  <h3>Editando a {item.nombre}</h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    <label>
                      Telefono
                      <input
                        type="text"
                        value={editingData.telefono ?? ''}
                        onChange={(e) =>
                          setEditingData({ ...editingData, telefono: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Direccion
                      <input
                        type="text"
                        value={editingData.direccion ?? ''}
                        onChange={(e) =>
                          setEditingData({ ...editingData, direccion: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Email personal
                      <input
                        type="email"
                        value={editingData.email_personal ?? ''}
                        onChange={(e) =>
                          setEditingData({ ...editingData, email_personal: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Ciudad
                      <input
                        type="text"
                        value={editingData.ciudad ?? ''}
                        onChange={(e) => setEditingData({ ...editingData, ciudad: e.target.value })}
                      />
                    </label>
                    <label>
                      Semestre
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={editingData.semestre ?? ''}
                        onChange={(e) =>
                          setEditingData({
                            ...editingData,
                            semestre: parseInt(e.target.value, 10) || 1,
                          })
                        }
                      />
                    </label>
                    <label>
                      Hermano Mayor asignado
                      <select
                        value={editingData.hermano_mayor ?? ''}
                        onChange={(e) =>
                          setEditingData({
                            ...editingData,
                            hermano_mayor: parseInt(e.target.value, 10) || null,
                          })
                        }
                      >
                        <option value="">Sin asignar</option>
                        {hermanosMayores.map((hm) => (
                          <option key={hm.id} value={hm.id}>
                            {hm.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Estado
                      <select
                        value={editingData.status}
                        onChange={(e) =>
                          setEditingData({
                            ...editingData,
                            status: e.target.value as Estudiante['status'],
                          })
                        }
                      >
                        <option value="Activo">Activo</option>
                        <option value="Inactivo">Inactivo</option>
                        <option value="Graduado">Graduado</option>
                        <option value="Retirado">Retirado</option>
                      </select>
                    </label>
                  </div>

                  <div className="card" style={{ padding: '1rem' }}>
                    <h3 style={{ marginBottom: '0.75rem' }}>Gestion de matricula</h3>
                    {loadingMatriculas ? (
                      <p>Cargando matricula...</p>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                          {matriculasEdicion.length === 0 ? (
                            <small style={{ color: 'var(--ink-muted)' }}>
                              El estudiante no tiene materias matriculadas.
                            </small>
                          ) : (
                            matriculasEdicion.map((matricula) => (
                              <div
                                key={matricula.id}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  border: '1px solid var(--line)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '0.5rem 0.75rem',
                                }}
                              >
                                <div>
                                  <strong>{matricula.materia?.nombre ?? `Materia #${matricula.materia_id}`}</strong>
                                  <div>
                                    <small style={{ color: 'var(--ink-muted)' }}>
                                      Semestre {matricula.materia?.semestre ?? '-'}
                                    </small>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <span className={matriculaTipoClass(matricula.tipo)}>
                                    {matriculaTipoLabel(matricula.tipo)}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn-ghost btn-sm"
                                    onClick={() => handleDeleteMatriculaEdicion(matricula.materia_id)}
                                  >
                                    Quitar
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr auto',
                            gap: '0.5rem',
                            alignItems: 'end',
                          }}
                        >
                          <label>
                            Materia a agregar
                            <select
                              value={materiaAgregarId}
                              onChange={(e) => {
                                const materiaId = e.target.value ? parseInt(e.target.value, 10) : ''
                                setMateriaAgregarId(materiaId)
                                if (materiaId && editingEstudianteSemestre) {
                                  const materia = materiasDisponiblesEdicion.find((m) => m.id === materiaId)
                                  if (materia) {
                                    const tipo = calcularTipoMatricula(materia.semestre, editingEstudianteSemestre)
                                    setTipoAgregar(tipo)
                                  }
                                }
                              }}
                            >
                              <option value="">Selecciona una materia</option>
                              {materiasDisponiblesEdicion.map((materia) => (
                                <option key={materia.id} value={materia.id}>
                                  {materia.nombre} (Semestre {materia.semestre})
                                </option>
                              ))}
                            </select>
                          </label>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem',
                              minHeight: '2.5rem',
                            }}
                          >
                            {materiaAgregarId && editingEstudianteSemestre ? (
                              <span className={matriculaTipoClass(tipoAgregar)}>
                                {matriculaTipoLabel(tipoAgregar)}
                              </span>
                            ) : (
                              <small style={{ color: 'var(--ink-muted)' }}>Selecciona una materia</small>
                            )}
                          </div>

                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={handleAddMatriculaEdicion}
                            disabled={!materiaAgregarId}
                          >
                            Agregar
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      justifyContent: 'flex-end',
                      marginTop: '0.5rem',
                    }}
                  >
                    <button
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setEditingId(null)
                      setEditingEstudianteSemestre(null)
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => handleSave(item.estudianteId)}
                    disabled={saving}
                  >
                    {saving ? 'Guardando...' : 'Guardar datos'}
                  </button>
                  </div>
                </article>
              )
            }

            return (
              <article className="list-row" key={item.estudianteId}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3>{item.nombre}</h3>
                    {item.estudianteData.status !== 'Activo' && (
                      <span className="pill pill-danger">{item.estudianteData.status}</span>
                    )}
                  </div>
                  <small style={{ color: 'var(--ink-muted)' }}>
                    {item.asistenciaRealizada}/{item.materias} asistencias registradas | Semestre{' '}
                    {item.estudianteData.semestre}
                  </small>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginTop: '0.5rem',
                  }}
                >
                  <span className={stateClass(item.progreso)}>{item.progreso}</span>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setEditingId(item.estudianteId)
                      setEditingData(item.estudianteData)
                      loadEditorMatriculas(item.estudianteData)
                    }}
                  >
                    Editar
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => handleCopy(item.estudianteData)}>
                    Copiar
                  </button>
                </div>
              </article>
            )
          })
          )}
        </div>
      )}
    </section>
  )
}
