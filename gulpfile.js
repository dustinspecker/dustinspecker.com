'use strict'

const csso = require('gulp-csso')
const del = require('del')
const gulp = require('gulp')
const inline = require('gulp-inline')

const buildDir = 'build'

gulp.task('clean', () =>
  del(`${buildDir}`)
)

gulp.task('build', ['clean'], () =>
  gulp.src('app/index.html')
    .pipe(inline({
      css: csso
    }))
    .pipe(gulp.dest(buildDir))
)

gulp.task('default', ['build'])
