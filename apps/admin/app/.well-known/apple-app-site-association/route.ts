export const dynamic = "force-dynamic";

export function GET() {
  const identifier = process.env.ORZELL_IOS_APPLICATION_IDENTIFIER;
  if (
    !identifier ||
    !/^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(identifier)
  )
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return Response.json(
    {
      applinks: {
        details: [
          { appIDs: [identifier], components: [{ "/": "/discover/service" }] },
        ],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
