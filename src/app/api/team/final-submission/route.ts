function removedFeatureResponse() {
  return Response.json(
    { error: "Three-link final submissions are no longer available." },
    { status: 410 },
  );
}

export async function GET() {
  return removedFeatureResponse();
}

export async function POST() {
  return removedFeatureResponse();
}
