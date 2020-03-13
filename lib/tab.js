var Blast           = __Protoblast,
    Fn              = Blast.Bound.Function,
    callback_id     = Date.now(),
    Pledge          = Blast.Classes.Pledge;

// Get the Sentana namespace
Specter = Blast.Bound.Function.getNamespace('Develry.Specter');

/**
 * The Specter Tab Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Specter.Browser}        browser
 * @param    {Develry.Specter.Interface.Tab}  tab_interface
 */
var Tab = Fn.inherits('Informer', 'Develry.Specter', function Tab(browser, tab_interface) {

	var that = this;

	// The main browser instance
	this.browser = browser;

	// The tab interface
	this.interface = tab_interface;

	// Main page instance
	this.instance = null;

	// The amount of redirects
	this.redirects = 0;

	// The basic auth to use?
	this.basic_auth = '';

	// The start url
	this.start_url = null;

	// The url we ended up on
	this.response_url = null;

	// The final status
	this.response_status = 0;

	// Timestamp when this page request started
	this.page_start = null;

	// How long it took to get the html
	this.page_response_duration = null;

	// How long it took to get the complete page
	this.page_load_duration = null;

	// Have we received the page html yet?
	this.got_html = false;

	// Number of request counts
	this.request_count = 0;

	// Number of responses
	this.response_count = 0;

	// All requests on this page
	this.requests = {};

	// Callbacks for asynchronous javascript calls are kept here
	this.callbacks = {};

	// Keep track of injections
	this.injections = {};

	this.init();
});

/**
 * Init this instance
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function init() {

	if (this._inited) {
		return;
	}

	let that = this;
	this._inited = true;

	this.interface.setViewport({width: 1680, height: 1050});

	// Wait for the interface to send the "loaded" event
	this.interface.after('loaded', function onLoaded() {
		that.page_load_duration = Date.now() - that.page_start;
		that.emit('loaded');
	});
});

/**
 * Make a URL
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function makeUrl(url) {

	var protocol = url.before('://'),
	    path = url.after('://'),
	    result;

	result = protocol + '://';

	if (this.basic_auth) {
		result += this.basic_auth + '@';
	}

	result += path;

	return result;
});

/**
 * Add page listeners
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function old_addPageListeners() {

	var that = this;

	// Set the window size
	this.instance.property('viewportSize', {width:1680, height:1050});

	this.instance.setting('userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.81 Safari/537.36');

	// Moniter requested resources
	this.instance.on('onResourceRequested', function onRequest(request, networkRequest) {

		that.request_count += 1;

		// Start counting from the first request, which is the page itself
		if (that.request_count == 1) {
			that.page_start = Date.now();
		}

		that.requests[request.url] = {
			request  : request,
			response : false,
			start    : Date.now()
		};
	});

	// Listen to the network activity
	this.instance.on('onResourceReceived', function onResource(response) {

		var req = that.requests[response.url];

		that.response_count += 1;

		// Calculate the time it took to get this request
		req.end = Date.now();
		req.duration = req.end - req.start;

		if (!that.got_html) {
			// Is this the request we're expecting html from?
			if (that.response_url == response.url || (that.response_url + '/') == response.url) {

				// We're being redirected!
				if (response.redirectURL) {
					that.redirects += 1;
					that.response_url = response.redirectURL;
				} else {
					that.got_html = true;
					that.page_response_duration = Date.now() - that.page_start;
					that.response_status = response.status;

					// Got HTML, but it isn't loaded yet
					that.emit('got_html');
				}
			}

			return;
		}
	});

	// Listen to callbacks
	this.instance.on('onCallback', function onCallback(data) {

		if (!data) {
			return;
		}

		if (typeof data == 'string') {
			return that.emit('unknown_callback', data);
		}

		if (data.event) {

			if (!data.args) {
				data.args = [];
			}

			return that.emit(data.event, ...data.args);
		}

		if (that.callbacks[data.id]) {
			that.callbacks[data.id](...data.args);
		}
	});

	this.instance.on('onInitialized', function() {

		that.instance.evaluate(function() {

			var last_change = Date.now(),
			    last_state = document.readyState;

			setTimeout(function checkReadyState() {

				var now = Date.now(),
				    diff = now - last_change;

				// If the state changed in the last 3 seconds,
				// then wait another 2 seconds
				if (diff < 3000) {
					return setTimeout(checkReadyState, 2000);
				}

				if (document.readyState != 'complete') {
					return setTimeout(checkReadyState, 3000);
				}

				window.callPhantom({event: 'DOMContentLoaded'});
			}, 2000);

			document.addEventListener('readystatechange', function(event) {
				last_change = Date.now();
				last_state = document.readyState;
			});
		});
	});

	this.afterOnce('DOMContentLoaded', function domLoaded() {
		that.emit('loaded');
	});
});

/**
 * Perform given callback on instance
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function exec(method, args, callback) {

	let pledge = new Pledge();

	pledge.done(callback);

	if (!method) {
		pledge.reject(new Error('No valid method name given!'));
		return pledge;
	}

	const that = this;

	if (!Array.isArray(args)) {
		args = [args];
	}

	this.afterOnce('ready', function afterReady() {

		// This check needs to happen after the ready event,
		// because instance is null before it
		if (typeof that.instance[method] !== 'function') {
			return pledge.reject(new Error('The requested method "' + method + '" does not exist on the Phantom Page instance'));
		}

		console.log('Doing method:', method);

		that.instance[method](...args).then(function done(result) {
			console.log('Got:', result);
			pledge.resolve(result);
		}).catch(function onError(err) {
			console.log('Error:', err);
			pledge.reject(err);
		});
	});

	return pledge;
});

/**
 * Perform given callback on instance once the page has loaded
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function execLoaded(...args) {

	var pledge = new Pledge(),
	    that = this;

	this.afterOnce('loaded', function afterLoaded() {
		that.exec(...args).done(pledge);
	});

	return pledge;
});

/**
 * Open given location
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   url
 *
 * @return   {Pledge}
 */
