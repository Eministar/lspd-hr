import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export const alt = 'LSPD HR Dashboard mit Los Santos Police Department Logo'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  const logoData = await readFile(join(process.cwd(), 'public', 'logo-og.png'), 'base64')
  const logoSrc = `data:image/png;base64,${logoData}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#061426',
          color: '#edf4fb',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -190,
            right: -170,
            width: 520,
            height: 520,
            borderRadius: 520,
            backgroundColor: '#142d52',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 86,
            bottom: 76,
            width: 360,
            height: 360,
            borderRadius: 360,
            border: '1px solid rgba(212, 175, 55, 0.24)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 12,
            backgroundColor: '#d4af37',
          }}
        />
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '72px 86px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', width: 670 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                color: '#f1d36f',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: 0,
              }}
            >
              Los Santos Police Department
            </div>
            <div
              style={{
                marginTop: 34,
                display: 'flex',
                flexDirection: 'column',
                fontSize: 82,
                fontWeight: 800,
                lineHeight: 0.96,
                letterSpacing: 0,
              }}
            >
              <span>LSPD HR</span>
              <span>Dashboard</span>
            </div>
            <div
              style={{
                marginTop: 34,
                display: 'flex',
                color: '#bfd0e2',
                fontSize: 30,
                lineHeight: 1.3,
              }}
            >
              Personalverwaltung, Dienstzeiten und Human-Resources-Tools für NeroV.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 310,
              height: 310,
              borderRadius: 310,
              background: 'rgba(6, 20, 38, 0.62)',
              border: '2px solid rgba(212, 175, 55, 0.34)',
            }}
          >
            <img src={logoSrc} alt="LSPD Logo" width={236} height={236} />
          </div>
        </div>
      </div>
    ),
    size,
  )
}
