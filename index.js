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
		fragment: '*',//script|css|*
		createReadStream : fs.createReadStream
	};
	var fragments = {
		script : {
			selector: 'script:not([data-ignore=true], [data-remove=true])',
			ele:'<script type=\"text/javascript\"></script>',
			elePrefix:"<script type=\"text/javascript\">",
			eleSuffix:"</script>",
			eleSelector:'script[type=\"text/javascript\"]:not([data-ignore=true], [data-remove=true],[src$=\".js\"])',
			getFileName: function(node) { return node.attr('src'); }
		},
		css : {
			selector: 'link[rel=stylesheet]:not([data-ignore=true], [data-remove=true])',
			ele:'<style type=\"text/css\"></style>',
			elePrefix:"<style type=\"text/css\">",
			eleSuffix:"</style>",			
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
	function handleFile(file,fileName, bufferReadPromises,scriptContentArray,stream) {
		if (isRelative(fileName)) {
			try {
				
				var absoluteFileName = makeAbsoluteFileName(file, fileName);
				var readPromise = streamToBuffer(options.createReadStream(absoluteFileName))
					.then(function(contents) {
						if(contents && contents.length>0){
							scriptContentArray.push("\r\n");
							scriptContentArray.push(contents);
						}
					}, function(err) {
						console.log("read file stream error", err);
						stream.emit('error', err);
					});
				bufferReadPromises.push(readPromise);
			} catch (err) {
				console.log("transform file error,file name is " + fileName, err);
				stream.emit('error', err);
			}
		}
	}
	function transformFile(contents, stream,callback,file) {
		var $ = cheerio.load(contents.toString());
		var  mergeFrage=function($,key,ele){
			 var mergeFiles= $(fragments[key].selector);
			  if(mergeFiles.length<=0){
			  	return false;
			  }
			  var _contents=[];
			  var _promise=[];
              for(var i=0;i<mergeFiles.length;i++){
                var element = $(mergeFiles[i]);
                var fileName = fragments[key].getFileName(element);
                element.remove();
                handleFile(file,fileName,_promise,_contents,stream);
              }   
           var _deferred = q.defer();  
           var _innerJoin=function(reject){
 					  if(_contents.length>0){
					  	   _contents.unshift("\r\n");
                          var _tmp = fragments[key].elePrefix;
                          for(var x=0;x<_contents.length;x++){
                          	_tmp = _tmp+_contents[x];
                          }
                          _tmp = _tmp +fragments[key].eleSuffix;
                          $.root().append(_tmp);
                          if(!reject){
                              _deferred.resolve($.root());
                          }else{
                              _deferred.reject(reject);
                          }

					  }          	
           }
			q.all(_promise)
				.then(function() {
                    _innerJoin();
				}, function(err) {
					 _innerJoin(); 					
				});
               
		    return _deferred.promise;
		};
        var _bufferPromise=[];
        var _readPromise;
		if(options.fragment==="*"){
            _readPromise = mergeFrage($,'script',($("body").length<=0?$:$("body")))
                           .then(function(contents){},
                           	     function(err){
                           	        stream.emit('error', err);
                                 });             
            if(_readPromise){
            	_bufferPromise.push(_readPromise);
            }               
            _readPromise = mergeFrage($,'css',($("head").length<=0?$:$("head")))
                           .then(function(){},
                           	     function(err){
                                     stream.emit('error', err);
                                 });
            if(_readPromise){
            	_bufferPromise.push(_readPromise);
            }             
		}else if(options.fragment==="script"){
            _readPromise = mergeFrage($,'script',($("body").length<=0?$:$("body")))
                           .then(function(contents){},
                           	     function(err){
                           	        stream.emit('error', err);
                                 }); 
             if(_readPromise){
            	_bufferPromise.push(_readPromise);
            }                                          
		}else if(options.fragment==="css"){
            _readPromise = mergeFrage($,'css',($("head").length<=0?$:$("head")))
                           .then(function(){},
                           	     function(err){
                                     stream.emit('error', err);
                                 });
            if(_readPromise){
            	_bufferPromise.push(_readPromise);
            }         
               
		}else if(options.fragment==="html"){//@TODO

		}
		q.all(_bufferPromise).then(function() {
			file.contents = new Buffer($.root().html());
			stream.push(file);
			callback();
		}, function(err) {
			file.contents = new Buffer($.root().html());
			stream.push(file);
			callback();
		});


	
	}	
	
	var transform = function(file, enc, callback){
		var stream = this;
		stream.on('error', function(err) {
			console.log(err);
		});
		if(file.isNull()) {// No contents - do nothing
			stream.push(file);
			callback();
		}else if(file.isStream()){
           streamToBuffer(file.contents)
           .then(function(contents) {
				transformFile(contents,stream ,callback,file);
			},
		function(err) {
			stream.emit('error', err);
		});
		}else if(file.isBuffer()){
              transformFile(file.contents,stream ,callback,file);			
             
		}

	}	
	return through.obj(transform);	
}