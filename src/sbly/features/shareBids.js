import { lap } from './vendor/lap.js';
import { sblyLog } from '../sblyUtils.js';

const EMPTY_ASSIGNMENT = "EMPTY";
const MILLE = 1000000;
const LARGE = 1000000000;

const winningBidCache = {};

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

    bidsRecieved.forEach((bid, columnIndex) => {
      if (customBidUseFunction(adUnitCode, bid)) {
        matrixRow.push(parseInt(bid.cpm * MILLE));
        columnIndexToBid[columnIndex] = bid;
      } else {
        matrixRow.push(0);
        columnIndexToBid[columnIndex] = null;
      }
    })

    if (padBidsRecieved) {
      Array.from(Array(Math.abs(adUnitsToPad))).forEach(_ => {
        matrixRow.push(EMPTY_ASSIGNMENT);
      })
    }

    rowIndexToAdUnitCode[rowIndex] = adUnitCode;
    constraintMatrix.push(matrixRow);
  })

  if (padAdUnits) {
    Array.from(Array(adUnitsToPad)).forEach(_ => {
      const matrixRow = Array.from(Array(matrixDimension)).map(_ => EMPTY_ASSIGNMENT);
      constraintMatrix.push(matrixRow);
    })
  }

  return {
    constraintMatrix,
    rowIndexToAdUnitCode,
    columnIndexToBid
  };
}

function minimizeMatrix(constraintMatrix) {
  const maxValue = Math.max.apply(null, constraintMatrix.map((row) => Math.max.apply(Math, row.filter(element => element !== EMPTY_ASSIGNMENT))));
  const minimizedConstraintMatrix = [];
  constraintMatrix.forEach(row => {
    const minRow = [];
    row.forEach(value => {
      if (value === EMPTY_ASSIGNMENT) {
        minRow.push(0);
      } else {
        minRow.push(maxValue - value);        
      }
    })
    minimizedConstraintMatrix.push(minRow);
  })

  return minimizedConstraintMatrix;
}

function createEarliestDepthMatrix(adUnitCodesByPriority, bidsSortedByAscendingCPM, adUnitCodesForBidAdId) {
  const adUnitsToPad = bidsSortedByAscendingCPM.length - adUnitCodesByPriority.length;
  const padAdUnits = adUnitsToPad > 0;
  const padBidsRecieved = adUnitsToPad < 0;

  const matrixDimension = Math.max(bidsSortedByAscendingCPM.length, adUnitCodesByPriority.length);

  const constraintMatrix = []
  adUnitCodesByPriority.forEach((adUnitCode, rowIndex) => {
    const matrixRow = [];

    // Column index correlates to bid strength, value higher means stronger bid
    bidsSortedByAscendingCPM.forEach((bid, columnIndex) => {
      if (adUnitCodesForBidAdId[bid.adId].includes(adUnitCode)) {
        matrixRow.push((rowIndex + 1) * (columnIndex + 1));
      } else {
        matrixRow.push(LARGE)
      }
    })

    if (padBidsRecieved) {
      Array.from(Array(Math.abs(adUnitsToPad))).forEach(_ => {
        matrixRow.push(0);
      })
    }
    constraintMatrix.push(matrixRow);
  })

  if (padAdUnits) {
    Array.from(Array(adUnitsToPad)).forEach(_ => {
      const matrixRow = Array.from(Array(matrixDimension)).map(_ => 0);
      constraintMatrix.push(matrixRow);
    })
  }

  return constraintMatrix;
}

// Create mapping of ad unit codes to usable bids based on custom sharing rules
// Create N x N matrix to perform optimization of assignment problem
function getWinningBidAssignmentWithGeneralizedSharing(adUnitCodes, bidsReceived, customBidUseFunction) {
  var newBidAssignments = {};

  sblyLog('Starting optimization for bid CPM');

  const { constraintMatrix, columnIndexToBid, rowIndexToAdUnitCode } = createMaxCPMSumMatrix(adUnitCodes, bidsReceived, customBidUseFunction);
  const minimizedConstraintMatrix = minimizeMatrix(constraintMatrix);

  sblyLog('Minimized constraint matrix (Bid CPM Maximization):', minimizedConstraintMatrix, columnIndexToBid, rowIndexToAdUnitCode);

  const solvedMinMatrix = lap(minimizedConstraintMatrix.length, minimizedConstraintMatrix).row;
  solvedMinMatrix.forEach((columnIndex, rowIndex) => {
    const adUnitCode = adUnitCodes[rowIndex];
    const winningBid = bidsReceived[columnIndex];
    const isValidAssignment = constraintMatrix[rowIndex][columnIndex] !== 0;

    if (adUnitCode && winningBid && isValidAssignment) {
      newBidAssignments[adUnitCode] = winningBid;
    }
  });

  return newBidAssignments;
}

