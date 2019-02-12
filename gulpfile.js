/* Implements:
 *      1. Live reloads browser with BrowserSync.
 *      2. CSS: Sass to CSS conversion, error catching, Autoprefixing, Sourcemaps,
 *         CSS minification, and Merge Media Queries.
 *      3. JS: Concatenates & uglifies Vendor and Custom JS files.
 *      4. Images: Minifies PNG, JPEG, GIF and SVG images.
 *      5. Watches files for changes in CSS or JS.
 *      6. Watches files for changes in PHP.
 *      7. Corrects the line endings.
 *      8. InjectCSS instead of browser page reload.
 *
 * @author Mark Wilson§
 * @version 1.0.0
 */

var gulp           = require('gulp');
var sass           = require('gulp-sass');
var sourcemaps     = require('gulp-sourcemaps');
var browsersync    = require('browser-sync').create();
var notify         = require('gulp-notify');
var postcss        = require('gulp-postcss');
var autoprefixer   = require('autoprefixer');
var cleancss       = require('gulp-clean-css');
var uglify         = require('gulp-uglify-es').default;
var concat         = require('gulp-concat');
var util           = require('gulp-util');
var header         = require('gulp-header');
var pixrem         = require('gulp-pixrem');
var exec           = require('child_process').exec;
var rename         = require('gulp-rename');
var stylefmt       = require('gulp-stylefmt');
var debug          = require('gulp-debug');
var scsslint       = require('gulp-scss-lint');
var cache          = require('gulp-cached');
var phpcs          = require('gulp-phpcs');
var validatehtml   = require('gulp-w3c-html-validation');
var a11y           = require('gulp-accessibility');

/*

FILE PATHS
==========
*/

var sassSrc = 'sass/**/*.{sass,scss}';
var sassFile = 'sass/base/global.scss';
var phpSrc = '**/*.php';
var cssDest = 'css';
var customjs = 'js/scripts.js';
var jsSrc = 'js/src/**/*.js';
var jsDest = 'js';

/*

ERROR HANDLING
==============
*/

var handleError = function(task) {
  return function(err) {

      notify.onError({
        message: task + ' failed, check the logs...'
      })(err);

    util.log(util.colors.bgRed(task + ' error:'), util.colors.red(err));
  };
};

/*

browsersync
===========

Notes:
   - Add only file types you are working on - if watching the whole themeDir,
     task trigger will be out of sync because of the sourcemap-files etc.
   - Adding only part of the files will also make the task faster

*/

gulp.task('browsersync', function() {

  var files = [
    phpSrc,
    jsSrc
  ];

  browsersync.init(files, {
    proxy: "sangerdev.test",
    browser: "Google Chrome",
    open: false,
    notify: true,
    reloadDelay: 1000
  });
});

/*

STYLES
======
*/

var stylefmtfile = function( file ) {

    console.log(util.colors.white('[') + util.colors.yellow('Stylefmt') + util.colors.white('] ') + 'Automatically correcting file based on .stylelintrc...');
    var currentdirectory = process.cwd() + '/';
    var modifiedfile = file.path.replace( currentdirectory, '' );
    var filename = modifiedfile.replace(/^.*[\\\/]/, '')
    var correctdir = modifiedfile.replace( filename, '' );

    gulp.src(modifiedfile)

        // Cache this action to prevent watch loop
        .pipe(cache('stylefmtrunning'))

        // Run current file through stylefmt
        .pipe(stylefmt({ configFile: '.stylelintrc' }))

        // Overwrite
        .pipe(gulp.dest(correctdir))
};

gulp.task('scss-lint', function() {
  gulp.src([sassSrc, '!sass/navigation/_burger.scss', '!sass/base/_normalize.scss'])

    // Cache this action to prevent watch loop
    .pipe(cache('scsslintrunning'))

    // Print linter report
    .pipe(scsslint());
});

