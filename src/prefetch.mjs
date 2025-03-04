/**
 * Portions copyright 2018 Google Inc.
 * Inspired by Gatsby's prefetching logic, with those portions
 * remaining MIT. Additions include support for Fetch API,
 * XHR switching, SaveData and Effective Connection Type checking.
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

/**
 * 检查浏览器是否支持<link rel=prefetch>这种写法
 */
/**
 * Checks if a feature on `link` is natively supported.
 * Examples of features include `prefetch` and `preload`.
 * @param {Object} link Link object.
 * @return {Boolean} whether the feature is supported
 */
function hasPrefetch(link) {
  link = document.createElement("link");
  return (
    link.relList && link.relList.supports && link.relList.supports("prefetch")
  );
}

/**
 * 通过创建<link rel=prefetch>的方式请求一个URL，返回一个Promise
 */
/**
 * Fetches a given URL using `<link rel=prefetch>`
 * @param {string} url - the URL to fetch
 * @return {Object} a Promise
 */
function viaDOM(url) {
  return new Promise((res, rej, link) => {
    link = document.createElement(`link`);
    link.rel = `prefetch`;
    link.href = url;

    link.onload = res;
    link.onerror = rej;

    document.head.appendChild(link);
  });
}

/**
 * XHR请求一个URL，返回一个Promise
 * 兼容性好，起兜底作用
 */
/**
 * Fetches a given URL using XMLHttpRequest
 * @param {string} url - the URL to fetch
 * @return {Object} a Promise
 */
function viaXHR(url) {
  return new Promise((res, rej, req) => {
    req = new XMLHttpRequest();

    req.open(`GET`, url, (req.withCredentials = true));

    req.onload = () => {
      req.status === 200 ? res() : rej();
    };

    req.send();
  });
}

/**
 * 如果浏览器支持fetch，则使用fetch
 * 否则使用XHR
 * 返回给使用者的是一个Promise对象
 */
/**
 * Fetches a given URL using the Fetch API. Falls back
 * to XMLHttpRequest if the API is not supported.
 * @param {string} url - the URL to fetch
 * @return {Object} a Promise
 */
export function priority(url) {
  // TODO: Investigate using preload for high-priority
  // fetches. May have to sniff file-extension to provide
  // valid 'as' values. In the future, we may be able to
  // use Priority Hints here.
  //
  // As of 2018, fetch() is high-priority in Chrome
  // and medium-priority in Safari.
  return window.fetch ? fetch(url, { credentials: `include` }) : viaXHR(url);
}

/**
 * 如果浏览器支持<link rel=prefetch>，则使用该方式提前获取资源
 * 否则使用XHR
 */
export const supported = hasPrefetch() ? viaDOM : viaXHR;
