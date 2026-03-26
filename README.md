# Flowmap

Flowmap is a graph-based Order-to-Cash (O2C) process explorer for SAP data. It visualizes the full business chain customer places an order, order gets delivered, delivery gets billed, billing posts to accounting, payment clears the entry as an interactive graph, and lets you query that data in plain English through a chat interface.

---

## Data Modeling and Seeding

The raw source data came as SAP JSONL exports across 15 different entity types. The first challenge was that SAP splits what we think of as a "customer" across four separate tables: business partners, addresses, company assignments, and sales area assignments. Rather than keep them separate, the migration merges all four into a single `customers` table. The same denormalization was applied where it simplified the schema.

The final schema has 12 tables: customers, products, plants, sales_orders, sales_order_items, deliveries, delivery_items, billing_docs, billing_doc_items, journal_entries, payments, and graph_edges.

The seed script (`scripts/seed.ts`) reads the JSONL files, converts SAP datetime strings to DATE format, parses numeric strings to floats, converts empty strings to NULL, and batch inserts 500 rows at a time to stay within Supabase request limits.

Two things are computed during seeding rather than at query time:

**flow_status on sales_orders.** Each order gets labeled healthy, warning, critical, or pending based on how far its chain has progressed. Healthy means the full chain exists with an active billing document. Warning means delivered but not billed. Critical means all billing documents are cancelled. Pending means no delivery has been created yet. Computing this upfront means the LLM can filter by a single field rather than writing a complex subquery to determine process health.

**graph_edges.** Every relationship between connected entities is written as a row: source_id, source_type, target_id, target_type, and a label (PLACED, FULFILLED_BY, BILLED_AS, POSTED_AS, SETTLED_BY). The reason for this table is that deriving relationships at query time requires different join logic for every node type. graph_edges flattens everything into one uniform structure, so any neighbor lookup — regardless of which node type you start from — is always the same query.

One data quirk worth noting: some payments in the source data link directly to a billing document without going through a journal entry. This happens when the intermediate accounting record lives in a separate SAP table that was not exported. The seeder detects this case and writes a direct billing_doc to payment edge. The application reads it like any other edge.

---

## Architecture

```
Browser
  GraphCanvas (React Flow)  <-->  /api/graph               (initial load)
                                  /api/graph/expand/[id]   (double-click expand)
  ChatPanel                 <-->  /api/chat
                                      |
                                  lib/llm/pipeline.ts
                                      |-- Call 1: question -> SQL  (Groq)
                                      |-- Supabase RPC execute_sql
                                      |-- Call 2: rows -> answer   (Groq)
```

Next.js App Router, PostgreSQL on Supabase, Llama 3.3 70B on Groq, React Flow for the canvas. Everything data-related runs server-side in API routes.

---

## Graph Traversal

The initial canvas loads the 20 most recently created sales orders. We start from sales orders rather than customers because a customer can have years of orders — starting there would make the initial view unreadably large.

From those 20 IDs, the API runs four sequential hops through graph_edges. Hop 1 surfaces customers and deliveries. Hop 2 takes the delivery IDs and surfaces billing documents. Hop 3 takes billing document IDs and surfaces journal entries. Hop 4 takes journal entry IDs and surfaces payments. Results from all hops are merged and deduplicated by edge ID.

Pending sales orders have no graph_edges rows because no delivery exists for them. After the traversal, any of the original 20 sales orders not found in the results are explicitly added as isolated nodes on the canvas.

Double-clicking a node calls `/api/graph/expand/[id]`, which runs a single hop from that ID and merges the new nodes and edges into the existing canvas without reloading everything.

---

## LLM Pipeline

The chat pipeline makes two sequential calls to Groq.

**Call 1** converts the question to SQL. Temperature is 0.1 for deterministic output. The model responds in JSON with sql, answer, and node_ids. Before running anything, two checks apply: if sql is null the question was off-topic and the model's answer is returned directly without touching the database; if the SQL does not start with SELECT it is rejected outright to prevent write operations through the chat interface.

