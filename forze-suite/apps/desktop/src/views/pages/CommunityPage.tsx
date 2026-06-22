import { useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  Check,
  ChevronUp,
  Heart,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {
  computeReputation,
  nextFriday,
  timeAgo,
  useCommunity,
  type BuilderProfile,
  type FeedPost,
  type PostTag,
} from '../../workbench/communityStore';
import { pendoTrack } from '../../lib/pendoTrack';
import { toast } from '../../shell/toast';

const TAGS: PostTag[] = ['build-log', 'showcase', 'launch', 'milestone'];

function tagPill(tag: PostTag): JSX.Element {
  const cls =
    tag === 'showcase' ? 'pill pill--accent'
    : tag === 'launch' ? 'pill pill--ok'
    : tag === 'milestone' ? 'pill pill--warn'
    : 'pill';
  return <span className={cls}>{tag}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

function PostCard({ post }: { post: FeedPost }): JSX.Element {
  const toggleLike = useCommunity((s) => s.toggleLike);
  const deletePost = useCommunity((s) => s.deletePost);
  const addComment = useCommunity((s) => s.addComment);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const send = () => {
    if (!draft.trim()) return;
    addComment(post.id, draft);
    setDraft('');
  };

  return (
    <div className="appcard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="avatar" style={{ borderRadius: '50%' }}>{initials(post.author)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>
            {post.author} <span style={{ color: 'var(--color-text-dim)' }}>{post.handle}</span>
          </div>
          <div className="dim">{timeAgo(post.createdAt)}</div>
        </div>
        {tagPill(post.tag)}
        <button
          type="button"
          title="Delete post"
          onClick={() => deletePost(post.id)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: 4, display: 'inline-flex' }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <p style={{ margin: '12px 0 0', color: 'var(--color-text-muted)', lineHeight: 1.55, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {post.body}
      </p>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)' }}>
        <button
          type="button"
          onClick={() => toggleLike(post.id)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: post.liked ? 'var(--color-danger)' : 'var(--color-text-dim)', padding: 0 }}
        >
          <Heart size={13} fill={post.liked ? 'var(--color-danger)' : 'none'} /> {post.reactions}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: open ? 'var(--color-accent)' : 'var(--color-text-dim)', padding: 0 }}
        >
          <MessageCircle size={13} /> {post.comments.length}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {post.comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 8 }}>
              <span className="avatar" style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 10, flexShrink: 0 }}>{initials(c.author)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--font-size-xs)' }}>
                  <span style={{ color: 'var(--color-text)' }}>{c.author}</span>{' '}
                  <span style={{ color: 'var(--color-text-dim)' }}>· {timeAgo(c.createdAt)}</span>
                </div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
              }}
              rows={1}
              placeholder="Write a comment…"
              style={{ flex: 1, resize: 'vertical', minHeight: 34 }}
            />
            <button className="btn-accent" type="button" onClick={send} disabled={!draft.trim()}>
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommunityPage(): JSX.Element {
  const profile = useCommunity((s) => s.profile);
  const posts = useCommunity((s) => s.posts);
  const launches = useCommunity((s) => s.launches);
  const addPost = useCommunity((s) => s.addPost);
  const submitLaunch = useCommunity((s) => s.submitLaunch);
  const toggleVote = useCommunity((s) => s.toggleVote);
  const deleteLaunch = useCommunity((s) => s.deleteLaunch);
  const setProfile = useCommunity((s) => s.setProfile);

  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<PostTag>('build-log');

  const [launching, setLaunching] = useState(false);
  const [launchName, setLaunchName] = useState('');
  const [launchTagline, setLaunchTagline] = useState('');

  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState<BuilderProfile>(profile);

  const rep = useMemo(() => computeReputation(posts, launches), [posts, launches]);
  const spotlight = useMemo(
    () => [...launches].sort((a, b) => b.votes - a.votes).slice(0, 3),
    [launches],
  );
  const demoDayDate = useMemo(
    () => nextFriday().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  );

  const submitPost = () => {
    if (!body.trim()) return;
    addPost(body, tag);
    pendoTrack('community_post_created', {
      tag,
      body_length: body.trim().length,
    });
    setBody('');
    setComposing(false);
    toast('Posted to your community feed', 'success');
  };

  const submitLaunchForm = () => {
    if (!launchName.trim()) return;
    submitLaunch(launchName, launchTagline);
    pendoTrack('demo_day_launch_submitted', {
      product_name: launchName.trim(),
      has_tagline: !!launchTagline.trim(),
    });
    setLaunchName('');
    setLaunchTagline('');
    setLaunching(false);
    toast('Submitted to Demo Day 🚀', 'success');
  };

  const startEditProfile = () => {
    setDraftProfile(profile);
    setEditingProfile(true);
  };
  const saveProfile = () => {
    setProfile(draftProfile);
    pendoTrack('builder_profile_updated', {
      has_bio: !!draftProfile.bio.trim(),
      handle: draftProfile.handle,
    });
    setEditingProfile(false);
    toast('Builder profile updated', 'success');
  };

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <MessagesSquare size={20} strokeWidth={1.8} /> Community
          </h1>
          <p className="apppage__subtitle">
            Your build logs, showcases, launches — and Demo Day every Friday.
          </p>
        </div>
        <button className="btn-accent" type="button" onClick={() => setComposing((c) => !c)}>
          {composing ? <X size={15} /> : <Send size={15} />}
          {composing ? 'Cancel' : 'New post'}
        </button>
      </div>

      <div className="apppage__body">
        <div className="grid" style={{ gridTemplateColumns: '1fr 320px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {composing && (
              <div className="appcard">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitPost(); }
                  }}
                  rows={3}
                  placeholder="Share a build log, milestone, or launch…"
                  style={{ width: '100%' }}
                  autoFocus
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <select value={tag} onChange={(e) => setTag(e.target.value as PostTag)} style={{ fontSize: 12 }}>
                    {TAGS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    className="btn-accent"
                    type="button"
                    style={{ marginLeft: 'auto' }}
                    onClick={submitPost}
                    disabled={!body.trim()}
                  >
                    <Send size={13} /> Post
                  </button>
                </div>
              </div>
            )}

            {posts.length === 0 && !composing && (
              <div className="appcard" style={{ textAlign: 'center', padding: '32px 20px' }}>
                <Sparkles size={26} style={{ color: 'var(--color-accent)', marginBottom: 10 }} />
                <h3 style={{ margin: '0 0 6px', color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>
                  Start building in public
                </h3>
                <p className="muted" style={{ margin: '0 0 14px' }}>
                  Share your first build log, milestone, or launch. Your reputation grows with every post and reaction.
                </p>
                <button className="btn-accent" type="button" style={{ margin: '0 auto' }} onClick={() => setComposing(true)}>
                  <Send size={13} /> Write your first post
                </button>
              </div>
            )}

            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="appcard">
              <h3 className="appcard__title"><Rocket size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Demo Day</h3>
              <div className="dim" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Calendar size={12} /> {demoDayDate}
              </div>
              <p className="muted" style={{ margin: '0 0 10px' }}>
                {launches.length === 0
                  ? 'No launches submitted yet — be the first.'
                  : `${launches.length} ${launches.length === 1 ? 'product' : 'products'} submitted.`}
              </p>

              {spotlight.map((l, i) => (
                <div className="list-row" key={l.id} style={{ padding: '6px 0', gap: 8 }}>
                  <span className="avatar" style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 11, background: i === 0 ? 'var(--color-warn-soft)' : undefined, color: i === 0 ? 'var(--color-warn)' : undefined }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleVote(l.id)}
                    title={l.voted ? 'Remove vote' : 'Upvote'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', color: l.voted ? 'var(--color-accent)' : 'var(--color-text-dim)', padding: 0, fontSize: 'var(--font-size-xs)' }}
                  >
                    <ChevronUp size={13} /> {l.votes}
                  </button>
                </div>
              ))}

              {launching ? (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    value={launchName}
                    onChange={(e) => setLaunchName(e.target.value)}
                    placeholder="Product name"
                    autoFocus
                    style={{ width: '100%' }}
                  />
                  <input
                    value={launchTagline}
                    onChange={(e) => setLaunchTagline(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitLaunchForm(); }}
                    placeholder="One-line tagline"
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-accent" type="button" style={{ flex: 1, justifyContent: 'center' }} onClick={submitLaunchForm} disabled={!launchName.trim()}>
                      <Rocket size={13} /> Submit
                    </button>
                    <button className="btn-outline" type="button" onClick={() => setLaunching(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn-accent"
                  type="button"
                  style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                  onClick={() => setLaunching(true)}
                >
                  Submit your launch
                </button>
              )}

              {launches.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {launches.map((l) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => toggleVote(l.id)}
                        title={l.voted ? 'Remove vote' : 'Upvote'}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, background: l.voted ? 'var(--color-accent-soft)' : 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: l.voted ? 'var(--color-accent)' : 'var(--color-text-dim)', padding: '3px 6px', flexShrink: 0 }}
                      >
                        <ChevronUp size={13} />
                        <span style={{ fontSize: 11 }}>{l.votes}</span>
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>{l.name}</div>
                        {l.tagline && <div className="dim" style={{ whiteSpace: 'normal' }}>{l.tagline}</div>}
                      </div>
                      <button
                        type="button"
                        title="Withdraw launch"
                        onClick={() => deleteLaunch(l.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: 2 }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="appcard">
              <h3 className="appcard__title"><Trophy size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-warn)' }} />Reputation</h3>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1 }}>
                {rep.total.toLocaleString()}
              </div>
              <div className="dim" style={{ marginBottom: 10 }}>total rep, earned from real activity</div>
              {([
                ['Posts', rep.posts],
                ['Reactions received', rep.reactions],
                ['Comments', rep.comments],
                ['Launches', rep.launches],
                ['Launch votes', rep.votes],
              ] as const).map(([label, value]) => (
                <div className="list-row" key={label} style={{ padding: '5px 0', borderBottom: 'none' }}>
                  <span style={{ flex: 1, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{label}</span>
                  <span className="dim">{value.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="appcard">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h3 className="appcard__title" style={{ margin: 0 }}><Award size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Builder Profile</h3>
                {!editingProfile && (
                  <button type="button" title="Edit profile" onClick={startEditProfile} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: 4 }}>
                    <Pencil size={13} />
                  </button>
                )}
              </div>

              {editingProfile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <input value={draftProfile.name} onChange={(e) => setDraftProfile((p) => ({ ...p, name: e.target.value }))} placeholder="Builder name" />
                  <input value={draftProfile.handle} onChange={(e) => setDraftProfile((p) => ({ ...p, handle: e.target.value }))} placeholder="@handle" />
                  <textarea value={draftProfile.bio} onChange={(e) => setDraftProfile((p) => ({ ...p, bio: e.target.value }))} rows={2} placeholder="Short bio" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-accent" type="button" style={{ flex: 1, justifyContent: 'center' }} onClick={saveProfile}>
                      <Check size={13} /> Save
                    </button>
                    <button className="btn-outline" type="button" onClick={() => setEditingProfile(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
                    <span className="avatar" style={{ borderRadius: '50%' }}>{initials(profile.name)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>{profile.name}</div>
                      <div className="dim">{profile.handle}</div>
                    </div>
                  </div>
                  {profile.bio && <p className="muted" style={{ margin: '0 0 10px' }}>{profile.bio}</p>}
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ color: 'var(--color-text)', fontWeight: 600 }}>{rep.posts}</div>
                      <div className="dim">posts</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text)', fontWeight: 600 }}>{rep.reactions}</div>
                      <div className="dim">reactions</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-text)', fontWeight: 600 }}>{rep.launches}</div>
                      <div className="dim">launches</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
