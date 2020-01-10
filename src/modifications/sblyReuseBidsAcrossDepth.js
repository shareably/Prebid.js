import includes from 'core-js/library/fn/array/includes';

const utils = require('../utils.js');

function find(array, fn) {
  return array.filter(fn)[0];
}

function assignBidsByMaximum(adUnitCodes, bidsGroupedByBaseAdUnitCode, assignedAdIds) {
  const mapping = {};
  adUnitCodes.forEach(adUnitCode => {
    const maximumByUnitSpecific = bidsGroupedByBaseAdUnitCode[adUnitCode]
  })
}

function groupByFunction(xs, func) {
  return xs.reduce(function(rv, x) {
    (rv[func(x)] = rv[func(x)] || []).push(x);
    return rv;
  }, {});
}

function canUseBidForSharedPool(bid) {
  const biddersWithIndividualPlacements = ['ix', 'sovrn'];
  return !includes(biddersWithIndividualPlacements, bid.bidder.toLowerCase()) && isDynamicRepeatingAdUnit(bid.adUnitCode);
}

function getBaseAdUnitCode(adUnitCode) {
  return adUnitCode.replace(/-depth-\d+/gm, '');
}

function isDynamicRepeatingAdUnit(adUnitCode) {
  return new RegExp(/-depth-\d+/gm).test(adUnitCode)
}

function sortedBidsByHighestCPM(bidsGroupedByAdUnitCode) {
  const sorted = {};
  Object.keys(bidsGroupedByAdUnitCode).forEach(key => {
    const bidsForAdCode = bidsGroupedByAdUnitCode[key];
    sorted[key] = bidsForAdCode.sort((bid, otherBid) => otherBid.cpm - bid.cpm);
  })
  return sorted;
}

