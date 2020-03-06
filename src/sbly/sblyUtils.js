export const DEBUG_WITH_FAKE_BIDS = 'sbly_use_fake_bids';
const SBLY_DEBUG = 'sbly_prebid_debug';

const seenEvents = {};

function decorateLog(args, prefix) {
  args = [].slice.call(args);
  prefix && args.unshift(prefix);
  args.unshift('display: inline-block; color: #fff; background: #be90d4; padding: 1px 4px; border-radius: 3px;');
  args.unshift('%cSbly Prebid');
  return args;
}

export function find(array, fn) {
  return array.filter(fn)[0];
}

export function groupByFunction(xs, func) {
  return xs.reduce(function(rv, x) {
    (rv[func(x)] = rv[func(x)] || []).push(x);
    return rv;
  }, {});
}

export function uniqueBy(array, func) {
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

export function sblyLog() {
  if ((window && window.location && window.location.href && window.location.href.includes(SBLY_DEBUG))) {
    console.log.apply(console, decorateLog(arguments, 'SBLY:'));
  }
}

export function trackPrebidEvent(eventName, attributes = {}) {
  if (window && window.sblyTracker && typeof window.sblyTracker.trackCustomEvent === 'function') {
    window.sblyTracker.trackCustomEvent(`Prebid${eventName}`, attributes);
  }
}

export function sendPrebidEventOnce(eventName, attributes = {}) {
  const hash = JSON.stringify({ eventName, attributes }).hashCode();
  if (!seenEvents[hash]) {
    seenEvents[hash] = true;
    trackPrebidEvent(eventName, attributes);
  }
}

String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

if (!String.prototype.includes) {
  String.prototype.includes = function(search, start) {
    'use strict';

    if (search instanceof RegExp) {
      throw TypeError('first argument must not be a RegExp');
    } 
    if (start === undefined) { start = 0; }
    return this.indexOf(search, start) !== -1;
  };
}

if (!Array.prototype.includes) {
  Object.defineProperty(Array.prototype, 'includes', {
    value: function(searchElement, fromIndex) {
      if (this == null) {
        throw new TypeError('"this" is null or not defined');
      }
      var o = Object(this);
      var len = o.length >>> 0;
      if (len === 0) {
        return false;
      }
      var n = fromIndex | 0;
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);

      function sameValueZero(x, y) {
        return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y));
      }
      while (k < len) {
        if (sameValueZero(o[k], searchElement)) {
          return true;
        }
        k++;
      }
      return false;
    }
  });
}
