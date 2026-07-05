import { describe, it, expect } from 'vitest';
import { parseVoiceTranscript } from './voiceParser';

// ─── Caso 1: "primera/segunda/tercera serie N repeticiones con M kilos" ────────

describe('Caso 1 — múltiples series con keyword "serie"', () => {
  const result = parseVoiceTranscript(
    'Press banca primera serie 4 repeticiones con 30 kilos segunda serie 7 repeticiones con 30 kilos tercera serie 6 repeticiones con 27 kilos'
  );

  it('detecta 3 series', () => {
    expect(result?.series).toHaveLength(3);
  });

  it('nombre del ejercicio = Press banca', () => {
    expect(result?.exerciseName.toLowerCase()).toBe('press banca');
  });

  it('serie 1: 4 reps × 30 kg', () => {
    expect(result?.series[0]).toMatchObject({ setNumber: 1, reps: 4, weight: 30 });
  });

  it('serie 2: 7 reps × 30 kg', () => {
    expect(result?.series[1]).toMatchObject({ setNumber: 2, reps: 7, weight: 30 });
  });

  it('serie 3: 6 reps × 27 kg', () => {
    expect(result?.series[2]).toMatchObject({ setNumber: 3, reps: 6, weight: 27 });
  });
});

// ─── Caso 2: "hice N series: la primera N con M kilos" ─────────────────────────

describe('Caso 2 — "la primera/segunda/tercera N con M kilos" (sin keyword de reps)', () => {
  const result = parseVoiceTranscript(
    'Sentadilla goblet hice 3 series la primera 10 con 12 kilos la segunda 12 con 12 kilos la tercera 10 con 14 kilos'
  );

  it('detecta 3 series', () => {
    expect(result?.series).toHaveLength(3);
  });

  it('nombre = Sentadilla goblet', () => {
    expect(result?.exerciseName.toLowerCase()).toBe('sentadilla goblet');
  });

  it('serie 1: 10 reps × 12 kg', () => {
    expect(result?.series[0]).toMatchObject({ setNumber: 1, reps: 10, weight: 12 });
  });

  it('serie 2: 12 reps × 12 kg', () => {
    expect(result?.series[1]).toMatchObject({ setNumber: 2, reps: 12, weight: 12 });
  });

  it('serie 3: 10 reps × 14 kg', () => {
    expect(result?.series[2]).toMatchObject({ setNumber: 3, reps: 10, weight: 14 });
  });
});

// ─── Caso 3: "serie uno/dos/tres N reps con M kg" ──────────────────────────────

describe('Caso 3 — patrón "serie uno / serie dos / serie tres"', () => {
  const result = parseVoiceTranscript(
    'Peso muerto rumano serie uno 8 reps con 40 kg serie dos 8 reps con 40 kg serie tres 6 reps con 45 kg'
  );

  it('detecta 3 series', () => {
    expect(result?.series).toHaveLength(3);
  });

  it('nombre = Peso muerto rumano', () => {
    expect(result?.exerciseName.toLowerCase()).toBe('peso muerto rumano');
  });

  it('serie 1: 8 reps × 40 kg', () => {
    expect(result?.series[0]).toMatchObject({ setNumber: 1, reps: 8, weight: 40 });
  });

  it('serie 2: 8 reps × 40 kg', () => {
    expect(result?.series[1]).toMatchObject({ setNumber: 2, reps: 8, weight: 40 });
  });

  it('serie 3: 6 reps × 45 kg', () => {
    expect(result?.series[2]).toMatchObject({ setNumber: 3, reps: 6, weight: 45 });
  });
});

// ─── Caso 4: solo repeticiones, sin peso ───────────────────────────────────────

describe('Caso 4 — series sin peso (peso = null)', () => {
  const result = parseVoiceTranscript(
    'Hip thrust primera 12 repeticiones segunda 10 repeticiones tercera 8 repeticiones'
  );

  it('detecta 3 series', () => {
    expect(result?.series).toHaveLength(3);
  });

  it('nombre = Hip thrust', () => {
    expect(result?.exerciseName.toLowerCase()).toBe('hip thrust');
  });

  it('serie 1: 12 reps, sin peso', () => {
    expect(result?.series[0]).toMatchObject({ setNumber: 1, reps: 12, weight: null });
  });

  it('serie 2: 10 reps, sin peso', () => {
    expect(result?.series[1]).toMatchObject({ setNumber: 2, reps: 10, weight: null });
  });

  it('serie 3: 8 reps, sin peso', () => {
    expect(result?.series[2]).toMatchObject({ setNumber: 3, reps: 8, weight: null });
  });
});

// ─── Caso 5: RIR por serie ──────────────────────────────────────────────────────

describe('Caso 5 — RIR por serie', () => {
  const result = parseVoiceTranscript(
    'Press banca primera serie 8 reps con 30 kilos RIR 2 segunda serie 7 reps con 30 kilos RIR 1'
  );

  it('detecta 2 series', () => {
    expect(result?.series).toHaveLength(2);
  });

  it('serie 1: RIR = 2', () => {
    expect(result?.series[0]).toMatchObject({ reps: 8, weight: 30, rir: 2 });
  });

  it('serie 2: RIR = 1', () => {
    expect(result?.series[1]).toMatchObject({ reps: 7, weight: 30, rir: 1 });
  });
});

