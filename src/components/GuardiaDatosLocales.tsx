'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { limpiarCopiasAntiguas, limpiarDatosAlumnos, registrarCuenta } from '@/lib/datos-locales';

/** Borra datos de alumnos del navegador al cargar, al cerrar sesión y al cambiar de cuenta. */
export default function GuardiaDatosLocales() {
  useEffect(() => {
    limpiarCopiasAntiguas();
    supabase.auth.getSession().then(({ data }) => registrarCuenta(data.session?.user.id ?? null)).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') limpiarDatosAlumnos();
      else registrarCuenta(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}
