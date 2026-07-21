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

### Vista de alumno (futuro)
El rol `alumno` existe en la tabla pero sin políticas todavía.
Cuando se implemente el acceso para alumnos, agregar políticas
que limiten cada tabla a `alumno_id = auth.uid()`.
