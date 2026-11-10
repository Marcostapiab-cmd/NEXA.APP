import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs'; // 'edge' quedó obsoleto en Next 16.4

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  // Solo tamaños conocidos: un tamaño arbitrario (p. ej. 100000) haría generar
  // imágenes enormes a pedido de cualquiera.
  const pedido = Number(searchParams.get('size') ?? '192');
  const size = [180, 192, 512].includes(pedido) ? pedido : 192;

  return new ImageResponse(
    (
      <div
        style={{
          background: '#121212',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Math.round(size * 0.22),
        }}
      >
        <span
          style={{
            color: '#FFFFFF',
            fontSize: Math.round(size * 0.55),
            fontWeight: 900,
            fontFamily: 'Arial Black, sans-serif',
            letterSpacing: '-4px',
          }}
        >
          N
        </span>
      </div>
    ),
    { width: size, height: size },
  );
}
