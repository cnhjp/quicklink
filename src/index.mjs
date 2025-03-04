/**
 * Copyright 2018 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
import throttle from "throttles";
import { priority, supported } from "./prefetch.mjs";
import requestIdleCallback from "./request-idle-callback.mjs";
import {
  isSameOrigin,
  addSpeculationRules,
  hasSpecRulesSupport,
  isSpecRulesExists,
} from "./prerender.mjs";

// Cache of URLs we've prefetched
// Its `size` is compared against `opts.limit` value.
const toPrefetch = new Set();

// Cache of URLs we've prerendered
const toPrerender = new Set();
// global var to keep prerenderAndPrefer option
let shouldPrerenderAndPrefetch = false;

/**
 * 传入锚节点和校验函数，检查锚节点的href属性链接是否需要预取
 * 若filter是数组，只需要满足其中一个条件即可
 */
/**
 * Determine if the anchor tag should be prefetched.
 * A filter can be a RegExp, Function, or Array of both.
 *   - Function receives `node.href, node` arguments
 *   - RegExp receives `node.href` only (the full URL)
 * @param  {Element}  node    The anchor (<a>) tag.
 * @param  {Mixed}    filter  The custom filter(s)
 * @return {Boolean}          If true, then it should be ignored
 */
function isIgnored(node, filter) {
  return Array.isArray(filter)
    ? filter.some((x) => isIgnored(node, x))
    : (filter.test || filter).call(filter, node.href, node);
}

/**
 * 检查网络状况是否良好
 * 如果需要节省流量或者2g网络，就抛出异常
 */
/**
 * Checks network conditions
 * @param  {NetworkInformation}  conn    The connection information to be checked
 * @return {Boolean|Object}  Error Object if the constrainsts are met or boolean otherwise
 */
function checkConnection(conn) {
  if (conn) {
    // Don't pre* if using 2G or if Save-Data is enabled.
    if (conn.saveData) {
      return new Error("Save-Data is enabled");
    }
    if (/2g/.test(conn.effectiveType)) {
      return new Error("network conditions are poor");
    }
  }

  return true;
}

/**
 * 检查处于用户视区中的a标签，如果满足条件，就把href属性的链接加入到toPrefetch缓存中
 * 以及一些配置项
 */
/**
 * Prefetch an array of URLs if the user's effective
 * connection type and data-saver preferences suggests
 * it would be useful. By default, looks at in-viewport
 * links for `document`. Can also work off a supplied
 * DOM element or static array of URLs.
 * @param {Object} options - Configuration options for quicklink
 * @param {Object} [options.el] - DOM element to prefetch in-viewport links of
 * @param {Boolean} [options.priority] - Attempt higher priority fetch (low or high)
 * @param {Array} [options.origins] - Allowed origins to prefetch (empty allows all)
 * @param {Array|RegExp|Function} [options.ignores] - Custom filter(s) that run after origin checks
 * @param {Number} [options.timeout] - Timeout after which prefetching will occur
 * @param {Number} [options.throttle] - The concurrency limit for prefetching
 * @param {Number} [options.threshold] - The area percentage of each link that must have entered the viewport to be fetched
 * @param {Number} [options.limit] - The total number of prefetches to allow
 * @param {Number} [options.delay] - Time each link needs to stay inside viewport before prefetching (milliseconds)
 * @param {Function} [options.timeoutFn] - Custom timeout function
 * @param {Function} [options.onError] - Error handler for failed `prefetch` requests
 * @param {Function} [options.hrefFn] - Function to use to build the URL to prefetch.
 *                                             If it's not a valid function, then it will use the entry href.
 * @param {Boolean} [options.prerender] - Option to switch from prefetching and use prerendering only
 * @param {Boolean} [options.prerenderAndPrefetch] - Option to use both prerendering and prefetching
 * @return {Function}
 */
