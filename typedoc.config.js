const pkg = require("./package.json")
const fs = require("fs")
const path = require("path")

module.exports = {
	readme: 'README.md',
	mode: "modules",
	inputFiles: [ "src" ],
	out: "docs",
	excludeNotExported: true,
	excludePrivate: true,
	excludeExternals: true,
	ignoreCompilerErrors: true,
	theme: "./node_modules/typedoc-neo-theme/bin/default",
	exclude: [
		"tests/**/*",
		// not excluding index files causes problems
		"**/*index.ts",
	],
	// prevents typedoc autodetecting installed plugins
	// explitcly listing them makes things easier to debug
	plugin: [
		"typedoc-neo-theme",
		"typedoc-plugin-external-module-name",
	],
	"source": [
		{ "path": pkg.repository + "/tree/master/", "line": "L" }
	],
	//topbar
	"links": [
		{ "label": "Repository", "url": pkg.repository },
		{ "label": "Issues", "url": pkg.repository + "/issues" }
	],
	// creates an outline using all the top level directories in the src folder
	outline: [
		fs.readdirSync("src")
			.filter(dir => fs.statSync(path.join("src", dir)).isDirectory())
			.reduce((obj, curr) => { obj[ curr ] = curr; return obj }, {})
	]
};
