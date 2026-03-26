import supabase from "../db/client";
import groq from "./groq";
import { buildAnswerPrompt, SYSTEM_PROMPT } from "./prompts";

interface LLMSQLResponse {
    sql: string | null;
    answer: string;
    node_ids: string[];
}

interface LLMAnswerResponse {
    answer: string;
    node_ids: string[]
}

export interface PipelineResult {
    answer: string;
    sql: string | null;
    rows: unknown[];
    node_ids: string[];
}

export interface HistoryMessage {
    role: 'user' | 'assistant'
    content: string;
}

export async function runChatPipeline(question: string, history: HistoryMessage[] = []): Promise<PipelineResult> {

    // Call 1: Question → SQL
    // History injected so LLM has context for follow-up questions
    const call1 = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...history,
            { role: "user", content: `Question: ${question}\n\nThink step by step, then respond with JSON.` }
        ]
    });

    let parsed: LLMSQLResponse;
    try {
        parsed = JSON.parse(call1.choices[0].message.content ?? '{}');
    } catch (_error) {
        return {
            answer: "I had trouble processing that question. Please try rephrasing.",
            sql: null,
            rows: [],
            node_ids: []
        }
    }

    // Guardrail — off-topic returns sql: null
    if (!parsed.sql) {
        return {
            answer: parsed.answer,
            sql: null,
            rows: [],
            node_ids: []
        }
    }

    // Safety check — only SELECT allowed
    const sqlUpper = parsed.sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT')) {
        return {
            answer: "I can only run read queries on this dataset.",
            sql: parsed.sql,
            rows: [],
            node_ids: []
        }
    }

    const { data: rows, error: sqlError } = await supabase
        .rpc('execute_sql', { query: parsed.sql });

    if (sqlError) {
        return {
            answer: `Query failed: ${sqlError.message}. Please try rephrasing your question.`,
            sql: parsed.sql,
            rows: [],
            node_ids: []
        }
    }

    const resultRows = rows ?? [];

    // Call 2: rows → natural language answer
    const call2 = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
            { role: "user", content: buildAnswerPrompt(question, resultRows) }
        ]
    });

    let finalResponse: LLMAnswerResponse;
    try {
        finalResponse = JSON.parse(call2.choices[0].message.content ?? '{}');
    } catch (_error) {
        return {
            answer: "I found data but had trouble formatting the answer.",
            sql: parsed.sql,
            rows: resultRows,
            node_ids: parsed.node_ids ?? []
        }
    }

    // Extract node_ids from actual result rows — more reliable than LLM guessing them
    // Scans every row for known ID columns and collects their values
    const ID_COLUMNS = new Set([
        'sales_order_id', 'customer_id', 'delivery_id',
        'billing_doc_id', 'accounting_doc_id', 'payment_id'
    ])
    const extractedIds = new Set<string>([
        ...(finalResponse.node_ids ?? []),
        ...(parsed.node_ids ?? [])
    ])
    for (const row of resultRows as Record<string, unknown>[]) {
        for (const col of ID_COLUMNS) {
            if (row[col] && typeof row[col] === 'string') {
                extractedIds.add(row[col] as string)
            }
        }
    }

    return {
        answer:   finalResponse.answer,
        sql:      parsed.sql,
        rows:     resultRows,
        node_ids: Array.from(extractedIds)
    }
}
