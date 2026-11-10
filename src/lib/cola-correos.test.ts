// Cola de correos: recuperación de envíos interrumpidos, reintentos limitados,
// clave de idempotencia y recordatorios vencidos. Usa una base en memoria y un
// Resend simulado (no envía correos reales).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';

const envios: { to: string; key?: string }[] = [];
let fallarEnvio: 'no' | 'error' | 'excepcion' = 'no';
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (p: { to: string }, o?: { idempotencyKey?: string }) => {
        if (fallarEnvio === 'excepcion') throw new Error('red caída');
        if (fallarEnvio === 'error') return { data: null, error: { message: 'rechazado' } };
        envios.push({ to: p.to, key: o?.idempotencyKey });
        return { data: { id: 'x' }, error: null };
      },
    };
  },
}));
process.env.RESEND_API_KEY = 're_test';
const { procesarCola, recordatorioVencido, MINUTOS_ATASCADA } = await import('./notificaciones-server');
const { bearerValido } = await import('./secreto-servidor');

// ── Cliente mínimo con la forma del de Supabase, sobre una tabla en memoria ──
type Fila = Record<string, unknown>;
function fakeDb(tablas: Record<string, Fila[]>): SupabaseClient {
  function query(tabla: string) {
    const filtros: ((f: Fila) => boolean)[] = [];
    let cambio: Fila | null = null; let lim = Infinity; let devolver = false;
    const q = {
      select() { devolver = true; return q; },
      update(c: Fila) { cambio = c; return q; },
      eq(k: string, v: unknown) { filtros.push(f => f[k] === v); return q; },
      in(k: string, v: unknown[]) { filtros.push(f => v.includes(f[k])); return q; },
      lt(k: string, v: unknown) { filtros.push(f => f[k] != null && (f[k] as string | number) < (v as string | number)); return q; },
      order() { return q; },
      limit(n: number) { lim = n; return q; },
      async maybeSingle() { const r = (await q.then()) as { data: Fila[] | null }; return { data: r.data?.[0] ?? null, error: null }; },
      then(res?: (v: { data: Fila[] | null; error: null }) => unknown) {
        const filas = tablas[tabla].filter(f => filtros.every(fn => fn(f))).slice(0, lim);
        if (cambio) filas.forEach(f => Object.assign(f, cambio));
        const out = { data: devolver || !cambio ? filas.map(f => ({ ...f })) : null, error: null as null };
        return Promise.resolve(res ? res(out) : out);
      },
    };
    return q;
  }
  return { from: query } as unknown as SupabaseClient;
}

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const futuro = new Date(Date.now() + 3 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
let notifs: Fila[];
let db: SupabaseClient;

beforeEach(() => {
  envios.length = 0; fallarEnvio = 'no';
  notifs = [
    { id: 'n1', atleta_id: 'a1', tipo: 'reserva_confirmada', canal: 'email', datos: { fecha: futuro, hora: '10:00' }, estado: 'pendiente', intentos: 0, created_at: hace(5) },
    // Interrumpida hace 1 hora (el proceso murió después de reclamarla)
    { id: 'n2', atleta_id: 'a1', tipo: 'reserva_cancelada', canal: 'email', datos: { fecha: futuro, hora: '11:00' }, estado: 'enviando', intentos: 1, reclamada_at: hace(60), created_at: hace(70) },
    // Recién reclamada por otro proceso: no se toca
    { id: 'n3', atleta_id: 'a1', tipo: 'reserva_cancelada', canal: 'email', datos: {}, estado: 'enviando', intentos: 1, reclamada_at: hace(1), created_at: hace(2) },
    // Recordatorio de una clase que ya pasó (cola atrasada)
    { id: 'n4', atleta_id: 'a1', tipo: 'recordatorio_clase', canal: 'email', datos: { fecha: '2026-10-29', hora: '10:00' }, estado: 'pendiente', intentos: 0, created_at: hace(9000) },
    // Sin más intentos
    { id: 'n5', atleta_id: 'a1', tipo: 'reserva_confirmada', canal: 'email', datos: { fecha: futuro, hora: '12:00' }, estado: 'error', intentos: 3, created_at: hace(100) },
  ];
  db = fakeDb({ notificaciones: notifs, atletas: [{ id: 'a1', nombre: 'Ana', email: 'ana@prueba.nexa.test' }] });
});

const estado = (id: string) => notifs.find(n => n.id === id)!;

describe('cola de correos', () => {
  it('recupera envíos interrumpidos y los reenvía con la misma clave (Resend no duplica)', async () => {
    const r = await procesarCola(db, 20);
    expect(r.recuperadas).toBe(1);
    expect(estado('n2').estado).toBe('enviada');
    expect(estado('n2').intentos).toBe(2);
    expect(envios.find(e => e.key === 'nexa-notificacion-n2')).toBeTruthy();
    expect(estado('n3').estado).toBe('enviando'); // en curso en otro proceso
  });

  it('no envía recordatorios de clases que ya pasaron', async () => {
    await procesarCola(db, 20);
    expect(estado('n4').estado).toBe('omitida');
    expect(envios.some(e => e.key === 'nexa-notificacion-n4')).toBe(false);
  });

  it('respeta el máximo de intentos', async () => {
    await procesarCola(db, 20);
    expect(estado('n5').estado).toBe('error');
    expect(envios.some(e => e.key === 'nexa-notificacion-n5')).toBe(false);
  });

  it('un error o una excepción del proveedor quedan registrados y se reintentan', async () => {
    fallarEnvio = 'excepcion';
    await procesarCola(db, 20);
    expect(estado('n1')).toMatchObject({ estado: 'error', intentos: 1, error: 'red caída' });
    fallarEnvio = 'error';
    await procesarCola(db, 20);
    await procesarCola(db, 20);
    expect(estado('n1').intentos).toBe(3);
    expect(String(estado('n1').error)).toMatch(/Sin más reintentos/);
    fallarEnvio = 'no';
    await procesarCola(db, 20);
    expect(estado('n1').estado).toBe('error'); // agotado: ya no se intenta
  });

  it('procesar dos veces no duplica envíos', async () => {
    await procesarCola(db, 20);
    const n = envios.length;
    await procesarCola(db, 20);
    expect(envios.length).toBe(n);
  });

  it('MINUTOS_ATASCADA es razonable', () => expect(MINUTOS_ATASCADA).toBeGreaterThanOrEqual(5));
  it('recordatorioVencido solo aplica a recordatorios', () => {
    expect(recordatorioVencido('recordatorio_clase', { fecha: '2020-01-01', hora: '10:00' })).toBe(true);
    expect(recordatorioVencido('reserva_cancelada', { fecha: '2020-01-01', hora: '10:00' })).toBe(false);
  });
});

describe('autenticación de la llamada de servidor', () => {
  const S = 'secreto-de-prueba-largo-123456';
  it('acepta el secreto correcto y rechaza el resto', () => {
    expect(bearerValido(`Bearer ${S}`, S)).toBe(true);
    expect(bearerValido(`Bearer otro`, S)).toBe(false);
    expect(bearerValido(null, S)).toBe(false);
  });
  it('sin secreto configurado no deja pasar "Bearer undefined"', () => {
    expect(bearerValido('Bearer undefined', undefined)).toBe(false);
    expect(bearerValido('Bearer ', '')).toBe(false);
  });
});

describe('053 — tarea horaria autenticada', () => {
  it('envía el secreto de Vault y avisa si falta configuración', async () => {
    const pg = new PGlite();
    await pg.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA net; CREATE TABLE net.llamadas (url text, headers jsonb);
      CREATE FUNCTION net.http_post(url text, body jsonb, headers jsonb) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.llamadas VALUES (url, headers) RETURNING 1::bigint $$;
      CREATE TABLE public.notificaciones (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.horario_config (id int PRIMARY KEY, app_url text); INSERT INTO public.horario_config VALUES (1, 'https://app.test/');
      CREATE TABLE public.incidencias (clave text, estado text DEFAULT 'abierta', automatica boolean DEFAULT true);
      CREATE FUNCTION public.nexa_incidencia(a text, b text, c text, d text, e text, f text) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO public.incidencias (clave) VALUES (c) RETURNING NULL::uuid $$;
      CREATE FUNCTION public.nexa_tareas_programadas() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    `);
    await pg.exec(readFileSync('supabase/migrations/053_recordatorios_autenticados.sql', 'utf8'));
    // Sin Vault: no llama a la app y deja aviso manual
    expect((await pg.query<{ r: { envio: string } }>(`SELECT public.nexa_tarea_horaria() r`)).rows[0].r.envio).toBe('sin_configurar');
    expect((await pg.query(`SELECT 1 FROM net.llamadas`)).rows).toHaveLength(0);
    expect((await pg.query<{ automatica: boolean }>(`SELECT automatica FROM public.incidencias`)).rows[0].automatica).toBe(false);
    // Con Vault: llama con Authorization
    await pg.exec(`CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
      INSERT INTO vault.decrypted_secrets VALUES ('nexa_notificaciones_secret', 'abc123secreto');`);
    expect((await pg.query<{ r: { envio: string } }>(`SELECT public.nexa_tarea_horaria() r`)).rows[0].r.envio).toBe('solicitado');
    const ll = (await pg.query<{ url: string; headers: Record<string, string> }>(`SELECT * FROM net.llamadas`)).rows[0];
    expect(ll.url).toBe('https://app.test/api/notificaciones/procesar');
    expect(ll.headers.Authorization).toBe('Bearer abc123secreto');
    }, 60_000);
});
