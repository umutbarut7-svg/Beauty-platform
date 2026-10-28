#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json, re, subprocess
stage = 'startup'

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if p.returncode:
        state = re.search(r'ERROR:\s+([0-9A-Z]{5})\b', p.stderr)
        raise RuntimeError('Read-only command unavailable; SQLSTATE=' + (state.group(1) if state else 'UNAVAILABLE'))
    return p.stdout

def sql(query):
    return run(['docker', 'exec', 'beauty-preview-postgres-1', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-U', 'beauty', '-d', 'beauty_preview', '-c', 'SET statement_timeout=5000; BEGIN READ ONLY; ' + query + '; COMMIT;']).strip()

TARGET = '''WITH target AS (
 SELECT s.id AS sid, b.id AS bid FROM "Service" s
 JOIN "Business" b ON b.id=s."businessId"
 WHERE lower(btrim(b.name))='restart hair design' AND b."isPublic" AND b.status='ACTIVE'
 AND lower(btrim(s.name))='kaynak' AND s."isActive" AND s."isBookable"
) '''

def main():
    global stage
    stage = 'public catalog precondition'
    count = int(sql(TARGET + 'SELECT count(*) FROM target'))
    print('Matching public service count: ' + str(count), flush=True)
    if count != 1:
        raise RuntimeError('Expected one public Kaynak service; stop on catalog drift')
    stage = 'booking prerequisite SELECT'
    query = TARGET + '''SELECT json_build_object(
      'businessSuffix',right(b.id,6),
      'businessActive',b.status='ACTIVE',
      'settingsPresent',bs."businessId" IS NOT NULL,
      'bookingEnabled',bs."bookingEnabled",
      'appointmentIntervalMinutes',bs."appointmentIntervalMinutes",
      'serviceDurationMinutes',s."durationMinutes",
      'serviceActive',s."isActive",
      'serviceBookable',s."isBookable",
      'locations',(SELECT coalesce(json_agg(json_build_object(
          'suffix',right(l.id,6),'active',l."isActive",
          'bookableStaffBindings',(SELECT count(*) FROM "StaffLocation" sl JOIN "Staff" st ON st.id=sl."staffId" AND st."businessId"=sl."businessId"
            WHERE sl."businessId"=t.bid AND sl."locationId"=l.id AND st."isActive" AND st."acceptsBookings")
        ) ORDER BY l.id),'[]'::json) FROM "Location" l WHERE l."businessId"=t.bid),
      'staff',(SELECT coalesce(json_agg(json_build_object(
          'suffix',right(st.id,6),'active',st."isActive",'acceptsBookings',st."acceptsBookings",
          'activeProfileServiceAssignment',EXISTS(SELECT 1 FROM "StaffProfileService" a WHERE a."businessId"=t.bid AND a."staffId"=st.id AND a."serviceId"=t.sid AND a."isActive"),
          'activeLegacyServiceAssignment',EXISTS(SELECT 1 FROM "StaffService" a JOIN "BusinessMember" bm ON bm.id=a."businessMemberId" AND bm."businessId"=a."businessId" WHERE a."businessId"=t.bid AND a."serviceId"=t.sid AND a."isActive" AND bm."userId"=st."userId"),
          'locationSuffixes',(SELECT coalesce(json_agg(right(sl."locationId",6) ORDER BY sl."locationId"),'[]'::json) FROM "StaffLocation" sl WHERE sl."businessId"=t.bid AND sl."staffId"=st.id),
          'activeWednesdayPeriods',(SELECT count(*) FROM "StaffWorkingHour" h WHERE h."businessId"=t.bid AND h."staffId"=st.id AND h."isActive" AND h."dayOfWeek"='WEDNESDAY'),
          'activeThursdayPeriods',(SELECT count(*) FROM "StaffWorkingHour" h WHERE h."businessId"=t.bid AND h."staffId"=st.id AND h."isActive" AND h."dayOfWeek"='THURSDAY')
        ) ORDER BY st.id),'[]'::json) FROM "Staff" st WHERE st."businessId"=t.bid),
      'openBusinessWednesdayPeriods',(SELECT count(*) FROM "WorkingHour" h WHERE h."businessId"=t.bid AND h."branchId" IS NULL AND h."isOpen" AND h."dayOfWeek"='WEDNESDAY'),
      'openBusinessThursdayPeriods',(SELECT count(*) FROM "WorkingHour" h WHERE h."businessId"=t.bid AND h."branchId" IS NULL AND h."isOpen" AND h."dayOfWeek"='THURSDAY')
    ) FROM target t JOIN "Business" b ON b.id=t.bid JOIN "Service" s ON s.id=t.sid
    LEFT JOIN "BusinessSettings" bs ON bs."businessId"=t.bid'''
    result = json.loads(sql(query))
    print('Booking prerequisites: ' + json.dumps(result, sort_keys=True), flush=True)
    stage = 'compiled availability source inspection'
    diagnostic = """const fs=require('node:fs'),crypto=require('node:crypto');const p='dist/appointments/availability.service.js';if(!fs.existsSync(p)){console.log('Compiled availability source unavailable');process.exit(0)}const s=fs.readFileSync(p,'utf8');console.log(JSON.stringify({sha256:crypto.createHash('sha256').update(s).digest('hex'),profileServiceSupported:s.includes('staffProfileService'),profileStaffLookupSupported:s.includes('staff.findFirst'),legacyStaffLookupPresent:s.includes('businessMember.findFirst'),businessBookingGatePresent:s.includes('bookingEnabled')}))"""
    print('Compiled availability features: ' + run(['docker', 'exec', 'beauty-preview-api-1', 'node', '-e', diagnostic]).strip())
    stage = 'runtime identity inspection'
    for service in ['api','worker']:
        c = json.loads(run(['docker','inspect','beauty-preview-'+service+'-1']))[0]
        print(service + ' image: ' + c['Image'])
        print(service + ' running: ' + str(bool(c['State'].get('Running'))))
    print('READ ONLY: no record/configuration/role change, restart, secret output, booking or paid AI request')

try:
    main()
except Exception as error:
    print('Booking inspection stopped at ' + stage + ': ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__) + '; private diagnostics withheld')
    raise SystemExit(1)
PY
