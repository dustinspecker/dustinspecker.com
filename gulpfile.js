'use strict'

const gulp = require('gulp')

const buildDir = 'build'

gulp.task('build', () =>
  gulp.src('app/*')
    .pipe(gulp.dest(buildDir))
)

gulp.task('default', ['build'])
