const path = require('path');


// FIXME: to be removed when done with decode|encode|full bundle
const test_bundle = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ]
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: ['sixel']
  }
};

const full_esm = {
  entry: `./lib-esm/index.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: 'full.esm.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'module',
  },
  mode: 'production',
  experiments: {
    outputModule: true,
  }
};

const full_umd = {
  entry: `./lib-esm/index.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: 'full.umd.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: ['sixel']
  },
  mode: 'production'
};

const decode_esm = {
  entry: `./lib-esm/bundle_decode.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: 'decode.esm.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'module',
  },
  mode: 'production',
  experiments: {
    outputModule: true,
  }
};

const decode_umd = {
  entry: `./lib-esm/bundle_decode.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: 'decode.umd.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: ['sixel']
  },
  mode: 'production'
};

const encode_esm = {
  entry: `./lib-esm/bundle_encode.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: 'encode.esm.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'module',
  },
  mode: 'production',
  experiments: {
    outputModule: true,
  }
};

const encode_umd = {
  entry: `./lib-esm/bundle_encode.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: 'encode.umd.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: ['sixel']
  },
  mode: 'production'
};

module.exports = [test_bundle, full_esm, full_umd, decode_esm, decode_umd, encode_esm, encode_umd];
