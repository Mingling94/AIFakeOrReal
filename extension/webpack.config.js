const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

// Build target: "chrome" (default, -> dist/) or "firefox" (-> dist-firefox/).
const TARGET = process.env.TARGET === "firefox" ? "firefox" : "chrome";
const OUT_DIR = TARGET === "firefox" ? "dist-firefox" : "dist";

module.exports = {
  entry: {
    background: "./src/background/service-worker.ts",
    content: "./src/content/content-script.ts",
    popup: "./src/popup/index.tsx",
    options: "./src/options/index.tsx",
  },
  output: {
    path: path.resolve(__dirname, OUT_DIR),
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: `public/manifest.${TARGET}.json`, to: "manifest.json" },
        { from: "public/icons", to: "icons", noErrorOnMissing: true },
        { from: "public/_locales", to: "_locales", noErrorOnMissing: true },
      ],
    }),
    new HtmlWebpackPlugin({
      template: "./src/popup/popup.html",
      filename: "popup.html",
      chunks: ["popup"],
    }),
    new HtmlWebpackPlugin({
      template: "./src/options/options.html",
      filename: "options.html",
      chunks: ["options"],
    }),
  ],
};
