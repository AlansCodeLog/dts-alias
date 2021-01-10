/* eslint-disable no-console */
// eslint-disable-next-line import/no-extraneous-dependencies
import { escape, pretty } from "@utils/utils"
import { exec as _exec } from "child_process"
import glob from "fast-glob"
import { promises as fs } from "fs"
import path from "path"
import util from "util"


const exec = util.promisify(_exec)


async function main(): Promise<void> {
	const args = process.argv.slice(2).join(" ")
	if (process.env.DEBUG) console.log(`Arguments passed to tsc: ${args}`)

	const command = `tsc --showConfig ${args}`

	const { stdout, stderr } = await exec(command)
	if (stderr) {
		console.log(stderr)
		process.exit(1)
	}

	const tsconfig = JSON.parse(stdout)
	if (process.env.DEBUG) console.log(`tsconfig:\n${pretty(tsconfig)}`)

	const outDir = path.resolve(tsconfig.compilerOptions.outDir || "dist")
	if (process.env.DEBUG) console.log(`outDir: ${outDir}`)
	const rootDir = path.resolve(tsconfig.compilerOptions.rootDir || "src")
	if (process.env.DEBUG) console.log(`rootDir: ${rootDir}`)
	const baseUrl = tsconfig.compilerOptions.baseUrl || "."
	if (process.env.DEBUG) console.log(`baseUrl: ${baseUrl}`)

	const paths: {path: string, regex: RegExp, getPath: (part: string) => string}[] = []

	for (const pathString of Object.keys(tsconfig.compilerOptions.paths)) {
		const pathParts = pathString.split("*")
		const start = escape(pathParts[0])
		const end = escape(pathParts[1])


		const regex = `(import .*? ('|"))${start}(.*?)(${end}\\2)`
		paths.push({
			path: pathString,
			regex: new RegExp(regex, "g"),
			getPath: (part: string) => {
				let rawPath = tsconfig.compilerOptions.paths[pathString][0].replace("*", part)
				const parts = path.normalize(rawPath).split(path.sep)

				const pathRootDir = parts[0]
				if (path.resolve(pathRootDir) === rootDir) {
					rawPath = path.join(outDir, ...parts.slice(1))
				}
				return rawPath
			},
		})
	}

	const globStr = `${outDir.replace(/\\/g, "/")}/**/*.d.ts`
	if (process.env.DEBUG) console.log(`glob: ${globStr}`)

	const files = await glob(globStr)
	if (process.env.DEBUG) console.log(`files:\n\t${files.join("\n\t")}`)
	await Promise.all(files.map(async file => {
		let contents = (await fs.readFile(file)).toString()
		const changes: string[][] = []
		for (const entry of paths) {
			contents = contents.replace(entry.regex, (
				match: string, start: string, _quotes: string, str: string, end: string
			): string => {
				const realLoc = path.resolve(baseUrl, entry.getPath(str))

				let relative = path.relative(path.dirname(file), realLoc).replace(/\\/g, "/") + end
				if (!relative.startsWith("../")) relative = `./${relative}`

				changes.push([match, start + relative])
				return start + relative
			})
		}
		if (process.env.DEBUG) {
			if (changes.length > 0) console.log(`Fixed aliases in ${file}:`)

			for (const change of changes) {
				console.log(`\tChanged:  \`${change[0]}\`\n\tTo:       \`${change[1]}\``)
			}
		}
		await fs.writeFile(file, contents)
	}))
}

main()
	.catch(err => {
		console.log(err)
		process.exit(1)
	})
