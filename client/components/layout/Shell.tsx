import { useDeckStore } from "../../stores/deck-store";
import { useDeckWebSocket } from "../../hooks/use-websocket";
import { useKeyboard } from "../../hooks/use-keyboard";
import { useProject } from "../../hooks/use-project";
import { useWorkspaces } from "../../hooks/use-workspaces";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Toast } from "../shared/Toast";
import { Home } from "../../pages/Home";
import { CommandCenter } from "../../pages/CommandCenter";
import { History } from "../../pages/History";
import { Settings } from "../../pages/Settings";

export function Shell() {
  const { page, toasts, removeToast } = useDeckStore();
  const { sendJsonMessage } = useDeckWebSocket();
  const { activeWorkspace } = useWorkspaces();
  const { project, loading, rescan } = useProject(activeWorkspace?.path);

  useKeyboard();

  return (
    <div className="flex h-screen bg-deck-bg overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <TopBar project={project} activeWorkspace={activeWorkspace} />

        <div className="flex-1 overflow-hidden">
          {page === "home" && <Home />}
          {page === "command-center" && (
            <CommandCenter
              sendJsonMessage={sendJsonMessage}
              project={project}
              projectLoading={loading}
              rescanProject={rescan}
            />
          )}
          {page === "history" && <History />}
          {page === "settings" && <Settings />}
        </div>
      </div>

      {/* Toasts */}
      {toasts.length > 0 && (
        <Toast message={toasts[toasts.length - 1]} onDismiss={removeToast} />
      )}
    </div>
  );
}
