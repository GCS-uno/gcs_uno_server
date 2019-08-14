const path = require("path");
const webpack = require("webpack");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;


module.exports = function(env) {

	var pack = require("./package.json");
	var MiniCssExtractPlugin = require("mini-css-extract-plugin");

	var production = !!(env && env.production === "true");
	var asmodule = !!(env && env.module === "true");
	var standalone = !!(env && env.standalone === "true");

	var babelSettings = {
		extends: path.join(__dirname, "/.babelrc")
	};

	var config = {
		mode: production ? "production" : "development",
		entry: {
			app: "./pilot-ui/sources/app.js"
		},
		output: {
			path: path.join(__dirname, "pilot-ui/codebase"),
			publicPath:"pilot-ui/codebase/",
			filename: "[name].js",
			chunkFilename: "[name].bundle.js"
		},
		module: {
			rules: [
				{
					test: /\.js$/,
					use: "babel-loader?" + JSON.stringify(babelSettings)
				},
				{
					test: /\.(svg|png|jpg|gif)$/,
					use: "url-loader?limit=25000"
				},
				{
					test: /\.(less|css)$/,
                    //loader: 'style-loader!css-loader'
					use: [ MiniCssExtractPlugin.loader, "css-loader", "less-loader" ]
				}
			]
		},
		stats: "minimal",
		resolve: {
			extensions: [".js"],
			modules: ["./pilot-ui/sources", "node_modules"],
			alias:{
				"jet-views":path.resolve(__dirname, "pilot-ui/sources/views"),
				"jet-locales":path.resolve(__dirname, "pilot-ui/sources/locales")
			}
		},
		plugins: [
			new MiniCssExtractPlugin({
				filename:"[name].css"
			}),
			new webpack.DefinePlugin({
				VERSION: `"${pack.version}"`,
				APPNAME: `"${pack.name}"`,
				PRODUCTION : production,
				BUILD_AS_MODULE : (asmodule || standalone)
			})
			,new BundleAnalyzerPlugin()
		],
		devServer:{
			stats:"errors-only",
			host: "0.0.0.0",
			port: "8091",
			disableHostCheck: true,
			proxy: {
				"/socket.io": {
					target: "http://127.0.0.1:8080",
					ws: true
				},
				"/api": {
					target: "http://127.0.0.1:8080"
				}
			}
		}
	};

	if (!production){
		config.devtool = "inline-source-map";
	}

	if (asmodule){
		if (!standalone){
			config.externals = config.externals || {};
			config.externals = [ "webix-jet" ];
		}

		const out = config.output;
		const sub = standalone ? "full" : "module";

		out.library = pack.name.replace(/[^a-z0-9]/gi, "");
		out.libraryTarget= "umd";
		out.path = path.join(__dirname, "dist", sub);
		out.publicPath = "/dist/"+sub+"/";
	}

	return config;
}
