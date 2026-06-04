import { useMemo } from 'react';
import { Network } from 'lucide-react';
import { ROLES } from '../../lib/orchestrator';
import type { ManagedAgent, AgentStatus } from '../../workbench/agentManagerStore';

/**
 * Live orchestration graph for the Agent Manager. Renders the Architect as a
 * central hub delegating to each worker agent, with edges that animate while an
 * agent is working and node rings that reflect live status. It appears the
 * moment a mission is running (any agents exist) and doubles as a navigator —
 * clicking a node opens that agent's detail drawer.
 *
 * Deliberately dependency-free: positions are plain trig and everything is SVG,
 * so it stays crisp at any size and adds nothing to the bundle.
 */

const VIEW_W = 760;
const VIEW_H = 380;
const HUB = { x: VIEW_W / 2, y: VIEW_H / 2, r: 34 };
const NODE_R = 26;

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: 'idle',
  queued: 'queued',
  thinking: 'working',
  done: 'done',
  error: 'error',
  stopped: 'stopped',
};

function isWorking(s: AgentStatus): boolean {
  return s === 'thinking' || s === 'queued';
}

interface Node {
  agent: ManagedAgent;
  x: number;
  y: number;
  initial: string;
  roleLabel: string;
  roleAccent: string;
}

export default function MissionGraph({
  agents,
  activeAgentId,
  onSelect,
}: {
  agents: ManagedAgent[];
  activeAgentId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const nodes = useMemo<Node[]>(() => {
    const n = agents.length;
    // Grow the orbit a little with the team so labels never collide.
    const radius = Math.min(152, 104 + n * 7);
    return agents.map((agent, i) => {
      // Single agent sits to the right; otherwise fan evenly around the hub,
      // starting at the top so the layout reads clockwise.
      const angle = n === 1 ? 0 : -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const role = ROLES[agent.roleId] ?? ROLES.builder;
      return {
        agent,
        x: HUB.x + radius * Math.cos(angle),
        y: HUB.y + radius * Math.sin(angle),
        initial: role.label.charAt(0).toUpperCase(),
        roleLabel: role.label,
        roleAccent: role.accent,
      };
    });
  }, [agents]);

  const done = agents.filter((a) => a.status === 'done').length;
  const working = agents.filter((a) => isWorking(a.status)).length;
  const total = agents.length || 1;

  // Hub progress ring (fraction complete).
  const ringR = HUB.r + 7;
  const ringC = 2 * Math.PI * ringR;
  const progress = done / total;

  return (
    <div className="appcard mgraph">
      <div className="mgraph__head">
        <h3 className="appcard__title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Network size={15} /> Mission graph
        </h3>
        <span className={`mgraph__live ${working > 0 ? 'is-on' : ''}`}>
          <span className="mgraph__live-dot" />
          {working > 0 ? `${working} working` : `${done}/${agents.length} done`}
        </span>
      </div>

      <svg
        className="mgraph__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Orchestration graph of the Architect and worker agents"
      >
        {/* edges first, so nodes sit on top */}
        {nodes.map((node) => {
          const active = isWorking(node.agent.status);
          const isDone = node.agent.status === 'done';
          return (
            <g key={`edge-${node.agent.id}`}>
              <line
                className="mgraph__edge"
                data-active={active ? 'true' : undefined}
                data-done={isDone ? 'true' : undefined}
                x1={HUB.x}
                y1={HUB.y}
                x2={node.x}
                y2={node.y}
              />
              {active && (
                <circle className="mgraph__packet" r={3.2}>
                  <animateMotion
                    dur="1.5s"
                    repeatCount="indefinite"
                    path={`M ${HUB.x} ${HUB.y} L ${node.x} ${node.y}`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* hub: the Architect */}
        <g className="mgraph__hub">
          <circle className="mgraph__hub-bg" cx={HUB.x} cy={HUB.y} r={HUB.r} />
          <circle
            className="mgraph__hub-ring-bg"
            cx={HUB.x}
            cy={HUB.y}
            r={ringR}
            style={{ strokeDasharray: ringC }}
          />
          <circle
            className="mgraph__hub-ring"
            cx={HUB.x}
            cy={HUB.y}
            r={ringR}
            style={{
              strokeDasharray: ringC,
              strokeDashoffset: ringC * (1 - progress),
              transform: `rotate(-90deg)`,
              transformOrigin: `${HUB.x}px ${HUB.y}px`,
            }}
          />
          <text className="mgraph__hub-label" x={HUB.x} y={HUB.y - 4} textAnchor="middle">
            Architect
          </text>
          <text className="mgraph__hub-count" x={HUB.x} y={HUB.y + 11} textAnchor="middle">
            {done}/{agents.length}
          </text>
        </g>

        {/* worker nodes */}
        {nodes.map((node) => {
          const { agent } = node;
          const selected = agent.id === activeAgentId;
          return (
            <g
              key={node.agent.id}
              className="mgraph__node"
              data-status={agent.status}
              data-selected={selected ? 'true' : undefined}
              transform={`translate(${node.x} ${node.y})`}
              onClick={() => onSelect(agent.id)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(agent.id);
                }
              }}
            >
              <title>
                {`${agent.title} · ${node.roleLabel} · ${STATUS_TEXT[agent.status]}`}
              </title>
              {isWorking(agent.status) && <circle className="mgraph__node-pulse" r={NODE_R + 6} />}
              <circle className="mgraph__node-ring" r={NODE_R} />
              <circle className="mgraph__node-roledot" cx={NODE_R - 6} cy={-(NODE_R - 6)} r={4} style={{ fill: node.roleAccent }} />
              <text className="mgraph__node-initial" y={1} textAnchor="middle">
                {agent.status === 'done' ? '✓' : agent.status === 'error' ? '!' : node.initial}
              </text>
              <text className="mgraph__node-label" y={NODE_R + 16} textAnchor="middle">
                {node.roleLabel}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mgraph__legend">
        <span><i className="mgraph__key is-working" /> working</span>
        <span><i className="mgraph__key is-done" /> done</span>
        <span><i className="mgraph__key is-queued" /> queued</span>
        <span><i className="mgraph__key is-error" /> error</span>
        <span className="mgraph__legend-hint">click a node to inspect</span>
      </div>
    </div>
  );
}
