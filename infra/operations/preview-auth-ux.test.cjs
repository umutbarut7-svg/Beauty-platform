
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {stripTypeScriptTypes} = require('node:module');
const app=fs.readFileSync(process.argv[2] || 'preview-App.tsx','utf8');
const source=app.slice(app.indexOf('  async function authenticate('),app.indexOf('  async function choose('));
class ApiError extends Error { constructor(status) {super();this.status=status;} }
async function check(label, {email='synthetic@example.test',password='synthetic-long-password',mode='register',status,valid=true,notice}, expectedCalls) {
 let calls=0, message='', user=null, cleared=false, normalized=false;
 const api={signIn:async(m,e,p)=>{calls++;normalized=e==='synthetic@example.test';if(status)throw new ApiError(status);return {id:'synthetic',role:'CUSTOMER'};}};
 const fn=new Function('api','ApiError','email','password','reset','setNotice','setPassword','setUser',stripTypeScriptTypes(source)+';return authenticate;')(api,ApiError,email,password,()=>{},s=>message=s,()=>cleared=true,u=>user=u);
 await fn(mode);
 assert.equal(calls,expectedCalls);
 if(notice)assert.ok(message.includes(notice));
 if(valid&&calls&&!status){assert.ok(user&&cleared&&normalized);}
 console.log(label+': PASS');
}
(async()=>{
 await check('Short registration blocked before HTTP',{password:'short',valid:false,notice:'12 karakter'},0);
 await check('Invalid email blocked before HTTP',{email:'invalid',valid:false,notice:'e-posta'},0);
 await check('Email normalized and successful session set',{email:' Synthetic@Example.Test '},1);
 await check('Login wrong credentials actionable',{mode:'login',status:401,notice:'E-posta veya şifre'},1);
 await check('Duplicate registration actionable',{status:409,notice:'zaten kayıtlı'},1);
 await check('Throttling actionable',{status:429,notice:'Bir dakika'},1);
 await check('Login does not reject legacy short passwords locally',{mode:'login',password:'short'},1);
})().catch(()=>{console.error('Auth UX regression failed');process.exitCode=1;});

