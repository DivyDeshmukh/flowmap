import supabase from "@/lib/db/client";
import { fetchEdges, getLabel } from "@/lib/utils/graph";
import { NextRequest } from "next/server";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // Fetch all edges directly connected to this node (one hop only)
    const edges = await fetchEdges([id]);

    if (!edges.length) return Response.json({ nodes: [], edges: [] });

    const neighborMap = new Map<string, { id: string; type: string }>();

    for (const edge of edges) {
        if (edge.source_id !== id) {
            neighborMap.set(edge.source_id, { id: edge.source_id, type: edge.source_type });
        }
    }

    // Group by type for batch metatdata fetch
    const byType: Record<string, string[]> = {};
    for (const { id: nid, type } of neighborMap.values()) {
        if (!byType[type]) byType[type] = [];
        byType[type].push(nid);
    }

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
            .in('delivery_id', byType.delivery);
        data?.forEach(r => metaMap.set(r.delivery_id, r));
    }

    if (byType.billing_doc?.length) {
        const { data } = await supabase
            .from('billing_docs')
            .select('billing_doc_id, customer_id, total_net_amount, currency, billing_date, is_cancelled')
            .in('billing_doc_id', byType.billing_doc);
        data?.forEach(r => metaMap.set(r.billing_doc_id, r));
    }

    if (byType.journal_entry?.length) {
        const { data } = await supabase
            .from('journal_entries')
            .select('accounting_doc_id, amount, currency, posting_date, clearing_date')
            .in('accounting_doc_id', byType.journal_entry);
        data?.forEach(r => metaMap.set(r.accounting_doc_id, r));
    }

    if (byType.payment?.length) {
        const { data } = await supabase
            .from('payments')
            .select('payment_id, amount, currency, posting_date')
            .in('payment_id', byType.payment);
        data?.forEach(r => metaMap.set(r.payment_id, r));
    }

    // Position new nodes to the right of canvas — frontend can reposition after
    const TYPE_X: Record<string, number> = {
        customer: 0, sales_order: 300, delivery: 600,
        billing_doc: 900, journal_entry: 1200, payment: 1500
    };

    const typeCounters: Record<string, number> = {};
    const rfNodes = Array.from(neighborMap.values()).map(({ id: nid, type }) => {
        typeCounters[type] = (typeCounters[type] ?? 0) + 1;
        const meta = metaMap.get(nid);
        return {
            id: nid,
            type: 'flowNode',
            position: { x: TYPE_X[type] ?? 0, y: (typeCounters[type] - 1) * 150 },
            data: {
                nodeType: type,
                label: getLabel(type, meta),
                ...(meta ?? {}),
            }
        };
    });

    const rfEdges = edges.map(e => ({
        id: `edge-${e.id}`,
        source: e.source_id,
        target: e.target_id,
        label: e.relationship,
        animated: true,
    }));

    return Response.json({ nodes: rfNodes, edges: rfEdges });
}