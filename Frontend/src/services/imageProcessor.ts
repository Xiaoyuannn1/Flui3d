export interface SamplingPoint {
    x: number  // 采样中心点X坐标
    y: number  // 采样中心点Y坐标
}

export interface ImagePatch {
    data: Float32Array  // 256x256的图像数据，归一化到[0,1]
    x: number          // 对应的采样点X坐标
    y: number          // 对应的采样点Y坐标
}

export class ImageProcessor {

    /**
     * 这个函数在干什么：
     * 1. 根据您的要求，从(128,128)开始采样
     * 2. 每隔256像素取一个点（不重复）
     * 3. 生成2560x1620图像上的所有采样点坐标
     */
    static generateSamplingPoints(): SamplingPoint[] {
        const points: SamplingPoint[] = []

        // 从(128,128)开始，每隔256像素采样一次
        for (let y = 128; y < 1620; y += 256) {
            for (let x = 128; x < 2560; x += 256) {
                points.push({ x, y })
            }
        }

        console.log(`[ImageProcessor] 📍 生成 ${points.length} 个采样点`)
        console.log(`[ImageProcessor] 🎯 采样范围: X=[128-${points[points.length-1].x}], Y=[128-${points[points.length-1].y}]`)

        return points
    }

    /**
     * 这个函数在干什么：
     * 1. 接收一个Canvas元素（包含2560x1620的切片图像）
     * 2. 在指定的中心点裁剪出256x256的小块
     * 3. 如果超出边界，用黑色像素填充
     * 4. 将图像数据转换为Float32Array格式
     */
    static extractPatch(canvas: HTMLCanvasElement, centerX: number, centerY: number): Float32Array {
        const patchSize = 256
        const halfSize = patchSize / 2  // 128

        // 创建新的Canvas用于裁剪
        const patchCanvas = document.createElement('canvas')
        patchCanvas.width = patchSize
        patchCanvas.height = patchSize
        const patchCtx = patchCanvas.getContext('2d')!

        // 用黑色填充整个patch（边界填充）
        patchCtx.fillStyle = 'black'
        patchCtx.fillRect(0, 0, patchSize, patchSize)

        // 计算源图像的裁剪区域
        const sourceX = centerX - halfSize      // 128 - 128 = 0 (对于第一个点)
        const sourceY = centerY - halfSize      // 128 - 128 = 0
        const sourceWidth = patchSize           // 256
        const sourceHeight = patchSize          // 256

        // 计算目标Canvas的绘制位置（处理边界情况）
        const destX = Math.max(0, -sourceX)
        const destY = Math.max(0, -sourceY)
        const destWidth = Math.min(patchSize, canvas.width - Math.max(0, sourceX))
        const destHeight = Math.min(patchSize, canvas.height - Math.max(0, sourceY))

        // 从源Canvas裁剪并绘制到patch Canvas
        if (destWidth > 0 && destHeight > 0) {
            patchCtx.drawImage(
                canvas,
                Math.max(0, sourceX), Math.max(0, sourceY),  // 源区域
                destWidth, destHeight,
                destX, destY,                                // 目标区域
                destWidth, destHeight
            )
        }

        // 获取图像数据并转换为Float32Array
        const imageData = patchCtx.getImageData(0, 0, patchSize, patchSize)
        const pixels = imageData.data  // RGBA格式

        // 转换为灰度并归一化到[0,1]
        const floatData = new Float32Array(patchSize * patchSize)
        for (let i = 0; i < floatData.length; i++) {
            const pixelIndex = i * 4  // RGBA中每个像素4个值
            // 取红色通道作为灰度值（因为是灰度图，RGB三个通道值相同）
            const grayValue = pixels[pixelIndex]     // 0-255
            floatData[i] = grayValue / 255.0         // 归一化到[0,1]
        }

        return floatData
    }

    /**
     * 这个函数在干什么：
     * 1. 在所有采样点位置裁剪图像patch
     * 2. 返回所有的图像patch数据
     */
    static extractAllPatches(canvas: HTMLCanvasElement): ImagePatch[] {
        const samplingPoints = this.generateSamplingPoints()
        const patches: ImagePatch[] = []

        console.log(`[ImageProcessor] ✂️  开始从图像中提取 ${samplingPoints.length} 个patch...`)

        for (const point of samplingPoints) {
            const patchData = this.extractPatch(canvas, point.x, point.y)
            patches.push({
                data: patchData,
                x: point.x,
                y: point.y
            })
        }

        console.log(`[ImageProcessor] ✅ 成功提取 ${patches.length} 个 256x256 patch`)
        return patches
    }

    /**
     * 这个函数在干什么：
     * 将Blob格式的图像转换为Canvas
     */
    static async blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = img.width
                canvas.height = img.height

                const ctx = canvas.getContext('2d')!
                ctx.drawImage(img, 0, 0)

                console.log(`[ImageProcessor] 🖼️  图像转换为Canvas: ${canvas.width}x${canvas.height}`)
                resolve(canvas)
            }
            img.onerror = reject
            img.src = URL.createObjectURL(blob)
        })
    }
}