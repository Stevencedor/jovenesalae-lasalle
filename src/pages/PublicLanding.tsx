import { Link } from 'react-router-dom'

export function PublicLanding() {
  return (
    <div className="landing">
      <section className="hero-block">
        <p className="eyebrow">Jovenes a la E</p>
        <h1>Registro semanal de asistencia</h1>
        <p>
          Plataforma web para consulta general y acceso seguro para
          estudiantes y hermanos mayores.
        </p>
        <div className="hero-actions">
          <Link to="/login" className="btn-primary">
            Iniciar sesion
          </Link>
        </div>
      </section>

      <section className="grid-features" id="beneficios">
        <article>
          <h3>Seguimiento semanal</h3>
          <p>
            Calcula avance por semana, por semestre y estado de cada materia en
            tiempo real.
          </p>
        </article>
        <article>
          <h3>Control por rol</h3>
          <p>
            Cada estudiante ve solo su informacion, y hermano mayor revisa su
            grupo asignado.
          </p>
        </article>
        <article>
          <h3>Datos centralizados</h3>
          <p>
            Historial unificado en Supabase con reglas de acceso para proteger
            datos sensibles.
          </p>
        </article>
      </section>
    </div>
  )
}
