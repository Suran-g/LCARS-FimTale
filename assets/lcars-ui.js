/**
 * lcars-ui.js — shared LCARS interface behaviour
 * ================================================
 * Part of the LCARS-FimTale project.
 *
 * LCARS Inspired Website Template by www.TheLCARS.com, with modifications.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Four pages (about / api-config / classic-standard / novel-reader) each carried
 * a verbatim copy of the same ~140 lines that drive the "data cascade" readouts
 * (clock, date, device, network, screen, battery, memory, uptime, language,
 * user agent). Those copies had drifted apart and contained bugs. This file is
 * the single implementation they now share.
 *
 * Each page declares which readout elements it owns by putting them in a
 * container that has a `data-lcars-readout` attribute:
 *
 *     <div class="data-cascade-wrapper" id="reader-data" data-lcars-readout>
 *       ... <div id="dc-time">--:--:--</div> ...
 *     </div>
 *
 * Elements are addressed by a PREFIX + suffix convention. The prefix defaults to
 * "dc", so the reader page uses ids like `dc-time`, while a page that sets
 * `data-lcars-readout="about"` uses `about-time`. Missing elements are skipped
 * instead of throwing, so a page may implement only the readouts it wants.
 *
 * Public API (also exposed on `window.LCARSUI`):
 *   LCARSUI.initDynamicData()        -> start the readouts (idempotent)
 *   LCARSUI.stopDynamicData()        -> stop every timer and listener it added
 *   LCARSUI.refreshReadouts()        -> force one immediate refresh
 *   LCARSUI.playSound(id)            -> play a beep, never throws
 *   LCARSUI.playSoundAndRedirect(id, url)
 *   LCARSUI.topFunction()            -> scroll to top
 *   LCARSUI.escapeHtml(value)        -> HTML-escape untrusted text
 *   LCARSUI.text(value)              -> String(value) but null/undefined -> ''
 *
 * All internal state is private; nothing here touches globals other than the
 * documented `window.LCARSUI` object and the legacy `playSound`,
 * `playSoundAndRedirect` and `topFunction` names that the inline `onclick`
 * attributes in the template markup rely on.
 */
