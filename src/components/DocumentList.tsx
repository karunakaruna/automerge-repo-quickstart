import React, { useState } from "react";
import { useDocument, AutomergeUrl, useRepo } from "@automerge/react";
import { initTaskList, TaskList } from "./TaskList";

import { RootDocument } from "../rootDoc";
import { useEffect } from "react";

export const DocumentList: React.FC<{
  docUrl: AutomergeUrl;
  selectedDocument: AutomergeUrl | null;
  onSelectDocument: (docUrl: AutomergeUrl | null) => void;
}> = ({ docUrl, selectedDocument, onSelectDocument }) => {
  const repo = useRepo();
  const [doc, changeDoc] = useDocument<RootDocument>(docUrl, {
    suspense: true,
  });

  useEffect(() => {
    changeDoc((d) => {
      if (selectedDocument && !d.taskLists.includes(selectedDocument)) {
        // If the selected document is not in the list, add it
        d.taskLists.push(selectedDocument);
      }
    });
  }, [selectedDocument, changeDoc]);

  const handleNewDocument = () => {
    const newTaskList = repo.create<TaskList>(initTaskList());
    changeDoc((d) => d.taskLists.push(newTaskList.url));
    onSelectDocument(newTaskList.url);
  };

  const handleNewProtectedDocument = async () => {
    try {
      const docPassword = window.prompt(
        "Enter a password for this protected task list (you'll need it to edit)",
      );
      if (!docPassword) return;

      const adminPassword = window.prompt(
        "Admin password (to set protection on the sync server)",
      );
      if (!adminPassword) return;

      // 1) Create the document locally first to get its URL/ID
      const newTaskList = repo.create<TaskList>(initTaskList());
      const url = newTaskList.url; // e.g., automerge:<docId>
      const docId = url.replace(/^automerge:/, "");

      // 2) Authenticate to the sync server (sets amrg_auth cookie)
      const base = "http://localhost:3030";
      let res = await fetch(`${base}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: adminPassword }),
      });
      if (!res.ok) {
        window.alert("Admin login failed");
        return;
      }

      // 3) Protect the document with the provided password
      res = await fetch(`${base}/docs/${encodeURIComponent(docId)}/protect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: docPassword }),
      });
      if (!res.ok) {
        window.alert("Failed to protect document on server");
        return;
      }

      // 4) Add to root and select (editing will require unlocking)
      changeDoc((d) => d.taskLists.push(url));
      onSelectDocument(url);
    } catch (e) {
      console.error(e);
      window.alert("Failed to create protected list");
    }
  };

  // Track protection status per doc for lock icon
  const [statuses, setStatuses] = useState<Record<string, { protected: boolean; canWrite: boolean }>>({});
  const base = "http://localhost:3030";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { protected: boolean; canWrite: boolean }> = {};
      for (const u of doc.taskLists) {
        const id = u.replace(/^automerge:/, "");
        try {
          const res = await fetch(`${base}/docs/${encodeURIComponent(id)}/status`, {
            credentials: "include",
          });
          if (!res.ok) throw new Error("status");
          const json = await res.json();
          next[u] = { protected: !!json.protected, canWrite: !!json.canWrite };
        } catch {
          next[u] = { protected: false, canWrite: true };
        }
      }
      if (!cancelled) setStatuses(next);
    })();
    return () => { cancelled = true };
  }, [JSON.stringify(doc.taskLists)]);

  return (
    <div className="document-list">
      <div className="documents">
        {doc.taskLists.map((docUrl) => (
          <div
            key={docUrl}
            className={`document-item ${docUrl === selectedDocument ? "active" : ""}`}
            onClick={() => onSelectDocument(docUrl)}
          >
            <span style={{ marginRight: 6 }}>
              {statuses[docUrl]?.protected ? "🔒" : ""}
            </span>
            <DocumentTitle docUrl={docUrl} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={handleNewDocument}>+ Task List</button>
        <button onClick={handleNewProtectedDocument}>+ Protected Task List</button>
      </div>
    </div>
  );
};

// Component to display document title
const DocumentTitle: React.FC<{ docUrl: AutomergeUrl }> = ({ docUrl }) => {
  const [doc] = useDocument<TaskList>(docUrl, { suspense: true });

  // Get the first task's title or use a default
  const title = doc.title || "Untitled Task List";
  return <div>{title}</div>;
};
