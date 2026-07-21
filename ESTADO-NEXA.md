# Estado de conexión a Supabase — NEXA

Última actualización: 2026-07-21

---

## ✅ Secciones conectadas a Supabase

### Alumnos
- **Qué guarda:** nombre, apellido, email, fecha de nacimiento, peso, altura, foto, estado (activo/pendiente/archivado)
- **Tabla en Supabase:** `atletas`
- **Operaciones:** crear, editar, listar, eliminar

### Ejercicios / Biblioteca
- **Qué guarda:** ejercicios creados por el coach (propios) y personalizaciones de video/nombre de la biblioteca base
- **Tablas en Supabase:** `ejercicios_propios`, `ejercicios_custom`
- **Operaciones:** crear, editar, listar, eliminar

### Rutinas
- **Qué guarda:** la rutina asignada a cada atleta, con nombre, fechas de inicio/fin y sesiones por día
- **Tabla en Supabase:** `rutinas`
- **Operaciones:** crear, editar, listar (eliminación pendiente de conectar)

### Sesiones de entrenamiento (Weightroom)
- **Qué guarda:** cada sesión registrada — qué atleta, qué día, qué ejercicios hizo, series, repeticiones, peso
- **Tabla en Supabase:** `sesiones`
- **Operaciones:** guardar (lectura pendiente de conectar)

### Calendario
- **Qué hace:** muestra las rutinas en el calendario mensual
- **Estado:** lee desde Supabase (tabla `rutinas`) con fallback al navegador si la tabla está vacía

---

### Planes y Reservas
- **Qué guarda:** planes de clases por alumno (mensual/trimestral/personalizado), reservas con estado de asistencia
- **Tablas en Supabase:** `planes`, `reservas`, `reagendas`
- **Operaciones:** crear/editar/eliminar plan, crear reservas únicas o recurrentes (días de semana), cambiar estado de asistencia con recálculo automático de clases usadas
- **Lógica de negocio:** presente/no_show/cancelada_tarde queman clase; cancelada_nexa/bloqueada NO queman
- **UI:** integrado en el perfil del alumno `/alumnos/[id]`

## ❌ Secciones que todavía faltan conectar

### Reagendas
- **Qué guarda hoy:** solicitudes de cambio de fecha vinculadas a una reserva original
- **Guardado actual:** navegador (`nexa_reagendas`)
- **Tabla en Supabase:** existe (`reagendas`) pero sin UI conectada todavía

### Dashboard
- **Qué muestra:** resumen general (alumnos activos, sesiones recientes, alertas)
- **Estado:** lee desde localStorage — cuando Planes y Reservas estén en Supabase, hay que actualizar las consultas

### Progreso
- **Qué muestra:** historial de peso por ejercicio, mediciones corporales del atleta
- **Estado:** historial de peso ya lee desde `sesiones` (localStorage); mediciones corporales están solo en el navegador

---

## Notas

- Los datos del navegador NO se borran cuando se conecta una sección a Supabase — siempre se migra con fallback
- Ver `PENDIENTES-SEGURIDAD.md` para las tareas de seguridad obligatorias antes de publicar
- Ver `COMO-VOLVER-ATRAS.md` para instrucciones de rescate si algo sale mal
