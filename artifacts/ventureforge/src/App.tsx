import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Database,
  Download,
  ExternalLink,
  Filter,
  Gauge,
  Github,
  Globe2,
  Layers3,
  LifeBuoy,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react';
import {
  getGetCompanyQueryKey,
  getGetDashboardActivityQueryKey,
  getGetDashboardSummaryQueryKey,
  getListCompaniesQueryKey,
  getListPortfolioSourcesQueryKey,
  getListSavedSearchesQueryKey,
  getListIntegrationsQueryKey,
  useCreatePortfolioSource,
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useListIntegrations,
  useSaveIntegrationVault,
  useDisconnectIntegration,
  useVerifyIntegration,
  useTestIntegrationDelivery,
  useGetBillingStatus,
  useCreateBillingPortal,
  useGetCompany,
  useGetDashboardActivity,
  useGetDashboardSummary,
  useHealthCheck,
  useListCompanies,
  useListPortfolioSources,
  useListSavedSearches,
} from '@workspace/api-client-react';
import type { DiscoveredCompany, FilterParams, IntegrationConnection, ProviderName } from '@workspace/api-client-react';
import { Route, Switch, Link, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { Form } from '@/components/ui/form';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useForm } from 'react-hook-form';

const queryClient = new QueryClient();

const navItems = [
  { href: '/', label: 'Discovery desk', icon: Radar },
  { href: '/saved-searches', label: 'Saved searches', icon: BookOpen },
  { href: '/portfolio', label: 'Portfolio scans', icon: Layers3 },
  { href: '/settings', label: 'Workspace settings', icon: Settings2 },
];

const stages = ['Pre-Seed', 'Seed', 'Series A'];
const regions = ['South Asia', 'Southeast Asia', 'East Asia'];
const countries = ['Sri Lanka', 'India', 'Indonesia', 'South Korea'];
const sectors = ['Fintech', 'Regtech', 'Healthtech', 'Developer Tools', 'Commerce', 'Insurtech', 'Climate', 'Edtech', 'SaaS'];
const models = ['B2B', 'B2B2C'];

function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function savedSearchHref(filterParams: FilterParams) {
  const query = new URLSearchParams();
  if (filterParams.search) query.set('search', filterParams.search);
  for (const [key, values] of Object.entries({
    stage: filterParams.stage,
    region: filterParams.region,
    country: filterParams.country,
    businessModel: filterParams.businessModel,
    sector: filterParams.sector,
  })) {
    for (const value of values ?? []) query.append(key, value);
  }
  const queryString = query.toString();
  return queryString ? `/?${queryString}` : '/';
}

function companyExportHref(format: 'csv' | 'pdf', filters: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) query.append(key, item);
  }
  const queryString = query.toString();
  return `/api/companies/export.${format}${queryString ? `?${queryString}` : ''}`;
}

function signalTone(label?: string) {
  if (label === 'High signal') return 'signal-high';
  if (label === 'Promising') return 'signal-mid';
  return 'signal-watch';
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" data-testid="loading-skeleton">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-[78px] animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
      ))}
    </div>
  );
}

