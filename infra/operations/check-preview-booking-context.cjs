
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createRequire,stripTypeScriptTypes}=require('node:module');
const appRequire=createRequire('/repo/apps/api/package.json');
const ts=appRequire('typescript');
const configPath='/repo/apps/api/tsconfig.json';
const config=ts.readConfigFile(configPath,ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(configPath));
for(const name of ['appointments.service','appointment.dto']){
 const input='/repo/apps/api/src/appointments/'+name+'.ts';
 const output='/repo/apps/api/dist/appointments/'+name+'.js';
 const original=fs.readFileSync(output,'utf8');
 assert.ok(original.includes('exports.'),'Expected existing CommonJS production output');
 const result=ts.transpileModule(fs.readFileSync(input,'utf8'),{
  fileName:input,reportDiagnostics:true,
  compilerOptions:{...parsed.options,declaration:false,sourceMap:false,incremental:false},
 });
 for(const d of result.diagnostics||[]) if(d.category===ts.DiagnosticCategory.Error) console.log('Changed-module diagnostic code: '+d.code);
 assert.ok(!(result.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error),'Changed-module compilation diagnostic');
 fs.writeFileSync(output,result.outputText);
}
appRequire('reflect-metadata');
const {AppointmentsService}=appRequire('/repo/apps/api/dist/appointments/appointments.service.js');
const {CreateAppointmentDto}=appRequire('/repo/apps/api/dist/appointments/appointment.dto.js');
const {validateSync}=appRequire('class-validator');
const {plainToInstance}=appRequire('class-transformer');
const text=fs.readFileSync('/repo/apps/api/src/appointments/appointments.service.test.ts','utf8');
const fixtureSource=text.slice(text.indexOf('function fixture('),text.indexOf('describe("AppointmentsService"'));
assert.ok(fixtureSource.includes('ownerCustomer'));
const fixture=new Function('AppointmentsService',stripTypeScriptTypes(fixtureSource)+'; return fixture;')(AppointmentsService);
const owner={id:'owner-user',email:'owner@example.test',role:'CUSTOMER'};
const customer={id:'customer-user',email:'customer@example.test',role:'CUSTOMER'};
const staff={id:'staff-user',email:'staff@example.test',role:'STAFF'};
const body={serviceId:'service',locationId:'location',staffMemberId:'staff-member',startsAt:'2030-01-07T10:00:00.000Z'};
(async()=>{
 let result=await fixture({ownerCustomer:true}).service.create(owner,'business',{...body,bookForSelf:true,internalNote:'ignore-in-customer-context'});
 assert.equal(result.customerId,'owner-customer');assert.equal(result.internalNote,undefined);assert.equal(result.status,'PENDING');
 console.log('Compiled owner self-booking and business-note isolation: PASS');
 await assert.rejects(fixture({ownerCustomer:true}).service.create(owner,'business',body),e=>e.getStatus()===400);
 result=await fixture({ownerCustomer:true}).service.create(owner,'business',{...body,customerId:'customer'});
 assert.equal(result.customerId,'customer');
 console.log('Existing manager customer-selection semantics: PASS');
 await assert.rejects(fixture({ownerCustomer:true}).service.create(owner,'business',{...body,bookForSelf:true,customerId:'customer'}),e=>e.getStatus()===403);
 await assert.rejects(fixture().service.create(owner,'business',{...body,bookForSelf:true}),e=>e.getStatus()===400);
 console.log('Self-booking spoofing and absent customer-profile rejection: PASS');
 await assert.rejects(fixture().service.create(staff,'business',{...body,bookForSelf:true}),e=>e.getStatus()===403);
 result=await fixture().service.create(customer,'business',{...body,bookForSelf:true});assert.equal(result.customerId,'customer');
 await assert.rejects(fixture().service.create(customer,'business',{...body,customerId:'other'}),e=>e.getStatus()===403);
 console.log('Existing staff and customer ownership restrictions: PASS');
 assert.equal(validateSync(plainToInstance(CreateAppointmentDto,{...body,bookForSelf:true})).length,0);
 assert.ok(validateSync(plainToInstance(CreateAppointmentDto,{...body,bookForSelf:'true'})).some(e=>e.property==='bookForSelf'));
 console.log('Compiled DTO rejects boolean string coercion: PASS');
 console.log('Focused compiled booking regression acceptance: PASS');
})().catch(()=>{console.error('Compiled booking regression failed; details retained locally');process.exitCode=1});
