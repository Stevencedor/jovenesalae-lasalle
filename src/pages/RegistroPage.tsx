import { useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { getResumenHermanoMayor, getSemanaActual } from '../services/asistenciaService'
import type { ResumenAsistencia } from '../types/domain'

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

  useEffect(() => {
    if (!profile || profile.rol !== 'Hermano_Mayor') {
      return
    }

    getSemanaActual()
      .then(async (semana) => {
        if (!semana) {
          setRows([])
          setTitle('No hay semana activa')
          setLoading(false)
          return
        }

        setTitle(`Resumen semana ${semana.semana_academica}`)
        const resumen = await getResumenHermanoMayor(profile.id, semana.id)
        setRows(resumen)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el panel')
        setLoading(false)
      })
  }, [profile])

  if (loading) {
    return <div className="card">Cargando panel...</div>
  }

  if (profile?.rol !== 'Hermano_Mayor') {
    return <div className="card">Esta vista esta habilitada solo para hermano mayor.</div>
  }

  if (error) {
    return <div className="card error-text">{error}</div>
  }

  return (
    <section className="stack-lg">
      <div className="card">
        <p className="eyebrow">Panel de seguimiento</p>
        <h1>{title}</h1>
      </div>

      <div className="list-card">
        {rows.length === 0 ? (
          <p>No hay estudiantes asignados para mostrar.</p>
        ) : (
          rows.map((item) => (
            <article className="list-row" key={item.estudianteId}>
              <div>
                <h3>{item.nombre}</h3>
                <small>
                  {item.asistenciaRealizada}/{item.materias} asistencias registradas
                </small>
              </div>
              <span className={stateClass(item.progreso)}>{item.progreso}</span>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
