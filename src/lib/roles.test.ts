import { describe, it, expect } from 'vitest';
import { decidirAcceso, rolDeUsuario, type Rol } from './roles';

const pasa = (p: string, sesion: boolean, rol: Rol | null) => decidirAcceso(p, sesion, rol).tipo === 'pasar';

describe('rolDeUsuario', () => {
  it('ignora user_metadata (lo escribe el propio usuario)', () => {
    expect(rolDeUsuario({ app_metadata: {}, ...{ user_metadata: { rol: 'admin' } } } as never)).toBeNull();
  });
  it('acepta solo roles conocidos de app_metadata', () => {
    expect(rolDeUsuario({ app_metadata: { rol: 'profesor' } })).toBe('profesor');
    expect(rolDeUsuario({ app_metadata: { rol: 'superadmin' } })).toBeNull();
    expect(rolDeUsuario(null)).toBeNull();
  });
});

describe('decidirAcceso', () => {
  it('sin sesión: públicas sí, privadas al login, API con 401', () => {
    expect(pasa('/planes', false, null)).toBe(true);
    expect(pasa('/reglamento', false, null)).toBe(true);
    expect(decidirAcceso('/dashboard', false, null)).toEqual({ tipo: 'redirigir', destino: '/login' });
    expect(decidirAcceso('/portal/clases', false, null)).toEqual({ tipo: 'redirigir', destino: '/portal/login' });
    expect(decidirAcceso('/api/admin/usuarios', false, null)).toEqual({ tipo: 'denegar', status: 401 });
  });

  it('rol desconocido o ausente: no accede a nada privado', () => {
    for (const p of ['/dashboard', '/alumnos', '/usuarios', '/portal', '/horario', '/grupales-alumno/dashboard']) {
      expect(pasa(p, true, null)).toBe(false);
    }
    expect(decidirAcceso('/api/admin/usuarios', true, null)).toEqual({ tipo: 'denegar', status: 403 });
    expect(pasa('/portal/sin-cuenta', true, null)).toBe(true);
    expect(pasa('/login', true, null)).toBe(true); // puede entrar con otra cuenta
  });

  it('alumno: solo su portal (antes podía abrir /usuarios y /metricas)', () => {
    expect(pasa('/portal', true, 'alumno')).toBe(true);
    expect(pasa('/portal/clases', true, 'alumno')).toBe(true);
    for (const p of ['/usuarios', '/metricas', '/dashboard', '/alumnos/123', '/grupales-alumno/dashboard']) {
      expect(pasa(p, true, 'alumno')).toBe(false);
    }
    expect(decidirAcceso('/api/admin/editar-usuario', true, 'alumno')).toEqual({ tipo: 'denegar', status: 403 });
    expect(pasa('/api/notificaciones/procesar', true, 'alumno')).toBe(true);
  });

  it('grupales: solo su portal', () => {
    expect(pasa('/grupales-alumno/dashboard', true, 'grupales')).toBe(true);
    expect(pasa('/portal', true, 'grupales')).toBe(false);
    expect(pasa('/dashboard', true, 'grupales')).toBe(false);
  });

  it('profesor: horario y entrenamiento', () => {
    expect(pasa('/horario', true, 'profesor')).toBe(true);
    expect(pasa('/rutinas', true, 'profesor')).toBe(true);
    for (const p of ['/alumnos', '/usuarios', '/dashboard', '/pagos', '/api/admin/usuarios']) {
      expect(pasa(p, true, 'profesor')).toBe(false);
    }
  });

  it('recepcionista: administración sin panel ni entrenamiento', () => {
    expect(pasa('/alumnos', true, 'recepcionista')).toBe(true);
    expect(pasa('/api/admin/usuarios', true, 'recepcionista')).toBe(true); // la ruta valida el rol
    expect(pasa('/dashboard', true, 'recepcionista')).toBe(false);
    expect(pasa('/weightroom', true, 'recepcionista')).toBe(false);
  });

  it('admin y host: todo menos los portales de alumnos', () => {
    for (const r of ['admin', 'host'] as const) {
      expect(pasa('/dashboard', true, r)).toBe(true);
      expect(pasa('/usuarios', true, r)).toBe(true);
      expect(pasa('/portal/clases', true, r)).toBe(false);
    }
  });

  it('no confunde prefijos parecidos', () => {
    expect(pasa('/portales', true, 'alumno')).toBe(false);
    expect(pasa('/planesX', false, null)).toBe(false);
  });
});
