# Paso a producción de las migraciones 050–053

Proyecto Supabase de producción: el de `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` (`rzeuzk…`).
Tiene datos reales: no aplicar nada sin respaldo.

## Orden

1. **Diagnóstico (solo lectura):** ejecutar `00_diagnostico_permisos.sql` y guardar el resultado.
2. **Respaldo:**
   - Supabase → Database → Backups: descargar o confirmar un respaldo de hoy.
   - Ejecutar `01_respaldo_antes_050_053.sql` (copia tablas, políticas, funciones y permisos al esquema `respaldo_050`).
3. **Secreto de correos:**
   - Generar un valor aleatorio largo (p. ej. `openssl rand -hex 32`).
   - En el SQL Editor: `SELECT vault.create_secret('<valor>', 'nexa_notificaciones_secret');`
   - En Vercel (Production): variable `NOTIFICACIONES_SECRET=<mismo valor>`. Revisar también `CRON_SECRET`, `RESEND_API_KEY` y `RESEND_FROM`.
4. **Migraciones:** pegar completo `02_aplicar_050_053.sql` en el SQL Editor y ejecutar.
   Contiene 050 → 051 → 052 → 053 dentro de una transacción: si algo falla, no queda nada aplicado.
   (Ensayado sobre la estructura de producción en `src/lib/aplicar-produccion-sql.test.ts`.)
5. **Desplegar el código** en Vercel (después de las migraciones: el código nuevo usa sus funciones).
6. **Supabase → Authentication → Sign In / Providers:** desactivar "Allow new users to sign up".
   La app crea todas las cuentas desde el servidor; el registro público directo no se usa.
7. **Verificar:** volver a ejecutar `00_diagnostico_permisos.sql` y comparar.

## Si algo falla

- Volver a desplegar en Vercel la versión anterior del código.
- Ejecutar `03_volver_atras_050_053.sql` (requiere el esquema `respaldo_050`).
- No borra datos ni pagos registrados.

## Qué cambia en datos existentes

- `auth.users.raw_app_meta_data`: se agrega `rol` copiado desde `perfiles` (o `grupales`).
- `perfiles`: se reemplazan sus políticas (se guardan en `respaldo_050.politicas`).
- `incidencias`: se agrega una por cada grupo de reservas duplicadas activas (hoy: ninguno).
- Columnas nuevas vacías: `pagos.referencia_pago`, `pedidos_planes.revision_motivo`,
  `pedidos_planes.clases_sin_agendar`, `notificaciones.reclamada_at`.
- No se borran ni modifican alumnos, planes, reservas ni pagos.

Al primer envío, los 13 recordatorios atrasados (clases ya pasadas) quedan como "omitida": no se envían.
