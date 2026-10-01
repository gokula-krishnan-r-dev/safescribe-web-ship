import { ImageResponse } from 'next/og';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const alt = 'SafeScribe — Clinical intelligence for pharmacists';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const candidates = [
    join(process.cwd(), 'public/safescribe-mark.png'),
    join(process.cwd(), 'apps/web/public/safescribe-mark.png'),
  ];
  const markPath = candidates.find((p) => existsSync(p));
  if (!markPath) {
    throw new Error('SafeScribe mark is missing from public/safescribe-mark.png');
  }
  const mark = await readFile(markPath);
  const src = `data:image/png;base64,${mark.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 48,
          background: 'linear-gradient(135deg, #F4F8F8 0%, #E8F2F1 55%, #D7EBE9 100%)',
          padding: 80,
        }}
      >
        <img
          src={src}
          width={196}
          height={196}
          alt=""
          style={{ borderRadius: 40, boxShadow: '0 16px 40px rgba(6, 36, 74, 0.18)' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              color: '#06244A',
              lineHeight: 1.05,
            }}
          >
            SafeScribe
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 30,
              color: '#0F6F6B',
              fontWeight: 600,
            }}
          >
            Clinical intelligence for pharmacists
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 22,
              color: '#425A78',
              lineHeight: 1.35,
            }}
          >
            Assess confidently. Prescribe safely. Document faster.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
