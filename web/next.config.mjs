/** @type {import('next').NextConfig} */
const nextConfig = {
  // lib/ lives outside web/ and is plain CommonJS; it is imported by route
  // handlers only, never by client components. This keeps the agent runtime
  // in one place shared by the Express app and the Next app during migration.
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
  serverExternalPackages: ['pdf-parse', 'mammoth', 'firebase-admin', 'archiver'],
};
export default nextConfig;
