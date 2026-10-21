# Estado de conexión a Supabase — NEXA

Última actualización: 2026-08-13

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
- **Operaciones:** guardar y leer (dashboard y progreso ya leen desde `getSesionesDB()`; localStorage
  queda solo como respaldo si falla la conexión, y marca los datos como "stale" en pantalla)

### Calendario
- **Qué hace:** muestra las rutinas en el calendario mensual
- **Estado:** lee desde Supabase (tabla `rutinas`) con fallback al navegador si la tabla está vacía

### Dashboard / Progreso
- **Qué muestra:** resumen general (alumnos activos, sesiones recientes, alertas) e historial de progreso
- **Estado:** consultan Supabase primero (`getAlumnos()`, `getSesionesDB()`); si la consulta falla,
  usan la última copia en localStorage como respaldo y avisan en pantalla que los datos pueden estar desactualizados

---

### Planes y Reservas
- **Qué guarda:** planes de clases por alumno (mensual/trimestral/personalizado), reservas con estado de asistencia
- **Tablas en Supabase:** `planes`, `reservas`, `reagendas`
- **Operaciones:** crear/editar/eliminar plan, crear reservas únicas o recurrentes (días de semana), cambiar estado de asistencia con recálculo automático de clases usadas
- **Lógica de negocio:** presente/no_show/cancelada_tarde queman clase; cancelada_nexa/bloqueada NO queman
- **UI:** integrado en el perfil del alumno `/alumnos/[id]`
- **Check-in en tiempo real:** la pantalla de check-in (`/horario`) se suscribe a cambios en `reservas`
  del día vía Supabase Realtime — si otro dispositivo marca presente/no-show, se refleja solo, sin
  necesidad de apretar "Actualizar" (migración `032_confirmar_pedido_atomico_y_realtime.sql`)

## ❌ Secciones que todavía faltan conectar

### Reagendas
- **Qué guarda hoy:** solicitudes de cambio de fecha vinculadas a una reserva original
- **Guardado actual:** navegador (`nexa_reagendas`)
- **Tabla en Supabase:** existe (`reagendas`) pero sin UI conectada todavía

### Progreso — mediciones corporales
- **Estado:** el historial de peso por ejercicio ya lee desde `sesiones` (Supabase); las mediciones
  corporales (peso corporal, %grasa, etc.) siguen solo en el navegador

---

## Rendimiento y consistencia (revisión 2026-08-13)

- **Índices:** se agregaron índices explícitos en `reservas` (fecha, alumno_id, plan_id, y compuestos
  para el horario/check-in), `atletas` (email, telefono, rut) y `sesiones`/`planes`/`pedidos_grupales`.
  Postgres no indexa automáticamente las llaves foráneas, así que sin esto las consultas se iban a poner
  lentas a medida que se acumule historial de reservas. Ver `031_indexes_rendimiento.sql`.
- **Webhook de pago (Flow):** `confirmar_pedido_grupal_pago` mueve toda la lógica de "buscar/crear
  atleta → buscar/crear reserva → marcar pagado" a una sola función de Postgres con
  `SELECT ... FOR UPDATE`, igual que ya hacía `reservar_clase_grupal` para los cupos. Antes, un reintento
  del webhook (frecuente en pasarelas de pago) podía crear un atleta o una reserva duplicada. Ver
  `032_confirmar_pedido_atomico_y_realtime.sql`.

**Importante — estas dos migraciones nuevas (031 y 032) están en el repo pero no se aplican solas:**
hay que correr `supabase db push` (o pegarlas en el SQL Editor del proyecto en Supabase) para que los
índices y la función existan en la base de datos real. El código de `confirmar/route.ts` ya asume que
`confirmar_pedido_grupal_pago` existe, así que hay que aplicar `032` antes de recibir el próximo pago
real por Flow — o ese webhook fallará.

## Notas

- Los datos del navegador NO se borran cuando se conecta una sección a Supabase — siempre se migra con fallback
- Ver `PENDIENTES-SEGURIDAD.md` para las tareas de seguridad obligatorias antes de publicar
- Ver `COMO-VOLVER-ATRAS.md` para instrucciones de rescate si algo sale mal

---

## Página pública de planes y compra en línea (2026-10-21)

- **`/planes`** (nueva): portada con foto (`public/nexa-hero.jpg`), packs grupales (`planes_grupales`)
  y planes 1:1 / 2:1 (`precios_entrenamiento` + `precios_entrenamiento_config`) con pestañas
  Mensual/Trimestral/Semestral, cómo funciona, preguntas frecuentes y pie. `/` usa el mismo diseño.
- **Packs grupales**: se compran con cuenta (`/grupales-alumno/*`): login/registro dentro del modal,
  elección de primera clase con cupos reales, pago Flow, saldo y vigencia en "Mi cuenta".
- **1:1 / 2:1**: mismo flujo de antes (`/api/reservar/*`), ahora en un modal dentro de `/planes`.
  `/clases-grupales` redirige a `/planes#personalizado`.
- Admin `/grupales` restaurado (packs, horario, alumnos con cuenta y su asistencia).

**Migración nueva `034_compras_grupales_catalogo_unico.sql` — hay que aplicarla antes de publicar**
(`supabase db push` o pegarla en el SQL Editor). Sin ella fallan la compra y la reserva de packs.
Además deben estar aplicadas 026 y 033 (siguen sin commitear en el repo).

Pendiente / a revisar:
- Probar un pago real en el sandbox de Flow (no hay credenciales en el repo; no se probó contra Flow).
- Flow devuelve a `/api/grupales-alumno/retorno` y `/api/reservar/retorno` (aceptan POST y GET).
- 1:1 / 2:1 no tiene modelo de cupos por coach: la hora es "preferida" y el staff asigna coach.
- No hay cancelación de clases grupales por el alumno (no existe política definida en el proyecto).
- `middleware.ts` está deprecado en Next 16 (renombrar a `proxy.ts` cuando convenga).

## Inscripción de planes 1:1 / 2:1 por día (2026-10-21)

- "Inscribir alumno" (perfil del alumno) ahora: modalidad 1:1 / 2:1 tomada de la ficha, semana completa
  del profesor (lun–sáb) con cupos reales, una hora distinta por día, "Todos los miércoles…" y
  "Copiar esta semana a todo el plan". Cada clase se puede mover o quitar sin afectar las demás.
- Las clases se guardan como '2:1 Duo' o '1:1 Individual' según la modalidad, y el plan con su modalidad.
- Reagendar una clase conserva su tipo (1:1 / 2:1) y su profesor.
- **Migración `035_corregir_planes_2a1.sql`**: corrige planes y clases futuras de alumnos 2:1 que se
  guardaron como 1:1. Aplicarla después de la 034.
