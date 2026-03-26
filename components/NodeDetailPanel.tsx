'use client';

const SKIP_KEYS = new Set(['nodeType', 'label', 'highlighted']);

// "total_net_amount" -> "Total Net Amount"
function formatKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface NodeDetailPanelProps {
    data: Record<string, unknown> | null
    onClose: () => void
}

export default function NodeDetailPanel({ data, onClose }: NodeDetailPanelProps) {
    if (!data) return null;

    const entries = Object.entries(data).filter(([k]) => !SKIP_KEYS.has(k));

    return (
        <div className="w-72 border-l border-gray-200 bg-white flex flex-col h-full shrink-0">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                        {String(data.nodeType).replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm font-semibold text-gray-800">
                        {String(data.label)}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg leading-none"
                >
                    ✕
                </button>
            </div>

            {/* Metadata rows */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {entries.map(([key, value]) => (
                    <div key={key}>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                            {formatKey(key)}
                        </p>
                        <p className="text-sm text-gray-800 wrap-break-word">
                            {value === null || value === undefined
                                ? <span className="text-gray-300 italic">—</span>
                                : typeof value === 'boolean'
                                    ? value ? 'Yes' : 'No'
                                    : String(value)
                            }
                        </p>
                    </div>
                ))}
            </div>

            {/* Hint */}
            <div className="px-4 py-2 border-t border-gray-100">
                <p className="text-[10px] text-gray-400">
                    Double-click any node to expand its neighbors
                </p>
            </div>
        </div>
    )
}
