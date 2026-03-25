import path from "path";
import * as fs from "fs";
import supabase from "@/lib/db/client";

const DATA_DIR = path.join(process.cwd(), "data", "sap-o2c-data");

// HELPER: loadFolder
// Each SAP entity lives in a folder with one or more .jsonl files (part files).
// This reads EVERY file in the folder, parses each line as JSON,
// and returns one flat array of all rows across all part files.
function loadFolder<T = Record<string, unknown>>(folderName: string): T[] {
  const folderPath = path.join(DATA_DIR, folderName);
  if (!fs.existsSync(folderPath)) {
    console.warn(`  ⚠ Folder not found: ${folderName}`);
    return [];
  }
  const rows: T[] = [];
  for (const file of fs.readdirSync(folderPath).sort()) {
    if (!file.endsWith(".jsonl")) continue;
    const lines = fs.readFileSync(path.join(folderPath, file), "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          rows.push(JSON.parse(trimmed));
        } catch {
          // skip malformed lines silently
        }
      }
    }
  }
  return rows;
}

// HELPER: batchInsert
// Supabase has a row limit per HTTP request.
// This chunks any array into 500-row batches and sends sequentially.
// One bad batch logs the error but doesn't kill the whole seed.
// ─────────────────────────────────────────────
async function batchInsert(
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) {
    console.log(`  ⚠ No rows for ${table}`);
    return;
  }
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`  ✗ ${table} batch at row ${i}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  console.log(`  ✓ ${table}: ${inserted} rows`);
}

// HELPER: parseDate
// SAP exports dates as "2025-03-31T00:00:00.000Z"
// PostgreSQL DATE columns need "2025-03-31"
// Returns null for missing/null values (stored as NULL in DB, not empty string)
function parseDate(val: unknown): string | null {
  if (!val || typeof val !== "string") return null;
  const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// HELPER: parseNum
// SAP exports numbers as strings "17108.25"
// PostgreSQL NUMERIC columns need actual JS numbers
// Returns null for empty/missing (so DB stores NULL, not 0)
function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

// HELPER: emptyToNull
// SAP exports missing text values as empty string ""
// Storing "" breaks SQL "WHERE column IS NULL" queries
// This converts "" → null so DB stores proper NULL
// ─────────────────────────────────────────────
function emptyToNull(val: unknown): string | null {
  if (val === "" || val === null || val === undefined) return null;
  return String(val);
}

// RAW DATA TYPES
// These match the exact field names in the JSONL files.
// Only key fields are typed — unknown fields are ignored.
interface RawPartner {
  businessPartner: string;
  customer: string;
  businessPartnerFullName: string;
  organizationBpName1: string;
  industry: string;
  businessPartnerIsBlocked: boolean;
}
interface RawAddress {
  businessPartner: string;
  cityName: string;
  country: string;
  region: string;
  postalCode: string;
  streetName: string;
}
interface RawCompanyAssignment {
  customer: string;
  paymentTerms: string;
  reconciliationAccount: string;
}
interface RawSalesAreaAssignment {
  customer: string;
  salesOrganization: string;
  distributionChannel: string;
  currency: string;
  deliveryPriority: string;
  incotermsClassification: string;
  incotermsLocation1: string;
  shippingCondition: string;
  customerPaymentTerms: string;
}
interface RawProduct {
  product: string;
  productType: string;
  baseUnit: string;
  grossWeight: string;
  netWeight: string;
  weightUnit: string;
  productGroup: string;
}
interface RawProductDesc {
  product: string;
  productDescription: string;
  language: string;
}
interface RawPlant {
  plant: string;
  plantName: string;
}
interface RawSOHeader {
  salesOrder: string;
  soldToParty: string;
  totalNetAmount: string;
  transactionCurrency: string;
  creationDate: string;
  requestedDeliveryDate: string;
  overallDeliveryStatus: string;
  overallOrdReltdBillgStatus: string;
  headerBillingBlockReason: string;
  deliveryBlockReason: string;
}
interface RawSOItem {
  salesOrder: string;
  salesOrderItem: string;
  material: string;
  requestedQuantity: string;
  requestedQuantityUnit: string;
  netAmount: string;
  productionPlant: string;
}
interface RawScheduleLine {
  salesOrder: string;
  salesOrderItem: string;
  confirmedDeliveryDate: string;
  confdOrderQtyByMatlAvailCheck: string;
}
interface RawDeliveryHeader {
  deliveryDocument: string;
  shippingPoint: string;
  overallPickingStatus: string;
  actualGoodsMovementDate: string | null;
  overallProofOfDeliveryStatus: string;
  creationDate: string;
  deliveryBlockReason: string;
}
interface RawDeliveryItem {
  deliveryDocument: string;
  deliveryDocumentItem: string;  // format: "000010"
  referenceSdDocument: string;   // = sales_order_id
  referenceSdDocumentItem: string;
  actualDeliveryQuantity: string;
  deliveryQuantityUnit: string;
  plant: string;
  storageLocation: string;
}
interface RawBDHeader {
  billingDocument: string;
  soldToParty: string;
  totalNetAmount: string;
  transactionCurrency: string;
  billingDocumentDate: string;
  creationDate: string;
  billingDocumentIsCancelled: boolean;
  cancelledBillingDocument: string;
  accountingDocument: string;
  fiscalYear: string;
  companyCode: string;
}
interface RawBDItem {
  billingDocument: string;
  billingDocumentItem: string;   // format: "10"
  referenceSdDocument: string;   // = delivery_id
  referenceSdDocumentItem: string; // format: "10" (references delivery item "000010")
  material: string;
  billingQuantity: string;
  billingQuantityUnit: string;
  netAmount: string;
}
interface RawJournalEntry {
  accountingDocument: string;
  referenceDocument: string;     // = billing_doc_id
  customer: string;
  amountInTransactionCurrency: string;
  transactionCurrency: string;
  postingDate: string;
  clearingDate: string | null;
  clearingAccountingDocument: string;
  fiscalYear: string;
  glAccount: string;
  profitCenter: string;
}
interface RawPayment {
  accountingDocument: string;
  customer: string;
  amountInTransactionCurrency: string;
  transactionCurrency: string;
  postingDate: string;
  clearingDate: string;
  clearingAccountingDocument: string;
  glAccount: string;
}

// FLOW STATUS COMPUTATION
//
// Runs entirely in memory before any DB inserts.
// Assigns each sales order a health label stored as flow_status.
//
// Logic:
//   pending  = SO exists but has no delivery at all
//   warning  = SO has a delivery but NO billing document
//   critical = SO has a delivery + billing doc, but billing doc is cancelled
//              with no active replacement
//   healthy  = complete chain: SO → Delivery → active Billing Doc
//
// WHY COMPUTE HERE: Cheaper to compute once at seed time than
// recalculate on every graph API call.
function computeFlowStatuses(
  soHeaders: RawSOHeader[],
  delItems: RawDeliveryItem[],
  bdItems: RawBDItem[],
  bdHeaders: RawBDHeader[]
): Map<string, string> {
  // Which SOs have at least one delivery item referencing them?
  const soWithDelivery = new Set(
    delItems.map((d) => d.referenceSdDocument).filter(Boolean)
  );

  // Which billing docs are cancelled?
  const cancelledBDIds = new Set(
    bdHeaders.filter((b) => b.billingDocumentIsCancelled).map((b) => b.billingDocument)
  );

  // Which deliveries have at least one ACTIVE (non-cancelled) billing doc?
  const activeBDDeliveryIds = new Set(
    bdItems
      .filter((bi) => !cancelledBDIds.has(bi.billingDocument))
      .map((bi) => bi.referenceSdDocument)
  );

  // Which deliveries have ONLY cancelled billing docs (no active replacement)?
  const cancelledOnlyDeliveryIds = new Set(
    bdItems
      .filter((bi) => cancelledBDIds.has(bi.billingDocument))
      .map((bi) => bi.referenceSdDocument)
      .filter((delId) => !activeBDDeliveryIds.has(delId))
  );

  // Build reverse map: delivery → sales order
  // Needed to trace "which SO does this delivery belong to?"
  const delToSO = new Map<string, string>();
  for (const di of delItems) {
    if (di.referenceSdDocument) {
      delToSO.set(di.deliveryDocument, di.referenceSdDocument);
    }
  }

  // Which SOs have at least one delivery with an active billing doc?
  const soWithActiveBilling = new Set<string>();
  for (const delId of activeBDDeliveryIds) {
    const soId = delToSO.get(delId);
    if (soId) soWithActiveBilling.add(soId);
  }

  // Which SOs have deliveries but ALL their billing docs are cancelled?
  const soWithCancelledOnlyBilling = new Set<string>();
  for (const delId of cancelledOnlyDeliveryIds) {
    const soId = delToSO.get(delId);
    if (soId) soWithCancelledOnlyBilling.add(soId);
  }

  // Assign final status per SO
  const result = new Map<string, string>();
  for (const so of soHeaders) {
    const id = so.salesOrder;
    if (!soWithDelivery.has(id)) {
      result.set(id, "pending");
    } else if (soWithActiveBilling.has(id)) {
      result.set(id, "healthy");
    } else if (soWithCancelledOnlyBilling.has(id)) {
      result.set(id, "critical");
    } else {
      result.set(id, "warning"); // delivered but zero billing docs
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// MAIN SEED FUNCTION
// ─────────────────────────────────────────────
async function seed() {
  console.log("🌱 Starting seed...\n");

  // ── STEP 1: Load all JSONL files into memory ───────────────────────────
  // Each loadFolder() call reads all part files in a folder and returns
  // one flat array. No DB calls yet — purely file reading.
  console.log("📂 Loading JSONL files...");
  const partners         = loadFolder<RawPartner>("business_partners");
  const addresses        = loadFolder<RawAddress>("business_partner_addresses");
  const companyAssigns   = loadFolder<RawCompanyAssignment>("customer_company_assignments");
  const salesAreaAssigns = loadFolder<RawSalesAreaAssignment>("customer_sales_area_assignments");
  const rawProducts      = loadFolder<RawProduct>("products");
  const prodDescs        = loadFolder<RawProductDesc>("product_descriptions");
  const rawPlants        = loadFolder<RawPlant>("plants");
  const soHeaders        = loadFolder<RawSOHeader>("sales_order_headers");
  const soItems          = loadFolder<RawSOItem>("sales_order_items");
  const scheduleLines    = loadFolder<RawScheduleLine>("sales_order_schedule_lines");
  const delHeaders       = loadFolder<RawDeliveryHeader>("outbound_delivery_headers");
  const delItems         = loadFolder<RawDeliveryItem>("outbound_delivery_items");
  const bdHeaders        = loadFolder<RawBDHeader>("billing_document_headers");
  const bdItems          = loadFolder<RawBDItem>("billing_document_items");
  const journal          = loadFolder<RawJournalEntry>("journal_entry_items_accounts_receivable");
  const payments         = loadFolder<RawPayment>("payments_accounts_receivable");
  console.log("  ✓ All files loaded\n");

  // ── STEP 2: Build lookup Maps ──────────────────────────────────────────
  // WHY MAPS: If we used .find() inside a loop, that's O(n²) — for every
  // partner we'd scan all addresses. With a Map, lookup is O(1) — instant.
  // Build once, use many times.

  // address lookup: businessPartner → address row
  const addrMap = new Map(addresses.map((a) => [a.businessPartner, a]));

  // company assignment: customer → assignment row
  const companyMap = new Map(companyAssigns.map((c) => [c.customer, c]));

  // sales area: customer → assignment row
  // FIX: Each customer has 2-4 rows (different distribution channels).
  // We pick the row matching channel "05" which is used in sales orders.
  // If no "05" row exists for a customer, fall back to first row.
  const salesMap = new Map<string, RawSalesAreaAssignment>();
  for (const s of salesAreaAssigns) {
    const existing = salesMap.get(s.customer);
    if (!existing || s.distributionChannel === "05") {
      salesMap.set(s.customer, s);
    }
  }

  // product description: product → English description
  const descMap = new Map(
    prodDescs
      .filter((d) => d.language === "EN" || !d.language)
      .map((d) => [d.product, d.productDescription])
  );

  // schedule line: "salesOrder-itemNumber" → schedule row
  // WHY COMPOSITE KEY: salesOrder alone isn't unique (one order has many items).
  // We need both order + item to find the right schedule line.
  const scheduleMap = new Map<string, RawScheduleLine>();
  for (const sl of scheduleLines) {
    scheduleMap.set(`${sl.salesOrder}-${sl.salesOrderItem}`, sl);
  }

  // ── STEP 3: Compute flow statuses in memory ────────────────────────────
  // This runs before any inserts. Reads raw arrays, returns a Map of
  // salesOrderId → "healthy"|"warning"|"critical"|"pending"
  const flowStatuses = computeFlowStatuses(soHeaders, delItems, bdItems, bdHeaders);

  // ── STEP 4: Insert master data first ──────────────────────────────────
  // Master data has no foreign key dependencies — insert it before
  // transaction tables which reference it.
  console.log("📦 Inserting master data...");

  // customers: merge all 4 sources into one row per customer
  await batchInsert(
    "customers",
    partners.map((p) => {
      const addr    = addrMap.get(p.businessPartner);
      const company = companyMap.get(p.customer);
      const sales   = salesMap.get(p.customer);
      return {
        customer_id:           p.customer,
        full_name:             p.businessPartnerFullName || p.organizationBpName1,
        industry:              emptyToNull(p.industry),
        is_blocked:            p.businessPartnerIsBlocked ?? false,
        city:                  emptyToNull(addr?.cityName),
        country:               emptyToNull(addr?.country),
        region:                emptyToNull(addr?.region),
        postal_code:           emptyToNull(addr?.postalCode),
        street_name:           emptyToNull(addr?.streetName),
        payment_terms:         emptyToNull(company?.paymentTerms),
        reconciliation_account: emptyToNull(company?.reconciliationAccount),
        currency:              emptyToNull(sales?.currency),
        delivery_priority:     emptyToNull(sales?.deliveryPriority),
        incoterms:             emptyToNull(sales?.incotermsClassification),
        incoterms_location:    emptyToNull(sales?.incotermsLocation1),
        shipping_condition:    emptyToNull(sales?.shippingCondition),
      };
    })
  );

  // products: merge descriptions (English only)
  await batchInsert(
    "products",
    rawProducts.map((p) => ({
      product_id:   p.product,
      description:  descMap.get(p.product) ?? p.product, // fallback to ID if no desc
      product_type: emptyToNull(p.productType),
      base_unit:    emptyToNull(p.baseUnit),
      gross_weight: parseNum(p.grossWeight),
      net_weight:   parseNum(p.netWeight),
      weight_unit:  emptyToNull(p.weightUnit),
      product_group: emptyToNull(p.productGroup),
    }))
  );

  // plants: straightforward 1:1 mapping
  await batchInsert(
    "plants",
    rawPlants.map((p) => ({
      plant_id:   p.plant,
      plant_name: emptyToNull(p.plantName),
    }))
  );

  // ── STEP 5: Insert transaction data in O2C flow order ─────────────────
  // Order matters because of FK constraints:
  // sales_orders must exist before sales_order_items
  // deliveries must exist before delivery_items, etc.
  console.log("\n📦 Inserting transaction data...");

  await batchInsert(
    "sales_orders",
    soHeaders.map((s) => ({
      sales_order_id:          s.salesOrder,
      customer_id:             s.soldToParty,
      total_net_amount:        parseNum(s.totalNetAmount),
      currency:                emptyToNull(s.transactionCurrency),
      creation_date:           parseDate(s.creationDate),
      requested_delivery_date: parseDate(s.requestedDeliveryDate),
      delivery_status:         emptyToNull(s.overallDeliveryStatus),
      billing_status:          emptyToNull(s.overallOrdReltdBillgStatus),
      billing_block_reason:    emptyToNull(s.headerBillingBlockReason),
      delivery_block_reason:   emptyToNull(s.deliveryBlockReason),
      flow_status:             flowStatuses.get(s.salesOrder) ?? "pending",
    }))
  );

  await batchInsert(
    "sales_order_items",
    soItems.map((i) => {
      // Look up the schedule line for this specific item
      // Key format: "740506-10" (salesOrder + hyphen + itemNumber)
      const sl = scheduleMap.get(`${i.salesOrder}-${i.salesOrderItem}`);
      return {
        sales_order_id:          i.salesOrder,
        item_number:             i.salesOrderItem,
        product_id:              emptyToNull(i.material),
        quantity:                parseNum(i.requestedQuantity),
        quantity_unit:           emptyToNull(i.requestedQuantityUnit),
        net_amount:              parseNum(i.netAmount),
        plant_id:                emptyToNull(i.productionPlant),
        confirmed_delivery_date: sl ? parseDate(sl.confirmedDeliveryDate) : null,
        confirmed_quantity:      sl ? parseNum(sl.confdOrderQtyByMatlAvailCheck) : null,
      };
    })
  );

  await batchInsert(
    "deliveries",
    delHeaders.map((d) => ({
      delivery_id:           d.deliveryDocument,
      shipping_point:        emptyToNull(d.shippingPoint),
      picking_status:        emptyToNull(d.overallPickingStatus),
      goods_movement_date:   parseDate(d.actualGoodsMovementDate ?? null),
      pod_status:            emptyToNull(d.overallProofOfDeliveryStatus),
      creation_date:         parseDate(d.creationDate),
      delivery_block_reason: emptyToNull(d.deliveryBlockReason),
    }))
  );

  await batchInsert(
    "delivery_items",
    delItems.map((i) => ({
      delivery_id:      i.deliveryDocument,
      // FIX: delivery item numbers in raw data are "000010" format.
      // Normalise to "10" format to match how other tables reference them.
      item_number:      String(parseInt(i.deliveryDocumentItem, 10)),
      sales_order_id:   emptyToNull(i.referenceSdDocument),  // KEY JOIN → SO
      sales_order_item: emptyToNull(i.referenceSdDocumentItem),
      actual_quantity:  parseNum(i.actualDeliveryQuantity),
      quantity_unit:    emptyToNull(i.deliveryQuantityUnit),
      plant_id:         emptyToNull(i.plant),
      storage_location: emptyToNull(i.storageLocation),
    }))
  );

  await batchInsert(
    "billing_docs",
    bdHeaders.map((b) => ({
      billing_doc_id:    b.billingDocument,
      customer_id:       emptyToNull(b.soldToParty),
      total_net_amount:  parseNum(b.totalNetAmount),
      currency:          emptyToNull(b.transactionCurrency),
      billing_date:      parseDate(b.billingDocumentDate),
      creation_date:     parseDate(b.creationDate),
      is_cancelled:      b.billingDocumentIsCancelled ?? false,
      cancelled_doc_id:  emptyToNull(b.cancelledBillingDocument),
      accounting_doc_id: emptyToNull(b.accountingDocument), // KEY → journal_entries
      fiscal_year:       emptyToNull(b.fiscalYear),
      company_code:      emptyToNull(b.companyCode),
    }))
  );

  await batchInsert(
    "billing_doc_items",
    bdItems.map((i) => ({
      billing_doc_id: i.billingDocument,
      item_number:    i.billingDocumentItem,
      delivery_id:    emptyToNull(i.referenceSdDocument),    // KEY JOIN → delivery
      delivery_item:  emptyToNull(i.referenceSdDocumentItem),
      product_id:     emptyToNull(i.material),
      quantity:       parseNum(i.billingQuantity),
      quantity_unit:  emptyToNull(i.billingQuantityUnit),
      net_amount:     parseNum(i.netAmount),
    }))
  );

  await batchInsert(
    "journal_entries",
    journal.map((j) => ({
      accounting_doc_id: j.accountingDocument,
      billing_doc_id:    emptyToNull(j.referenceDocument),   // KEY JOIN → billing_docs
      customer_id:       emptyToNull(j.customer),
      amount:            parseNum(j.amountInTransactionCurrency),
      currency:          emptyToNull(j.transactionCurrency),
      posting_date:      parseDate(j.postingDate),
      clearing_date:     parseDate(j.clearingDate),          // NULL = unpaid
      clearing_doc_id:   emptyToNull(j.clearingAccountingDocument),
      fiscal_year:       emptyToNull(j.fiscalYear),
      gl_account:        emptyToNull(j.glAccount),
      profit_center:     emptyToNull(j.profitCenter),
    }))
  );

  await batchInsert(
    "payments",
    payments.map((p) => ({
      payment_id:      p.accountingDocument,
      customer_id:     emptyToNull(p.customer),
      amount:          parseNum(p.amountInTransactionCurrency),
      currency:        emptyToNull(p.transactionCurrency),
      posting_date:    parseDate(p.postingDate),
      clearing_date:   parseDate(p.clearingDate),
      clearing_doc_id: emptyToNull(p.clearingAccountingDocument), // KEY → journal
      gl_account:      emptyToNull(p.glAccount),
    }))
  );

  // ── STEP 6: Build graph edges 
  // These are the lines drawn on the graph visualization.
  // We precompute them here so the graph API does SELECT * FROM graph_edges
  // instead of running 4 JOINs across 6 tables on every page load.
  console.log("\n🔗 Building graph edges...");

  const edges: Array<{
    source_id: string;
    source_type: string;
    target_id: string;
    target_type: string;
    relationship: string;
  }> = [];

  // Edge 1: Customer → Sales Order (PLACED)
  // "Customer 320000083 placed sales order 740506"
  // Source field: sales_order_headers.soldToParty
  for (const so of soHeaders) {
    if (!so.soldToParty || !so.salesOrder) continue;
    edges.push({
      source_id:    so.soldToParty,
      source_type:  "customer",
      target_id:    so.salesOrder,
      target_type:  "sales_order",
      relationship: "PLACED",
    });
  }

  // Edge 2: Sales Order → Delivery (FULFILLED_BY)
  // "Sales order 740506 was fulfilled by delivery 80737721"
  // Source field: delivery_items.referenceSdDocument = salesOrder
  const soDelPairs = new Set<string>();
  for (const di of delItems) {
    if (!di.referenceSdDocument || !di.deliveryDocument) continue;
    const key = `${di.referenceSdDocument}__${di.deliveryDocument}`;
    if (soDelPairs.has(key)) continue;
    soDelPairs.add(key);
    edges.push({
      source_id:    di.referenceSdDocument,
      source_type:  "sales_order",
      target_id:    di.deliveryDocument,
      target_type:  "delivery",
      relationship: "FULFILLED_BY",
    });
  }

  // Edge 3: Delivery → Billing Doc (BILLED_AS)
  // "Delivery 80737721 was billed as billing document 91150179"
  // Source field: billing_doc_items.referenceSdDocument = deliveryDocument
  // Same deduplication logic as above.
  const delBdPairs = new Set<string>();
  for (const bi of bdItems) {
    if (!bi.referenceSdDocument || !bi.billingDocument) continue;
    const key = `${bi.referenceSdDocument}__${bi.billingDocument}`;
    if (delBdPairs.has(key)) continue;
    delBdPairs.add(key);
    edges.push({
      source_id:    bi.referenceSdDocument,
      source_type:  "delivery",
      target_id:    bi.billingDocument,
      target_type:  "billing_doc",
      relationship: "BILLED_AS",
    });
  }

  // Edge 4: Billing Doc → Journal Entry (POSTED_AS)
  // "Billing doc 91150179 was posted as journal entry 9400635946"
  // Source field: journal_entries.referenceDocument = billingDocument
  for (const j of journal) {
    if (!j.referenceDocument || !j.accountingDocument) continue;
    edges.push({
      source_id:    j.referenceDocument,
      source_type:  "billing_doc",
      target_id:    j.accountingDocument,
      target_type:  "journal_entry",
      relationship: "POSTED_AS",
    });
  }

  // Edge 5: → Payment (SETTLED_BY) — two cases
  //
  // VERIFIED FROM DATA: payments clear in two different ways:
  //
  // Case 1 (100 payments):
  //   payment.clearingAccountingDocument matches journal_entries.accountingDocument
  //   → Edge: journal_entry → payment
  //
  // Case 2 (20 payments):
  //   payment.clearingAccountingDocument matches billing_docs.accountingDocument
  //   This happens when SAP's second JE table (not in this export) holds the entry.
  //   → Edge: billing_doc → payment (skip the missing intermediate JE)
  //
  const jeIds   = new Set(journal.map((j) => j.accountingDocument));
  const bdAccMap = new Map(
    bdHeaders.map((b) => [b.accountingDocument, b.billingDocument])
  );

  for (const p of payments) {
    if (!p.clearingAccountingDocument || !p.accountingDocument) continue;
    const clearing = p.clearingAccountingDocument;

    if (jeIds.has(clearing)) {
      // Case 1: normal JE → Payment edge
      edges.push({
        source_id:    clearing,
        source_type:  "journal_entry",
        target_id:    p.accountingDocument,
        target_type:  "payment",
        relationship: "SETTLED_BY",
      });
    } else if (bdAccMap.has(clearing)) {
      // Case 2: clearing doc is a billing doc's accounting doc
      // Link billing_doc → payment directly, skipping the missing JE
      const bdId = bdAccMap.get(clearing)!;
      edges.push({
        source_id:    bdId,
        source_type:  "billing_doc",
        target_id:    p.accountingDocument,
        target_type:  "payment",
        relationship: "SETTLED_BY",
      });
    }
    // If neither matches → clearing doc is outside this dataset → skip
  }

  await batchInsert("graph_edges", edges);

  // ── SUMMARY 
  console.log("\nSeed summary:");
  console.log(`  customers:         ${partners.length}`);
  console.log(`  products:          ${rawProducts.length}`);
  console.log(`  plants:            ${rawPlants.length}`);
  console.log(`  sales_orders:      ${soHeaders.length}`);
  console.log(`  sales_order_items: ${soItems.length}`);
  console.log(`  deliveries:        ${delHeaders.length}`);
  console.log(`  delivery_items:    ${delItems.length}`);
  console.log(`  billing_docs:      ${bdHeaders.length}`);
  console.log(`  billing_doc_items: ${bdItems.length}`);
  console.log(`  journal_entries:   ${journal.length}`);
  console.log(`  payments:          ${payments.length}`);
  console.log(`  graph_edges:       ${edges.length}`);

  const counts = { healthy: 0, warning: 0, critical: 0, pending: 0 };
  for (const s of flowStatuses.values()) counts[s as keyof typeof counts]++;
  console.log("\nFlow status breakdown:");
  console.log(`healthy:  ${counts.healthy}  (complete O2C chain)`);
  console.log(`warning:  ${counts.warning}  (delivered, not billed)`);
  console.log(`critical: ${counts.critical} (billing cancelled, no replacement)`);
  console.log(`pending:  ${counts.pending}  (no delivery yet)`);
  console.log("\nSeed complete.");
}

seed().catch((err) => {
  console.error("Seed crashed:", err);
  process.exit(1);
});
