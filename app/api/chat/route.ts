import { HistoryMessage, runChatPipeline } from "@/lib/llm/pipeline";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const question = body.question?.trim();
    const history: HistoryMessage[] = body.history ?? [];

    if (!question) {
        return Response.json(
            { error: "Question is required" },
            { status: 400 }
        );
    }

    try {
        const result = await runChatPipeline(question, history);
        return Response.json({
            answer: result.answer,
            sql: result.sql,
            node_ids: result.node_ids,
            row_count: result.rows.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return Response.json({ error: message }, { status: 500 });
    }
}