The SQL is executed through a Supabase RPC function called `execute_sql`. Supabase's client library does not support running arbitrary SQL strings through its normal query builder, which is why the RPC approach was needed.

**Call 2** takes the original question and the raw result rows and produces a natural language answer. Temperature is 0.3. Two calls are necessary because Call 1 cannot produce the final answer — it has not seen the data yet. A single call would require hallucinating the answer before the query runs.

Groq was chosen because it runs inference on custom hardware (LPUs) that is significantly faster than GPU-based providers. Latency matters in a chat interface, and Llama 3.3 70B on Groq typically responds in under two seconds.

---

## Prompt Engineering

The system prompt has eight blocks.

**Role and boundaries** establishes that the model is a data analyst for this dataset only and must return a specific JSON response for off-topic questions. This is the primary guardrail.

**Business domain context** explains the Order-to-Cash process so the model understands what "delivered but not billed" or "critical flow status" means in business terms.

**Full database schema** covers every table, column, data type, and what nulls mean. This is the most important block for correct SQL generation.

**Critical data quirks** covers things that cause silent query errors if missed: cancelled billing docs must not be counted as revenue, unshipped deliveries have a null goods_movement_date, the correct six-table join path, the payment anomaly.

**Few-shot examples** gives four complete worked examples showing the expected query patterns for aggregation, joins, a full chain trace, and broken chain detection.

**Chain of thought** requires the model to reason through intent, tables, joins, filters, aggregation, and edge cases before writing SQL. It also contains an explicit rule: if the user mentions a specific document ID alongside words like "show", "trace", or "details", always use the full O2C chain join. Without this rule, asking "show me sales order 740509" returns one row instead of the full connected chain.

**Output format** is the strict JSON schema the model must follow.

**Guardrail examples** are explicit examples of questions to reject, including off-topic queries and SQL injection attempts like UPDATE and DELETE.

---

## Node Highlighting

When the pipeline returns results, node_ids from Call 2 are used to highlight nodes on the canvas in yellow. Rather than trusting the LLM to list every relevant ID accurately, the pipeline also scans the actual result rows and extracts values from known ID columns (sales_order_id, customer_id, delivery_id, billing_doc_id, accounting_doc_id, payment_id). The final highlighted set is the union of both. When an off-topic question returns an empty node_ids array, all previous highlights are cleared.

---

## Conversation Memory

The last 6 messages are sent with every request as a history array. The LLM receives this as prior conversation context, enabling follow-up questions like "what about the critical ones?" The slicing happens in the frontend so the backend never receives more than 6 prior messages regardless of conversation length.

---

## Running Locally

Create `.env.local` at the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
```

Run the migration and seed scripts once to set up the database, then start the app:

```bash
npx ts-node scripts/migrate.ts
npx ts-node scripts/seed.ts
npm install
npm run dev
```

---

## Project Structure

```
app/
  api/graph/route.ts              Initial graph load (4-hop traversal)
  api/graph/expand/[id]/route.ts  Expand a node's direct neighbors
  api/chat/route.ts               Chat endpoint
  page.tsx                        Root layout

components/
  GraphCanvas.tsx     React Flow canvas with load, expand, and highlighting
  FlowNode.tsx        Custom node with type color and flow status dot
  ChatPanel.tsx       Chat UI with conversation history
  NodeDetailPanel.tsx Metadata panel on single click

lib/
  db/client.ts        Supabase client
  llm/groq.ts         Groq client
  llm/pipeline.ts     Two-call pipeline with guardrails and ID extraction
  llm/prompts.ts      System prompt and answer prompt
  utils/graph.ts      fetchEdges and getLabel shared by both graph routes

scripts/
  migrate.ts          Schema creation (12 tables)
  seed.ts             Data transformation and loading from SAP JSONL exports
```

---

## Known Limitations

The Groq free tier has a daily token limit of 100,000 tokens. Each chat request uses roughly 2,000 to 4,000 tokens. Heavy testing will exhaust this. The fix is to upgrade to a paid tier or swap the provider.

The initial canvas always shows the 20 most recent sales orders with no filtering. A production version would make this configurable by date range, customer, or flow status.
