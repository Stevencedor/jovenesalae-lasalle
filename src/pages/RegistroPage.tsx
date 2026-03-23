import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../context/useAuth'
import { getResumenHermanoMayor, getSemanaActual, updateEstudiante, getHermanosMayores, getTextoReporteAsistencia, getTodasLasSemanas, crearEstudiante } from '../services/asistenciaService'
import type { Estudiante, ResumenAsistencia, Semana } from '../types/domain'

function stateClass(text: ResumenAsistencia['progreso']) {
  if (text === 'Completado') {
    return 'pill pill-ok'
  }

  if (text === 'En progreso') {
    return 'pill pill-warn'
  }

  return 'pill pill-danger'
}

export function RegistroPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ResumenAsistencia[]>([])
  const [title, setTitle] = useState('Resumen semanal')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingData, setEditingData] = useState<Partial<Estudiante>>({})
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
    telefono: '',
    ciudad: '',
  })

  const loadData = async (semanaIdToLoad?: number) => {
    const targetId = semanaIdToLoad ?? semanaActiva?.id
    if (!targetId) return

    setLoading(true)
    try {
      const [resumen, hmList, allSemanas] = await Promise.all([
        getResumenHermanoMayor(profile!.id, targetId),
        getHermanosMayores(),
        semanas.length === 0 ? getTodasLasSemanas() : Promise.resolve(semanas)
      ])
      
      if (semanas.length === 0) setSemanas(allSemanas)
      
      const current = allSemanas.find(s => s.id === targetId)
      if (current) {
        setSemanaActiva(current)
        setTitle(`Resumen semana ${current.semana_academica}`)
      }
      
      setRows(resumen)
      setHermanosMayores(hmList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el panel')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!profile || profile.rol !== 'Hermano_Mayor') return
    
    getSemanaActual().then(actual => {
      if (actual) {
        loadData(actual.id)
      } else {
        setRows([])
        setTitle('No hay semana activa')
        setLoading(false)
      }
    })
  }, [profile?.id])

  const handleSave = async (id: number) => {
    if (editingData.semestre !== undefined && (editingData.semestre < 1 || editingData.semestre > 10)) {
      toast.error('El semestre debe ser un valor numérico entre 1 y 10.')
      return
    }

    setSaving(true)
    try {
      await updateEstudiante(id, editingData)
      setEditingId(null)
      toast.success('¡Estudiante actualizado correctamente!')
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar los datos del estudiante')
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
      toast.error('Ocurrió un error al generar o copiar el reporte')
    }
  }

  if (loading) {
    return <div className="card">Cargando panel...</div>
  }

  if (profile?.rol !== 'Hermano_Mayor') {
    return <div className="card">Esta vista esta habilitada solo para hermano mayor.</div>
  }

  if (error) {
    return <div className="card error-text">{error}</div>
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
    setCreatingStudent(true)
    try {
      // Pre-check: cédula duplicada
      const { data: existing } = await (await import('../lib/supabase')).supabase
        .from('estudiantes')
        .select('id')
        .eq('cedula', newStudent.cedula)
        .maybeSingle()

      if (existing) {
        toast.error(`Ya existe un estudiante registrado con la cédula ${newStudent.cedula}`)
        setCreatingStudent(false)
        return
      }

      await crearEstudiante({ ...newStudent, hermano_mayor: profile.id })
      toast.success(`¡Estudiante ${newStudent.nombre} creado! Contraseña: LaSalle${newStudent.cedula}`)
      setShowCreateForm(false)
      setNewStudent({ cedula: '', nombre: '', email: '', semestre: 1, grupo: 1, rol: 'Hermano_Menor', telefono: '', ciudad: '' })
      if (semanaActiva) loadData(semanaActiva.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear el estudiante'
      // Detectar error de email duplicado en Auth
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('user already exists')) {
        toast.error(`El email ${newStudent.email} ya tiene una cuenta registrada en el sistema`)
      } else {
        toast.error(msg)
      }
    } finally {
      setCreatingStudent(false)
    }
  }

  return (
    <section className="stack-lg">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="eyebrow">Panel de seguimiento</p>
          <h1>{title}</h1>
        </div>
        
        {semanas.length > 0 && semanaActiva?.corte_semestre && (
          <label style={{ minWidth: '220px', margin: 0 }}>
            Semana Evaluada Periodo {semanaActiva.corte_semestre}
            <select value={semanaActiva?.id ?? ''} onChange={handleSemanaChange}>
              {semanas
                .filter(s => s.corte_semestre === semanaActiva.corte_semestre && s.semana_academica > 0)
                .map(s => (
                <option key={s.id} value={s.id}>Semana {s.semana_academica}</option>
              ))}
            </select>
          </label>
        )}
        <button className="btn-primary btn-sm" onClick={() => setShowCreateForm(v => !v)}>
          {showCreateForm ? '✕ Cancelar' : '+ Nuevo Estudiante'}
        </button>
      </div>

      {showCreateForm && (
        <form className="card" onSubmit={handleCreateStudent} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <h3 style={{ gridColumn: '1 / -1', marginBottom: '0.25rem' }}>Registrar nuevo estudiante</h3>
          <label>Nombre completo<input required value={newStudent.nombre} onChange={e => setNewStudent({...newStudent, nombre: e.target.value})} /></label>
          <label>Cédula<input required value={newStudent.cedula} onChange={e => setNewStudent({...newStudent, cedula: e.target.value})} /></label>
          <label>Email institucional<input required type="email" value={newStudent.email} onChange={e => setNewStudent({...newStudent, email: e.target.value})} /></label>
          <label>Semestre (1-10)<input required type="number" min="1" max="10" value={newStudent.semestre} onChange={e => setNewStudent({...newStudent, semestre: parseInt(e.target.value,10)||1})} /></label>
          <label>Grupo<input required type="number" min="1" value={newStudent.grupo} onChange={e => setNewStudent({...newStudent, grupo: parseInt(e.target.value,10)||1})} /></label>
          <label>Rol
            <select value={newStudent.rol} onChange={e => setNewStudent({...newStudent, rol: e.target.value as any})}>
              <option value="Hermano_Menor">Hermano Menor</option>
              <option value="Hermano_Mayor">Hermano Mayor</option>
            </select>
          </label>
          <label>Teléfono (opcional)<input value={newStudent.telefono} onChange={e => setNewStudent({...newStudent, telefono: e.target.value})} /></label>
          <label>Ciudad (opcional)<input value={newStudent.ciudad} onChange={e => setNewStudent({...newStudent, ciudad: e.target.value})} /></label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowCreateForm(false)}>Cancelar</button>
            <button type="submit" className="btn-primary btn-sm" disabled={creatingStudent}>{creatingStudent ? 'Creando...' : 'Crear Estudiante'}</button>
          </div>
        </form>
      )}

      <div className="list-card">
        {rows.length === 0 ? (
          <p>No hay estudiantes asignados para mostrar.</p>
        ) : (
          rows.map((item) => {
            if (editingId === item.estudianteId) {
              return (
                <article className="card" key={item.estudianteId} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3>Editando a {item.nombre}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <label>
                      Teléfono
                      <input type="text" value={editingData.telefono ?? ''} onChange={e => setEditingData({...editingData, telefono: e.target.value})} />
                    </label>
                    <label>
                      Dirección
                      <input type="text" value={editingData.direccion ?? ''} onChange={e => setEditingData({...editingData, direccion: e.target.value})} />
                    </label>
                    <label>
                      Email Personal
                      <input type="email" value={editingData.email_personal ?? ''} onChange={e => setEditingData({...editingData, email_personal: e.target.value})} />
                    </label>
                    <label>
                      Ciudad
                      <input type="text" value={editingData.ciudad ?? ''} onChange={e => setEditingData({...editingData, ciudad: e.target.value})} />
                    </label>
                    <label>
                      Grupo
                      <input type="number" min="1" value={editingData.grupo ?? ''} onChange={e => setEditingData({...editingData, grupo: parseInt(e.target.value, 10) || 1})} />
                    </label>
                    <label>
                      Semestre
                      <input type="number" min="1" max="10" value={editingData.semestre ?? ''} onChange={e => setEditingData({...editingData, semestre: parseInt(e.target.value, 10) || 1})} />
                    </label>
                    <label>
                      Hermano Mayor Asignado
                      <select value={editingData.hermano_mayor ?? ''} onChange={e => setEditingData({...editingData, hermano_mayor: parseInt(e.target.value, 10) || null as any})}>
                        <option value="">Sin asignar</option>
                        {hermanosMayores.map(hm => (
                          <option key={hm.id} value={hm.id}>{hm.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Estado
                      <select value={editingData.status} onChange={e => setEditingData({...editingData, status: e.target.value as any})}>
                        <option value="Activo">Activo</option>
                        <option value="Inactivo">Inactivo</option>
                        <option value="Graduado">Graduado</option>
                        <option value="Retirado">Retirado</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancelar</button>
                    <button className="btn-primary btn-sm" onClick={() => handleSave(item.estudianteId)} disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar Datos'}
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
                    {item.asistenciaRealizada}/{item.materias} asistencias registradas | Semestre {item.estudianteData.semestre}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <span className={stateClass(item.progreso)}>{item.progreso}</span>
                  <button className="btn-ghost btn-sm" onClick={() => {
                    setEditingId(item.estudianteId)
                    setEditingData(item.estudianteData)
                  }}>
                    ✏️ Editar
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => handleCopy(item.estudianteData)}>
                    📋 Copiar
                  </button>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
