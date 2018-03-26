const path = require('path');
const webpack = require('webpack');
const UglifyJsPlugin = require("uglifyjs-webpack-plugin");

const config = {
	entry: path.join(__dirname, 'src/index.js'),
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'bundle.js'
	},
	resolve: {
		extensions: ['.js', '.vue'],
		alias: {
			vue: 'vue/dist/vue.js',
		}
	},
	devtool: 'cheap-module-source-map',
	module: {
		rules: [{
			test: /\.vue$/,
			loader: 'vue-loader',
			exclude: /node_modules/,
			include: path.resolve(__dirname, 'src')
		}, {
			test: /\.js$/,
			exclude: /node_modules/,
			loader: 'babel-loader',
			include: path.resolve(__dirname, 'src')
		}]
	},
	node: {
		fs: 'empty'
	},
	optimization: {
		minimize: true,
		minimizer: [
			new UglifyJsPlugin({
				parallel: true,
				uglifyOptions: {
					compress: { warnings: false, unused: false },
					output: { comments: false }
				}
			})
		]
	}
};

if (process.env.NODE_ENV === 'production') {
	config.plugins = [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('production') })];
}

module.exports = config;