function DataError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center" data-testid="error-state">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f5d8d1] text-[#a64236]"><LifeBuoy size={18} /></div>
      <p className="font-semibold text-[hsl(var(--foreground))]">Could not load {label}</p>
      <p className="mt-1 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">The desk could not reach the sourcing service. Your filters are still here.</p>
      <button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-retry">
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center" data-testid="empty-state">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8eba9] text-[hsl(var(--foreground))]"><Radar size={21} /></div>
      <p className="font-[Space_Grotesk] text-lg font-semibold">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (open: boolean) => void }) {
  const [location] = useLocation();
  const health = useHealthCheck();
  return (
    <>
      <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-[238px] flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 lg:translate-x-0`} data-testid="sidebar">
        <div className="vf-sidebar-grid absolute inset-0 opacity-50" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
              <span className="absolute h-4 w-4 rounded-full border-[3px] border-current" />
              <span className="absolute h-1.5 w-1.5 rounded-full bg-current" />
            </div>
            <div>
              <div className="font-[Space_Grotesk] text-[17px] font-bold tracking-tight">VentureForge</div>
              <div className="font-mono text-[9px] uppercase tracking-[.18em] text-white/45">signal / desk</div>
            </div>
            <button className="ml-auto rounded-md p-1.5 text-white/50 hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-sidebar"><X size={17} /></button>
          </div>
          <div className="relative mx-4 mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[.16em] text-white/45"><span>Workspace</span><ChevronDown size={13} /></div>
            <div className="mt-2 flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dfe77e] text-xs font-extrabold text-[#22283d]">N</div><span className="text-sm font-semibold">Northstar Ventures</span></div>
          </div>
          <nav className="relative mt-7 flex-1 px-3" aria-label="Main navigation">
            <p className="px-3 pb-2 font-mono text-[9px] font-medium uppercase tracking-[.2em] text-white/35">Navigate</p>
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? location === '/' : location.startsWith(href);
              return (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`group mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${active ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]' : 'text-white/60 hover:bg-white/8 hover:text-white'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
                  <Icon size={17} strokeWidth={active ? 2.5 : 1.7} /><span>{label}</span>{active && <ChevronRight className="ml-auto" size={14} />}
                </Link>
              );
            })}
            <div className="mt-8 px-3 pb-2 font-mono text-[9px] font-medium uppercase tracking-[.2em] text-white/35">Workspace</div>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-white/60 hover:bg-white/8 hover:text-white" onClick={() => window.alert('Command palette is ready for your next sourcing move.')} data-testid="button-command-palette"><Command size={17} strokeWidth={1.7} /><span>Command palette</span><span className="ml-auto rounded border border-white/15 px-1.5 py-0.5 font-mono text-[9px]">⌘K</span></button>
          </nav>
          <div className="relative border-t border-white/10 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] text-white/50"><span className={`h-1.5 w-1.5 rounded-full ${health.isError ? 'bg-[#e58a76]' : 'bg-[#dfe77e] vf-pulse'}`} />{health.isError ? 'Service degraded' : 'Sourcing engine online'}</div>
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#69718c] text-[11px] font-extrabold">AM</div><div className="min-w-0"><div className="truncate text-xs font-bold">Ari Morgan</div><div className="truncate text-[10px] text-white/40">Partner · Northstar</div></div><ChevronDown className="ml-auto text-white/35" size={14} /></div>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-[#172039]/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-sidebar-overlay" />}
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const pageName = location === '/' ? 'Discovery desk' : location.includes('saved') ? 'Saved searches' : location.includes('portfolio') ? 'Portfolio scans' : 'Workspace settings';
  return (
    <div className="vf-noise min-h-[100dvh] bg-[hsl(var(--background))]">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className="min-h-[100dvh] lg:pl-[238px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-md p-2 hover:bg-[hsl(var(--muted))] lg:hidden" data-testid="button-open-sidebar"><Menu size={19} /></button><div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Northstar / {pageName}</div><div className="mt-0.5 text-sm font-bold text-[hsl(var(--foreground))]">{pageName}</div></div></div>
          <div className="flex items-center gap-2 sm:gap-4"><button className="hidden items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex" onClick={() => window.alert('Search across companies, founders, and notes.')} data-testid="button-global-search"><Search size={14} /> Search desk <span className="ml-3 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">⌘K</span></button><button className="relative rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" onClick={() => window.alert('No new alerts.')} data-testid="button-notifications"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#d97d5c]" /></button><button className="flex h-8 w-8 items-center justify-center rounded-full bg-[#69718c] text-[10px] font-extrabold text-white" onClick={() => window.alert('Account menu')} data-testid="button-account-menu">AM</button></div>
        </header>
        {children}
      </main>
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string | number; detail: string; icon: typeof Activity; accent?: boolean }) {
  return <div className={`rounded-xl border border-[hsl(var(--border))] p-4 shadow-[0_1px_0_rgba(34,40,61,.03)] ${accent ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))]'}`} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between"><span className={`font-mono text-[10px] uppercase tracking-[.13em] ${accent ? 'text-white/55' : 'text-[hsl(var(--muted-foreground))]'}`}>{label}</span><Icon size={16} className={accent ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))]'} /></div><div className="mt-3 font-[Space_Grotesk] text-3xl font-bold tracking-tight">{value}</div><div className={`mt-1 text-[11px] ${accent ? 'text-white/55' : 'text-[hsl(var(--muted-foreground))]'}`}>{detail}</div></div>;
}

