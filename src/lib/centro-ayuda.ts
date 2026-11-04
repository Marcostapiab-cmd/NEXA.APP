// Centro de Ayuda de MI NEXA (Fase 5). Arma las respuestas a las preguntas
// frecuentes con los datos reales del alumno (los que entrega la base de datos).
// Es solo lectura: nunca modifica reservas ni créditos. Si un dato no está
// disponible, la respuesta lo dice en vez de inventarlo.

import { limiteCancelacion, textoLimite, type PoliticaCancelacion } from './politica-cancelacion';
import type { ClaseAlumno } from './reservas-alumno';

export interface PlanAyuda {
  vigente:        boolean;
  nombre?:        string;
  modalidad?:     string;
  fin?:           string;
  dias_restantes?: number;
  contratadas?:   number;
  arrastradas?:   number;
  realizadas?:    number;
  inasistencias?: number;
  tardias?:       number;
  agendadas?:     number;
  por_confirmar?: number;
  disponibles?:   number;
  pendientes?:    number;
  proxima?:       { fecha: string; hora: string; profesor?: string | null } | null;
}

export interface InfoAyuda {
  reagendasUsadas:     number;
  maxReagendas:        number | null;
  reagendaValidezDias: number | null;
  antelacionMinutos:   number;
}

export interface DatosAyuda {
  plan:     PlanAyuda | null;       // null = no se pudo consultar
  clases:   ClaseAlumno[] | null;   // null = no se pudo consultar
  politica: PoliticaCancelacion;
  info:     InfoAyuda | null;
  ahora:    Date;
}

export type Tono = 'normal' | 'aviso' | 'ok';

export interface Accion { texto: string; href?: string; solicitar?: TemaAyuda }

export interface Respuesta {
  id:        string;
  pregunta:  string;
  categoria: 'Mi plan' | 'Clases' | 'Pagos' | 'General';
  claves:    string;          // palabras para el buscador
  destacado?: { texto: string; tono: Tono };
  parrafos:  string[];
  lista?:    string[];
  acciones:  Accion[];
}

export type TemaAyuda = 'clases' | 'horarios' | 'creditos' | 'excepcion' | 'pagos' | 'otro';

export const TEMAS_AYUDA: { id: TemaAyuda; label: string }[] = [
  { id: 'clases',    label: 'Mis clases o reservas' },
  { id: 'horarios',  label: 'Cambiar mis horarios fijos' },
  { id: 'creditos',  label: 'Mis créditos o descuentos' },
  { id: 'excepcion', label: 'Excepción por cancelación fuera de plazo' },
  { id: 'pagos',     label: 'Pagos o renovación' },
  { id: 'otro',      label: 'Otra consulta' },
];

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function fechaLarga(f?: string): string {
  if (!f) return '';
  return new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Horarios fijos = mismo día de la semana y hora que se repite en las próximas clases. */
export function horariosFijos(clases: ClaseAlumno[]) {
  const m = new Map<string, { dia: number; hora: string; profesor?: string; n: number }>();
  for (const c of clases) {
    if (!c.activa || !c.hora) continue;
    const dia = new Date(`${c.fecha}T12:00:00`).getDay();
    const k = `${dia}|${c.hora}`;
    const x = m.get(k) ?? { dia, hora: c.hora, profesor: c.profesor, n: 0 };
    x.n++; m.set(k, x);
  }
  return [...m.values()].filter(x => x.n >= 2)
    .sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7) || a.hora.localeCompare(b.hora));
}

/** Plazo de una clase: el que calculó el servidor o, si no viene, la misma regla local. */
function plazoDe(c: ClaseAlumno, pol: PoliticaCancelacion): Date | null {
  if (c.limite) return new Date(c.limite);
  if (!c.hora) return null;
  return limiteCancelacion(c.fecha, c.hora, pol);
}

