declare module 'jsmediatags' {
  export interface PictureTag {
    data: ArrayLike<number>
    format?: string
  }

  export interface TagResult {
    tags: {
      picture?: PictureTag
    }
  }

  export interface ReaderOptions {
    onSuccess: (result: TagResult) => void
    onError: () => void
  }

  export class Reader {
    constructor(source: string | Blob)
    setTagsToRead(tags: string[]): this
    read(options: ReaderOptions): void
  }

  const jsmediatags: {
    Reader: typeof Reader
  }

  export default jsmediatags
}

declare module 'jsmediatags/dist/jsmediatags.min.js' {
  import jsmediatags from 'jsmediatags'

  export default jsmediatags
}
