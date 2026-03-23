# Asistencia App (React + Supabase)

WebApp para el registro de asistencia de los estudiantes de Jovenes a la E.

## Stack

- React + TypeScript + Vite
- Supabase (Auth + Postgres)
- pnpm

## Funcionalidad implementada

- Landing publica
- Pantalla de login segura (Supabase Auth)
- Dashboard con metricas semanales/semestrales y KPIs
- Vista de materias pendientes/completadas
- Formulario interactivo de registro de asistencia
- Panel de Hermano Mayor para ver progreso de su grupo
- Diseño "Glassmorphism" con los colores de la Universidad de La Salle
- Rutas protegidas por autenticacion y rol

## Configuracion local

1. Instalar dependencias:

```bash
pnpm install
```

2. Crear variables de entorno:

```bash
cp .env.example .env
```

3. Completar en `.env`:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

4. Crear o configurar la Base de Datos:

- Crea tablas en PostgresSQL o Supabase.
Debes asegurarte de:
- Configurar las tablas principales (`estudiantes`, `materias`, `semanas`, `asistencias`) en tu proyecto de Supabase.
- Asegurar que la tabla de `estudiantes` tenga al usuario creado utilizando el servicio `auth.users` de Supabase, el cual maneja la encripcion de constraseñas de forma segura. El frontend consultara el login contra dicha tabla.

5. Correr en local:

```bash
pnpm dev
```

## Despliegue publico

- Frontend: Vercel o Netlify (desde GitHub)
- Base: Supabase
- Variables de entorno en plataforma de despliegue

## Modelo de acceso recomendado

- Usuarios autenticados en Supabase Auth
- El perfil se resuelve por email (`auth.user.email` = `estudiantes.email`)
- `rol = Hermano_Menor`: ve y registra su propia asistencia
- `rol = Hermano_Mayor`: ve resumen de sus estudiantes asignados
- Solo estudiantes con `status = Activo` pueden entrar al flujo

## Parametros para localhost

Debes configurar estos 2 valores en `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

Donde encontrarlos en Supabase:

- `Project Settings > API > Project URL`
- `Project Settings > API > Project API keys > anon public`

## Rutas

- `/` Landing publica
- `/login` Login
- `/dashboard` Resumen
- `/materias` Registro por materia
- `/asistencia/:materiaId` Formulario
- `/registro` Panel hermano mayor