function SelectFilter({ label, value, options, onChange, testId }: { label: string; value: string; options: string[]; onChange: (value: string) => void; testId: string }) {
  return <label className="min-w-0"><span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-xs font-semibold outline-none focus:border-[hsl(var(--foreground))]" data-testid={testId}><option value="">Any {label.toLowerCase()}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function CompanyRow({ company, selected, onSelect }: { company: DiscoveredCompany; selected: boolean; onSelect: () => void }) {
  return <button onClick={onSelect} className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-3.5 text-left transition-colors last:border-0 sm:grid-cols-[auto_minmax(0,1fr)_110px_78px] ${selected ? 'bg-[#eef0c8]' : 'hover:bg-[hsl(var(--muted))]'}`} data-testid={`company-row-${company.id}`}>
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))] font-[Space_Grotesk] text-sm font-bold text-[hsl(var(--accent))]">{company.logoLetter}</div>
    <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-extrabold">{company.companyName}</span><span className={`hidden rounded-full px-2 py-0.5 text-[9px] font-extrabold sm:inline ${signalTone(company.signalLabel)}`}>{company.signalLabel}</span></div><div className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{company.productDescription}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{company.regionalMetadata?.specificCountry} · {company.regionalMetadata?.sector} · {company.lastFundingRound}</div></div>
    <div className="hidden text-right sm:block"><div className="font-mono text-sm font-bold">{company.signalScore}</div><div className="mt-1 text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">signal score</div></div>
    <ChevronRight className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5" size={16} />
  </button>;
}

function CompanyDetail({ companyId, fallback }: { companyId: string; fallback?: DiscoveredCompany }) {
  const companyQuery = useGetCompany(companyId, { query: { enabled: Boolean(companyId), queryKey: getGetCompanyQueryKey(companyId) } });
  const company = companyQuery.data ?? fallback;
  if (companyQuery.isLoading && !company) return <div className="space-y-3 p-5"><div className="h-7 w-40 animate-pulse rounded bg-[hsl(var(--muted))]" /><div className="h-20 animate-pulse rounded bg-[hsl(var(--muted))]" /><div className="h-32 animate-pulse rounded bg-[hsl(var(--muted))]" /></div>;
  if (companyQuery.isError || !company) return <div className="p-5"><DataError label="company profile" onRetry={() => companyQuery.refetch()} /></div>;
  const metrics = company.behavioralMetrics;
  return <div className="p-5" data-testid={`company-detail-${company.id}`}>
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--primary))] font-[Space_Grotesk] text-xl font-bold text-[hsl(var(--accent))]">{company.logoLetter}</div><div><h2 className="font-[Space_Grotesk] text-xl font-bold">{company.companyName}</h2><a href={company.website} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" data-testid={`link-company-website-${company.id}`}>{company.website.replace(/^https?:\/\//, '')} <ExternalLink size={11} /></a></div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${signalTone(company.signalLabel)}`}>{company.signalLabel} · {company.signalScore}</div></div>
    <p className="mt-5 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{company.productDescription}</p>
    <div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-lg bg-[hsl(var(--muted))] p-3"><div className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Round</div><div className="mt-1 text-sm font-bold">{company.lastFundingRound}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">{company.fundingCurrency} {company.fundingAmountEstimated.toLocaleString()}</div></div><div className="rounded-lg bg-[hsl(var(--muted))] p-3"><div className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Team</div><div className="mt-1 text-sm font-bold">{company.regionalMetadata.employeeCount} people</div><div className="text-xs text-[hsl(var(--muted-foreground))]">{company.regionalMetadata.businessModel}</div></div></div>
    <div className="mt-6"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-extrabold uppercase tracking-[.13em]">Founder signals</h3><span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">behavioral layer</span></div><div className="space-y-3"><div><div className="mb-1.5 flex justify-between text-xs"><span>Builder resilience</span><span className="font-mono font-bold">{metrics.builderResilienceScore}/100</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--accent))]" style={{ width: `${metrics.builderResilienceScore}%` }} /></div></div><div className="rounded-lg border border-[hsl(var(--border))] p-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><span className="mr-1 font-bold text-[hsl(var(--foreground))]">Observed:</span>{metrics.problemSolvingNotes}</div><div className="flex items-center justify-between rounded-lg bg-[#e8eba9] px-3 py-2.5 text-xs"><span className="flex items-center gap-2 font-semibold"><TrendingUp size={14} /> Commit velocity spike</span><span className="font-mono font-bold">+{metrics.commitVelocitySpike}%</span></div></div></div>
    <div className="mt-6 border-t border-[hsl(var(--border))] pt-5"><div className="mb-2 text-[10px] font-extrabold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Known investors</div><div className="flex flex-wrap gap-1.5">{company.knownInvestors.map((investor) => <span key={investor} className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold">{investor}</span>)}</div></div>
    <div className="mt-5 flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]"><span>Discovered {formatDate(company.discoveredAt)}</span><span>via {company.source}</span></div>
  </div>;
}

