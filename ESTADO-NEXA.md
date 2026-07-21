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

## ❌ Secciones que todavía faltan conectar

### Planes
- **Qué guarda hoy:** planes de clases por atleta (mensual/trimestral/personalizado), con total de clases y fechas
- **Guardado actual:** navegador (`nexa_planes`)
- **Tabla en Supabase:** no existe todavía — hay que crearla

### Reservas
- **Qué guarda hoy:** reservas de clases por atleta, con fecha, hora y estado
- **Guardado actual:** navegador (`nexa_reservas`)
- **Tabla en Supabase:** no existe todavía — hay que crearla

### Reagendas
- **Qué guarda hoy:** solicitudes de cambio de fecha para una clase reservada
- **Guardado actual:** navegador (`nexa_reagendas`)
- **Tabla en Supabase:** no existe todavía — hay que crearla

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
