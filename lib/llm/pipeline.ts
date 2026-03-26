import supabase from "../db/client";
import groq from "./groq";
import { buildAnswerPrompt, SYSTEM_PROMPT } from "./prompts";

// Structure of Call 1 output from LLM
interface LLMSQLResponse {
    sql: string | null;
    answer: string;
    node_ids: string[];
}

// Structure of Call 2 output from LLM
interface LLMAnswerResponse {
    answer: string;
    node_ids: string[]
}

// Final shape returned to the chat API route
export interface PipelineResult {
    answer: string;
    sql: string | null;
    rows: unknown[];
    node_ids: string[];
}

export async function runChatPipeline(question: string): Promise<PipelineResult> {
    // Call 1: Question -> SQL
    const call1 = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,       // as we do not want randomness
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Question: ${question}\n\nThink step by step, then respond with JSON.` }
        ]
    });

    // Parse Call 1 response
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

    // GuardRails Check
    // If LLM returned sql: null then offtopic question
    if (!parsed.sql) {
        return {
            answer: parsed.answer,
            sql: null,
            rows: [],
            node_ids: parsed.node_ids ?? []
        }
    }

    // SQL SAFETY CHECK before running in db
    const sqlUpper = parsed.sql.trim().toUpperCase();
    if (!sqlUpper.startsWith('SELECT')) {
        return {
            answer: "I can only run read queries on this dataset.",
            sql: parsed.sql,
            rows: [],
            node_ids: []
        }
    }

    // EXECUTE SQL for supabse
    const { data: rows, error: sqlError } = await supabase
        .rpc('execute_sql', { query: parsed.sql });
    
    if (sqlError) {
        // SQL was malformed or referenced wrong table/column
        // Return the error so user knows what went wrong
        return {
            answer: `Query failed: ${sqlError.message}. Please try rephrasing your question.`,
            sql: parsed.sql,
            rows: [],
            node_ids: []
        }
    }

    const resultRows = rows ?? [];

    // Now Call 2 Data -> Natural Lanuage
    const call2 = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "user",
                content: buildAnswerPrompt(question, resultRows)
            }
        ]
    });

    let finalResponse: LLMAnswerResponse;
    try {
        finalResponse = JSON.parse(call2.choices[0].message.content ?? '{}');
    } catch (_error) {
        // Call 2 parse failed
        return {
            answer: "I found data but had trouble formatting the answer.",
            sql: parsed.sql,
            rows: resultRows,
            node_ids: parsed.node_ids ?? []
        }
    }

    return {
        answer:   finalResponse.answer,
        sql:      parsed.sql,
        rows:     resultRows,
        node_ids: finalResponse.node_ids ?? parsed.node_ids ?? []
    }
}