// Map each winning bid to earliest possible depth
function getDepthOptimizedAssignment(adUnitCodes, cpmOptimizedBidAssignments, adUnitCodesForBidAdId, sortAdUnitCodesByPriority) {
  if (typeof sortAdUnitCodesByPriority !== 'function') {
    sblyLog('Skipping optimization for depth, no valid priority for ad unit codes passed in')
    return cpmOptimizedBidAssignments
  }

  const adUnitCodesByPriority = sortAdUnitCodesByPriority(adUnitCodes);
  const bidsSortedByAscendingCPM = Object.values(cpmOptimizedBidAssignments).sort((bid, otherBid) => bid.cpm - otherBid.cpm).filter(bid => adUnitCodesByPriority.includes(bid.adUnitCode))

  sblyLog('Starting optimization for depth...')
  sblyLog('Ad Unit Codes By Priority:', adUnitCodesByPriority)

  const depthConstraintMatrix = createEarliestDepthMatrix(adUnitCodesByPriority, bidsSortedByAscendingCPM, adUnitCodesForBidAdId);
  const solvedDepthMatrix = lap(depthConstraintMatrix.length, depthConstraintMatrix).row;

  const assignmentWithDepthOptimization = {};

  sblyLog('Minimized constraint matrix (Depth Optimization):', depthConstraintMatrix);

  solvedDepthMatrix.forEach((columnIndex, rowIndex) => {
    const adUnitCode = adUnitCodesByPriority[rowIndex];
    const winningBid = bidsSortedByAscendingCPM[columnIndex];
    const isValidAssignment = depthConstraintMatrix[rowIndex][columnIndex] !== LARGE;

    if (adUnitCode && winningBid && isValidAssignment) {
      assignmentWithDepthOptimization[adUnitCode] = winningBid;
    }
  });

  const nonDepthAdCodes = Object.keys(cpmOptimizedBidAssignments).filter(code => !adUnitCodesByPriority.includes(code));
  nonDepthAdCodes.forEach(code => {
    assignmentWithDepthOptimization[code] = cpmOptimizedBidAssignments[code];
  })

  const difference = calculateDifferenceInAssignments(assignmentWithDepthOptimization, cpmOptimizedBidAssignments);
  const hasLossInCPMDueToDepthOptimization = (difference.gainAmount + 0.001) < 0;

  sblyLog('[Depth Optimized vs. CPM Optimized] Assignment Difference:', difference, `Depth-Optimized:`, assignmentWithDepthOptimization, `CPM`, cpmOptimizedBidAssignments);

  return hasLossInCPMDueToDepthOptimization ? cpmOptimizedBidAssignments : assignmentWithDepthOptimization;
}

