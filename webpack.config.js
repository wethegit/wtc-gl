const path = require('path');

module.exports = {
  target: 'web',
  entry: "./src/wtc-gl.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: 'es5-bundle.js',
    library: 'WTCGL'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        loader: "babel-loader",
        options: {
          presets: [["@babel/env", {
            "targets": {
              "browsers": ["last 2 versions", "ie >= 11"]
            },
            useBuiltIns: "usage"
          }]]
        }
      }
    ]
  }
}