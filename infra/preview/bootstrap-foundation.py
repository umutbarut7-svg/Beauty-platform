#!/usr/bin/env python3
"""Owner-run CloudShell foundation bootstrap. No API key retrieval or IAM delegation."""
import argparse
import json
import secrets
import sys
import time

ACCOUNT = '926642724499'
REGION = 'eu-north-1'
STACK_NAME = 'BeautyPlatformPreview'
STACK = json.loads(r'''
{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "Beauty Platform preview foundation; creates paid resources only when explicitly deployed.",
  "Parameters": {
    "InstanceType": {
      "Type": "String",
      "Default": "t3.small",
      "AllowedValues": [
        "t3.small",
        "t3.medium"
      ]
    },
    "SsmKeyArn": {
      "Type": "String",
      "Description": "ARN of the existing regional alias/aws/ssm key",
      "AllowedPattern": "^arn:aws:kms:eu-north-1:[0-9]{12}:key/[0-9a-f-]+$"
    },
    "AmiId": {
      "Type": "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
      "Default": "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
    }
  },
  "Resources": {
    "Network": {
      "Type": "AWS::EC2::VPC",
      "Properties": {
        "CidrBlock": "10.47.0.0/24",
        "EnableDnsSupport": true,
        "EnableDnsHostnames": true,
        "Tags": [
          {
            "Key": "Project",
            "Value": "BeautyPlatformPreview"
          }
        ]
      }
    },
    "Internet": {
      "Type": "AWS::EC2::InternetGateway"
    },
    "AttachInternet": {
      "Type": "AWS::EC2::VPCGatewayAttachment",
      "Properties": {
        "VpcId": {
          "Ref": "Network"
        },
        "InternetGatewayId": {
          "Ref": "Internet"
        }
      }
    },
    "Subnet": {
      "Type": "AWS::EC2::Subnet",
      "Properties": {
        "VpcId": {
          "Ref": "Network"
        },
        "CidrBlock": "10.47.0.0/25",
        "MapPublicIpOnLaunch": false
      }
    },
    "Routes": {
      "Type": "AWS::EC2::RouteTable",
      "Properties": {
        "VpcId": {
          "Ref": "Network"
        }
      }
    },
    "PublicRoute": {
      "Type": "AWS::EC2::Route",
      "DependsOn": "AttachInternet",
      "Properties": {
        "RouteTableId": {
          "Ref": "Routes"
        },
        "DestinationCidrBlock": "0.0.0.0/0",
        "GatewayId": {
          "Ref": "Internet"
        }
      }
    },
    "SubnetRoutes": {
      "Type": "AWS::EC2::SubnetRouteTableAssociation",
      "Properties": {
        "SubnetId": {
          "Ref": "Subnet"
        },
        "RouteTableId": {
          "Ref": "Routes"
        }
      }
    },
    "Firewall": {
      "Type": "AWS::EC2::SecurityGroup",
      "Properties": {
        "GroupDescription": "HTTPS preview and HTTP certificate challenge; administration through SSM",
        "VpcId": {
          "Ref": "Network"
        },
        "SecurityGroupIngress": [
          {
            "IpProtocol": "tcp",
            "FromPort": 80,
            "ToPort": 80,
            "CidrIp": "0.0.0.0/0"
          },
          {
            "IpProtocol": "tcp",
            "FromPort": 443,
            "ToPort": 443,
            "CidrIp": "0.0.0.0/0"
          }
        ],
        "SecurityGroupEgress": [
          {
            "IpProtocol": "tcp",
            "FromPort": 443,
            "ToPort": 443,
            "CidrIp": "0.0.0.0/0"
          },
          {
            "IpProtocol": "udp",
            "FromPort": 53,
            "ToPort": 53,
            "CidrIp": "0.0.0.0/0"
          },
          {
            "IpProtocol": "tcp",
            "FromPort": 53,
            "ToPort": 53,
            "CidrIp": "0.0.0.0/0"
          }
        ]
      }
    },
    "ImageRepository": {
      "Type": "AWS::ECR::Repository",
      "Properties": {
        "ImageTagMutability": "IMMUTABLE",
        "EncryptionConfiguration": {
          "EncryptionType": "AES256"
        },
        "LifecyclePolicy": {
          "LifecyclePolicyText": "{\"rules\":[{\"rulePriority\":1,\"description\":\"Remove old untagged build layers\",\"selection\":{\"tagStatus\":\"untagged\",\"countType\":\"sinceImagePushed\",\"countUnit\":\"days\",\"countNumber\":3},\"action\":{\"type\":\"expire\"}}]}"
        }
      }
    },
    "RuntimeRole": {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "AssumeRolePolicyDocument": {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Principal": {
                "Service": "ec2.amazonaws.com"
              },
              "Action": "sts:AssumeRole"
            }
          ]
        },
        "ManagedPolicyArns": [
          "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
        ],
        "Policies": [
          {
            "PolicyName": "PreviewRuntimeOnly",
            "PolicyDocument": {
              "Version": "2012-10-17",
              "Statement": [
                {
                  "Effect": "Allow",
                  "Action": "ssm:GetParameters",
                  "Resource": [
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/database-password"
                    },
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/jwt-access-secret"
                    },
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/jwt-refresh-secret"
                    },
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/dev/openai-api-key"
                    }
                  ]
                },
                {
                  "Effect": "Deny",
                  "Action": [
                    "ssm:GetParameter",
                    "ssm:GetParameters",
                    "ssm:GetParametersByPath"
                  ],
                  "NotResource": [
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/database-password"
                    },
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/jwt-access-secret"
                    },
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/jwt-refresh-secret"
                    },
                    {
                      "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/dev/openai-api-key"
                    }
                  ]
                },
                {
                  "Effect": "Allow",
                  "Action": "kms:Decrypt",
                  "Resource": {
                    "Ref": "SsmKeyArn"
                  },
                  "Condition": {
                    "StringEquals": {
                      "kms:ViaService": "ssm.eu-north-1.amazonaws.com",
                      "kms:EncryptionContext:PARAMETER_ARN": [
                        {
                          "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/database-password"
                        },
                        {
                          "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/jwt-access-secret"
                        },
                        {
                          "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/preview/jwt-refresh-secret"
                        },
                        {
                          "Fn::Sub": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/beauty-platform/dev/openai-api-key"
                        }
                      ]
                    }
                  }
                },
                {
                  "Effect": "Allow",
                  "Action": [
                    "s3:GetBucketVersioning",
                    "s3:GetBucketPublicAccessBlock"
                  ],
                  "Resource": "arn:aws:s3:::beautyplatform-private-photos-dev"
                },
                {
                  "Effect": "Allow",
                  "Action": [
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject"
                  ],
                  "Resource": "arn:aws:s3:::beautyplatform-private-photos-dev/private/mvp/*"
                },
                {
                  "Effect": "Allow",
                  "Action": "ecr:GetAuthorizationToken",
                  "Resource": "*"
                },
                {
                  "Effect": "Allow",
                  "Action": [
                    "ecr:BatchGetImage",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchCheckLayerAvailability"
                  ],
                  "Resource": {
                    "Fn::GetAtt": [
                      "ImageRepository",
                      "Arn"
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    },
    "RuntimeProfile": {
      "Type": "AWS::IAM::InstanceProfile",
      "Properties": {
        "Roles": [
          {
            "Ref": "RuntimeRole"
          }
        ]
      }
    },
    "Server": {
      "Type": "AWS::EC2::Instance",
      "DependsOn": "PublicRoute",
      "Properties": {
        "ImageId": {
          "Ref": "AmiId"
        },
        "InstanceType": {
          "Ref": "InstanceType"
        },
        "IamInstanceProfile": {
          "Ref": "RuntimeProfile"
        },
        "CreditSpecification": {
          "CPUCredits": "standard"
        },
        "MetadataOptions": {
          "HttpTokens": "required",
          "HttpPutResponseHopLimit": 2,
          "HttpEndpoint": "enabled"
        },
        "BlockDeviceMappings": [
          {
            "DeviceName": "/dev/xvda",
            "Ebs": {
              "VolumeSize": 30,
              "VolumeType": "gp3",
              "Encrypted": true,
              "DeleteOnTermination": true
            }
          }
        ],
        "NetworkInterfaces": [
          {
            "DeviceIndex": "0",
            "AssociatePublicIpAddress": false,
            "SubnetId": {
              "Ref": "Subnet"
            },
            "GroupSet": [
              {
                "Ref": "Firewall"
              }
            ]
          }
        ],
        "Tags": [
          {
            "Key": "Name",
            "Value": "BeautyPlatformPreview"
          },
          {
            "Key": "Environment",
            "Value": "preview"
          }
        ],
        "UserData": {
          "Fn::Base64": "#!/bin/bash\nset -euo pipefail\nsystemctl enable --now amazon-ssm-agent\ninstall -d -m 0700 /opt/beauty-preview\n# Docker/images/secrets are installed only in the reviewed deployment step.\n"
        }
      }
    },
    "PublicAddress": {
      "Type": "AWS::EC2::EIP",
      "DependsOn": "AttachInternet",
      "Properties": {
        "Domain": "vpc"
      }
    },
    "AddressAttachment": {
      "Type": "AWS::EC2::EIPAssociation",
      "Properties": {
        "AllocationId": {
          "Fn::GetAtt": [
            "PublicAddress",
            "AllocationId"
          ]
        },
        "InstanceId": {
          "Ref": "Server"
        }
      }
    }
  },
  "Outputs": {
    "InstanceId": {
      "Value": {
        "Ref": "Server"
      }
    },
    "PreviewIpv4": {
      "Value": {
        "Ref": "PublicAddress"
      }
    },
    "ImageRepositoryUri": {
      "Value": {
        "Fn::GetAtt": [
          "ImageRepository",
          "RepositoryUri"
        ]
      }
    },
    "RuntimeRoleArn": {
      "Value": {
        "Fn::GetAtt": [
          "RuntimeRole",
          "Arn"
        ]
      }
    }
  }
}
''')
PARAMETERS = (
    '/beauty-platform/preview/database-password',
    '/beauty-platform/preview/jwt-access-secret',
    '/beauty-platform/preview/jwt-refresh-secret',
)

