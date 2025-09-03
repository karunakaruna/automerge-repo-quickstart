import "@picocss/pico/css/pico.min.css";
import "../index.css";
import { AutomergeUrl, useDocument, updateText } from "@automerge/react";
import React from "react";

export interface Task {
  title: string;
  done: boolean;
}

export interface TaskList {
  title: string;
  tasks: Task[];
}

// A helper function to consistently initialize a task list.
export function initTaskList() {
  return {
    title: `TODO: ${new Date().toLocaleString()}`,
    tasks: [{ done: false, title: "" }],
  };
}

export const TaskList: React.FC<{
  docUrl: AutomergeUrl;
}> = ({ docUrl }) => {
  const [doc, changeDoc] = useDocument<TaskList>(docUrl, {
    // This hooks the `useDocument` into reacts suspense infrastructure so the whole component
    // only renders once the document is loaded
    suspense: true,
  });

  const [status, setStatus] = React.useState<{ protected: boolean; canWrite: boolean } | null>(null);
  const base = "http://localhost:3030";
  const docId = React.useMemo(() => docUrl.replace(/^automerge:/, ""), [docUrl]);

  // Best-effort: force the WS client to reconnect so cookie changes take effect without a full page reload
  const reconnectWs = React.useCallback(async () => {
    const adapter: any = (window as any).wsAdapter;
    if (!adapter) return;
    const socket: WebSocket | undefined = (adapter.socket || adapter._socket) as WebSocket | undefined;
    try {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(4001, "auth changed"); } catch {}
      }
    } catch {}
    // Wait briefly for a new socket to appear and open
    const started = Date.now();
    while (Date.now() - started < 2000) {
      const s: WebSocket | undefined = (adapter.socket || adapter._socket) as WebSocket | undefined;
      if (s && s.readyState === WebSocket.OPEN) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, []);

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch(`${base}/docs/${encodeURIComponent(docId)}/status`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("status");
      const json = await res.json();
      setStatus({ protected: !!json.protected, canWrite: !!json.canWrite });
    } catch {
      setStatus({ protected: false, canWrite: true });
    }
  }, [docId]);

  React.useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const readOnly = Boolean(status?.protected && !status?.canWrite);
  const canWrite = Boolean(status?.canWrite);

  const unlock = async () => {
    const pwd = window.prompt("Enter password to edit this list");
    if (!pwd) return;
    try {
      const res = await fetch(`${base}/docs/${encodeURIComponent(docId)}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: pwd }),
      });
      if (!res.ok) {
        window.alert("Invalid password");
        return;
      }
      await fetchStatus();
      await reconnectWs();
    } catch (e) {
      console.error(e);
      window.alert("Login failed");
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => {
          if (readOnly) return;
          changeDoc((d) =>
            d.tasks.unshift({
              title: "",
              done: false,
            }),
          );
        }}
      >
        <b>+</b> New task
      </button>

      {readOnly ? (
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <small>
            🔒 This list is protected. You are in read-only mode. {" "}
            <a href="#" onClick={(e) => { e.preventDefault(); unlock(); }}>Unlock to edit</a>
          </small>
        </div>
      ) : null}

      {status?.protected && canWrite ? (
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch(`${base}/docs/${encodeURIComponent(docId)}/logout`, {
                  method: "POST",
                  credentials: "include",
                });
                if (!res.ok) throw new Error("logout");
                await fetchStatus();
                await reconnectWs();
              } catch (e) {
                console.error(e);
                window.alert("Failed to lock");
              }
            }}
          >
            Done editing (Lock)
          </button>
        </div>
      ) : null}

      <div id="task-list">
        {doc &&
          doc.tasks?.map(({ title, done }, index) => (
            <div className="task" key={index}>
              <input
                type="checkbox"
                checked={done}
                disabled={readOnly}
                onChange={() => {
                  if (readOnly) return;
                  changeDoc((d) => {
                    d.tasks[index].done = !d.tasks[index].done;
                  });
                }}
              />

              <input
                type="text"
                placeholder="What needs doing?"
                value={title || ""}
                readOnly={readOnly}
                onChange={(e) => {
                  if (readOnly) return;
                  changeDoc((d) => {
                    updateText(d, ["tasks", index, "title"], e.target.value);
                  });
                }}
                style={done ? { textDecoration: "line-through" } : {}}
              />
            </div>
          ))}
      </div>
    </>
  );
};
