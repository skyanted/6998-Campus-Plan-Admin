'use client';
import {useState} from 'react';
import {Spinner} from './loading-indicator';
export default function SignOut({alternate=false}:{alternate?:boolean}){
 const [pending,setPending]=useState(false);
 return <form action="/auth/signout" method="post" onSubmit={()=>setPending(true)}><button className={'button '+(alternate?'primary':'subtle')} disabled={pending} aria-busy={pending}>{pending?<Spinner/>:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v16h5m5-12 4 4-4 4m-7-4h11"/></svg>}{pending?'Signing out…':alternate?'Use another account':'Sign out'}</button></form>;
}
