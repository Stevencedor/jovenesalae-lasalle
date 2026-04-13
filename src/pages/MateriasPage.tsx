import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import {
  getDashboardMetrics,
  getMateriasConRegistroSemana,
} from '../services/asistenciaService'
import type { Materia, TipoMatricula, TipoSemanaEspecial } from '../types/domain'

type MateriaConEstado = Materia & { registro: boolean; tipo: TipoMatricula }

function tipoLabel(tipo: TipoMatricula) {
  if (tipo === 'repeticion') {
    return 'Recuperacion'
  }

  if (tipo === 'adelanto') {
    return 'Adelanto'
  }

  return 'Normal'
}

function tipoClass(tipo: TipoMatricula) {
  if (tipo === 'repeticion') {
    return 'pill pill-warn'
  }

  if (tipo === 'adelanto') {
    return 'pill pill-ok'
  }

  return 'pill'
}

export function MateriasPage() {
  const { profile } = useAuth()
  const [materias, setMaterias] = useState<MateriaConEstado[]>([])
  const [semanaTexto, setSemanaTexto] = useState('')
  const [tipoSemanaEspecial, setTipoSemanaEspecial] = useState<TipoSemanaEspecial | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) {
      return
    }

    getDashboardMetrics(profile)
      .then(async (metrics) => {
        setTipoSemanaEspecial(metrics.tipoSemanaEspecial)

        if (metrics.tipoSemanaEspecial) {
          setMaterias([])
          setSemanaTexto(`No requiere asistencia: ${metrics.tipoSemanaEspecial}`)
          setLoading(false)
          return
        }

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

  if (tipoSemanaEspecial) {
    return (
      <section className="stack-lg">
        <div className="card">
          <p className="eyebrow">Registro</p>
          <h1>{semanaTexto}</h1>
          <p>
            Esta semana se cuenta en el calendario, pero no es hábil para tomar asistencia.
          </p>
        </div>
      </section>
    )
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
                <small>
                  {materia.registro ? 'Ya registrada' : 'Pendiente de registro'} |{' '}
                  {tipoLabel(materia.tipo)}
                </small>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className={tipoClass(materia.tipo)}>{tipoLabel(materia.tipo)}</span>
                {materia.registro ? (
                  <span className="pill pill-ok">Completado</span>
                ) : (
                  <Link className="btn-primary" to={`/asistencia/${materia.id}`}>
                    Registrar
                  </Link>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
