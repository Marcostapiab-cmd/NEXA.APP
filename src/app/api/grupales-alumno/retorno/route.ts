import { retornoFlow } from '@/lib/flow-retorno';

export const runtime = 'nodejs';
export const { GET, POST } = retornoFlow('/grupales-alumno/retorno');
