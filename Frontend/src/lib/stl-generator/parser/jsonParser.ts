import fs from 'node:fs'
import { ChipJSON } from '../model/types'

export function readDesignJson(filepath: string): ChipJSON {
    const txt = fs.readFileSync(filepath, 'utf-8')
    return JSON.parse(txt) as ChipJSON
}
