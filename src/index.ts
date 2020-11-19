/* eslint-disable no-console */
// eslint-disable-next-line import/no-extraneous-dependencies
import { escape, pretty } from "@utils/utils"
import { exec as _exec } from "child_process"
import glob from "fast-glob"
import fs from "fs/promises"
import path from "path"
import util from "util"


const exec = util.promisify(_exec)


async function main(): Promise<void> {
	let args = process.argv.slice(2).join(" ")
	if (process.env.DEBUG) console.log(`Arguments passed to tsc: ${args}`)

	let command = `tsc --showConfig ${args}`

	let { stdout, stderr } = await exec(command)
	if (stderr) {
		console.log(stderr)
		process.exit(1)
	}

	let tsconfig = JSON.parse(stdout)
	if (process.env.DEBUG) console.log(`tsconfig:\n${pretty(tsconfig)}`)

	let out_dir = path.resolve(tsconfig.compilerOptions.outDir || "dist")
	if (process.env.DEBUG) console.log(`outDir: ${out_dir}`)
	let root_dir = path.resolve(tsconfig.compilerOptions.rootDir || "src")
	if (process.env.DEBUG) console.log(`rootDir: ${root_dir}`)
	let base_url = tsconfig.compilerOptions.baseUrl || "."
	if (process.env.DEBUG) console.log(`baseUrl: ${base_url}`)

	let paths: {path: string, regex: RegExp, get_path: (part: string) => string}[] = []

	for (let path_string of Object.keys(tsconfig.compilerOptions.paths)) {
		let path_parts = path_string.split("*")
		let start = escape(path_parts[0])
		let end = escape(path_parts[1])


		let regex = `(import .*? ('|"))${start}(.*?)(${end}\\2)`
		paths.push({
			path: path_string,
			regex: new RegExp(regex, "g"),
			// eslint-disable-next-line @typescript-eslint/naming-convention
			get_path: (part: string) => {
				let raw_path = tsconfig.compilerOptions.paths[path_string][0].replace("*", part)
				let parts = path.normalize(raw_path).split(path.sep)

				let path_root_dir = parts[0]
				if (path.resolve(path_root_dir) === root_dir) {
					raw_path = path.join(out_dir, ...parts.slice(1))
				}
				return raw_path
			},
		})
	}

	let glob_str = `${out_dir.replace(/\\/g, "/")}/**/*.d.ts`
	if (process.env.DEBUG) console.log(`glob: ${glob_str}`)

	let files = await glob(glob_str)
	if (process.env.DEBUG) console.log(`files:\n\t${files.join("\n\t")}`)
	await Promise.all(files.map(async file => {
		let contents = (await fs.readFile(file)).toString()
		let changes: string[][] = []
		for (let entry of paths) {
			contents = contents.replace(entry.regex, (
				match: string, start: string, _quotes: string, str: string, end: string
			): string => {
				let real_loc = path.resolve(base_url, entry.get_path(str))

				let relative = path.relative(path.dirname(file), real_loc).replace(/\\/g, "/") + end
				if (!relative.startsWith("../")) relative = `./${relative}`

				changes.push([match, start + relative])
				return start + relative
			})
		}
		if (process.env.DEBUG) {
			if (changes.length > 0) console.log(`Fixed aliases in ${file}:`)

			for (let change of changes) {
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
