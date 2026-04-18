/**
 * LCARS 响应式优化工具
 * 检测浏览器类型和设备类型，优化移动端显示效果
 */

var LCARSResponsive = (function() {
	'use strict';
	
	/**
	 * 设备类型检测
	 */
	function getDeviceType() {
		var userAgent = navigator.userAgent || navigator.vendor || window.opera;
		
		// 平板设备检测
		if (/iPad/.test(userAgent)) {
			return 'tablet';
		}
		
		// 移动设备检测
		if (/Android/.test(userAgent) && /Mobile/.test(userAgent)) {
			return 'mobile';
		}
		if (/iPhone|iPad|iPod/.test(userAgent)) {
			return 'mobile';
		}
		if (/Windows Phone/.test(userAgent)) {
			return 'mobile';
		}
		
		// 桌面设备
		return 'desktop';
	}
	
	/**
	 * 浏览器类型检测
	 */
	function getBrowserType() {
		var userAgent = navigator.userAgent;
		
		if (/Chrome/.test(userAgent) && !/Edg/.test(userAgent)) {
			return 'chrome';
		}
		if (/Firefox/.test(userAgent)) {
			return 'firefox';
		}
		if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
			return 'safari';
		}
		if (/Edg/.test(userAgent)) {
			return 'edge';
		}
		if (/MSIE|Trident/.test(userAgent)) {
			return 'ie';
		}
		
		return 'unknown';
	}
	
	/**
	 * 获取屏幕方向
	 */
	function getScreenOrientation() {
		if (window.innerWidth > window.innerHeight) {
			return 'landscape';
		}
		return 'portrait';
	}
	
	/**
	 * 根据设备类型计算最佳缩放比例
	 */
	function getOptimalScale() {
		var deviceType = getDeviceType();
		var screenWidth = window.innerWidth;
		
		if (deviceType === 'desktop') {
			return 1;
		}
		
		if (deviceType === 'tablet') {
			// 平板：根据屏幕宽度调整
			if (screenWidth >= 1024) {
				return 0.9;
			}
			return 0.8;
		}
		
		// 移动设备：根据屏幕宽度精细调整
		if (screenWidth >= 768) {
			return 0.85;
		}
		if (screenWidth >= 600) {
			return 0.75;
		}
		if (screenWidth >= 480) {
			return 0.65;
		}
		if (screenWidth >= 375) {
			return 0.6;
		}
		
		// 小屏幕手机
		return 0.55;
	}
	
	/**
	 * 应用data-cascade缩放优化
	 */
	function applyDataCascadeScale() {
		var wrapper = document.querySelector('.data-cascade-wrapper');
		if (!wrapper) return;
		
		var scale = getOptimalScale();
		var deviceType = getDeviceType();
		
		// 设置变换原点为左上角
		wrapper.style.transformOrigin = 'top left';
		wrapper.style.transform = 'scale(' + scale + ')';
		
		// 移动端：限制最大高度避免溢出
		if (deviceType === 'mobile' || deviceType === 'tablet') {
			var maxHeight = Math.floor(window.innerHeight * 0.35);
			wrapper.style.maxHeight = maxHeight + 'px';
			wrapper.style.overflow = 'hidden';
		}
		
		// 小屏幕：隐藏次要数据行
		if (scale <= 0.65) {
			var row5Elements = wrapper.querySelectorAll('.dc-row-5');
			row5Elements.forEach(function(el) {
				el.style.display = 'none';
			});
		}
		
		// 极小屏幕：隐藏第4行
		if (scale <= 0.6) {
			var row4Elements = wrapper.querySelectorAll('.dc-row-4');
			row4Elements.forEach(function(el) {
				el.style.display = 'none';
			});
		}
	}
	
	/**
	 * 优化导航按钮布局
	 */
	function optimizeNavButtons() {
		var deviceType = getDeviceType();
		var navGroup = document.querySelector('.data-cascade-button-group nav');
		
		if (!navGroup) return;
		
		if (deviceType === 'mobile') {
			// 移动端：按钮换行显示
			navGroup.style.display = 'flex';
			navGroup.style.flexWrap = 'wrap';
			navGroup.style.gap = '0.3rem';
			
			var buttons = navGroup.querySelectorAll('button');
			buttons.forEach(function(btn) {
				btn.style.flex = '1 1 auto';
				btn.style.minWidth = '3.5rem';
				btn.style.fontSize = '0.8rem';
				btn.style.padding = '0.5rem 0.75rem';
			});
		} else if (deviceType === 'tablet') {
			// 平板：适当调整
			navGroup.style.display = 'flex';
			navGroup.style.flexWrap = 'wrap';
			navGroup.style.gap = '0.5rem';
			
			var buttons = navGroup.querySelectorAll('button');
			buttons.forEach(function(btn) {
				btn.style.flex = '1 1 auto';
				btn.style.minWidth = '4rem';
			});
		}
	}
	
	/**
	 * 优化侧边面板
	 */
	function optimizeSidePanels() {
		var deviceType = getDeviceType();
		var leftFrame = document.querySelector('.left-frame');
		
		if (!leftFrame) return;
		
		if (deviceType === 'mobile') {
			// 移动端：调整面板字体和间距
			var panels = leftFrame.querySelectorAll('[class^="panel-"]');
			panels.forEach(function(panel) {
				panel.style.fontSize = '0.8rem';
				panel.style.padding = '0.5rem';
			});
		}
	}
	
	/**
	 * 优化主内容区域
	 */
	function optimizeMainContent() {
		var deviceType = getDeviceType();
		var mainContent = document.querySelector('.reader-content, main');
		
		if (!mainContent) return;
		
		if (deviceType === 'mobile') {
			// 移动端：增加内边距
			mainContent.style.padding = '1rem 0.5rem';
		}
	}
	
	/**
	 * 添加设备类型class到body
	 */
	function addDeviceClass() {
		var deviceType = getDeviceType();
		document.body.classList.add('device-' + deviceType);
		
		var orientation = getScreenOrientation();
		document.body.classList.add('orientation-' + orientation);
	}
	
	/**
	 * 监听窗口大小变化
	 */
	function setupResizeListener() {
		var resizeTimer;
		
		window.addEventListener('resize', function() {
			// 防抖：延迟执行优化
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(function() {
				applyDataCascadeScale();
				optimizeNavButtons();
				
				// 更新方向class
				document.body.classList.remove('orientation-portrait', 'orientation-landscape');
				document.body.classList.add('orientation-' + getScreenOrientation());
			}, 250);
		});
		
		// 监听屏幕方向变化
		window.addEventListener('orientationchange', function() {
			setTimeout(function() {
				applyDataCascadeScale();
				optimizeNavButtons();
				
				document.body.classList.remove('orientation-portrait', 'orientation-landscape');
				document.body.classList.add('orientation-' + getScreenOrientation());
			}, 300);
		});
	}
	
	/**
	 * 初始化所有优化
	 */
	function init() {
		addDeviceClass();
		applyDataCascadeScale();
		optimizeNavButtons();
		optimizeSidePanels();
		optimizeMainContent();
		setupResizeListener();
		
		// 在控制台输出设备信息（调试用）
		console.log('[LCARS Responsive] Device:', getDeviceType());
		console.log('[LCARS Responsive] Browser:', getBrowserType());
		console.log('[LCARS Responsive] Screen:', window.innerWidth + 'x' + window.innerHeight);
		console.log('[LCARS Responsive] Orientation:', getScreenOrientation());
		console.log('[LCARS Responsive] Scale:', getOptimalScale());
	}
	
	/**
	 * 公开接口
	 */
	return {
		init: init,
		getDeviceType: getDeviceType,
		getBrowserType: getBrowserType,
		getScreenOrientation: getScreenOrientation,
		getOptimalScale: getOptimalScale,
		applyDataCascadeScale: applyDataCascadeScale,
		optimizeNavButtons: optimizeNavButtons
	};
})();

// DOM加载完成后自动初始化
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', function() {
		LCARSResponsive.init();
	});
} else {
	LCARSResponsive.init();
}
