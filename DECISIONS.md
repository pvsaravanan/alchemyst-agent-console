# Design & Architectural Decisions

This document outlines the core system design, data structures, and architectural decisions made while building the Agent Console.

---

## 1. Sequence-Based Ordering & Deduplication
To handle out-of-order packets and duplicate messages in chaos mode, we decouple the raw network layer from the state rendering layer by using a dedicated **Reordering Buffer** utility (`src/utils/reorderBuffer.ts`).

### Data Structure & Complexity
We implement the buffer as a sorted array in combination with a `Set` for deduplication:
* **Deduplication:** We keep a `Set<number>` of all successfully processed sequence numbers. Any incoming message with a `seq` present in this set (or with `seq <= lastProcessedSeq`) is discarded in $O(1)$ time.
* **Buffering & Sorting:** Any message with `seq > lastProcessedSeq + 1` represents a gap. We insert it into a sorted array (`reorderBuffer`) using linear search or binary insertion. Since the chaos buffer size is small (typically holds 2 to 4 messages), a simple sorted array is extremely performant and avoids the overhead of a complex min-heap.
* **Consecutive Flush:** After inserting a message, we verify if the head of the buffer matches `lastProcessedSeq + 1`. If it does, we pop consecutive elements in a loop, incrementing `lastProcessedSeq` and adding them to the processed set, returning them as a chunk of ready messages.

---

## 2. Preventing Layout Shift During Tool Interruptions
Layout shifts in AI streaming interfaces erode user trust. We prevent this by structuring the rendering engine around **Structured Content Blocks** inside a single message bubble:
* Instead of rendering the message as a single string of raw text, an agent message is modeled as an array of blocks:
  ```typescript
  export type ContentBlock =
    | { type: "text"; text: string; streamId: string }
    | { type: "tool"; callId: string; ... };
  ```
* When a `TOOL_CALL` interrupts the stream, we append a new block of type `"tool"` to the active message's blocks.
* The preceding `"text"` block freezes instantly because its text is no longer updated. The tool block renders directly below the text block.
* By using standard flexbox spacing and wrapping, the tool card slides in seamlessly.
* When the `TOOL_RESULT` arrives, we mutate only that specific tool block, changing its status from `waiting` to `done` and rendering the output in place. The text streaming then resumes by appending a *new* `"text"` block to the block array.
* This block-by-block rendering guarantees **zero layout shift** or reflow of preceding text during tool calls or resumes.

---

## 3. Reconnection State Recovery
To make connection drops invisible, we distinguish between what the network socket receives versus what the rendering engine has fully committed.

* **Tracking Consumed State:** The client keeps `lastProcessedSeq` (stored in a `useRef` to prevent React stale closures) representing the sequence number of the last message that came out of the reordering buffer and was committed to the React state.
* **The Handshake:** Upon reconnecting, the client immediately sends a `RESUME` message as its first packet, transmitting the current `lastProcessedSeq` value.
* **Deduplication on Replay:** The server replays all events starting after `lastProcessedSeq`. Some events might have been in flight or buffered by the socket buffer but not yet processed by the client. The client's reordering buffer automatically discards any replayed events with `seq <= lastProcessedSeq`, preventing any duplicate renders or UI jumps.
* **Waiting Tool Cards:** If the drop occurred mid-tool-call, the tool block in the chat state is preserved in a `waiting` state. When the connection resumes and the server replays the `TOOL_RESULT`, the card updates cleanly.
* **Preventing Stale Socket Collision:** When a new WebSocket is instantiated during reconnects or session resets, the previous socket is closed. However, because close events fire asynchronously, the old socket's `onclose` callback can execute *after* the new socket has already been assigned to `socketRef.current`. Without protection, the old socket's callback would set `socketRef.current = null` and change status to `DISCONNECTED` (with the `"replaced"` reason code), permanently breaking the new active socket session. We resolved this by introducing strict active-socket identity guards (`if (socketRef.current !== ws) return`) on all WebSocket listener hooks (`onopen`, `onmessage`, `onclose`, `onerror`), neutralizing callbacks from outdated connections.

---

## 4. Spotted Protocol Race Condition
We identified a critical race condition in the mock WebSocket protocol:
> [!WARNING]
> **The `TOOL_ACK` Timeout Race Condition**
> * **The Problem:** The server expects `TOOL_ACK` within 2 seconds of sending a `TOOL_CALL`, and logs a violation if not received within 5 seconds. However, under chaos mode, preceding tokens can experience network latency spikes of 2 to 8 seconds. 
> * If the client buffers the `TOOL_CALL` packet in the reordering buffer waiting for a delayed preceding token, the client will not render the card (and thus would not send `TOOL_ACK` under a render-based ack system) before the server's 5-second timeout fires.
> * **The Mitigation:** We solved this by separating the raw network responder from the UI queue. In `useAgentSocket.ts`, the raw `ws.onmessage` handler immediately intercepts `TOOL_CALL` and dispatches `TOOL_ACK` back to the server, while the packet itself is enqueued in the reordering buffer to ensure it renders in the correct sequential order in the chat bubble. This guarantees compliance with the server's timeout while maintaining visual sequence fidelity.

---

## 5. Scaling Considerations

### Scenario A: Handling 50 Concurrent Agent Streams
If this console scaled to an "operations dashboard" with 50 concurrent streams:
1. **Shared Web Worker:** A single main thread can block under 50 simultaneous WebSockets. We would move the WebSocket network connections, PING/PONG heartbeats, and reordering queues into a **Web Worker** or **Shared Worker**. The worker would process raw frames and post batched updates to the React UI.
2. **Throttled DOM Updates:** Instead of re-rendering components immediately on every token, we would queue UI updates and flush them to the DOM in batches (e.g., every 100ms using a `requestAnimationFrame` loop) to avoid overloading the browser's render pipeline.
3. **Virtualized Message Logs:** We would use virtualized lists (e.g., `@tanstack/react-virtual`) for the chat messages and trace timelines so that only the elements currently visible on the screen are rendered in the DOM.

### Scenario B: Handling 100x Longer Responses (Document Generation)
For extremely long responses:
1. **Incremental String Buffer:** Storing Megabytes of text inside React state strings triggers massive garbage collection overhead during concatenations. We would manage text streaming using an append-only array of buffers or stream readers and write updates directly to the DOM nodes using Refs (`ref.current.innerText += chunk`), bypassing React's virtual DOM reconciliation for the high-frequency streaming section.
2. **Pagination or Accordion Folding:** We would paginate or fold completed text blocks so the browser does not have to compute layouts for millions of characters at once.
3. **Optimized Diffing:** The JSON diffing engine would be offloaded to a Web Worker to prevent 500KB+ nested objects from blocking the main thread during deep tree comparisons.
