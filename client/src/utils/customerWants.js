export const WANT_STATUSES = ['New', 'In Progress', 'Fulfilled', 'Closed'];

export const WANT_STATUS_TONE = {
  New: 'orange',
  'In Progress': 'blue',
  Fulfilled: 'green',
  Closed: 'neutral',
};

export function boardVisibilityLabel(want) {
  if (want.boardApproved) return 'On board';
  if (want.shareOnBoardOptIn) return 'Opted in';
  return 'Private';
}

export function boardVisibilityTone(want) {
  if (want.boardApproved) return 'green';
  if (want.shareOnBoardOptIn) return 'blue';
  return 'neutral';
}
