/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions.
 * Security Groups, IAM permissions.
 */

import {
  Stack,
  StackProps,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_certificatemanager as certificatemanager,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
  aws_elasticloadbalancingv2 as lbv2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_iam as iam,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as codepipeline_actions,
  aws_codebuild as codebuild,
  aws_codedeploy as codedeploy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackConfig } from './parameters/env-config';
import { commonConstants } from '../lib/parameters/constants';
import * as path from 'path';


interface StatelessResourceProps extends StackProps {
  deployEnv: string;
  vpc: ec2.Vpc;
  hostZone: route53.HostedZone;
  config: Readonly<StackConfig>;
}

export class StatelessResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: StatelessResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc, config, hostZone } = props;
    /**
     * Log bucket (in early stage of development, maybe it's best to set DESTROY RemovalPolicy)
     */
    const loggingBucket = new s3.Bucket(this, "loggingBucket", {
      bucketName: `${commonConstants.project}-logging-bucket`}
    );
    loggingBucket.applyRemovalPolicy(RemovalPolicy.DESTROY);

    /**
     * Certs
     */
    const certificate = new certificatemanager.Certificate(this, `${deployEnv}-${commonConstants.project}-cert`, {
      domainName: config.domainName,
      subjectAlternativeNames: [`*.${config.domainName}`],
      validation: certificatemanager.CertificateValidation.fromDns(hostZone),
    });

    /**
     * Load balancer
     */
    const lbSecurityGroup = new ec2.SecurityGroup(this, `${deployEnv}-${commonConstants.project}-LoadBalancerSecurityGroup`, {
      vpc: vpc,
      allowAllOutbound: true,
    });
    lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow inbound traffic on port 80");
    lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Allow inbound traffic on port 443");
    
    const loadBalancer = new lbv2.ApplicationLoadBalancer(this, `${deployEnv}-${commonConstants.project}-lb`, {
      loadBalancerName: `${deployEnv}-${commonConstants.project}-lb`,
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      internetFacing: true,
      securityGroup: lbSecurityGroup,
    });
    loadBalancer.logAccessLogs(loggingBucket, `loadBalancer/${deployEnv}`);

    //default listener and rule
    loadBalancer.addListener("listenerHttp", {
      port: 80,
      defaultAction: lbv2.ListenerAction.redirect({ port: "443", protocol: lbv2.ApplicationProtocol.HTTPS })
    });

    const httpsListener = loadBalancer.addListener("listenerHttps", {
      port: 443,
      protocol: lbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: lbv2.ListenerAction.fixedResponse(404, {
        contentType: "text/html",
        messageBody: "お指定URLをご確認ください！"
      }),
      sslPolicy: lbv2.SslPolicy.TLS12
    });

    /**
     * Compute Resource (ECS)
     */
    //Image Repo
    const apiECRRepo =  new ecr.Repository(this, `${deployEnv}-Api-ecrRepo`,{
      repositoryName: `Api-${deployEnv}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //Cluster
    const cluster = new ecs.Cluster(this, `${deployEnv}-cluster`, {
      vpc: vpc,
      clusterName: `${deployEnv}-${commonConstants.project}-cluster`
    });

    //Task Definition
    const taskDefApi = new ecs.FargateTaskDefinition(this, `${deployEnv}-Api-taskDef`);
    const taskDefApiLogGroup = new logs.LogGroup(this, `${deployEnv}-Api-logGroup`, {logGroupName: `/${deployEnv}/ecs/Api`});
    taskDefApi.addContainer("apiContainer", {
      image: ecs.ContainerImage.fromEcrRepository(apiECRRepo),
      portMappings: [
        {
          containerPort: 8888,
        },
      ],
      secrets: {
        // DB_PORT: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "port_value", { parameterName: `/${deployEnv}/db_port` })),
        // DB_USERNAME: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "username_value", { parameterName: `/${deployEnv}/db_username` })),
        // DB_PASSWORD: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "password_value", { parameterName: `/${deployEnv}/db_password` })),
        // DB_DATABASE: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "db_value", { parameterName: `/${deployEnv}/db_database` })),
      },
      environment: {
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${deployEnv}`,logGroup: taskDefApiLogGroup }),
    });
    taskDefApi.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      resources: [`*`]
    }));

    //Service
    const apiService = new ecs.FargateService(this, `${deployEnv}-Api-service`, {
      cluster: cluster,
      taskDefinition: taskDefApi,
      serviceName: "Api-service",
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      desiredCount: 0,
      assignPublicIp: true, //if not set, task will be place in private subnet
    });

    //Auto Scale (max to 5 task, scale when CPU Reach 70%)
    const scalableTarget = apiService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 5,
    });
    
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
    });

    const apiBlueTg = httpsListener.addTargets(`blueApiTarget${deployEnv}`, {
      priority: 1,
      port: 8888,
      protocol: lbv2.ApplicationProtocol.HTTP,
      conditions: [
        lbv2.ListenerCondition.hostHeaders([`api.${config.domainName}`]),
        // cdk.aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(["/api/*"]),
      ],
      targets: [apiService],
      healthCheck: {
        path: "/ping"
      }
    });

    const apiGreenTg = new lbv2.ApplicationTargetGroup(this, `greenApiTarget${deployEnv}`,{
      vpc: vpc,
      port: 8888,
      protocol: lbv2.ApplicationProtocol.HTTP,
      targetType: lbv2.TargetType.IP,
      healthCheck: {
        path: "/ping"
      },
    });

    new route53.ARecord(this, `api-record-${deployEnv}`, {
      zone: hostZone,
      target: route53.RecordTarget.fromAlias(new route53_targets.LoadBalancerTarget(loadBalancer)),
      recordName: `api.${hostZone.zoneName}`,
    });
    
    /**
     * Deploy Pipeline
     */
    //Codebuild permission 
    const codebuildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
    });

    codebuildRole.addToPolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: ["ecr:*", "ssm:GetParameters", "ecs:UpdateService", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:TagResource"],
    }));

    codebuildRole.addToPolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: ["iam:PassRole"],
    }));

    //Source
    const sourceOutputApi = new codepipeline.Artifact();
    const sourceActionApi = new codepipeline_actions.CodeStarConnectionsSourceAction({
      actionName: "Github_Source",
      owner: "long2205",
      branch: config.githubBranch,
      repo: "ecs-example-api-repo",
      output: sourceOutputApi,
      connectionArn: commonConstants.codestarConnectionARN
    });
    //Build
    const buildOutputApi = new codepipeline.Artifact();
    const buildProjectApi = new codebuild.Project(this, "ApiBuildProject", {
      projectName: `api-build-${deployEnv}`,
      role: codebuildRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "echo Logging in to Amazon ECR...",
              "aws --version",
              "$(aws ecr get-login --no-include-email --region $AWS_REGION)",
              "COMMIT_ID=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -b -8)"
            ]
          },
          build: {
            commands: [
              "echo Build started on `date`",
              // Front end build might need to supply api URL beforehand 
              // "docker build --build-arg react_app_url=" + react_app_url + " --build-arg react_google_id=" +react_google_id + " -t " + ecrDashboardRepo.repositoryUri + ":latest ."
              "docker build -t " + apiECRRepo.repositoryUri + ":$COMMIT_ID .",
              "docker image tag " + apiECRRepo.repositoryUri + ":$COMMIT_ID " + apiECRRepo.repositoryUri + ":latest"
            ]
          },
          post_build: {
            commands: [
              "echo Build completed on `date`",
              "echo Pushing the Docker image...",
              "docker push " + apiECRRepo.repositoryUri + ":$COMMIT_ID",
              "docker push " + apiECRRepo.repositoryUri + ":latest",
              // In case we have taskdef file in source code: at deploy/task-definition.${deployEnv}.json
              // `NEW_TASK_INFO=$(aws ecs register-task-definition --cli-input-json file://./deploy/task-definition.${deployEnv}.json ) `,
              // "NEW_REVISION=$(echo $NEW_TASK_INFO | jq '.taskDefinition.revision') ",
              // "aws ecs describe-task-definition --task-definition " + taskDefApi.family + ":$NEW_REVISION | jq '.taskDefinition' > taskdef.json",
              "aws ecs describe-task-definition --task-definition " + taskDefApi.taskDefinitionArn + " | jq '.taskDefinition' > taskdef.json",
              `printf '{"ImageURI":"${apiECRRepo.repositoryUri}:$COMMIT_ID"}' > imageDetail.json`

            ],
          }
        },
        artifacts: {
          files: [
            "appspec.yaml", 
            "taskdef.json",
            "imageDetail.json"
          ]
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
        privileged: true,
      },
    });

    //Deploy
    const ecsDeployApiGroup = new codedeploy.EcsDeploymentGroup(this, 'apiBlueGreenDG', {
      service: apiService,
      blueGreenDeploymentConfig: {
        blueTargetGroup: apiBlueTg,
        greenTargetGroup: apiGreenTg,
        listener: httpsListener,
      },
      deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE,
    });

    //Pipeline
    const pipelineApi = new codepipeline.Pipeline(this, "ApiPipeline", {
      pipelineName: `api-pipeline-${deployEnv}`,
      stages: [
        {
          stageName: "Source",
          actions: [sourceActionApi],
        },
        {
          stageName: "Build",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "Build Docker Api Image",
              project: buildProjectApi,
              input: sourceOutputApi,
              outputs: [buildOutputApi]
            }),
          ],
        },
        {
          stageName: "Deploy",
          actions: [
            new codepipeline_actions.CodeDeployEcsDeployAction({
              actionName: "BlueGreen ECSDeploy",
              deploymentGroup: ecsDeployApiGroup,
              appSpecTemplateInput: buildOutputApi,
              taskDefinitionTemplateInput: buildOutputApi
            }),
          ],
        },
      ],
      crossAccountKeys: false
    });
    pipelineApi.artifactBucket.applyRemovalPolicy(RemovalPolicy.DESTROY);


    /**Lambda function */
    const exampleLambda = new lambda.Function(this, `${deployEnv}-${commonConstants.project}-exampleLambda`, {
      functionName: `example-lambda-${deployEnv}`,
      code: lambda.Code.fromAsset(path.join(__dirname,"../assets")),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: `example-lambda-${deployEnv}.lambda_handler`,
      environment: {
        "env": deployEnv
      },
  });
  }
}
