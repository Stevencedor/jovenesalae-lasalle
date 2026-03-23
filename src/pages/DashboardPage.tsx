import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KpiCard } from '../components/KpiCard'
import { useAuth } from '../context/useAuth'
import { getDashboardMetrics } from '../services/asistenciaService'
import type { DashboardMetrics } from '../types/domain'

function formatPercent(value: number) {
  return `${Math.max(0, value).toFixed(2)}%`
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) {
      return
    }

    getDashboardMetrics(profile)
      .then((result) => {
        setMetrics(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar metricas')
        setLoading(false)
      })
  }, [profile])

  if (loading) {
    return <div className="card">Cargando resumen...</div>
  }

  if (error || !metrics) {
    return <div className="card error-text">{error ?? 'No hay datos para mostrar.'}</div>
  }

  return (
    <section className="stack-xl">
      <div className="card banner">
        <p className="eyebrow">Resumen semanal</p>
        <h1>Hola, {profile?.nombre}</h1>
        <p>
          Semana actual: {metrics.semanaActual?.semana_academica ?? '-'} | Corte:{' '}
          {metrics.semanaActual?.corte_semestre ?? '-'}
        </p>
      </div>

      <div className="kpi-grid">
        <KpiCard
          title="Materias del semestre"
          value={`${metrics.totalMaterias}`}
          subtitle={`Semestre ${profile?.semestre ?? '-'}`}
        />
        <KpiCard
          title="Asistencia semanal"
          value={formatPercent(metrics.asistenciaSemanalPorcentaje)}
          subtitle={`${metrics.asistenciasSemana} registradas de ${metrics.totalMaterias}`}
        />
        <KpiCard
          title="Asistencia semestral"
          value={formatPercent(metrics.asistenciaSemestralPorcentaje)}
          subtitle={`${metrics.asistenciasTotales} de ${metrics.totalEsperadoSemestre}`}
        />
      </div>

      <div className="card actions-card">
        <h2>Acciones</h2>
        <div className="hero-actions">
          <Link className="btn-primary" to="/materias">
            Registrar asistencia semanal
          </Link>
          {profile?.rol === 'Hermano_Mayor' ? (
            <Link className="btn-ghost" to="/registro">
              Verificar asistencias del grupo
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}
