var gulp = require('gulp');
var eslint = require('gulp-eslint');
var mocha = require('gulp-mocha');
var istanbul = require('gulp-istanbul');
var coverageEnforcer = require('gulp-istanbul-enforcer');
var plato = require('gulp-plato');
var runSequence = require('run-sequence');

var rimraf = require('rimraf');
var chalk = require('chalk');

var sources = ['*.js', 'lib/**/*.js', '!gulpfile.js', '!logger.js'];
var testSources = ['test/**/*.js'];
// var allSources = ['*.js', 'lib/**/*.js', 'test/**/*.js'];

gulp.task('default', ['help']);

gulp.task('help', function helpTask() {
  console.log('The following gulp tasks are available:');
  console.log('');
  console.log(chalk.yellow.bold('help'), '- Outputs this help message');
  console.log(chalk.red.bold('pre-commit'), '- Runs lint, enforce-coverage, and code-report for pre-commit check');
  console.log(chalk.yellow.bold('test'), '- Runs unit tests');
  console.log(chalk.yellow.bold('auto-test'), '- Runs unit tests with reporting');
  console.log(chalk.yellow.bold('coverage'), '- Runs unit tests and outputs code coverage report');
  console.log(chalk.yellow.bold('enforce-coverage'), '- Errors if coverage percentage drops below minimum');
  console.log(chalk.yellow.bold('clean-coverage'), '- Deletes the code coverage report');
  console.log(chalk.yellow.bold('code-report'), '- Generates a complexity analysis report');
  console.log(chalk.yellow.bold('clean-code-report'), '- Deletes the code complexity report');
  console.log(chalk.yellow.bold('reports'), '- Runs coverage and code-report tasks');
  console.log(chalk.yellow.bold('clean-reports'), '- Runs clean-coverage and clean-code-report tasks');
  console.log(chalk.yellow.bold('lint'), '- Lints the project sources');
});

gulp.task('test', function testTask() {
  return gulp.src(testSources)
    .pipe(mocha({
      reporter: 'spec'
    }));
});

gulp.task('auto-test', function autoTestTask() {
  return gulp.src(testSources)
    .pipe(mocha({
      reporter: 'mocha-bamboo-reporter'
    }));
});

gulp.task('coverage', ['clean-coverage'], function coverageTask(cb) {
  gulp.src(sources)
    .pipe(istanbul())
    .on('finish', function onIstanbulFinish() {
      gulp.src(testSources)
        .pipe(mocha())
        .pipe(istanbul.writeReports({
          'reporters': [
            'lcov', 'json', 'clover', 'html'
          ]
        }))
        .on('end', cb);
    });
});

gulp.task('enforce-coverage', ['coverage'], function enforceCoverageTask(cb) {
  var options = {
    thresholds: {
      statements: 100,
      branches: 100,
      lines: 100,
      functions: 100
    },
    coverageDirectory: 'coverage',
    rootDirectory: ''
  };
  gulp.src('.')
    .pipe(coverageEnforcer(options))
    .on('end', cb);
});

gulp.task('clean-coverage', function cleanCoverageTask(cb) {
  rimraf('coverage/', cb);
});

gulp.task('code-report', function codeReportTask() {
  return gulp.src(sources)
    .pipe(plato('./analysis'));
});

gulp.task('clean-code-report', function cleanCodeReportTask(cb) {
  rimraf('analysis/', cb);
});

gulp.task('reports', ['coverage', 'code-report']);
gulp.task('clean-reports', ['clean-coverage', 'clean-code-report']);

gulp.task('lint', function lintTask() {
  return gulp.src(sources)
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failOnError());
});

gulp.task('pre-commit', function preCommitTask(cb) {
  runSequence('lint', 'enforce-coverage', 'code-report', cb);
});

module.exports = gulp;
