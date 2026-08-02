'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function GrupalesAlumnoRoot() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.user_metadata?.rol === 'grupales') {
        router.replace('/grupales-alumno/dashboard');
      } else {
        router.replace('/grupales-alumno/login');
      }
    });
  }, [router]);
  return null;
}