function textoPolitica(pol: PoliticaCancelacion): string[] {
  return [
    `Clases que empiezan hasta las ${pol.limiteHoraAm}: puedes cancelar o reagendar hasta las ${pol.corteCancelacionAm} del día anterior.`,
    `Clases que empiezan después de las ${pol.limiteHoraAm}: hasta ${plural(pol.cancelHorasAvisoPm, 'hora', 'horas')} antes.`,
  ];
}

const SIN_DATOS = 'No pudimos consultar tu cuenta en este momento. Recarga la página; si sigue igual, envíanos una consulta.';

/** Motivos concretos por los que hoy no se puede reagendar (vacío = se puede). */
export function motivosNoReagendar(d: DatosAyuda): { general: string[]; porClase: { clase: ClaseAlumno; motivo: string }[] } {
  const general: string[] = [];
  const porClase: { clase: ClaseAlumno; motivo: string }[] = [];
  if (d.plan && !d.plan.vigente) general.push('No tienes un plan vigente. Para reagendar necesitas un plan activo.');
  const info = d.info;
  if (info && info.maxReagendas !== null && info.reagendasUsadas >= info.maxReagendas) {
    general.push(`Ya usaste los ${plural(info.maxReagendas, 'reagendamiento', 'reagendamientos')} que permite tu plan.`);
  }
  for (const c of d.clases ?? []) {
    if (!c.activa) continue;
    if (!c.hora) { porClase.push({ clase: c, motivo: 'no tiene hora asignada; la gestiona el equipo de NEXA.' }); continue; }
    if (!c.aTiempo) {
      const p = plazoDe(c, d.politica);
      porClase.push({ clase: c, motivo: p ? `el plazo terminó el ${textoLimite(p)}.` : 'el plazo ya terminó.' });
    }
  }
  return { general, porClase };
}

