'use client'

import { useState } from 'react'
import GraphCanvas from '@/components/GraphCanvas'
import NodeDetailPanel from '@/components/NodeDetailPanel'
import ChatPanel from '@/components/ChatPanel'

export default function Home() {
    const [selectedNode, setSelectedNode] = useState<Record<string, unknown> | null>(null)
    const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([])

    return (
        <div className="flex flex-col h-screen bg-gray-50">

            {/* Top bar */}
            <header className="h-12 border-b border-gray-200 bg-white flex items-center px-4 shrink-0">
                <span className="font-semibold text-gray-800 text-sm">Flowmap</span>
                <span className="ml-2 text-xs text-gray-400">SAP Order-to-Cash Explorer</span>
            </header>

            {/* Main area */}
            <div className="flex flex-1 overflow-hidden relative">

                {/* Graph — takes all remaining width */}
                <GraphCanvas
                    onNodeClick={setSelectedNode}
                    highlightedNodeIds={highlightedNodeIds}
                />

                {/* Node detail — floating overlay on graph, bottom-left */}
                {selectedNode && (
                    <div className="absolute bottom-4 left-4 z-10 w-72 shadow-xl rounded-xl overflow-hidden">
                        <NodeDetailPanel
                            data={selectedNode}
                            onClose={() => setSelectedNode(null)}
                        />
                    </div>
                )}

                {/* Chat panel — fixed right side */}
                <ChatPanel onHighlight={setHighlightedNodeIds} />
            </div>
        </div>
    )
}
