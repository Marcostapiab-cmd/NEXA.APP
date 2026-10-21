import { NextRequest, NextResponse } from 'next/server';

/**
 * Flow vuelve a la urlReturn con un POST (token en el form-data); algunos
 * medios usan GET. Este handler lee el token y redirige (303) a la página
 * de resultado, que consulta el estado real en el servidor.
 */
export function retornoFlow(destino: string) {
  async function handler(req: NextRequest) {
    let token = req.nextUrl.searchParams.get('token') ?? '';
    if (!token && req.method === 'POST') {
      try { token = (await req.formData()).get('token')?.toString() ?? ''; } catch { token = ''; }
    }
    const url = new URL(destino, req.nextUrl.origin);
    if (token) url.searchParams.set('token', token);
    return NextResponse.redirect(url, 303);
  }
  return { GET: handler, POST: handler };
}
