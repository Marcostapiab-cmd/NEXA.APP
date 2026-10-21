import { describe, expect, it } from 'vitest';
import {
  esClaseDePrueba, formatearRut, montoTotalPlan, precioMensualPlan, sesionReservable,
  sesionesTotalesPlan, validarRut, variantesRut, type SesionPublica,
} from './catalogo';

// Los 5 packs canónicos de NEXA (migración 026)
const PACKS = [
  { nombre: 'Clase de Prueba', num_clases: 1,  validez_dias: 7,  precio_clp: 8990 },
  { nombre: 'Clase Normal',    num_clases: 1,  validez_dias: 7,  precio_clp: 12990 },
  { nombre: 'Pack 2×Prueba',   num_clases: 2,  validez_dias: 14, precio_clp: 16990 },
  { nombre: 'Pack Mensual',    num_clases: 12, validez_dias: 60, precio_clp: 119900 },
  { nombre: 'Pack Intensivo',  num_clases: 20, validez_dias: 90, precio_clp: 179900 },
];

describe('esClaseDePrueba', () => {
  it('solo la Clase de Prueba de 1 clase es de una vez por persona', () => {
    expect(PACKS.filter(esClaseDePrueba).map(p => p.nombre)).toEqual(['Clase de Prueba']);
  });
});

describe('planes 1:1 / 2:1', () => {
  const config = { descuento_trimestral_mes: 5000, descuento_semestral_mes: 10000 };

  it('mensual no tiene descuento', () => {
    expect(montoTotalPlan(120000, 'mensual', config)).toBe(120000);
  });
  it('trimestral y semestral aplican el descuento mensual configurado', () => {
    expect(precioMensualPlan(225000, 'trimestral', config)).toBe(220000);
    expect(montoTotalPlan(225000, 'trimestral', config)).toBe(660000);
    expect(montoTotalPlan(225000, 'semestral', config)).toBe(1290000);
  });
  it('sin configuración no inventa descuentos', () => {
    expect(montoTotalPlan(100000, 'semestral', {})).toBe(600000);
  });
  it('sesiones = frecuencia × semanas (igual que la migración 033)', () => {
    expect(sesionesTotalesPlan(3, 'mensual')).toBe(12);
    expect(sesionesTotalesPlan(2, 'trimestral')).toBe(24);
    expect(sesionesTotalesPlan(5, 'semestral')).toBe(120);
  });
});

describe('sesionReservable', () => {
  const base: SesionPublica = {
    clase_id: 'c', nombre: 'Barre', duracion_min: 60, hora: '10:00', dia_semana: 6,
    capacidad: 12, disponibles: 3, fecha: '2026-11-07', bloqueada: false, coach_nombre: '',
  };
  const ahora = new Date('2026-11-01T12:00:00');
  it('acepta clases futuras con cupo', () => expect(sesionReservable(base, ahora)).toBe(true));
  it('rechaza sin cupo, bloqueadas o pasadas', () => {
    expect(sesionReservable({ ...base, disponibles: 0 }, ahora)).toBe(false);
    expect(sesionReservable({ ...base, bloqueada: true }, ahora)).toBe(false);
    expect(sesionReservable({ ...base, fecha: '2026-10-31' }, ahora)).toBe(false);
  });
});

describe('RUT', () => {
  it('valida dígito verificador', () => {
    expect(validarRut('12.345.678-5')).toBe(true);
    expect(validarRut('12345678-9')).toBe(false);
    expect(validarRut('11.111.111-1')).toBe(true);
  });
  it('formatea y genera variantes', () => {
    expect(formatearRut('123456785')).toBe('12.345.678-5');
    expect(variantesRut('12.345.678-5')).toEqual(['12345678-5', '12.345.678-5']);
  });
});
