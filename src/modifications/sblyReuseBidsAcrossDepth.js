import includes from 'core-js/library/fn/array/includes';
import { lap } from './lap.js';

const utils = require('../utils.js');
const INVALID_ASSIGNMENT = "INVALID";

function find(array, fn) {
  return array.filter(fn)[0];
}

function groupByFunction(xs, func) {
  return xs.reduce(function(rv, x) {
    (rv[func(x)] = rv[func(x)] || []).push(x);
    return rv;
  }, {});
}

function uniqueBy(array, func) {
  const seen = {}
  return array.filter(element => {
    const value = func(element);
    if (seen[value]) {
      return false
    } else {
      seen[value] = true;
      return true;
    }
  })
}

function createMappingOfBidsAndAdUnitCodes(adUnitCodes, bidsReceived, customBidUseFunction) {
  const bidsForAdCode = {};
  const adUnitCodesForBidAdId = {};

  adUnitCodes.forEach(adUnitCode => {
    bidsForAdCode[adUnitCode] = [];
    bidsReceived.forEach(bid => {
      adUnitCodesForBidAdId[bid.adId] = adUnitCodesForBidAdId[bid.adId] || [];
      if (customBidUseFunction(adUnitCode, bid)) {
        bidsForAdCode[adUnitCode].push(bid);
        adUnitCodesForBidAdId[bid.adId].push(adUnitCode);
      }
    })
  })

  return { bidsForAdCode, adUnitCodesForBidAdId };
}

function createMaxCPMSumMatrix(adUnitCodes, bidsRecieved, customBidUseFunction) {
  const adUnitsToPad = bidsRecieved.length - adUnitCodes.length;
  const padAdUnits = adUnitsToPad > 0;
  const padBidsRecieved = adUnitsToPad < 0;

  const rowIndexToAdUnitCode = {};
  const columnIndexToBid = {};

  const matrixDimension = Math.max(adUnitCodes.length, bidsRecieved.length);
  const constraintMatrix = [];

  adUnitCodes.forEach((adUnitCode, rowIndex) => {
    const matrixRow = [];
    const bidsForAdCode = [];

    bidsRecieved.forEach((bid, columnIndex) => {
      if (customBidUseFunction(adUnitCode, bid)) {
        matrixRow.push(bid.cpm);
        bidsForAdCode.push(bid);
        columnIndexToBid[columnIndex] = bid;
      } else {
        matrixRow.push(INVALID_ASSIGNMENT);
        columnIndexToBid[columnIndex] = null;
      }
    })

    if (padBidsRecieved) {
      Array.from(Array(Math.abs(adUnitsToPad))).forEach(_ => {
        matrixRow.push(INVALID_ASSIGNMENT);
      })
    }

    rowIndexToAdUnitCode[rowIndex] = adUnitCode;
    constraintMatrix.push(matrixRow);
  })

  if (padAdUnits) {
    Array.from(Array(adUnitsToPad)).forEach(_ => {
      const matrixRow = Array.from(Array(matrixDimension)).map(_ => INVALID_ASSIGNMENT);
      constraintMatrix.push(matrixRow);
    })
  }

  return {
    constraintMatrix,
    rowIndexToAdUnitCode,
    columnIndexToBid
  };
}

function transformInvalidAssignmentsToNegative(constraintMatrix) {
  const maxValue = Math.max.apply(null, constraintMatrix.map((row) => Math.max.apply(Math, row.filter(element => element !== INVALID_ASSIGNMENT))));
  const transformedMatrix = [];
  constraintMatrix.forEach(row => {
    const minRow = [];
    row.forEach(value => {
      if (value === INVALID_ASSIGNMENT) {
        minRow.push(-maxValue * 10);
      } else {
        minRow.push(value);        
      }
    })
    transformedMatrix.push(minRow);
  })
  return transformedMatrix;
}

function minimizeMatrix(constraintMatrix) {
  const maxValue = Math.max.apply(null, constraintMatrix.map((row) => Math.max.apply(Math, row)));
  const minimizedConstraintMatrix = [];
  constraintMatrix.forEach(row => {
    const minRow = [];
    row.forEach(value => {
      minRow.push(maxValue - value);
    })
    minimizedConstraintMatrix.push(minRow);
  })

  return minimizedConstraintMatrix;
}

