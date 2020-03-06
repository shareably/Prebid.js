const WINNING_BIDS_WITH_SHARING_FUNCTION = 'getWinningBidsWithSharing'

function getOverrides() {
  return window.sblyPrebidOverrides || {};
}

export function overrideGetWinningBidsWithSharing() {
  return getOverrides()[WINNING_BIDS_WITH_SHARING_FUNCTION]
}