class SetupError(Exception):
    pass


_clients = {}


def aws(service, operation, document=None, allow_missing=False):
    # Use the CloudShell SDK directly. No CLI JSON/stdin parameter-file bridge.
    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError:
        raise SetupError('AWS Python SDK bulunamadi; bu komutu AWS CloudShell icinde calistir.') from None
    try:
        if service not in _clients:
            _clients[service] = boto3.client(service, region_name=REGION,
                config=Config(connect_timeout=5, read_timeout=30,
                              retries={'total_max_attempts': 2, 'mode': 'standard'}))
        return getattr(_clients[service], operation.replace('-', '_'))(**(document or {}))
    except ClientError as error:
        detail = error.response.get('Error', {})
        code = detail.get('Code', 'AWSServiceError')
        if not code.isalnum() or len(code) > 64:
            code = 'AWSServiceError'
        if (allow_missing and service == 'cloudformation' and operation == 'describe-stacks'
                and code == 'ValidationError' and 'does not exist' in detail.get('Message', '')):
            return None
        message = f'AWS islemi tamamlanamadi: {service} {operation} ({code})'
        # This one operation contains only the public, embedded template, no secrets.
        if service == 'cloudformation' and operation == 'validate-template':
            message += ': ' + ' '.join(detail.get('Message', '').split())[:500]
        raise SetupError(message) from None
    except BotoCoreError:
        raise SetupError(f'AWS baglanti/istek hatasi: {service} {operation}; gizli degerler gosterilmedi.') from None


