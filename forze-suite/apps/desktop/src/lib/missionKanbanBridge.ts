/**
 * Bridges a running mission onto the Kanban board. When the Architect's plan is
 * spawned, it drops one linked card per agent in the "to do" column, then
 * subscribes to the agent-manager store and slides each card across columns as
 * its agent moves queued → thinking → done. Because it watches the store (not
 * the runner), cards also track status changes the user triggers from the Agent
 * Manager page (Stop / Re-run) — true live sync regardless of who drove it.
 *
 * The subscription unsubscribes itself once every tracked agent is terminal.
 */
import type { MissionMirror } from './missionRunner';
import { useAgentManager, type AgentStatus } from '../workbench/agentManagerStore';
import { useKanban, resolveLane, type LaneBucket } from '../workbench/kanbanStore';

const TERMINAL: AgentStatus[] = ['done', 'error', 'stopped'];

/** Map an agent's lifecycle status to the coarse column it belongs in. */
function statusBucket(status: AgentStatus): LaneBucket {
  if (status === 'thinking') return 'doing';
  if (TERMINAL.includes(status)) return 'done';
  return 'todo'; // idle | queued
}

export function missionKanbanBridge(): MissionMirror {
  return {
    onPlan(missionId, agents) {
      const cardByAgent = new Map<string, string>();
      for (const a of agents) {
        const laneId = resolveLane('todo');
        if (!laneId) continue; // board has no lanes — skip mirroring gracefully
        const cardId = useKanban.getState().addLinkedCard({
          title: a.title,
          laneId,
          agentId: a.agentId,
          missionId,
          label: 'AI',
        });
        cardByAgent.set(a.agentId, cardId);
      }
      if (cardByAgent.size === 0) return;

      const tracked = new Set(cardByAgent.keys());
      // Where each card currently sits, so we only move on an actual transition.
      const lastBucket = new Map<string, LaneBucket>();
      for (const id of tracked) lastBucket.set(id, 'todo');

      const unsub = useAgentManager.subscribe((state) => {
        let allTerminal = true;
        for (const agentId of tracked) {
          const agent = state.agents.find((a) => a.id === agentId);
          if (!agent) continue;
          if (!TERMINAL.includes(agent.status)) allTerminal = false;

          const bucket = statusBucket(agent.status);
          if (lastBucket.get(agentId) === bucket) continue;
          lastBucket.set(agentId, bucket);

          const cardId = cardByAgent.get(agentId);
          const laneId = resolveLane(bucket);
          if (cardId && laneId) useKanban.getState().moveCard(cardId, laneId, null);
        }
        if (allTerminal) unsub();
      });
    },
  };
}
