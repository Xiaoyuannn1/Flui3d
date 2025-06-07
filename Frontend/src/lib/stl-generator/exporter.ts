// // // @ts-ignore
// // import { serialize } from '@jscad/stl-serializer'
// // import fs from 'node:fs/promises'
// //
// //
// // export async function writeStl(model: any, outPath: string){
// //     const ascii = serialize({ binary:false }, model).join('')
// //     await fs.writeFile(outPath, ascii)
// // }
//
// import fs from 'node:fs/promises'
// import path from 'node:path'
// // @ts-ignore
// import { serialize } from '@jscad/stl-serializer'
//
// function getNowTimeString() {
//     const now = new Date()
//     const yyyy = now.getFullYear()
//     const mm = String(now.getMonth() + 1).padStart(2, '0')
//     const dd = String(now.getDate()).padStart(2, '0')
//     const hh = String(now.getHours()).padStart(2, '0')
//     const mi = String(now.getMinutes()).padStart(2, '0')
//     const ss = String(now.getSeconds()).padStart(2, '0')
//     return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`
// }
//
//
// export async function writeStl(model: any, outPath: string) {
//     try {
//         // 确保输出目录存在
//         const dir = path.dirname(outPath)
//         await fs.mkdir(dir, { recursive: true })
//
//         // 生成带时间戳的新文件名
//         const ext = path.extname(outPath) || '.stl'
//         const base = path.basename(outPath, ext)
//         const newFile = `${base}_${getNowTimeString()}${ext}`
//         const absPath = path.join(dir, newFile)
//
//         // 序列化为STL格式
//         const rawData = serialize({ binary: false }, model)
//         const stlContent = Array.isArray(rawData) ? rawData.join('') : rawData
//
//         // 写入文件
//         await fs.writeFile(absPath, stlContent)
//         return absPath  // 只返回路径，不打印
//     } catch (error) {
//         console.error('Error writing STL file:', error)
//         throw error
//     }
// }


// @ts-ignore
import { serialize } from '@jscad/stl-serializer'

function getNowTimeString() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`
}

// 原有函数保持不变（但注释掉文件操作）
export async function writeStl(model: any, outPath: string) {
    throw new Error('writeStl is not available in browser environment. Use downloadStlInBrowser instead.')
}

// 新增：浏览器环境下的STL下载函数
export async function downloadStlInBrowser(model: any, filename: string) {
    try {
        // 生成带时间戳的文件名
        const timestamp = getNowTimeString()
        const finalFilename = `${filename}_${timestamp}.stl`

        // 序列化为STL格式
        const rawData = serialize({ binary: false }, model)
        const stlContent = Array.isArray(rawData) ? rawData.join('') : rawData

        // 创建Blob并触发下载
        const blob = new Blob([stlContent], { type: 'application/stl' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = finalFilename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        return finalFilename
    } catch (error) {
        console.error('Error downloading STL file:', error)
        throw error
    }
}