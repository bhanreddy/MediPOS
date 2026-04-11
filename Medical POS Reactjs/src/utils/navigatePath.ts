/**
 * Updates browser URL and notifies MainApp (popstate listener) so inline routing stays in sync.
 */
export function navigatePath(path: string): void {
    try {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) {
        console.error('navigatePath failed', e);
    }
}
