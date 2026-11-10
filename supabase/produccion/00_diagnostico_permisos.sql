-- ============================================================
-- NEXA — Diagnóstico de permisos (SOLO LECTURA)
-- ============================================================
-- No modifica nada. Ejecutar en el SQL Editor antes y después de aplicar 050–053
-- y revisar los resultados. Sirve para verificar en la base real lo que el
-- repositorio no muestra (varias políticas se crearon a mano).
-- ============================================================

-- 1. Tablas con datos de alumnos SIN RLS activado (debe salir vacío)
SELECT c.relname AS tabla_sin_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
 ORDER BY 1;

-- 2. Políticas demasiado abiertas en tablas sensibles (revisar cada fila)
SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('atletas','atletas_salud','planes','reservas','reagendas','pagos','sesiones','rutinas',
                     'mediciones','movimientos_credito','notificaciones','perfiles','pedidos_planes',
                     'grupales_alumnos','grupales_compras','grupales_reservas','renovaciones','incidencias',
                     'lista_espera','auditoria_reservas','clientes','prospectos','creditos','asistencia','config','ADMINISTRACION')
   AND (coalesce(qual, '') IN ('true', '')
        OR qual ILIKE '%auth.uid() IS NOT NULL%'
        OR qual ILIKE '%auth.role()%'
        OR 'public' = ANY (roles) OR 'anon' = ANY (roles))
 ORDER BY 1, 2;

-- 3. Todas las políticas de las tablas de alumnos (para revisar que cada alumno vea solo lo suyo)
SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('atletas','planes','reservas','pagos','sesiones','rutinas','mediciones')
 ORDER BY 1, 2;

-- 4. Funciones SECURITY DEFINER que un visitante sin sesión puede ejecutar
--    (después de 050 solo deberían quedar las de la web pública y las usadas en políticas)
SELECT p.oid::regprocedure AS funcion
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
 ORDER BY 1;

-- 5. Confirmación de pagos: solo service_role (todas las columnas deben ser false)
SELECT f AS funcion,
       has_function_privilege('anon', f, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', f, 'EXECUTE') AS authenticated
  FROM unnest(ARRAY['public.confirmar_pedido_grupal_pago(text)', 'public.confirmar_pedido_plan_pago(text)',
                    'public.confirmar_compra_grupal_pago(text, integer)']) f
 WHERE to_regprocedure(f) IS NOT NULL;

-- 6. Cuentas: rol en perfiles vs. rol protegido (app_metadata) vs. el que escribe el usuario
SELECT u.email, p.rol AS rol_perfil, u.raw_app_meta_data->>'rol' AS rol_protegido,
       u.raw_user_meta_data->>'rol' AS rol_editable_por_usuario
  FROM auth.users u LEFT JOIN public.perfiles p ON p.id = u.id
 ORDER BY 2 NULLS LAST, 1;
