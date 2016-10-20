'use strict'

const gulp = require('gulp')
const inline = require('gulp-inline')

const buildDir = 'build'

gulp.task('build', () =>
  gulp.src('app/index.html')
    .pipe(inline())
    .pipe(gulp.dest(buildDir))
)

gulp.task('default', ['build'])
