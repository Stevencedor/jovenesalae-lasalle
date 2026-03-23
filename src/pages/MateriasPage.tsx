import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import {
  getDashboardMetrics,
  getMateriasConRegistroSemana,
} from '../services/asistenciaService'
import type { Materia } from '../types/domain'

type MateriaConEstado = Materia & { registro: boolean }

export function MateriasPage() {
  const { profile } = useAuth()
  const [materias, setMaterias] = useState<MateriaConEstado[]>([])
  const [semanaTexto, setSemanaTexto] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) {
      return
    }

    getDashboardMetrics(profile)
      .then(async (metrics) => {
        if (!metrics.semanaObjetivo) {
          setMaterias([])
          setSemanaTexto('No hay semana activa para registrar.')
          setLoading(false)
          return
        }

        const rows = await getMateriasConRegistroSemana(profile, metrics.semanaObjetivo.id)
        setMaterias(rows)
        setSemanaTexto(`Registro semana ${metrics.semanaObjetivo.semana_academica}`)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el listado')
        setLoading(false)
      })
  }, [profile])

  if (loading) {
    return <div className="card">Cargando materias...</div>
  }

  if (error) {
    return <div className="card error-text">{error}</div>
  }

  return (
    <section className="stack-lg">
      <div className="card">
        <p className="eyebrow">Registro</p>
        <h1>{semanaTexto}</h1>
      </div>

      <div className="list-card">
        {materias.length === 0 ? (
          <p>No hay materias disponibles.</p>
        ) : (
          materias.map((materia) => (
            <article key={materia.id} className="list-row">
              <div>
                <h3>{materia.nombre}</h3>
                <small>{materia.registro ? 'Ya registrada' : 'Pendiente de registro'}</small>
              </div>

              {materia.registro ? (
                <span className="pill pill-ok">Completado</span>
              ) : (
                <Link className="btn-primary" to={`/asistencia/${materia.id}`}>
                  Registrar
                </Link>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  )
}
