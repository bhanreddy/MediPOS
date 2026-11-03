import React from 'react';
import { X } from 'lucide-react';
import type { FestivalPoster } from '../hooks/useFestivalPoster';

interface FestivalPosterModalProps {
    poster: FestivalPoster | null;
    onDismiss: () => void;
}

export const FestivalPosterModal: React.FC<FestivalPosterModalProps> = ({ poster, onDismiss }) => {
    if (!poster || !poster.image_url) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70  animate-in fade-in duration-300"
            onClick={onDismiss}
        >
            <div
                className="relative mx-4 max-w-lg w-full animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onDismiss}
                    aria-label="Close festival poster"
                    className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-surface-elevated border border-border shadow-lg flex items-center justify-center text-foreground hover:scale-110 transition-transform"
                >
                    <X size={18} />
                </button>
                <img
                    src={poster.image_url}
                    alt={poster.title}
                    className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
                    onError={onDismiss}
                />
            </div>
        </div>
    );
};
