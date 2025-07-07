import JSZip from 'jszip'

export class DownloadService {
    //打包下载zip
    static async downloadSlicesAsZip(
        sliceImages: Blob[],
        sliceInfo: { zValue: number; filename: string }[],
        zipFilename = 'slices.zip'
    ): Promise<void> {
        const zip = new JSZip()

        // 添加所有切片图片到ZIP
        sliceImages.forEach((blob, index) => {
            const filename = sliceInfo[index].filename
            zip.file(filename, blob)
        })

        const zipBlob = await zip.generateAsync({ type: 'blob' })

        this.downloadBlob(zipBlob, zipFilename)
    }


    static downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }
}