(function (window, document) {
	'use strict';

	/* ------------------------------------------------------------------ *
	 * Small helpers
	 * ------------------------------------------------------------------ */

	var listeners = [];
	var intervals = [];
	var started = false;

	/**
	 * Convert any value to a display string, mapping null/undefined to ''.
	 * @param {*} value
	 * @returns {string}
	 */
	function text(value) {
		return (value === null || value === undefined) ? '' : String(value);
	}

	/**
	 * Escape a string for safe insertion into HTML.
	 * Used wherever untrusted text (API data, user input, error messages) has to
	 * be placed inside an innerHTML template. Prefer building nodes with
	 * createElement/textContent where practical; this is the fallback.
	 * @param {*} value
	 * @returns {string}
	 */
	function escapeHtml(value) {
		return text(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	/**
	 * Register an interval so it can be cleared by stopDynamicData().
	 * @param {Function} fn
	 * @param {number} ms
	 */
	function addInterval(fn, ms) {
		intervals.push(window.setInterval(fn, ms));
	}

	/**
	 * Register an event listener so it can be removed by stopDynamicData().
	 * @param {EventTarget} target
	 * @param {string} type
	 * @param {Function} handler
	 * @param {(boolean|Object)=} options
	 */
	function addListener(target, type, handler, options) {
		target.addEventListener(type, handler, options);
		listeners.push({ target: target, type: type, handler: handler, options: options });
	}

	/* ------------------------------------------------------------------ *
	 * Audio + navigation
	 * ------------------------------------------------------------------ */

	/**
	 * Play a keystroke sound. Never throws, never blocks: if the element is
	 * missing or the browser refuses to play, the call is simply a no-op.
	 * @param {string} audioId
	 */
	function playSound(audioId) {
		try {
			var audio = document.getElementById(audioId);
			if (!audio) { return; }
			audio.currentTime = 0;
			var p = audio.play();
			if (p && typeof p.catch === 'function') { p.catch(function () {}); }
		} catch (e) { /* audio is decorative; never let it break navigation */ }
	}

	/**
	 * Play a keystroke sound and then navigate to `url`.
	 *
	 * The original implementation navigated *only* from the audio element's
	 * `ended` event, with `play()` rejections swallowed. That meant a click did
	 * nothing at all whenever the sound failed to load, autoplay was refused, or
	 * the clip had already finished (a completed element never fires `ended`
	 * again) — and two quick clicks would overwrite `onended` and drop a
	 * navigation. Navigation is the primary action, so it is now guaranteed:
	 * whichever comes first — the clip finishing, an audio error, or a short
	 * fallback timer — wins exactly once.
	 *
	 * @param {string} audioId
	 * @param {string} url
	 */
	function playSoundAndRedirect(audioId, url) {
		var navigated = false;

		function go() {
			if (navigated) { return; }
			navigated = true;
			if (url) { window.location.href = url; }
		}

		// Safety net: if the sound is slow, blocked, or silent, still navigate.
		// 700ms keeps the LCARS "press, beep, then move" feel without ever
		// feeling stuck.
		var fallback = window.setTimeout(go, 700);

		function goNow() {
			window.clearTimeout(fallback);
			go();
		}

		try {
			var audio = document.getElementById(audioId);
			if (!audio) { goNow(); return; }

			audio.currentTime = 0;
			audio.onended = goNow;
			audio.onerror = goNow;

			var p = audio.play();
			if (p && typeof p.catch === 'function') { p.catch(goNow); }
		} catch (e) {
			goNow();
		}
	}

	/**
	 * Scroll to the top of the page.
	 * `document.body.scrollTop` is a no-op in standards mode and on iOS, so both
	 * the body and the scrolling element are set, plus a smooth scroll where
	 * supported.
	 */
	function topFunction() {
		var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		try {
			window.scrollTo({ top: 0, left: 0, behavior: reduce ? 'auto' : 'smooth' });
		} catch (e) {
			window.scrollTo(0, 0);
		}
		document.body.scrollTop = 0;
		document.documentElement.scrollTop = 0;
	}

	/**
	 * Scroll-to-top button visibility.
	 *
	 * The stylesheets hide #topBtn with `display: none`; this reveals it once the
	 * page is scrolled. The element is looked up on every scroll rather than
	 * cached at parse time, so it works regardless of script placement, and a
	 * real listener replaces the old `window.onscroll =` assignment (which
	 * clobbered any other scroll handler).
	 */
	function initScrollTop() {
		var btn = document.getElementById('topBtn');
		if (!btn) { return; }

		var ticking = false;

		function update() {
			ticking = false;
			var y = window.pageYOffset ||
				document.documentElement.scrollTop ||
				document.body.scrollTop || 0;
			btn.style.display = (y > 200) ? 'block' : 'none';
		}

		addListener(window, 'scroll', function () {
			if (ticking) { return; }
			ticking = true;
			window.requestAnimationFrame(update);
		}, { passive: true });

		update();
	}

	/* ------------------------------------------------------------------ *
	 * Data cascade readouts
	 * ------------------------------------------------------------------ */

	/**
	 * Find the container that declares which readouts this page implements.
	 * @returns {{container: (Element|null), prefix: string}}
	 */
	function readoutScope() {
		var container = document.querySelector('[data-lcars-readout]');
		var prefix = container ? (container.getAttribute('data-lcars-readout') || 'dc') : 'dc';
		return { container: container, prefix: prefix };
	}

	/**
	 * Resolve one readout element by suffix, e.g. 'time' -> #dc-time.
	 * @param {string} prefix
	 * @param {string} suffix
	 * @returns {(Element|null)}
	 */
	function readout(prefix, suffix) {
		return document.getElementById(prefix + '-' + suffix);
	}

	/**
	 * Get the text of a readout element, or '' when absent.
	 * @param {string} prefix
	 * @param {string} suffix
	 * @returns {string}
	 */
	function readoutValue(prefix, suffix) {
		var el = readout(prefix, suffix);
		return el ? text(el.textContent).trim() : '';
	}

	/**
	 * Set a readout's text and optional colour, skipping absent elements.
	 * @param {string} prefix
	 * @param {string} suffix
	 * @param {string} value
	 * @param {string=} color
	 */
	function setReadout(prefix, suffix, value, color) {
		var el = readout(prefix, suffix);
		if (!el) { return; }
		el.textContent = text(value);
		if (color !== undefined) { el.style.color = color; }
	}

	var COLORS = {
		ok: '#6c6',
		warn: '#f96',
		bad: '#c66',
		none: ''
	};

	var bootTime = Date.now();
	var apiCallCount = 0;
	var apiCallStart = 0;

	function updateTime(prefix) {
		var now = new Date();
		var hh = String(now.getHours()).padStart(2, '0');
		var mm = String(now.getMinutes()).padStart(2, '0');
		var ss = String(now.getSeconds()).padStart(2, '0');
		setReadout(prefix, 'time', hh + ':' + mm + ':' + ss);

		var yyyy = now.getFullYear();
		var mo = String(now.getMonth() + 1).padStart(2, '0');
		var dd = String(now.getDate()).padStart(2, '0');
		setReadout(prefix, 'date', yyyy + '/' + mo + '/' + dd);
	}

	function updateUptime(prefix) {
		var elapsed = Math.floor((Date.now() - bootTime) / 1000);
		var h = Math.floor(elapsed / 3600);
		var m = Math.floor((elapsed % 3600) / 60);
		var s = elapsed % 60;
		setReadout(prefix, 'uptime',
			String(h).padStart(2, '0') + ':' +
			String(m).padStart(2, '0') + ':' +
			String(s).padStart(2, '0'));
	}

	function getDeviceName() {
		var ua = navigator.userAgent || '';
		// iPadOS 13+ reports itself as "Macintosh"; a touch-capable "Mac" is an iPad.
		if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) { return 'iPad'; }
		if (/iPhone/.test(ua)) { return 'iPhone'; }
		if (/Android/.test(ua)) { return 'Android'; }
		if (/Windows/.test(ua)) { return 'WinPC'; }
		if (/Macintosh/.test(ua)) { return 'Mac'; }
		if (/Linux/.test(ua)) { return 'Linux'; }
		return 'N/A';
	}

	function getBrowserName() {
		var ua = navigator.userAgent || '';
		// Order matters: Edge and Opera both contain "Chrome".
		if (/Edg\//.test(ua)) { return 'Edge'; }
		if (/OPR\//.test(ua)) { return 'Opera'; }
		if (/Firefox\//.test(ua)) { return 'Firefox'; }
		if (/Chrome\//.test(ua)) { return 'Chrome'; }
		if (/Safari\//.test(ua)) { return 'Safari'; }
		return 'N/A';
	}

	function updateDeviceInfo(prefix) {
		setReadout(prefix, 'dev', getDeviceName());
		setReadout(prefix, 'ua', getBrowserName());
	}

	function updateNetworkInfo(prefix) {
		var online = navigator.onLine !== false;

		if (online) {
			// Reset the colour: the offline branch below paints it red and the
			// original code never restored it, so NET stayed red for the session.
			var sys = readout(prefix, 'sys');
			if (sys) {
				if (sys.textContent === 'OFFLINE') { sys.textContent = 'ONLINE'; }
				sys.style.color = COLORS.ok;
			}

			var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
			var label = 'ONLINE';
			if (conn) {
				var type = conn.effectiveType || 'unknown';
				var downlink = typeof conn.downlink === 'number' ? conn.downlink.toFixed(1) : '?';
				label = text(type).toUpperCase() + ' ' + downlink + 'Mb';
			}
			setReadout(prefix, 'net', label, COLORS.none);
		} else {
			setReadout(prefix, 'sys', 'OFFLINE', COLORS.bad);
			setReadout(prefix, 'net', 'OFFLINE', COLORS.bad);
		}
	}

	function updateScreenInfo(prefix) {
		var dpr = window.devicePixelRatio || 1;
		setReadout(prefix, 'scr',
			window.innerWidth + 'x' + window.innerHeight + ' ' + dpr.toFixed(1) + 'x');
	}

	function updateBatteryInfo(prefix) {
		var el = readout(prefix, 'batt');
		if (!el) { return; }

		if (!('getBattery' in navigator)) {
			el.textContent = 'N/A';
			return;
		}

		navigator.getBattery().then(function (battery) {
			function paint() {
				var level = Math.round(battery.level * 100);
				el.textContent = level + '%' + (battery.charging ? ' \u26A1' : '');
				el.style.color = level <= 20 ? COLORS.bad : (level <= 50 ? COLORS.warn : COLORS.none);
			}
			paint();
			// Event-driven instead of polling every 30s.
			if (typeof battery.addEventListener === 'function') {
				battery.addEventListener('levelchange', paint);
				battery.addEventListener('chargingchange', paint);
			}
		}).catch(function () {
			el.textContent = 'N/A';
		});
	}

	function updateMemoryInfo(prefix) {
		// performance.memory is a non-standard Chrome API; other engines get N/A.
		var mem = window.performance && window.performance.memory;
		if (mem && mem.usedJSHeapSize) {
			var used = Math.round(mem.usedJSHeapSize / 1048576);
			var total = Math.round(mem.jsHeapSizeLimit / 1048576);
			setReadout(prefix, 'mem', used + 'MB/' + total + 'MB');
		} else {
			setReadout(prefix, 'mem', 'N/A');
		}
	}

	function updateLanguage(prefix) {
		setReadout(prefix, 'lang', navigator.language || 'N/A');
	}

	/**
	 * Update the mode readout (HOME / READ / SEARCH / HOT / LATEST).
	 * @param {string} mode
	 */
	function setMode(mode) {
		var scope = readoutScope();
		setReadout(scope.prefix, 'mode', mode);
	}

	/**
	 * API telemetry. These counters existed on the reader page but were never
	 * called, so LAT and Calls were permanently stuck at "---" and "Calls: 0".
	 */
	function updateAPILatency() {
		var scope = readoutScope();
		var el = readout(scope.prefix, 'lat');
		if (!el) { return; }
		if (!apiCallStart) {
			el.textContent = '---';
			el.style.color = COLORS.none;
			return;
		}
		var latency = Date.now() - apiCallStart;
		el.textContent = latency + 'ms';
		el.style.color = latency < 200 ? COLORS.ok : (latency < 500 ? COLORS.warn : COLORS.bad);
	}

	function updateAPICallCount() {
		var scope = readoutScope();
		setReadout(scope.prefix, 'api', 'Calls: ' + apiCallCount);
	}

	function startAPICall() {
		apiCallCount += 1;
		apiCallStart = Date.now();
		updateAPICallCount();
	}

	function endAPICall() {
		if (!apiCallStart) { return; }
		updateAPILatency();
		apiCallStart = 0;
	}

	/**
	 * Run every readout once, immediately.
	 */
	function refreshReadouts() {
		var prefix = readoutScope().prefix;
		updateTime(prefix);
		updateUptime(prefix);
		updateDeviceInfo(prefix);
		updateNetworkInfo(prefix);
		updateScreenInfo(prefix);
		updateBatteryInfo(prefix);
		updateMemoryInfo(prefix);
		updateLanguage(prefix);
		updateAPICallCount();
		updateAPILatency();
	}

	/**
	 * Start the readouts. Idempotent: calling it twice does not double the
	 * timers or listeners, which the previous per-page copies would have done.
	 */
	function initDynamicData() {
		if (started) { return; }
		started = true;

		var prefix = readoutScope().prefix;

		refreshReadouts();

		// One timer per second drives both the clock and the uptime counter.
		addInterval(function () {
			if (document.hidden) { return; } // do not write to the DOM in a hidden tab
			updateTime(prefix);
			updateUptime(prefix);
		}, 1000);

		addInterval(function () {
			if (document.hidden) { return; }
			updateNetworkInfo(prefix);
			updateMemoryInfo(prefix);
			updateBatteryInfo(prefix);
		}, 30000);

		addInterval(function () {
			if (document.hidden) { return; }
			updateScreenInfo(prefix);
		}, 5000);

		addListener(window, 'resize', function () { updateScreenInfo(prefix); }, { passive: true });
		addListener(window, 'online', function () { updateNetworkInfo(prefix); });
		addListener(window, 'offline', function () { updateNetworkInfo(prefix); });

		// Catch up immediately when the tab becomes visible again.
		addListener(document, 'visibilitychange', function () {
			if (!document.hidden) { refreshReadouts(); }
		});
	}

	/**
	 * Stop everything initDynamicData() started. Provided so pages can clean up
	 * (e.g. before navigating away in a single-page context) instead of leaking
	 * timers for the lifetime of the tab.
	 */
	function stopDynamicData() {
		intervals.forEach(function (id) { window.clearInterval(id); });
		intervals = [];
		listeners.forEach(function (l) {
			l.target.removeEventListener(l.type, l.handler, l.options);
		});
		listeners = [];
		started = false;
	}

	/* ------------------------------------------------------------------ *
	 * Attribution footer
	 * ------------------------------------------------------------------ */

	/**
	 * Site-wide attribution required by the template licence.
	 *
	 * The LCARS End-User License Agreement requires that any site built from the
	 * template (a) links back to the Licensor's website and (b) states that
	 * changes were made. Two pages shipped with no footer at all and the rest said
	 * only "by www.TheLCARS.com", so the "with modifications" half of the
	 * requirement was missing everywhere.
	 *
	 * The block is inserted into every `[data-lcars-footer]` placeholder, and
	 * appended to pages that have no `<footer>` element yet, so the notice cannot
	 * be forgotten when a page is added. The markup is static, so it is present in
	 * the DOM and visible to crawlers.
	 */
	function renderFooter() {
		var year = new Date().getFullYear();
		var html =
			'<p><strong>LCARS Inspired Website Template</strong> by ' +
			'<a href="https://www.thelcars.com" target="_blank" rel="noopener noreferrer">www.TheLCARS.com</a>' +
			', with modifications.</p>' +
			'<p>Star Trek and related marks are trademarks of CBS Studios Inc. ' +
			'This site is in no way affiliated with CBS Studios Inc.</p>' +
			'<p>Content &copy; ' + year + ' LCARS-FimTale &mdash; ' +
			'a non-commercial fan project for personal and educational use only.</p>';

		var hosts = document.querySelectorAll('[data-lcars-footer]');
		if (!hosts.length) {
			// No placeholder on this page: only add one if the page has no footer.
			if (document.querySelector('footer')) { return; }
			var main = document.querySelector('.right-frame') || document.body;
			var created = document.createElement('footer');
			main.appendChild(created);
			hosts = [created];
		}

		Array.prototype.forEach.call(hosts, function (host) {
			host.innerHTML = html;
		});
	}

	/* ------------------------------------------------------------------ *
	 * Bootstrap
	 * ------------------------------------------------------------------ */

	function bindTopButton() {
		var btn = document.getElementById('topBtn');
		if (!btn) { return; }
		// Route the inline onclick through a listener instead, so the fallback in
		// playSoundAndRedirect does not also have to scroll.
		if (/topFunction/.test(btn.getAttribute('onclick') || '')) {
			btn.removeAttribute('onclick');
			btn.addEventListener('click', function () { topFunction(); });
		}
	}

	function boot() {
		renderFooter();
		initScrollTop();
		bindTopButton();
		initDynamicData();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot, { once: true });
	} else {
		boot();
	}

	/* ------------------------------------------------------------------ *
	 * Exports
	 * ------------------------------------------------------------------ */

	var LCARSUI = {
		// lifecycle
		initDynamicData: initDynamicData,
		stopDynamicData: stopDynamicData,
		refreshReadouts: refreshReadouts,
		setMode: setMode,
		// api telemetry
		startAPICall: startAPICall,
		endAPICall: endAPICall,
		// audio + navigation
		playSound: playSound,
		playSoundAndRedirect: playSoundAndRedirect,
		topFunction: topFunction,
		// string helpers for callers that build HTML
		text: text,
		escapeHtml: escapeHtml,
		// attribution
		renderFooter: renderFooter,
		// diagnostics
		getDeviceName: getDeviceName,
		getBrowserName: getBrowserName
	};

	window.LCARSUI = LCARSUI;

	// Legacy global names. The template markup uses inline
	// onclick="playSoundAndRedirect(...)" / "topFunction()", so these must stay
	// global. This file is the single definition; pages must NOT redefine them.
	window.playSound = playSound;
	window.playSoundAndRedirect = playSoundAndRedirect;
	window.topFunction = topFunction;

})(window, document);
