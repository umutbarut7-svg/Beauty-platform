"""Read only metadata for the fixed synthetic recovery stack in Stockholm."""
from datetime import datetime, timezone
import json
import re
import subprocess

ACCOUNT='926642724499'
REGION='eu-north-1'
STACK='orzell-recovery-rehearsal-v1'
PREVIEW='i-09fe7fdb5f10d63b6'
FILTERS=[{'Name':'tag:Project','Values':['ORZELLRecoveryRehearsal']},
         {'Name':'tag:DataScope','Values':['SyntheticOnly']},
         {'Name':'tag:aws:cloudformation:stack-name','Values':[STACK]}]


def aws(service,operation,*args):
    if (service,operation) not in {('sts','get-caller-identity'),('ec2','describe-instances')}:
        raise ValueError('READ_ONLY_RECOVERY_METADATA_REQUIRED')
    reply=subprocess.run(['aws',service,operation,*args,'--region',REGION,'--no-cli-pager','--no-paginate','--output','json','--cli-connect-timeout','5','--cli-read-timeout','20'],capture_output=True,text=True,timeout=35)
    if reply.returncode or len(reply.stdout)>200000:
        raise ValueError('RECOVERY_METADATA_READ_UNAVAILABLE')
    return json.loads(reply.stdout)


def inspect(call=aws):
    identity=call('sts','get-caller-identity')
    if identity.get('Account')!=ACCOUNT or not identity.get('Arn','').startswith('arn:aws:sts::'+ACCOUNT+':assumed-role/BeautyPlatformPreviewOperations/'):
        raise ValueError('RECOVERY_INVENTORY_IDENTITY_DIFFERS')
    page=call('ec2','describe-instances','--filters',json.dumps(FILTERS),'--max-results','10')
    if page.get('NextToken'):raise ValueError('COMPLETE_RECOVERY_INVENTORY_REQUIRED')
    hosts=[]
    for reservation in page.get('Reservations',[]):
        for host in reservation.get('Instances',[]):
            tags={t['Key']:t['Value'] for t in host.get('Tags',[])}
            identifier=host.get('InstanceId','');state=host.get('State',{}).get('Name')
            stack=tags.get('aws:cloudformation:stack-id','')
            if (identifier==PREVIEW or not re.fullmatch(r'i-[0-9a-f]{8,17}',identifier)
                    or any(tags.get(f['Name'][4:])!=f['Values'][0] for f in FILTERS)
                    or not stack.startswith('arn:aws:cloudformation:'+REGION+':'+ACCOUNT+':stack/'+STACK+'/')
                    or state not in {'pending','running','stopping','stopped','shutting-down','terminated'}):
                raise ValueError('RECOVERY_HOST_BINDING_DIFFERS')
            hosts.append({'instanceId':identifier,'state':state,'instanceType':host.get('InstanceType'),'amiId':host.get('ImageId'),'stackId':stack})
    active=sum(h['state']!='terminated' for h in hosts)
    return {'status':'RECOVERY_HOST_METADATA_OBSERVED' if active else 'NO_ACTIVE_TAGGED_RECOVERY_HOSTS_OBSERVED',
            'checkedAt':datetime.now(timezone.utc).isoformat(),'region':REGION,'hosts':hosts,'activeTaggedHosts':active,
            'resourceCleanupVerified':False,'productionRestoreVerified':False,'productionDataRead':False,'privateKeyRead':False,'writesPerformed':False}

if __name__=='__main__':
    try:print(json.dumps(inspect(),sort_keys=True))
    except Exception as error:
        print(json.dumps({'status':'RECOVERY_INVENTORY_NOT_VERIFIED','reason':str(error) if isinstance(error,ValueError) else type(error).__name__,'writesPerformed':False}))
        raise SystemExit(1)
