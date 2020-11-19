![Build](https://github.com/alanscodelog/dts-alias/workflows/Build/badge.svg)
[![Release](https://github.com/alanscodelog/dts-alias/workflows/Release/badge.svg)](https://www.npmjs.com/package/dts-alias)

# dts-alias

Tiny cli utility to fix unresolved type aliases in type definitions until something like [#30952](https://github.com/microsoft/TypeScript/issues/30952) is hopefully implemented.

[Why?](#Why)

# Install

```bash
npm install -g dts-alias
```

# Usage
```bash
dts-alias [...tsc cli options]

// to turn on verbose output just set the DEBUG environment variable:
DEBUG=true tsc [...tsc cli options]
```

This utility should be passed any options you pass to `tsc` when emitting your definitions (technically not all of them, see [notes](#notes)).

I recommend just keeping a separate tsconfig like `tsconfig.types.json` for emitting your types so you can just make a script that does:
```bash
tsc -p tsconfig.types.json && dts-alias -p tsconfig.types.json
```

Internally it will just run `tsc --showConfig [...tsc cli options]` to view the config just as typescript would resolve it (e.g. in the case of extends, etc).

Then it searches for all `.d.ts` files in `compilerOptions.outDir` and using `compilerOptions.paths`, searches for any import statements and replaces any aliases it finds with the first path specified in `compilerOptions.paths` (keeping in mind the [`baseUrl`](https://www.typescriptlang.org/docs/handbook/module-resolution.html#base-url) of course).

In the special case of root dir aliases (e.g. `@/*: [src/*]`), the root dir will just be removed. Instead of changing a path to something like `../src/folder`, it will get changed to `./folder`, the same folder, but in the output directory.


# Notes

- It only checks for import statements.
- Technically only options/flags that affect the following `compilerOptions` need to be passed: `paths`, `rootDir`, `outDir`, `baseUrl`, or which config is used (`--project/-p` flag).
- In the case of listing multiple paths per path, it ignores other paths and does not try to verify the path exists/resolves correctly.

# Why

While babel + babel-plugin-module-resolver can be used to transpile typescript with aliases correctly resolved, the only thing that can emit `.d.ts` definition files is `tsc` itself. But since the aliases aren't changed, this can lead to problems where the types seem to work perfectly fine when developing the package, but some types fail to resolve correctly when using the package as a dependency.

For example, say you have a library, and a function inside of it imports a type from an alias `@/types` and then proceeds to use that as a return type:

```
lib
	src
		func.ts
			import {SomeType} from "@/types"
			export function func (): SomeType {...}
		types
			index.ts
				export type SomeType = string
```
When built, babel can be made to correctly resolve the alias for `func.js`, but `dist/func.d.ts` will still contain the unchanged `import {SomeType} from "@/types"`.

While developing `lib`, because the tsconfig still tells typescript where to map `@/types` everything will seem to work like normal. The type for `func` will be correct, i.e. `string`.

But when `lib` is used in another project, the return type of `func` will be `any`. This is because typescript will look at `import {SomeType} from "@/types"` and not be able to resolve it.

Or even worse, suppose your project is also using `@/*` as an alias and it also has it's own type folder. In this case typescript *might* be able to resolve it, but to the wrong place! When resolving, typescript is only looking at the top level tsconfig so it will attempt to resolve `"@/types"` in `lib` using the paths in the project's tsconfig which will point `@/types` to the project's type folder!

This is usually not a problem, but if you happened to export a type with the same name but with a different type, it would change the type of lib's `func`!

```
project
	node_modules
		lib
			dist
				func.d.ts
					import {SomeType} from "@/types" // resolves to project's src/types
					export function func (): SomeType {...} // SomeType is now number!
	src
		types
			index.ts
				export type SomeType = number
```
