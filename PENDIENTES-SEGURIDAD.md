# Pendientes de seguridad — OBLIGATORIOS antes de publicar la app

Este archivo registra decisiones tomadas para facilitar el desarrollo local
que DEBEN revisarse antes de lanzar la app a producción o compartirla con usuarios reales.

---

## 1. Políticas RLS abiertas (USING true)

**Tablas afectadas:**
- `atletas`
- `ejercicios_propios`
- `ejercicios_custom`
- `rutinas`
- `sesiones`

**Qué hace ahora:**
Cualquier persona con la URL de Supabase puede leer y escribir en estas tablas,
aunque no esté autenticada. Fue necesario para poder probar sin login.

**Qué debe hacer en producción:**
Restringir cada política para que solo el coach dueño de los datos pueda
acceder a los suyos. Ejemplo:

```sql
-- En lugar de: USING (true)
-- Usar: USING (auth.uid() = coach_id)
```

---

## 2. Login desactivado en Supabase

**Problema:** El proveedor de email está desactivado en la configuración de Supabase.
**Solución:** Activar "Email" en Supabase → Authentication → Providers → Email.

---

## 3. Botón "Entrar sin login" en producción

**Archivo:** `src/app/login/page.tsx`
**Qué hace:** Permite saltarse el login directamente al dashboard.
**Solución:** Eliminar ese botón antes de publicar.

---

## 4. Contraseña débil del usuario de prueba

El usuario `admin@nexa.cl` fue creado con contraseña `123456`.
Cambiar a una contraseña segura antes de publicar.

---

*Última actualización: 2026-07-21*
