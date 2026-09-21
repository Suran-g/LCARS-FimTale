/**
 * lcars.js — LCARS template behaviours
 * ====================================
 * Part of the LCARS-FimTale project.
 *
 * LCARS Inspired Website Template by www.TheLCARS.com, with modifications.
 *
 * RESPONSIBILITIES
 * ----------------
 * This file keeps the classic helper names working for the inline `onclick`
 * attributes in the template markup, and implements the small UI behaviours that
 * belong to the template itself: the accordion, the "blinkie" style toggles, and
 * the LCARS keystroke player.
 *
 * The sound + navigation helpers and the scroll-to-top button live in
 * `lcars-ui.js`, which every page loads. They used to be defined here as well,
 * and two pages defined them a third time inline — three conflicting copies of
 * the same function. `lcars-ui.js` is now the single definition, so load order
 * is: lcars.js, then lcars-ui.js. To keep pages that only load this file
 * working, the functions below delegate to LCARSUI when it is present and fall
 * back to a minimal local implementation when it is not.
 */
(function (window, document) {
	'use strict';

	/* ------------------------------------------------------------------ *
	 * Sound + navigation (delegating)
	 * ------------------------------------------------------------------ */

	/**
	 * Play a keystroke sound. Delegates to LCARSUI when available.
	 *
	 * This is defined here (and not only in lcars-ui.js) because several template
	 * pages call `playSound('audio1')` from inline handlers while loading only
	 * this file — `about.html` was throwing
	 * "Uncaught ReferenceError: playSound is not defined" on every such click.
	 *
	 * @param {string} audioId
	 */
	function playSound(audioId) {
		if (window.LCARSUI && window.LCARSUI.playSound) {
			window.LCARSUI.playSound(audioId);
			return;
		}
		try {
			var audio = document.getElementById(audioId);
			if (!audio) { return; }
			audio.currentTime = 0;
			var p = audio.play();
			if (p && typeof p.catch === 'function') { p.catch(function () {}); }
		} catch (e) { /* decorative audio must never break the page */ }
	}

	/**
	 * Play a keystroke sound then navigate. Delegates to LCARSUI when available.
	 *
	 * The local fallback keeps the guarantee that matters: navigation always
	 * happens, even if the sound cannot play.
	 *
	 * @param {string} audioId
	 * @param {string} url
	 */
	function playSoundAndRedirect(audioId, url) {
		if (window.LCARSUI && window.LCARSUI.playSoundAndRedirect) {
			window.LCARSUI.playSoundAndRedirect(audioId, url);
			return;
		}

		var navigated = false;
		function go() {
			if (navigated) { return; }
			navigated = true;
			if (url) { window.location.href = url; }
		}

		var fallback = window.setTimeout(go, 700);

		try {
			var audio = document.getElementById(audioId);
			if (!audio) { window.clearTimeout(fallback); go(); return; }

			function goNow() { window.clearTimeout(fallback); go(); }

			audio.currentTime = 0;
			audio.onended = goNow;
			audio.onerror = goNow;
			var p = audio.play();
			if (p && typeof p.catch === 'function') { p.catch(goNow); }
		} catch (e) {
			window.clearTimeout(fallback);
			go();
		}
	}

	/**
	 * Scroll to the top of the page. Delegates to LCARSUI when available.
	 */
	function topFunction() {
		if (window.LCARSUI && window.LCARSUI.topFunction) {
			window.LCARSUI.topFunction();
			return;
		}
		try {
			window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		} catch (e) {
			window.scrollTo(0, 0);
		}
		document.body.scrollTop = 0;
		document.documentElement.scrollTop = 0;
	}

	/**
	 * Jump to an in-page anchor without a full reload.
	 * @param {string} anchorId
	 */
	function goToAnchor(anchorId) {
		if (!anchorId) { return; }
		var target = document.getElementById(anchorId);
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} else {
			window.location.hash = anchorId;
		}
	}

	/* ------------------------------------------------------------------ *
	 * Accordion
	 * ------------------------------------------------------------------ */

	/**
	 * Wire up `.accordion` elements.
	 *
	 * Changes from the original: the panel is only expanded when the content is
	 * actually present (the old code dereferenced `nextElementSibling` blindly and
	 * threw when an accordion had no sibling), the expanded state is exposed via
	 * `aria-expanded` so it is announced by screen readers, and the open panel's
	 * max-height is recalculated on resize so content is not clipped.
	 */
	function initAccordions() {
		var acc = document.getElementsByClassName('accordion');
		if (!acc.length) { return; }

		var openPanels = [];

		function sizeOpenPanels() {
			openPanels.forEach(function (panel) {
				panel.style.maxHeight = panel.scrollHeight + 'px';
			});
		}

		Array.prototype.forEach.call(acc, function (button, index) {
			var panel = button.nextElementSibling;
			if (!panel) { return; }

			if (!panel.id) { panel.id = 'accordion-panel-' + index; }
			button.setAttribute('aria-controls', panel.id);
			button.setAttribute('aria-expanded', 'false');

			button.addEventListener('click', function () {
				var isOpen = button.classList.toggle('active');
				button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

				if (isOpen) {
					panel.style.maxHeight = panel.scrollHeight + 'px';
					if (openPanels.indexOf(panel) === -1) { openPanels.push(panel); }
				} else {
					panel.style.maxHeight = null;
					openPanels = openPanels.filter(function (p) { return p !== panel; });
				}
			});
		});

		window.addEventListener('resize', sizeOpenPanels, { passive: true });
	}

	/* ------------------------------------------------------------------ *
	 * LCARS keystroke player
	 * ------------------------------------------------------------------ */

	/**
	 * Play the shared `#LCARSkeystroke` sample whenever a `.playSoundButton` is
	 * activated. Silently skipped on pages that do not use this feature.
	 */
	function initLCARSKeystroke() {
		var keystroke = document.getElementById('LCARSkeystroke');
		if (!keystroke) { return; }

		var buttons = document.querySelectorAll('.playSoundButton');
		Array.prototype.forEach.call(buttons, function (button) {
			button.addEventListener('click', function () {
				try {
					keystroke.pause();
					keystroke.currentTime = 0;
					var p = keystroke.play();
					if (p && typeof p.catch === 'function') { p.catch(function () {}); }
				} catch (e) { /* ignore */ }
			});
		});
	}

	/* ------------------------------------------------------------------ *
	 * Bootstrap
	 * ------------------------------------------------------------------ */

	function boot() {
		initAccordions();
		initLCARSKeystroke();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot, { once: true });
	} else {
		boot();
	}

	/* ------------------------------------------------------------------ *
	 * Exports — global names are required by inline onclick attributes.
	 * ------------------------------------------------------------------ */

	window.playSound = playSound;
	window.playSoundAndRedirect = playSoundAndRedirect;
	window.topFunction = topFunction;
	window.goToAnchor = goToAnchor;

})(window, document);
