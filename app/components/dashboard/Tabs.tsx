"use client";

import { ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

export default function Tabs({ tabs, activeTab, onTabChange, children }: TabsProps) {
  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="border-b-2 border-gray-200 dark:border-gray-700 mb-8 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-t-xl p-2">
        <nav className="flex space-x-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  group relative flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg transition-all whitespace-nowrap
                  transform hover:scale-105 active:scale-95
                  ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/50"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                  }
                `}
              >
                <span className={`text-xl transition-transform ${isActive ? "scale-110" : ""}`}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`
                      px-2 py-0.5 text-xs font-bold rounded-full min-w-[20px] text-center
                      ${
                        isActive
                          ? "bg-white/30 text-white backdrop-blur-sm"
                          : "bg-red-500 text-white"
                      }
                    `}
                  >
                    {tab.badge}
                  </span>
                )}
                {isActive && (
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-1/2 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in min-h-[400px]">{children}</div>
    </div>
  );
}
