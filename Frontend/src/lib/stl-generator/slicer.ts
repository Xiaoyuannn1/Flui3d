
import fs from 'fs'
import fse from 'fs-extra'
import path from 'path'
import { createCanvas } from 'canvas'
// @ts-ignore
import createSlicer from 'mesh-slice-polygon'
import stl from 'stl'

// 输入输出配置
const inputStlPath = '/Users/logan/Desktop/Flui3d/Frontend/data/stl_sample.stl'
const outputDir = '/Users/logan/Desktop/Flui3d/Frontend/data/output'

// 切片参数
const Z_STEP = 100

// 画布尺寸
const CANVAS_WIDTH  = 2560
const CANVAS_HEIGHT = 1620

// 缩放比例：原坐标除以 10
const SCALE_FACTOR = 10

async function runSlicer() {
    const slicer = createSlicer()

    // 全局边界
    let zMin = Infinity, zMax = -Infinity
    let xMin = Infinity, xMax = -Infinity
    let yMin = Infinity, yMax = -Infinity

    // 1. 读取 STL 并统计边界
    await new Promise<void>((resolve, reject) => {
        fs.createReadStream(inputStlPath)
            .pipe(stl.createParseStream())
            .on('data', (obj: any) => {
                if (obj && obj.verts) {
                    slicer.addTriangle(obj.verts)
                    obj.verts.forEach(([x, y, z]: [number, number, number]) => {
                        if (x < xMin) xMin = x
                        if (x > xMax) xMax = x
                        if (y < yMin) yMin = y
                        if (y > yMax) yMax = y
                        if (z < zMin) zMin = z
                        if (z > zMax) zMax = z
                    })
                }
            })
            .on('end', resolve)
            .on('error', reject)
    })

    await fse.ensureDir(outputDir)

    // 2. 计算缩放后内容宽高与边距
    const contentW = (xMax - xMin) / SCALE_FACTOR
    const contentH = (yMax - yMin) / SCALE_FACTOR
    const padX = (CANVAS_WIDTH  - contentW)  / 2
    const padY = (CANVAS_HEIGHT - contentH) / 2

    // 3. 按 Z_STEP 切片并绘图
    for (let z = Math.ceil(zMin / Z_STEP) * Z_STEP; z <= zMax; z += Z_STEP) {
        const polygons = slicer.slice(z)
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT)
        const ctx = canvas.getContext('2d')

        // 黑底
        ctx.fillStyle = 'black'
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

        // 白色切片
        ctx.fillStyle = 'white'
        ctx.beginPath()
        for (const poly of polygons) {
            const pts = poly.points
            if (pts.length < 3) continue
            for (let i = 0; i < pts.length; i++) {
                const x = pts[i].x, y = pts[i].y
                const px = (x - xMin) / SCALE_FACTOR + padX
                const py = CANVAS_HEIGHT - ((y - yMin) / SCALE_FACTOR + padY)
                if (i === 0) ctx.moveTo(px, py)
                else        ctx.lineTo(px, py)
            }
            ctx.closePath()
        }
        ctx.fill('evenodd')

        // 保存 PNG
        const filename = `slice_${z}.png`
        const outPath = path.join(outputDir, filename)
        fs.writeFileSync(outPath, canvas.toBuffer('image/png'))
        console.log(`Saved: ${filename}`)
    }

    console.log('All slices completed.')
}

runSlicer().catch(console.error)
