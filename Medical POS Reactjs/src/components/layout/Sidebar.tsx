import React, { useMemo } from 'react';

import type { NavItem } from '../../config/navigation';
import { fKeySortOrder, sortNavItemsByFKey } from '../../config/navigation';
import { NAV_SIDEBAR_ICONS } from '../../config/appContent';

type EnrichedNav = NavItem & { icon: string };

interface SidebarItemProps {
    icon: string;
    abbr: string;
    fullLabel: string;
    shortcut?: string;
    badge?: string;
    active?: boolean;
    /** Visual index 1–12 for F-keys; shown as spine label */
    slotIndex?: number;
    onClick?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
    icon,
    abbr,
    fullLabel,
    shortcut,
    badge,
    active,
    slotIndex,
    onClick,
}) => {
    const tip = shortcut ? `${fullLabel} — ${shortcut}` : `${fullLabel} (sidebar)`;

    return (
        <button
            type="button"
            onClick={onClick}
            title={tip}
            aria-label={tip}
            className={`
                group relative w-full flex items-stretch gap-0 min-h-[4.25rem] rounded-2xl overflow-hidden
                transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-surface
                ${
                    active
                        ? 'bg-primary text-on-primary shadow-[0_6px_20px_-4px_rgba(0,0,0,0.45)] ring-1 ring-white/15'
                        : 'bg-surface-elevated/35 hover:bg-surface-elevated/90 text-muted hover:text-foreground-strong border border-border/50 hover:border-primary/25 hover:shadow-md'
                }
            `}
        >
            {/* F-key spine */}
            <div
                className={`
                flex flex-col items-center justify-center w-[1.35rem] shrink-0 text-[8px] font-mono font-black tabular-nums leading-none
                ${
                    active
                        ? 'bg-black/25 text-on-primary/95'
                        : 'bg-black/[0.06] text-muted group-hover:text-foreground-strong'
                }
            `}
                aria-hidden
            >
                {slotIndex != null ? (
                    <>
                        <span className="opacity-70 text-[6px] font-sans font-black tracking-tighter">F</span>
                        <span>{slotIndex}</span>
                    </>
                ) : (
                    <span className="text-[7px] opacity-50">·</span>
                )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 min-w-0">
                <span
                    className={`text-[1.3rem] leading-none transition-transform duration-200 ${active ? 'scale-110 drop-shadow-sm' : 'group-hover:scale-105'}`}
                    role="img"
                    aria-hidden
                >
                    {icon}
                </span>
                <span
                    className={`text-[8px] font-black uppercase tracking-tight leading-tight text-center line-clamp-2 max-w-full ${
                        active ? 'text-on-primary' : 'text-foreground-strong/90'
                    }`}
                >
                    {abbr}
                </span>
                {shortcut && (
                    <kbd
                        className={`
                        text-[7px] font-mono font-bold px-1 py-px rounded border tabular-nums
                        ${
                            active
                                ? 'bg-black/25 text-on-primary border-white/20'
                                : 'bg-background/80 text-muted border-border group-hover:text-foreground-strong'
                        }
                    `}
                    >
                        {shortcut}
                    </kbd>
                )}
            </div>

            {active && (
                <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-10 rounded-r-full bg-on-primary shadow-[0_0_14px_rgba(255,255,255,0.4)]"
                    aria-hidden
                />
            )}
            {badge && (
                <span className="absolute top-1 right-1 text-[6px] font-black px-1 py-px rounded bg-warning text-warning-foreground border border-warning/40 leading-none">
                    {badge}
                </span>
            )}
        </button>
    );
};

interface SidebarProps {
    activeNavId?: string | null;
    onNavigate?: (id: string) => void;
    navItems: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ activeNavId, onNavigate, navItems }) => {
    const enriched = useMemo((): EnrichedNav[] => {
        return navItems.map(item => ({
            ...item,
            icon: NAV_SIDEBAR_ICONS[item.id] ?? '❓',
        }));
    }, [navItems]);

    const { quickKeys, more } = useMemo(() => {
        const sorted = sortNavItemsByFKey(enriched);
        const keyed = sorted.filter((i): i is EnrichedNav & { key: string } => !!i.key);
        const unkeyed = sorted.filter(i => !i.key);
        return { quickKeys: keyed, more: unkeyed };
    }, [enriched]);

    return (
        <aside
            className="
            w-[6.25rem] shrink-0 flex flex-col
            bg-gradient-to-b from-surface via-surface to-surface-elevated
            border-r border-border
            shadow-[inset_-1px_0_0_rgba(255,255,255,0.04),6px_0_28px_-8px_rgba(0,0,0,0.18)]
            z-20
        "
        >
            {/* Brand strip */}
            <div className="relative px-2 pt-3 pb-2.5 border-b border-border/80 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/12 via-transparent to-primary/8 pointer-events-none" />
                <p className="relative text-[9px] font-black uppercase tracking-[0.18em] text-foreground-strong leading-tight text-center">
                    MedPOS
                </p>
                <p className="relative text-[7px] font-bold text-muted text-center mt-1 tracking-wide">F1 → F12</p>
                <div className="relative mt-2 h-px w-full bg-gradient-to-r from-transparent via-primary/35 to-transparent rounded-full" />
            </div>

            <nav className="flex-1 w-full overflow-y-auto overflow-x-hidden py-2.5 px-1.5 space-y-3 min-h-0">
                <div className="space-y-1">
                    <p className="px-1 text-[7px] font-black uppercase tracking-[0.14em] text-primary/80">Quick keys</p>
                    <div className="flex flex-col gap-1.5">
                        {quickKeys.map(item => (
                            <SidebarItem
                                key={item.id}
                                icon={item.icon}
                                abbr={item.abbr}
                                fullLabel={item.label}
                                shortcut={item.key}
                                badge={item.badge}
                                slotIndex={fKeySortOrder(item.key)}
                                active={activeNavId === item.id}
                                onClick={() => onNavigate?.(item.id)}
                            />
                        ))}
                    </div>
                </div>

                {more.length > 0 && (
                    <>
                        <div className="flex items-center gap-1.5 px-1 pt-1">
                            <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                            <span className="text-[7px] font-black uppercase tracking-widest text-muted whitespace-nowrap">More</span>
                            <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {more.map(item => (
                                <SidebarItem
                                    key={item.id}
                                    icon={item.icon}
                                    abbr={item.abbr}
                                    fullLabel={item.label}
                                    badge={item.badge}
                                    active={activeNavId === item.id}
                                    onClick={() => onNavigate?.(item.id)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </nav>
        </aside>
    );
};
