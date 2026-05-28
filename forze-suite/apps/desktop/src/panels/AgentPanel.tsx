import AgentView from '../views/AgentView';

/**
 * Bottom-panel Agent tab. Shares state with the sidebar AgentView via the
 * Zustand agent store, so messages stream identically in both surfaces.
 */
export default function AgentPanel(): JSX.Element {
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '8px 6px' }}>
      <AgentView />
    </div>
  );
}