gulp.task('styles', function() {

    // Adds browser fallback (eg. -webkit, -moz, etc.)
    // When a browser dies, Autoprefixer will automatically stop writing prefixes for that browser
    // Source: https://css-tricks.com/css-grid-in-ie-css-grid-and-the-new-autoprefixer/
    var plugins = [
        autoprefixer({grid: true, browsers: ['>1%']})
    ];

    // Save compressed version
    gulp.src(sassFile)

    .pipe(sass({
      compass: false,
      bundleExec: true,
      sourcemap: true,
      style: 'compressed',
      debugInfo: true,
      lineNumbers: true,
      errLogToConsole: true,
      includePaths: [
        'bower_components/',
        'node_modules/',
        // require('node-bourbon').includePaths
      ],
    }))

    .on('error', handleError('styles'))
    .pipe(postcss(plugins))
    .pipe(pixrem())
    .pipe(cleancss({
      compatibility: 'ie11',
      level: {
        1: {
          tidyAtRules: true,
          cleanupCharsets: true,
          specialComments: 0
        }
      }
    }, function(details) {
        //console.log('[clean-css] Original size: ' + details.stats.originalSize + ' bytes');
        //console.log('[clean-css] Minified size: ' + details.stats.minifiedSize + ' bytes');
        console.log('[clean-css] Time spent on minification: ' + details.stats.timeSpent + ' ms');
        console.log('[clean-css] Compression efficiency: ' + details.stats.efficiency * 100 + ' %');
    }))
    .pipe(rename({
      suffix: '.min'
    }))
    .pipe(gulp.dest(cssDest))
    .pipe(browsersync.stream());


    // Save expanded version
    gulp.src(sassFile)

    .pipe(sass({
      compass: false,
      bundleExec: true,
      sourcemap: false,
      style: 'expanded',
      debugInfo: true,
      lineNumbers: true,
      errLogToConsole: true,
      includePaths: [
        'bower_components/',
        'node_modules/',
        // require('node-bourbon').includePaths
      ],
    }))

    .on('error', handleError('styles'))
    .pipe(postcss(plugins))
    .pipe(pixrem())

    // Process the expanded output with Stylefmt
    .pipe(stylefmt({ configFile: './.stylelintrc' }))
    .pipe(gulp.dest(cssDest))
    .pipe(browsersync.stream())
    .pipe( notify( { message: 'TASK: "styles" Completed! 💯', onLast: true } ) );

});

/*

PHPCS
======
*/

gulp.task('phpcs', function() {

  gulp.src(phpSrc)

    // Validate files using PHP Code Sniffer
    .pipe(phpcs({
      bin: '/usr/local/bin/phpcs',
      standard: './phpcs.xml',
      warningSeverity: 0
    }))

    // Log all problems that was found
    .pipe(phpcs.reporter('log'));
});

/*

VALIDATE HTML
=============
*/

