import { useState, type HTMLAttributes } from 'react';

/** A rounded lens normal map. Only the bevel displaces the backdrop; content stays crisp. */
function lensMap() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x - size / 2,
        py = y - size / 2;
      const qx = Math.abs(px) - 94,
        qy = Math.abs(py) - 94;
      const ox = Math.max(qx, 0),
        oy = Math.max(qy, 0);
      const length = Math.hypot(ox, oy);
      const distance = Math.min(Math.max(qx, qy), 0) + length - 32;
      const bevel =
        distance < 0 && distance > -22
          ? Math.sin((1 + distance / 22) * Math.PI)
          : 0;
      const nx = length
        ? (ox / length) * Math.sign(px)
        : qx > qy
          ? Math.sign(px)
          : 0;
      const ny = length
        ? (oy / length) * Math.sign(py)
        : qy >= qx
          ? Math.sign(py)
          : 0;
      const index = (y * size + x) * 4;
      pixels.data[index] = 128 + nx * bevel * 110;
      pixels.data[index + 1] = 128 + ny * bevel * 110;
      pixels.data[index + 2] = 128;
      pixels.data[index + 3] = 255;
    }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

export function LiquidOptics() {
  const [map] = useState(lensMap);
  return (
    <svg className="liquid-optics" aria-hidden="true" width="0" height="0">
      <defs>
        <filter
          id="liquid-lens"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          {map && (
            <feImage
              href={map}
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="lens"
            />
          )}
          {map && (
            <feDisplacementMap
              in="SourceGraphic"
              in2="lens"
              scale="18"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          )}
        </filter>
      </defs>
    </svg>
  );
}

/** Compatibility wrapper for the shared opaque workspace card. */
export function LiquidSurface({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`liquid-surface ${className}`}><div className="liquid-content">{children}</div></div>;
}

export function LiquidLandscape() {
  return (
    <div className="liquid-landscape" aria-hidden="true">
      <svg viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="landscape-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#b8d4ff" />
            <stop offset=".45" stopColor="#7d9fdd" />
            <stop offset="1" stopColor="#b3a0e5" />
          </linearGradient>
          <linearGradient id="landscape-edge">
            <stop stopColor="#e7efff" stopOpacity="0" />
            <stop offset=".5" stopColor="#e7efff" stopOpacity=".75" />
            <stop offset="1" stopColor="#e7efff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M-280 690C120 10 470 1150 940 380S1680 230 1660-140"
          fill="none"
          stroke="url(#landscape-ribbon)"
          strokeWidth="340"
        />
        <path
          d="M-280 516C120-164 470 976 940 206S1680 56 1660-314"
          fill="none"
          stroke="url(#landscape-edge)"
          strokeWidth="2"
        />
        <path
          d="M-280 866C120 186 470 1326 940 556S1680 406 1660 36"
          fill="none"
          stroke="url(#landscape-edge)"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
}
