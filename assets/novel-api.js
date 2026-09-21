/**
 * novel-api.js — FimTale API (v1) client
 * ======================================
 * Part of the LCARS-FimTale project (non-commercial fan project).
 *
 * Implemented against the official specification:
 *   FimTale API（第一版）说明文档 — https://fimtale.com/t/18405
 *
 * SPEC NOTES THAT DRIVE THIS FILE'S DESIGN
 * ----------------------------------------
 * 1. An API key is ALWAYS a pair: `APIKey` (8 lowercase hex chars) and `APIPass`
 *    (12 lowercase hex chars). The shape is verified before spending a request.
 * 2. The key pair *is* the identity. `/api/v1` ignores browser site cookies and
 *    the key's account wins, so requests must NOT carry credentials:
 *    `credentials: 'omit'`.
 * 3. Failure is signalled two ways: an HTTP error status (403 for a bad or
 *    missing key) AND a JSON body with `Status: 0` plus `ErrorCode` /
 *    `ErrorMessage`. Both are treated as failure — a 200 with `Status: 0` is
 *    still a failure.
 * 4. `Content-Type: application/json; charset=utf-8` and
 *    `Access-Control-Allow-Origin: *` are sent, so a static host can call the API
 *    directly from the browser.
 * 5. Content bodies (`Content`, `Intro`) are HTML by default; `format=md` asks for
 *    Markdown instead. This client keeps HTML, and the reader sanitises it.
 * 6. List endpoints return `Page` / `TotalPage` for pagination.
 * 7. The site asks that the API not be hammered. `RequestGate` below serialises
 *    requests with a minimum gap, and collapses identical concurrent requests.
 * 8. Mutations (`/settings` with an `Action`) are POST. A browser cannot send a
 *    JSON POST cross-origin here: the API answers the CORS preflight (OPTIONS)
 *    with 403 and no `Access-Control-Allow-Methods`, so anything needing a
 *    preflight is blocked. `formPost()` therefore sends
 *    `application/x-www-form-urlencoded`, a CORS "simple request" needing no
 *    preflight; the server reads `$_REQUEST`, so the two are equivalent.
 */
