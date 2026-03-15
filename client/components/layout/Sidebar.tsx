import { useDeckStore } from "../../stores/deck-store";
import type { Page } from "../../stores/deck-store";

const NAV_ITEMS: { page: Page; label: string; icon: JSX.Element }[] = [
  {
    page: "home",
    label: "Home",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    page: "command-center",
    label: "Command Center",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    page: "history",
    label: "History",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    page: "settings",
    label: "Settings",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const { page, setPage, sidebarCollapsed, toggleSidebar, isConnected, goHome } =
    useDeckStore();

  const handleNav = (target: Page) => {
    if (target === "home") {
      goHome();
    } else {
      setPage(target);
    }
  };

  return (
    <div
      className={`shrink-0 bg-deck-surface border-r border-deck-border flex flex-col transition-all duration-200 ${
        sidebarCollapsed ? "w-12" : "w-[200px]"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-2.5 py-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-deck-accent text-white shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        {!sidebarCollapsed && (
          <span className="text-xs font-semibold text-deck-text-bright truncate">
            Agent Deck
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5 px-1.5 mt-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.page}
            onClick={() => handleNav(item.page)}
            className={`flex items-center gap-2.5 rounded-md transition-colors ${
              sidebarCollapsed ? "justify-center px-0 py-2" : "px-2.5 py-2"
            } ${
              page === item.page
                ? "bg-deck-surface-2 text-deck-text-bright"
                : "text-deck-text-dim hover:text-deck-text hover:bg-deck-surface-2/50"
            }`}
            title={sidebarCollapsed ? item.label : undefined}
          >
            {item.icon}
            {!sidebarCollapsed && (
              <span className="text-xs font-medium truncate">{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-1.5 pb-3 flex flex-col gap-2">
        {/* Connection indicator */}
        <div
          className={`flex items-center gap-2 ${sidebarCollapsed ? "justify-center" : "px-2.5"}`}
        >
          <span
            className={`block w-2 h-2 rounded-full shrink-0 ${
              isConnected ? "bg-deck-success" : "bg-deck-error animate-pulse-dot"
            }`}
            title={isConnected ? "Connected" : "Disconnected"}
          />
          {!sidebarCollapsed && (
            <span className="text-[10px] text-deck-text-dim">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center py-1.5 rounded-md text-deck-text-dim hover:text-deck-text hover:bg-deck-surface-2/50 transition-colors"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            className={`w-4 h-4 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
