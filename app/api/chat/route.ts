import { runChatPipeline } from "@/lib/llm/pipeline";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const question = body.question?.trim();

    if (!question) {
        return Response.json(
            { error: "Question is required" },
            { status: 400 }
        );
    }

    try {
        const result = await runChatPipeline(question);
        return Response.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
    }
}

