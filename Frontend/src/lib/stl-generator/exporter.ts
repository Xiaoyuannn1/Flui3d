// // @ts-ignore
// import { serialize } from '@jscad/stl-serializer'
// import fs from 'node:fs/promises'
//
//
// export async function writeStl(model: any, outPath: string){
//     const ascii = serialize({ binary:false }, model).join('')
//     await fs.writeFile(outPath, ascii)
// }

import fs from 'node:fs/promises'
import path from 'node:path'
// @ts-ignore
import { serialize } from '@jscad/stl-serializer'

export async function writeStl(model: any, outPath: string) {
    try {
        // 确保输出目录存在
        const dir = path.dirname(outPath)
        await fs.mkdir(dir, { recursive: true })

        // 序列化为STL格式
        const rawData = serialize({ binary: false }, model)
        const stlContent = Array.isArray(rawData) ? rawData.join('') : rawData

        // 写入文件
        await fs.writeFile(outPath, stlContent)
    } catch (error) {
        console.error('Error writing STL file:', error)
        throw error
    }
}
