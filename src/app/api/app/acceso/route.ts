import { NextRequest, NextResponse } from 'next/server';
import { clienteServicio, exigirRol } from '@/lib/auth-server';
import { asegurarPerfil } from '@/lib/perfil-server';

export const runtime = 'nodejs';

// Acceso a la app de rutinas: solo un admin crea o cambia la clave de un alumno.
//  POST   { alumnoId, email, clave } → crea la cuenta (o cambia la clave) y la liga a la ficha
//  DELETE { alumnoId }               → bloquea el acceso (la cuenta no se borra)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function buscarUsuario(admin: ReturnType<typeof clienteServicio>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find(x => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const s = await exigirRol(['admin', 'host']);
  if (!s.ok) return s.res;
  try {
    const { alumnoId, email, clave } = await req.json() as { alumnoId?: string; email?: string; clave?: string };
    const correo = email?.trim().toLowerCase() ?? '';
    if (!alumnoId) return NextResponse.json({ error: 'Falta el alumno.' }, { status: 400 });
    if (!EMAIL_RE.test(correo)) return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 });
    if (!clave || clave.length < 8) return NextResponse.json({ error: 'La clave debe tener al menos 8 caracteres.' }, { status: 400 });

    const admin = clienteServicio();
    const { data: ficha } = await admin.from('atletas').select('id, nombre, apellido, email, user_id').eq('id', alumnoId).maybeSingle();
    if (!ficha) return NextResponse.json({ error: 'No se encontró el alumno.' }, { status: 404 });
    const nombre = `${ficha.nombre ?? ''} ${ficha.apellido ?? ''}`.trim();

    let userId: string;
    const existente = await buscarUsuario(admin, correo);
    if (existente) {
      userId = existente.id;
      const { data: perfil } = await admin.from('perfiles').select('rol').eq('id', userId).maybeSingle();
      if ((perfil && perfil.rol !== 'alumno') || existente.app_metadata?.rol === 'grupales') {
        return NextResponse.json({ error: 'Ese correo ya pertenece a otra cuenta de NEXA (personal o clases grupales). Usa otro correo.' }, { status: 409 });
      }
      const { data: otra } = await admin.from('atletas').select('id').eq('user_id', userId).neq('id', alumnoId).limit(1);
      if (otra?.length) {
        return NextResponse.json({ error: 'Ese correo ya lo usa otro alumno.' }, { status: 409 });
      }
      const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
        password: clave, ban_duration: 'none', app_metadata: { ...(existente.app_metadata ?? {}), rol: 'alumno' },
      });
      if (upErr) throw upErr;
    } else {
      const { data: nuevo, error: crErr } = await admin.auth.admin.createUser({
        email: correo, password: clave, email_confirm: true,
        app_metadata: { rol: 'alumno' }, user_metadata: { nombre },
      });
      if (crErr || !nuevo.user) throw crErr ?? new Error('No se pudo crear la cuenta.');
      userId = nuevo.user.id;
    }

    const perfil = await asegurarPerfil(admin, userId, 'alumno', nombre);
    if (perfil.error) throw new Error(perfil.error);
    // El perfil nuevo crea una ficha automática: este alumno ya tiene la suya.
    await admin.from('atletas').delete().eq('perfil_id', userId).neq('id', alumnoId);
    // Si la ficha estaba ligada a otra cuenta, se cambia a la nueva.
    const { error: linkErr } = await admin.from('atletas')
      .update({ user_id: userId, ...(ficha.email ? {} : { email: correo }) }).eq('id', alumnoId);
    if (linkErr) throw linkErr;

    const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    return NextResponse.json({ ok: true, link: `${base}/app`, email: correo, nueva: !existente });
  } catch (err) {
    console.error('[app/acceso] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudo crear el acceso. Inténtalo de nuevo.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const s = await exigirRol(['admin', 'host']);
  if (!s.ok) return s.res;
  const { alumnoId } = await req.json() as { alumnoId?: string };
  if (!alumnoId) return NextResponse.json({ error: 'Falta el alumno.' }, { status: 400 });
  const admin = clienteServicio();
  const { data: ficha } = await admin.from('atletas').select('user_id').eq('id', alumnoId).maybeSingle();
  if (!ficha?.user_id) return NextResponse.json({ error: 'El alumno no tiene acceso.' }, { status: 404 });
  const { data: perfil } = await admin.from('perfiles').select('rol').eq('id', ficha.user_id).maybeSingle();
  if (perfil && perfil.rol !== 'alumno') return NextResponse.json({ error: 'No se puede bloquear una cuenta del personal aquí.' }, { status: 409 });
  const { error } = await admin.auth.admin.updateUserById(ficha.user_id, { ban_duration: '876000h' });
  if (error) return NextResponse.json({ error: 'No se pudo bloquear el acceso.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const s = await exigirRol(['admin', 'host']);
  if (!s.ok) return s.res;
  const alumnoId = req.nextUrl.searchParams.get('alumnoId');
  if (!alumnoId) return NextResponse.json({ error: 'Falta el alumno.' }, { status: 400 });
  const admin = clienteServicio();
  const { data: ficha } = await admin.from('atletas').select('user_id, email').eq('id', alumnoId).maybeSingle();
  if (!ficha?.user_id) return NextResponse.json({ tiene: false, email: ficha?.email ?? '' });
  const { data } = await admin.auth.admin.getUserById(ficha.user_id);
  const bloqueado = !!data.user?.banned_until && new Date(data.user.banned_until) > new Date();
  return NextResponse.json({ tiene: true, bloqueado, email: data.user?.email ?? ficha.email ?? '' });
}
