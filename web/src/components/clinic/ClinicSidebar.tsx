import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen,
  Search, Store, X, type LucideIcon,
} from 'lucide-react';

type NavigationItem = { name: string; path: string; icon: LucideIcon; fKey?: number };
type NavigationSection = { id: string; label: string; icon: LucideIcon; items: NavigationItem[]; defaultOpen?: boolean };
interface ClinicSidebarProps {
  primary: NavigationItem[];
  sections: NavigationSection[];
  settings: NavigationItem[];
  activePath?: string;
  shopName: string;
  branchControl?: React.ReactNode;
  logoUrl?: string;
  onLogoError: () => void;
  mobileOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

const PREFERENCE_KEY = 'nexsyrus.sidebar.collapsed';

export function ClinicSidebar({ primary, sections, settings, activePath, shopName, branchControl, logoUrl, onLogoError, mobileOpen, onClose, onSignOut }: ClinicSidebarProps) {
  const [preference, setPreference] = useState<boolean | null>(() => {
    try {
      const saved = localStorage.getItem(PREFERENCE_KEY);
      return saved === 'true' ? true : saved === 'false' ? false : null;
    } catch { return null; }
  });
  const [tablet, setTablet] = useState(() => window.matchMedia('(min-width: 481px) and (max-width: 1100px)').matches);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, { expanded: boolean; path?: string }>>({});
  const searchRequested = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const compact = !mobileOpen && (preference ?? tablet);
  const search = query.trim().toLocaleLowerCase();
  const allItems = [...primary, ...sections.flatMap(section => section.items), ...settings];
  const matches = (item: NavigationItem) => {
    const aliases: Record<string, string> = { '/inventory': 'stock medicines batches', '/billing': 'sales invoices pos', '/customers': 'patients' };
    return !search || `${item.name} ${aliases[item.path] ?? ''}`.toLocaleLowerCase().includes(search);
  };
  const resultCount = allItems.filter(matches).length;

  const changeCompact = (value: boolean) => {
    setPreference(value);
    try { localStorage.setItem(PREFERENCE_KEY, String(value)); } catch { /* Navigation also works without storage. */ }
  };
  const focusSearch = () => {
    searchRequested.current = true;
    changeCompact(false);
  };

  useEffect(() => {
    const media = window.matchMedia('(min-width: 481px) and (max-width: 1100px)');
    const update = () => setTablet(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (window.matchMedia('(max-width: 480px)').matches && !mobileOpen) return;
      event.preventDefault();
      if (inputRef.current) { inputRef.current.focus(); return; }
      searchRequested.current = true;
      setPreference(false);
      try { localStorage.setItem(PREFERENCE_KEY, 'false'); } catch { /* Optional preference. */ }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [mobileOpen]);

  useEffect(() => {
    if (!searchRequested.current || compact) return;
    inputRef.current?.focus();
    searchRequested.current = false;
  }, [compact]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activePath, compact]);

  const renderLink = (item: NavigationItem, inMenu = false) => {
    const Icon = item.icon;
    const link = (
      <Link key={item.path} to={item.path}
        aria-label={compact && !inMenu ? item.name : undefined}
        aria-current={activePath === item.path ? 'page' : undefined}
        aria-keyshortcuts={item.fKey ? `F${item.fKey}` : undefined}
        title={compact && !inMenu ? `${item.name}${item.fKey ? ` · F${item.fKey}` : ''}` : undefined}
        className={`sidebar-link${inMenu ? ' sidebar-menu-link' : ''}`}
        onClick={() => { setQuery(''); if (mobileOpen) onClose(); }}>
        <span className="sidebar-link-icon"><Icon size={18} strokeWidth={1.8} aria-hidden /></span>
        <span className="sidebar-link-label">{item.name}</span>
        {item.fKey && <kbd className="sidebar-shortcut" aria-hidden>F{item.fKey}</kbd>}
        {activePath === item.path && <ChevronRight className="sidebar-active-chevron" size={15} aria-hidden />}
      </Link>
    );
    return inMenu ? <DropdownMenu.Item key={item.path} asChild>{link}</DropdownMenu.Item> : link;
  };

  return (
    <aside id="clinic-navigation" className="workspace-sidebar" data-compact={compact}
      role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label="Main navigation">
      <header className="sidebar-brand">
        <Link to="/dashboard" className="sidebar-brand-link" aria-label={`${shopName} · Dashboard`} title={shopName} onClick={onClose}>
          <span className="sidebar-brand-mark">
            {logoUrl ? <img src={logoUrl} alt="" onError={onLogoError} /> : <Store size={21} strokeWidth={1.8} aria-hidden />}
          </span>
          <span className="sidebar-brand-copy"><span className="sidebar-shop-name">{shopName}</span><span className="sidebar-brand-product">Nexsyrus workspace</span></span>
        </Link>
        <button type="button" className="sidebar-toggle" onClick={() => changeCompact(!compact)}
          aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} title={compact ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!compact}>
          {compact ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
        </button>
        <button type="button" className="liquid-menu-close" onClick={onClose} aria-label="Close navigation"><X size={18} aria-hidden /></button>
      </header>

      {!compact && branchControl && <div className="px-3 pb-2">{branchControl}</div>}
      <div className="sidebar-search-area">
        {compact ? <button type="button" className="sidebar-search-trigger" aria-label="Find a page" title="Find a page (/)" onClick={focusSearch}><Search size={18} aria-hidden /></button> : (
          <div className="sidebar-search">
            <Search size={16} aria-hidden />
            <input ref={inputRef} type="search" aria-label="Find a page" placeholder="Find a page" value={query} onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); }
                else if (event.key === 'Escape' && !mobileOpen) inputRef.current?.blur();
                if (event.key === 'ArrowDown') { event.preventDefault(); navRef.current?.querySelector<HTMLAnchorElement>('a')?.focus(); }
                if (event.key === 'Enter' && search) navRef.current?.querySelector<HTMLAnchorElement>('a')?.click();
              }} />
            {query ? <button type="button" aria-label="Clear navigation search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}><X size={14} aria-hidden /></button> : <kbd aria-hidden>/</kbd>}
          </div>
        )}
      </div>