export function getWinningBidsWithSharing(originalWinningBids, adUnitCodes, bidsReceived) {
  const bidsGroupedByBaseAdUnitCode = sortedBidsByHighestCPM(groupByFunction(bidsReceived, (bid) => {
    if (canUseBidForSharedPool(bid)) {
      return getBaseAdUnitCode(bid.adUnitCode)
    } else {
      return bid.adUnitCode;
    }
  }));

  const groupedByUnitCode = originalWinningBids.reduce((acc, next) => {
    acc[next.adUnitCode] = next;
    return acc;
  }, {})

  utils.logMessage('Grouped', bidsGroupedByBaseAdUnitCode, groupedByUnitCode)

  const winningBidAssignments = {};
  const assignedAdIds = new Set();

  // assignment by most constrained
  adUnitCodes.forEach(adUnitCode => {
    const mostConstrainedWinningBid = (bidsGroupedByBaseAdUnitCode[adUnitCode] || [])[0];
    if (mostConstrainedWinningBid) {
      winningBidAssignments[adUnitCode] = mostConstrainedWinningBid;
      assignedAdIds.add(mostConstrainedWinningBid.adId)
    } else {
      winningBidAssignments[adUnitCode] = null;
    }
  })

  // get sorted list of lowest cpm to highest cpm ad unit codes
  const sortedAdUnitCodesByLowestCPM = Object.keys(winningBidAssignments).sort((adUnitCode, otherAdUnitCode) => {
    const bidCPM = winningBidAssignments[adUnitCode] ? winningBidAssignments[adUnitCode].cpm : 0;
    const otherBidCPM = winningBidAssignments[otherAdUnitCode] ? winningBidAssignments[otherAdUnitCode].cpm : 0;
    return bidCPM - otherBidCPM;
  });

  utils.logMessage('By lowest value', sortedAdUnitCodesByLowestCPM.map(adUnitCode => {
    return { adUnitCode, cpm: (winningBidAssignments[adUnitCode] || {}).cpm || 0 }
  }))

  // re-assign least value to shared pool
  sortedAdUnitCodesByLowestCPM.forEach(adUnitCode => {
    if (isDynamicRepeatingAdUnit(adUnitCode)) {
      const currentBid = winningBidAssignments[adUnitCode];
      const possibleReplacementBids = bidsGroupedByBaseAdUnitCode[getBaseAdUnitCode(adUnitCode)] || [];
      const betterBid = find(possibleReplacementBids, (bid) => {
        const isNotAssigned = !assignedAdIds.has(bid.adId);
        const isHigherCPM = bid.cpm > ((currentBid || {}).cpm || 0)
        return isNotAssigned && isHigherCPM;
      })
      if (betterBid) {
        assignedAdIds.add(betterBid.adId);
        winningBidAssignments[adUnitCode] = betterBid;
      }
    }
  })

  const changeSummaries = [];

  // have as little change as possible with original bids
  adUnitCodes.forEach(adUnitCode => {
    const winningBid = winningBidAssignments[adUnitCode]
    if (isDynamicRepeatingAdUnit(adUnitCode) && winningBid) {
      if (winningBid.adUnitCode !== adUnitCode) {
        const adUnitCodeWithOriginalBid = find(adUnitCodes,  code => {
          return winningBidAssignments[code] ? winningBidAssignments[code].adUnitCode === adUnitCode : false;
        })
        if (adUnitCodeWithOriginalBid) {
          const originalBid = winningBidAssignments[adUnitCodeWithOriginalBid];
          winningBidAssignments[adUnitCodeWithOriginalBid] = winningBid;
          winningBidAssignments[adUnitCode] = originalBid;
        }

        const priorBid = groupedByUnitCode[adUnitCode] || {};
        const finalBid = winningBidAssignments[adUnitCode];

        if (adUnitCode === finalBid.adUnitCode) {
          changeSummaries.push({
            adUnitCode,
            status: 'NOT CHANGED - Swapped Successfully',
          })
        } else {
          changeSummaries.push({
            adUnitCode,
            status: 'CHANGED - Better Bid Found',
            adUnitCodeUsed: finalBid.adUnitCode,
            priorCPM: priorBid.cpm || 0,
            finalCPM: finalBid.cpm,
            gain: finalBid.cpm - priorBid.cpm,
          })
        }
      } else {
        changeSummaries.push({
          adUnitCode,
          status: 'NOT CHANGED - Original Bid',
        })
      }
    } else {
      changeSummaries.push({
        adUnitCode,
        status: 'NOT CHANGED - Not Dynamic Depth Bid or No Bid'
      })
    }
  })

  const originalTotal = originalWinningBids.reduce((acc, next) => acc + next.cpm, 0);
  const reassignedBidTotal = Object.values(winningBidAssignments).filter(bid => bid).reduce((acc, next) => acc + next.cpm, 0);
  const gainAmount = reassignedBidTotal - originalTotal;
  const gainPercentage = gainAmount / originalTotal;
  const hasEnoughGain = gainAmount > 0.075 && gainPercentage > 0.005;

  utils.logMessage('Change Summary', changeSummaries, 'Final Assignments', winningBidAssignments);
  utils.logMessage('Gain Summary', { hasEnoughGain, gainAmount, reassignedBidTotal, originalTotal, gainPercentage: Math.round(gainPercentage * 100, 6) });

  if (hasEnoughGain) {
    // map out final winning bids
    const winningBids = Object.keys(winningBidAssignments).map(adUnitCode => {
      const winningBid = winningBidAssignments[adUnitCode];
      if (winningBid) {
        winningBid.adUnitCode = adUnitCode;
        return winningBid;
      } else {
        return null
      }
    }).filter(bid => bid);

    utils.logMessage('Using Modified Winning Bids', winningBids.reduce((acc, next) => Object.assign(acc, { [next.adUnitCode]: next }), {}));
    return winningBids;
  } else {
    utils.logMessage('Using Original Winning Bids', originalWinningBids.reduce((acc, next) => Object.assign(acc, { [next.adUnitCode]: next }), {}));
    return originalWinningBids;
  }
}
