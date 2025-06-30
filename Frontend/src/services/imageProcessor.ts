
import {SlicerService} from "@/services/slicerService"


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
     * 3. 生成图像上的所有采样点坐标
     */

    static generateSamplingPoints(canvasWidth?: number, canvasHeight?: number, precision?: string): SamplingPoint[] {
        const points: SamplingPoint[] = []

        // 根据precision确定采样步长
        let step: number
        switch (precision) {
            case 'High':
                step = 20
                break
            case 'Medium':
                step = 28
                break
            case 'Low':
                step = 36
                break
            default:
                step = 256  // 默认值，保持向后兼容
        }

        if (canvasWidth && canvasHeight) {
            // 动态采样：起始点固定(128,128)，步长根据precision变化
            for (let y = 128; y < canvasHeight; y += step) {
                for (let x = 128; x < canvasWidth; x += step) {
                    points.push({ x, y })
                }
            }
        } else {
            // 回退到固定采样（保持向后兼容）
            for (let y = 128; y < 1620; y += 256) {
                for (let x = 128; x < 2560; x += 256) {
                    points.push({ x, y })
                }
            }
        }

        console.log(`[ImageProcessor] 生成 ${points.length} 个采样点，间距: ${step}像素`)
        console.log(`[ImageProcessor]  采样范围: X=[128-${points[points.length-1].x}], Y=[128-${points[points.length-1].y}]`)
        return points

    }
    /**
     * 这个函数在干什么：
     * 1. 接收一个Canvas元素（包含的切片图像）
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
        const samplingPoints = this.generateSamplingPoints(canvas.width, canvas.height)
        const patches: ImagePatch[] = []

        //console.log(`[ImageProcessor] ✂️  开始从图像中提取 ${samplingPoints.length} 个patch...`)

        for (const point of samplingPoints) {
            const patchData = this.extractPatch(canvas, point.x, point.y)
            patches.push({
                data: patchData,
                x: point.x,
                y: point.y
            })
        }

        console.log(`[ImageProcessor]  成功提取 ${patches.length} 个 256x256 patch`)
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

                //console.log(`[ImageProcessor] 🖼️  图像转换为Canvas: ${canvas.width}x${canvas.height}`)
                resolve(canvas)
            }
            img.onerror = reject
            img.src = URL.createObjectURL(blob)
        })
    }

    /**
     * 将Float32Array图像数据转换为可下载的PNG文件
     */
    static downloadPatchAsImage(
        imageData: Float32Array,
        filename: string,
        width = 256,
        height = 256
    ): void {
        // 创建Canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!

        // 创建ImageData
        const imgData = ctx.createImageData(width, height)
        const pixels = imgData.data

        // 将Float32Array [0,1] 转换为 RGBA [0,255]
        for (let i = 0; i < imageData.length; i++) {
            const pixelIndex = i * 4
            const grayValue = Math.round(imageData[i] * 255) // [0,1] → [0,255]

            pixels[pixelIndex] = grayValue     // R
            pixels[pixelIndex + 1] = grayValue // G
            pixels[pixelIndex + 2] = grayValue // B
            pixels[pixelIndex + 3] = 255       // A (不透明)
        }

        // 绘制到Canvas
        ctx.putImageData(imgData, 0, 0)

        // 转换为Blob并下载
        canvas.toBlob((blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = filename
                link.style.display = 'none'

                // 触发下载
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                // 清理URL
                URL.revokeObjectURL(url)

                //console.log(`[ImageProcessor] 📥 已下载图像: ${filename}`)
            }
        }, 'image/png')
    }

    /**
     * 下载第一个采样点的图像对
     */
    static downloadFirstSampleImages(
        slice0Patches: ImagePatch[],
        slice100Patches: ImagePatch[]
    ): void {
        if (slice0Patches.length === 0 || slice100Patches.length === 0) {
            //console.warn('[ImageProcessor] ⚠️ 没有可下载的图像patch')
            return
        }

        // 获取第一个采样点的数据
        const firstSlice0 = slice0Patches[5]
        const firstSlice100 = slice100Patches[5]

        //console.log(`[ImageProcessor] 📥 下载第一个采样点图像: (${firstSlice0.x}, ${firstSlice0.y})`)

        // 生成带时间戳的文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

        // 下载两张图像
        this.downloadPatchAsImage(
            firstSlice0.data,
            `slice_0_patch_${firstSlice0.x}_${firstSlice0.y}_${timestamp}.png`
        )

        this.downloadPatchAsImage(
            firstSlice100.data,
            `slice_100_patch_${firstSlice100.x}_${firstSlice100.y}_${timestamp}.png`
        )

        //console.log('[ImageProcessor] ✅ 第一个采样点的两张图像下载完成')
    }
    /**
     * 简单平均融合多个图像patch
     * 用途：生成extra_image（向上取2张图简单平均）
     */
    static mergePatches(patches: Float32Array[]): Float32Array {
        if (patches.length === 0) return new Float32Array(256 * 256)  // 返回全黑图
        const result = new Float32Array(256 * 256)

        // 对每个像素位置求平均
        for (let i = 0; i < result.length; i++) {
            let sum = 0
            for (const patch of patches) {
                sum += patch[i]  // 累加所有图像在位置i的像素值
            }
            result[i] = sum / patches.length  // 求平均
        }

        return result
    }

    /**
     * Beer-Lambert指数衰减融合
     * 用途：生成fused_image（向下取8张图，越近权重越大）
     */
    static mergePatchesBeerLambert(patches: Float32Array[], alpha = 0.27): Float32Array {
        if (patches.length === 0) return new Float32Array(256 * 256)

        // 计算指数衰减权重：第0张权重最大，第7张最小
        const weights = patches.map((_, i) => Math.exp(-alpha * i))
        const weightSum = weights.reduce((a, b) => a + b, 0)

        const result = new Float32Array(256 * 256)

        // 加权平均：每个像素 = sum(图像i的像素值 × 权重i) / 权重总和
        for (let i = 0; i < result.length; i++) {
            let sum = 0
            for (let j = 0; j < patches.length; j++) {
                sum += patches[j][i] * (weights[j] / weightSum)
            }
            result[i] = sum
        }

        return result
    }

    /**
     * 为单个采样点生成图像对
     * 核心功能：根据elevation和采样点位置，生成AI需要的两张融合图像
     */
    static generateImagePairForPoint(
        elevation: number,           // 当前层高
        point: SamplingPoint,        // 采样点坐标(x,y)
        availableElevations: number[] // 所有可用的切片层高
    ): { extraImage: Float32Array, fusedImage: Float32Array } | null {

        // 1. 生成extra_image：向上取最多2张图
        const upperElevations = availableElevations
            .filter(e => e >= elevation)  // 大于等于当前elevation
            .sort((a, b) => a - b)        // 从小到大排序
            .slice(0, 2)                  // 只取前2张

        if (upperElevations.length === 0) {
            console.warn(`[ImageProcessor] elevation=${elevation}无法找到向上的切片`)
            return null
        }

        // 从每张切片中裁剪出指定位置的256x256图像
        const extraPatches: Float32Array[] = []
        for (const elev of upperElevations) {
            const canvas = SlicerService.getSlice(elev)
            if (canvas) {
                const patch = this.extractPatch(canvas, point.x, point.y)
                extraPatches.push(patch)
            }
        }

        if (extraPatches.length === 0) return null

        // 如果只有1张图，直接用；如果有2张，求平均
        const extraImage = extraPatches.length === 1
            ? extraPatches[0]
            : this.mergePatches(extraPatches)

        // 2. 生成fused_image：向下取8张图
        const lowerElevations = availableElevations
            .filter(e => e < elevation)   // 小于当前elevation
            .sort((a, b) => b - a)        // 从大到小排序（离当前层近的优先）

        const fusedPatches: Float32Array[] = []

        // 准备8张图：前N张是真实切片，后面用黑图补齐
        for (let i = 0; i < 8; i++) {
            if (i < lowerElevations.length) {
                const canvas = SlicerService.getSlice(lowerElevations[i])
                if (canvas) {
                    fusedPatches.push(this.extractPatch(canvas, point.x, point.y))
                } else {
                    fusedPatches.push(new Float32Array(256 * 256))  // 黑图
                }
            } else {
                fusedPatches.push(new Float32Array(256 * 256))      // 黑图
            }
        }

        // 用Beer-Lambert融合
        const fusedImage = this.mergePatchesBeerLambert(fusedPatches)

        return { extraImage, fusedImage }
    }
}