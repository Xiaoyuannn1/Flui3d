
import {SlicerService} from "@/services/slicerService"


export interface SamplingPoint {
    x: number
    y: number
}

export interface ImagePatch {
    data: Float32Array
    x: number
    y: number
}

export class ImageProcessor {
    // Generate sampling points based on canvas size and precision
    static generateSamplingPoints(canvasWidth?: number, canvasHeight?: number, precision?: string): SamplingPoint[] {
        const points: SamplingPoint[] = []

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
                step = 256
        }

        if (canvasWidth && canvasHeight) {
            for (let y = 128; y < canvasHeight; y += step) {
                for (let x = 128; x < canvasWidth; x += step) {
                    points.push({ x, y })
                }
            }
        } else {
            for (let y = 128; y < 1620; y += 256) {
                for (let x = 128; x < 2560; x += 256) {
                    points.push({ x, y })
                }
            }
        }

        console.log(`[ImageProcessor] Generated ${points.length} sampling points, spacing: ${step} pixels`)
        return points

    }
    // Extract 256x256 patch from canvas at specified center point
    static extractPatch(canvas: HTMLCanvasElement, centerX: number, centerY: number): Float32Array {
        const patchSize = 256
        const halfSize = patchSize / 2  // 128

        // Create new Canvas for cropping
        const patchCanvas = document.createElement('canvas')
        patchCanvas.width = patchSize
        patchCanvas.height = patchSize
        const patchCtx = patchCanvas.getContext('2d')!

        // Fill with black for boundary padding
        patchCtx.fillStyle = 'black'
        patchCtx.fillRect(0, 0, patchSize, patchSize)

        const sourceX = centerX - halfSize      // 128 - 128 = 0
        const sourceY = centerY - halfSize      // 128 - 128 = 0
        const sourceWidth = patchSize           // 256
        const sourceHeight = patchSize          // 256

        const destX = Math.max(0, -sourceX)
        const destY = Math.max(0, -sourceY)
        const destWidth = Math.min(patchSize, canvas.width - Math.max(0, sourceX))
        const destHeight = Math.min(patchSize, canvas.height - Math.max(0, sourceY))

        if (destWidth > 0 && destHeight > 0) {
            patchCtx.drawImage(
                canvas,
                Math.max(0, sourceX), Math.max(0, sourceY),
                destWidth, destHeight,
                destX, destY,
                destWidth, destHeight
            )
        }

        const imageData = patchCtx.getImageData(0, 0, patchSize, patchSize)
        const pixels = imageData.data  // RGBA格式

        // Convert to grayscale and normalize to [0,1]
        const floatData = new Float32Array(patchSize * patchSize)
        for (let i = 0; i < floatData.length; i++) {
            const pixelIndex = i * 4
            const grayValue = pixels[pixelIndex]     // 0-255
            floatData[i] = grayValue / 255.0         // [0,1]
        }

        return floatData
    }

    // Extract image patches at all sampling points
    static extractAllPatches(canvas: HTMLCanvasElement): ImagePatch[] {
        const samplingPoints = this.generateSamplingPoints(canvas.width, canvas.height)
        const patches: ImagePatch[] = []

        for (const point of samplingPoints) {
            const patchData = this.extractPatch(canvas, point.x, point.y)
            patches.push({
                data: patchData,
                x: point.x,
                y: point.y
            })
        }

        console.log(`[ImageProcessor] Successfully extracted ${patches.length} 256x256 patches`)
        return patches
    }

    // Convert Blob format image to Canvas
    static async blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = img.width
                canvas.height = img.height

                const ctx = canvas.getContext('2d')!
                ctx.drawImage(img, 0, 0)
                resolve(canvas)
            }
            img.onerror = reject
            img.src = URL.createObjectURL(blob)
        })
    }

    // Convert Float32Array image data to downloadable PNG file
    static downloadPatchAsImage(
        imageData: Float32Array,
        filename: string,
        width = 256,
        height = 256
    ): void {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!

        const imgData = ctx.createImageData(width, height)
        const pixels = imgData.data

        // Float32Array [0,1] to RGBA [0,255]
        for (let i = 0; i < imageData.length; i++) {
            const pixelIndex = i * 4
            const grayValue = Math.round(imageData[i] * 255) // [0,1] → [0,255]

            pixels[pixelIndex] = grayValue     // R
            pixels[pixelIndex + 1] = grayValue // G
            pixels[pixelIndex + 2] = grayValue // B
            pixels[pixelIndex + 3] = 255       // A
        }

        ctx.putImageData(imgData, 0, 0)

        canvas.toBlob((blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = filename
                link.style.display = 'none'

                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(url)

            }
        }, 'image/png')
    }

    // Download image pair from first sampling point
    static downloadFirstSampleImages(
        slice0Patches: ImagePatch[],
        slice100Patches: ImagePatch[]
    ): void {
        if (slice0Patches.length === 0 || slice100Patches.length === 0) {
            return
        }

        const firstSlice0 = slice0Patches[5]
        const firstSlice100 = slice100Patches[5]

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

        this.downloadPatchAsImage(
            firstSlice0.data,
            `slice_0_patch_${firstSlice0.x}_${firstSlice0.y}_${timestamp}.png`
        )

        this.downloadPatchAsImage(
            firstSlice100.data,
            `slice_100_patch_${firstSlice100.x}_${firstSlice100.y}_${timestamp}.png`
        )

    }

    // Simple average fusion of multiple image patches
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

    // Beer-Lambert exponential decay fusion
    static mergePatchesBeerLambert(patches: Float32Array[], alpha = 0.27): Float32Array {
        if (patches.length === 0) return new Float32Array(256 * 256)

        const weights = patches.map((_, i) => Math.exp(-alpha * i))
        const weightSum = weights.reduce((a, b) => a + b, 0)

        const result = new Float32Array(256 * 256)

        for (let i = 0; i < result.length; i++) {
            let sum = 0
            for (let j = 0; j < patches.length; j++) {
                sum += patches[j][i] * (weights[j] / weightSum)
            }
            result[i] = sum
        }

        return result
    }

    // Generate image pair (fused_image + extra_image)
    static generateImagePairForPoint(
        elevation: number,
        point: SamplingPoint,
        availableElevations: number[]
    ): { extraImage: Float32Array, fusedImage: Float32Array } | null {

        // 1. Generate extra_image: take up to 2 images upward
        const upperElevations = availableElevations
            .filter(e => e >= elevation)
            .sort((a, b) => a - b)
            .slice(0, 2)

        if (upperElevations.length === 0) {
            console.warn(`[ImageProcessor] elevation=${elevation} cannot find upward slices`)
            return null
        }

        const extraPatches: Float32Array[] = []
        for (const elev of upperElevations) {
            const canvas = SlicerService.getSlice(elev)
            if (canvas) {
                const patch = this.extractPatch(canvas, point.x, point.y)
                extraPatches.push(patch)
            }
        }

        if (extraPatches.length === 0) return null

        const extraImage = extraPatches.length === 1
            ? extraPatches[0]
            : this.mergePatches(extraPatches)

        // 2. Generate fused_image: take 8 images downward
        const lowerElevations = availableElevations
            .filter(e => e < elevation)
            .sort((a, b) => b - a)

        const fusedPatches: Float32Array[] = []

        // Prepare 8 images: first N are real slices, rest filled with black
        for (let i = 0; i < 8; i++) {
            if (i < lowerElevations.length) {
                const canvas = SlicerService.getSlice(lowerElevations[i])
                if (canvas) {
                    fusedPatches.push(this.extractPatch(canvas, point.x, point.y))
                } else {
                    fusedPatches.push(new Float32Array(256 * 256))
                }
            } else {
                fusedPatches.push(new Float32Array(256 * 256))
            }
        }

        // Fuse with Beer-Lambert
        const fusedImage = this.mergePatchesBeerLambert(fusedPatches)
        return { extraImage, fusedImage }
    }
}