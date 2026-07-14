const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => ({
	entry: './src/index.tsx',
	output: {
		filename: 'index.js',
		path: path.resolve(__dirname, 'dist'),
	},
	// inline-source-map embeds the whole map in index.js, which is most of why
	// a production build used to be 9.5 MB. Production gets a separate .map file
	// instead; dev keeps the inline map for fast rebuilds.
	devtool: argv.mode === 'production' ? 'source-map' : 'inline-source-map',
	devServer: {
		static: {
			directory: path.join(__dirname, 'dist'),
		},
		hot: false,
		liveReload: true,
		port: 8080
	},
	plugins: [
		new HtmlWebpackPlugin({
			template: 'src/index.html',
			favicon: 'favicon.ico'
		})
	],
	resolve: {
		extensions: ['.tsx', '.ts', '.jsx', '.js']
	},
	module: {
		rules: [
			{
				test: /\.css$/i,
				use: ['style-loader', 'css-loader'],
			},
			{
				test: /\.m?js$/,
				exclude: /(node_modules|bower_components)/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env']
					}
				}
			},
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
			{
				test: /\.s[ac]ss$/i,
				use: ['style-loader', 'css-loader', 'sass-loader'],
			},
			{
				test: /\.(glsl|vs|fs)$/,
                loader: 'ts-shader-loader'
			},
			{
				// Inline .obj model files as their raw text so they can be
				// `import`ed as a string and parsed by OBJLoader - mirrors how
				// ts-shader-loader inlines .glsl above. Keeps model loading fully
				// synchronous (no fetch), at the cost of bundling the text.
				test: /\.obj$/i,
				type: 'asset/source'
			}
		]
	},
})
