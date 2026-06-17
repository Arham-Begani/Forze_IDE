/**
 * Sync layer: local (zustand/disk) ⇄ cloud (Supabase). Only METADATA and AI
 * conversation text/metadata are mirrored to the cloud — never source code or
 * file contents (see the project's privacy promise). Local state stays the
 * source of truth for anything on disk; these helpers just persist the bits
 * that should survive a reinstall or appear on a second machine.
 *
 * Every write is scoped to the signed-in user; RLS (auth.uid() = user_id)
 * enforces that on the server regardless of what we send.
 */
import { supabase, supabaseConfigured } from './supabase';
import { currentUserId } from '../workbench/authStore';
import { useCloud } from '../workbench/cloudStore';

export interface CloudProject {
  id: string;
  user_id: string;
  name: string;
  local_path: string | null;
  git_remote: string | null;
  color: string | null;
  icon: string | null;
  archived: boolean;
  last_opened_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CloudConversation {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  agent: string | null;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CloudMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata: Record<string, unknown>;
  created_at?: string;
}

/** True when there is both a configured project and a signed-in user. */
function canSync(): boolean {
  return supabaseConfigured && !!currentUserId();
}

export interface ProjectInput {
  name: string;
  localPath?: string | null;
  gitRemote?: string | null;
  icon?: string;
  color?: string | null;
}

/**
 * Upsert the project's metadata. When the repo has a git remote we dedupe on
 * `(user_id, git_remote)` (the partial unique index) so the same repo opened on
 * a second machine reuses one row. Without a remote, that index doesn't apply,
 * so we dedupe on the local path by hand to avoid piling up rows on every open.
 */
export async function syncProject(p: ProjectInput): Promise<CloudProject | null> {
  const uid = currentUserId();
  if (!canSync() || !uid) return null;

  const row = {
    user_id: uid,
    name: p.name,
    local_path: p.localPath ?? null,
    git_remote: p.gitRemote ?? null,
    icon: p.icon ?? '🚀',
    color: p.color ?? null,
    last_opened_at: new Date().toISOString(),
  };

  try {
    if (row.git_remote) {
      const { data, error } = await supabase
        .from('ide_projects')
        .upsert(row, { onConflict: 'user_id,git_remote' })
        .select()
        .single();
      if (error) throw error;
      if (data) useCloud.getState().upsertProject(data as CloudProject);
      return (data as CloudProject) ?? null;
    }

    const { data: existing } = await supabase
      .from('ide_projects')
      .select('id')
      .eq('user_id', uid)
      .eq('local_path', row.local_path)
      .limit(1)
      .maybeSingle();

    const query = existing?.id
      ? supabase
          .from('ide_projects')
          .update({ name: row.name, last_opened_at: row.last_opened_at })
          .eq('id', existing.id)
      : supabase.from('ide_projects').insert(row);

    const { data, error } = await query.select().single();
    if (error) throw error;
    if (data) useCloud.getState().upsertProject(data as CloudProject);
    return (data as CloudProject) ?? null;
  } catch (err) {
    console.warn('[forze] syncProject failed', err);
    return null;
  }
}

/** Create a new conversation thread; returns its id (null if sync is off). */
export async function createConversation(init: {
  title?: string;
  agent?: string;
  projectId?: string | null;
}): Promise<string | null> {
  const uid = currentUserId();
  if (!canSync() || !uid) return null;
  try {
    const { data, error } = await supabase
      .from('ide_conversations')
      .insert({
        user_id: uid,
        project_id: init.projectId ?? null,
        title: init.title ?? 'New conversation',
        agent: init.agent ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return (data as CloudConversation)?.id ?? null;
  } catch (err) {
    console.warn('[forze] createConversation failed', err);
    return null;
  }
}

/**
 * Append a message to a conversation. `metadata` must stay to references only
 * (model, token counts, path/line pointers) — never file contents.
 */
export async function appendMessage(
  conversationId: string,
  m: {
    role: CloudMessage['role'];
    content: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const uid = currentUserId();
  if (!canSync() || !uid) return;
  try {
    const { error } = await supabase.from('ide_messages').insert({
      user_id: uid,
      conversation_id: conversationId,
      role: m.role,
      content: m.content,
      metadata: m.metadata ?? {},
    });
    if (error) throw error;
    // Bump the thread so it sorts to the top on the next pull.
    await supabase
      .from('ide_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
  } catch (err) {
    console.warn('[forze] appendMessage failed', err);
  }
}

/** Pull the (unarchived) project list + conversation threads for the sidebar. */
export async function pullWorkspace(): Promise<{
  projects: CloudProject[];
  conversations: CloudConversation[];
}> {
  if (!canSync()) return { projects: [], conversations: [] };
  const [{ data: projects }, { data: conversations }] = await Promise.all([
    supabase
      .from('ide_projects')
      .select('*')
      .eq('archived', false)
      .order('last_opened_at', { ascending: false }),
    supabase
      .from('ide_conversations')
      .select('*')
      .eq('archived', false)
      .order('updated_at', { ascending: false }),
  ]);
  return {
    projects: (projects as CloudProject[]) ?? [],
    conversations: (conversations as CloudConversation[]) ?? [],
  };
}

/** Load every message in a thread, oldest first. */
export async function pullMessages(
  conversationId: string,
): Promise<CloudMessage[]> {
  if (!canSync()) return [];
  const { data } = await supabase
    .from('ide_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  return (data as CloudMessage[]) ?? [];
}
