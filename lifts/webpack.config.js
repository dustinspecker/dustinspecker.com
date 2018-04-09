const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')
const template = require('html-webpack-template')

module.exports = {
  mode: 'development',
  entry: './app/index.js',
  output: {
    path: path.resolve(__dirname, 'dist')
  },
  plugins: [
    new HtmlWebpackPlugin({
      inject: false,
      template,
      title: 'Lifts'
    })
  ]
}