function arrangeAdUnitCodesWithDepthByDepth(adUnitCodes) {
  const depthRegex = new RegExp(/.*depth-(\d+)/);
  return adUnitCodes.filter(adUnitCode => {
    return depthRegex.test(adUnitCode)
  }).sort((adUnitCode, otherAdUnitCode) => {
    const adUnitDepth = depthRegex.exec(adUnitCode)
    const otherAdUnitDepth = depthRegex.exec(otherAdUnitCode);
    if (adUnitDepth && otherAdUnitDepth) {
      return adUnitDepth - otherAdUnitDepth;
    } else if (adUnitDepth) {
      return -1
    } else if (otherAdUnitDepth) {
      return 1
    }
  })
}

function createEarliestDepthMatrix(adUnitCodesByDepth, bidsSortedByHighestCPM, adUnitCodesForBidAdId) {
  const adUnitsToPad = bidsSortedByHighestCPM.length - adUnitCodesByDepth.length;
  const padAdUnits = adUnitsToPad > 0;
  const padBidsRecieved = adUnitsToPad < 0;

  // Try to get the best bids 4th from the top
  const indexModifiers = [{
    modification: -4,
    indexes: [4, 5, 6, 7]
  }, {
    modification: 4,
    indexes: [0, 1, 2, 3]
  }]

  const matrixDimension = Math.max(bidsSortedByHighestCPM.length, adUnitCodesByDepth.length);

  const constraintMatrix = []
  adUnitCodesByDepth.forEach((adUnitCode, rowIndex) => {
    const matrixRow = [];
    const rowModifier = find(indexModifiers, (modifier) => modifier.indexes.includes(rowIndex))

    if (rowModifier) {
      rowIndex += rowModifier.modification;
    }

    // Column index correlates to bid strength, value higher
    bidsSortedByHighestCPM.forEach((bid, columnIndex) => {
      if (adUnitCodesForBidAdId[bid.adId].includes(adUnitCode)) {
        matrixRow.push((matrixDimension - columnIndex) * (matrixDimension - rowIndex));
      } else {
        matrixRow.push(INVALID_ASSIGNMENT)
      }
    })

    if (padBidsRecieved) {
      Array.from(Array(Math.abs(adUnitsToPad))).forEach(_ => {
        matrixRow.push(INVALID_ASSIGNMENT);
      })
    }
    constraintMatrix.push(matrixRow);
  })

  if (padAdUnits) {
    Array.from(Array(adUnitsToPad)).forEach(_ => {
      const matrixRow = Array.from(Array(matrixDimension)).map(_ => INVALID_ASSIGNMENT);
      constraintMatrix.push(matrixRow);
    })
  }

  return constraintMatrix;
}

