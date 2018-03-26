const path = require('path');
const webpack = require('webpack');

module.exports = {
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
		concatenateModules: true,
		usedExports: false
	},
	mode: 'production'
};