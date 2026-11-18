import { toQR } from "toqr";

export function ServiceQr({ url }: { url: string }) {
  const modules = toQR(url);
  const width = Math.sqrt(modules.length);
  const size = width + 8;
  const path = Array.from(modules, (dark, i) =>
    dark ? `M${4 + (i % width)} ${4 + Math.floor(i / width)}h1v1h-1z` : "",
  ).join("");
  return (
    <details>
      <summary>Hizmetin QR kodunu göster</summary>
      <svg
        role="img"
        aria-label="Hizmet bağlantısının QR kodu"
        width="256"
        height="256"
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
      >
        <rect width={size} height={size} fill="white" />
        <path d={path} fill="black" />
      </svg>
    </details>
  );
}
