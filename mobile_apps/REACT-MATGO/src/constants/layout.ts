export function getScreenTopPadding(topInset: number) {
  return topInset + (topInset >= 50 ? 10 : 18);
}

export function getBottomTabsBottomOffset(bottomInset: number) {
  return bottomInset > 0 ? Math.max(bottomInset - 8, 12) : 20;
}

export function getBottomTabsContentPadding(bottomInset: number) {
  return getBottomTabsBottomOffset(bottomInset) + 126;
}

export function getStickyHeaderTopInset(topInset: number) {
  return topInset + 8;
}

export function getRestaurantHeroTopInset(topInset: number) {
  return Math.max(topInset - 14, 18);
}
