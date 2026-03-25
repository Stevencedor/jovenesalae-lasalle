# Asistencia App
![React 19.2.4](https://img.shields.io/badge/React-19.2.4-61DAFB?logo=react&logoColor=000)
![TypeScript 5.9.3](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript&logoColor=fff)
![Vite 8.0.1](https://img.shields.io/badge/Vite-8.0.1-646CFF?logo=vite&logoColor=fff)
![Supabase JS 2.99.3](https://img.shields.io/badge/Supabase_JS-2.99.3-3ECF8E?logo=supabase&logoColor=fff)
![React Router 6.30.1](https://img.shields.io/badge/React_Router-6.30.1-CA4245?logo=reactrouter&logoColor=fff)
![pnpm lockfile v9](https://img.shields.io/badge/pnpm-lockfile_v9-F69220?logo=pnpm&logoColor=fff)

Aplicacion web para el seguimiento de asistencia de Jovenes a la E, con paneles por rol y gestion academica centralizada en Supabase.

## Mejoras recientes

- Experiencia de navegacion mas fluida: la estructura de las vistas se mantiene visible mientras se actualizan datos.
- Carga inteligente: cache local en memoria y persistencia en sessionStorage para conservar estado entre navegacion y recarga del navegador.
- Actualizacion en tiempo real: refresco de datos cuando realmente hay cambios en base de datos.
- Mejor rendimiento del dashboard: reduccion de consultas repetitivas y recalculo controlado de metricas semestrales con TTL por segmento.
- Flujo Tutor fortalecido: vista ejecutiva por grupos, edicion de Hermanos Menores y Hermanos Mayores, y gestion de asignaciones.

## Modulos principales

- Landing publica e inicio de sesion seguro.
- Dashboard con indicadores semanales y semestrales.
- Registro de asistencia por materias.
- Panel de seguimiento para Hermano Mayor y Tutor.
- Gestion de estudiantes y asignaciones por rol.

## Acceso por rol

- Hermano_Menor: registra su asistencia y visualiza su progreso.
- Hermano_Mayor: visualiza seguimiento de sus Hermanos Menores.
- Tutor: vista global, gestion de grupos y edicion de estudiantes.

## Inicio rapido local

1. Instalar dependencias:

```bash
pnpm install
```

2. Configurar entorno:

```bash
cp .env.example .env
```

3. Completar variables en `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

4. Ejecutar proyecto:

```bash
pnpm dev
```

5. Verificar tipos (opcional recomendado):

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
```

## Configuracion de base de datos

- Configura en Supabase las tablas principales: `estudiantes`, `materias`, `semanas`, `asistencias`, `estudiante_materias`.
- Usa Supabase Auth como origen de autenticacion y vincula el perfil por email con la tabla `estudiantes`.
- Revisa los scripts del directorio `supabase/` para estructura y migraciones.

## Rutas principales

- `/` Landing publica
- `/login` Inicio de sesion
- `/dashboard` Resumen y KPIs
- `/materias` Materias del Hermano Menor
- `/asistencia/:materiaId` Registro de asistencia
- `/registro` Panel de seguimiento (Hermano Mayor y Tutor)

## Despliegue

- Frontend: Vercel o Netlify
- Backend y datos: Supabase
- Configura variables de entorno en la plataforma de despliegue
