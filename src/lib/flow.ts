import crypto from 'crypto';

const API_URL    = process.env.FLOW_API_URL    ?? 'https://sandbox.flow.cl/api';
const API_KEY    = process.env.FLOW_API_KEY    ?? '';
const SECRET_KEY = process.env.FLOW_SECRET_KEY ?? '';

function sign(params: Record<string, string>): string {
  const concat = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', SECRET_KEY).update(concat).digest('hex');
}

// ── Pago simulado (solo pruebas locales) ─────────────────────────
// Con PAGOS_SIMULADOS=1 y `next dev`, no se llama a Flow: el pago se da por
// aprobado al instante y se ejecuta el mismo webhook de confirmación que
// usaría Flow. Nunca se activa en Vercel ni en un build de producción.
const PREFIJO_SIM = 'sim-';

export function pagosSimulados(): boolean {
  return process.env.NODE_ENV === 'development'
    && process.env.PAGOS_SIMULADOS === '1'
    && !process.env.VERCEL
    && baseDePrueba();
}

/**
 * Los pagos simulados crean planes y pagos "pagados" de verdad en la base.
 * Solo se permiten contra una base local, o si se declara explícitamente que la
 * base configurada es de pruebas (PAGOS_SIMULADOS_BASE_DE_PRUEBA=1). Así nunca
 * se activan contra producción por accidente.
 */
function baseDePrueba(): boolean {
  if (process.env.PAGOS_SIMULADOS_BASE_DE_PRUEBA === '1') return true;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch { return false; }
}

/** Solo la ruta (sin dominio), para que el simulador siempre use el servidor local. */
function soloRuta(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

export interface FlowPaymentResult {
  url:       string;   // URL base de Flow
  token:     string;   // Token para agregar a la URL
  flowOrder: number;   // Número de orden de Flow
  payUrl:    string;   // URL completa para redirigir al cliente
}

export async function crearPagoFlow(opts: {
  commerceOrder: string;   // ID único de tu orden
  subject:       string;   // Descripción (ej: "Plan Trimestral - Juan Pérez")
  amount:        number;   // Monto en pesos CLP (entero)
  email:         string;   // Email del pagador
  urlReturn:     string;   // A donde redirigir después del pago
  urlConfirmation: string; // Webhook que Flow llama al confirmar
}): Promise<FlowPaymentResult> {
  if (pagosSimulados()) {
    const token = `${PREFIJO_SIM}${opts.amount}-${crypto.randomUUID()}`;
    const qs = new URLSearchParams({ token, c: soloRuta(opts.urlConfirmation), r: soloRuta(opts.urlReturn) });
    return { url: '/api/reservar/simular-pago', token, flowOrder: 0, payUrl: `/api/reservar/simular-pago?${qs}` };
  }

  const params: Record<string, string> = {
    apiKey:          API_KEY,
    commerceOrder:   opts.commerceOrder,
    subject:         opts.subject,
    currency:        'CLP',
    amount:          String(opts.amount),
    email:           opts.email,
    urlReturn:       opts.urlReturn,
    urlConfirmation: opts.urlConfirmation,
    paymentMethod:   '9',   // 9 = todos los métodos disponibles
  };
  params.s = sign(params);

  const body = new URLSearchParams(params);
  const res  = await fetch(`${API_URL}/payment/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flow error ${res.status}: ${text}`);
  }

  const data = await res.json() as { url: string; token: string; flowOrder: number };
  return {
    url:       data.url,
    token:     data.token,
    flowOrder: data.flowOrder,
    payUrl:    `${data.url}?token=${data.token}`,
  };
}

export interface EstadoPagoFlow {
  status: number;               // 1=pendiente, 2=pagado, 3=rechazado, 4=anulado
  amount: number;
  currency: string | null;      // debe ser 'CLP'
  commerceOrder: string | null; // nuestro número de orden
  simulado?: boolean;
  paymentData?: Record<string, unknown>;
}

export async function consultarPagoFlow(token: string): Promise<EstadoPagoFlow> {
  if (token.startsWith(PREFIJO_SIM)) {
    // Un token simulado fuera del modo simulado nunca se da por pagado.
    if (!pagosSimulados()) return { status: 3, amount: 0, currency: null, commerceOrder: null };
    const amount = Number(token.slice(PREFIJO_SIM.length).split('-')[0]);
    return { status: 2, amount, currency: 'CLP', commerceOrder: null, simulado: true, paymentData: { simulado: true } };
  }

  const params: Record<string, string> = { apiKey: API_KEY, token };
  params.s = sign(params);
  const qs  = new URLSearchParams(params);
  const res = await fetch(`${API_URL}/payment/getStatus?${qs}`, { method: 'GET' });
  if (!res.ok) throw new Error(`Flow status error ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  return {
    status:        Number(data.status),
    amount:        Number(data.amount),
    currency:      typeof data.currency === 'string' ? data.currency : null,
    commerceOrder: typeof data.commerceOrder === 'string' ? data.commerceOrder : null,
    paymentData:   data,
  };
}

/**
 * Datos verificados de Flow para pasar a la base. Fuera del modo simulado, Flow
 * siempre informa el número de orden: si falta, se envía uno que no coincide
 * para que el pedido quede en revisión en vez de aprobarse sin verificar.
 */
export function datosVerificacion(pago: EstadoPagoFlow): { monto: number; moneda: string; orden: string | null } {
  return {
    monto:  Math.round(pago.amount),
    moneda: (pago.currency ?? '').toUpperCase(),
    orden:  pago.simulado ? null : (pago.commerceOrder ?? '(sin orden informada por Flow)'),
  };
}