// Validator for: https://validator.w3.org/
gulp.task('validatehtml', function() {
  return gulp.src([phpSrc, '!functions.php', '!node_modules/**/*', '!inc/**/*'])
    .pipe(validatehtml({
        generateReport: false,
        useTimeStamp: false,
        errorTemplate: null,
        reportpath: false,
        doctype: 'HTML5',

        // Ignore WordPress/PHP-related/file structure related error messages
        relaxerror: [/XML processing/g,
        /role is unnecessary for element/g,
        /Text not allowed in element “ol” in this context/g,
        /Text not allowed in element “ul” in this context/g,
        /Stray end tag/g,
        /Stray start tag/g,
        /Stray doctype/g,
        /Unsupported character encoding name/g,
        /CSS:/g,
        /Try escaping it as/g,
        /Attribute “<\?php”/g,
        /Attribute “post_/g,
        /An ID must not contain whitespace/g,
        /Attribute “\?” not allowed on element/g,
        /Attribute “{” not allowed on element/g,
        /“echo”/g,
        /“%1\$s”/g,
        /Attribute “'id” not allowed on element/g,
        /Attribute “';” not allowed on element/g,
        /Attribute “}” not allowed on element/g,
        /Attribute “\$/g,
        /Bad value “%s”/g,
        /Bad value “<\?php/g,
        /Bad value “post/g,
        /Attribute “if”/g,
        /Attribute “\(”/g,
        /Attribute “\)”/g,
        /Attribute “:”/g,
        /Saw “<” when expecting an attribute name/g,
        /Article lacks heading/g,
        /Element “head” is missing a required instance of child element/g,
        /Start tag seen without seeing a doctype first/g,
        /Illegal character in path segment/g,
        /is not serializable as XML/g,
        /No space between attributes./g,
        /Saw “'” when/g,
        /End tag seen without seeing a doctype first/g,
        /Non-space characters found without seeing a doctype first/g,
        /End of file seen without seeing a doctype first/g,
        /Consider adding a “lang” attribute to the “html”/g,
        /Matching quote missing/g,
        /"End tag for  “body” seen/g,
        /The character encoding was not declared/g,
        /Empty heading./g,
        /Cannot recover after last error/g,
        /Bad value “mailto: <\?php/g,
        /Bad value “tel: <\?/g,
        /Bad value “mailto:<\?php/g,
        /Bad value “tel:<\?/g,
        /<\?php/g,
        /This document appears to be written/g,
        /The document is not mappable to XML/g]
    }))
});

/*

ACCESSIBILITY
=============
*/

gulp.task('a11y', function() {
  return gulp.src([phpSrc, '!functions.php', '!node_modules/**/*', '!inc/**/*'])
    .pipe(a11y({
      accessibilityLevel: 'WCAG2A',
      verbose: true,
      force: true,
      reportLevels: {
        notice: false,
        warning: false,
        error: true
      },

      // Ignore WordPress/PHP-related/file structure related error messages
      ignore: [
        // The html element should have a lang or xml:lang attribute which describes the language of the document.
        'WCAG2A.Principle3.Guideline3_1.3_1_1.H57.2',

        // A title should be provided for the document, using a non-empty title element in the head section.
        'WCAG2A.Principle2.Guideline2_4.2_4_2.H25.1.NoTitleEl',

        // Anchor element found with a valid href attribute, but no link content has been supplied.
        'WCAG2A.Principle4.Guideline4_1.4_1_2.H91.A.NoContent',

        // Heading tag found with no content. Text that is not intended as a heading should not be marked up with heading tags.
        'WCAG2A.Principle1.Guideline1_3.1_3_1.H42.2',

        // This link points to a named anchor "[link target]" within the document, but no anchor exists with that name.
        'WCAG2A.Principle2.Guideline2_4.2_4_1.G1,G123,G124.NoSuchID'
      ]
    }))
    .on('error', console.log)
});

/*

SCRIPTS
=======
*/

gulp.task('js', function() {

      gulp.src(
        [
          'js/src/skip-link-focus-fix.js',
          'node_modules/moveto/dist/moveTo.js',
          // 'js/src/sticky-nav.js',
          // 'node_modules/slick-carousel/slick/slick.js',
          'node_modules/what-input/dist/what-input.js',
          'js/src/navigation.js',
          'js/src/scripts.js'
        ])
        .pipe(concat('all.js'))
        .pipe(uglify({
          compress: true,
          mangle: true}).on('error', function(err) {
            util.log(util.colors.red('[Error]'), err.toString());
            this.emit('end');
          }))
        .pipe(gulp.dest(jsDest));
});

/*
WATCH
=====
*/

// Run the JS task followed by a reload
gulp.task('js-watch', gulp.series(['js']), browsersync.reload);

gulp.task('watch', gulp.series(['browsersync']), function() {
  gulp.watch(sassSrc, gulp.series(['styles', 'scss-lint']).on( 'change', stylefmtfile ));
  gulp.watch(phpSrc, gulp.series(['phpcs', 'validatehtml', 'a11y']));
  gulp.watch(jsSrc, gulp.series(['js-watch']));
});

/*
DEFAULT
=====
*/
gulp.task('default', gulp.series(['watch']));
