import createSlicer from 'mesh-slice-polygon'
import { DownloadService } from './downloadService'

export interface SliceResult {
    sliceImages: Blob[]
    sliceInfo: {
        zValue: number
        filename: string
    }[]
}


export interface AISliceResult extends SliceResult {
    slice0Canvas?: HTMLCanvasElement
    slice100Canvas?: HTMLCanvasElement
}

export class SlicerService {

    private static allSlices: Map<number, HTMLCanvasElement> = new Map()
    // Generate slice images from STL Array
    static async generateSlices(
        stlData: ArrayBuffer,
        zStep = 100.5,
        // canvasWidth = 2560,
        // canvasHeight = 1620,
        scaleFactor = 10
    ): Promise<AISliceResult> {

        const triangles = this.parseSTLBuffer(stlData)

        const slicer = createSlicer()

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
        const canvasWidth = (xMax - xMin) / scaleFactor
        const canvasHeight = (yMax - yMin) / scaleFactor
        //console.log('[SlicerService]  边界框:', { xMin, xMax, yMin, yMax, zMin, zMax })

        const contentW = (xMax - xMin) / scaleFactor
        const contentH = (yMax - yMin) / scaleFactor
        const padX = (canvasWidth - contentW) / 2
        const padY = (canvasHeight - contentH) / 2


        const sliceImages: Blob[] = []
        const sliceInfo: { zValue: number; filename: string }[] = []
        let sliceIndex = 0

        for (let z = Math.ceil(zMin / zStep) * zStep; z <= zMax; z += zStep) {

            const polygons = slicer.slice(z)

            const canvas = document.createElement('canvas')
            canvas.width = canvasWidth
            canvas.height = canvasHeight
            const ctx = canvas.getContext('2d')!

            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, canvasWidth, canvasHeight)
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

            const sliceCanvas = document.createElement('canvas')
            sliceCanvas.width = canvasWidth
            sliceCanvas.height = canvasHeight
            const sliceCtx = sliceCanvas.getContext('2d')!
            sliceCtx.drawImage(canvas, 0, 0)
            const normalizedElevation = sliceIndex * 100  // 0, 100, 200, 300...
            this.allSlices.set(normalizedElevation, sliceCanvas)

            const blob = await this.canvasToBlob(canvas)
            sliceImages.push(blob)

            const filename = `slice_${normalizedElevation}.png`
            sliceInfo.push({ zValue: normalizedElevation, filename })

            sliceIndex++
        }

        // Download all slices as ZIP
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const zipFilename = `all_slices_${timestamp}.zip`

        const { DownloadService } = await import('./downloadService')
        await DownloadService.downloadSlicesAsZip(sliceImages, sliceInfo, zipFilename)

        console.log(`[SlicerService] Slice generation completed, ${sliceImages.length} slices, ZIP downloaded: ${zipFilename}`)

        return {
            sliceImages,
            sliceInfo
        }
    }


    // Get slice canvas for specified elevation
    static getSlice(elevation: number): HTMLCanvasElement | null {
        return this.allSlices.get(elevation) || null
    }

    // Get all available elevations
    static getAvailableElevations(): number[] {
        return Array.from(this.allSlices.keys()).sort((a, b) => a - b)
    }

    // Clear saved slices to free memory
    static clearSavedSlices(): void {
        this.allSlices.clear()
    }

    // Parse STL ArrayBuffer to triangle array
    private static parseSTLBuffer(buffer: ArrayBuffer): number[][][] {
        const triangles: number[][][] = []
        const decoder = new TextDecoder()
        const text = decoder.decode(buffer)

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

    // Convert Canvas to Blob using browser native API
    private static canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob!)
            }, 'image/png')
        })
    }
}