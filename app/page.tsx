'use client'

import { useState } from 'react'
import GraphCanvas from '@/components/GraphCanvas'
import NodeDetailPanel from '@/components/NodeDetailPanel'

export default function Home() {
    const [selectedNode, setSelectedNode] = useState<Record<string, unknown> | null>(null)

    return (
        <div className="flex flex-col h-screen bg-gray-50">

            {/* Top bar */}
            <header className="h-12 border-b border-gray-200 bg-white flex items-center px-4 shrink-0">
                <span className="font-semibold text-gray-800 text-sm">Flowmap</span>
                <span className="ml-2 text-xs text-gray-400">SAP Order-to-Cash Explorer</span>
            </header>

            {/* Main area — graph + detail panel side by side */}
            <div className="flex flex-1 overflow-hidden">
                <GraphCanvas onNodeClick={setSelectedNode} />
                <NodeDetailPanel
                    data={selectedNode}
                    onClose={() => setSelectedNode(null)}
                />
            </div>
        </div>
    )
}
