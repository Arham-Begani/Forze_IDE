import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJSONStorage } from './debouncedStorage';
import { ads, type Ad } from './appData';

/**
 * State for the Ad Studio — real, persisted ad campaigns the user creates,
 * generates copy/visuals for, launches, pauses, and measures. The static demo
 * `ads` array seeds the store on first run so the table is never empty; from
 * then on everything lives here and survives reloads.
 *
 * Persistence note: generated visuals are stored as base64 data URLs which can
 * be large. We use the quota-safe debounced storage (shared with the chat
 * stores) so a write that exceeds the ~5MB localStorage budget is dropped
 * rather than crashing the webview.
 */

export type CampaignFormat = Ad['format'];
export type CampaignStatus = Ad['status'];

export interface Creative {
  headline: string;
  body: string;
  cta: string;
}

export interface Campaign {
  id: string;
  name: string;
  format: CampaignFormat;
  channel: string;
  status: CampaignStatus;
  impressions: number;
  clicks: number;
  spend: number;
  /** Per-campaign budget ceiling in dollars. */
  budget: number;
  /** Saved ad copy variants. */
  creatives: Creative[];
  /** Generated ad visual as a data URL, if any. */
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NewCampaignInput {
  name: string;
  format: CampaignFormat;
  channel: string;
  budget: number;
  creatives?: Creative[];
  imageUrl?: string;
}

interface AdStudioState {
  campaigns: Campaign[];
  /** Monthly ad budget the spend card measures against. */
  monthlyBudget: number;

  addCampaign: (input: NewCampaignInput) => string;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  /** Move a campaign through draft → live → paused. */
  cycleStatus: (id: string) => void;
  setStatus: (id: string, status: CampaignStatus) => void;
  removeCampaign: (id: string) => void;
  setMonthlyBudget: (value: number) => void;
}

/** Seed campaigns from the demo data so the studio is populated on first run. */
function seedCampaigns(): Campaign[] {
  const now = Date.now();
  const channelFor: Record<string, string> = {
    a1: 'Twitter / X',
    a2: 'Indie Hackers',
    a3: 'YouTube',
    a4: 'Reddit',
  };
  return ads.map((a, i) => ({
    id: a.id,
    name: a.name,
    format: a.format,
    channel: channelFor[a.id] ?? 'Twitter / X',
    status: a.status,
    impressions: a.impressions,
    clicks: a.clicks,
    spend: a.spend,
    budget: a.spend > 0 ? Math.ceil((a.spend * 2) / 10) * 10 : 100,
    creatives: [],
    createdAt: now - (ads.length - i) * 86_400_000,
    updatedAt: now - (ads.length - i) * 86_400_000,
  }));
}

const STATUS_ORDER: CampaignStatus[] = ['draft', 'live', 'paused'];

export const useAdStudio = create<AdStudioState>()(
  persist(
    (set) => ({
      campaigns: seedCampaigns(),
      monthlyBudget: 1000,

      addCampaign: (input) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const campaign: Campaign = {
          id,
          name: input.name.trim() || 'Untitled campaign',
          format: input.format,
          channel: input.channel,
          status: 'draft',
          impressions: 0,
          clicks: 0,
          spend: 0,
          budget: Math.max(0, Math.round(input.budget)) || 100,
          creatives: input.creatives ?? [],
          imageUrl: input.imageUrl,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ campaigns: [campaign, ...state.campaigns] }));
        return id;
      },

      updateCampaign: (id, patch) =>
        set((state) => ({
          campaigns: state.campaigns.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
          ),
        })),

      cycleStatus: (id) =>
        set((state) => ({
          campaigns: state.campaigns.map((c) => {
            if (c.id !== id) return c;
            const next =
              STATUS_ORDER[(STATUS_ORDER.indexOf(c.status) + 1) % STATUS_ORDER.length]!;
            return { ...c, status: next, updatedAt: Date.now() };
          }),
        })),

      setStatus: (id, status) =>
        set((state) => ({
          campaigns: state.campaigns.map((c) =>
            c.id === id ? { ...c, status, updatedAt: Date.now() } : c,
          ),
        })),

      removeCampaign: (id) =>
        set((state) => ({ campaigns: state.campaigns.filter((c) => c.id !== id) })),

      setMonthlyBudget: (value) =>
        set({ monthlyBudget: Math.max(0, Math.round(value)) || 0 }),
    }),
    {
      name: 'forze.adStudio.v1',
      storage: debouncedJSONStorage(800),
      partialize: (state) => ({
        campaigns: state.campaigns,
        monthlyBudget: state.monthlyBudget,
      }),
    },
  ),
);

/** Total spend across all campaigns. */
export function totalSpend(campaigns: Campaign[]): number {
  return campaigns.reduce((sum, c) => sum + c.spend, 0);
}

/** Spend grouped by channel, descending. */
export function spendByChannel(campaigns: Campaign[]): { channel: string; spend: number }[] {
  const map = new Map<string, number>();
  for (const c of campaigns) {
    map.set(c.channel, (map.get(c.channel) ?? 0) + c.spend);
  }
  return [...map.entries()]
    .map(([channel, spend]) => ({ channel, spend }))
    .sort((a, b) => b.spend - a.spend);
}
