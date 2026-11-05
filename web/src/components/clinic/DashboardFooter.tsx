import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChartNoAxesCombined, PackagePlus, Pause, Play, Plus, RotateCcw } from 'lucide-react';

const tools = [
  { to: '/purchases', label: 'Purchases', detail: 'Keep your shelves ready', icon: PackagePlus },
  { to: '/shortbook', label: 'Reorder', detail: 'Stay one step ahead', icon: RotateCcw },
  { to: '/reports', label: 'Reports', detail: 'Find your next insight', icon: ChartNoAxesCombined },
];

export function DashboardFooter() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    // Keep decorative animation asleep while the footer is outside the workspace viewport.
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <footer ref={ref} className="dashboard-brand-panel" data-visible={visible} data-motion-paused={paused} aria-label="Nexsyrus pharmacy workspace">
      <div className="dashboard-brand-header">
        <div className="dashboard-brand-lockup"><span className="dashboard-brand-mark"><Plus size={19} aria-hidden /></span><span>nexsyrus<span className="dashboard-brand-period">.</span></span></div>
        <div className="dashboard-brand-header-end">
          <span className="dashboard-brand-eyebrow">YOUR EVERYDAY, ELEVATED</span>
          <button type="button" className="dashboard-brand-motion-toggle" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume footer animation' : 'Pause footer animation'} aria-pressed={paused} title={paused ? 'Resume animation' : 'Pause animation'}>
            {paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
          </button>
        </div>
      </div>

      <div className="dashboard-brand-main">
        <div className="dashboard-brand-story">
          <h2>Less admin.<br /><span>More care.</span></h2>
          <p>A little more space for what matters.</p>
          <Link className="dashboard-brand-cta" to="/billing/new">Create an invoice <span><ArrowUpRight size={16} aria-hidden /></span></Link>
        </div>

        <div className="dashboard-brand-art" aria-hidden="true">
          <div className="dashboard-brand-art-grid" />
          <div className="dashboard-brand-ring dashboard-brand-animated"><span /></div>
          <div className="dashboard-brand-ring dashboard-brand-ring-inner dashboard-brand-animated"><span /></div>
          <div className="dashboard-brand-cross dashboard-brand-animated"><Plus strokeWidth={0.8} /></div>
          <span className="dashboard-brand-art-caption">A little balance. A better day.</span>
        </div>

        <nav className="dashboard-brand-links" aria-label="More pharmacy tools">
          {tools.map(({ to, label, detail, icon: Icon }, index) => (
            <Link to={to} key={to} style={{ '--footer-link-index': index } as CSSProperties}>
              <span className="dashboard-brand-tool-icon"><Icon size={19} strokeWidth={1.5} aria-hidden /></span>
              <span className="dashboard-brand-link-copy"><strong>{label}</strong><span>{detail}</span></span>
              <span className="dashboard-brand-tool-arrow"><ArrowUpRight size={17} strokeWidth={1.6} aria-hidden /></span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="dashboard-brand-bottom">
        <span><Plus size={11} aria-hidden /> Thoughtfully connected. Simply in control.</span>
        <span>© {new Date().getFullYear()} Nexsyrus</span>
      </div>
    </footer>
  );
}