export function armarRespuestas(d: DatosAyuda): Respuesta[] {
  const { plan, politica: pol } = d;
  const vigente = !!plan?.vigente;
  const clases = d.clases ?? [];
  const activas = clases.filter(c => c.activa).sort((a, b) => (a.fecha + (a.hora ?? '')).localeCompare(b.fecha + (b.hora ?? '')));
  const proxima = activas[0];
  const fijos = horariosFijos(clases);
  const out: Respuesta[] = [];

  // 1. ¿Cuántas clases me quedan?
  {
    const r: Respuesta = {
      id: 'cuantas-clases', pregunta: '¿Cuántas clases me quedan?', categoria: 'Mi plan',
      claves: 'saldo creditos quedan disponibles pendientes contador cuantas', parrafos: [],
      acciones: [{ texto: 'Ver el historial de mis clases', href: '/portal/creditos' }],
    };
    if (!plan) r.parrafos.push(SIN_DATOS);
    else if (!vigente) {
      r.destacado = { texto: 'No tienes un plan vigente', tono: 'aviso' };
      r.parrafos.push('Cuando contrates o renueves un plan, aquí verás tus clases.');
      r.acciones.unshift({ texto: 'Ver planes', href: '/planes' });
    } else {
      const pend = plan.pendientes ?? 0;
      r.destacado = { texto: `Te ${pend === 1 ? 'queda 1 clase' : `quedan ${pend} clases`} por realizar`, tono: 'ok' };
      r.lista = [
        `${plural(plan.contratadas ?? 0, 'clase contratada', 'clases contratadas')}${(plan.arrastradas ?? 0) > 0 ? ` (incluye ${plan.arrastradas} del período anterior)` : ''}`,
        `${plural(plan.realizadas ?? 0, 'realizada', 'realizadas')}`,
        `${plural(plan.agendadas ?? 0, 'agendada', 'agendadas')}`,
        `${plural(plan.disponibles ?? 0, 'disponible', 'disponibles')} para reservar ahora`,
      ];
      const perdidas = (plan.inasistencias ?? 0) + (plan.tardias ?? 0);
      if (perdidas > 0) r.lista.push(`${plural(perdidas, 'descontada', 'descontadas')} por inasistencia o cancelación tardía`);
      if ((plan.por_confirmar ?? 0) > 0) {
        r.parrafos.push(`${plural(plan.por_confirmar!, 'clase pasada está', 'clases pasadas están')} esperando que el profesor confirme tu asistencia. Mientras tanto, siguen reservadas a tu nombre.`);
      }
      if ((plan.disponibles ?? 0) > 0) r.acciones.unshift({ texto: 'Reservar una clase', href: '/portal/clases' });
    }
    out.push(r);
  }

  // 2. ¿Cuándo vence mi plan?
  {
    const r: Respuesta = {
      id: 'vence', pregunta: '¿Cuándo vence mi plan?', categoria: 'Mi plan',
      claves: 'vencimiento vence termina fin plan fecha caduca', parrafos: [], acciones: [],
    };
    if (!plan) r.parrafos.push(SIN_DATOS);
    else if (!vigente) { r.parrafos.push('No tienes un plan vigente en este momento.'); r.acciones.push({ texto: 'Ver planes', href: '/planes' }); }
    else if (plan.fin) {
      const dias = plan.dias_restantes;
      r.destacado = {
        texto: `Vence el ${fechaLarga(plan.fin)}${typeof dias === 'number' && dias >= 0 ? (dias === 0 ? ' (hoy)' : ` (en ${plural(dias, 'día', 'días')})`) : ''}`,
        tono: typeof dias === 'number' && dias <= 7 ? 'aviso' : 'normal',
      };
      r.parrafos.push('Las clases que no uses vencen ese día. Si renuevas antes, las que te queden pasan a tu siguiente período.');
      r.acciones.push({ texto: 'Renovar mi plan', href: '/portal/renovar' });
    } else r.parrafos.push('Tu plan no tiene fecha de término registrada. Envíanos una consulta y lo revisamos.');
    out.push(r);
  }

  // 3. ¿Cuándo debo renovar?
  {
    const r: Respuesta = {
      id: 'renovar', pregunta: '¿Cuándo debo renovar?', categoria: 'Mi plan',
      claves: 'renovar renovacion pagar siguiente periodo mes', parrafos: [],
      acciones: [{ texto: 'Renovar mi plan', href: '/portal/renovar' }],
    };
    if (vigente && plan?.fin) {
      r.destacado = { texto: `Renueva antes del ${fechaLarga(plan.fin)}`, tono: (plan.dias_restantes ?? 99) <= 14 ? 'aviso' : 'normal' };
    }
    r.parrafos.push(
      'Puedes renovar desde ahora en "Renovar mi plan": eliges el período (mensual, trimestral o semestral), transfieres y subes el comprobante.',
      'Tu nuevo período empieza el día siguiente al vencimiento y tus horarios fijos se mantienen. Las clases que no alcanzaste a usar pasan al nuevo período.',
      'Si no renuevas, guardamos tus horarios una semana. Después se liberan para otros alumnos.',
    );
    out.push(r);
  }

  // 4. ¿Por qué no puedo reagendar?
  {
    const r: Respuesta = {
      id: 'no-puedo-reagendar', pregunta: '¿Por qué no puedo reagendar una clase?', categoria: 'Clases',
      claves: 'reagendar cambiar mover clase no puedo bloqueado plazo boton', parrafos: [], acciones: [],
    };
    if (!d.clases) r.parrafos.push(SIN_DATOS);
    else {
      const m = motivosNoReagendar(d);
      if (m.general.length === 0 && m.porClase.length === 0) {
        r.destacado = { texto: activas.length ? 'Ahora puedes reagendar todas tus clases' : 'No tienes clases agendadas', tono: 'ok' };
        if (proxima) {
          const p = plazoDe(proxima, pol);
          if (p) r.parrafos.push(`Tu próxima clase (${fechaLarga(proxima.fecha)} a las ${proxima.hora}) se puede mover hasta el ${textoLimite(p)}.`);
        }
      } else {
        r.destacado = { texto: 'Esto es lo que impide el cambio:', tono: 'aviso' };
        r.lista = [
          ...m.general,
          ...m.porClase.map(x => `Clase del ${fechaLarga(x.clase.fecha)}${x.clase.hora ? ` a las ${x.clase.hora}` : ''}: ${x.motivo}`),
        ];
      }
      r.parrafos.push(...textoPolitica(pol));
      if (d.info?.reagendaValidezDias) {
        r.parrafos.push(`El nuevo horario debe estar dentro de los ${d.info.reagendaValidezDias} días siguientes a la clase original y antes del vencimiento de tu plan.`);
      }
      r.parrafos.push(`Si no ves horarios libres es porque ya están ocupados o empiezan en menos de ${plural(d.info?.antelacionMinutos ?? 60, 'minuto', 'minutos')}. Puedes pedir "Avisarme si se libera un cupo".`);
      r.acciones.push({ texto: 'Ir a Mis clases', href: '/portal/clases' });
      if (m.porClase.some(x => x.clase.hora)) r.acciones.push({ texto: 'Pedir una excepción', solicitar: 'excepcion' });
    }
    out.push(r);
  }

  // 5. ¿Qué pasa si cancelo una clase?
  {
    const r: Respuesta = {
      id: 'cancelar', pregunta: '¿Qué pasa si cancelo una clase?', categoria: 'Clases',
      claves: 'cancelar cancelacion anular faltar aviso plazo politica descuenta', parrafos: [],
      acciones: [{ texto: 'Ir a Mis clases', href: '/portal/clases' }, { texto: 'Leer el reglamento', href: '/reglamento' }],
    };
    r.lista = textoPolitica(pol);
    r.parrafos.push(
      'Si cancelas dentro del plazo, conservas el crédito y puedes usarlo para reservar otro horario. Tus horarios fijos de las otras semanas no cambian.',
      'Si el plazo ya pasó, la clase se descuenta de tu plan igual que si no asistieras.',
      'Todo se calcula con la hora de Chile, y cancelar justo en el límite cuenta como a tiempo.',
    );
    if (proxima) {
      const p = plazoDe(proxima, pol);
      if (p) r.destacado = {
        texto: proxima.aTiempo
          ? `Tu próxima clase (${fechaLarga(proxima.fecha)}, ${proxima.hora}) se puede cancelar sin costo hasta el ${textoLimite(p)}`
          : `El plazo de tu próxima clase (${fechaLarga(proxima.fecha)}, ${proxima.hora}) ya terminó`,
        tono: proxima.aTiempo ? 'ok' : 'aviso',
      };
    }
    out.push(r);
  }

  // 6. ¿Qué pasa si no asisto?
  out.push({
    id: 'no-asisto', pregunta: '¿Qué pasa si no asisto sin avisar?', categoria: 'Clases',
    claves: 'no asisto falte inasistencia no fui ausencia descuenta',
    parrafos: [
      'La clase se descuenta de tu plan. Lo mismo pasa si cancelas fuera de plazo.',
      'Si tuviste una emergencia, puedes pedir una excepción. El equipo de NEXA la revisa caso a caso.',
    ],
    acciones: [{ texto: 'Pedir una excepción', solicitar: 'excepcion' }],
  });

  // 7. ¿Por qué se me descontó una clase?
  {
    const perdidas = (plan?.inasistencias ?? 0) + (plan?.tardias ?? 0);
    const r: Respuesta = {
      id: 'descontada', pregunta: '¿Por qué se me descontó una clase?', categoria: 'Mi plan',
      claves: 'descontada descuento quitaron clase menos creditos error', parrafos: [],
      acciones: [{ texto: 'Ver el historial de mis clases', href: '/portal/creditos' }, { texto: 'Enviar una consulta', solicitar: 'creditos' }],
    };
    if (vigente) {
      r.destacado = perdidas > 0
        ? { texto: `En este plan: ${plural(plan?.inasistencias ?? 0, 'inasistencia', 'inasistencias')} y ${plural(plan?.tardias ?? 0, 'cancelación tardía', 'cancelaciones tardías')}`, tono: 'aviso' }
        : { texto: 'En este plan no tienes clases descontadas por inasistencia ni cancelación tardía', tono: 'ok' };
    }
    r.parrafos.push(
      'Una clase se descuenta cuando asistes, cuando no llegas o cuando cancelas fuera de plazo. Si NEXA cancela una clase, no se descuenta.',
      'En el historial ves cada movimiento con su fecha, quién lo hizo y el motivo. Si algo no te cuadra, envíanos una consulta.',
    );
    out.push(r);
  }

  // 8. Clase pasada que no aparece como realizada
  if ((plan?.por_confirmar ?? 0) > 0) {
    out.push({
      id: 'por-confirmar', pregunta: 'Fui a una clase y no aparece como realizada', categoria: 'Mi plan',
      claves: 'fui asisti no aparece realizada confirmar asistencia pendiente',
      destacado: { texto: `${plural(plan!.por_confirmar!, 'clase', 'clases')} esperando confirmación`, tono: 'aviso' },
      parrafos: ['El profesor todavía no marca tu asistencia. Mientras tanto la clase sigue reservada a tu nombre y no se pierde. Se actualiza apenas la marque.'],
      acciones: [{ texto: 'Ver el historial de mis clases', href: '/portal/creditos' }],
    });
  }

  // 9. ¿Puedo cambiar mis horarios fijos?
  {
    const r: Respuesta = {
      id: 'horarios-fijos', pregunta: '¿Puedo cambiar mis horarios fijos?', categoria: 'Clases',
      claves: 'horario fijo cambiar dia permanente semana recurrente', parrafos: [],
      acciones: [{ texto: 'Solicitar cambio de horario fijo', solicitar: 'horarios' }, { texto: 'Ir a Mis clases', href: '/portal/clases' }],
    };
    if (fijos.length) {
      r.destacado = { texto: 'Tus horarios fijos actuales:', tono: 'normal' };
      r.lista = fijos.map(f => `${DIAS[f.dia][0].toUpperCase()}${DIAS[f.dia].slice(1)} a las ${f.hora}${f.profesor ? ` con ${f.profesor}` : ''}`);
    }
    r.parrafos.push(
      'Para mover una sola clase, usa "Reagendar" en Mis clases. Tus otras semanas no cambian.',
      'Para cambiar un horario de forma permanente (por ejemplo, todos los martes en vez de los lunes), envíanos una solicitud. Revisamos la disponibilidad del profesor y te confirmamos.',
    );
    out.push(r);
  }

  // 10. ¿Cómo reservo una clase extra?
  {
    const disp = plan?.disponibles ?? 0;
    const r: Respuesta = {
      id: 'reservar', pregunta: '¿Cómo reservo una clase?', categoria: 'Clases',
      claves: 'reservar agendar nueva clase extra libre cupo', parrafos: [],
      acciones: [{ texto: 'Ir a Mis clases', href: '/portal/clases' }],
    };
    if (vigente) {
      r.destacado = disp > 0
        ? { texto: `Tienes ${plural(disp, 'clase disponible', 'clases disponibles')} para reservar`, tono: 'ok' }
        : { texto: 'Todas las clases de tu plan ya están agendadas o usadas', tono: 'aviso' };
    }
    r.parrafos.push(
      'En Mis clases presiona "Reservar clase", elige un horario libre y confirma. Solo aparecen horarios de tu modalidad y dentro de la vigencia de tu plan.',
      'Si cancelas una clase a tiempo, recuperas ese crédito y puedes reservar otro horario.',
    );
    out.push(r);
  }

  // 11. Lista de espera
  out.push({
    id: 'lista-espera', pregunta: '¿Cómo funciona "Avisarme si se libera un cupo"?', categoria: 'Clases',
    claves: 'lista espera cupo lleno ocupado aviso liberar',
    parrafos: [
      'Si el horario que quieres está ocupado, puedes pedir que te avisemos. Si alguien cancela, te llega un correo.',
      'Puedes pedirlo para una hora específica o para cualquier hora sin cupo de ese día. Tus avisos activos aparecen en Mis clases y los puedes quitar cuando quieras.',
      'El aviso no reserva el cupo: entra a Mis clases y confírmalo pronto, porque otros alumnos también pueden tomarlo. Si el correo indica un plazo de prioridad, después de ese plazo avisamos al siguiente.',
    ],
    acciones: [{ texto: 'Ir a Mis clases', href: '/portal/clases' }],
  });

  // 11b. Clase suspendida por NEXA o cambio de profesor
  out.push({
    id: 'suspendida', pregunta: 'NEXA suspendió mi clase o cambió mi profesor', categoria: 'Clases',
    claves: 'suspendida suspendio feriado cierre profesor cambio sustituto ausencia nexa cancelo',
    parrafos: [
      'Si NEXA suspende una clase (feriado, cierre o ausencia de un profesor), no pierdes el crédito: queda disponible para que reserves otro horario desde Mis clases.',
      'Si tu profesor no puede asistir y otro profesor está libre, mantenemos tu clase en el mismo horario con él y te avisamos por correo. Si prefieres otro horario, puedes reagendarla dentro del plazo habitual.',
    ],
    acciones: [{ texto: 'Reservar otro horario', href: '/portal/clases' }, { texto: 'Enviar una consulta', solicitar: 'clases' }],
  });

  // 12. ¿Dónde veo mis pagos?
  out.push({
    id: 'pagos', pregunta: '¿Dónde veo mis pagos?', categoria: 'Pagos',
    claves: 'pagos pago boleta comprobante transferencia cobro historial',
    parrafos: [
      'En "Mis pagos" ves todos tus pagos y su estado. Si pagaste una renovación por transferencia, el estado cambia cuando el equipo de NEXA valida el comprobante.',
    ],
    acciones: [{ texto: 'Ir a Mis pagos', href: '/portal/pagos' }, { texto: 'Consulta sobre un pago', solicitar: 'pagos' }],
  });

  // 13. Reglamento
  out.push({
    id: 'reglamento', pregunta: '¿Dónde está el reglamento?', categoria: 'General',
    claves: 'reglamento reglas condiciones normas terminos',
    parrafos: ['El reglamento de NEXA explica las reglas de reservas, cancelaciones, renovaciones y pagos.'],
    acciones: [{ texto: 'Leer el reglamento', href: '/reglamento' }],
  });

  return out;
}

