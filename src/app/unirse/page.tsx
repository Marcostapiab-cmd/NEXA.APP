'use client';

import { useState } from 'react';
import { CheckCircle, ArrowRight, Dumbbell, Target, Zap, Heart } from 'lucide-react';

const OBJETIVOS = [
  { value: 'perdida_peso',   label: 'Bajar de peso',        Icon: Target },
  { value: 'masa_muscular',  label: 'Ganar masa muscular',  Icon: Dumbbell },
  { value: 'rendimiento',    label: 'Mejorar rendimiento',  Icon: Zap },
  { value: 'salud_general',  label: 'Salud y bienestar',    Icon: Heart },
];

export default function UnirsePage() {
  const [form, setForm] = useState({
    nombre:   '',
    apellido: '',
    email:    '',
    telefono: '',
    objetivo: '',
    mensaje:  '',
  });
  const [enviando, setEnviando] = useState(false);
  const [ok,       setOk]       = useState(false);
  const [error,    setError]    = useState('');

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('Ingresa tu nombre.'); return; }
    if (!form.email.trim() && !form.telefono.trim()) {
      setError('Ingresa tu email o teléfono para que podamos contactarte.');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/api/prospectos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Error al enviar');
      setOk(true);
    } catch {
      setError('Hubo un problema al enviar. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (ok) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0d0f10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: '#1a2e1c', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={36} color="#6f9a79" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#f5f4f0', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            ¡Listo, {form.nombre}!
          </h1>
          <p style={{ fontSize: 16, color: '#858b8e', margin: '0 0 32px', lineHeight: 1.6 }}>
            Recibimos tu solicitud. Te contactaremos en las próximas 24 horas.
          </p>
          <div style={{ background: '#141819', border: '1px solid #1f2528', borderRadius: 16, padding: '20px 24px', textAlign: 'left' }}>
            <p style={{ fontSize: 12, color: '#858b8e', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mientras tanto</p>
            <p style={{ fontSize: 14, color: '#b8bdc0', margin: 0 }}>Síguenos en Instagram para ver contenido de entrenamiento y novedades.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0d0f10', color: '#f5f4f0', fontFamily: 'var(--font-inter, Inter, sans-serif)' }}>

      {/* Header */}
      <header style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, background: '#f3f1ec', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#0d0f10', letterSpacing: 2 }}>N</span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '0.14em' }}>NEXA</span>
      </header>

      <main style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px 60px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6f9a79', margin: '0 0 12px' }}>
            Empieza hoy
          </p>
          <h1 style={{ fontSize: 'clamp(28px, 8vw, 40px)', fontWeight: 900, letterSpacing: '-0.025em', margin: '0 0 12px', lineHeight: 1.1 }}>
            Transforma tu cuerpo<br />
            <span style={{ color: '#858b8e' }}>con un plan a tu medida.</span>
          </h1>
          <p style={{ fontSize: 15, color: '#858b8e', margin: 0, lineHeight: 1.6 }}>
            Déjanos tus datos y te contactamos para armar un plan personalizado.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nombre + Apellido */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#858b8e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nombre *</label>
              <input
                value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Marco"
                style={{ width: '100%', background: '#141819', border: '1px solid #282e31', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#f5f4f0', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#858b8e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Apellido</label>
              <input
                value={form.apellido}
                onChange={e => set('apellido', e.target.value)}
                placeholder="García"
                style={{ width: '100%', background: '#141819', border: '1px solid #282e31', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#f5f4f0', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#858b8e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="tu@email.com"
              style={{ width: '100%', background: '#141819', border: '1px solid #282e31', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#f5f4f0', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Teléfono */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#858b8e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>WhatsApp / Teléfono</label>
            <input
              type="tel"
              value={form.telefono}
              onChange={e => set('telefono', e.target.value)}
              placeholder="+56 9 1234 5678"
              style={{ width: '100%', background: '#141819', border: '1px solid #282e31', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#f5f4f0', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Objetivo */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#858b8e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>¿Cuál es tu objetivo?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {OBJETIVOS.map(({ value, label, Icon }) => {
                const selected = form.objetivo === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('objetivo', selected ? '' : value)}
                    style={{
                      background:   selected ? '#f3f1ec' : '#141819',
                      border:       `1px solid ${selected ? 'transparent' : '#282e31'}`,
                      borderRadius: 12,
                      padding:      '14px 12px',
                      cursor:       'pointer',
                      textAlign:    'left',
                      transition:   'all 150ms',
                    }}
                  >
                    <Icon size={18} color={selected ? '#0d0f10' : '#858b8e'} />
                    <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: selected ? '#0d0f10' : '#b8bdc0' }}>{label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mensaje */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#858b8e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cuéntanos algo más (opcional)</label>
            <textarea
              value={form.mensaje}
              onChange={e => set('mensaje', e.target.value)}
              placeholder="Experiencia previa, horarios disponibles, lesiones..."
              rows={3}
              style={{ width: '100%', background: '#141819', border: '1px solid #282e31', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#f5f4f0', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#e87070', margin: 0, padding: '10px 14px', background: '#1f1414', borderRadius: 8, border: '1px solid #3a1f1f' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={enviando}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            8,
              width:          '100%',
              padding:        '16px',
              background:     enviando ? '#2a2d30' : '#f3f1ec',
              color:          enviando ? '#858b8e' : '#0d0f10',
              border:         'none',
              borderRadius:   12,
              fontSize:       15,
              fontWeight:     700,
              cursor:         enviando ? 'not-allowed' : 'pointer',
              transition:     'all 150ms',
              marginTop:      4,
            }}
          >
            {enviando ? 'Enviando...' : (<>Quiero empezar <ArrowRight size={16} /></>)}
          </button>

          <p style={{ fontSize: 12, color: '#555a5e', textAlign: 'center', margin: 0 }}>
            Sin spam. Te contactamos en menos de 24 horas.
          </p>
        </form>
      </main>
    </div>
  );
}
