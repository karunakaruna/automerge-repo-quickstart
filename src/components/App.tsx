import automergeLogo from "/automerge.png";
import "@picocss/pico/css/pico.min.css";
import { isValidAutomergeUrl, type AutomergeUrl } from "@automerge/react";
import { TaskList } from "./TaskList";
import { DocumentList } from "./DocumentList";
import { useHash } from "react-use";
import { SyncControls } from "./SyncControls";
import ConnectionStatus from "./ConnectionStatus";

function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const [hash, setHash] = useHash();
  const cleanHash = hash.slice(1); // Remove the leading '#'
  const selectedDocUrl =
    cleanHash && isValidAutomergeUrl(cleanHash)
      ? (cleanHash as AutomergeUrl)
      : null;

  // Helpers to surface useful information to the user
  const rootId = docUrl.replace(/^automerge:/, "");
  const selectedId = selectedDocUrl ? selectedDocUrl.replace(/^automerge:/, "") : "";
  const syncServer = "ws://localhost:3030"; // matches configuration in src/main.tsx

  return (
    <>
      <header>
        <h1>
          <img src={automergeLogo} alt="Automerge logo" id="automerge-logo" />
          Automerge Task List
        </h1>
      </header>

      <main>
        <div className="document-list">
          <DocumentList
            docUrl={docUrl}
            onSelectDocument={(url) => {
              if (url) {
                setHash(url);
              } else {
                setHash("");
              }
            }}
            selectedDocument={selectedDocUrl}
          />
        </div>
        <div className="task-list">
          {selectedDocUrl ? <TaskList docUrl={selectedDocUrl} /> : null}
        </div>
      </main>

      <footer>
        {/* Doc Info Panel */}
        <article style={{ marginBottom: "0.75rem" }}>
          <header>
            <strong>Doc Info</strong>
          </header>
          <small>
            <div>
              <strong>Root URL:</strong> <code>{docUrl}</code>
            </div>
            <div>
              <strong>Root ID:</strong> <code>{rootId}</code>
            </div>
            <div>
              <strong>Selected URL:</strong>{" "}
              <code>{selectedDocUrl ?? "(none)"}</code>
            </div>
            <div>
              <strong>Selected ID:</strong> <code>{selectedId || "—"}</code>
            </div>
            <div>
              <strong>Sync server:</strong> <code>{syncServer}</code>
            </div>
          </small>
        </article>

        {/* Connection status & metrics */}
        <ConnectionStatus />

        <SyncControls docUrl={docUrl} />
        <p className="footer-copy">
          Powered by Automerge + Vite + React + TypeScript
        </p>
      </footer>
    </>
  );
}

export default App;
