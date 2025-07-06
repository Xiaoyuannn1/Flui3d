import { aiService, PredictionResult } from './aiService'
import { ImageProcessor, SamplingPoint } from './imageProcessor'
import { SlicerService } from './slicerService'
import { EdgeDetectionService, EdgeDetectionResult, Shape } from './edgeDetectionService'
import { useContentStore } from '@/stores/content'
import { VoronoiService, VoronoiResult } from './voronoiService'
import { VoronoiCompensationData, VoronoiCompensationRegion } from '@/lib/stl-generator/builder/shapes/voronoiCompensation'


export interface AIPredictionProgress {
    stage: 'loading' | 'processing' | 'predicting' | 'completed' | 'error'
    message: string
    progress?: number  // 0-100
}

export class AIPredictionService {
    private static isInitialized = false
    private static shapeHeightData: Map<number, number[]> = new Map()

    static async initialize(progressCallback?: (progress: AIPredictionProgress) => void): Promise<void> {
        if (this.isInitialized) {
            return
        }

        try {
            progressCallback?.({
                stage: 'loading',
                message: 'Loading AI model...',
                progress: 0
            })

            await aiService.loadModel()
            this.isInitialized = true

            progressCallback?.({
                stage: 'completed',
                message: 'AI model loaded successfully!',
                progress: 100
            })

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)

            progressCallback?.({
                stage: 'error',
                message: `Failed to load AI model: ${errorMessage}`
            })

            throw error
        }
    }
    /**
     * Main prediction pipeline: edge detection, shape height analysis, AI prediction, and Voronoi compensation
     */
    static async performPrediction(
        progressCallback?: (progress: AIPredictionProgress) => void,
        chipJSON?: any
    ): Promise<PredictionResult[]> {

        if (!this.isInitialized || !aiService.isReady()) {
            throw new Error('AI service not initialized, please call initialize() first')
        }

        try {
            progressCallback?.({
                stage: 'processing',
                message: 'Parsing JSON data...',
                progress: 10
            })

            // Parse elevations and precision from JSON
            let elevations: number[] = []
            let precision = 'Medium'

            if (chipJSON && chipJSON.layers && Array.isArray(chipJSON.layers)) {
                elevations = chipJSON.layers.map((layer: any) => layer.elevation)
                console.log(`[AI] Parsed ${elevations.length} elevations from JSON:`, elevations)
            } else {
                elevations = [0, 100]
                console.log(`[AI] No valid JSON provided, using default elevations:`, elevations)
            }

            if (chipJSON && chipJSON.general && chipJSON.general.precision) {
                precision = chipJSON.general.precision
                console.log(`[AI] Parsed precision from JSON: ${precision}`)
            } else {
                console.log(`[AI] Precision not found, using default: ${precision}`)
            }

            const availableElevations = SlicerService.getAvailableElevations()

            // Edge detection
            console.log(`[AI] Starting edge detection for ${elevations.length} elevations...`)
            const edgeResults: EdgeDetectionResult[] = []

            for (const elevation of elevations) {
                const canvas = SlicerService.getSlice(elevation)
                if (canvas) {
                    try {
                        const result = EdgeDetectionService.detectEdges(canvas, elevation)
                        edgeResults.push(result)
                    } catch (error) {
                        console.error(`[EdgeDetection] Failed for elevation ${elevation}:`, error)
                    }
                }
            }

            // Shape height detection
            console.log(`[AI] Starting shape height detection...`)
            await this.detectShapeHeights(edgeResults, availableElevations, precision)

            // Generate sampling points
            const firstElevation = availableElevations[0]
            const firstCanvas = SlicerService.getSlice(firstElevation)
            if (!firstCanvas) {
                throw new Error('Cannot get slice canvas dimensions')
            }
            const allSamplingPoints = ImageProcessor.generateSamplingPoints(firstCanvas.width, firstCanvas.height, precision)

            progressCallback?.({
                stage: 'predicting',
                message: `Starting AI prediction...`,
                progress: 30
            })

            const allResults: PredictionResult[] = []
            let completedCount = 0
            // AI prediction loop
            for (let elevationIndex = 0; elevationIndex < elevations.length; elevationIndex++) {
                const elevation = elevations[elevationIndex]

                // Filter valid sampling points
                const edgeResult = edgeResults.find(r => r.elevation === elevation)
                const validSamplingPoints = this.filterValidSamplingPoints(allSamplingPoints, edgeResult)

                console.log(`[AI] Elevation ${elevation}: filtered from ${allSamplingPoints.length} to ${validSamplingPoints.length} valid points`)

                // Recalculate total predictions
                const totalPredictions = elevations.reduce((sum, elev) => {
                    const elevEdgeResult = edgeResults.find(r => r.elevation === elev)
                    const validPoints = this.filterValidSamplingPoints(allSamplingPoints, elevEdgeResult)
                    return sum + validPoints.length
                }, 0)

                for (let pointIndex = 0; pointIndex < validSamplingPoints.length; pointIndex++) {
                    const point = validSamplingPoints[pointIndex]

                    try {
                        const imagePair = ImageProcessor.generateImagePairForPoint(
                            elevation,
                            point,
                            availableElevations
                        )

                        if (!imagePair) {
                            console.warn(`[AI] Skipping elevation=${elevation}, point=(${point.x}, ${point.y})`)
                            completedCount++
                            continue
                        }

                        const prediction = await aiService.predictSingle(
                            imagePair.fusedImage,
                            imagePair.extraImage
                        )

                        allResults.push({
                            x: point.x,
                            y: point.y,
                            prediction: prediction
                        })

                        // Show shape info
                        let shapeInfo = ''
                        if (edgeResult) {
                            for (let i = 0; i < edgeResult.shapes.length; i++) {
                                if (EdgeDetectionService.isPointInShape(point.x, point.y, edgeResult.shapes[i])) {
                                    shapeInfo = ` [in shape ${i}]`
                                    break
                                }
                            }
                        }

                        // Calculate compensation value
                        let compensationInfo = ''
                        if (edgeResult && shapeInfo) {  // 如果点在某个形状内
                            for (let i = 0; i < edgeResult.shapes.length; i++) {
                                if (EdgeDetectionService.isPointInShape(point.x, point.y, edgeResult.shapes[i])) {
                                    const shapeHeights = this.shapeHeightData.get(elevation)
                                    if (shapeHeights && shapeHeights[i] !== undefined) {
                                        const compensation = shapeHeights[i] * (prediction - 1)
                                        compensationInfo = ` [compensation: ${compensation.toFixed(1)}μm]`
                                    }
                                    break
                                }
                            }
                        }
                        // Output progress every 50 points
                        if ((pointIndex + 1) % 50 === 0) {
                            console.log(`[AI] Elevation ${elevation}: processed ${pointIndex + 1}/${validSamplingPoints.length} points`)
                            console.log(`[AI] Elevation ${elevation} current Point (${point.x.toString().padStart(4)}, ${point.y.toString().padStart(4)}): Z_metric_pred = ${prediction.toFixed(6)}${shapeInfo}${compensationInfo}`)
                        }


                    } catch (error) {
                        console.error(`[AI] Prediction failed for elevation=${elevation}, point=(${point.x}, ${point.y}):`, error)
                        allResults.push({
                            x: point.x,
                            y: point.y,
                            prediction: 0.0
                        })
                    }

                    completedCount++

                    if (completedCount % 10 === 0) {
                        const progress = 30 + (completedCount / totalPredictions) * 60
                        progressCallback?.({
                            stage: 'predicting',
                            message: `AI prediction in progress... (${completedCount}/${totalPredictions})`,
                            progress: Math.round(progress)
                        })
                    }
                }
            }


            edgeResults.forEach(result => {
                const totalArea = result.shapes.reduce((sum, s) => sum + s.area, 0)
                console.log(`[EdgeDetection] Elevation ${result.elevation}: ${result.totalShapes} shapes, total area ${totalArea.toFixed(0)} pixels²`)
            })



            console.log(`[AI]️ Starting to collect Voronoi compensation data...`)

            const voronoiCompensationData = await this.collectVoronoiCompensationData(
                edgeResults,
                allResults,
                availableElevations,
                precision
            )

            if (voronoiCompensationData.length > 0) {
                console.log(`[AI] Starting to regenerate STL with Voronoi compensation...`)

                try {
                    const contentStore = useContentStore()

                    // 重新生成包含Voronoi补偿的STL
                    await contentStore.requestNewStlData(
                        precision,
                        false,
                        0,
                        false,
                        0,
                        0,
                        0,
                        0,
                        true,
                        voronoiCompensationData
                    )

                    console.log(`[AI] Voronoi compensation STL generation completed! Frontend preview updated`)

                } catch (error) {
                    console.error(`[AI] Failed to generate Voronoi compensation STL:`, error)
                }
            } else {
                console.log(`[AI] No Voronoi regions need compensation, keeping original STL`)
            }

            progressCallback?.({
                stage: 'completed',
                message: `AI prediction + Voronoi compensation STL generation completed!`,
                progress: 100
            })

            console.log(`[AI] Starting to generate Voronoi division visualization...`)
            await this.generateVoronoiVisualizations(edgeResults, allResults, availableElevations, precision)

            return allResults

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('[AI] Prediction process failed:', error)

            progressCallback?.({
                stage: 'error',
                message: `AI prediction failed: ${errorMessage}`
            })

            throw error
        }
    }
    /**
     * Collect Voronoi compensation data for STL generation
     */
    private static async collectVoronoiCompensationData(
        edgeResults: EdgeDetectionResult[],
        allResults: PredictionResult[],
        availableElevations: number[],
        precision: string
    ): Promise<VoronoiCompensationData[]> {

        const voronoiCompensationData: VoronoiCompensationData[] = []

        for (const edgeResult of edgeResults) {
            const elevation = edgeResult.elevation

            if (edgeResult.shapes.length === 0) continue

            console.log(`[AI] Collecting Voronoi compensation data for elevation ${elevation}...`)

            const canvas = SlicerService.getSlice(elevation)
            if (!canvas) continue

            // Collect all valid points and compensation values for current elevation
            const elevationValidPoints: Array<{x: number, y: number, compensation: number}> = []

            allResults.forEach(result => {
                for (let shapeIndex = 0; shapeIndex < edgeResult.shapes.length; shapeIndex++) {
                    if (EdgeDetectionService.isPointInShape(result.x, result.y, edgeResult.shapes[shapeIndex])) {
                        const shapeHeights = this.shapeHeightData.get(elevation)
                        if (shapeHeights && shapeHeights[shapeIndex] !== undefined) {
                            // Calculate compensation: shape height × (prediction - 1)
                            const compensation = shapeHeights[shapeIndex] * (result.prediction - 1)
                            const compensationCeiled = Math.ceil(Math.abs(compensation))

                            if (compensationCeiled > 0) {
                                elevationValidPoints.push({
                                    x: result.x,
                                    y: result.y,
                                    compensation: compensationCeiled
                                })
                            }
                        }
                        break
                    }
                }
            })

            if (elevationValidPoints.length === 0) continue

            // Perform Voronoi division for each shape
            const allVoronoiRegions: VoronoiCompensationRegion[] = []

            edgeResult.shapes.forEach((shape, shapeIndex) => {
                const shapePoints = elevationValidPoints.filter(point =>
                    EdgeDetectionService.isPointInShape(point.x, point.y, shape)
                )

                if (shapePoints.length === 0) return

                console.log(`[AI] Shape ${shapeIndex}: ${shapePoints.length} compensation points`)

                const voronoiCells = VoronoiService.divideShape(
                    shapePoints,
                    shape,
                    canvas.width,
                    canvas.height
                )

                voronoiCells.forEach(cell => {
                    allVoronoiRegions.push({
                        polygon: cell.polygon,
                        compensation: cell.compensation,
                        seedPoint: cell.seedPoint,
                        canvasHeight: canvas.height
                    })
                })
            })

            if (allVoronoiRegions.length > 0) {
                voronoiCompensationData.push({
                    elevation: elevation,
                    regions: allVoronoiRegions
                })

                console.log(`[AI] Elevation ${elevation}: collected ${allVoronoiRegions.length} Voronoi compensation regions`)
            }
        }

        const totalRegions = voronoiCompensationData.reduce((sum, data) => sum + data.regions.length, 0)
        console.log(`[AI] Total collected ${totalRegions} Voronoi compensation regions`)

        return voronoiCompensationData
    }


    /**
     * Generate Voronoi visualizations for all elevations
     */
    private static async generateVoronoiVisualizations(
        edgeResults: EdgeDetectionResult[],
        allResults: PredictionResult[],
        availableElevations: number[],
        precision: string
    ): Promise<void> {

        for (const edgeResult of edgeResults) {
            const elevation = edgeResult.elevation

            if (edgeResult.shapes.length === 0) {
                console.log(`[Voronoi] Elevation ${elevation} has no shapes, skipping`)
                continue
            }

            console.log(`[Voronoi] Processing elevation ${elevation}...`)

            const canvas = SlicerService.getSlice(elevation)
            if (!canvas) {
                console.warn(`[Voronoi] Cannot get slice for elevation ${elevation}`)
                continue
            }

            // Collect all valid points and compensation values for current elevation
            const elevationValidPoints: Array<{x: number, y: number, compensation: number}> = []

            allResults.forEach(result => {
                for (let shapeIndex = 0; shapeIndex < edgeResult.shapes.length; shapeIndex++) {
                    if (EdgeDetectionService.isPointInShape(result.x, result.y, edgeResult.shapes[shapeIndex])) {
                        const shapeHeights = this.shapeHeightData.get(elevation)
                        if (shapeHeights && shapeHeights[shapeIndex] !== undefined) {
                            const compensation = shapeHeights[shapeIndex] * (result.prediction - 1)
                            elevationValidPoints.push({
                                x: result.x,
                                y: result.y,
                                compensation: Math.round(compensation * 10) / 10
                            })
                        }
                        break
                    }
                }
            })

            if (elevationValidPoints.length === 0) {
                console.log(`[Voronoi] Elevation ${elevation} has no valid points, skipping`)
                continue
            }

            // Perform Voronoi division for each shape separately
            const voronoiResult: VoronoiResult = {
                elevation: elevation,
                shapes: []
            }

            edgeResult.shapes.forEach((shape, shapeIndex) => {
                const shapePoints = elevationValidPoints.filter(point =>
                    EdgeDetectionService.isPointInShape(point.x, point.y, shape)
                )

                if (shapePoints.length === 0) return

                console.log(`[Voronoi] Shape ${shapeIndex}: ${shapePoints.length} valid points`)

                const voronoiCells = VoronoiService.divideShape(
                    shapePoints,
                    shape,
                    canvas.width,
                    canvas.height
                )

                voronoiResult.shapes.push({
                    shapeIndex: shapeIndex,
                    cells: voronoiCells
                })
            })

            // Generate visualization image
            VoronoiService.generateVoronoiVisualization(
                canvas,
                voronoiResult,
                elevationValidPoints
            )
        }

        console.log(`[AI] Voronoi visualization generation completed`)
    }


    /**
     * Filter valid sampling points within detected shapes
     */
    private static filterValidSamplingPoints(
        allPoints: SamplingPoint[],
        edgeResult: EdgeDetectionResult | undefined
    ): SamplingPoint[] {
        if (!edgeResult || edgeResult.shapes.length === 0) {
            console.warn('[AI] No shapes detected, returning all sampling points')
            return allPoints
        }

        const validPoints: SamplingPoint[] = []
        const shapePointCounts: number[] = new Array(edgeResult.shapes.length).fill(0)

        // Collect all valid points within shapes
        allPoints.forEach(point => {
            let isInAnyShape = false

            edgeResult.shapes.forEach((shape, shapeIndex) => {
                if (EdgeDetectionService.isPointInShape(point.x, point.y, shape)) {
                    if (!isInAnyShape) {
                        validPoints.push(point)
                        isInAnyShape = true
                    }
                    shapePointCounts[shapeIndex]++
                }
            })
        })

        // Output point count statistics for each shape
        console.log(`[AI] Valid point count for each shape:`)
        edgeResult.shapes.forEach((shape, index) => {
            console.log(`[AI]   Shape ${index}: ${shapePointCounts[index]} points`)
        })

        // Select and output 5 dispersed points for each shape (for display only)
        // console.log(`[AI] 5 dispersed representative points for each shape:`)
        // edgeResult.shapes.forEach((shape, shapeIndex) => {
        //     const candidatePoints: SamplingPoint[] = []
        //     allPoints.forEach(point => {
        //         if (EdgeDetectionService.isPointInShape(point.x, point.y, shape)) {
        //             candidatePoints.push(point)
        //         }
        //     })
        //
        //     if (candidatePoints.length === 0) {
        //         console.log(`[AI]   Shape ${shapeIndex}: no candidate points`)
        //         return
        //     }
        //
        //     const dispersedPoints = this.selectDispersedPoints(candidatePoints, shape, 5)
        //     const coordsStr = dispersedPoints.map(p => `(${p.x},${p.y})`).join(', ')
        //     console.log(`[AI]   Shape ${shapeIndex}: ${coordsStr}`)
        // })

        const filterRatio = ((allPoints.length - validPoints.length) / allPoints.length * 100).toFixed(1)
        console.log(`[AI] Filtered out ${allPoints.length - validPoints.length} background points, saved ${filterRatio}% prediction time`)

        return validPoints
    }
    /**
     * 使用贪心算法选择分散的点
     */
    private static selectDispersedPoints(
        candidatePoints: SamplingPoint[],
        shape: Shape,
        targetCount: number
    ): SamplingPoint[] {
        if (candidatePoints.length <= targetCount) {
            return [...candidatePoints]
        }

        const selectedPoints: SamplingPoint[] = []
        const remainingPoints = [...candidatePoints]

        // 1. 选择第一个点：距离形状几何中心最近的点
        const shapeCenterX = shape.outer.reduce((sum, p) => sum + p.x, 0) / shape.outer.length
        const shapeCenterY = shape.outer.reduce((sum, p) => sum + p.y, 0) / shape.outer.length

        let firstPointIndex = 0
        let minDistanceToCenter = Infinity

        remainingPoints.forEach((point, index) => {
            const distance = this.calculateDistance(point.x, point.y, shapeCenterX, shapeCenterY)
            if (distance < minDistanceToCenter) {
                minDistanceToCenter = distance
                firstPointIndex = index
            }
        })

        selectedPoints.push(remainingPoints[firstPointIndex])
        remainingPoints.splice(firstPointIndex, 1)

        // 2. 贪心选择剩余点：每次选择距离已选点最远的点
        for (let i = 1; i < targetCount && remainingPoints.length > 0; i++) {
            let bestPointIndex = 0
            let maxMinDistance = -1

            remainingPoints.forEach((candidate, candidateIndex) => {
                let minDistanceToSelected = Infinity
                selectedPoints.forEach(selectedPoint => {
                    const distance = this.calculateDistance(
                        candidate.x, candidate.y,
                        selectedPoint.x, selectedPoint.y
                    )
                    minDistanceToSelected = Math.min(minDistanceToSelected, distance)
                })

                if (minDistanceToSelected > maxMinDistance) {
                    maxMinDistance = minDistanceToSelected
                    bestPointIndex = candidateIndex
                }
            })

            selectedPoints.push(remainingPoints[bestPointIndex])
            remainingPoints.splice(bestPointIndex, 1)
        }

        return selectedPoints
    }


    private static calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    }

    /**
     * Detect height of each shape by analyzing slice layers
     */
    private static async detectShapeHeights(
        edgeResults: EdgeDetectionResult[],
        availableElevations: number[],
        precision: string
    ): Promise<void> {

        for (const edgeResult of edgeResults) {
            const baseElevation = edgeResult.elevation
            console.log(`[ShapeHeight] Detecting shape heights for elevation ${baseElevation}...`)

            if (edgeResult.shapes.length === 0) {
                console.log(`[ShapeHeight] Elevation ${baseElevation} has no shapes, skipping`)
                continue
            }

            const shapeHeights: number[] = []

            for (let shapeIndex = 0; shapeIndex < edgeResult.shapes.length; shapeIndex++) {
                const shape = edgeResult.shapes[shapeIndex]

                // Collect candidate points within current shape
                const firstCanvas = SlicerService.getSlice(baseElevation)
                if (!firstCanvas) continue

                const allSamplingPoints = ImageProcessor.generateSamplingPoints(firstCanvas.width, firstCanvas.height, precision)
                const candidatePoints: SamplingPoint[] = []
                allSamplingPoints.forEach(point => {
                    if (EdgeDetectionService.isPointInShape(point.x, point.y, shape)) {
                        candidatePoints.push(point)
                    }
                })

                // Select 5 dispersed points
                const dispersedPoints = this.selectDispersedPoints(candidatePoints, shape, 5)

                if (dispersedPoints.length === 0) {
                    shapeHeights.push(0)
                    continue
                }

                // Detect height along Z direction
                const shapeHeight = this.detectSingleShapeHeight(
                    dispersedPoints,
                    baseElevation,
                    availableElevations
                )
                shapeHeights.push(shapeHeight)
            }

            // Save shape height data
            this.shapeHeightData.set(baseElevation, shapeHeights)

            // Output results
            console.log(`[ShapeHeight] Shape height results for elevation ${baseElevation}:`)
            edgeResult.shapes.forEach((shape, index) => {
                const startElev = baseElevation
                const endElev = baseElevation + shapeHeights[index] - 100
                console.log(`[ShapeHeight]   Shape ${index}: height ${shapeHeights[index]}μm (from elevation ${startElev} to ${endElev})`)
            })
        }
    }


    /**
     * Detect height of single shape by checking pixel colors across elevations
     */
    private static detectSingleShapeHeight(
        dispersedPoints: SamplingPoint[],
        baseElevation: number,
        availableElevations: number[]
    ): number {
        console.log(`[ShapeHeight] Starting shape height detection, base elevation: ${baseElevation}`)
        console.log(`[ShapeHeight] Detection point coordinates: ${dispersedPoints.map(p => `(${p.x},${p.y})`).join(', ')}`)

        // Get all slices from baseElevation upward
        const upperElevations = availableElevations
            .filter(elev => elev >= baseElevation)
            .sort((a, b) => a - b)

        console.log(`[ShapeHeight] Available upper elevations: ${upperElevations.join(', ')}`)

        let lastValidElevation = baseElevation

        // Check layer by layer
        for (const elevation of upperElevations) {
            console.log(`[ShapeHeight] Checking elevation ${elevation}...`)

            const canvas = SlicerService.getSlice(elevation)
            if (!canvas) {
                console.log(`[ShapeHeight] Slice for elevation ${elevation} does not exist, skipping`)
                continue
            }

            // Check if all 5 dispersed points are black
            const allPointsBlack = this.areAllPointsBlack(dispersedPoints, canvas)

            if (allPointsBlack) {
                lastValidElevation = elevation
                console.log(`[ShapeHeight] Elevation ${elevation}: all points are black ✓`)
            } else {
                console.log(`[ShapeHeight] Elevation ${elevation}: found white pixels ✗, stopping detection`)
                break
            }
        }

        const height = lastValidElevation - baseElevation + 100
        console.log(`[ShapeHeight] Calculated height: ${lastValidElevation} - ${baseElevation} + 100 = ${height}μm`)

        return height
    }

    /**
     * 检查所有点是否都是黑色像素
     */
    private static areAllPointsBlack(points: SamplingPoint[], canvas: HTMLCanvasElement): boolean {
        const ctx = canvas.getContext('2d')!

        for (const point of points) {
            // 1. 确保点在画布范围内
            if (point.x < 0 || point.x >= canvas.width || point.y < 0 || point.y >= canvas.height) {
                console.log(`[ShapeHeight] Point (${point.x}, ${point.y}) is out of canvas bounds, skipping`)
                continue
            }

            // 2. 获取该点的像素颜色
            const imageData = ctx.getImageData(point.x, point.y, 1, 1)
            const [r, g, b, a] = imageData.data  // RGBA四个值

            // 3. 计算灰度值（RGB平均值）
            const grayValue = (r + g + b) / 3

            // 4. 判断是否为黑色
            const isBlack = grayValue < 128  // 小于128认为是黑色

            //console.log(`[ShapeHeight] Point (${point.x}, ${point.y}): RGB(${r},${g},${b}) = gray ${grayValue.toFixed(1)} → ${isBlack ? 'black' : 'white'}`)

            if (!isBlack) {
                console.log(`[ShapeHeight] Found white pixel at (${point.x}, ${point.y}), stopping detection`)
                return false
            }
        }

        return true  // 所有点都是黑色
    }


    static cleanup(): void {
        SlicerService.clearSavedSlices()
    }

    static getStatus(): { initialized: boolean, ready: boolean, message: string } {
        if (!this.isInitialized) {
            return { initialized: false, ready: false, message: 'Not initialized' }
        }

        if (!aiService.isReady()) {
            return { initialized: true, ready: false, message: 'Model not loaded' }
        }

        return { initialized: true, ready: true, message: 'Ready' }
    }
}