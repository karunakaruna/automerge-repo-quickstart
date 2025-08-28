import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App.tsx";
import "./index.css";

import {
  Repo,
  BroadcastChannelNetworkAdapter,
  WebSocketClientAdapter,
  IndexedDBStorageAdapter,
  RepoContext,
  DocHandle,
} from "@automerge/react";
import { getOrCreateRoot, RootDocument } from "./rootDoc.ts";

// Create the WebSocket adapter separately so we can expose it for diagnostics
const wsAdapter = new WebSocketClientAdapter("ws://localhost:3030");

const repo = new Repo({
  network: [
    new BroadcastChannelNetworkAdapter(),
    wsAdapter,
  ],
  storage: new IndexedDBStorageAdapter(),
});

// Add the repo to the global window object so it can be accessed in the browser console
// This is useful for debugging and testing purposes.
declare global {
  interface Window {
    repo: Repo;
    wsAdapter: any;
    // We also add the handle to the global window object for debugging
    handle: DocHandle<RootDocument>;
  }
}
window.repo = repo;
// Expose adapter for status UI (shape is not part of public API, hence any)
window.wsAdapter = wsAdapter as any;

// Depending if we have an AutomergeUrl, either find or create the document
const rootDocUrl = getOrCreateRoot(repo);
window.handle = await repo.find(rootDocUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div>Loading a document...</div>}>
      <RepoContext.Provider value={repo}>
        <App docUrl={window.handle.url} />
      </RepoContext.Provider>
    </Suspense>
  </React.StrictMode>,
);