const VACIAS = new Set(['por', 'que', 'como', 'cual', 'cuando', 'donde', 'puedo', 'para', 'una', 'uno', 'los', 'las',
  'del', 'con', 'mis', 'mi', 'me', 'se', 'el', 'la', 'de', 'en', 'un', 'no', 'si', 'es', 'lo', 'al', 'y', 'o', 'hay', 'tengo', 'quiero']);

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca por texto (sin tildes ni mayúsculas): ordena por cuántas palabras coinciden. */
export function buscarRespuestas(lista: Respuesta[], q: string): Respuesta[] {
  const palabras = normalizar(q).split(/[^a-z0-9ñ]+/).filter(p => p.length > 2 && !VACIAS.has(p));
  if (!palabras.length) return lista;
  return lista
    .map(r => {
      const titulo = normalizar(`${r.pregunta} ${r.claves}`);
      const cuerpo = normalizar(r.parrafos.join(' '));
      // Coincidencia por raíz (primeras 5 letras): "cancele" encuentra "cancelar"
      const puntos = palabras.reduce((n, p) => {
        const raiz = p.slice(0, 5);
        return n + (titulo.includes(raiz) ? 2 : cuerpo.includes(raiz) ? 1 : 0);
      }, 0);
      return { r, puntos };
    })
    .filter(x => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .map(x => x.r);
}
