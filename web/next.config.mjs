/** @type {import('next').NextConfig} */
const nextConfig = {
  // core/ is the agent runtime: plain CommonJS, imported by route handlers
  // only, never by client components. It lives inside web/ so Vercel traces
  // and installs it from the project root directory.
  serverExternalPackages: ['pdf-parse', 'mammoth', 'firebase-admin', 'archiver'],
};
export default nextConfig;