Tab.setMethod(function goto(url) {

	var that = this,
	    pledge = new Pledge();

	if (this.response_url) {
		pledge.reject(new Error('Tab is already loading something else'));
		return pledge;
	}

	// Indicate this is the url we're expecting
	this.response_url = url;
	this.start_url = url;

	let thennable = this.interface.goto(url);

	Pledge.done(thennable, function done(err, value) {

		if (err) {
			return pledge.reject(err);
		}

		pledge.resolve(value);
	});

	return pledge;
});

/**
 * Get all links on the page
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function getLinks(callback) {

	var that = this;

	if (!callback) {
		callback = Fn.thrower;
	}

	if (this._getting_links) {
		return this.afterOnce('got_links', callback);
	}

	this._getting_links = true;

	this.evaluate(function() {

		var elements,
		    external = {},
		    element,
		    internal = {},
		    unique   = 0,
		    total    = 0,
		    href,
		    url,
		    str      = '',
		    i;

		// Get all the elements
		elements = document.querySelectorAll('a[href]');

		for (i = 0; i < elements.length; i++) {
			element = elements[i];

			href = element.getAttribute('href');
			url = element.href;

			if (href[0] == '#') {
				continue;
			}

			if (element.host !== location.host) {

				if (!external[url]) {
					external[url] = 0;
				}

				external[url]++;

				continue;
			}

			total += 1;

			if (!internal[url]) {
				internal[url] = 0;
				unique += 1;
			}

			internal[url]++;
		};

		return {
			// Object with internal links as key and count as value
			internal : internal,

			// Object with external links as key and count as value
			external : external,

			// Number of total links
			total    : total,

			// Number of unique internal urls
			unique   : unique
		};
	}, function gotLinks(err, result) {

		if (err) {
			callback(err);
			that.emit('got_links', err);
			return;
		}

		that.links = result;

		callback(null, result);

		that.emit('got_links', err, result);
	});
});

/**
 * Inject javascript by link (either local file or url)
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @param    {String}   uri
 *
 * @return   {Pledge}
 */
Tab.setMethod(function injectJs(uri, callback) {
	let pledge = this.injectScript(uri);
	pledge.done(callback);
	return pledge;
});

/**
 * Inject javascript by link (either local file or url)
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @param    {String}   uri
 *
 * @return   {Pledge}
 */
Tab.setMethod(function injectScript(uri) {

	if (!this.injections[uri]) {
		this.injections[uri] = Pledge.cast(this.interface.injectScript(uri));
	}

	return this.injections[uri];
});

/**
 * Evaluate some javascript on the page when it has loaded
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @param    {Function|String}   code
 * @param    {Array}             args
 *
 * @return   {Pledge}
 */
Tab.setMethod(function evaluate(code, args) {

	const that = this,
	      pledge = new Pledge();

	this.afterOnce('loaded', function afterLoaded() {
		Pledge.done(that.interface.evaluate(code, args), pledge);
	});

	return pledge;
});

/**
 * Evaluate javascript function on the page
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function _evaluateJs(fnc, args, callback) {

	if (typeof args == 'function') {
		callback = args;
		args = null;
	}

	if (!callback) {
		callback = Fn.thrower;
	}

	// If the function has no callbacks, use the regular method
	if (!fnc.length) {
		return this.execLoaded('evaluate', [fnc], callback);
	}

	let names,
	    code,
	    done,
	    body,
	    name,
	    id;

	names = getParamNames(fnc);
	name = names[names.length - 1];

	if (!Array.isArray(args)) {
		args = [args];
	}

	if (name != 'next' && name != 'done' && name != 'callback') {
		return this.execLoaded('evaluate', [fnc, ...args], callback);
	}

	let pledge = new Pledge();

	pledge.done(callback);

	callback = function callback(err, result) {
		if (err) {
			pledge.reject(err);
		} else {
			pledge.resolve(result);
		}
	};

	// Remove the last argument name, we'll define it inside the code
	names.pop();

	// Turn the names into a comma seperated string
	names = names.join(',');

	body = Fn.getBodySource(fnc);

	id = callback_id++;
	this.callbacks[id] = callback;

	code = `
		var ${name} = function doCallback() {
			var args = Array.prototype.slice.call(arguments);
			window.callPhantom({id: ${id}, args: args, duration: Date.now() - _start});
		};

		var _start = Date.now();

		return (function() {
			${body}
		}());
	`;

	fnc = new Function(names, code);

	this.execLoaded('evaluate', [fnc, ...args]);

	return pledge;
});

/**
 * Close the page
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Tab.setMethod(function close() {

	if (!this.instance) {
		return;
	}

	this.instance.close();
	this.instance = null;
	this.closed = true;

	this.emit('closed');
});

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;

function getParamNames(func) {
	var fnStr = func.toString().replace(STRIP_COMMENTS, '');
	var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);

	if (result === null) {
		result = [];
	}

	return result;
}