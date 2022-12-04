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
 * 检查待检查的URL是否与当前页面同源
 */
/**
 * Checks if the given string is a same origin url
 * @param {string} str - the URL to check
 * @return {Boolean} true for same origin url
 */
export function isSameOrigin(str) {
  return window.location.origin === new URL(str, window.location.href).origin;
}

/**
 * https://wicg.github.io/nav-speculation/speculation-rules.html
 * https://zhuanlan.zhihu.com/p/518186674
 * <script type=speculationrules>并非w3c标准，在chrome中支持，但是在firefox中不支持；\
 * HTMLScriptElement.supports('speculationrules')在上面两种浏览器中结果不一样
 * 可以让chrome知道应该通过数据预取代理提取哪个页面
 */
/**
 * Add a given set of urls to the speculation rules
 * @param {Set} toPrerender - the URLs to add to speculation rules
 * @return {Boolean|Object}  boolean or Error Object
 */
export function addSpeculationRules(urlsToPrerender) {
  let specScript = document.createElement("script");
  specScript.type = "speculationrules";
  specScript.text =
    '{"prerender":[{"source": "list","urls": ["' +
    Array.from(urlsToPrerender).join('","') +
    '"]}]}';
  try {
    document.head.appendChild(specScript);
  } catch (e) {
    return e;
  }

  return true;
}

/**
 * 检查浏览器是否支持speculationrules
 */
/**
 * Check whether UA supports Speculation Rules API
 * @return {Boolean} whether UA has support for Speculation Rules API
 */
export function hasSpecRulesSupport() {
  return HTMLScriptElement.supports("speculationrules");
}

/**
 * 检查浏览器是否已经存在speculationrules
 */
/**
 * Check whether Spec Rules is already defined in the document
 * @return {Boolean} whether Spec Rules exists/already defined
 */
export function isSpecRulesExists() {
  return document.querySelector('script[type="speculationrules"]');
}
