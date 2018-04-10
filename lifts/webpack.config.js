const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')
const template = require('html-webpack-template')

module.exports = {
  mode: 'development',
  entry: './app/index.js',
  output: {
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: [
              'syntax-class-properties',
              'transform-class-properties'
            ],
            presets: [
              'babel-preset-env',
              'babel-preset-react'
            ]
          }
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      appMountId: 'app',
      inject: false,
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0'
        }
      ],
      template,
      title: 'Lifts'
    })
  ]
}

module.exports.serve = {
  content: ['./app'],
  hot: {
    host: 'localhost',
    port: '8090'
  }
}