def validate_changes(changes):
    resources = [item.get('ResourceChange', {}) for item in changes]
    if len(resources) != len(STACK['Resources']):
        raise SetupError('Beklenen kaynak sayisi disinda degisiklik var; plan uygulanmadi.')
    if {r.get('LogicalResourceId') for r in resources} != set(STACK['Resources']):
        raise SetupError('Beklenmeyen kaynak var; plan uygulanmadi.')
    for resource in resources:
        expected = STACK['Resources'][resource['LogicalResourceId']]['Type']
        if resource.get('Action') != 'Add' or resource.get('ResourceType') != expected:
            raise SetupError('Mevcut kaynagi degistiren/silen plan uygulanmadi.')


def show_status(stack):
    print('Altyapi durumu:', stack['StackStatus'])
    for output in stack.get('Outputs', []):
        if output['OutputKey'] in {'InstanceId', 'PreviewIpv4', 'ImageRepositoryUri', 'RuntimeRoleArn'}:
            print(output['OutputKey'] + ':', output['OutputValue'])
    print('Bu adim temel altyapidir; uygulama/DNS/HTTPS yayini henuz tamamlanmaz.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true', help='Create the already cost-approved foundation')
    mode.add_argument('--status', action='store_true', help='Read existing foundation status only')
    args = parser.parse_args(argv)
    if not args.apply and not args.status:
        print('PLAN: eu-north-1 / t3.small / encrypted gp3 30 GiB / one IPv4 / no SSH')
        print('Base estimate: USD 21.926/month; usage, tax, domain and OpenAI excluded.')
        print('Creates:', len(STACK['Resources']), 'new foundation resources and three SecureStrings.')
        print('No AWS request made. --apply starts paid resources; --status reads progress.')
        return 0
    identity = aws('sts', 'get-caller-identity')
    if identity.get('Account') != ACCOUNT:
        raise SetupError('Beklenen AWS hesabinda degilsin; hicbir sey degistirilmedi.')
    existing = aws('cloudformation', 'describe-stacks', document={'StackName': STACK_NAME}, allow_missing=True)
    if existing:
        show_status(existing['Stacks'][0])
        print('Mevcut stack degistirilmedi; ayni komutu tekrar calistirmak yeni sunucu olusturmaz.')
        return 0
    if args.status:
        print('Bu hesapta BeautyPlatformPreview henuz olusturulmamis.')
        return 0
    print('Onaylanan temel altyapi hazirlaniyor; OpenAI anahtari okunmayacak.')
    key = aws('kms', 'describe-key', document={'KeyId': 'alias/aws/ssm'})['KeyMetadata']
    if key.get('AWSAccountId') != ACCOUNT or key.get('KeyState') != 'Enabled':
        raise SetupError('Beklenen etkin SSM sifreleme anahtari bulunamadi.')
    template = json.dumps(STACK, separators=(',', ':'))
    validated = aws('cloudformation', 'validate-template', document={'TemplateBody': template})
    if set(validated.get('Capabilities', [])) - {'CAPABILITY_IAM'}:
        raise SetupError('Beklenmeyen CloudFormation yetenegi; uygulanmadi.')
    for name in PARAMETERS:
        found = aws('ssm', 'describe-parameters', document={
            'ParameterFilters': [{'Key': 'Name', 'Option': 'Equals', 'Values': [name]}]
        }).get('Parameters', [])
        if found:
            if len(found) != 1 or found[0].get('Type') != 'SecureString':
                raise SetupError('Mevcut parametre beklenen SecureString turunde degil; degistirilmedi.')
            continue
        try:
            aws('ssm', 'put-parameter', document={
                'Name': name, 'Type': 'SecureString', 'Tier': 'Standard',
                'KeyId': 'alias/aws/ssm', 'Value': secrets.token_urlsafe(48),
                'Overwrite': False,
                'Tags': [{'Key': 'Project', 'Value': 'BeautyPlatformPreview'}],
            })
        except SetupError:
            raise SetupError('Parametre olusturma dogrulanamadi; gizli deger gosterilmedi.') from None
    change_name = 'preview-foundation-' + secrets.token_hex(6)
    change = aws('cloudformation', 'create-change-set', document={
        'StackName': STACK_NAME, 'ChangeSetName': change_name, 'ChangeSetType': 'CREATE',
        'TemplateBody': template, 'Capabilities': ['CAPABILITY_IAM'],
        'Parameters': [{'ParameterKey': 'SsmKeyArn', 'ParameterValue': key['Arn']}],
        'Tags': [{'Key': 'Project', 'Value': 'BeautyPlatformPreview'}],
    })
    for _ in range(30):
        planned = aws('cloudformation', 'describe-change-set', document={'ChangeSetName': change['Id']})
        if planned['Status'] == 'CREATE_COMPLETE':
            break
        if planned['Status'] == 'FAILED':
            raise SetupError('CloudFormation plani hazirlanamadi; kaynak olusturma baslatilmadi.')
        time.sleep(3)
    else:
        raise SetupError('Plan hazirligi beklenenden uzun surdu; uygulama baslatilmadi.')
    if planned.get('NextToken'):
        raise SetupError('Beklenmeyen cok sayfali kaynak plani; uygulama baslatilmadi.')
    validate_changes(planned['Changes'])
    aws('cloudformation', 'execute-change-set', document={'ChangeSetName': change['Id']})
    print('ONAYLANAN ALTYAPI OLUSTURMA BASLATILDI.')
    print('AWS temel gideri yaklasik 22 USD/ay + kullanim/vergi; mevcut 5 USD butce bir harcama siniri degildir.')
    print('Durum: python3 /tmp/beauty-preview.py --status')
    print('Alan adi geldikten sonra uygulama imajlari ve HTTPS yayini tamamlanacak.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (SetupError, OSError, KeyError, ValueError) as error:
        message = str(error) if isinstance(error, SetupError) else 'Kurulum tamamlanamadi; gizli degerler gosterilmedi.'
        print(message, file=sys.stderr)
        sys.exit(1)
