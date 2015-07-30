var mkdirp    = require('mkdirp')
	, moment    = require('moment')
	, request   = require('request')
	, send      = require('send')
	, epeg      = require('epeg')
	, path      = require('path')
	, fs        = require('fs')
	, crypto    = require('crypto')
	, sizeOf    = require('image-size');

var options = {}
	, regexp = ''
	, rootDir
	, cacheDir
	, rotate
	, ttl
	, cacheTTL
	, quality;


// -- Constructor -------------------------------------------------------------

var media = function(opts) {

	_parseOptions(opts || {})

	return function (req, res, next) {

		function resume(runNext){
			if (runNext) next();
		}

		// Only GET + HEAD, if not NEXT()
		if (req.method != 'GET' && req.method != 'HEAD') return resume(true);

		// If the URL is not valid (regexp matching) NEXT()
		var request = req.originalUrl.match(regexp);
		if (!request) return resume(true);

		//----------------------------------------------------------

		var keyVal = new RegExp(':')
			, params = request[1].split(/,/)  // h:400,q:80
			, path = rootDir + request[2]     // /var/www/public/toto/truc/monimage.jpg
			, url = request[2]                // /toto/truc/monimag.jpg
			, parameters = {}                 // {h: 400, q: 80}

		if(!fs.existsSync(path)){
			res.writeHead(404)
			res.end('Not found: '+url)
			return resume(false)
		}

		if(params.length){
			params.forEach(function(e){
				var kv = e.split(keyVal)
				parameters[kv[0]] = kv[1]
			})
		}else{
			res.writeHead(500)
			res.end('No parameter found in url')
			return resume(false)
		}

		//----------------------------------------------------------

		var cachedFile = _destination(url, parameters)

		// see if we can serve the file from file cache, if ttl has not yet expired
		if (cacheTTL > 0) {
			try {
				var stats = fs.statSync(cachedFile)
					, fileUnix = moment(stats.mtime).unix()
					, nowUnix = moment().unix()
					, diffUnix = nowUnix - fileUnix;

				// file is fresh, no need to download/resize etc.
				if (diffUnix < cacheTTL) {
					res.setHeader('X-Hit-Cache', '1');
					send(req, cachedFile).maxage(ttl || 0).pipe(res);
					return resume(false);
				}
			} catch (err) {
				// no action necessary, just continue with normal flow
			}
		}

		parameters.src = path;
		parameters.dst = cachedFile;
		parameters.rotate = rotate;

		_generate(parameters, function(err) {
				if (err){
					if(typeof err == 'string'){
						res.writeHead(500)
						res.end(err);
						return resume(false)
					}else{
						throw err;
					}
				}

				res.setHeader('X-Hit-Cache', '0');
				send(req, cachedFile).maxage(ttl || 0).pipe(res);

				return resume(false);
			}
		);
	}

}


// -- Internal Jam ------------------------------------------------------------

var _parseOptions = function (options) {

	var day  = 3600 * 24;

	ttl      = ('ttl' in options) ? parseInt(options.ttl) : day;  // max-age for 1 day by default.
	cacheTTL = ('cacheTTL' in options) ? options.cacheTTL : day;  // use local cache for 1 day by default
	quality  = ('quality' in options) ? parseInt(options.quality) / 100 : 0.8;

//	console.log('ttl='+ttl, 'cacheTTL='+cacheTTL);

	rootDir  = options.root
	cacheDir = options.cache
	rotate = options.rotate

	console.log(cacheDir, options);

	if(!'root' in options || options.root == '' || !fs.existsSync(options.root)){
		throw new Error('root parameter is not defined, empty or not founds');
	}

	if(!'cache' in options || options.cache == ''){
		throw new Error('cache parameter is not defined, empty or not found');
	}

	var allowedExtensions = options.allowedExtensions || ['gif', 'png', 'jpg'];
	for (i=0; i < allowedExtensions.length; i++) {
		if (allowedExtensions[i][0] === '.') allowedExtensions[i] = allowedExtensions[i].substring(1);
	}

	regexp = new RegExp(
		'^/' + '([a-z]:[^/]*)' + '(/(.*)' + '\.(?:' + allowedExtensions.join('|') + '))$',
		'i'
	);

}

var _generate = function (opt, callback) {

	var src = opt.src
		, dst = opt.dst

	var dimensions = sizeOf(src);
	var origWidth = dimensions.width;
	var origHeight = dimensions.height;

	if (opt.h && ! opt.w) {
		opt.w = parseFloat(parseInt(opt.h * origWidth / origHeight));
		opt.h = parseFloat(opt.h);
	} else if (opt.w && ! opt.h) {
		opt.h = parseFloat(parseInt(opt.w * origHeight / origWidth));
		opt.w = parseFloat(opt.w);
	} else if (opt.w && opt.h) {
		opt.h = parseFloat(opt.h);
		opt.w = parseFloat(opt.w);
	}
	image = new epeg.Image({path: src});
	image = image.downsize(opt.w, opt.h);
	image.saveTo(dst);
	if (opt.rotate) {
		require('child_process').exec('/usr/bin/exiftran -aip '+dst,callback);
	} else {
		callback();
	}
}

var _destination = function (url, parameters){

	var ext = path.extname(url)             // .jpg
		, name = path.basename(url, ext)      // monimage
		, dir = path.dirname(url)             // /toto/truc
		,  hash = ''                          // h600_w:300...
		, cachedDir , cachedFile

	cachedDir = cacheDir + dir

	mkdirp.sync(cachedDir)

	for(k in parameters){
		hash += '_'+k + parameters[k];
	}

	cachedFile = cachedDir + '/' + name + hash + ext;

	return cachedFile;
}

var _error = function(key, req, res){ // Find a better solution to use req + res
	res.writeHead(500)
	res.end('param "'+ key +'" is not valid');
}


// -- Exports -----------------------------------------------------------------

exports = module.exports = media
