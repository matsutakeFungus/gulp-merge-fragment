var fs = require('fs'),
    path = require('path'),
    url = require('url'),
	File = require('vinyl'),
    cheerio = require('cheerio'),
    through = require('through2'),
    extend = require('extend'),
    q = require('q');
module.exports=function(options){
	var defaults = {
		fragment: '*',//script|link|*
		createReadStream : fs.createReadStream
	};
	var fragments = {
		script : {
			selector: 'script:not([data-ignore=true], [data-remove=true])',
			ele:'<script type=\"text/javascript\"></script>',
			eleSelector:'script[type=\"text/javascript\"]:not([data-ignore=true], [data-remove=true],[src$=\".js\"])',
			getFileName: function(node) { return node.attr('src'); }
		},
		css : {
			selector: 'link[rel=stylesheet]:not([data-ignore=true], [data-remove=true])',
			ele:'<style type=\"text/css\"></style>',
			eleSelector:'style[type=\"text/css\"]:not([data-ignore=true], [data-remove=true],[href$=\".css\"])',
			getFileName: function(node) { return node.attr('href'); }
		}
	}
	//var selectedPresets = (options && options.presets && presets[options.presets]) ||
	 //                    presets[defaults.presets];
	options = extend({}, defaults, options);	 
    if(!fragments[options.fragment] && options.fragment!=='*'){
			console.log("unsupport fragment :" + options.fragment);
			return ;
    }
    resolveFragments(options,fragments);
	
	//console.log("options------>"+JSON.stringify(options));
	if(options.fragments.length<=0){
		return;
	}	
	function resolveFragments(options, fragments) {
		var _frag = [];
		if (options.fragment === '*') {
			for (var key in fragments) {
				_frag.push(fragments[key]);
			}
			
		}else{
			_frag.push(fragments[options.fragment]);
		} 
		options.fragments = _frag;
	}
	function makeAbsoluteFileName(file, fileName) {
		//return file.base + fileName; // path.join(file.base, fileName);
		return path.join(path.dirname(file.path), fileName);
	}
	function isRelative(path) {
		return (url.parse(path).protocol == null);
	}
    function streamToBuffer(stream) {
		var buffers = [];
		var deferred = q.defer();
		var totalLength = 0;
		stream.on('readable', function() {
			data = stream.read();
			if (data !== null) {
				buffers.push(data);
				totalLength += data.length;
			}
		});
		stream.on('error', function(err) {
			deferred.reject(err);
		});

		stream.on('end', function() {
			deferred.resolve(Buffer.concat(buffers, totalLength));
		});

		return deferred.promise;
	}
	function bufferToStream(buf){
        var _stream = through();
        _stream.write(buf);
        return _stream;
	}
	// Calls the callback for each matching in the contents, with an error object
	// and the filename.  callback(err, fileName).
	// fileName === null signals the end of the matches
	function transformFile(contents, callback) {
		//console.log("--->"+callback);
		var $ = cheerio.load(contents.toString());
		var _Files=[];
		for(var i=0;i<options.fragments.length;i++){
           var _fragOptions = options.fragments[i];
           $(_fragOptions.selector).each(function() {
           	   var element = $(this);
           	   var fileName = _fragOptions.getFileName(element);
				if (!!fileName) {
					var _ele = $.root().find(_fragOptions.eleSelector);
					if (!_ele || _ele.length <= 0) {
						_ele = $(_fragOptions.ele);
						console.log("create dom object:"+_ele);
						var _parentEle = element.parent();
						if (!_parentEle || _parentEle.length <= 0) {
							_parentEle = $.root();
							_parentEle.append(_ele);
						}
					}
					_Files.push({
						"fileName": fileName,
						"tagEle": _ele
					});
					element.remove();
				}
        	   
           });
		}
		for(var j=0;j<_Files.length;j++){
			
				callback(_Files[j].fileName,_Files[j].tagEle);

		}
		callback(null, null,$.root());
	}	
	function handleFile(fileName,ele,file,stream,bufferReadPromises,callback,eleRootJQLite){
		    if (fileName) {
						if (isRelative(fileName)) {
							try {
								var absoluteFileName = makeAbsoluteFileName(file, fileName);
								var readPromise = streamToBuffer(options.createReadStream(absoluteFileName))
									.then(function(contents) {

										ele.append(cheerio.load(contents.toString()).root());

									}, function(err) {
										console.log("read file stream error",err);								
										stream.emit('error', err);
									});
								bufferReadPromises.push(readPromise);
							} catch (err) {
								console.log("transform file error,file name is "+fileName,err);
								stream.emit('error', err);
							}
						} 
			}else{
							q.all(bufferReadPromises)
								.then(function() {
									if(eleRootJQLite){
										file.contents = new Buffer(eleRootJQLite.html());
										stream.push(file);
									}									
									callback();
								},function(err){
									if(eleRootJQLite){
										file.contents = new Buffer(eleRootJQLite.html());
										stream.push(file);
									}
									callback();
								});				
			}
	}
	var transform = function(file, enc, callback){
		//console.log("------>"+file.path);
		var stream = this;
		stream.on('error', function(err) {
			console.log(err);
		});
		var bufferReadPromises = [];
		if(file.isNull()) {// No contents - do nothing
			stream.push(file);
			callback();
		}else if(file.isStream()){
           streamToBuffer(file.contents)
           .then(function(contents) {
				transformFile(contents, function(fileName, ele, eleRootJQLite) {
                    handleFile(fileName,ele,file,stream,bufferReadPromises,callback,eleRootJQLite);
				});
			},
		function(err) {
			stream.emit('error', err);
		});
		}else if(file.isBuffer()){
              transformFile(file.contents,function(fileName,ele,eleRootJQLite){
				    handleFile(fileName,ele,file,stream,bufferReadPromises,callback,eleRootJQLite);
              });			
             
		}

	}	
	return through.obj(transform);	
}