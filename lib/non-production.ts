/************************************************************************
 * RESOURCES DECLARED IN THIS FILE:                                     *
 * 1) Auto on off API and Dashboard Fargate in Development environment  *
 * 2) Auto on off Database in Development environment                   *
 ************************************************************************/

import {
    aws_ecs as ecs,
    aws_rds as rds,
    aws_iam as iam,
    aws_lambda as lambda,
    aws_events as events,
    aws_events_targets as events_targets,
    Stack,
    StackProps,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { commonConstants } from './parameters/constants';

interface NonProductionProps extends StackProps {
    deployEnv: "dev" | "stg",
    backendService: ecs.FargateService,
    cluster: ecs.Cluster,
    database: rds.DatabaseInstance,
}

export class NonProductionStack extends Stack {
    constructor(scope: Construct, id: string, props: NonProductionProps) {
        super(scope, id, props);

        const { deployEnv, cluster, backendService, database } = props;

        /**
         * 1) ECS Fargate
         */
        const lambdaRole = new iam.Role(this, `lambda-role-${deployEnv}`, {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });

        // Add necessary permissions to the IAM role
        lambdaRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ['ecs:UpdateService'],
                resources: [
                    backendService.serviceArn,
                ],
            })
        );

        lambdaRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ['rds:StartDBInstance', 'rds:StopDBInstance'],
                resources: [
                    database.instanceArn,
                ],
            })
        );

        const updateECSFunction = new lambda.Function(this, `auto-on-off-ecs-${deployEnv}`, {
            functionName: `${commonConstants.project}-auto-on-off-ecs-${deployEnv}`,
            runtime: lambda.Runtime.PYTHON_3_9,
            code: lambda.Code.fromInline(`
import boto3

def handler(event, context):
    service = event['service']
    desired_count = event['desiredCount']

    ecs = boto3.client('ecs')
    ecs.update_service(
        cluster = "${cluster.clusterArn}",
        service = service,
        desiredCount = desired_count
    )
`),
            handler: "index.handler",
            role: lambdaRole
        });

        // Create CloudWatch Events rules to schedule the Lambda function with payload for Services
        const stopRuleECSServices = new events.Rule(this, 'stop-rule-services', {
            schedule: events.Schedule.cron({ minute: '0', hour: '14', weekDay: '2-6' }), // 14:00 UTC = 23:00 JST (UTC+9)
            targets: [
                new events_targets.LambdaFunction(updateECSFunction, {
                    event: events.RuleTargetInput.fromObject({
                        service: backendService.serviceName,
                        desiredCount: 0,
                    }),
                }),
            ],
            ruleName: `auto-stop-ecs-${deployEnv}`,
            enabled: true,
        });

        const startRuleECSServices = new events.Rule(this, 'start-rule-services', {
            schedule: events.Schedule.cron({ minute: '0', hour: '0', weekDay: '2-6' }), // 00:00 UTC = 9:00 JST (UTC+9)
            targets: [
                new events_targets.LambdaFunction(updateECSFunction, {
                    event: events.RuleTargetInput.fromObject({
                        service: backendService.serviceName,
                        desiredCount: 1,
                    }),
                }),
            ],
            ruleName: `auto-start-ecs-${deployEnv}`,
            enabled: true,
        });

        /**
         * 2) Auto on off RDS database
         */

        const updateRDSFunction = new lambda.Function(this, `auto-on-off-rds-function-${deployEnv}`, {
            functionName: `${commonConstants.project}-auto-on-off-rds-${deployEnv}`,
            runtime: lambda.Runtime.PYTHON_3_9,
            code: lambda.Code.fromInline(`
import boto3

def handler(event, context):
    action = event['action']
    instanceId = event['dbinstance']
    
    rds = boto3.client('rds')
    if action == "start":
        rds.start_db_instance(DBInstanceIdentifier=instanceId)
    elif action == "stop":
        rds.stop_db_instance(DBInstanceIdentifier=instanceId)
    else:
        print(f"No action taken. Current hour: {current_hour_utc}")
`),
            handler: "index.handler",
            role: lambdaRole
        });

        const stopRuleRDSInstance = new events.Rule(this, 'stop-rule-rds', {
            schedule: events.Schedule.cron({ minute: '0', hour: '14', weekDay: '2-6' }), // Weekday 14:00 UTC = 23:00 JST (UTC+9)
            // schedule: events.Schedule.cron({ minute: '0', hour: '1', weekDay: '2' }), // Monday at 14:00 UTC = 23:00 JST (UTC+9)
            targets: [
                new events_targets.LambdaFunction(updateRDSFunction, {
                    event: events.RuleTargetInput.fromObject({
                        action: "stop",
                        dbinstance: database.instanceIdentifier,
                    }),
                })
            ],
            ruleName: `auto-stop-rds-${deployEnv}`,
            enabled: true,
        });

        const startRuleRDSInstance = new events.Rule(this, 'start-rule-rds', {
            schedule: events.Schedule.cron({ minute: '0', hour: '0', weekDay: '2-6' }), // Weekday(2-6) 00:00 UTC = 09:00 JST (UTC+9)
            // schedule: events.Schedule.cron({ minute: '0', hour: '0', weekDay: '2' }), // Monday at 00:00 UTV = 09:00 JST (UTC+9)
            targets: [
                new events_targets.LambdaFunction(updateRDSFunction, {
                    event: events.RuleTargetInput.fromObject({
                        action: "start",
                        dbinstance: database.instanceIdentifier,
                    }),
                })
            ],
            ruleName: `auto-start-rds-${deployEnv}`,
            enabled: true,
        });
    }
}
