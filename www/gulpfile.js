'use strict'

const csso = require('gulp-csso')
const del = require('del')
const ga = require('gulp-ga')
const gulp = require('gulp')
const htmlmin = require('gulp-htmlmin')
const inline = require('gulp-inline')

const buildDir = 'build'

gulp.task('clean', () =>
  del(`${buildDir}`)
)

gulp.task('manifest', ['clean'], () =>
  gulp.src('app/manifest.webmanifest')
    .pipe(gulp.dest(buildDir))
)

gulp.task('build', ['manifest'], () =>
  gulp.src('app/index.html')
    .pipe(ga({
      minify: true,
      tag: 'body',
      uid: 'UA-83435303-1',
      url: 'auto'
    }))
    .pipe(inline({
      css: csso
    }))
    .pipe(htmlmin({
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: true,
      collapseWhitespace: true,
      quoteCharacter: '\'',
      removeAttributeQuotes: true,
      removeComments: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      useShortDoctype: true
    }))
    .pipe(gulp.dest(buildDir))
)

gulp.task('default', ['build'])
