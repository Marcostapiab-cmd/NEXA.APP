# Seguridad NEXA — Estado actual

*Última actualización: 2026-07-21*

---

## ✅ Resuelto

### Login real activo
- Email provider activado en Supabase Authentication
- Usuario `admin@nexa.cl` con contraseña segura
- Botón "Entrar sin login" eliminado del código

### RLS cerrado en todas las tablas
Todas las tablas tienen políticas restrictivas. Solo usuarios autenticados
con el rol correcto pueden acceder:

| Tabla | Admin | Profesor | Recepcionista | Alumno |
|---|---|---|---|---|
| `atletas` | ✅ todo | ✅ todo | ✅ todo | — |
| `ejercicios_propios` | ✅ todo | ✅ todo | — | — |
| `ejercicios_custom` | ✅ todo | ✅ todo | — | — |
| `rutinas` | ✅ todo | ✅ todo | — | — |
| `sesiones` | ✅ todo | ✅ todo | — | — |
| `planes` | ✅ todo | 👁 lectura | ✅ todo | — |
| `reservas` | ✅ todo | 👁 lectura | ✅ todo | — |
| `reagendas` | ✅ todo | 👁 lectura | ✅ todo | — |

### Tabla `perfiles` con roles
- Creada con función `get_my_role()` para las políticas RLS
- Roles disponibles: `admin`, `profesor`, `recepcionista`, `alumno`

---

## ⚠️ Pendiente antes de agregar más usuarios

### Crear perfiles para cada usuario nuevo
Cuando agregues un profesor o recepcionista en Supabase Auth,
debes insertar su fila en `perfiles` con el rol correcto:

```sql
INSERT INTO public.perfiles (id, rol, nombre)
SELECT id, 'profesor', 'Nombre del Profesor'
FROM auth.users
WHERE email = 'profesor@ejemplo.cl';
```

### Vista de alumno — ✅ Resuelto (verificado 2026-08-11)
Las políticas RLS para el rol `alumno` ya están creadas y activas en producción
(migraciones `010_alumno_bridge.sql` y `016_portal_alumno.sql`). Verificado
directamente en Supabase → Database → Policies: `atletas_alumno_own`,
`atletas_portal_self_read`, y las equivalentes en `reservas`, `planes`, `pagos`
y `sesiones` limitan cada tabla al propio alumno autenticado.
