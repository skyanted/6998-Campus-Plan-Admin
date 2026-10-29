import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand,safeReturn,ranking,upcoming} from '../lib/domain.ts';
import {nyInput,nyToISO} from '../lib/plan.ts';
test('Delete and cancel require no reason or typed confirmation',()=>{for(const action of ['delete','cancel'])assert.equal(parseCommand({action,gid:1,revision:'test'}).action,action);});
test('Commands reject invalid actions, ids, revision and empty hosting details',()=>{for(const command of [{action:'update-profile',gid:1,revision:''},{action:'delete',gid:-1,revision:''},{action:'delete',gid:1.5,revision:''},{action:'delete',gid:1,revision:0},{action:'host',gid:1,revision:'',hostingDetails:'   '}])assert.throws(()=>parseCommand(command));});
test('Return paths cannot redirect outside the app',()=>{for(const url of ['https://evil.example','//evil.example','/\\evil.example','/unknown','/events/1\n'])assert.equal(safeReturn(url),'/');assert.equal(safeReturn('/events?tab=drafts'),'/events?tab=drafts');});
test('Upcoming ranking excludes cancelled, started and past events, then breaks score ties',()=>{const now=Date.parse('2026-10-22T12:00:00Z');const base={starts_at:'2026-10-23T12:00:00Z',hosting_status:'undecided',published_at:'2026-10-20T12:00:00Z'};const events=[{...base,id:4,upvotes:8,downvotes:3},{...base,id:2,upvotes:5,downvotes:0},{...base,id:1,upvotes:5,downvotes:0},{...base,id:3,upvotes:100,downvotes:0,hosting_status:'cancelled'},{...base,id:5,upvotes:200,downvotes:0,starts_at:'2026-10-21T12:00:00Z'}];assert.deepEqual(events.filter(event=>upcoming(event,now)).sort(ranking).map(event=>event.id),[4,1,2]);});
test('New York dates support past and future, including DST validation',()=>{for(const date of ['2026-01-15T20:00','2026-07-15T20:00','2027-01-15T20:00'])assert.equal(nyInput(nyToISO(date)),date);assert.throws(()=>nyToISO('2026-03-08T02:30'));});

test('Week 7 return destinations remain inside the protected admin routes',()=>{for(const path of ['/terms','/prompt-mix','/generation-requests?record=2','/llm-responses','/images','/signup-domains','/whitelisted-emails'])assert.equal(safeReturn(path),path);assert.equal(safeReturn('/terms/../../auth/callback'),'/');});
