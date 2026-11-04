"""Read only public bookable catalog/index metadata; never customer or vectors."""
import json
import re
import subprocess

IMAGE = 'sha256:d2b7ae718ad2ad78aa2ce4700646b4e37f3b861f0b39362e47af47219f11b5b6'


def require(condition):
    if not condition:
        raise RuntimeError('Catalog inspection stopped; private diagnostics withheld')


def run(args, input=None, limit=300000):
    reply = subprocess.run(args, input=input, capture_output=True, text=True, timeout=20)
    require(reply.returncode == 0 and len(reply.stdout) + len(reply.stderr) <= limit)
    return reply.stdout


def catalog_query(model):
    require(model in ['text-embedding-3-small', 'text-embedding-3-large'])
    # The model is allowlisted; all source rows are public, active and bookable.
    return '''SET statement_timeout=5000; SET lock_timeout=1000; BEGIN READ ONLY;
SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) FROM (
 SELECT b.name AS "businessName", s.name AS "serviceName",
 EXISTS(SELECT 1 FROM "MvpCatalogVector" v WHERE v."serviceId"=s.id AND v."businessId"=b.id) AS "hasAnyIndex",
 EXISTS(SELECT 1 FROM "MvpCatalogVector" v WHERE v."serviceId"=s.id AND v."businessId"=b.id AND v.model=''' + "'" + model + "'" + ''') AS "hasModelIndex",
 EXISTS(SELECT 1 FROM "MvpCatalogVector" v WHERE v."serviceId"=s.id AND v."businessId"=b.id AND v.model=''' + "'" + model + "'" + ''' AND v."sourceUpdatedAt"=s."updatedAt" AND v."businessUpdatedAt"=b."updatedAt") AS "freshModelIndex"
 FROM "Service" s JOIN "Business" b ON b.id=s."businessId"
 WHERE b."isPublic" AND b.status='ACTIVE' AND s."isActive" AND s."isBookable"
 ORDER BY b.id, s.id LIMIT 201
) c; COMMIT;'''


def validate_rows(rows):
    require(isinstance(rows, list) and len(rows) <= 200)
    for row in rows:
        require(set(row) == {'businessName', 'serviceName', 'hasAnyIndex', 'hasModelIndex', 'freshModelIndex'})
        require(all(isinstance(row[key], str) and 0 < len(row[key]) <= 300 and not re.search(r'[\x00-\x1f]', row[key]) for key in ['businessName', 'serviceName']))
        require(all(isinstance(row[key], bool) for key in ['hasAnyIndex', 'hasModelIndex', 'freshModelIndex']))
        require(not row['freshModelIndex'] or row['hasModelIndex'])
        require(not row['hasModelIndex'] or row['hasAnyIndex'])
    return rows


def main():
    info = json.loads(run(['docker', 'inspect', 'beauty-preview-api-1']))
    require(len(info) == 1 and info[0]['Image'] == IMAGE and info[0]['State'].get('Running'))
    require(info[0]['State'].get('Health', {}).get('Status') == 'healthy')
    env = dict(value.split('=', 1) for value in info[0]['Config'].get('Env', []) if '=' in value)
    model = env.get('OPENAI_EMBEDDING_MODEL')
    query = catalog_query(model)
    rows = validate_rows(json.loads(run(['docker', 'exec', 'beauty-preview-postgres-1', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'beauty', '-d', 'beauty_preview', '-c', query], limit=200000)))
    code = r"""
const fs=require('node:fs');
const {compatibleVisualService}=require('/application/dist/mvp/visual-service-compatibility.js');
const rows=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(rows.map(row=>({...row,cutCompatible:compatibleVisualService('CUT',row.serviceName)}))));
"""
    classified = json.loads(run(['docker', 'exec', '-i', 'beauty-preview-api-1', 'node', '-e', code], input=json.dumps(rows), limit=200000))
    require(isinstance(classified, list) and len(classified) == len(rows))
    for original, item in zip(rows, classified):
        require(set(item) == set(original) | {'cutCompatible'} and all(item[key] == value for key, value in original.items()) and isinstance(item['cutCompatible'], bool))
    cut = [row for row in classified if row['cutCompatible']]
    details = sorted(classified, key=lambda row: (not row['cutCompatible'], row['businessName'], row['serviceName']))[:40]
    report = {'publicBookableServices': len(rows), 'cutCompatibleServices': len(cut), 'freshIndexedCutServices': sum(row['freshModelIndex'] for row in cut), 'freshIndexedServices': sum(row['freshModelIndex'] for row in classified), 'embeddingModel': model, 'details': details, 'detailsTruncated': len(classified) > 40}
    encoded = json.dumps(report, ensure_ascii=False, separators=(',', ':'))
    require(len(encoded.encode()) <= 20000)
    print(encoded)
    print('READ_ONLY_COMPLETE: public catalog/index metadata only; no customer/photo/consultation rows, vector contents, provider call, indexing or writes')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Catalog inspection stopped; private diagnostics withheld')
        raise SystemExit(1)
