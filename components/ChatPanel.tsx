'use client';

import { useEffect, useRef, useState } from "react";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    sql?: string | null;
    rowCount?: number;
    error?: string;
}

interface ChatPanelProps {
    onHighlight: (nodeIds: string[]) => void; // tells page.tsx which nodes to highlight
}

export default function ChatPanel({ onHighlight }: ChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                'Ask me anything about your SAP Order-to-Cash data. For example: "Which orders have broken flows?" or "Trace billing doc 90504204"',
        },
    ]);

    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new message arrives
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const question = input.trim();
        if (!question || loading) return;

        // Add user message immediately so UI feels responsive
        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: question,
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });
            const data = await res.json();

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.error ? `Error: ${data.error}` : data.answer,
                sql: data.sql,
                rowCount: Array.isArray(data.rows) ? data.rows.length : undefined,
                error: data.error,
            };
            setMessages((prev) => [...prev, assistantMsg]);

            // Highlight referenced nodes on graph if any
            if (data.node_ids?.length) {
                onHighlight(data.node_ids);
            }
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: "Something went wrong. Please try again.",
                    error: "network error",
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="w-96 border-l border-gray-200 bg-white flex flex-col h-full shrink-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 shrink-0">
                <p className="text-sm font-semibold text-gray-800">Chat</p>
                <p className="text-[10px] text-gray-400">
                    Ask questions about your O2C data
                </p>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                        {/* Bubble */}
                        <div
                            className={`
                            max-w-[85%] rounded-xl px-3 py-2 text-sm
                            ${msg.role === "user"
                                    ? "bg-blue-500 text-white"
                                    : msg.error
                                        ? "bg-red-50 text-red-700 border border-red-200"
                                        : "bg-gray-100 text-gray-800"
                                }
                        `}
                        >
                            {msg.content}
                        </div>

                        {/* SQL pill — shown below assistant messages that ran a query */}
                        {msg.role === "assistant" && msg.sql && (
                            <div className="mt-1 max-w-[85%]">
                                <details className="group">
                                    <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                                        {msg.rowCount !== undefined ? `${msg.rowCount} rows` : ""} ·
                                        view SQL
                                    </summary>
                                    <pre className="mt-1 text-[10px] bg-gray-900 text-green-400 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                                        {msg.sql}
                                    </pre>
                                </details>
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading indicator */}
                {loading && (
                    <div className="flex items-start">
                        <div className="bg-gray-100 rounded-xl px-3 py-2">
                            <div className="flex gap-1 items-center h-4">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form
                onSubmit={handleSubmit}
                className="p-3 border-t border-gray-200 shrink-0"
            >
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about orders, deliveries, payments..."
                        disabled={loading}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none text-black focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-blue-600 transition-colors cursor-pointer"
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
}
