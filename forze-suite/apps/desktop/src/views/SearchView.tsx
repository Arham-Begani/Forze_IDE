import { Search } from 'lucide-react';

export default function SearchView(): JSX.Element {
  return (
    <div className="placeholder-view">
      <Search size={28} strokeWidth={1.4} />
      <h3>Workspace search</h3>
      <p>
        Phase 2 ships ripgrep-backed search across the active project.
      </p>
    </div>
  );
}
