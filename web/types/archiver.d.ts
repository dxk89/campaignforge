/**
 * archiver ships CommonJS with a callable module export. Its published types
 * declare a namespace that is not callable under ESM module resolution, which
 * makes real usage untypeable. We use only create, pipe, append and finalize,
 * so declare exactly that.
 */
declare module 'archiver' {
  import { Readable } from 'stream';
  interface Archiver extends Readable {
    pipe(dest: NodeJS.WritableStream): NodeJS.WritableStream;
    append(source: Buffer | string | Readable, opts: { name: string }): Archiver;
    finalize(): Promise<void>;
  }
  function archiver(format: 'zip' | 'tar', options?: { zlib?: { level?: number } }): Archiver;
  export default archiver;
}
