import crypto from 'crypto';

const API_URL    = process.env.FLOW_API_URL    ?? 'https://sandbox.flow.cl/api';
const API_KEY    = process.env.FLOW_API_KEY    ?? '';
const SECRET_KEY = process.env.FLOW_SECRET_KEY ?? '';

function sign(params: Record<string, string>): string {
  const concat = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', SECRET_KEY).update(concat).digest('hex');
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

export async function consultarPagoFlow(token: string): Promise<{
  status: number; // 1=pendiente, 2=pagado, 3=rechazado, 4=anulado
  amount: number;
  paymentData?: Record<string, unknown>;
}> {
  const params: Record<string, string> = { apiKey: API_KEY, token };
  params.s = sign(params);
  const qs  = new URLSearchParams(params);
  const res = await fetch(`${API_URL}/payment/getStatus?${qs}`, { method: 'GET' });
  if (!res.ok) throw new Error(`Flow status error ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  return {
    status:      Number(data.status),
    amount:      Number(data.amount),
    paymentData: data as Record<string, unknown>,
  };
}
