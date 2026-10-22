import SignOut from '@/app/components/sign-out';
import Link from 'next/link';
export default function Forbidden(){return <main className="auth-page"><section className="auth-card"><span className="eyebrow">Campus plans Admin</span><h1>Admin access required.</h1><p>This account is not approved for the admin area. Sign in with an authorized Google account.</p><SignOut alternate/><Link className="text-link" href="/login">Back to sign in</Link></section></main>;}