function Dashboard() {
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') ?? '');
  const [stage, setStage] = useState(() => new URLSearchParams(window.location.search).get('stage') ?? '');
  const [region, setRegion] = useState(() => new URLSearchParams(window.location.search).get('region') ?? '');
  const [country, setCountry] = useState(() => new URLSearchParams(window.location.search).get('country') ?? '');
  const [sector, setSector] = useState(() => new URLSearchParams(window.location.search).get('sector') ?? '');
  const [selectedId, setSelectedId] = useState('');
  const params = useMemo(() => ({ ...(search ? { search } : {}), ...(stage ? { stage: [stage] } : {}), ...(region ? { region: [region] } : {}), ...(country ? { country: [country] } : {}), ...(sector ? { sector: [sector] } : {}) }), [search, stage, region, country, sector]);
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const activity = useGetDashboardActivity({ query: { queryKey: getGetDashboardActivityQueryKey() } });
  const companies = useListCompanies(params, { query: { queryKey: getListCompaniesQueryKey(params) } });
  const list = companies.data ?? [];
  const activeId = list.some((company) => company.id === selectedId) ? selectedId : (list[0]?.id || '');
  const selected = list.find((company) => company.id === activeId) ?? list[0];
  const summaryData = summary.data;
  return <div className="vf-grid min-h-[calc(100dvh-68px)] px-4 py-6 sm:px-8 lg:px-9">
    <div className="mx-auto max-w-[1550px]">
       <div className="vf-reveal flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> Live sourcing view</div><h1 className="font-[Space_Grotesk] text-3xl font-bold tracking-[-.04em] sm:text-[38px]">Find the signal <span className="text-[hsl(var(--muted-foreground))]">before the round.</span></h1><p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">A focused view of companies showing unusual founder behavior, not just familiar names.</p></div><div className="flex flex-wrap items-center gap-2"><a href={companyExportHref('csv', params)} className="inline-flex w-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="link-export-csv"><Download size={14} /> CSV</a><a href={companyExportHref('pdf', params)} className="inline-flex w-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="link-export-pdf"><Download size={14} /> PDF</a><button onClick={() => companies.refetch()} className="inline-flex w-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-refresh-discovery"><RefreshCw size={14} className={companies.isFetching ? 'animate-spin' : ''} /> Refresh desk</button></div></div>
      <div className="vf-reveal vf-reveal-delay-1 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">{summary.isLoading ? <>{[1,2,3,4].map((item) => <div key={item} className="h-[122px] animate-pulse rounded-xl bg-[hsl(var(--muted))]" />)}</> : summary.isError ? <div className="col-span-2 lg:col-span-4"><DataError label="dashboard summary" onRetry={() => summary.refetch()} /></div> : <><StatCard label="Companies in view" value={summaryData?.companyCount ?? list.length} detail={`+${summaryData?.newThisWeek ?? 0} added this week`} icon={Building2} /><StatCard label="High signal" value={summaryData?.highSignalCount ?? 0} detail="worth a closer look" icon={Target} accent /><StatCard label="Tracked developers" value={summaryData?.trackedDevelopers ?? 0} detail="behavioral profiles" icon={UsersRound} /><StatCard label="Active regions" value={summaryData?.activeRegions ?? 0} detail="across your thesis" icon={Globe2} /></>}</div>
       <div className="vf-reveal vf-reveal-delay-2 mt-7 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-4"><div className="grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_repeat(4,minmax(130px,1fr))]"><div className="min-w-0"><label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Search desk</label><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Company, founder, product, or investor" className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-9 pr-3 text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--foreground))]" data-testid="input-company-search" /></div></div><SelectFilter label="Stage" value={stage} options={stages} onChange={setStage} testId="select-filter-stage" /><SelectFilter label="Region" value={region} options={regions} onChange={setRegion} testId="select-filter-region" /><SelectFilter label="Country" value={country} options={countries} onChange={setCountry} testId="select-filter-country" /><SelectFilter label="Sector" value={sector} options={sectors} onChange={setSector} testId="select-filter-sector" /></div><div className="mt-3 flex items-center justify-between border-t border-[hsl(var(--border))] pt-3"><span className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"><SlidersHorizontal size={13} /> Use the dropdowns to narrow the sourcing desk.</span>{(stage || region || country || sector || search) && <button onClick={() => { setSearch(''); setStage(''); setRegion(''); setCountry(''); setSector(''); }} className="text-[11px] font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" data-testid="button-clear-filters">Clear all</button>}</div></div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.72fr)]">
         <section className="vf-reveal vf-reveal-delay-2 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-4"><div><h2 className="font-[Space_Grotesk] text-base font-bold">Emerging companies</h2><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Ranked by behavior, velocity, and early market pull.</p></div><div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]"><Filter size={13} /> {list.length} matches</div></div>{companies.isLoading ? <div className="p-4"><SkeletonRows /></div> : companies.isError ? <div className="p-4"><DataError label="companies" onRetry={() => companies.refetch()} /></div> : list.length === 0 ? <div className="p-4"><EmptyState title="No companies match this cut" description="Try widening the region, country, stage, or sector filter. The best signal is often one degree outside the obvious search." action={<button onClick={() => { setSearch(''); setStage(''); setRegion(''); setCountry(''); setSector(''); }} className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-white" data-testid="button-reset-empty-filters">Reset filters</button>} /></div> : <div>{list.map((company) => <CompanyRow key={company.id} company={company} selected={company.id === activeId} onSelect={() => setSelectedId(company.id)} />)}</div>}</section>
        <aside className="vf-reveal vf-reveal-delay-3 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h2 className="font-[Space_Grotesk] text-base font-bold">Company brief</h2><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Select a row to open the behavioral layer.</p></div><span className="rounded bg-[hsl(var(--muted))] px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Profile</span></div>{selected ? <CompanyDetail companyId={selected.id} fallback={selected} /> : <EmptyState title="Profile window is clear" description="Company intelligence will appear here when you select a discovery." />}</aside>
      </div>
      <div className="mt-5 grid gap-5 pb-8 lg:grid-cols-[1.15fr_.85fr]"><section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"><div className="flex items-center justify-between"><div><h2 className="font-[Space_Grotesk] text-base font-bold">Discovery cadence</h2><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">New company records entering the desk.</p></div><TrendingUp size={17} className="text-[hsl(var(--muted-foreground))]" /></div><div className="mt-6 flex h-[130px] items-end gap-2 sm:gap-4">{(summaryData?.weeklyDiscovery ?? []).map((point, index, values) => { const max = Math.max(...values.map((item) => item.value), 1); return <div key={`${point.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className="relative flex h-[100px] w-full items-end justify-center"><div className="w-full max-w-[34px] rounded-t-md bg-[hsl(var(--primary))] transition-all hover:bg-[hsl(var(--accent))]" style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }} title={`${point.value} discoveries`} /></div><span className="font-mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{point.label}</span></div>; })}</div></section><section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))] p-5 text-white"><div className="flex items-center justify-between"><div><h2 className="font-[Space_Grotesk] text-base font-bold">Desk activity</h2><p className="mt-1 text-[11px] text-white/50">Recent changes across your sourcing view.</p></div><Activity size={17} className="text-[hsl(var(--accent))]" /></div><div className="mt-4 space-y-3">{activity.isLoading ? <div className="space-y-2"><div className="h-9 animate-pulse rounded bg-white/10" /><div className="h-9 animate-pulse rounded bg-white/10" /><div className="h-9 animate-pulse rounded bg-white/10" /></div> : activity.isError ? <p className="text-xs text-white/60">Activity is temporarily unavailable.</p> : (activity.data ?? []).slice(0, 4).map((item) => <div key={item.id} className="flex gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0" data-testid={`activity-item-${item.id}`}><div className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${item.severity === 'high' ? 'bg-[hsl(var(--accent))]' : 'bg-white/40'}`} /><div className="min-w-0"><div className="truncate text-xs font-semibold">{item.title}</div><div className="mt-0.5 truncate text-[10px] text-white/45">{item.description}</div></div><span className="ml-auto shrink-0 font-mono text-[9px] text-white/35">{timeAgo(item.timestamp)}</span></div>)}</div></section></div>
    </div>
  </div>;
}

