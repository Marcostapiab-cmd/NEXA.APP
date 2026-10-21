import { redirect } from 'next/navigation';

// El middleware ya garantiza una sesión de alumno grupal en esta ruta
export default function GrupalesAlumnoRoot() {
  redirect('/grupales-alumno/dashboard');
}
