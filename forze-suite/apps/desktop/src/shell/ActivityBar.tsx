import {
  Files,
  Search,
  GitBranch,
  Bot,
  Megaphone,
  Sparkles,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useWorkbench, type ActivityId } from '../workbench/store';

interface Item {
  id: ActivityId;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const PRIMARY: Item[] = [
  { id: 'explorer', label: 'Files', icon: Files, hint: 'Ctrl+Shift+E' },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'source-control', label: 'Source Control', icon: GitBranch, hint: 'Ctrl+Shift+G' },
  { id: 'agents', label: 'Agents', icon: Bot, hint: 'Ctrl+Shift+A' },
  { id: 'social', label: 'Social', icon: Megaphone },
  { id: 'vibe', label: 'Vibe Canvas', icon: Sparkles },
  { id: 'security', label: 'Security', icon: ShieldCheck },
];

const SECONDARY: Item[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function ActivityBar(): JSX.Element {
  const activeActivity = useWorkbench((s) => s.activeActivity);
  const sidebarVisible = useWorkbench((s) => s.sidebarVisible);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const isActive = activeActivity === item.id && sidebarVisible;
    return (
      <button
        key={item.id}
        type="button"
        className={`rail__item ${isActive ? 'is-active' : ''}`}
        onClick={() => setActiveActivity(item.id)}
        aria-label={item.label}
      >
        <Icon size={17} strokeWidth={1.6} />
        <span className="rail__tooltip">
          {item.label}
          {item.hint ? ` · ${item.hint}` : ''}
        </span>
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="Activity">
      {PRIMARY.map(renderItem)}
      <div className="rail__spacer" />
      {SECONDARY.map(renderItem)}
    </nav>
  );
}
