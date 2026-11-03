import { useRef, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
}

/** One dialog primitive owns focus, scroll locking, Escape and nested overlays. */
export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
    const previousFocus = useRef<HTMLElement | null>(null);
    return (
        <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal-overlay fixed inset-0 z-50 bg-overlay/35" />
                <Dialog.Content aria-describedby={undefined}
                    onOpenAutoFocus={() => { previousFocus.current = document.activeElement as HTMLElement | null; }}
                    onCloseAutoFocus={event => { if (previousFocus.current?.isConnected) { event.preventDefault(); previousFocus.current.focus(); } }}
                    className="glass-dialog modal-content fixed z-50 w-[calc(100%_-_2rem)] max-w-lg bg-surface border border-border shadow-2xl flex flex-col outline-none">
                    <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border shrink-0 gap-3">
                        <Dialog.Title className="text-lg font-semibold text-foreground-strong">{title}</Dialog.Title>
                        <Dialog.Close asChild>
                            <button type="button" aria-label="Close dialog" title="Close dialog" className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-muted hover:text-foreground-strong hover:bg-surface-alt transition-colors">
                                <X size={18} aria-hidden />
                            </button>
                        </Dialog.Close>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 text-foreground">{children}</div>
                    {footer && <div className="p-4 sm:p-6 border-t border-border bg-surface-elevated flex flex-wrap justify-end gap-3 shrink-0">{footer}</div>}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
