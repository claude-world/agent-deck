/**
 * Home - Project overview dashboard.
 * Shows workspace grid with add/remove/select functionality.
 */

import { useState } from "react";
import { useWorkspaces } from "../hooks/use-workspaces";
import { ProjectCard } from "../components/home/ProjectCard";
import { AddProjectModal } from "../components/home/AddProjectModal";

export function Home() {
  const { workspaces, loading, addWorkspace, removeWorkspace, renameWorkspace, selectWorkspace } =
    useWorkspaces();
  const [showAddModal, setShowAddModal] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-deck-muted text-xs">
        Loading projects...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base font-semibold text-deck-text-bright">Projects</h1>
            <p className="text-xs text-deck-text-dim mt-0.5">
              Select a project to start a mission
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Project
          </button>
        </div>

        {/* Grid */}
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-deck-surface-2 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-deck-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-deck-text-dim mb-1">No projects yet</p>
            <p className="text-xs text-deck-muted mb-4">
              Add a project directory to get started
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-xs font-medium bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover transition-colors"
            >
              Add Your First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {workspaces.map((ws) => (
              <ProjectCard
                key={ws.id}
                workspace={ws}
                onSelect={selectWorkspace}
                onRemove={removeWorkspace}
                onRename={renameWorkspace}
              />
            ))}

            {/* Add card */}
            <button
              onClick={() => setShowAddModal(true)}
              className="border-2 border-dashed border-deck-border rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-deck-text-dim hover:border-deck-accent/40 hover:text-deck-accent transition-colors min-h-[120px]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs">Add Project</span>
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddProjectModal
          onAdd={addWorkspace}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
