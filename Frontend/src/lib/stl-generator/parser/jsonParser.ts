// import fs from 'node:fs'
// import { ChipJSON } from '../model/types'
//
// export function readDesignJson(filepath: string): ChipJSON {
//     const txt = fs.readFileSync(filepath, 'utf-8')
//     return JSON.parse(txt) as ChipJSON
// }


import { ChipJSON } from '../model/types'

// 原有函数保持不变（但注释掉fs相关代码）
export function readDesignJson(filepath: string): ChipJSON {
    // const fs = require('node:fs')
    // const txt = fs.readFileSync(filepath, 'utf-8')
    // return JSON.parse(txt) as ChipJSON
    throw new Error('readDesignJson is not available in browser environment')
}

// 新增：浏览器环境专用函数
export function parseDesignJson(jsonString: string): ChipJSON {
    return JSON.parse(jsonString) as ChipJSON
}