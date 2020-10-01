const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const sass = require("node-sass");
const sassUtils = require("node-sass-utils")(sass);
const sassVars = require(__dirname + '/config.js');

const convertStringToSassDimension = function(result) {
  if (typeof result !== "string") {
    return result;
  }
  const cssUnits = [
    "rem",
    "em",
    "vh",
    "vw",
    "vmin",
    "vmax",
    "ex",
    "%",
    "px",
    "cm",
    "mm",
    "in",
    "pt",
    "pc",
    "ch"
  ];
  const parts = result.match(/[a-zA-Z]+|[0-9]+/g);
  const value = parts[0];
  const unit = parts[parts.length - 1];
  if (cssUnits.indexOf(unit) !== -1) {
    result = new sassUtils.SassDimension(parseInt(value, 10), unit);
  }
  return result;
}

module.exports = {
  entry: {
    app: './src/index.ts',
  },
  mode: 'development',
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
    template: './src/index.html'
    }),
  ],
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|gif|ttf)$/,
        loader: 'file-loader'
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: 'style-loader'
          },
          {
            loader: 'css-loader'
          },
          {
            loader: 'sass-loader',
            options: {
              sassOptions: {
                functions: {
                  "get($keys)": function(keys) {
                    keys = keys.getValue().split(".");
                    var result = sassVars;
                    var i;
                    for (i = 0; i < keys.length; i++) {
                      result = result[keys[i]];
                      // Convert to SassDimension if dimenssion
                      if (typeof result === "string") {
                        result = convertStringToSassDimension(result);
                      } else if (typeof result === "object") {
                        Object.keys(result).forEach(function(key) {
                          var value = result[key];
                          result[key] = convertStringToSassDimension(value);
                        });
                      }
                    }
                    result = sassUtils.castToSass(result);
                    return result;
                  }
                }
              }
            }
          }
        ]
      }
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    stats: {
      children: false,
      maxModules: 0
    },
    contentBase: './',
    publicPath: '/',
    port: 3001,
    hot: true,
  }
};