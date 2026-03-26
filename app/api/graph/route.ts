// Canvas layout: each node type lives in a fixed X column.
// Left to right = the O2C flow direction.

import supabase from "@/lib/db/client";
import { fetchEdges, getLabel } from "@/lib/utils/graph";
import { NextRequest } from "next/server";

// Multiple nodes of the same type stack vertically (Y increases by 150px each).
const TYPE_X: Record<string, number> = {
    customer: 0,
    sales_order: 300,
    delivery: 600,
    billing_doc: 900,
    journal_entry: 1200,
    payment: 1500
};

export async function GET(_req: NextRequest) {
    // Seed nodes
    // We load the 20 most recent ones as starting points.
    // From their IDs, graph_edges gives us the full downstream chain, also as we know that sales_orders sits at the root so start from there.
    const { data: soRows, error: soErr } = await supabase
        .from('sales_orders')
        .select('sales_order_id, customer_id, total_net_amount, currency, creation_date, flow_status')
        .order('creation_date', { ascending: false })
        .limit(20);

    if (soErr) return Response.json({ error: soErr.message }, { status: 500 });

    // return empty graph if no data in db
    if (!soRows?.length) return Response.json({
        nodes: [],
        edges: []
    });

    const soIds = soRows.map(s => s.sales_order_id);

    // we will fetch all edges step by step
    try {
        // Hop 1
        const hop1 = await fetchEdges(soIds);

        const deliveryIds = [
            ...new Set(
                hop1
                    .filter(e => e.target_type === 'delivery')
                    .map(e => e.target_id)
            )
        ];

        // Hop 2
        const hop2 = await fetchEdges(deliveryIds);

        const billingIds = [
            ...new Set(
                hop2
                    .filter(e => e.target_type === 'billing_doc')
                    .map(e => e.target_id)
            )
        ];

        // Hop 3
        // now here we have biiling to Journal in some cases but oin some cases we have billing to payment directly but that we already handled during seeding
        const hop3 = await fetchEdges(billingIds);

        const journalEntryIds = [...new Set(
            hop3.filter(e => e.target_type === 'journal_entry').map(e => e.target_id)
        )];

        // Hop 4
        const hop4 = await fetchEdges(journalEntryIds);

        // Merge all edges, deduplicate by edge id
        // Deduplication needed because the same edge can appear in multiple hops

        const edgeMap = new Map<number, typeof hop1[0]>();
        for (const edge of [...hop1, ...hop2, ...hop3, ...hop4]) {
            edgeMap.set(edge.id, edge);
        }
        const edges = Array.from(edgeMap.values());

        // Collect unique nodes from all edges
        // source_type and target_type stored on every edge row
        const nodeMap = new Map<string, { id: string, type: string }>();

        for (const edge of edges) {
            nodeMap.set(edge.source_id, { id: edge.source_id, type: edge.source_type });
            nodeMap.set(edge.target_id, { id: edge.target_id, type: edge.target_type });
        }

        // Pending sales_roders have zero edges because no delivery has been created yet - they never appear in graph_edges
        for (const so of soRows) {
            if (!nodeMap.has(so.sales_order_id)) {
                nodeMap.set(so.sales_order_id, { id: so.sales_order_id, type: 'sales_order' });
            }
        }

        // Group IDs by type for batch metadata fetching
        const byType: Record<string, string[]> = {};
        for (const { id, type } of nodeMap.values()) {
            if (!byType[type]) byType[type] = [];
            byType[type].push(id);
        }

        // Fetch metadata from each source table
        const metaMap = new Map<string, Record<string, unknown>>();

        if (byType.sales_order?.length) {
            const { data } = await supabase
                .from('sales_orders')
                .select('sales_order_id, customer_id, total_net_amount, currency, creation_date, flow_status')
                .in('sales_order_id', byType.sales_order);

            data?.forEach(r => metaMap.set(r.sales_order_id, r));
        }

        if (byType.customer?.length) {
            const { data } = await supabase
                .from('customers')
                .select('customer_id, full_name, industry, city, country')
                .in('customer_id', byType.customer);

            data?.forEach(r => metaMap.set(r.customer_id, r));
        }

        if (byType.delivery?.length) {
            const { data } = await supabase
                .from('deliveries')
                .select('delivery_id, goods_movement_date, picking_status, creation_date')
                .in('delivery_id', byType.delivery)
            data?.forEach(r => metaMap.set(r.delivery_id, r))
        }

        if (byType.billing_doc?.length) {
            const { data } = await supabase
                .from('billing_docs')
                .select('billing_doc_id, customer_id, total_net_amount, currency, billing_date, is_cancelled')
                .in('billing_doc_id', byType.billing_doc)
            data?.forEach(r => metaMap.set(r.billing_doc_id, r))
        }

        if (byType.journal_entry?.length) {
            const { data } = await supabase
                .from('journal_entries')
                .select('accounting_doc_id, amount, currency, posting_date, clearing_date')
                .in('accounting_doc_id', byType.journal_entry)
            data?.forEach(r => metaMap.set(r.accounting_doc_id, r))
        }

        if (byType.payment?.length) {
            const { data } = await supabase
                .from('payments')
                .select('payment_id, amount, currency, posting_date')
                .in('payment_id', byType.payment)
            data?.forEach(r => metaMap.set(r.payment_id, r))
        }

        // Build React flow nodes
        const typeCounters: Record<string, number> = {};
        const rfNodes = Array.from(nodeMap.values()).map(({ id, type }) => {
            typeCounters[type] = (typeCounters[type] ?? 0) + 1;
            const yIndex = typeCounters[type] - 1;
            const meta = metaMap.get(id);

            return {
                id,
                type: 'flowNode',
                position: { x: TYPE_X[type] ?? 0, y: yIndex * 150 },
                data: {
                    nodeType: type,
                    label: getLabel(type, meta),
                    ...(meta ?? {}),
                }
            }
        });

        // Build React flow edges
        const rfEdges = edges.map(e => ({
            id: `edges-${e.id}`,
            source: e.source_id,
            target: e.target_id,
            label: e.relationship,
            animated: true,
        }));

        return Response.json({ nodes: rfNodes, edges: rfEdges });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return Response.json({ error: message }, { status: 500 });
    }
}
