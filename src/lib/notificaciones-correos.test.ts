import { describe, it, expect } from 'vitest';
import { armarCorreo } from './notificaciones-server';

const plan = { nombre: 'Personalizado 1:1', modalidad: '1:1', fin: '2026-12-15', contratadas: 12, realizadas: 8, pendientes: 4, disponibles: 2 };

describe('Correos automáticos', () => {
  it('después de la clase muestra los números reales del plan', () => {
    const c = armarCorreo('clase_realizada', 'Ana', { fecha: '2026-11-04', hora: '10:00', plan, proxima: { fecha: '2026-11-06', hora: '10:00' } }, 'https://x');
    expect(c?.asunto).toMatch(/registrado/);
    for (const v of ['>12<', '>8<', '>4<', '>2<']) expect(c?.html).toContain(v);
    expect(c?.html).toMatch(/viernes, 6 de noviembre/);
  });

  it('el aviso de clases restantes distingue pendientes de disponibles', () => {
    const c = armarCorreo('clases_restantes', 'Ana', { plan: { ...plan, pendientes: 2 } }, 'https://x');
    expect(c?.asunto).toBe('Te quedan 2 clases en NEXA');
    expect(c?.html).toContain('quedan 2 clases por realizar');
  });

  it('el recordatorio no ofrece cancelar gratis si el plazo terminó', () => {
    const fuera = armarCorreo('recordatorio_clase', 'Ana', { fecha: '2030-01-10', hora: '18:00', horas: 3, limite: '2030-01-10T15:00:00Z', a_tiempo: false }, 'https://x');
    expect(fuera?.html).toContain('ya terminó');
    expect(fuera?.html).not.toContain('Puedes cancelar');
    const dentro = armarCorreo('recordatorio_clase', 'Ana', { fecha: '2030-01-10', hora: '18:00', horas: 24, limite: '2030-01-10T15:00:00Z', a_tiempo: true }, 'https://x');
    expect(dentro?.html).toContain('Puedes cancelar o reagendar sin perder la clase hasta');
  });

  it('el nombre del alumno se escapa (sin HTML inyectado)', () => {
    const c = armarCorreo('inasistencia', '<b>x</b>', { fecha: '2026-11-04', hora: '10:00', plan }, 'https://x');
    expect(c?.html).not.toContain('<b>x</b>');
  });
});
