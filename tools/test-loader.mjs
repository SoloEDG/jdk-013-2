// 仅用于 Node 单测：把打包器风格的相对导入解析到 TS 文件，
// 支持无扩展名文件（./foo -> ./foo.ts）与目录桶文件（./dir -> ./dir/index.ts）。
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";

function tryResolve(specifier, parentURL) {
  const base = new URL(specifier, parentURL);
  const path = fileURLToPath(base);

  // 无扩展名文件
  if (!/\.[cm]?[jt]s$/.test(specifier)) {
    if (existsSync(path + ".ts")) return new URL(specifier + ".ts", parentURL).href;
  }
  // 目录桶文件
  if (existsSync(path) && statSync(path).isDirectory()) {
    const index = specifier.endsWith("/")
      ? specifier + "index.ts"
      : specifier + "/index.ts";
    const indexUrl = new URL(index, parentURL);
    if (existsSync(fileURLToPath(indexUrl))) return indexUrl.href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".")) {
    const parentURL =
      context.parentURL ?? pathToFileURL(process.cwd() + "/").href;
    const resolved = tryResolve(specifier, parentURL);
    if (resolved) return nextResolve(resolved, context);
  }
  return nextResolve(specifier, context);
}

// 单测不渲染组件：.vue 文件存根为空模块，仅消费同目录的 TS 逻辑工厂。
export async function load(url, context, nextLoad) {
  if (url.endsWith(".vue")) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  return nextLoad(url, context);
}
