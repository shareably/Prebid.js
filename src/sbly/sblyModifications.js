import { getWinningBidsWithSharing as defaultGetWinningBidsWithSharing }  from './features/shareBids.js';
export { useFakeGeneratedBids, fakeBidResponsesForBidRequest } from './features/generateFakeBids.js';

import { overrideGetWinningBidsWithSharing } from './sblyOverrides';

const CUSTOM_BID_USE_FUNCTION = 'canUseBidForAdUnitCode'
const SORTED_AD_UNIT_CODES_BY_PRIORITY_FUNCTION = 'getAdUnitCodesBasedOnPriority'

function getCustomFunctionMapping() {
  return window.sblyPrebidCustomFunctions || {};
}

function getCustomBidUseFunction() {
  return getCustomFunctionMapping()[CUSTOM_BID_USE_FUNCTION];
}

function getAdUnitCodesBasedOnPriority() {
  return getCustomFunctionMapping()[SORTED_AD_UNIT_CODES_BY_PRIORITY_FUNCTION];
}

export function getWinningBidsWithSharing(originalWinningBids, adUnitCodes, bidsReceived) {
  var functionToUse = overrideGetWinningBidsWithSharing() || defaultGetWinningBidsWithSharing;
  return functionToUse(originalWinningBids, adUnitCodes, bidsReceived, getCustomBidUseFunction(), getAdUnitCodesBasedOnPriority())
}
