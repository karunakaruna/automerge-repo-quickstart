import React, { useEffect, useMemo, useState } from "react";

// Best-effort typings for the adapter internals
interface MaybeWsAdapter {
  url?: string;
  socket?: WebSocket | null;
  // some builds may keep ws under a private field
  _socket?: WebSocket | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    bytes = bytes / 1024;
    i++;
  } while (bytes >= 1024 && i < units.length - 1);
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function readyStateToText(rs: number | undefined): string {
  switch (rs) {
    case WebSocket.CONNECTING:
      return "connecting";
    case WebSocket.OPEN:
      return "connected";
    case WebSocket.CLOSING:
      return "closing";
    case WebSocket.CLOSED:
      return "closed";
    default:
      return "unknown";
  }
}

export const ConnectionStatus: React.FC = () => {
  const wsAdapter = (window as any).wsAdapter as MaybeWsAdapter | undefined;
  const [status, setStatus] = useState<string>("unknown");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [bytesReceived, setBytesReceived] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [peerCount, setPeerCount] = useState<number | null>(null);

  // Determine the WebSocket instance (best-effort across implementations)
  const socket = useMemo(() => {
    if (!wsAdapter) return undefined;
    return (wsAdapter.socket || (wsAdapter as any)._socket) as WebSocket | undefined;
  }, [wsAdapter]);

  // Poll status, and attach listeners for metrics
  useEffect(() => {
    if (!wsAdapter) {
      setError("wsAdapter not found. Make sure it is exposed on window.");
      return;
    } else {
      setError("");
    }

    let ws = socket;

    // If the adapter hasn't attached a socket yet, poll for it briefly
    let pollId: number | undefined;
    const startPolling = () => {
      pollId = window.setInterval(() => {
        const candidate = (wsAdapter as any).socket || (wsAdapter as any)._socket;
        if (candidate && candidate instanceof WebSocket) {
          ws = candidate;
          updateStatus();
          attachListeners(candidate);
          if (pollId) window.clearInterval(pollId);
        } else {
          updateStatus();
        }
      }, 1000);
    };

    const updateStatus = () => {
      const rs = ws?.readyState;
      setStatus(readyStateToText(rs));
    };

    const handleMessage = (ev: MessageEvent) => {
      setLastMessageAt(Date.now());
      try {
        if (typeof ev.data === "string") {
          const size = new TextEncoder().encode(ev.data).byteLength;
          setBytesReceived((b) => b + size);
          // Try to parse peer count from JSON payloads if present
          try {
            const obj = JSON.parse(ev.data);
            if (obj && typeof obj === "object") {
              if (typeof obj.peerCount === "number") {
                setPeerCount(obj.peerCount);
              } else if (Array.isArray(obj.peers)) {
                setPeerCount(obj.peers.length);
              }
            }
          } catch {
            // non-JSON messages are expected in binary protocols
          }
        } else if (ev.data instanceof ArrayBuffer) {
          setBytesReceived((b) => b + ev.data.byteLength);
        } else if (typeof Blob !== "undefined" && ev.data instanceof Blob) {
          // Read blob size without async read by using size property
          setBytesReceived((b) => b + ev.data.size);
        }
      } catch {
        // ignore size calculation errors
      }
    };

    const handleOpen = () => updateStatus();
    const handleClose = () => updateStatus();
    const handleError = () => updateStatus();

    const attachListeners = (s: WebSocket) => {
      s.addEventListener("open", handleOpen);
      s.addEventListener("close", handleClose);
      s.addEventListener("error", handleError);
      s.addEventListener("message", handleMessage);
    };

    const detachListeners = (s?: WebSocket) => {
      if (!s) return;
      s.removeEventListener("open", handleOpen);
      s.removeEventListener("close", handleClose);
      s.removeEventListener("error", handleError);
      s.removeEventListener("message", handleMessage);
    };

    // Initial status
    updateStatus();

    if (ws) {
      attachListeners(ws);
    } else {
      startPolling();
    }

    // Also poll status every second to reflect changes promptly
    const statusInterval = window.setInterval(updateStatus, 1000);

    return () => {
      if (pollId) window.clearInterval(pollId);
      window.clearInterval(statusInterval);
      detachListeners(ws);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, wsAdapter]);

  const lastSeen = useMemo(() => {
    if (!lastMessageAt) return "—";
    const seconds = Math.max(0, Math.round((Date.now() - lastMessageAt) / 1000));
    return `${seconds}s ago`;
  }, [lastMessageAt]);

  return (
    <article style={{ marginBottom: "0.75rem" }}>
      <header>
        <strong>Connection</strong>
      </header>
      <small>
        <div>
          <strong>Status:</strong> <code>{status}</code>
        </div>
        <div>
          <strong>Peers:</strong> <code>{peerCount ?? "—"}</code>
        </div>
        <div>
          <strong>Last message:</strong> <code>{lastSeen}</code>
        </div>
        <div>
          <strong>Bytes received:</strong> <code>{formatBytes(bytesReceived)}</code>
        </div>
        {error ? (
          <div style={{ color: "#b00" }}>
            <strong>Error:</strong> {error}
          </div>
        ) : null}
      </small>
    </article>
  );
};

export default ConnectionStatus;
