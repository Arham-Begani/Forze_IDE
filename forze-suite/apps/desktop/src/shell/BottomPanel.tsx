import { ChevronDown, X } from 'lucide-react';
import { useWorkbench, type BottomPanelTab } from '../workbench/store';
import TerminalPanel from '../panels/TerminalPanel';
import ProblemsPanel from '../panels/ProblemsPanel';
import OutputPanel from '../panels/OutputPanel';
import AgentPanel from '../panels/AgentPanel';

interface BottomPanelProps {
  logs: string[];
  onClearLogs: () => void;
}

const TABS: { id: BottomPanelTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'agent', label: 'Agent' },
];

export default function BottomPanel({ logs, onClearLogs }: BottomPanelProps): JSX.Element {
  const activeTab = useWorkbench((s) => s.bottomPanelTab);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);
  const toggleBottomPanel = useWorkbench((s) => s.toggleBottomPanel);

  return (
    <div className="bottom-panel">
      <div className="bottom-panel__tabs" role="tablist" aria-label="Panel tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`bottom-panel__tab ${activeTab === tab.id ? 'is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setBottomPanelTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div className="bottom-panel__actions">
          {activeTab === 'output' && (
            <button
              type="button"
              className="bottom-panel__icon-btn"
              onClick={onClearLogs}
              title="Clear output"
              aria-label="Clear output"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            className="bottom-panel__icon-btn"
            onClick={toggleBottomPanel}
            title="Hide panel"
            aria-label="Hide panel"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <div className="bottom-panel__body" role="tabpanel" aria-label={activeTab}>
        {activeTab === 'terminal' && <TerminalPanel />}
        {activeTab === 'problems' && <ProblemsPanel />}
        {activeTab === 'output' && <OutputPanel logs={logs} />}
        {activeTab === 'agent' && <AgentPanel />}
      </div>
    </div>
  );
}