      <nav ref={navRef} className="sidebar-navigation" aria-label="Workspace pages">
        {search && <p className="sidebar-search-summary" role="status">{resultCount} {resultCount === 1 ? 'page' : 'pages'} found</p>}
        {primary.some(matches) && <section className="sidebar-section" aria-label="Daily workspace">
          <p className="sidebar-section-caption">Workspace</p>
          <div className="sidebar-links">{primary.filter(matches).map(item => renderLink(item))}</div>
        </section>}
        {sections.some(section => section.items.some(matches)) && !compact && <div className="sidebar-category-heading"><span>Pharmacy workspace</span><span aria-hidden>{sections.filter(section => section.items.some(matches)).length}</span></div>}
        {sections.map(section => {
          const items = section.items.filter(matches);
          if (!items.length) return null;
          const hasActive = section.items.some(item => item.path === activePath);
          const saved = openSections[section.id];
          const expanded = Boolean(search || (hasActive && saved?.path !== activePath) || (saved?.expanded ?? (hasActive || section.defaultOpen)));
          const Icon = section.icon;
          if (compact) return (
            <DropdownMenu.Root key={section.id}>
              <DropdownMenu.Trigger asChild><button type="button" className={`sidebar-group-trigger${hasActive ? ' is-active' : ''}`} aria-label={`${section.label} pages`} title={section.label}>
                <span className={`sidebar-section-icon sidebar-icon-${section.id}`}><Icon size={19} strokeWidth={1.8} aria-hidden /></span><ChevronRight size={11} className="sidebar-group-hint" aria-hidden />
              </button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content className="sidebar-flyout" side="right" align="start" sideOffset={10} collisionPadding={12}>
                <DropdownMenu.Label className="sidebar-flyout-title">{section.label}</DropdownMenu.Label>
                {section.items.map(item => renderLink(item, true))}
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
          return <section key={section.id} className="sidebar-section sidebar-tool-section">
            <button type="button" className={`sidebar-section-toggle${hasActive ? ' has-active-page' : ''}`} aria-expanded={expanded} aria-controls={`sidebar-group-${section.id}`}
              onClick={() => setOpenSections(current => ({ ...current, [section.id]: { expanded: !expanded, path: activePath } }))} disabled={Boolean(search)}>
              <span className={`sidebar-section-icon sidebar-icon-${section.id}`}><Icon size={18} strokeWidth={1.8} aria-hidden /></span>
              <span className="sidebar-section-label">{section.label}</span><ChevronRight className="sidebar-section-chevron" size={14} aria-hidden />
            </button>
            <div id={`sidebar-group-${section.id}`} className="sidebar-links sidebar-nested-links" hidden={!expanded}>{items.map(item => renderLink(item))}</div>
          </section>;
        })}
        {search && settings.some(matches) && <section className="sidebar-section" aria-label="Settings search results"><p className="sidebar-section-caption">Settings</p><div className="sidebar-links">{settings.filter(matches).map(item => renderLink(item))}</div></section>}
        {search && !resultCount && <div className="sidebar-search-empty"><Search size={22} aria-hidden /><strong>No matching pages</strong><span>Try “stock”, “sales” or “reports”.</span><button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>Clear search</button></div>}
      </nav>

      <footer className="sidebar-footer">
        {!search && <div className="sidebar-links">{settings.map(item => renderLink(item))}</div>}
        <div className="sidebar-footer-bottom">
          <span className="sidebar-workspace-label">Nexsyrus POS</span>
          <button type="button" className="sidebar-sign-out" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={16} aria-hidden /><span>Sign out</span></button>
        </div>
      </footer>
    </aside>
  );
}
