import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import {
  AdminPageHeader, AdminStatGrid, AdminStatCard, AdminToolbar,
  AdminTableCard, AdminLoadingState, AdminEmptyState,
} from '@/components/admin/AdminPagePrimitives'
import { adminTableClassName } from '@/components/admin/adminPageUtils'
import {
  useAuthorPosts, useCreatePost, useUpdatePost, usePublishPost, useArchivePost,
  useTakedownPost, type AuthorPost, type AuthorPostInput, type AuthorPostStatus,
} from '@/hooks/useAuthoring'
import { useMyStorefront, useMyEntitlements } from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  Archive, CalendarClock, FileText, PenLine, Plus, Send, ShieldOff, Store, User2,
} from 'lucide-react'

const STATUS_TABS: { label: string; value: AuthorPostStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Drafts', value: 'draft' },
  { label: 'In review', value: 'in_review' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
  { label: 'Removed', value: 'removed' },
]

const STATUS_LABELS: Record<AuthorPostStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
  removed: 'Removed',
}

const statusVariant: Record<AuthorPostStatus, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  draft: 'muted',
  in_review: 'warning',
  scheduled: 'warning',
  published: 'success',
  archived: 'muted',
  removed: 'danger',
}

interface PostForm {
  title: string
  excerpt: string
  content: string
  coverImage: string
  tags: string
  seoTitle: string
  seoDescription: string
  canonicalUrl: string
  scheduledFor: string
  attachToStorefront: boolean
}

const EMPTY_FORM: PostForm = {
  title: '', excerpt: '', content: '', coverImage: '', tags: '',
  seoTitle: '', seoDescription: '', canonicalUrl: '', scheduledFor: '',
  attachToStorefront: true,
}

/** `datetime-local` speaks local wall-clock time, so an ISO instant has to be
 *  shifted out of UTC before it can be shown in the input. */
function toLocalInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const offset = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

function formToState(post: AuthorPost): PostForm {
  return {
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    coverImage: post.coverImage ?? '',
    tags: post.tags.join(', '),
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    canonicalUrl: post.canonicalUrl ?? '',
    scheduledFor: toLocalInput(post.scheduledFor),
    attachToStorefront: Boolean(post.storefrontId),
  }
}

/** Empty optional fields are dropped, not sent blank: the server validates
 *  coverImage and canonicalUrl with `.url()`, which rejects "". */
function buildPayload(form: PostForm): AuthorPostInput {
  const payload: AuthorPostInput = {
    title: form.title.trim(),
    excerpt: form.excerpt.trim(),
    content: form.content,
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10),
  }
  if (form.coverImage.trim()) payload.coverImage = form.coverImage.trim()
  if (form.seoTitle.trim()) payload.seoTitle = form.seoTitle.trim()
  if (form.seoDescription.trim()) payload.seoDescription = form.seoDescription.trim()
  if (form.canonicalUrl.trim()) payload.canonicalUrl = form.canonicalUrl.trim()
  if (form.scheduledFor) payload.scheduledFor = new Date(form.scheduledFor).toISOString()
  return payload
}

