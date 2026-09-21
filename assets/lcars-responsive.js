/**
 * lcars-responsive.js — mobile / small-viewport adjustments
 * =========================================================
 * Part of the LCARS-FimTale project.
 *
 * LCARS Inspired Website Template by www.TheLCARS.com, with modifications.
 *
 * WHY THIS IS MOSTLY CSS'S JOB
 * ----------------------------
 * The theme stylesheets already carry a full set of `@media` breakpoints. This
 * file only handles the few cases that need measurement in JS: trimming the data
 * cascade to fewer rows as space runs out, and letting the navigation buttons
 * wrap.
 *
 * The previous implementation applied `style.display = 'none'` inline to the
 * `.dc-row-4` / `.dc-row-5` elements, but only ever *restored* them when the
 * viewport grew past 480px. A window dragged from ≤375px to, say, 420px left
 * those rows permanently invisible, and a phone rotated to landscape kept the
 * mobile `max-height` clip with no way to scroll. Visibility is now decided in
 * exactly one place per row from the current width, and the inline caps are
 * removed again when they no longer apply.
 */
(function (window, document) {
	'use strict';

	var MOBILE_MAX_HEIGHT_RATIO = 0.35;

	/* ------------------------------------------------------------------ *
	 * Detection
	 * ------------------------------------------------------------------ */

	/**
	 * Coarse device class. User-agent sniffing is inherently approximate; the
	 * stylesheets use media queries and this is only used for the couple of
	 * JS-driven tweaks below, so a wrong answer is cosmetic.
	 * @returns {'tablet'|'mobile'|'desktop'}
	 */
	function getDeviceType() {
		var ua = navigator.userAgent || '';

		if (/iPad/.test(ua)) { return 'tablet'; }
		// iPadOS 13+ masquerades as desktop Safari: a touch-capable "Mac" is an iPad.
		if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) { return 'tablet'; }

		if (/Android/.test(ua)) {
			// Android tablets omit "Mobile" from the UA string.
			return /Mobile/.test(ua) ? 'mobile' : 'tablet';
		}
		if (/iPhone|iPod/.test(ua)) { return 'mobile'; }
		if (/Windows Phone/.test(ua)) { return 'mobile'; }

		return 'desktop';
	}

	/**
	 * @returns {string}
	 */
	function getBrowserType() {
		var ua = navigator.userAgent || '';
		// Order matters: Edge and Opera both also match "Chrome".
		if (/Edg\//.test(ua)) { return 'edge'; }
		if (/OPR\//.test(ua) || /Opera/.test(ua)) { return 'opera'; }
		if (/Firefox\//.test(ua)) { return 'firefox'; }
		if (/Chrome\//.test(ua)) { return 'chrome'; }
		if (/Safari\//.test(ua)) { return 'safari'; }
		return 'unknown';
	}

	/**
	 * @returns {'portrait'|'landscape'}
	 */
	function getScreenOrientation() {
		return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
	}

	/* ------------------------------------------------------------------ *
	 * Data cascade
	 * ------------------------------------------------------------------ */

	/**
	 * Which rows may be shown at a given width. Returning the decision from one
	 * function is what keeps `display` from getting stuck: every row is either
	 * explicitly shown or explicitly hidden on every pass.
	 * @param {number} width
	 * @returns {{row4: boolean, row5: boolean, cap: (number|null)}}
	 */
	function planForWidth(width) {
		// Below 375px the cascade keeps only the first three rows of each column.
		if (width <= 375) { return { row4: false, row5: false, cap: 0.30 }; }
		if (width <= 480) { return { row4: true, row5: false, cap: 0.35 }; }
		return { row4: true, row5: true, cap: null };
	}

	/**
	 * Apply the plan to the cascade wrapper, if this page has one.
	 */
	function applyDataCascadeScale() {
		var wrapper = document.querySelector('.data-cascade-wrapper');
		if (!wrapper) { return; }

		var plan = planForWidth(window.innerWidth);

		['dc-row-4', 'dc-row-5'].forEach(function (cls) {
			var wanted = cls === 'dc-row-4' ? plan.row4 : plan.row5;
			var rows = wrapper.querySelectorAll('.' + cls);
			Array.prototype.forEach.call(rows, function (row) {
				row.style.display = wanted ? '' : 'none';
			});
		});

		var compact = plan.cap !== null;
		if (compact) {
			wrapper.style.maxHeight = Math.floor(window.innerHeight * plan.cap) + 'px';
			wrapper.style.overflow = 'hidden';
		} else {
			// Clear the inline caps so the stylesheet's own height applies again.
			wrapper.style.maxHeight = '';
			wrapper.style.overflow = '';
		}

		// Tighten the type only while the cascade is being capped.
		var fontScale = null;
		if (window.innerWidth < 375) { fontScale = '0.55rem'; }
		else if (window.innerWidth < 480) { fontScale = '0.6rem'; }
		else if (window.innerWidth < 600) { fontScale = '0.65rem'; }

		var cells = wrapper.querySelectorAll('.data-column div');
		Array.prototype.forEach.call(cells, function (cell) {
			if (fontScale) {
				cell.style.fontSize = fontScale;
				cell.style.padding = '0.15rem 0.3rem';
			} else {
				cell.style.fontSize = '';
				cell.style.padding = '';
			}
		});
	}

	/* ------------------------------------------------------------------ *
	 * Navigation buttons
	 * ------------------------------------------------------------------ */

	/**
	 * Let the cascade's button row wrap on narrow screens instead of overflowing.
	 */
	function optimizeNavButtons() {
		var nav = document.querySelector('.data-cascade-button-group nav');
		if (!nav) { return; }

		var device = getDeviceType();
		var narrow = window.innerWidth <= 750 || device !== 'desktop';

		if (narrow) {
			nav.style.display = 'flex';
			nav.style.flexWrap = 'wrap';
			nav.style.gap = device === 'mobile' ? '0.3rem' : '0.5rem';
			var minWidth = device === 'mobile' ? '3.5rem' : '4rem';
			Array.prototype.forEach.call(nav.querySelectorAll('button'), function (btn) {
				btn.style.flex = '1 1 auto';
				btn.style.minWidth = minWidth;
			});
		} else {
			// Hand the layout back to the stylesheet.
			nav.style.display = '';
			nav.style.flexWrap = '';
			nav.style.gap = '';
			Array.prototype.forEach.call(nav.querySelectorAll('button'), function (btn) {
				btn.style.flex = '';
				btn.style.minWidth = '';
			});
		}
	}

	/* ------------------------------------------------------------------ *
	 * Body classes
	 * ------------------------------------------------------------------ */

	function addDeviceClass() {
		var body = document.body;
		if (!body) { return; }
		body.classList.remove('device-mobile', 'device-tablet', 'device-desktop');
		body.classList.add('device-' + getDeviceType());

		body.classList.remove('orientation-portrait', 'orientation-landscape');
		body.classList.add('orientation-' + getScreenOrientation());
	}

	/* ------------------------------------------------------------------ *
	 * Lifecycle
	 * ------------------------------------------------------------------ */

	var resizeTimer = null;
	var initialised = false;

	function runOptimisations() {
		addDeviceClass();
		applyDataCascadeScale();
		optimizeNavButtons();
	}

	function onViewportChange() {
		if (resizeTimer) { window.clearTimeout(resizeTimer); }
		resizeTimer = window.setTimeout(function () {
			resizeTimer = null;
			runOptimisations();
		}, 150);
	}

	function init() {
		if (initialised) { return; }
		initialised = true;

		runOptimisations();

		// `resize` fires for orientation changes too, and `orientationchange` is
		// deprecated, so a single debounced resize handler covers both.
		window.addEventListener('resize', onViewportChange, { passive: true });
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}

	/* ------------------------------------------------------------------ *
	 * Exports
	 * ------------------------------------------------------------------ */

	window.LCARSResponsive = {
		init: init,
		refresh: runOptimisations,
		getDeviceType: getDeviceType,
		getBrowserType: getBrowserType,
		getScreenOrientation: getScreenOrientation,
		applyDataCascadeScale: applyDataCascadeScale,
		optimizeNavButtons: optimizeNavButtons
	};

})(window, document);