var NovelAPI = (function () {
	'use strict';

	/* ------------------------------------------------------------------ *
	 * Constants
	 * ------------------------------------------------------------------ */

	var STORAGE_KEY_APIKEY = 'lcars_novel_api_key';
	var STORAGE_KEY_APIPASS = 'lcars_novel_api_pass';
	var STORAGE_KEY_ENDPOINT = 'lcars_novel_api_endpoint';

	var DEFAULT_ENDPOINT = 'https://fimtale.com/api/v1';
	var REQUEST_TIMEOUT_MS = 30000;
	var MAX_ATTEMPTS = 3;
	var MIN_REQUEST_GAP_MS = 350;

	// Documented credential shapes (spec section "认证").
	var API_KEY_PATTERN = /^[0-9a-f]{8}$/;
	var API_PASS_PATTERN = /^[0-9a-f]{12}$/;

	/* ------------------------------------------------------------------ *
	 * Safe storage
	 * ------------------------------------------------------------------ */

	function storageGet(key) {
		try { return window.localStorage.getItem(key); } catch (e) { return null; }
	}

	function storageSet(key, value) {
		try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
	}

	function storageRemove(key) {
		try { window.localStorage.removeItem(key); } catch (e) { /* nothing to do */ }
	}

	/* ------------------------------------------------------------------ *
	 * Endpoint resolution
	 * ------------------------------------------------------------------ */

	/**
	 * Base URL for the API.
	 *
	 * The spec says to insert `/api/v1` between the host and the site path, e.g.
	 * https://fimtale.com/t/4 -> https://fimtale.com/api/v1/t/4.
	 *
	 * The API sends `Access-Control-Allow-Origin: *`, so a browser can call it
	 * directly from ANY origin — including a local dev server, `file://`, or a
	 * static host. There is therefore no need for a same-origin proxy, and
	 * defaulting to one was actively harmful: on `localhost` or `127.0.0.1` this
	 * used to return the relative path `/api`, which the browser resolved against
	 * the dev server (e.g. http://127.0.0.1:8199/api/t/4) instead of FimTale. Any
	 * local preview server without an `/api` route answered **404 for every
	 * request**, which looked like a credentials or endpoint problem.
	 *
	 * A stored override still wins, so a mirror or a real proxy can be used. A
	 * relative value such as `/api` is kept relative on purpose, for someone who
	 * has deliberately stood up that route.
	 *
	 * @returns {string}
	 */
	function getAPIEndpoint() {
		var stored = storageGet(STORAGE_KEY_ENDPOINT);
		if (stored) {
			var value = String(stored).trim();
			if (value) { return value.replace(/\/+$/, ''); }
		}
		return DEFAULT_ENDPOINT;
	}

	/**
	 * Resolve the base URL for the next request, migrating a stale stored value.
	 *
	 * The endpoint resolution used to return the bare relative path `/api` on
	 * localhost. Anyone who pressed "save" on the API config page while that was
	 * in effect has `/api` persisted, which would keep 404-ing even after the
	 * default was fixed. A stored `/api` is therefore treated as the old
	 * auto-generated default and dropped; any other stored value is honoured.
	 *
	 * @returns {string}
	 */
	function resolveEndpointForRequest() {
		var stored = storageGet(STORAGE_KEY_ENDPOINT);
		if (stored && String(stored).trim().replace(/\/+$/, '') === '/api') {
			storageRemove(STORAGE_KEY_ENDPOINT);
		}
		return getAPIEndpoint();
	}

	/* ------------------------------------------------------------------ *
	 * Credentials
	 * ------------------------------------------------------------------ */

	/**
	 * @returns {{apiKey: (string|null), apiPass: (string|null)}}
	 */
	function getStoredCredentials() {
		return {
			apiKey: storageGet(STORAGE_KEY_APIKEY),
			apiPass: storageGet(STORAGE_KEY_APIPASS)
		};
	}

	/**
	 * Validate the documented key/pass shape.
	 * @param {?string} apiKey
	 * @param {?string} apiPass
	 * @returns {{ok: boolean, problems: Array<string>}}
	 */
	function validateCredentials(apiKey, apiPass) {
		var problems = [];
		var key = String(apiKey || '').trim();
		var pass = String(apiPass || '').trim();

		if (!key) { problems.push('APIKey 不能为空'); }
		else if (!API_KEY_PATTERN.test(key)) { problems.push('APIKey 应为 8 位小写十六进制字符（0-9a-f）'); }

		if (!pass) { problems.push('APIPass 不能为空'); }
		else if (!API_PASS_PATTERN.test(pass)) { problems.push('APIPass 应为 12 位小写十六进制字符（0-9a-f）'); }

		return { ok: problems.length === 0, problems: problems };
	}

	/**
	 * @returns {boolean}
	 */
	function hasCredentials() {
		var creds = getStoredCredentials();
		return Boolean(creds.apiKey && creds.apiPass);
	}

	/**
	 * Persist credentials. Values are lower-cased because the spec states both are
	 * lowercase hex.
	 *
	 * @param {string} apiKey
	 * @param {string} apiPass
	 * @param {string=} endpoint
	 * @returns {boolean} true when both values were persisted
	 */
	function saveCredentials(apiKey, apiPass, endpoint) {
		var key = String(apiKey || '').trim().toLowerCase();
		var pass = String(apiPass || '').trim().toLowerCase();

		// `&&`, not `&`: both writes must succeed and each returns a boolean.
		var okKey = storageSet(STORAGE_KEY_APIKEY, key);
		var okPass = storageSet(STORAGE_KEY_APIPASS, pass);
		if (endpoint) { storageSet(STORAGE_KEY_ENDPOINT, String(endpoint).trim()); }
		return okKey && okPass;
	}

	function clearCredentials() {
		storageRemove(STORAGE_KEY_APIKEY);
		storageRemove(STORAGE_KEY_APIPASS);
		storageRemove(STORAGE_KEY_ENDPOINT);
	}

	/* ------------------------------------------------------------------ *
	 * Errors
	 * ------------------------------------------------------------------ */

	function apiError(code, message, extra) {
		var err = new Error(message);
		err.code = code;
		if (extra) { Object.keys(extra).forEach(function (k) { err[k] = extra[k]; }); }
		return err;
	}

	/**
	 * Keep a bounded, plain-text summary of a server body. Remote content is never
	 * surfaced verbatim: it would otherwise be rendered into the page by callers.
	 * @param {string} body
	 * @param {number=} maxLength
	 * @returns {string}
	 */
	function summarise(body, maxLength) {
		var limit = maxLength || 160;
		var cleaned = String(body || '')
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (cleaned.length > limit) { cleaned = cleaned.slice(0, limit) + '\u2026'; }
		return cleaned;
	}

	/**
	 * Map a documented status/error code to an actionable message.
	 * @param {number|string|undefined} status
	 * @param {string=} fallback
	 * @returns {string}
	 */
	function describeHttpStatus(status, fallback) {
		var code = Number(status);
		if (code === 403) {
			return '权限不足 (403)：APIKey / APIPass 不正确，或该账号不具备 API 权限。' +
				'请到 FimTale 设置页核对密钥，或重新生成一对。';
		}
		if (code === 404) { return '资源未找到 (404)：请检查作品 ID 是否正确。'; }
		if (code === 429) { return '请求过于频繁 (429)：站点限制了调用频率，请稍后再试。'; }
		if (code >= 500) { return 'FimTale 服务器错误 (' + code + ')：请稍后重试。'; }
		return fallback || ('HTTP ' + code);
	}

	/**
	 * Only retry failures that can plausibly succeed on a retry. A bad key, a
	 * missing topic or a malformed body will fail identically every time, so those
	 * fail fast instead of tripling both the wait and our load on the site (which
	 * the spec explicitly asks us to avoid).
	 * @param {Error} error
	 * @returns {boolean}
	 */
	function isRetryable(error) {
		if (!error) { return false; }
		if (error.status === 429 || error.status === 408 || error.status >= 500) { return true; }
		return error.code === 'ERR_TIMEOUT' || error.code === 'ERR_NETWORK';
	}

	/**
	 * Cross-origin failures look different in every engine.
	 * @param {Error} error
	 * @returns {boolean}
	 */
	function looksLikeNetworkFailure(error) {
		if (!error) { return false; }
		var msg = String(error.message || '');
		return /Failed to fetch|NetworkError|Load failed|NS_ERROR_FAILURE|Network request failed/i.test(msg);
	}

	/* ------------------------------------------------------------------ *
	 * Request gate — polite serialisation
	 * ------------------------------------------------------------------ */

	/**
	 * The spec asks that the API not be used too frequently. This gate keeps the
	 * client to one in-flight request at a time with a minimum gap between them,
	 * and collapses identical concurrent requests onto a single network call.
	 */
	var RequestGate = (function () {
		var chain = Promise.resolve();
		var lastStart = 0;
		var inFlight = new Map();

		/**
		 * @param {string} key  dedupe key
		 * @param {Function} task  returns a promise
		 * @returns {Promise}
		 */
		function schedule(key, task) {
			if (inFlight.has(key)) { return inFlight.get(key); }

			var run = chain.then(function () {
				var wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastStart));
				return new Promise(function (resolve) { window.setTimeout(resolve, wait); });
			}).then(function () {
				lastStart = Date.now();
				return task();
			});

			// Keep the chain alive even when a request rejects.
			chain = run.catch(function () {});
			inFlight.set(key, run);
			run.then(function () { inFlight.delete(key); }, function () { inFlight.delete(key); });
			return run;
		}

		function clear() { inFlight.clear(); }

		return { schedule: schedule, clear: clear };
	})();

	/* ------------------------------------------------------------------ *
	 * Core request
	 * ------------------------------------------------------------------ */

	/**
	 * Build the query string for a request.
	 * @param {Object} creds
	 * @param {Object=} params
	 * @returns {string}
	 */
	function buildQuery(creds, params) {
		// URLSearchParams handles the encoding; the spec's own examples show
		// APIKey/APIPass first, which is also the order used here.
		var query = new URLSearchParams();
		query.set('APIKey', creds.apiKey);
		query.set('APIPass', creds.apiPass);
		if (params) {
			Object.keys(params).forEach(function (name) {
				var value = params[name];
				if (value === null || value === undefined || value === '') { return; }
				query.set(name, value);
			});
		}
		return query.toString();
	}

	/**
	 * Raise on the documented failure envelope.
	 * @param {Object} result
	 */
	function assertOkEnvelope(result) {
		if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'Status')) {
			if (Number(result.Status) === 0) {
				var code = result.ErrorCode;
				throw apiError('ERR_API',
					result.ErrorMessage ? String(result.ErrorMessage) : describeHttpStatus(code, '请求被 API 拒绝'),
					{ status: Number(code) || undefined });
			}
		}
	}

	/**
	 * Perform one API request.
	 *
	 * @param {string} endpoint   e.g. '/t/18405', '/', '/json/getTags'
	 * @param {Object=} params    extra query parameters
	 * @param {{onRetry: Function=, method: string=, body: Object=, dedupe: boolean=}=} options
	 * @returns {Promise<Object>} the parsed JSON body
	 */
	async function makeRequest(endpoint, params, options) {
		var creds = getStoredCredentials();
		if (!creds.apiKey || !creds.apiPass) {
			throw apiError('ERR_NO_CREDENTIALS', '尚未配置 API 凭据，请先到 API 配置页填写 APIKey 与 APIPass。');
		}

		var opts = options || {};
		var method = String(opts.method || 'GET').toUpperCase();
		var base = resolveEndpointForRequest().replace(/\/+$/, '');
		var url = base + endpoint + '?' + buildQuery(creds, params);

		// Deduplicate identical requests: the reader used to fetch the home page
		// three separate times when moving between HOT / LATEST / HOME.
		if (method === 'GET' && opts.dedupe !== false) {
			return RequestGate.schedule(method + ' ' + url, function () {
				return attemptLoop(url, method, opts);
			});
		}
		return attemptLoop(url, method, opts);
	}

	/**
	 * Retry wrapper. The controller and its timeout are created inside each attempt
	 * and always torn down, and the timeout covers reading the body — a server that
	 * stalls mid-response can no longer hang the UI forever.
	 *
	 * @param {string} url
	 * @param {string} method
	 * @param {Object} opts
	 * @returns {Promise<Object>}
	 */
	async function attemptLoop(url, method, opts) {
		var onRetry = opts.onRetry;
		var lastError = null;

		for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			if (attempt > 1) {
				if (onRetry) { onRetry(attempt, MAX_ATTEMPTS, lastError); }
				await new Promise(function (resolve) {
					window.setTimeout(resolve, 1000 * (attempt - 1));
				});
			}

			var controller = new AbortController();
			var timedOut = false;
			var timer = window.setTimeout(function () {
				timedOut = true;
				controller.abort();
			}, REQUEST_TIMEOUT_MS);

			try {
				var init = {
					method: method,
					signal: controller.signal,
					headers: { 'Accept': 'application/json' },
					// The key pair is the identity; never send site cookies.
					credentials: 'omit',
					cache: 'no-store'
				};

				if (method === 'POST' && opts.body) {
					// urlencoded rather than JSON: avoids the CORS preflight the API
					// cannot answer (OPTIONS returns 403 with no allow-methods).
					init.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
					init.body = new URLSearchParams(opts.body).toString();
				}

				var response = await fetch(url, init);

				var raw = '';
				try { raw = await response.text(); } catch (e) { raw = ''; }

				if (!response.ok) {
					// A JSON error envelope carries a better message than the status.
					var envelope = null;
					try { envelope = JSON.parse(raw); } catch (e) { envelope = null; }

					var message;
					if (envelope && envelope.ErrorMessage) {
						message = describeHttpStatus(envelope.ErrorCode || response.status) +
							'（站点返回：' + String(envelope.ErrorMessage) + '）';
					} else {
						message = describeHttpStatus(response.status, 'HTTP ' + response.status);
						var detail = summarise(raw);
						if (detail) { message += ' ' + detail; }
					}
					throw apiError('ERR_HTTP', message, { status: response.status });
				}

				var result;
				try {
					result = JSON.parse(raw);
				} catch (e) {
					throw apiError('ERR_BAD_JSON', 'API 返回的内容不是合法 JSON。');
				}

				// A 200 response can still be a failure (Status: 0).
				assertOkEnvelope(result);
				return result;

			} catch (error) {
				lastError = error;

				if (error && error.name === 'AbortError') {
					lastError = apiError('ERR_TIMEOUT', timedOut
						? '请求超时：FimTale 未在 30 秒内响应，请检查网络后重试。'
						: '请求已取消。');
				} else if (!error.code && looksLikeNetworkFailure(error)) {
					lastError = apiError('ERR_NETWORK',
						'无法连接 FimTale API。请确认网络可用；若由浏览器直接调用，' +
						'还需允许跨域（站点已返回 Access-Control-Allow-Origin: *）。');
				}

				if (attempt === MAX_ATTEMPTS || !isRetryable(lastError)) {
					throw lastError;
				}
			} finally {
				window.clearTimeout(timer);
			}
		}

		throw lastError || apiError('ERR_UNKNOWN', '请求失败。');
	}

	/**
	 * POST helper that avoids a CORS preflight. Used for `/settings` mutations.
	 * @param {string} endpoint
	 * @param {Object} body
	 * @param {Object=} options
	 */
	function formPost(endpoint, body, options) {
		return makeRequest(endpoint, {}, Object.assign({}, options, {
			method: 'POST',
			body: body,
			dedupe: false
		}));
	}

	/* ------------------------------------------------------------------ *
	 * Response helpers
	 * ------------------------------------------------------------------ */

	/**
	 * First array found among the given candidate keys.
	 * @param {Object} data
	 * @param {Array<string>} keys
	 * @returns {Array}
	 */
	function pickArray(data, keys) {
		if (!data) { return []; }
		for (var i = 0; i < keys.length; i++) {
			if (Array.isArray(data[keys[i]])) { return data[keys[i]]; }
		}
		return [];
	}

	/**
	 * Extract the topic map from a `/t/{id}` response.
	 *
	 * Verified against the live API: BOTH the first page of a work and any chapter
	 * of it return the same envelope — `TopicInfo`, `Menu`, `ParentInfo`,
	 * `AuthorInfo`, `PrequelInfo`, `SequelInfo`, `RecommendWords`,
	 * `ChannelsInvolved`, `CurrentUser` — and the `Menu` is byte-identical between
	 * them. Only the contents of `TopicInfo` differ (`IsChapter` and the fields
	 * that only make sense for a whole work, such as `ChapterCount`, are absent on
	 * a chapter).
	 *
	 * A chapter response therefore does NOT lack a table of contents, so callers
	 * should always read `menuFrom()`; caching is an optimisation, not a
	 * requirement.
	 *
	 * @param {Object} data
	 * @returns {Object}
	 */
	function topicFrom(data) {
		if (!data) { return {}; }
		if (data.TopicInfo && typeof data.TopicInfo === 'object') { return data.TopicInfo; }
		return data;
	}

	/**
	 * Extract the table of contents from a `/t/{id}` response.
	 * @param {Object} data
	 * @returns {Array}
	 */
	function menuFrom(data) {
		return Array.isArray(data && data.Menu) ? data.Menu : [];
	}

	/**
	 * Determine the id of the WORK a topic belongs to, for grouping.
	 *
	 * The API does not send a `MainID` field on `TopicInfo` (confirmed against the
	 * live API). For a chapter, the parent work is `ParentInfo.ID`; for the work's
	 * own first page, `ParentInfo.ID` equals its own id. Both pages of a work
	 * return the same `ParentInfo`, which is what makes it the right grouping key.
	 *
	 * @param {Object} data  the raw `/t/{id}` envelope
	 * @returns {(number|string|null)}
	 */
	function mainIdFrom(data) {
		if (!data) { return null; }
		var parent = data.ParentInfo;
		if (parent && (parent.ID !== undefined && parent.ID !== null)) { return parent.ID; }
		var topic = topicFrom(data);
		if (topic.ID !== undefined && topic.ID !== null) { return topic.ID; }
		return null;
	}

	/**
	 * Pagination info as documented.
	 * @param {Object} data
	 * @returns {{page: number, totalPage: number}}
	 */
	function paginationFrom(data) {
		return {
			page: Number(data && data.Page) || 1,
			totalPage: Number(data && data.TotalPage) || 1
		};
	}

	/**
	 * @param {{page: (string|number)=, limit: (string|number)=, sort: string=, order: string=}=} options
	 * @returns {Object}
	 */
	function pageParams(options) {
		var params = {};
		if (!options) { return params; }
		if (options.page) { params.page = options.page; }
		if (options.limit) { params.limit = options.limit; }
		if (options.sort) { params.sort = options.sort; }
		if (options.order) { params.order = options.order; }
		return params;
	}

	/* ------------------------------------------------------------------ *
	 * Content pages: /t/{id}, /blogposts, /channels, /tags, /u/{name}
	 * ------------------------------------------------------------------ */

	/**
	 * A work, or one chapter of a work.
	 * @param {string|number} novelId
	 * @param {{format: string=, onRetry: Function=}=} options
	 * @returns {Promise<Object>} the raw envelope (use topicFrom / menuFrom)
	 */
	function getNovel(novelId, options) {
		var params = {};
		if (options && options.format) { params.format = options.format; }
		return makeRequest('/t/' + encodeURIComponent(novelId), params, options);
	}

	/**
	 * Convenience wrapper returning just the Topic map.
	 * @param {string|number} novelId
	 * @param {Object=} options
	 * @returns {Promise<Object>}
	 */
	async function getTopic(novelId, options) {
		return topicFrom(await getNovel(novelId, options));
	}

	/**
	 * Home page: EditorRecommendTopicArray, AnnouncementArray,
	 * NewlyPostTopicArray, NewlyUpdateTopicArray.
	 * @param {Object=} options
	 */
	function getHomePage(options) {
		return makeRequest('/', {}, options);
	}

	/**
	 * Notes list — `/blogposts`, returns `BlogpostArray`.
	 */
	function getBlogposts(options, requestOptions) {
		return makeRequest('/blogposts', pageParams(options), requestOptions);
	}

	/**
	 * Channel list — `/channels`, returns `ChannelArray`.
	 */
	function getChannels(options, requestOptions) {
		return makeRequest('/channels', pageParams(options), requestOptions);
	}

	/**
	 * A single channel — `/channel/{id}`.
	 * @param {string|number} channelId
	 */
	function getChannel(channelId, options) {
		return makeRequest('/channel/' + encodeURIComponent(channelId), {}, options);
	}

	/**
	 * Tag list — `/tags`, returns `TagArray`.
	 */
	function getTags(options) {
		return makeRequest('/tags', {}, options);
	}

	/**
	 * A single tag — `/tag/{id}`.
	 * @param {string|number} tagId
	 */
	function getTag(tagId, options) {
		return makeRequest('/tag/' + encodeURIComponent(tagId), {}, options);
	}

	/**
	 * User page — `/u/{name}`. The payload has `IsUser`; when true it carries
	 * `UserInfo`, otherwise `UserArray` holds similar names.
	 * @param {string} userName
	 */
	function getUser(userName, options) {
		return makeRequest('/u/' + encodeURIComponent(userName), {}, options);
	}

	/**
	 * Timeline — `/updates/`, returns `UpdateArray`. Optionally filtered by tag.
	 * @param {{tag: string=}=} options
	 */
	function getUpdates(options, requestOptions) {
		var params = {};
		if (options && options.tag) { params.tag = options.tag; }
		return makeRequest('/updates/', params, requestOptions);
	}

	/**
	 * Work list — `/topics`, returns `TopicArray`.
	 *
	 * The spec documents `/topics` as a paginated list page. It does not document a
	 * keyword parameter, so this is for browsing; see `searchNovels()`.
	 */
	function getTopics(options, requestOptions) {
		return makeRequest('/topics', pageParams(options), requestOptions);
	}

	/**
	 * Comment list — `/comments/{type}/{id}` where type is topic | channel | blog.
	 * Returns `MainComment` (when present) and `CommentArray`.
	 *
	 * The previous implementation called `/comments/?id=...`, which is not a
	 * documented path.
	 *
	 * @param {'topic'|'channel'|'blog'} type
	 * @param {string|number} id
	 * @param {{page: (string|number)=}=} options
	 */
	function getComments(type, id, options, requestOptions) {
		var kind = String(type || 'topic').toLowerCase();
		if (['topic', 'channel', 'blog'].indexOf(kind) === -1) {
			return Promise.reject(apiError('ERR_BAD_ARG', '评论类型必须是 topic、channel 或 blog。'));
		}
		if (id === undefined || id === null || id === '') {
			return Promise.reject(apiError('ERR_BAD_ARG', '缺少评论目标 ID。'));
		}
		return makeRequest('/comments/' + kind + '/' + encodeURIComponent(id),
			pageParams(options), requestOptions);
	}

	/**
	 * Favourites — `/favorites` (needs login).
	 */
	function getFavorites(options, requestOptions) {
		return makeRequest('/favorites', pageParams(options), requestOptions);
	}

	/**
	 * Reading history — `/history` (needs login), returns `HistoryTopics`.
	 */
	function getHistory(options) {
		return makeRequest('/history', {}, options);
	}

	/**
	 * Upvote list for a work or channel — `/(t|channel)/{id}/upvotes`.
	 * @param {'t'|'channel'} kind
	 * @param {string|number} id
	 */
	function getUpvotes(kind, id, options) {
		var k = kind === 'channel' ? 'channel' : 't';
		return makeRequest('/' + k + '/' + encodeURIComponent(id) + '/upvotes', {}, options);
	}

	/* ------------------------------------------------------------------ *
	 * JSON actions: /json/{action}
	 * ------------------------------------------------------------------ */

	/**
	 * Batch card lookup for a list of site URLs.
	 * @param {Array<string>|string} urls  JSON-encoded by this function
	 */
	function getInfoByURL(urls, options) {
		var encoded = Array.isArray(urls) ? JSON.stringify(urls) : String(urls);
		return makeRequest('/json/getInfoByURL', { urls: encoded }, options);
	}

	/**
	 * Selectable tag list — `/json/getTags` (needs login). Returns `TagArray` of
	 * [name, topicCount, isMainGroup, colour] tuples.
	 */
	function getJsonTags(options) {
		return makeRequest('/json/getTags', {}, options);
	}

	/**
	 * Main tag groups and badges — `/json/getMainTags`.
	 * @param {{interface: string=}=} options  interface=edit for edit-page mode
	 */
	function getMainTags(options, requestOptions) {
		var params = {};
		if (options && options.interface) { params.interface = options.interface; }
		return makeRequest('/json/getMainTags', params, requestOptions);
	}

	/** Current-user summary — `/json/getMyInfo` (needs login). */
	function getMyInfo(options) {
		return makeRequest('/json/getMyInfo', {}, options);
	}

	/**
	 * User-name search — `/json/getUsersWithSimilarName` (needs login).
	 * @param {string} userName
	 * @param {{length: (string|number)=}=} options
	 */
	function getUsersWithSimilarName(userName, options, requestOptions) {
		var params = { UserName: userName };
		if (options && options.length) { params.Length = options.length; }
		return makeRequest('/json/getUsersWithSimilarName', params, requestOptions);
	}

	/** Contacts — `/json/getContact` (needs login). Returns InboxArr / FriendArr. */
	function getContact(options) {
		return makeRequest('/json/getContact', {}, options);
	}

	/**
	 * Topic lookup by ID — `/json/getTopicByID` (needs login).
	 * The payload is `{ Info: { ID, Title, UserName, Background } }` — a summary,
	 * not a full Topic; use `getNovel()` for content.
	 *
	 * @param {string|number} topicID
	 * @returns {Promise<Object>} the `Info` map
	 */
	async function getTopicByID(topicID, options) {
		var data = await makeRequest('/json/getTopicByID', { TopicID: topicID }, options);
		return (data && data.Info) || {};
	}

	/**
	 * Related-work recommendations — `/json/recommend`.
	 * The spec notes this returns rendered HTML rather than a structured list for
	 * web use, so it is exposed as-is for callers that want it.
	 * @param {{type: string=, id: (string|number)=, title: string=, tags: string=}=} options
	 */
	function recommend(options, requestOptions) {
		var params = {};
		if (options) {
			if (options.type) { params.type = options.type; }
			if (options.id) { params.id = options.id; }
			if (options.title) { params.title = options.title; }
			if (options.tags) { params.tags = options.tags; }
		}
		return makeRequest('/json/recommend', params, requestOptions);
	}

	/* ------------------------------------------------------------------ *
	 * Settings (/settings) — GET reads, POST mutates
	 * ------------------------------------------------------------------ */

	/** Current settings — GET `/settings` (needs login). */
	function getSettings(options) {
		return makeRequest('/settings', {}, options);
	}

	/**
	 * Generic settings mutation.
	 *
	 * Spec: "POST 需登录，以 Action 指定操作。API 请求无需 FormHash."
	 * Sent as a urlencoded form so the browser needs no CORS preflight.
	 *
	 * @param {string} action
	 * @param {Object=} data
	 */
	function settingsAction(action, data, options) {
		var body = Object.assign({}, data || {}, { Action: action });
		return formPost('/settings', body, options);
	}

	/** Update profile fields (UserSex, UserHomepage, UserIntro, Theme, ...). */
	function updateUserInfo(data, options) {
		return settingsAction('UpdateUserInfo', data, options);
	}

	/** Content filter switches (NoRestricted, NoRedTags). */
	function setGrandFilter(data, options) {
		return settingsAction('SetGrandFilter', data, options);
	}

	/** Block list (Users / Tags / Topics as JSON arrays). */
	function setBlackList(data, options) {
		return settingsAction('SetBlackList', data, options);
	}

	/* ------------------------------------------------------------------ *
	 * Search
	 * ------------------------------------------------------------------ */

	/**
	 * Search works.
	 *
	 * The v1 spec documents no search endpoint. `/topics` is the documented work-list
	 * page, so the keyword is passed there. If the server ignores the parameter the
	 * result is simply unfiltered; callers should not present it as a precise search.
	 *
	 * @param {string} query
	 * @param {{page: (string|number)=, limit: (string|number)=}=} options
	 * @returns {Promise<Object>}
	 */
	async function searchNovels(query, options, requestOptions) {
		var keyword = String(query || '').trim();
		if (!keyword) { return { TopicArray: [] }; }

		var params = pageParams(options);
		params.keyword = keyword;

		var data = await makeRequest('/topics', params, requestOptions);
		return Object.assign({}, data, { TopicArray: pickArray(data, ['TopicArray', 'Topics']) });
	}

	/* ------------------------------------------------------------------ *
	 * Diagnostics
	 * ------------------------------------------------------------------ */

	/**
	 * Topic ids used to verify that a key pair works, in order.
	 *
	 * All three were checked against the live site:
	 *   4     — FimTale 用户手册, the id the specification itself uses in its
	 *           examples (`https://fimtale.com/api/v1/t/4`). MainID 4, a work.
	 *   18405 — the API specification post. MainID 4, a *chapter* of work 4.
	 *   76448 — 《断弦上的咏叹调》, an independent work. This is what earlier
	 *           revisions hard-coded.
	 *
	 * Trying more than one id means the connection test keeps validating the
	 * *credentials* even if a specific topic is later removed or made private,
	 * instead of reporting a credential failure for an unrelated reason.
	 */
	var PROBE_TOPIC_IDS = [4, 18405, 76448];

	/**
	 * Verify stored credentials against the live API.
	 *
	 * Reports which probe succeeded so a caller can distinguish "the key is wrong"
	 * from "the probe topic is gone".
	 *
	 * @param {Object=} options
	 * @param {number=} options.probeId  force a specific probe topic
	 * @returns {Promise<{success: boolean, data: (Object|undefined), error: (string|undefined), code: (string|undefined), summary: (Object|undefined), probeId: (number|undefined), attempts: Array<Object>}>}
	 */
	async function testConnection(options) {
		var creds = getStoredCredentials();
		var shape = validateCredentials(creds.apiKey, creds.apiPass);
		if (!shape.ok) {
			return {
				success: false,
				code: 'ERR_BAD_CREDENTIALS',
				error: '凭据格式不正确：' + shape.problems.join('；'),
				attempts: []
			};
		}

		var probes = (options && options.probeId)
			? [options.probeId]
			: PROBE_TOPIC_IDS.slice();

		var attempts = [];
		var lastError = null;

		for (var i = 0; i < probes.length; i++) {
			var probeId = probes[i];
			try {
				var data = await getNovel(probeId, { dedupe: false });
				var topic = topicFrom(data);
				var currentUser = (data && data.CurrentUser) || {};
				attempts.push({ probeId: probeId, ok: true });
				return {
					success: true,
					data: data,
					probeId: probeId,
					attempts: attempts,
					summary: {
						id: topic.ID,
						title: topic.Title,
						author: topic.UserName,
						isChapter: topic.IsChapter,
						chapterCount: topic.ChapterCount,
						menuLength: menuFrom(data).length,
						user: currentUser.UserName || '(guest)',
						userRole: currentUser.UserRole
					}
				};
			} catch (error) {
				lastError = error;
				attempts.push({
					probeId: probeId,
					ok: false,
					code: error.code,
					status: error.status,
					error: error.message
				});

				// 403 means the key pair is wrong or lacks API permission — every probe
				// would fail identically, so stop rather than make the site answer three
				// times. A 404 means *this* probe topic is gone (deleted or made
				// private), which says nothing about the credentials, so try the next
				// id. A 5xx or network failure is likewise worth another attempt.
				var credentialsRejected = error.code === 'ERR_HTTP' && error.status === 403;
				if (credentialsRejected) { break; }
			}
		}

		return {
			success: false,
			error: lastError ? lastError.message : '连接测试失败',
			code: lastError ? lastError.code : 'ERR_UNKNOWN',
			probeId: probes[probes.length - 1],
			attempts: attempts
		};
	}

	/* ------------------------------------------------------------------ *
	 * Exports
	 * ------------------------------------------------------------------ */

	return {
		// configuration
		DEFAULT_ENDPOINT: DEFAULT_ENDPOINT,
		API_KEY_PATTERN: API_KEY_PATTERN,
		API_PASS_PATTERN: API_PASS_PATTERN,
		PROBE_TOPIC_IDS: PROBE_TOPIC_IDS,
		getAPIEndpoint: getAPIEndpoint,

		// credentials
		getStoredCredentials: getStoredCredentials,
		validateCredentials: validateCredentials,
		hasCredentials: hasCredentials,
		saveCredentials: saveCredentials,
		clearCredentials: clearCredentials,

		// core
		makeRequest: makeRequest,

		// content pages
		getNovel: getNovel,
		getTopic: getTopic,
		getHomePage: getHomePage,
		getBlogposts: getBlogposts,
		getChannels: getChannels,
		getChannel: getChannel,
		getTags: getTags,
		getTag: getTag,
		getUser: getUser,
		getUpdates: getUpdates,
		getTopics: getTopics,
		getComments: getComments,
		getFavorites: getFavorites,
		getHistory: getHistory,
		getUpvotes: getUpvotes,

		// json actions
		getInfoByURL: getInfoByURL,
		getJsonTags: getJsonTags,
		getMainTags: getMainTags,
		getMyInfo: getMyInfo,
		getUsersWithSimilarName: getUsersWithSimilarName,
		getContact: getContact,
		getTopicByID: getTopicByID,
		recommend: recommend,

		// settings
		getSettings: getSettings,
		settingsAction: settingsAction,
		updateUserInfo: updateUserInfo,
		setGrandFilter: setGrandFilter,
		setBlackList: setBlackList,

		// search + diagnostics
		searchNovels: searchNovels,
		testConnection: testConnection,

		// response helpers
		topicFrom: topicFrom,
		menuFrom: menuFrom,
		mainIdFrom: mainIdFrom,
		paginationFrom: paginationFrom,
		pickArray: pickArray
	};
})();

// Backwards compatibility with earlier revisions of this file.
if (typeof NovelAPI !== 'undefined' && !('API_ENDPOINT' in NovelAPI)) {
	NovelAPI.API_ENDPOINT = NovelAPI.getAPIEndpoint();
}
