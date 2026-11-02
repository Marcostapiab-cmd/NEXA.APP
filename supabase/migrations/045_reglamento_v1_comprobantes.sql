-- ============================================================
-- NEXA 045 — Reglamento versión 1 (BORRADOR) y bucket de comprobantes
-- ============================================================
-- El reglamento queda como borrador: no lo ve nadie ni se exige hasta que
-- el admin lo publique (botón en /reglamento o `SELECT staff_publicar_reglamento(1)`).
-- Re-ejecutable. Aplicar después de la 044.
-- ============================================================

INSERT INTO public.reglamentos (version, titulo, contenido) VALUES (1, 'Reglamento y Condiciones NEXA Performance', $reg$
## 1. Alcance

Este reglamento regula los planes de entrenamiento personalizado de NEXA Performance (en adelante, "NEXA") y se aplica a todos los alumnos que contratan o renuevan un plan. Al contratar o renovar, el alumno declara haberlo leído y aceptado. La versión aceptada queda registrada en su cuenta MI NEXA y no cambia aunque NEXA publique una versión nueva.

## 2. Modalidades de entrenamiento

- **Personalizado 1:1:** un profesor entrena exclusivamente a un alumno. Cada sesión tiene un cupo.
- **Semipersonalizado 2:1:** un profesor entrena a un máximo de dos alumnos a la vez. Cada sesión tiene dos cupos, y solo los pueden ocupar alumnos con plan 2:1.
- Las modalidades no se mezclan: un alumno 1:1 no ocupa cupos de una sesión 2:1, y viceversa.

## 3. Evaluación inicial

Antes de contratar su primer plan, todo alumno nuevo debe realizar una **Clase de Prueba / evaluación inicial**, cuyo valor se informa en la página de NEXA. Su objetivo es conocer los objetivos, el nivel y las condiciones del alumno para recomendarle la modalidad y frecuencia adecuadas.

## 4. Planes, precios y pago

- NEXA ofrece planes **mensuales, trimestrales y semestrales**, con la frecuencia semanal y la modalidad que el alumno elija. El precio, la cantidad de clases y las fechas de inicio y término se informan antes de pagar y quedan registrados en MI NEXA.
- Todos los planes se pagan **por adelantado y por el valor total del período**. NEXA no cobra cuotas mensuales.
- Si el alumno paga con tarjeta de crédito en cuotas, esas cuotas son un acuerdo entre el alumno y su banco. NEXA registra una sola compra por el total y no suspende el plan por cuotas pendientes con el banco.
- Un plan se activa solo cuando el pago está confirmado. Si el pago es por transferencia, el comprobante queda **en revisión** hasta que NEXA verifica el abono; enviar el comprobante no activa el plan por sí solo.
- Los precios publicados pueden cambiar, pero un cambio nunca afecta un plan ya pagado.

## 5. Clases incluidas y vigencia

- Cada plan incluye la cantidad de clases indicada al contratarlo (frecuencia semanal × semanas del período).
- Las clases deben realizarse **dentro de la vigencia del plan**. Las clases no usadas vencen el día en que termina el plan.
- **Si el alumno renueva**, las clases que le hayan quedado sin usar pasan a su período siguiente.
- En MI NEXA el alumno puede ver en todo momento sus clases contratadas, realizadas, agendadas, disponibles para reservar y la fecha de vencimiento.

## 6. Horarios fijos y reservas

- Al contratar, el alumno elige sus horarios fijos semanales según la disponibilidad real de profesores y cupos.
- El alumno puede reservar clases adicionales con sus créditos disponibles, reagendar o cancelar desde MI NEXA, siempre dentro de las reglas de este reglamento.
- Cambiar una clase puntual no modifica los horarios fijos de las demás semanas. Para cambiar un horario fijo de forma permanente, el alumno debe solicitarlo a NEXA.

## 7. Cancelaciones y reagendamientos

Todos los horarios se rigen por la hora oficial de Chile continental (America/Santiago).

- **Clases que comienzan hasta las 12:00 (inclusive):** se pueden cancelar o reagendar sin perder la clase hasta las **22:00 del día anterior**.
- **Clases que comienzan después de las 12:00:** se pueden cancelar o reagendar sin perder la clase hasta **6 horas antes** de su inicio.
- Una solicitud hecha exactamente a la hora límite se considera a tiempo.
- Si se cancela a tiempo, el alumno conserva la clase y puede usarla en otro horario disponible dentro de la vigencia de su plan.
- Fuera de plazo, la clase **se descuenta** del plan.
- El sistema registra el instante exacto de cada solicitud y la regla aplicada; el alumno puede revisarlo en su historial.

## 8. Inasistencias y atrasos

- Si el alumno no se presenta y no canceló a tiempo, la clase se registra como inasistencia y se descuenta del plan. El alumno recibe un aviso.
- Si el alumno llega tarde, la clase termina a la hora programada para no afectar al siguiente alumno.

## 9. Recuperación de clases

Las clases canceladas a tiempo, y las que NEXA cancele, pueden recuperarse reservando otro horario compatible dentro de la vigencia del plan, sujeto a disponibilidad. Si se produce una diferencia o un error en el registro, el alumno puede solicitar su revisión y toda corrección queda registrada en su historial.

## 10. Clases canceladas por NEXA, feriados y cierres

- Si NEXA cancela una clase (ausencia del profesor, feriado, cierre, mantención u otra causa operativa), **el alumno no pierde la clase** y puede reagendarla sin costo, o NEXA le ofrecerá una alternativa (otro horario o un profesor sustituto).
- NEXA avisará con la mayor anticipación posible por correo y en MI NEXA.

## 11. Renovaciones

- NEXA avisa antes del vencimiento (por defecto 14, 7, 3 y 1 día antes, y el mismo día).
- El alumno puede renovar desde MI NEXA en cualquier momento antes del vencimiento. El nuevo período comienza el **día siguiente al vencimiento** del plan actual, sin superponerse ni perder días pagados. Si renueva después del vencimiento, el nuevo período comienza el día en que se activa.
- Al renovar, NEXA conserva sus horarios fijos siempre que sigan disponibles.
- Si el alumno no renueva, NEXA le guarda sus horarios fijos durante **7 días** después del vencimiento. Pasado ese plazo los horarios se liberan para otros alumnos, con aviso previo.

## 12. Excepciones

NEXA puede evaluar excepciones justificadas (por ejemplo, enfermedad o accidente acreditado con documento, o fuerza mayor). Cada excepción se resuelve caso a caso, con motivo escrito, y queda registrada en el historial del alumno.

## 13. Salud y seguridad

- El alumno debe informar a su profesor cualquier condición de salud, lesión, embarazo o tratamiento que pueda influir en su entrenamiento, y seguir sus indicaciones.
- Si el profesor considera que no es seguro entrenar, puede ajustar o suspender la sesión; si la suspensión no es responsabilidad del alumno, la clase no se descuenta.

## 14. Datos personales

- NEXA trata los datos personales del alumno (identificación, contacto, pagos, asistencia y, cuando el alumno los entrega, antecedentes de salud) solo para prestar el servicio, administrar su plan y comunicarse con él, conforme a la Ley N° 19.628 sobre Protección de la Vida Privada y la normativa que la reemplace o complemente.
- Los antecedentes de salud se consideran datos sensibles: solo acceden a ellos el profesor a cargo y la administración, en la medida necesaria para entrenar de forma segura.
- NEXA no vende ni cede los datos a terceros. Los proveedores tecnológicos (alojamiento, correo electrónico y pagos) los tratan solo por encargo de NEXA.
- El alumno puede pedir acceso, rectificación, eliminación u oposición escribiendo a NEXA.

## 15. Derechos del consumidor

Nada de este reglamento limita los derechos que la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores otorga al alumno. [REVISAR CON ASESOR LEGAL: política de retracto para contrataciones online (art. 3 bis) y de devolución de dinero en caso de término anticipado.]

## 16. Cambios a este reglamento

NEXA puede actualizar este reglamento publicando una nueva versión con su fecha. Los cambios no se aplican de forma retroactiva a planes ya pagados: cada plan se rige por las condiciones vigentes al contratarlo o renovarlo. Las versiones anteriores siguen disponibles para consulta.

## 17. Contacto

Para consultas, solicitudes o reclamos, el alumno puede escribir a NEXA desde MI NEXA o por los canales informados en la página.
$reg$)
ON CONFLICT (version) DO NOTHING;

-- ── Bucket privado para comprobantes de transferencia ──────
-- Cada alumno sube solo a su carpeta (<id del alumno>/archivo); solo él y el staff pueden verlos.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('comprobantes', 'comprobantes', false, 5242880,
          ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  ON CONFLICT (id) DO NOTHING;

  EXECUTE 'DROP POLICY IF EXISTS comprobantes_subir_propio ON storage.objects';
  EXECUTE $p$CREATE POLICY comprobantes_subir_propio ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = public.nexa_atleta_actual()::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS comprobantes_leer ON storage.objects';
  EXECUTE $p$CREATE POLICY comprobantes_leer ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'comprobantes' AND ((storage.foldername(name))[1] = public.nexa_atleta_actual()::text
           OR public.get_my_role() IN ('admin', 'host', 'recepcionista')))$p$;
END $$;