type SavedSearchForm = { name: string; search: string; region: string; country: string; stage: string; businessModel: string; sector: string };

function SavedSearchesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const searches = useListSavedSearches({ query: { queryKey: getListSavedSearchesQueryKey() } });
  const createSearch = useCreateSavedSearch();
  const deleteSearch = useDeleteSavedSearch();
  const form = useForm<SavedSearchForm>({ defaultValues: { name: '', search: '', region: '', country: '', stage: '', businessModel: '', sector: '' } });
  const submit = (values: SavedSearchForm) => {
    const filterParams: FilterParams = { search: values.search, region: values.region ? [values.region] : [], country: values.country ? [values.country] : [], stage: values.stage ? [values.stage] : [], businessModel: values.businessModel ? [values.businessModel] : [], sector: values.sector ? [values.sector] : [] };
    createSearch.mutate({ data: { name: values.name, filterParams } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSavedSearchesQueryKey() }); form.reset(); setDialogOpen(false); } });
  };
  const list = searches.data ?? [];
  return <PageFrame eyebrow="Workflow / saved views" title="Saved searches" description="Keep the exact cuts that matter to your thesis close at hand." action={<button onClick={() => setDialogOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-white hover:opacity-90" data-testid="button-new-saved-search"><Plus size={15} /> Save a search</button>}>
     {searches.isLoading ? <SkeletonRows count={3} /> : searches.isError ? <DataError label="saved searches" onRetry={() => searches.refetch()} /> : list.length === 0 ? <EmptyState title="Your search library is empty" description="Save a filter configuration once the desk has a cut worth revisiting." action={<button onClick={() => setDialogOpen(true)} className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-white" data-testid="button-empty-new-search">Create first search</button>} /> : <div className="grid gap-3">{list.map((item) => <div key={item.id} className="flex flex-col gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-colors hover:border-[hsl(var(--foreground))] sm:flex-row sm:items-center" data-testid={`saved-search-${item.id}`}><div className="flex min-w-0 flex-1 items-start gap-3"><div className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.isActive ? 'bg-[#e8eba9]' : 'bg-[hsl(var(--muted))]'}`}><BookOpen size={16} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-[Space_Grotesk] text-base font-bold">{item.name}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${item.isActive ? 'bg-[#e8eba9] text-[#3d421a]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{item.isActive ? 'Active' : 'Paused'}</span></div><div className="mt-2 flex flex-wrap gap-1.5">{[...item.filterParams.stage, ...item.filterParams.region, ...item.filterParams.country, ...item.filterParams.businessModel, ...(item.filterParams.sector ?? [])].map((filter) => <span key={filter} className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{filter}</span>)}{item.filterParams.search && <span className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">“{item.filterParams.search}”</span>}</div><div className="mt-3 flex items-center gap-3 text-[10px] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-1"><Clock3 size={12} /> Saved {formatDate(item.createdAt)}</span><span className="font-mono">{item.matchCount} matches</span></div></div></div><div className="flex shrink-0 items-center gap-2"><Link href={savedSearchHref(item.filterParams)} className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-white" data-testid={`link-rerun-search-${item.id}`}>Run search <ArrowUpRight size={13} /></Link><button onClick={() => { if (window.confirm(`Delete ${item.name}?`)) deleteSearch.mutate({ searchId: item.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSavedSearchesQueryKey() }) }); }} className="rounded-md border border-[hsl(var(--border))] p-2 text-[hsl(var(--muted-foreground))] hover:border-[#b35b4f] hover:text-[#b35b4f]" data-testid={`button-delete-search-${item.id}`}><Trash2 size={15} /></button></div></div>)}</div>}
     {dialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172039]/50 p-4" role="dialog" aria-modal="true" data-testid="dialog-saved-search"><div className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Search library</div><h2 className="mt-1 font-[Space_Grotesk] text-2xl font-bold">Save this view</h2></div><button onClick={() => setDialogOpen(false)} className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-saved-search-dialog"><X size={18} /></button></div><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="mt-6 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold">Search name</span><input {...form.register('name', { required: true })} placeholder="e.g. Quietly compounding dev tools" className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--foreground))]" data-testid="input-saved-search-name" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Keyword</span><input {...form.register('search')} placeholder="Founder, product, or investor" className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none" data-testid="input-saved-search-keyword" /></label><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="block"><span className="mb-1.5 block text-xs font-bold">Stage</span><select {...form.register('stage')} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 text-xs outline-none" data-testid="select-saved-search-stage"><option value="">Any stage</option>{stages.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Region</span><select {...form.register('region')} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 text-xs outline-none" data-testid="select-saved-search-region"><option value="">Any region</option>{regions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Country</span><select {...form.register('country')} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 text-xs outline-none" data-testid="select-saved-search-country"><option value="">Any country</option>{countries.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Sector</span><select {...form.register('sector')} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 text-xs outline-none" data-testid="select-saved-search-sector"><option value="">Any sector</option>{sectors.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Model</span><select {...form.register('businessModel')} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 text-xs outline-none" data-testid="select-saved-search-model"><option value="">Any model</option>{models.map((item) => <option key={item}>{item}</option>)}</select></label></div><button disabled={createSearch.isPending} type="submit" className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-xs font-bold text-white disabled:opacity-50" data-testid="button-submit-saved-search">{createSearch.isPending && <LoaderCircle size={14} className="animate-spin" />} Save search</button></form></Form></div></div>}
  </PageFrame>;
}

type PortfolioForm = { urlLink: string };

function PortfolioPage() {
  const queryClient = useQueryClient();
  const sources = useListPortfolioSources({ query: { queryKey: getListPortfolioSourcesQueryKey() } });
  const createSource = useCreatePortfolioSource();
  const form = useForm<PortfolioForm>({ defaultValues: { urlLink: '' } });
  const submit = (values: PortfolioForm) => createSource.mutate({ data: values }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPortfolioSourcesQueryKey() }); form.reset(); } });
  const list = sources.data ?? [];
  return <PageFrame eyebrow="Workflow / portfolio intelligence" title="Portfolio scans" description="Drop in a portfolio URL and let the desk map what is already in the room." action={<div className="rounded-lg border border-[#d8df85] bg-[#eef0c8] px-3 py-2 text-[11px] font-bold text-[#3d421a]"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#89952c]" /> Scan queue ready</div>}>
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))] p-6 text-white"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"><Link2 size={19} /></div><h2 className="mt-6 font-[Space_Grotesk] text-2xl font-bold">Scan a source</h2><p className="mt-2 text-sm leading-6 text-white/55">Connect a public portfolio page. VentureForge will identify companies and make them available in your discovery desk.</p><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="mt-7"><label className="mb-2 block text-xs font-bold text-white/75">Portfolio URL</label><div className="flex flex-col gap-2 sm:flex-row"><input {...form.register('urlLink', { required: true, pattern: /^https?:\/\// })} type="url" placeholder="https://fund.example/portfolio" className="h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[hsl(var(--accent))]" data-testid="input-portfolio-url" /><button disabled={createSource.isPending} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--accent))] px-4 text-xs font-extrabold text-[hsl(var(--primary))] disabled:opacity-50" data-testid="button-submit-portfolio-scan">{createSource.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Radar size={15} />} Queue scan</button></div>{form.formState.errors.urlLink && <p className="mt-2 text-xs text-[#e6aa96]">Enter a valid URL beginning with http:// or https://</p>}</form></Form><div className="mt-9 grid grid-cols-2 gap-3 border-t border-white/10 pt-5"><div><div className="font-mono text-2xl font-bold text-[hsl(var(--accent))]">{list.length}</div><div className="mt-1 text-[10px] uppercase tracking-[.12em] text-white/40">Sources queued</div></div><div><div className="font-mono text-2xl font-bold text-[hsl(var(--accent))]">{list.reduce((total, source) => total + source.companyCount, 0)}</div><div className="mt-1 text-[10px] uppercase tracking-[.12em] text-white/40">Companies mapped</div></div></div></section><section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h2 className="font-[Space_Grotesk] text-base font-bold">Source history</h2><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Every scan remains available for context.</p></div><Database size={17} className="text-[hsl(var(--muted-foreground))]" /></div>{sources.isLoading ? <div className="p-4"><SkeletonRows count={4} /></div> : sources.isError ? <div className="p-4"><DataError label="portfolio sources" onRetry={() => sources.refetch()} /></div> : list.length === 0 ? <div className="p-5"><EmptyState title="No source scans yet" description="The first scan is usually the fastest way to surface overlooked companies already adjacent to your network." /></div> : <div>{list.map((source) => <div key={source.id} className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-5 py-4 last:border-0" data-testid={`portfolio-source-${source.id}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--muted))]"><Globe2 size={16} /></div><div className="min-w-0 flex-1"><a href={source.urlLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-sm font-bold hover:underline" data-testid={`link-portfolio-source-${source.id}`}>{source.urlLink.replace(/^https?:\/\//, '')}<ExternalLink size={12} className="shrink-0 text-[hsl(var(--muted-foreground))]" /></a><div className="mt-1 flex gap-3 text-[10px] text-[hsl(var(--muted-foreground))]"><span>{formatDate(source.createdAt)}</span><span className="font-mono">{source.companyCount} companies</span></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${source.status === 'Scanned' ? 'bg-[#e8eba9] text-[#3d421a]' : source.status === 'Error' ? 'bg-[#f5d8d1] text-[#8f382e]' : 'bg-[#f5ead0] text-[#8b672b]'}`}>{source.status === 'Pending' && <LoaderCircle size={11} className="mr-1 inline animate-spin" />}{source.status}</span></div>)}</div>}</section></div>
  </PageFrame>;
}

function PageFrame({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <div className="vf-grid min-h-[calc(100dvh-68px)] px-4 py-6 sm:px-8 lg:px-9"><div className="mx-auto max-w-[1180px]"><div className="vf-reveal flex flex-col justify-between gap-5 border-b border-[hsl(var(--border))] pb-7 sm:flex-row sm:items-end"><div><div className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">{eyebrow}</div><h1 className="font-[Space_Grotesk] text-3xl font-bold tracking-[-.04em] sm:text-[38px]">{title}</h1><p className="mt-2 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">{description}</p></div>{action}</div><div className="vf-reveal vf-reveal-delay-1 mt-7">{children}</div></div></div>;
}

const providerFields: Record<ProviderName, Array<{ key: string; label: string; placeholder: string }>> = {
  github: [{ key: 'token', label: 'Personal access token', placeholder: 'github_pat_…' }],
  stripe: [
    { key: 'secretKey', label: 'Secret key', placeholder: 'sk_live_… or sk_test_…' },
    { key: 'webhookSecret', label: 'Webhook signing secret', placeholder: 'whsec_…' },
  ],
  notion: [
    { key: 'token', label: 'Internal integration token', placeholder: 'ntn_…' },
    { key: 'databaseId', label: 'Destination database ID', placeholder: 'Optional Notion database ID' },
  ],
  google_sheets: [
    { key: 'accessToken', label: 'Google access token', placeholder: 'OAuth access token' },
    { key: 'spreadsheetId', label: 'Destination spreadsheet ID', placeholder: 'Spreadsheet ID' },
  ],
  slack: [
    { key: 'token', label: 'Bot token', placeholder: 'xoxb-…' },
    { key: 'channelId', label: 'Alert channel ID', placeholder: 'C…' },
  ],
};

function IntegrationVaultDialog({ provider, onClose, onSaved }: { provider: IntegrationConnection; onClose: () => void; onSaved: () => void }) {
  const save = useSaveIntegrationVault();
  const [label, setLabel] = useState(`${provider.displayName} workspace`);
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = providerFields[provider.provider];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172039]/50 p-4" role="dialog" aria-modal="true" data-testid="dialog-integration-vault">
    <div className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Protected vault</div><h2 className="mt-1 font-[Space_Grotesk] text-2xl font-bold">Connect {provider.displayName}</h2><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Values are sent over the secured API and encrypted at rest. They are never returned to this page.</p></div>
        <button onClick={onClose} className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-close-integration-dialog"><X size={18} /></button>
      </div>
      <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate({ provider: provider.provider, data: { label, values } }, { onSuccess: () => { onSaved(); onClose(); }, onError: () => window.alert(`Could not save ${provider.displayName}. Check the server configuration.`) }); }}>
        <label className="block"><span className="mb-1.5 block text-xs font-bold">Connection label</span><input value={label} onChange={(event) => setLabel(event.target.value)} required className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--foreground))]" data-testid="input-integration-label" /></label>
        {fields.map((field) => <label key={field.key} className="block"><span className="mb-1.5 block text-xs font-bold">{field.label}</span><input type="password" value={values[field.key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} required={field.key === 'token' || field.key === 'secretKey' || field.key === 'accessToken'} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--foreground))]" data-testid={`input-integration-${field.key}`} /></label>)}
        <div className="flex items-center justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]">Cancel</button><button disabled={save.isPending} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50" data-testid="button-save-integration">{save.isPending && <LoaderCircle size={14} className="animate-spin" />} Encrypt & save</button></div>
      </form>
    </div>
  </div>;
}

