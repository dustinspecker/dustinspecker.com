const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')
const PwaManifestPlugin = require('webpack-pwa-manifest')
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
      links: [
        'https://fonts.googleapis.com/css?family=Roboto:300,400,500',
        'https://fonts.googleapis.com/icon?family=Material+Icons',
        {
          href: 'https://cdnjs.cloudflare.com/ajax/libs/material-design-icons/3.0.1/places/1x_web/ic_pool_black_18dp.png',
          type: 'image/png',
          rel: 'icon'
        }
      ],
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0'
        }
      ],
      template,
      title: 'Lifts'
    }),
    new PwaManifestPlugin({
      name: 'Lifts',
      short_name: 'Lifts',
      description: 'Track your workouts',
      background_color: '#000000',
      icons: [
        {
          src: 'https://cdnjs.cloudflare.com/ajax/libs/material-design-icons/3.0.1/places/1x_web/ic_pool_white_18dp.png',
          sizes: [18]
        }
      ]
    })
  ]
}

module.exports.serve = {
  content: ['./app'],
  host: '192.168.1.4',
  hot: {
    host: '192.168.1.4',
    port: '8090'
  }
}
