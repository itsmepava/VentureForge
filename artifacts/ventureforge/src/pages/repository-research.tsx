import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Github, LoaderCircle, RefreshCw, Download, ExternalLink } from 'lucide-react';
import { useListRepositoryResearch, useResearchGitHubRepository, getListRepositoryResearchQueryKey } from '@workspace/api-client-react';

export default function RepositoryResearchPage() {
  const queryClient = useQueryClient();
  const saved = useListRepositoryResearch();
  const research = useResearchGitHubRepository();
  const [repository, setRepository] = useState('');
  const [notice, setNotice] = useState('');
  const error = research.error as { data?: { error?: string }; message?: string } | null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    research.mutate({ data: { repository: repository.trim() } }, {
      onSuccess: result => {
        setNotice(`Saved live research for ${result.displayName}.`);
        queryClient.invalidateQueries({ queryKey: getListRepositoryResearchQueryKey() });
      },
    });
  };
  return <div className="mx-auto max-w-7xl p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><div className="font-mono text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Live GitHub evidence</div><h1 className="mt-2 text-3xl font-bold">Repository research</h1><p className="mt-3 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">Research public repositories using real GitHub metadata and the last 30 days of default-branch commits. Findings are saved to your local database.</p></div>
      <a href="/api/repository-research/export.csv" className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm"><Download size={16} /> Export CSV</a>
    </div>
    <form onSubmit={submit} className="my-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <label htmlFor="research-repository" className="mb-2 block text-sm font-semibold">GitHub repository</label>
      <div className="flex flex-col gap-3 sm:flex-row"><input id="research-repository" data-testid="input-research-repository" value={repository} onChange={event => setRepository(event.target.value)} required maxLength={200} placeholder="owner/repository or https://github.com/owner/repository" className="h-11 min-w-0 flex-1 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm" /><button type="submit" disabled={research.isPending} data-testid="button-research-repository" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{research.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Github size={16} />} {research.isPending ? 'Researching GitHub…' : 'Research & save'}</button></div>
      <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Free local use. Public repositories work without a token, subject to GitHub limits. Configure your own GitHub token in Settings for higher limits. No AI model or payment service is used.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error.data?.error ?? error.message ?? 'Research failed. Please retry.'}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}
    </form>
    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Saved research ({saved.data?.length ?? 0})</h2><button onClick={() => saved.refetch()} className="inline-flex items-center gap-2 text-sm"><RefreshCw size={14} /> Reload saved records</button></div>
    {saved.isLoading ? <p>Loading saved research…</p> : saved.isError ? <p role="alert">Saved research could not be loaded. Check the local API and retry.</p> : !saved.data?.length ? <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-sm text-[hsl(var(--muted-foreground))]">No repositories researched yet. Enter a public repository above to collect real evidence.</div> : <div className="grid gap-5 lg:grid-cols-2">{saved.data.map(record => <article key={record.id} data-testid={`research-record-${record.id}`} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-lg font-bold hover:underline"><Github size={19} />{record.displayName}<ExternalLink size={14} /></a>
      <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{record.description || 'No repository description provided.'}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">{[['Stars', record.stars], ['Forks', record.forks], ['Open issues / PRs', record.openIssues], ['Commits in 30 days', `${record.commitsTruncated ? '≥ ' : ''}${record.recentCommitCount}`], ['Observed authors', record.observedAuthorCount], ['Language', record.language ?? 'Not specified']].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-[hsl(var(--muted))] p-3"><div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div><div className="mt-1 font-bold">{value}</div></div>)}</div>
      {record.commitsTruncated && <p className="mt-3 text-xs text-amber-800">Activity is a lower bound: research stops after 300 commits. Author counts cover only these observed commits.</p>}
      <div className="mt-4 space-y-1 text-xs text-[hsl(var(--muted-foreground))]"><p>Last push: {record.lastPushedAt ? new Date(record.lastPushedAt).toLocaleString() : 'Not reported'}</p><p>Observed window: {new Date(record.periodStart).toLocaleDateString()}–{new Date(record.researchedAt).toLocaleDateString()}</p><p>Fetched: {new Date(record.researchedAt).toLocaleString()} · {record.apiRequests} GitHub API requests{record.archived ? ' · Archived repository' : ''}</p></div>
      <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-xs text-[hsl(var(--muted-foreground))]">Repository activity is evidence, not a founder assessment or proof of a company’s funding, traction, or team size.</p>
      <button onClick={() => { setNotice(''); research.mutate({ data: { repository: record.repository } }, { onSuccess: () => { setNotice(`Updated ${record.displayName}.`); queryClient.invalidateQueries({ queryKey: getListRepositoryResearchQueryKey() }); } }); }} disabled={research.isPending} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw size={14} /> Refresh from GitHub</button>
    </article>)}</div>}
  </div>;
}
