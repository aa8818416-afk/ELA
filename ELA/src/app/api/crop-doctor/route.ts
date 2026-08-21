import { NextResponse } from "next/server";

/**
 * DEPRECATED: This legacy endpoint has been deprecated and replaced by /api/crop-chat.
 */
export async function POST() {
    return NextResponse.json(
        { error: "Endpoint deprecated. Please use /api/crop-chat instead." },
        { status: 410 }
    );
}

export async function GET() {
    return NextResponse.json(
        { error: "Endpoint deprecated. Please use /api/crop-chat instead." },
        { status: 410 }
    );
}
