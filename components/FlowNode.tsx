'use client';

import { Handle, Position } from "@xyflow/react";

const TYPE_COLORS: Record<string, { border: string; badge: string; bg: string }> = {
    customer: { border: 'border-violet-500', badge: 'bg-violet-500', bg: 'bg-violet-50' },
    sales_order: { border: 'border-blue-500', badge: 'bg-blue-500', bg: 'bg-blue-50' },
    delivery: { border: 'border-cyan-500', badge: 'bg-cyan-500', bg: 'bg-cyan-50' },
    billing_doc: { border: 'border-amber-500', badge: 'bg-amber-500', bg: 'bg-amber-50' },
    journal_entry: { border: 'border-orange-500', badge: 'bg-orange-500', bg: 'bg-orange-50' },
    payment: { border: 'border-green-500', badge: 'bg-green-500', bg: 'bg-green-50' },
}

const STATUS_COLORS: Record<string, string> = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
    pending: 'bg-gray-400',
}

interface FlowNodeProps {
    data: {
        nodeType: string;
        label: string;
        flow_status?: string;
        [key: string]: unknown
    }
    selected: boolean
}

export default function FlowNode({ data, selected }: FlowNodeProps) {
    const colors = TYPE_COLORS[data.nodeType] ?? {
        border: 'border-gray-400',
        badge: 'bg-gray-400',
        bg: 'bg-gray-50'
    };

    return (
        <>
            {/* Left dot — where incoming edges connect to this node */}
            <Handle type="target" position={Position.Left} className="bg-gray-400!" />

            <div className={`
                min-w-40 rounded-lg border-2 ${colors.border} ${colors.bg}
                ${selected ? 'ring-2 ring-offset-1 ring-gray-800' : ''}
                shadow-sm cursor-pointer
            `}>
                {/* Top badge — shows node type + flow status dot for SOs */}
                <div className={`${colors.badge} rounded-t-md px-2 py-0.5 flex items-center justify-between`}>
                    <span className="text-white text-[10px] font-semibold uppercase tracking-wide">
                        {data.nodeType.replace(/_/g, ' ')}
                    </span>
                    {data.nodeType === 'sales_order' && data.flow_status && (
                        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[data.flow_status] ?? 'bg-gray-400'}`} />
                    )}
                </div>

                {/* Label */}
                <div className="px-3 py-2">
                    <p className="text-xs font-medium text-gray-800 truncate max-w-35">
                        {data.label}
                    </p>
                </div>
            </div>

            {/* Right dot — where outgoing edges leave this node */}
            <Handle type="source" position={Position.Right} className="bg-gray-400!" />
        </>
    )
}
