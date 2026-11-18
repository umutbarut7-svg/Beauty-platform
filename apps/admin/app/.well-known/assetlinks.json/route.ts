export const dynamic = "force-dynamic";

export function GET() {
  const name = process.env.ORZELL_ANDROID_APPLICATION_ID;
  const cert = process.env.ORZELL_ANDROID_CERT_SHA256;
  if (
    !name ||
    !/^[A-Za-z]\w*(?:\.[A-Za-z]\w*)+$/.test(name) ||
    !cert ||
    !/^(?:[a-f\d]{2}:){31}[a-f\d]{2}$/i.test(cert)
  )
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: name,
          sha256_cert_fingerprints: [cert.toUpperCase()],
        },
      },
    ],
    { headers: { "Cache-Control": "no-store" } },
  );
}