// ─── Caso 6: serie única (sin ordinal) ─────────────────────────────────────────

describe('Caso 6 — serie única sin ordinal', () => {
  const result = parseVoiceTranscript(
    'Press banca 8 repeticiones con 60 kilos'
  );

  it('detecta 1 serie', () => {
    expect(result?.series).toHaveLength(1);
  });

  it('reps = 8, peso = 60', () => {
    expect(result?.series[0]).toMatchObject({ setNumber: 1, reps: 8, weight: 60 });
  });
});

// ─── Caso 7: comas en el dictado ───────────────────────────────────────────────

describe('Caso 7 — texto con comas (como en el ejemplo del usuario)', () => {
  const result = parseVoiceTranscript(
    'Press banca, primera serie 4 repeticiones con 30 kilos, segunda serie 7 repeticiones con 30 kilos, tercera serie 6 repeticiones con 27 kilos'
  );

  it('detecta 3 series (comas no interfieren)', () => {
    expect(result?.series).toHaveLength(3);
  });

  it('serie 1: 4 × 30', () => {
    expect(result?.series[0]).toMatchObject({ reps: 4, weight: 30 });
  });

  it('serie 3: 6 × 27', () => {
    expect(result?.series[2]).toMatchObject({ reps: 6, weight: 27 });
  });
});

// ─── Caso 8: "la segunda 8 repeticiones" sin peso ────────────────────────────

describe('Caso 8 — serie detectada aunque falte el peso', () => {
  const result = parseVoiceTranscript(
    'Curl de bíceps la primera 12 repeticiones la segunda 8 repeticiones'
  );

  it('detecta 2 series', () => {
    expect(result?.series).toHaveLength(2);
  });

  it('serie 2 tiene peso null (no se descarta)', () => {
    expect(result?.series[1].weight).toBeNull();
    expect(result?.series[1].reps).toBe(8);
  });
});

// ─── Caso 9: números escritos para el peso ─────────────────────────────────────

describe('Caso 9 — peso en palabras (treinta kilos, veinte kilos)', () => {
  const result = parseVoiceTranscript(
    'Sentadilla primera serie 10 repeticiones con treinta kilos segunda serie 8 repeticiones con treinta y cinco kilos'
  );

  it('detecta al menos 2 series', () => {
    expect(result?.series.length).toBeGreaterThanOrEqual(2);
  });

  it('primera serie tiene peso 30', () => {
    expect(result?.series[0].weight).toBe(30);
  });
});

// ─── Caso 10: RPE ──────────────────────────────────────────────────────────────

describe('Caso 10 — RPE por serie', () => {
  const result = parseVoiceTranscript(
    'Sentadilla primera serie 5 reps con 80 kilos RPE 8 segunda serie 5 reps con 85 kilos RPE 9'
  );

  it('serie 1: RPE = 8', () => {
    expect(result?.series[0].rpe).toBe(8);
  });

  it('serie 2: RPE = 9', () => {
    expect(result?.series[1].rpe).toBe(9);
  });
});

// ─── Caso 11: texto vacío ──────────────────────────────────────────────────────

describe('Caso 11 — texto vacío', () => {
  it('retorna null para texto vacío', () => {
    expect(parseVoiceTranscript('')).toBeNull();
    expect(parseVoiceTranscript('   ')).toBeNull();
  });
});

// ─── Caso 12: frase exacta reportada (3 series, coma entre cada una) ──────────

describe('Caso 12 — "Press banca primera serie 5 reps con 30 kilos, segunda... tercera..."', () => {
  const result = parseVoiceTranscript(
    'Press banca primera serie 5 repeticiones con 30 kilos, segunda serie 7 repeticiones con 30 kilos, tercera serie 6 repeticiones con 27 kilos'
  );

  it('detecta exactamente 3 series (no solo 1)', () => {
    expect(result?.series).toHaveLength(3);
  });

  it('serie 1: 5 reps × 30 kg', () => {
    expect(result?.series[0]).toMatchObject({ setNumber: 1, reps: 5, weight: 30 });
  });

  it('serie 2: 7 reps × 30 kg', () => {
    expect(result?.series[1]).toMatchObject({ setNumber: 2, reps: 7, weight: 30 });
  });

  it('serie 3: 6 reps × 27 kg', () => {
    expect(result?.series[2]).toMatchObject({ setNumber: 3, reps: 6, weight: 27 });
  });

  it('acepta "kg" como alternativa a "kilos"', () => {
    const r = parseVoiceTranscript('Sentadilla primera serie 8 reps con 50 kg segunda serie 8 reps con 50 kg');
    expect(r?.series).toHaveLength(2);
    expect(r?.series[0].weight).toBe(50);
  });

  it('acepta "reps" como alternativa a "repeticiones"', () => {
    const r = parseVoiceTranscript('Sentadilla primera serie 8 reps con 50 kilos segunda serie 8 reps con 50 kilos');
    expect(r?.series).toHaveLength(2);
    expect(r?.series[0].reps).toBe(8);
  });
});
