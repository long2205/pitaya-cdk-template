/**
 * -> Things declared in here will be references by other stacks!
 * -> NOT RECOMMENDED for declaring resources that changes regularly!
 * -> Things declared in here should be free, stateless, not delete resources.
 * For ex: VPC, a few SG, a EIP for NAT Gateway
 */

import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_route53 as route53,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackConfig } from './parameters/env-config';
import { commonConstants } from '../lib/parameters/constants';


interface BaseNetworkProps extends StackProps {
  deployEnv: string;
  config: Readonly<StackConfig>;
}

export class BaseNetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly hostZone: route53.HostedZone;
  constructor(scope: Construct, id: string, props: BaseNetworkProps) {
    super(scope, id, props);
    const { deployEnv, config } = props;

    // const eipAddress = new ec2.CfnEIP(this, `${deployEnv}-EIpAddress`,{
      
    // });

    this.vpc = new ec2.Vpc(this, `${deployEnv}-${commonConstants.project}-vpc`, {
      vpcName: `${deployEnv}-${commonConstants.project}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(config.cidrBlock),
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      natGateways: deployEnv == "prod" ? 2 : 1,
      // natGatewayProvider: ec2.NatProvider.gateway({ eipAllocationIds: [eipAddress.attrAllocationId] }),
    });

    this.hostZone = new route53.HostedZone(this, `${deployEnv}-${commonConstants.project}-hostZone`, {
      zoneName: config.domainName
    });
  }
}