function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [vaultProvider, setVaultProvider] = useState<IntegrationConnection | null>(null);
  const health = useHealthCheck();
  const integrations = useListIntegrations({ query: { queryKey: getListIntegrationsQueryKey() } });
  const verify = useVerifyIntegration();
  const testDelivery = useTestIntegrationDelivery();
  const disconnect = useDisconnectIntegration();
  const billing = useGetBillingStatus();
  const billingPortal = useCreateBillingPortal();
  const connections = integrations.data ?? [];
  const integrationIcon = (provider: ProviderName) => provider === 'notion' ? BookOpen : provider === 'stripe' ? Gauge : provider === 'github' ? Github : Database;
  const verifyConnection = (provider: ProviderName) => verify.mutate({ provider }, { onSuccess: (result) => { integrations.refetch(); window.alert(result.message); }, onError: () => window.alert('Verification failed. Reconnect the provider or update its vault values.') });
  const sendTestDelivery = (provider: ProviderName) => testDelivery.mutate({ provider, data: { message: 'VentureForge test delivery — your destination is ready for signal alerts.' } }, { onSuccess: (result) => window.alert(result.message), onError: () => window.alert('Delivery test failed. Verify the provider and destination ID.') });
  return <PageFrame eyebrow="Workspace / controls" title="Settings" description="Keep your sourcing environment aligned with the way your team makes decisions." action={<div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]"><ShieldCheck size={15} /> Admin workspace</div>}>
     <div className="grid gap-5 lg:grid-cols-[1fr_310px]"><div className="space-y-5"><section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"><div className="flex items-center gap-3 border-b border-[hsl(var(--border))] pb-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8eba9]"><BriefcaseBusiness size={17} /></div><div><h2 className="font-[Space_Grotesk] font-bold">Organization</h2><p className="text-[11px] text-[hsl(var(--muted-foreground))]">Identity and default desk preferences.</p></div></div><div className="grid gap-4 pt-5 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-bold">Organization name</span><input defaultValue="Northstar Ventures" className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--foreground))]" data-testid="input-organization-name" /></label><label><span className="mb-1.5 block text-xs font-bold">Primary geography</span><select defaultValue="South Asia" className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none" data-testid="select-primary-geography">{regions.map((region) => <option key={region}>{region}</option>)}</select></label></div><button onClick={() => setSaved(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-white" data-testid="button-save-organization">{saved && <Check size={14} />} {saved ? 'Saved' : 'Save changes'}</button></section><section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="border-b border-[hsl(var(--border))] p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-[Space_Grotesk] font-bold">Integrations</h2><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">OAuth connectors or encrypted organization vault values. Secrets never appear in the UI.</p></div><LockKeyhole size={17} className="text-[hsl(var(--muted-foreground))]" /></div></div>{integrations.isLoading ? <div className="space-y-3 p-5"><SkeletonRows count={5} /></div> : integrations.isError ? <div className="p-5"><DataError label="integrations" onRetry={() => integrations.refetch()} /></div> : <div>{connections.map((connection) => { const Icon = integrationIcon(connection.provider); const configured = connection.status === 'vault_configured' || connection.status === 'connected'; const delivery = connection.category === 'delivery'; return <div key={connection.provider} className="flex flex-col gap-3 border-b border-[hsl(var(--border))] p-5 last:border-0 sm:flex-row sm:items-center"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--muted))]"><Icon size={17} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="text-sm font-bold">{connection.displayName}</div><span className={`flex items-center gap-1.5 text-[10px] font-bold ${configured ? 'text-[#667520]' : 'text-[hsl(var(--muted-foreground))]'}`}><span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-[#89952c]' : 'bg-[#b8aa8c]'}`} />{connection.status === 'vault_configured' ? 'Vault configured' : connection.status === 'connected' ? 'Connected' : connection.status === 'needs_reauthorization' ? 'Needs verification' : 'Not connected'}</span></div><div className="mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]">{connection.detail}</div></div><div className="flex shrink-0 items-center gap-2">{configured && <button onClick={() => verifyConnection(connection.provider)} disabled={verify.isPending} className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-[11px] font-bold hover:bg-[hsl(var(--muted))] disabled:opacity-50" data-testid={`button-verify-${connection.provider}`}>Verify</button>}{configured && delivery && <button onClick={() => sendTestDelivery(connection.provider)} disabled={testDelivery.isPending} className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-[11px] font-bold hover:bg-[hsl(var(--muted))] disabled:opacity-50" data-testid={`button-test-delivery-${connection.provider}`}>Test delivery</button>}{configured ? <button onClick={() => { if (window.confirm(`Remove ${connection.displayName} from this workspace?`)) disconnect.mutate({ provider: connection.provider }, { onSuccess: () => integrations.refetch() }); }} className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-[11px] font-bold hover:border-[#b35b4f] hover:text-[#b35b4f]" data-testid={`button-disconnect-${connection.provider}`}>Disconnect</button> : <button onClick={() => setVaultProvider(connection)} className="rounded-md bg-[hsl(var(--primary))] px-3 py-2 text-[11px] font-bold text-white hover:opacity-90" data-testid={`button-connect-${connection.provider}`}>Configure securely</button>}</div></div>; })}</div>}</section></div><aside className="space-y-5"><section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"><div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]"><Gauge size={16} /><span className="font-mono text-[10px] uppercase tracking-[.15em]">Plan & usage</span></div><div className="mt-4 font-[Space_Grotesk] text-2xl font-bold">{billing.data?.tier ?? 'Partner desk'}</div><div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{billing.data?.subscriptionStatus === 'active' ? 'Active subscription' : billing.data?.subscriptionStatus ?? 'Billing status loading'}</div><div className="mt-5 h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className="h-full w-[68%] rounded-full bg-[hsl(var(--accent))]" /></div><div className="mt-2 flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]"><span>680 / 1,000 profiles</span><span>68%</span></div><button disabled={billingPortal.isPending || !billing.data?.hasCustomer} onClick={() => billingPortal.mutate(undefined, { onSuccess: (result) => window.location.assign(result.url), onError: () => window.alert(billing.data?.stripeConnected ? 'No Stripe customer is attached yet.' : 'Connect Stripe before opening billing.') })} className="mt-5 flex w-full items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-manage-billing">Manage billing <ArrowUpRight size={14} /></button></section><section className="rounded-xl border border-[hsl(var(--border))] bg-[#e8eba9] p-5"><div className="flex items-center gap-2 text-[#4c531c]"><LockKeyhole size={15} /><span className="font-mono text-[10px] uppercase tracking-[.15em]">Data posture</span></div><p className="mt-3 text-sm font-semibold leading-6 text-[#3e431c]">Your desk is private by default. Signals are visible only to your organization.</p><div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-[#667520]"><span className={`h-1.5 w-1.5 rounded-full ${health.isError ? 'bg-[#b35b4f]' : 'bg-[#89952c]'}`} /> {health.isError ? 'Service needs attention' : 'All systems operational'}</div></section></aside></div>{vaultProvider && <IntegrationVaultDialog provider={vaultProvider} onClose={() => setVaultProvider(null)} onSaved={() => integrations.refetch()} />}
  </PageFrame>;
}

function Router() {
  return <RoutedErrorBoundary><Shell><Switch><Route path="/" component={Dashboard} /><Route path="/saved-searches" component={SavedSearchesPage} /><Route path="/portfolio" component={PortfolioPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></Shell></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;