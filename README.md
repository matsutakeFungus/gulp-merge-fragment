# gulp-fragment-merge
合并页面中引用文件到当前页面
## Usage

First, install `gulp-fragment-merge` as a development dependency:

```shell
npm install --save-dev gulp-fragment-merge
```

Then, add it to your `gulpfile.js`:

```javascript
var merge-fragment = require("gulp-fragment-merge");

gulp.src("./src/*.ext")
	.pipe(merge-fragment({
		msg: "Hello Gulp!"
	}))
	.pipe(gulp.dest("./dist"));
```

## API

### merge-fragment(options)

#### options.msg
Type: `String`  
Default: `Hello World`

The message you wish to attach to file.


## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)

[npm-url]: https://npmjs.org/package/gulp-fragment-merge
[npm-image]: https://badge.fury.io/js/gulp-fragment-merge.png