function determineChangeSummaries(adUnitCodes, newBidAssignments, originalBidAssignments) {
  const changeSummaries = [];

  adUnitCodes.forEach(adUnitCode => {
    const winningBid = newBidAssignments[adUnitCode]
    if (winningBid) {
      if (winningBid.adUnitCode !== adUnitCode) {
        const priorBid = originalBidAssignments[adUnitCode] || {};
        const finalBid = newBidAssignments[adUnitCode];

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

  return changeSummaries;
}

function calculateDifferenceInAssignments(newBidAssignments, originalBidAssignments) {
  const originalTotal = Object.values(originalBidAssignments).reduce((acc, next) => acc + next.cpm, 0);
  const reassignedBidTotal = Object.values(newBidAssignments).filter(bid => bid).reduce((acc, next) => acc + next.cpm, 0);
  const gainAmount = parseFloat((reassignedBidTotal - originalTotal).toFixed(4));
  const gainPercentage = parseFloat((gainAmount / originalTotal).toFixed(2));
  return { originalTotal, reassignedBidTotal, gainAmount, gainPercentage };
}

function hashCodeForBidRequests(adUnitCodes, bidsReceived) {
  const sortedAdUnitCodes = adUnitCodes.sort();
  const sortedBidsReceivedAdIds = bidsReceived.map(bid => bid.adId).sort();
  return (sortedAdUnitCodes.join(',') + sortedBidsReceivedAdIds.join(',')).hashCode()
}

function switchAssignmentsBackToOriginal(adUnitCodes, originalBidAssignments, cpmOptimizedBidAssignments) {
  const reassignedBids = {};

  const originalAdUnitCodes = Object.keys(originalBidAssignments);
  const allOptimizedBids = Object.values(cpmOptimizedBidAssignments);
  const usedBids = [];

  originalAdUnitCodes.forEach(adUnitCode => {
    const bidInOptimized = allOptimizedBids.filter(bid => bid.adUnitCode === adUnitCode)[0];
    if (bidInOptimized) {
      reassignedBids[adUnitCode] = bidInOptimized;
      usedBids.push(bidInOptimized)
    }
  })

  const usedBidAdIds = usedBids.map(bid => bid.adId);
  const unassignedBids = allOptimizedBids.filter(bid => !usedBidAdIds.includes(bid.adId));
  var availableAdUnitCodes = originalAdUnitCodes.filter(adUnitCode => !reassignedBids[adUnitCode]);

  sblyLog('Intermediate re-assign', JSON.parse(JSON.stringify(reassignedBids)), 'unassignedBids', unassignedBids, 'availableAdUnitCodes', availableAdUnitCodes);

  unassignedBids.forEach(bid => {
    if (availableAdUnitCodes.includes(bid.adUnitCode)) {
      reassignedBids[bid.adUnitCode] = bid;
      availableAdUnitCodes = availableAdUnitCodes.filter(adUnitCode => adUnitCode !== bid.adUnitCode);
    } else {
      const firstAvailable = availableAdUnitCodes.shift();
      if (firstAvailable) {
        reassignedBids[firstAvailable] = bid;
      } else {
        const nextAvailable = adUnitCodes.filter(adUnitCode => !reassignedBids[adUnitCode])[0];
        reassignedBids[nextAvailable] = bid;
      }
    }
  })

  sblyLog('Final re-assign', reassignedBids);

  return reassignedBids;
}

export function getWinningBidsWithSharing(originalWinningBids, adUnitCodes, bidsReceived, customBidUseFunction, sortAdUnitCodesByPriority) {
  if (typeof customBidUseFunction !== 'function') {
    return originalWinningBids;
  }

  const hashCodeForRequest = hashCodeForBidRequests(adUnitCodes, bidsReceived);
  const cachedWinningBids = winningBidCache[hashCodeForRequest];
  if (cachedWinningBids) {
    return cachedWinningBids;
  }

  const originalBidAssignments = originalWinningBids.reduce((acc, next) => {
    acc[next.adUnitCode] = next;
    return acc;
  }, {})

  const { bidsForAdCode, adUnitCodesForBidAdId } = createMappingOfBidsAndAdUnitCodes(adUnitCodes, bidsReceived, customBidUseFunction);

  sblyLog('Default Winning Assigments', originalBidAssignments);
  sblyLog('Mapping of available bids for each ad unit code:', bidsForAdCode);
  sblyLog('Mapping of ad unit codes for each bid adId', adUnitCodesForBidAdId);
  sblyLog('All codes', adUnitCodes, 'All Bids', bidsReceived);

  const cpmOptimizedBidAssignments = getWinningBidAssignmentWithGeneralizedSharing(adUnitCodes, bidsReceived, customBidUseFunction);
  
  var depthOptimizedAssignments;
  if (typeof sortAdUnitCodesByPriority !== 'function') {
    depthOptimizedAssignments = switchAssignmentsBackToOriginal(adUnitCodes, originalBidAssignments, cpmOptimizedBidAssignments);
  } else {
    depthOptimizedAssignments = getDepthOptimizedAssignment(adUnitCodes, cpmOptimizedBidAssignments, adUnitCodesForBidAdId, sortAdUnitCodesByPriority);    
  }

  const changeSummaries = determineChangeSummaries(adUnitCodes, depthOptimizedAssignments, originalBidAssignments)
  const assignmentDifference = calculateDifferenceInAssignments(depthOptimizedAssignments, originalBidAssignments);
  const hasEnoughGain = assignmentDifference.gainAmount >= 0;

  sblyLog('[Matrix Optimized vs. Original] Assignment Difference', assignmentDifference, 'hasEnoughGain', hasEnoughGain);
  sblyLog('Change Summary vs Orig', changeSummaries, 'Orig', originalBidAssignments, 'Final Assignments', depthOptimizedAssignments);

  var finalWinningBids;
  if (hasEnoughGain) {
    // map out final winning bids
    const winningBids = Object.keys(depthOptimizedAssignments).map(adUnitCode => {
      const winningBid = depthOptimizedAssignments[adUnitCode];
      if (winningBid) {
        winningBid.adUnitCode = adUnitCode;
        return winningBid;
      } else {
        return null
      }
    }).filter(bid => bid);
    sblyLog('Using Modified Winning Bids', winningBids.reduce((acc, next) => Object.assign(acc, { [next.adUnitCode]: next }), {}));
    finalWinningBids = winningBids;
  } else {
    sblyLog('Using Original Winning Bids', originalWinningBids.reduce((acc, next) => Object.assign(acc, { [next.adUnitCode]: next }), {}));
    finalWinningBids = originalWinningBids;
  }

  winningBidCache[hashCodeForRequest] = finalWinningBids;
  return finalWinningBids;
}
