# AI Coding Session Summary

**Tool used:** Claude Code (claude-sonnet-4-6) via VS Code extension
**Project:** Flowmap — Graph-based Order-to-Cash Explorer

---

## How I Used Claude Code

I used Claude Code as an implementation assistant, not a decision-maker. Every architectural and product decision was mine — I came into each session knowing what I wanted to build and why, and used Claude to validate my thinking, implement what I had already designed, and speed up the parts that were mechanical (boilerplate, syntax, wiring components together).

My workflow for each feature:
1. I decided the approach and explained my reasoning
2. I asked Claude to confirm if there were any problems with it or edge cases I had missed
3. I directed the implementation, reviewing every change before applying it
4. When bugs came up I diagnosed what was wrong and told Claude specifically what to fix

---

## Key Prompts and Workflows

**Data modeling and schema design**

I designed the schema myself based on the SAP JSONL exports. My key decision was to precompute relationships into a separate graph_edges table rather than derive them at query time through joins. I explained this decision to Claude and asked it to validate the approach and flag any issues. I also decided to compute flow_status at seed time so the LLM could filter by a single field — I directed Claude to implement this logic in the seed script with the four-state classification I defined (healthy, warning, critical, pending).

**Graph traversal API**

I decided to start the traversal from the 20 most recent sales orders rather than from customers, because customers would pull in too much historical data. I directed Claude to implement a 4-hop sequential traversal following that decision, and I specified that pending sales orders with no edges must still appear on the canvas. When I reviewed the first implementation I caught that edge deduplication was missing and asked Claude to add it.

**LLM pipeline design**

I decided on a two-call pipeline — one call to generate SQL, one call to convert rows into a natural language answer — because I did not want the model producing answers before seeing the data. I asked Claude to implement this structure. I also decided which prompting techniques to use (few-shot examples, chain of thought, domain context, strict output format) and directed Claude to write a detailed system prompt covering all of them. I reviewed every block and pushed back until the prompt reflected the exact behavior I wanted.

**Debugging the prompt**

During testing I noticed that asking for details on a specific sales order returned only one row instead of the full O2C chain. I identified this as an intent classification problem in the chain of thought block and told Claude to add an explicit rule: if the question references a specific document ID with words like "show", "trace", or "details", always use the full chain join. I specified the rule, Claude added it.

**Node highlighting**

After seeing that the LLM was inconsistently returning node_ids, I decided to change the approach: instead of trusting the model, scan the actual database result rows for known ID column names and build the highlighted set from the real data. I told Claude what columns to scan and what the union logic should be. This was my call — Claude implemented it.

**Conversation memory**

I decided to keep conversation history in the frontend rather than the backend, slicing to the last 6 messages before each request. This keeps the backend stateless and token usage predictable. I directed Claude to implement the slicing logic in ChatPanel and pass history as part of the request body.

---

## How I Debugged and Iterated

**Graph not rendering correctly:** I noticed some sales orders were missing from the canvas. I checked the API response and saw that pending orders with no graph_edges rows were being dropped silently. I told Claude the specific fix — after the traversal, check the original 20 IDs against the node map and add any missing ones as isolated nodes.

**Expand on double-click not working:** The API was returning the right data but the canvas was not updating. I reviewed the expand route and identified that the neighborMap was only handling one direction of edges. I told Claude to add the missing direction check.

**Highlights not clearing:** I noticed that after an off-topic question, highlights from the previous answer stayed on. I found an early-return guard in the useEffect that was skipping the update on empty arrays — I told Claude to remove that specific guard.

**Streaming removed mid-build:** I implemented SSE streaming to improve perceived responsiveness. After hitting Groq's daily token limit during testing, I made the decision to revert entirely to standard JSON responses rather than work around a rate limit. I directed Claude to revert all three affected files — pipeline, route, and frontend — back to the non-streaming versions.

**Prompt and parser mismatch:** During the streaming work the answer prompt was changed to request plain text, but the parser was still expecting JSON. I spotted the inconsistency and told Claude to bring the prompt back in line with what the parser expected.

---

## Summary

I drove all decisions — architecture, data modeling, prompting strategy, debugging approach, and product trade-offs. Claude Code handled implementation speed: writing boilerplate, applying changes across files, and catching syntax issues. The most effective pattern was coming in with a clear decision already made, directing Claude to implement it, then reviewing the output critically before accepting it.
