import { useEffect, useState } from 'react';
import { useProject } from './projectStore';
import {
  computeWorkspaceMetrics,
  type WorkspaceMetrics,
} from '../lib/projectMetrics';

/** Session cache so switching between Dashboard/Analytics doesn't re-walk. */
let cache: { root: string; metrics: WorkspaceMetrics } | null = null;

export function useWorkspaceMetrics(): {
  metrics: WorkspaceMetrics | null;
  loading: boolean;
} {
  const root = useProject((s) => s.workspaceRoot);
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(
    cache && cache.root === root ? cache.metrics : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!root) {
      setMetrics(null);
      return;
    }
    if (cache && cache.root === root) {
      setMetrics(cache.metrics);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void computeWorkspaceMetrics(root)
      .then((m) => {
        if (cancelled) return;
        cache = { root, metrics: m };
        setMetrics(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

  return { metrics, loading };
}
