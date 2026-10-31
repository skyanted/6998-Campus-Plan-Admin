/* eslint-disable @next/next/no-img-element -- Protected image endpoint. */
'use client';
import {useEffect,useRef,useState} from 'react';
import type {Row} from '@/lib/week7';
import ImagePlaceholder from './image-placeholder';
import styles from './image-viewer.module.css';
export default function ImageViewer({image,close}:{image:Row;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[failed,setFailed]=useState(image.available===false);
 useEffect(()=>{const dialog=ref.current,overflow=document.body.style.overflow,focus=document.activeElement;dialog?.showModal();document.body.style.overflow='hidden';return()=>{dialog?.close();document.body.style.overflow=overflow;if(focus instanceof HTMLElement)focus.focus();};},[]);
 return <dialog ref={ref} className={styles.dialog} aria-label={String(image.label??'Image preview')} onCancel={event=>{event.preventDefault();close();}}><button type="button" className={styles.close} aria-label="Close image preview" onClick={close}>×</button><div className={styles.content}><div className={styles.picture}>{failed?<ImagePlaceholder large/>:<img alt={String(image.alt_text||image.label||'Image')} src={'/api/admin/image?bucket='+encodeURIComponent(String(image.bucket))+'&path='+encodeURIComponent(String(image.path))} onError={()=>setFailed(true)}/>}</div><aside className={styles.description}><p>{String(image.alt_text??'').trim()||'No description.'}</p></aside></div></dialog>;
}
