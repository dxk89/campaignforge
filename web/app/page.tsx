import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  redirect((await currentSession()) ? '/clients' : '/login');
}
