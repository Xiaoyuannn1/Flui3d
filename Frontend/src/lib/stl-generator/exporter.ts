// @ts-ignore
import { serialize } from '@jscad/stl-serializer'
import fs from 'node:fs/promises'


export async function writeStl(model: any, outPath: string){
    const ascii = serialize({ binary:false }, model).join('')
    await fs.writeFile(outPath, ascii)
}