function scheduleLabel(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${formatDate(iso)} at ${d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * The author's own writing desk (spec §6/§7).
 *
 * Everything here is scoped to the signed-in author by the server, so the list
 * is only ever their work. The one rule worth knowing before you write: saving
 * a draft is free, and the plan's blog allowance is only spent when a post goes
 * live — which is why a publish, and not a save, is what gets refused.
 */
export function AuthorPostsPage() {
  const [status, setStatus] = useState<AuthorPostStatus | 'all'>('all')
  const [editing, setEditing] = useState<AuthorPost | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [form, setForm] = useState<PostForm>(EMPTY_FORM)
  const [takingDown, setTakingDown] = useState<AuthorPost | null>(null)
  const [reason, setReason] = useState('')

  const roles = useAuthStore((s) => s.user?.roles)
  // The takedown route sits behind requireRole('admin', 'super_admin') and reads
  // the full role set, not the active one — so mirror that check exactly.
  const canTakedown = roles?.some((r) => r === 'admin' || r === 'super_admin') ?? false

  // Unfiltered, so the counts keep describing the whole desk while the table
  // below narrows to one state. React Query dedupes it with the table's request
  // when the "All" tab is selected.
  const { data: allPosts } = useAuthorPosts()
  const { data, isLoading } = useAuthorPosts(status === 'all' ? undefined : status)
  const { data: storefront } = useMyStorefront()
  const { data: entitlements } = useMyEntitlements()

  const create = useCreatePost()
  const update = useUpdatePost()
  const publish = usePublishPost()
  const archive = useArchivePost()
  const takedown = useTakedownPost()

  const posts = data?.items ?? []
  const counts = useMemo(() => {
    const items = allPosts?.items ?? []
    const by = (s: AuthorPostStatus) => items.filter((p) => p.status === s).length
    return {
      published: by('published'),
      scheduled: by('scheduled'),
      drafts: by('draft') + by('in_review'),
    }
  }, [allPosts?.items])

  // blog.limit is a *publishing* quota: live and queued posts occupy a slot,
  // drafts do not. Showing it the same way the server counts it means the
  // number here matches the one in a quota rejection.
  const blogLimit = entitlements?.features['blog.limit']
  const slotsUsed = counts.published + counts.scheduled

  const busy = create.isPending || update.isPending

  function openComposer(post?: AuthorPost) {
    setEditing(post ?? null)
    setForm(post ? formToState(post) : EMPTY_FORM)
    setComposerOpen(true)
  }

  function closeComposer() {
    setComposerOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  // Server messages are the copy of record here — a quota refusal names the
  // plan and the limit, and is the only way the author learns what to do next.
  function failed(fallback: string) {
    return (err: unknown) => toast.error(err instanceof Error && err.message ? err.message : fallback)
  }

  const canSubmit =
    form.title.trim().length >= 3 &&
    form.excerpt.trim().length >= 3 &&
    form.content.trim().length >= 10

  function onSubmit() {
    if (!canSubmit || busy) return
    const payload = buildPayload(form)

    if (editing) {
      update.mutate({ id: editing.id, ...payload }, {
        onSuccess: () => { toast.success('Post updated'); closeComposer() },
        onError: failed('Could not save the post'),
      })
      return
    }

    create.mutate({ ...payload, attachToStorefront: form.attachToStorefront }, {
      onSuccess: () => { toast.success('Draft saved'); closeComposer() },
      onError: failed('Could not save the draft'),
    })
  }

  function onPublish(post: AuthorPost) {
    publish.mutate(post.id, {
      onSuccess: (result) => toast.success(
        result.status === 'scheduled'
          ? `Queued to go live on ${scheduleLabel(result.scheduledFor)}`
          : `“${post.title}” is live`
      ),
      onError: failed('Could not publish the post'),
    })
  }

  function onArchive(post: AuthorPost) {
    archive.mutate(post.id, {
      onSuccess: () => toast.success('Post archived and taken off the feed'),
      onError: failed('Could not archive the post'),
    })
  }

  function onTakedown() {
    if (!takingDown || reason.trim().length < 3) return
    takedown.mutate({ id: takingDown.id, reason: reason.trim() }, {
      onSuccess: () => {
        toast.success('Post removed')
        setTakingDown(null)
        setReason('')
      },
      onError: failed('Could not remove the post'),
    })
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Publishing"
        title="Your posts"
        description="Write, schedule and publish to your storefront feed and the RentOS blog."
        icon={<PenLine size={22} />}
        accent="#2d5a8e"
        meta={`${allPosts?.items.length ?? 0} post${(allPosts?.items.length ?? 0) === 1 ? '' : 's'} in total`}
      >
        <Button onClick={() => openComposer()}>
          <Plus size={14} /> New post
        </Button>
      </AdminPageHeader>

      <AdminStatGrid>
        <AdminStatCard
          label="Live" value={String(counts.published)}
          description="Readable on the public feed right now"
          icon={<Send size={18} />} accent="#059669"
        />
        <AdminStatCard
          label="Queued" value={String(counts.scheduled)}
          description="Waiting for their publish date"
          icon={<CalendarClock size={18} />} accent="#f59e0b"
        />
        <AdminStatCard
          label="Drafts" value={String(counts.drafts)}
          description="Saved but never published — these cost nothing"
          icon={<FileText size={18} />} accent="#2d5a8e"
        />
        <AdminStatCard
          label="Publishing slots"
          value={typeof blogLimit === 'number' ? `${slotsUsed} of ${blogLimit}` : String(slotsUsed)}
          description={typeof blogLimit === 'number'
            ? `Live and queued posts on the ${entitlements?.planName ?? 'current'} plan`
            : 'Live and queued posts counted against your plan'}
          icon={<PenLine size={18} />} accent="#7c3aed"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Your desk"
        description="A post only leaves this page when you publish it. Archiving pulls it back off the feed without deleting the writing."
        resultLabel={`${posts.length} shown`}
      >
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`focus-ring rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                status === tab.value
                  ? 'bg-primary text-white dark:bg-blue-600'
                  : 'bg-surface text-muted hover:text-primary dark:bg-white/[0.04] dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading your posts" description="Fetching your drafts and published work…" cols={5} />
      ) : posts.length === 0 ? (
        <AdminEmptyState
          title={status === 'all' ? 'Nothing written yet' : 'Nothing in this state'}
          description={status === 'all'
            ? 'Start a draft — it costs nothing against your plan until you publish it.'
            : 'No post of yours is in this state right now.'}
          icon={<PenLine size={28} />}
        />
      ) : (
        <AdminTableCard
          title="Posts"
          description="Title, state, where it publishes and when you last touched it."
        >
          <table className={adminTableClassName('min-w-[920px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Post</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Publishes to</th>
                <th className="px-4 py-3 font-bold">Updated</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {posts.map((post) => {
                const postStatus = post.status ?? 'draft'
                return (
                  <tr key={post.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="max-w-[26rem] font-semibold text-primary-dark dark:text-white">{post.title}</div>
                      <div className="mt-1 max-w-[26rem] text-xs leading-relaxed text-muted dark:text-gray-500">{post.excerpt}</div>
                      <div className="mt-1 font-mono text-[10px] text-muted dark:text-gray-600">/{post.slug}</div>
                      {post.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {post.tags.map((tag) => (
                            <Badge key={tag} variant="muted" className="text-[10px]">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant[postStatus]} className="text-[10px]">
                        {STATUS_LABELS[postStatus]}
                      </Badge>
                      {postStatus === 'scheduled' && post.scheduledFor && (
                        <div className="mt-2 max-w-[14rem] text-[11px] text-muted dark:text-gray-500">
                          Goes live {scheduleLabel(post.scheduledFor)}
                        </div>
                      )}
                      {/* A publish date on an unpublished post queues it rather than
                          releasing it, so say so before the author presses Publish. */}
                      {postStatus !== 'scheduled' && postStatus !== 'published' && post.scheduledFor && (
                        <div className="mt-2 max-w-[14rem] text-[11px] text-muted dark:text-gray-500">
                          Publishing queues it for {scheduleLabel(post.scheduledFor)}
                        </div>
                      )}
                      {postStatus === 'published' && post.publishedAt && (
                        <div className="mt-2 text-[11px] text-muted dark:text-gray-500">
                          Live since {formatDate(post.publishedAt)}
                        </div>
                      )}
                      {postStatus === 'removed' && (
                        <div className="mt-2 flex max-w-[14rem] items-start gap-1 text-[11px] text-danger">
                          <ShieldOff size={12} className="mt-0.5 shrink-0" />
                          <span>{post.removedReason ?? 'Removed by a moderator.'}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {post.storefrontId ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-dark dark:text-white">
                          <Store size={12} className="shrink-0 text-muted" />
                          <span className="break-words">{storefront?.name ?? 'Your storefront'}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-dark dark:text-white">
                          <User2 size={12} className="shrink-0 text-muted" />
                          <span>Your byline only</span>
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">
                        {post.storefrontId ? 'Shows on your storefront feed' : 'Shows on the RentOS blog'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs font-semibold text-primary-dark dark:text-white">{formatDate(post.updatedAt)}</div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">Written {formatDate(post.createdAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openComposer(post)}>
                          <PenLine size={13} /> Edit
                        </Button>
                        {postStatus !== 'published' && postStatus !== 'removed' && (
                          <Button size="sm" onClick={() => onPublish(post)} disabled={publish.isPending}>
                            <Send size={13} /> Publish
                          </Button>
                        )}
                        {postStatus !== 'archived' && postStatus !== 'removed' && (
                          <Button size="sm" variant="outline" onClick={() => onArchive(post)} disabled={archive.isPending}>
                            <Archive size={13} /> Archive
                          </Button>
                        )}
                        {canTakedown && postStatus !== 'removed' && (
                          <Button size="sm" variant="danger" onClick={() => { setTakingDown(post); setReason('') }}>
                            <ShieldOff size={13} /> Take down
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      <Modal
        open={composerOpen}
        onClose={closeComposer}
        title={editing ? 'Edit post' : 'New post'}
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <Input
            id="post-title" label="Title" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. What a landlord may deduct from your deposit"
            required
          />
          <Textarea
            id="post-excerpt" label="Excerpt" value={form.excerpt}
            onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
            placeholder="One or two lines. This is what a reader sees in the feed."
            rows={2}
            aiContext="blog post excerpt"
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-primary-dark dark:text-[#cbd5e1]">Body</label>
            <MarkdownEditor
              value={form.content}
              onChange={(content) => setForm((f) => ({ ...f, content }))}
              minRows={14}
              aiContext="blog post"
            />
            <p className="mt-1.5 text-[11px] text-muted dark:text-gray-500">At least 10 characters. Markdown, rendered exactly as the preview shows it.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="post-cover" label="Cover image URL" value={form.coverImage}
              onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))}
              placeholder="https://…"
            />
            <Input
              id="post-tags" label="Tags" value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="deposits, tenancy law"
            />
            <Input
              id="post-seo-title" label="SEO title" value={form.seoTitle}
              onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
              placeholder="Defaults to the title"
            />
            <Input
              id="post-canonical" label="Canonical URL" value={form.canonicalUrl}
              onChange={(e) => setForm((f) => ({ ...f, canonicalUrl: e.target.value }))}
              placeholder="https://… if this was published elsewhere first"
            />
          </div>

          <Textarea
            id="post-seo-description" label="SEO description" value={form.seoDescription}
            onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
            placeholder="Shown under the title in search results."
            rows={2}
          />

          <Input
            id="post-scheduled" type="datetime-local" label="Publish at" value={form.scheduledFor}
            onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))}
          />
          <p className="-mt-2 text-[11px] text-muted dark:text-gray-500">
            Leave this empty to go live the moment you press Publish. A future time queues the post instead —
            it still takes a publishing slot.
          </p>

          {/* Create only: the storefront is resolved once, when the post is made. */}
          {!editing && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 p-3 dark:border-[#252a3a]/80">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-primary-dark dark:text-white">Publish to my storefront</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted dark:text-gray-500">
                  {storefront
                    ? `Attaches the post to ${storefront.name}, so it shows on that feed as well as the RentOS blog.`
                    : 'You do not have a storefront yet, so this post will publish under your byline alone.'}
                </p>
              </div>
              <Switch
                checked={form.attachToStorefront}
                onChange={(checked) => setForm((f) => ({ ...f, attachToStorefront: checked }))}
                disabled={!storefront}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeComposer}>Cancel</Button>
            <Button onClick={onSubmit} disabled={!canSubmit || busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(takingDown)} onClose={() => setTakingDown(null)} title="Take this post down">
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            {takingDown
              ? `“${takingDown.title}” stops resolving publicly straight away. The reason is stored on the post and in the audit trail, and the author sees it.`
              : ''}
          </p>
          <Textarea
            id="post-takedown-reason"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. the post reproduces a landlord's contact details without consent"
            rows={3}
          />
          <p className="text-xs text-muted dark:text-gray-500">At least 3 characters.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTakingDown(null)}>Cancel</Button>
            <Button variant="danger" onClick={onTakedown} disabled={reason.trim().length < 3 || takedown.isPending}>
              {takedown.isPending ? 'Removing…' : 'Remove post'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
