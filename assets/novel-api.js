var NovelAPI = (function() {
	/**
	 * 自动检测API端点
	 * - 本地开发环境：使用代理服务器 /api
	 * - GitHub Pages：直接调用FimTale API（需要CORS支持）
	 */
	function getAPIEndpoint() {
		var hostname = window.location.hostname;
		
		if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
			return '/api';
		} else if (hostname.endsWith('.github.io') || hostname === 'github.io') {
			return 'https://fimtale.com/api/v1';
		} else {
			return '/api';
		}
	}
	
	var API_ENDPOINT = getAPIEndpoint();
	
	function getStoredCredentials() {
		return {
			apiKey: localStorage.getItem('lcars_novel_api_key'),
			apiPass: localStorage.getItem('lcars_novel_api_pass')
		};
	}
	
	function hasCredentials() {
		var creds = getStoredCredentials();
		return creds.apiKey && creds.apiPass;
	}
	
	function saveCredentials(apiKey, apiPass) {
		localStorage.setItem('lcars_novel_api_key', apiKey);
		localStorage.setItem('lcars_novel_api_pass', apiPass);
	}
	
	function clearCredentials() {
		localStorage.removeItem('lcars_novel_api_key');
		localStorage.removeItem('lcars_novel_api_pass');
	}
	
	async function makeRequest(endpoint, params) {
		var creds = getStoredCredentials();
		
		if (!creds.apiKey || !creds.apiPass) {
			throw new Error('ERR_NO_CREDENTIALS: 未配置API凭据');
		}
		
		var url = API_ENDPOINT.replace(/\/+$/, '') + endpoint;
		
		var queryParams = new URLSearchParams();
		queryParams.set('APIKey', creds.apiKey);
		queryParams.set('APIPass', creds.apiPass);
		
		if (params) {
			Object.keys(params).forEach(function(key) {
				if (params[key] !== null && params[key] !== undefined) {
					queryParams.set(key, params[key]);
				}
			});
		}
		
		url += '?' + queryParams.toString();
		
		console.log('=== API Request ===');
		console.log('URL:', url);
		console.log('APIKey:', creds.apiKey ? '已配置 (' + creds.apiKey.length + '字符)' : '未配置');
		console.log('APIPass:', creds.apiPass ? '已配置 (' + creds.apiPass.length + '字符)' : '未配置');
		
		var maxRetries = 3;
		var retryDelay = 1000;
		
		for (var attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				var controller = new AbortController();
				var timeoutId = setTimeout(() => controller.abort(), 30000);
				
				if (attempt > 1) {
					console.log('重试请求 (' + attempt + '/' + maxRetries + ')...');
					await new Promise(function(resolve) { setTimeout(resolve, retryDelay * (attempt - 1)); });
				}
				
				var response = await fetch(url, {
					method: 'GET',
					signal: controller.signal,
					headers: {
						'Accept': 'application/json'
					}
				});
				
				clearTimeout(timeoutId);
				
				console.log('HTTP Status:', response.status, response.statusText);
				
				if (!response.ok) {
					var errorText = await response.text();
					console.error('API Error Response:', errorText);
					
					var errorMessage = 'HTTP ' + response.status;
					if (response.status === 403) {
						errorMessage += ': 访问被拒绝 - 请检查API Key和API Pass是否正确';
					} else if (response.status === 404) {
						errorMessage += ': 资源未找到 - 请检查作品ID是否正确';
					} else if (response.status === 500) {
						errorMessage += ': 服务器内部错误';
					} else {
						errorMessage += ': ' + errorText;
					}
					
					throw new Error(errorMessage);
				}
				
				var result = await response.json();
				console.log('API Response:', result);
				
				return result;
				
			} catch (error) {
				if (attempt === maxRetries) {
					if (error.name === 'AbortError') {
						console.error('API请求超时');
						throw new Error('ERR_TIMEOUT: 请求超时，请检查网络连接');
					}
					
					console.error('API请求失败 (第' + attempt + '次):', error);
					console.error('错误类型:', error.name);
					console.error('错误信息:', error.message);
					
					if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
						var corsError = 'ERR_CORS: 跨域请求被阻止。';
						corsError += '\n可能的原因:';
						corsError += '\n1. 浏览器安全策略阻止了跨域请求';
						corsError += '\n2. API服务器未配置CORS头';
						corsError += '\n3. 网络连接问题';
						corsError += '\n\n建议解决方案:';
						corsError += '\n1. 使用支持CORS的代理服务器';
						corsError += '\n2. 检查网络连接';
						corsError += '\n3. 尝试使用HTTP而非HTTPS';
						throw new Error(corsError);
					}
					
					throw error;
				} else {
					console.log('请求失败，准备重试...');
				}
			}
		}
	}
	
	async function getNovel(novelId) {
		console.log('获取小说数据, ID:', novelId);
		return await makeRequest('/t/' + novelId);
	}
	
	async function getHomePage() {
		console.log('获取首页数据...');
		return await makeRequest('/', {});
	}
	
	async function getTopics(options) {
		console.log('获取作品列表...');
		var params = {};
		if (options) {
			if (options.sort) params.sort = options.sort;
			if (options.order) params.order = options.order;
			if (options.page) params.page = options.page;
			if (options.limit) params.limit = options.limit;
		}
		return await makeRequest('/topics', params);
	}
	
	async function getComments(options) {
		console.log('获取评论列表...');
		var params = {};
		if (options) {
			if (options.id) params.id = options.id;
			if (options.page) params.page = options.page;
		}
		return await makeRequest('/comments/', params);
	}
	
	async function getInfoByURL(urls) {
		console.log('通过链接获取内容...');
		var encodedUrls = JSON.stringify(urls);
		return await makeRequest('/json/getInfoByURL', { urls: encodedUrls });
	}
	
	async function getTags() {
		console.log('获取标签相关信息...');
		return await makeRequest('/json/getTags', {});
	}
	
	async function getMainTags(options) {
		console.log('获取主标签组和徽章信息...');
		var params = {};
		if (options && options.interface) {
			params.interface = options.interface;
		}
		return await makeRequest('/json/getMainTags', params);
	}
	
	async function getMyInfo() {
		console.log('获取当前用户通知数等信息...');
		return await makeRequest('/json/getMyInfo', {});
	}
	
	async function getUsersWithSimilarName(userName) {
		console.log('通过用户名搜索用户...');
		return await makeRequest('/json/getUsersWithSimilarName', { UserName: userName });
	}
	
	async function getContact() {
		console.log('获取联系人...');
		return await makeRequest('/json/getContact', {});
	}
	
	async function getTopicByID(topicID) {
		console.log('根据作品ID获取作品信息...');
		return await makeRequest('/json/getTopicByID', { TopicID: topicID });
	}
	
	async function getSettings() {
		console.log('获取用户设置...');
		return await makeRequest('/settings', {});
	}
	
	async function updateUserInfo(data) {
		console.log('更新用户信息...');
		return await makeRequest('/settings', Object.assign({}, data, { Action: 'UpdateUserInfo' }));
	}
	
	async function setGrandFilter(data) {
		console.log('设置大滤镜...');
		return await makeRequest('/settings', Object.assign({}, data, { Action: 'SetGrandFilter' }));
	}
	
	
	async function searchNovels(query, options) {
		var params = {
			keyword: query
		};
		
		if (options) {
			if (options.sort) params.sort = options.sort;
			if (options.order) params.order = options.order;
			if (options.page) params.page = options.page;
			if (options.limit) params.limit = options.limit;
		}
		
		return await makeRequest('/search', params);
	}
	
	async function testConnection() {
		console.log('测试API连接...');
		try {
			var result = await makeRequest('/t/76448');
			console.log('连接测试成功:', result);
			return {
				success: true,
				data: result
			};
		} catch (error) {
			console.error('连接测试失败:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	return {
		API_ENDPOINT: API_ENDPOINT,
		getStoredCredentials: getStoredCredentials,
		hasCredentials: hasCredentials,
		saveCredentials: saveCredentials,
		clearCredentials: clearCredentials,
		makeRequest: makeRequest,
		getNovel: getNovel,
		getHomePage: getHomePage,
		getComments: getComments,
		getTopics: getTopics,
		getInfoByURL: getInfoByURL,
		getTags: getTags,
		getMainTags: getMainTags,
		getMyInfo: getMyInfo,
		getUsersWithSimilarName: getUsersWithSimilarName,
		getContact: getContact,
		getTopicByID: getTopicByID,
		getSettings: getSettings,
		updateUserInfo: updateUserInfo,
		setGrandFilter: setGrandFilter,
		searchNovels: searchNovels,
		testConnection: testConnection
	};
})();