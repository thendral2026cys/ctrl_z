import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Request validation failed.",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      { error: "A record with those details already exists." },
      { status: 409 },
    );
  }

  if (error instanceof Error && error.message.includes("same-origin")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof Error && error.message.includes("Cross-origin")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  console.error("ctrl_z API request failed", error);
  return NextResponse.json(
    { error: "The request could not be completed." },
    { status: 500 },
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError("Request body must be valid JSON.", 400);
  }
}
