import initSqlJsWasm, {
  type SqlJsStatic,
} from "sql.js";
import initSqlJsAsm from "sql.js/dist/sql-asm.js";

/**
 * 初始化浏览器内 SQLite。
 *
 * 优先使用体积更小、速度更快的 WebAssembly 版本；当宿主环境禁止
 * WebAssembly 代码生成（常见于嵌入式浏览器或受限 CSP）时，退回到
 * 不依赖 Wasm 的 asm.js 版本。
 */
export async function initSqlRuntime(wasmLocation: string): Promise<SqlJsStatic> {
  try {
    return await initSqlJsWasm({ locateFile: () => wasmLocation });
  } catch {
    return initSqlJsAsm();
  }
}