export function listen(options) {
  if (!options) options = {};
  if (!window.IntersectionObserver) return;

  const [toAdd, isDone] = throttle(options.throttle || 1 / 0);
  const limit = options.limit || 1 / 0;
  const threshold = options.threshold || 0;

  const allowed = options.origins || [location.hostname];
  const ignores = options.ignores || [];
  const delay = options.delay || 0;
  const hrefsInViewport = [];

  const timeoutFn = options.timeoutFn || requestIdleCallback;
  const hrefFn = typeof options.hrefFn === "function" && options.hrefFn;

  const shouldOnlyPrerender = options.prerender || false;
  shouldPrerenderAndPrefetch = options.prerenderAndPrefetch || false;

  const prerenderLimit = 1;

  const setTimeoutIfDelay = (callback, delay) => {
    if (!delay) {
      callback();
      return;
    }
    setTimeout(callback, delay);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // On enter
        if (entry.isIntersecting) {
          entry = entry.target;
          // Adding href to array of hrefsInViewport
          hrefsInViewport.push(entry.href);

          // Setting timeout
          setTimeoutIfDelay(() => {
            // Do not prefetch if not found in viewport
            if (hrefsInViewport.indexOf(entry.href) === -1) return;

            observer.unobserve(entry);

            // prerender, if..
            // either it's the prerender + prefetch mode or it's prerender *only* mode
            // && no link has been prerendered before (no spec rules defined)
            if (shouldPrerenderAndPrefetch || shouldOnlyPrerender) {
              if (toPrerender.size < prerenderLimit) {
                prerender(hrefFn ? hrefFn(entry) : entry.href).catch((err) => {
                  if (options.onError) {
                    options.onError(err);
                  } else {
                    throw err;
                  }
                });
                return;
              }
            }

            // Do not prefetch if will match/exceed limit and user has not switched to shouldOnlyPrerender mode
            if (toPrefetch.size < limit && !shouldOnlyPrerender) {
              toAdd(() => {
                prefetch(hrefFn ? hrefFn(entry) : entry.href, options.priority)
                  .then(isDone)
                  .catch((err) => {
                    isDone();
                    if (options.onError) options.onError(err);
                  });
              });
            }
          }, delay);
        }
        // On exit
        else {
          entry = entry.target;
          const index = hrefsInViewport.indexOf(entry.href);
          if (index > -1) {
            hrefsInViewport.splice(index);
          }
        }
      });
    },
    {
      threshold,
    }
  );

  timeoutFn(
    () => {
      // Find all links & Connect them to IO if allowed
      (options.el || document).querySelectorAll("a").forEach((link) => {
        // If the anchor matches a permitted origin
        // ~> A `[]` or `true` means everything is allowed
        if (!allowed.length || allowed.includes(link.hostname)) {
          // If there are any filters, the link must not match any of them
          isIgnored(link, ignores) || observer.observe(link);
        }
      });
    },
    {
      timeout: options.timeout || 2000,
    }
  );

  return function () {
    // wipe url list
    toPrefetch.clear();
    // detach IO entries
    observer.disconnect();
  };
}

/**
 * 预取资源
 */
/**
 * Prefetch a given URL with an optional preferred fetch priority
 * @param {String} url - the URL to fetch
 * @param {Boolean} [isPriority] - if is "high" priority
 * @param {Object} [conn] - navigator.connection (internal)
 * @return {Object} a Promise
 */
export function prefetch(url, isPriority, conn) {
  let chkConn = checkConnection((conn = navigator.connection));
  // 网络状态不好，不预加载
  if (chkConn instanceof Error) {
    return Promise.reject(new Error("Cannot prefetch, " + chkConn.message));
  }

  if (toPrerender.size > 0 && !shouldPrerenderAndPrefetch) {
    console.warn(
      "[Warning] You are using both prefetching and prerendering on the same document"
    );
  }

  // 如果已经预加载过了，就不再预加载了，避免重复预加载统一资源
  // Dev must supply own catch()
  return Promise.all(
    [].concat(url).map((str) => {
      if (!toPrefetch.has(str)) {
        // Add it now, regardless of its success
        // ~> so that we don't repeat broken links
        toPrefetch.add(str);

        return (isPriority ? priority : supported)(
          new URL(str, location.href).toString()
        );
      }
    })
  );
}

/**
 * 添加speculationrules成功，返回Promise.resolve
 * 添加speculationrules失败，返回Promise.reject
 */
/**
 * Prerender a given URL
 * @param {String} url - the URL to fetch
 * @param {Object} [conn] - navigator.connection (internal)
 * @return {Object} a Promise
 */
export function prerender(urls, conn) {
  let chkConn = checkConnection((conn = navigator.connection));
  if (chkConn instanceof Error) {
    return Promise.reject(new Error("Cannot prerender, " + chkConn.message));
  }

  // prerendering preconditions:
  // 1) whether UA supports spec rules.. If not, fallback to prefetch
  if (!hasSpecRulesSupport()) {
    prefetch(urls);
    return Promise.reject(
      new Error(
        "This browser does not support the speculation rules API. Falling back to prefetch."
      )
    );
  }

  // 2) whether spec rules is already defined (and with this we also covered when we have created spec rules before)
  if (isSpecRulesExists()) {
    return Promise.reject(
      new Error("Speculation Rules is already defined and cannot be altered.")
    );
  }

  // 3) whether it's a same origin url,
  for (const url of [].concat(urls)) {
    if (!isSameOrigin(url)) {
      return Promise.reject(
        new Error("Only same origin URLs are allowed: " + url)
      );
    }

    toPrerender.add(url);
  }

  // check if both prerender and prefetch exists.. throw a warning but still proceed
  if (toPrefetch.size > 0 && !shouldPrerenderAndPrefetch) {
    console.warn(
      "[Warning] You are using both prefetching and prerendering on the same document"
    );
  }

  let addSpecRules = addSpeculationRules(toPrerender);
  return addSpecRules === true
    ? Promise.resolve()
    : Promise.reject(addSpecRules);
}
