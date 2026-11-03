/** Layout uses logical pixels and usable text width, never device model guesses. */
export function mobileLayout(width: number, fontScale = 1, bottomInset = 0) {
  const readableWidth = width / Math.max(1, fontScale);
  const gutter = width >= 700 ? 20 : 16;
  return {
    gutter,
    compact: readableWidth < 360,
    largeText: fontScale >= 1.3,
    wide: readableWidth >= 700,
    contentWidth: Math.min(Math.max(0, width - gutter * 2), 1200),
    dockWidth: Math.min(Math.max(0, width - 32), 440),
    dockHeight: fontScale >= 1.3 ? 76 : 68,
    dockBottom: Math.max(bottomInset, 12),
    scrollBottom: (fontScale >= 1.3 ? 76 : 68) + Math.max(bottomInset, 12) + 24,
    listColumns: readableWidth < 700 ? 1 : readableWidth < 1150 ? 2 : 3,
    productColumns: readableWidth < 350 ? 1 : readableWidth < 600 ? 2 : readableWidth < 900 ? 3 : 4,
    actionColumns: readableWidth < 360 ? 2 : 4,
  };
}
