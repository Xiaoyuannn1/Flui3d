
import createSlicer from 'mesh-slice-polygon'

export interface SliceResult {
    sliceImages: Blob[]
    sliceInfo: {
        zValue: number
        filename: string
    }[]
}

export class SlicerService {
    /**
     * 从STL ArrayBuffer生成切片图像
     */
    static async generateSlices(
        stlData: ArrayBuffer,
        zStep = 100,
        canvasWidth = 2560,
        canvasHeight = 1620,
        scaleFactor = 10
    ): Promise<SliceResult> {


        // 1. 解析STL数据
        const triangles = this.parseSTLBuffer(stlData)

        // 2. 初始化切片器
        const slicer = createSlicer()

        // 3. 计算边界框
        let zMin = Infinity, zMax = -Infinity
        let xMin = Infinity, xMax = -Infinity
        let yMin = Infinity, yMax = -Infinity

        triangles.forEach(triangle => {
            slicer.addTriangle(triangle)
            triangle.forEach((vertex) => {
                const [x, y, z] = vertex
                if (x < xMin) xMin = x
                if (x > xMax) xMax = x
                if (y < yMin) yMin = y
                if (y > yMax) yMax = y
                if (z < zMin) zMin = z
                if (z > zMax) zMax = z
            })
        })

        console.log('边界框:', { xMin, xMax, yMin, yMax, zMin, zMax })

        // 4. 计算布局参数
        const contentW = (xMax - xMin) / scaleFactor
        const contentH = (yMax - yMin) / scaleFactor
        const padX = (canvasWidth - contentW) / 2
        const padY = (canvasHeight - contentH) / 2

        console.log('画布参数:', { contentW, contentH, padX, padY })

        // 5. 生成切片
        const sliceImages: Blob[] = []
        const sliceInfo: { zValue: number; filename: string }[] = []

        for (let z = Math.ceil(zMin / zStep) * zStep; z <= zMax; z += zStep) {

            const polygons = slicer.slice(z)

            // 使用浏览器原生Canvas API（不是Node.js的canvas包）
            const canvas = document.createElement('canvas')
            canvas.width = canvasWidth
            canvas.height = canvasHeight
            const ctx = canvas.getContext('2d')!

            // 黑底
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, canvasWidth, canvasHeight)

            // 白色切片
            ctx.fillStyle = 'white'
            ctx.beginPath()

            for (const poly of polygons) {
                const pts = poly.points
                if (pts.length < 3) continue

                for (let i = 0; i < pts.length; i++) {
                    const x = pts[i].x, y = pts[i].y
                    const px = (x - xMin) / scaleFactor + padX
                    const py = canvasHeight - ((y - yMin) / scaleFactor + padY)
                    if (i === 0) ctx.moveTo(px, py)
                    else ctx.lineTo(px, py)
                }
                ctx.closePath()
            }

            ctx.fill('evenodd')

            // 🔄 添加顺时针90度旋转
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = canvasHeight // 注意宽高交换
            tempCanvas.height = canvasWidth
            const tempCtx = tempCanvas.getContext('2d')!

            tempCtx.save()
            tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2)
            tempCtx.rotate(Math.PI / 2) // 顺时针90度
            tempCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
            tempCtx.restore()

            // 转换为Blob
            const blob = await this.canvasToBlob(tempCanvas)
            sliceImages.push(blob)

            const filename = `slice_${z}.png`
            sliceInfo.push({ zValue: z, filename })
        }


        return { sliceImages, sliceInfo }
    }

    /**
     * 解析STL ArrayBuffer为三角形数组
     */
    private static parseSTLBuffer(buffer: ArrayBuffer): number[][][] {
        const triangles: number[][][] = []
        const decoder = new TextDecoder()
        const text = decoder.decode(buffer)

        // 解析ASCII STL
        const lines = text.split('\n')
        let currentTriangle: number[][] = []

        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('vertex')) {
                const parts = trimmed.split(/\s+/)
                const x = parseFloat(parts[1])
                const y = parseFloat(parts[2])
                const z = parseFloat(parts[3])
                currentTriangle.push([x, y, z])

                if (currentTriangle.length === 3) {
                    triangles.push([...currentTriangle])
                    currentTriangle = []
                }
            }
        }

        return triangles
    }

    /**
     * Canvas转Blob（使用浏览器原生API）
     */
    private static canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob!)
            }, 'image/png')
        })
    }
}