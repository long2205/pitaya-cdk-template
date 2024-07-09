/**
 * StateFULL resources
 * Databases!
 */

import {
  Stack,
  StackProps,
  SecretValue,
  aws_ec2 as ec2,
  aws_rds as rds,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { commonConstants } from '../lib/parameters/constants';


interface StatefulResourceProps extends StackProps {
  deployEnv: string;
  vpc: ec2.Vpc;
  //config: Readonly<StackConfig>;
}

export class StatefulResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: StatefulResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc } = props;

    const engine = rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_14_7 });

    const databasePort = 5432;

    const dbSecurityGroup = new ec2.SecurityGroup(this, `${deployEnv}-db-sg`, {
      vpc: vpc,
      allowAllOutbound: true,
    });
    dbSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(databasePort), "Allow inbound traffic to database");

    const parameterGroup = new rds.ParameterGroup(this, `${deployEnv}-parameter-group`, {
      engine: engine,
      description: `${deployEnv} database parameter group`
    })

    const database = new rds.DatabaseInstance(this, `${deployEnv}-${commonConstants.project}-database`, {
      instanceIdentifier: `${commonConstants.project}-database-${deployEnv}`,
      databaseName: ssm.StringParameter.fromStringParameterAttributes(this, "postGre-database", { parameterName: `/${deployEnv}/db_database` }).stringValue,
      engine: engine,
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      allocatedStorage: 20,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, deployEnv == "prod" ? ec2.InstanceSize.MEDIUM : ec2.InstanceSize.MICRO),
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromPassword(
        ssm.StringParameter.fromStringParameterAttributes(this, "database-acc", { parameterName: `/${deployEnv}/db_username` }).stringValue,
        SecretValue.unsafePlainText(ssm.StringParameter.fromStringParameterAttributes(this, "database-pw", { parameterName: `/${deployEnv}/db_password` }).stringValue)
      ),
      port: databasePort,
      parameterGroup: parameterGroup,
      multiAz: deployEnv == "prod" ? true : false,
      enablePerformanceInsights: deployEnv == "prod" ? true : false,
    });

  }
}
