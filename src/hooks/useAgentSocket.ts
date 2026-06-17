import { useEffect, useRef, useState, useCallback } from "react";
import { ReorderBuffer } from "../utils/reorderBuffer";

// Protocol Types
export type SocketStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "STREAMING"
  | "TOOL_CALL_PENDING"
  | "RECONNECTING"
  | "RESUMING";

export type ContentBlock =
  | { type: "text"; text: string; streamId: string }
  | {
      type: "tool";
      callId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: Record<string, unknown>;
      status: "pending" | "waiting" | "done";
    };

export interface Message {
  id: string;
  sender: "user" | "agent";
  timestamp: number;
  blocks: ContentBlock[];
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  direction: "in" | "out";
  seq?: number;
  type: string;
  payload: any;
  // Grouping
  isGroup?: boolean;
  tokenCount?: number;
  durationMs?: number;
  fullText?: string;
}

export interface ContextSnapshot {
  timestamp: number;
  data: Record<string, unknown>;
  seq: number;
}

export interface ContextHistory {
  contextId: string;
  snapshots: ContextSnapshot[];
  currentIndex: number;
}

interface ServerMessage {
  type: string;
  seq: number;
  [key: string]: any;
}

export function useAgentSocket() {
  const [status, setStatus] = useState<SocketStatus>("DISCONNECTED");
  const [messages, setMessages] = useState<Message[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [contextHistory, setContextHistory] = useState<Record<string, ContextHistory>>({});
  const [activeContextId, setActiveContextId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // References for mutable state accessed by async socket event handlers
  const socketRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<SocketStatus>("DISCONNECTED");
  const messagesRef = useRef<Message[]>([]);
  const timelineEventsRef = useRef<TimelineEvent[]>([]);
  const activeStreamIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamStartTimesRef = useRef<Record<string, number>>({});

  // Core Reorder Buffer
  const reorderBufferRef = useRef<ReorderBuffer>(new ReorderBuffer(0));

  // Helper to update status both in ref and state
  const updateStatus = (newStatus: SocketStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  // Helper to log timeline events
  const logTimelineEvent = useCallback((
    direction: "in" | "out",
    type: string,
    payload: any,
    seq?: number
  ) => {
    const timestamp = Date.now();
    const eventId = `${type}-${seq || ""}-${Math.random().toString(36).substring(2, 9)}`;

    // If it's a TOKEN event, try to group it
    if (type === "TOKEN" && payload.stream_id) {
      const streamId = payload.stream_id;
      const text = payload.text || "";
      const lastEvent = timelineEventsRef.current[timelineEventsRef.current.length - 1];

      if (
        lastEvent &&
        lastEvent.type === "TOKEN_GROUP" &&
        lastEvent.payload.stream_id === streamId
      ) {
        // Update existing group
        const duration = timestamp - streamStartTimesRef.current[streamId];
        const updatedEvent: TimelineEvent = {
          ...lastEvent,
          tokenCount: (lastEvent.tokenCount || 0) + 1,
          durationMs: duration,
          fullText: (lastEvent.fullText || "") + text,
          timestamp,
        };

        const newEvents = [...timelineEventsRef.current];
        newEvents[newEvents.length - 1] = updatedEvent;
        timelineEventsRef.current = newEvents;
        setTimelineEvents(newEvents);
        return eventId;
      } else {
        // Start a new group
        streamStartTimesRef.current[streamId] = timestamp;
        const newGroupEvent: TimelineEvent = {
          id: eventId,
          timestamp,
          direction: "in",
          type: "TOKEN_GROUP",
          seq,
          payload: { stream_id: streamId },
          isGroup: true,
          tokenCount: 1,
          durationMs: 0,
          fullText: text,
        };

        const newEvents = [...timelineEventsRef.current, newGroupEvent];
        timelineEventsRef.current = newEvents;
        setTimelineEvents(newEvents);
        return eventId;
      }
    }

    // For non-grouped events
    const newEvent: TimelineEvent = {
      id: eventId,
      timestamp,
      direction,
      seq,
      type,
      payload,
    };

    const newEvents = [...timelineEventsRef.current, newEvent];
    timelineEventsRef.current = newEvents;
    setTimelineEvents(newEvents);
    return eventId;
  }, []);

  // Sync function to copy buffer/message updates to React states
  const syncStateToReact = useCallback(() => {
    setMessages([...messagesRef.current]);
  }, []);

  // Process a message once it's confirmed in-order
  const executeProcessedMessage = useCallback((msg: ServerMessage) => {
    // 1. Add log to timeline (except TOKEN, which uses custom grouping in logTimelineEvent)
    if (msg.type !== "TOKEN") {
      logTimelineEvent("in", msg.type, msg, msg.seq);
    } else {
      logTimelineEvent("in", "TOKEN", msg, msg.seq);
    }

    // 2. Process message contents
    switch (msg.type) {
      case "TOKEN": {
        const streamId = msg.stream_id;
        activeStreamIdRef.current = streamId;
        // Only transition to STREAMING from stable states — never override RECONNECTING
        const stableForToken = statusRef.current === "CONNECTED" || statusRef.current === "STREAMING" || statusRef.current === "TOOL_CALL_PENDING" || statusRef.current === "RESUMING";
        if (stableForToken) updateStatus("STREAMING");

        const text = msg.text;
        const currentMessages = messagesRef.current;
        const lastMsg = currentMessages[currentMessages.length - 1];

        if (lastMsg && lastMsg.sender === "agent") {
          const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1];
          if (lastBlock && lastBlock.type === "text" && lastBlock.streamId === streamId) {
            // Append to current text block
            const updatedBlocks = [...lastMsg.blocks];
            updatedBlocks[updatedBlocks.length - 1] = {
              ...lastBlock,
              text: lastBlock.text + text,
            };
            currentMessages[currentMessages.length - 1] = {
              ...lastMsg,
              blocks: updatedBlocks,
            };
          } else {
            // Append a new text block to existing agent message
            const newBlock: ContentBlock = { type: "text", text, streamId };
            currentMessages[currentMessages.length - 1] = {
              ...lastMsg,
              blocks: [...lastMsg.blocks, newBlock],
            };
          }
        } else {
          // Create a new agent message with a text block
          const newBlock: ContentBlock = { type: "text", text, streamId };
          currentMessages.push({
            id: `msg-${msg.seq}`,
            sender: "agent",
            timestamp: Date.now(),
            blocks: [newBlock],
          });
        }
        break;
      }

      case "TOOL_CALL": {
        const callId = msg.call_id;
        const toolName = msg.tool_name;
        const args = msg.args || {};
        updateStatus("TOOL_CALL_PENDING");

        const currentMessages = messagesRef.current;
        const lastMsg = currentMessages[currentMessages.length - 1];
        const newBlock: ContentBlock = {
          type: "tool",
          callId,
          toolName,
          args,
          status: "waiting", // Render "waiting" state initially
        };

        if (lastMsg && lastMsg.sender === "agent") {
          currentMessages[currentMessages.length - 1] = {
            ...lastMsg,
            blocks: [...lastMsg.blocks, newBlock],
          };
        } else {
          currentMessages.push({
            id: `msg-${msg.seq}`,
            sender: "agent",
            timestamp: Date.now(),
            blocks: [newBlock],
          });
        }
        break;
      }

      case "TOOL_RESULT": {
        const callId = msg.call_id;
        const result = msg.result || {};
        // Only move back to STREAMING from stable states — don't override RECONNECTING/RESUMING
        const stableForResult = statusRef.current === "TOOL_CALL_PENDING" || statusRef.current === "STREAMING" || statusRef.current === "CONNECTED";
        if (stableForResult) updateStatus("STREAMING");

        const currentMessages = messagesRef.current;
        let updated = false;

        // Search backward to update the correct tool block
        for (let i = currentMessages.length - 1; i >= 0; i--) {
          const m = currentMessages[i];
          if (m.sender === "agent") {
            const blockIdx = m.blocks.findIndex(
              (b) => b.type === "tool" && b.callId === callId
            );
            if (blockIdx !== -1) {
              const updatedBlocks = [...m.blocks];
              const oldBlock = updatedBlocks[blockIdx] as Extract<ContentBlock, { type: "tool" }>;
              updatedBlocks[blockIdx] = {
                ...oldBlock,
                result,
                status: "done",
              };
              currentMessages[i] = {
                ...m,
                blocks: updatedBlocks,
              };
              updated = true;
              break;
            }
          }
        }

        if (!updated) {
          console.warn(`Tool call block not found for callId: ${callId}`);
        }
        break;
      }

      case "CONTEXT_SNAPSHOT": {
        const contextId = msg.context_id;
        const data = msg.data || {};
        setActiveContextId(contextId);

        setContextHistory((prev) => {
          const existing = prev[contextId];
          const newSnapshot: ContextSnapshot = {
            timestamp: Date.now(),
            data,
            seq: msg.seq,
          };

          if (existing) {
            // Prevent duplicate context additions
            if (existing.snapshots.some((s) => s.seq === msg.seq)) {
              return prev;
            }
            const updatedSnapshots = [...existing.snapshots, newSnapshot];
            return {
              ...prev,
              [contextId]: {
                contextId,
                snapshots: updatedSnapshots,
                currentIndex: updatedSnapshots.length - 1, // Focus on newest
              },
            };
          } else {
            return {
              ...prev,
              [contextId]: {
                contextId,
                snapshots: [newSnapshot],
                currentIndex: 0,
              },
            };
          }
        });
        break;
      }

      case "STREAM_END": {
        updateStatus("CONNECTED");
        activeStreamIdRef.current = null;
        break;
      }

      case "ERROR": {
        setError(`Server Error: [${msg.code}] ${msg.message}`);
        updateStatus("CONNECTED");
        break;
      }

      case "PING": {
        break;
      }
    }
  }, [logTimelineEvent]);

  // Process message through reordering buffer
  const processMessageThroughBuffer = useCallback((msg: ServerMessage) => {
    const readyMessages = reorderBufferRef.current.addMessage(msg);

    if (readyMessages.length > 0) {
      for (const nextMsg of readyMessages) {
        executeProcessedMessage(nextMsg);
      }
      syncStateToReact();
    }
  }, [executeProcessedMessage, syncStateToReact]);

  // Raw WebSocket message parser & immediate responder
  const handleRawMessage = useCallback((ws: WebSocket, rawData: string) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(rawData) as ServerMessage;
    } catch (err) {
      console.error("JSON parse error on raw websocket event", err);
      return;
    }

    // Protocol Level 1: Immediate Heartbeat Response
    if (msg.type === "PING") {
      const challenge = msg.challenge || "";
      const pongPayload = { type: "PONG", echo: challenge };
      
      logTimelineEvent("in", "PING", msg, msg.seq);
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(pongPayload));
        logTimelineEvent("out", "PONG", pongPayload);
      }
    }

    // Protocol Level 2: Immediate Tool Acknowledgement (anti-timeout under spikes)
    if (msg.type === "TOOL_CALL") {
      const ackPayload = { type: "TOOL_ACK", call_id: msg.call_id };
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(ackPayload));
        logTimelineEvent("out", "TOOL_ACK", ackPayload);
      }
    }

    // Process all events sequentially through the queue
    processMessageThroughBuffer(msg);
  }, [logTimelineEvent, processMessageThroughBuffer]);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    // Clean connection timers
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const lastSeq = reorderBufferRef.current.getLastProcessedSeq();
    const isReconnecting = lastSeq > 0;
    updateStatus(isReconnecting ? "RECONNECTING" : "CONNECTING");
    setError(null);

    const ws = new WebSocket("ws://localhost:4747/ws");
    socketRef.current = ws;

    ws.onopen = () => {
      if (socketRef.current !== ws) {
        console.log("[websocket] Ignoring open event from inactive/old socket");
        return;
      }
      console.log("[websocket] Open");
      reconnectAttemptsRef.current = 0;

      const currentLastSeq = reorderBufferRef.current.getLastProcessedSeq();
      if (currentLastSeq > 0) {
        // Immediately send RESUME as first message
        updateStatus("RESUMING");
        const resumePayload = {
          type: "RESUME",
          last_seq: currentLastSeq,
        };
        ws.send(JSON.stringify(resumePayload));
        logTimelineEvent("out", "RESUME", resumePayload);
      } else {
        updateStatus("CONNECTED");
      }
    };

    ws.onmessage = (event) => {
      if (socketRef.current !== ws) {
        console.log("[websocket] Ignoring message event from inactive/old socket");
        return;
      }
      handleRawMessage(ws, event.data);
    };

    ws.onclose = (event) => {
      console.log(`[websocket] Close code=${event.code} reason=${event.reason}`);
      if (socketRef.current !== ws) {
        console.log("[websocket] Ignoring close event from inactive/old socket");
        return;
      }
      socketRef.current = null;

      // If the session was replaced by another client connection, do NOT auto-reconnect.
      if (event.reason === "replaced") {
        updateStatus("DISCONNECTED");
        setError("Connection closed: Console opened in another tab or browser.");
        return;
      }

      // Automatic Reconnection with Exponential Backoff
      const currentLastSeq = reorderBufferRef.current.getLastProcessedSeq();
      const isReconnectingState = currentLastSeq > 0;
      updateStatus(isReconnectingState ? "RECONNECTING" : "DISCONNECTED");

      const delay = Math.min(500 * Math.pow(2, reconnectAttemptsRef.current), 10000);
      reconnectAttemptsRef.current += 1;

      console.log(`[websocket] Scheduling reconnect in ${delay}ms`);
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = (err) => {
      console.error("[websocket] Error", err);
      if (socketRef.current !== ws) {
        return;
      }
    };
  }, [handleRawMessage, logTimelineEvent]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    updateStatus("DISCONNECTED");
  }, []);

  // Send message
  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    // Reset sequence tracking for a new conversation turn
    reorderBufferRef.current.reset(0);
    activeStreamIdRef.current = null;
    setError(null);

    // Update messages local ref & react state
    const userMessage: Message = {
      id: `msg-user-${Date.now()}`,
      sender: "user",
      timestamp: Date.now(),
      blocks: [{ type: "text", text: content, streamId: "user" }],
    };
    messagesRef.current = [...messagesRef.current, userMessage];
    setMessages(messagesRef.current);

    const payload = {
      type: "USER_MESSAGE",
      content,
    };

    logTimelineEvent("out", "USER_MESSAGE", payload);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      setError("Cannot send message: WebSocket disconnected. Reconnecting...");
      connect();
    }
  }, [connect, logTimelineEvent]);

  // Reset entire dashboard state
  const resetSession = useCallback(async () => {
    try {
      await fetch("http://localhost:4747/reset");
    } catch (err) {
      console.warn("HTTP session reset failed, clearing client state anyway", err);
    }

    // Clear all local ref states
    reorderBufferRef.current.reset(0);
    activeStreamIdRef.current = null;
    reconnectAttemptsRef.current = 0;
    messagesRef.current = [];
    timelineEventsRef.current = [];
    streamStartTimesRef.current = {};

    // Reset react states
    setMessages([]);
    setTimelineEvents([]);
    setContextHistory({});
    setActiveContextId(null);
    setError(null);

    // Force reconnect
    connect();
  }, [connect]);

  // Context scrubbing navigation
  const setContextScrubberIndex = useCallback((contextId: string, index: number) => {
    setContextHistory((prev) => {
      const history = prev[contextId];
      if (!history || index < 0 || index >= history.snapshots.length) return prev;
      return {
        ...prev,
        [contextId]: {
          ...history,
          currentIndex: index,
        },
      };
    });
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    messages,
    timelineEvents,
    contextHistory,
    activeContextId,
    error,
    sendMessage,
    resetSession,
    setContextScrubberIndex,
    reconnect: connect,
    lastProcessedSeq: reorderBufferRef.current.getLastProcessedSeq(),
  };
}
