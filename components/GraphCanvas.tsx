'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import FlowNode from './FlowNode'

// Tells React Flow: when you see a node with type='flowNode', render <FlowNode />
const nodeTypes = { flowNode: FlowNode }

interface GraphCanvasProps {
    onNodeClick: (data: Record<string, unknown>) => void;
    highlightedNodeIds: string[];
}

export default function GraphCanvas({ onNodeClick, highlightedNodeIds }: GraphCanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Tracks which node IDs have already been expanded
    // Prevents double-expanding which would add duplicate nodes
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    // Fetch initial graph on mount
    useEffect(() => {
        fetch('/api/graph')
            .then(r => r.json())
            .then(data => {
                if (data.error) { setError(data.error); return }
                setNodes(data.nodes)
                setEdges(data.edges)
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, []);

    useEffect(() => {
        // Run even when empty — empty set makes highlighted=false on all nodes
        // This clears highlights when off-topic or broken query returns node_ids: []
        const highlightSet = new Set(highlightedNodeIds)
        setNodes(prev => prev.map(node => ({
            ...node,
            data: {
                ...node.data,
                highlighted: highlightSet.has(node.id)
            }
        })))
    }, [highlightedNodeIds])

    // Called on double-click — fetches neighbors and merges into canvas
    const expandNode = useCallback(async (nodeId: string) => {
        if (expandedIds.has(nodeId)) return
        setExpandedIds(prev => new Set(prev).add(nodeId))

        const res = await fetch(`/api/graph/expand/${nodeId}`)
        const data = await res.json()
        if (data.error) return

        // Only add nodes not already on canvas — prevents duplicates
        setNodes(existing => {
            const existingIds = new Set(existing.map(n => n.id))
            const newNodes = data.nodes.filter((n: Node) => !existingIds.has(n.id))
            return [...existing, ...newNodes]
        })

        // Only add edges not already on canvas
        setEdges(existing => {
            const existingIds = new Set(existing.map(e => e.id))
            const newEdges = data.edges.filter((e: Edge) => !existingIds.has(e.id))
            return [...existing, ...newEdges]
        })
    }, [expandedIds, setNodes, setEdges])

    // Single click → open detail panel
    const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
        onNodeClick(node.data as Record<string, unknown>)
    }, [onNodeClick])

    // Double click → expand neighbors
    const handleNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
        expandNode(node.id)
    }, [expandNode])

    if (loading) return (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Loading graph...
        </div>
    )

    if (error) return (
        <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
            Error: {error}
        </div>
    )

    return (
        <div className="flex-1 h-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                nodeTypes={nodeTypes}
                fitView
            >
                <Background />
                <Controls />
                <MiniMap nodeColor={(n) => {
                    const colors: Record<string, string> = {
                        customer: '#8b5cf6', sales_order: '#3b82f6',
                        delivery: '#06b6d4', billing_doc: '#f59e0b',
                        journal_entry: '#f97316', payment: '#22c55e'
                    }
                    return colors[(n.data as { nodeType: string }).nodeType] ?? '#9ca3af'
                }} />
            </ReactFlow>
        </div>
    )
}
