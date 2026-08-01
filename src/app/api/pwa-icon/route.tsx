import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const size = Number(searchParams.get('size') ?? '192');

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
