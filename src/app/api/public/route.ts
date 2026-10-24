import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await prisma.eventConfig.findUnique({
    where: { id: "main" },
    select: {
      promoOneUrl: true,
      promoTwoUrl: true,
      externalContestUrl: true,
      aiPolicy: true,
    },
  });

  return Response.json(
    config ?? {
      promoOneUrl: null,
      promoTwoUrl: null,
      externalContestUrl: null,
      aiPolicy: "",
    },
    {
    headers: { "Cache-Control": "no-store" },
    },
  );
}