function getWinningBidAssignmentWithGeneralizedSharing(originalWinningBids, adUnitCodes, bidsReceived, customBidUseFunction) {
  // Create mapping of ad unit codes to usable bids based on custom sharing rules
  // Create N x N matrix to perform optimization of assignment problem
  // mobile-below-fold-4: [bid, bid, bid]

  var winningBidAssignments = {};
  const { bidsForAdCode, adUnitCodesForBidAdId } = createMappingOfBidsAndAdUnitCodes(adUnitCodes, bidsReceived, customBidUseFunction);

  utils.sblyLog('Starting optimization for bid CPM');
  utils.sblyLog('Mapping of available bids for each ad unit code:', bidsForAdCode);
  utils.sblyLog('Mapping of ad unit codes for each bid adId', adUnitCodesForBidAdId);

  const { constraintMatrix, columnIndexToBid, rowIndexToAdUnitCode } = createMaxCPMSumMatrix(adUnitCodes, bidsReceived, customBidUseFunction);
  const negativeMatrix = transformInvalidAssignmentsToNegative(constraintMatrix);
  const minimizedConstraintMatrix = minimizeMatrix(negativeMatrix);

  utils.sblyLog('Minimized constraint matrix (Bid CPM Maximization):', minimizedConstraintMatrix, columnIndexToBid, rowIndexToAdUnitCode);

  // Choose winning bids to use

  const solvedMinMatrix = lap(minimizedConstraintMatrix.length, minimizedConstraintMatrix).row;
  solvedMinMatrix.forEach((columnIndex, rowIndex) => {
    const adUnitCode = adUnitCodes[rowIndex];
    const winningBid = bidsReceived[columnIndex];
    const isValidAssignment = constraintMatrix[rowIndex][columnIndex] !== INVALID_ASSIGNMENT;

    if (adUnitCode && winningBid && isValidAssignment) {
      utils.sblyLog('Assigning', adUnitCode, 'to', winningBid)
      winningBidAssignments[adUnitCode] = winningBid;
    } else {
      utils.sblyLog('Assignment for', adUnitCode, 'to', winningBid, 'was not successful. Is not a valid combination in the matrix');
    }
  });

  // Map each winning bid to earliest possible depth

  const adUnitCodesByDepth = arrangeAdUnitCodesWithDepthByDepth(adUnitCodes);
  const bidsSortedByHighestCPM = Object.values(winningBidAssignments).sort((bid, otherBid) => otherBid.cpm - bid.cpm)

  utils.sblyLog('Starting optimization for depth...')
  utils.sblyLog('Ad Unit Codes With Depth:', adUnitCodesByDepth)

  const depthConstraintMatrix = createEarliestDepthMatrix(adUnitCodesByDepth, bidsSortedByHighestCPM, adUnitCodesForBidAdId);
  const greaterNegativeMatrix = transformInvalidAssignmentsToNegative(depthConstraintMatrix);
  const minimizedDepthMatrix = minimizeMatrix(greaterNegativeMatrix);
  const solvedDepthMatrix = lap(minimizedDepthMatrix.length, minimizedDepthMatrix).row;

  const mappingWithEarlyDepthPreference = {};

  utils.sblyLog('Minimized constraint matrix (Depth Optimization):', minimizedDepthMatrix);

  solvedDepthMatrix.forEach((columnIndex, rowIndex) => {
    const adUnitCode = adUnitCodesByDepth[rowIndex];
    const winningBid = bidsSortedByHighestCPM[columnIndex];
    const isValidAssignment = depthConstraintMatrix[rowIndex][columnIndex] !== INVALID_ASSIGNMENT;

    if (adUnitCode && winningBid && isValidAssignment) {
      utils.sblyLog('Assigning', adUnitCode, 'to', winningBid)
      mappingWithEarlyDepthPreference[adUnitCode] = winningBid;
    } else {
      utils.sblyLog('Assignment for', adUnitCode, 'to', winningBid, 'was not successful. Is not a valid combination in the matrix');
    }
  });

  const nonDepthAdCodes = Object.keys(winningBidAssignments).filter(code => !adUnitCodesByDepth.includes(code));
  nonDepthAdCodes.forEach(code => {
    mappingWithEarlyDepthPreference[code] = winningBidAssignments[code];
  })

  utils.sblyLog('Depth-Optimized Mapping:', mappingWithEarlyDepthPreference, 'Original', winningBidAssignments)

  return mappingWithEarlyDepthPreference
}

function determineIfLiftIsGreatEnough(originalWinningBids, adUnitCodes, winningBidAssignments, groupedByUnitCode) {
  const changeSummaries = [];

  adUnitCodes.forEach(adUnitCode => {
    const winningBid = winningBidAssignments[adUnitCode]
    if (winningBid) {
      if (winningBid.adUnitCode !== adUnitCode) {
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

  utils.sblyLog('Change Summary', changeSummaries, 'Final Assignments', winningBidAssignments);
  utils.sblyLog('Gain Summary', { hasEnoughGain, gainAmount, reassignedBidTotal, originalTotal, gainPercentage: Math.round(gainPercentage * 100, 6) });

  return hasEnoughGain;
}

export function getWinningBidsWithSharing(originalWinningBids, adUnitCodes, bidsReceived, customBidUseFunction) {
  if (typeof customBidUseFunction !== 'function') {
    return originalWinningBids;
  }

  const groupedByUnitCode = originalWinningBids.reduce((acc, next) => {
    acc[next.adUnitCode] = next;
    return acc;
  }, {})

  utils.sblyLog('Default Winning Assigments', groupedByUnitCode);

  const winningBidAssignments = getWinningBidAssignmentWithGeneralizedSharing(originalWinningBids, adUnitCodes, bidsReceived, customBidUseFunction);
  const hasEnoughGain = determineIfLiftIsGreatEnough(originalWinningBids, adUnitCodes, winningBidAssignments, groupedByUnitCode);

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
    utils.sblyLog('Using Modified Winning Bids', winningBids.reduce((acc, next) => Object.assign(acc, { [next.adUnitCode]: next }), {}));
    return winningBids;
  } else {
    utils.sblyLog('Using Original Winning Bids', originalWinningBids.reduce((acc, next) => Object.assign(acc, { [next.adUnitCode]: next }), {}));
    return originalWinningBids;
  }
}
