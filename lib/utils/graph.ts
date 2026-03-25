import supabase from "@/lib/db/client";

async function fetchEdges(ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await supabase
        .from('graph_edges')
        .select('id, source_id, source_type, target_id, target_type, relationship')
        .or(`source_id.in.(${ids.join(',')}),target_id.in.(${ids.join(',')})`);

    if (error) throw new Error(error.message);
    return data ?? [];
}

// Derive a short human-readable label for each node type. Falls back to the type name if metadata is missing
function getLabel(type: string, meta?: Record<string, unknown>): string {
    if (!meta) return type.replace(/_/g, ' ').toUpperCase()
    switch (type) {
        case 'customer': return String(meta.full_name ?? meta.customer_id)
        case 'sales_order': return `SO ${meta.sales_order_id}`
        case 'delivery': return `DEL ${meta.delivery_id}`
        case 'billing_doc': return `BILL ${meta.billing_doc_id}`
        case 'journal_entry': return `JE ${meta.accounting_doc_id}`
        case 'payment': return `PAY ${meta.payment_id}`
        default: return type
    }
}

export {
    fetchEdges,
    getLabel
}
