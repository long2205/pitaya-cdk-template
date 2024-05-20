# CDK Template
Pitaya CDK template 😃 (in Typescript)

## Tables of contents
- [Background] (#background)
- [Requirements] (#requirements)

## Background
I don't want to initiate a blank CDK project anymore. So this is what I created.

You can use this to deploy infra from your machine, or even with a CDK pipeline with just a little twist!

## Requirements
Of course a PC (I'm using MacOS, so installation guide gonna be for MacOS)

1. AWS CLI

    https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
2. npm
3. CDK Typescript
    ```sh
    npm -g install typescript    
    ```
4. AWS Account (I will use AWS SSO Account with --profile flag)

## Stacks structure
The template include 3 major stacks:
- Base Network
- Stateful Resources
- Stateless Resources

Stacks will be deploy in the following order:

Stateful and Stateless stacks depended on BaseNetwork stack.<bR>
BaseNetwork stack will be created if you didn't initiate it first.

You can extend to more stacks. But the less stacks the better.

![stacks](/stacks.png)
## Files structure and its meaning
```sh
pitaya-cdk-template
├── assets
│   └── lambda-code.py #example lambda function's code
├── bin
│   └── pitaya-cdk-template.ts #stacks will be loaded here
├── lib #stacks' definition folder
│   ├── parameters 
│   │   ├── constants.ts #constants through out project
│   │   └── env-config.ts #load parameter from .env.${deployEnv} files below
│   ├── base-network.ts #Base Network Stack
│   ├── stateful-resources.ts #Stateful Stack
│   └── stateless-resources.ts #Stateless Stack
├── .env.dev #parameters for dev environment
├── .env.stg #parameters for stg environment
└── .env.prod #parameters for prod environment
```

## Commands
### Git clone and bootstrap cdk to your AWS account
```sh
git clone git@github.com:long2205/pitaya-cdk-template.git
cdk bootstrap --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦
```

### Deploy stacks
Stacks will be deploy be upper-most order.

Which means, BaseNetwork will be deploy first, then following with stateless, etc..

You need to specify which environment to deploy with context **deployEnv**.

For example with development environment:
```sh
# Deploy Base Network
cdk deploy -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 BaseNetwork

# Deploy Stateless resources
cdk deploy -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 StatelessResource
# Stateless stack is depended on BaseNetwork Stack. Hence when deploy, it also deploys BaseNetwork Stack. The same with Stateful Stack
```

### Delete stacks
Sometimes, you need to re-create stack. Or your business is gone and you need to delete it. 

Delete stack will be delete by lower-most order.

Which means the lowest stack will be delete first, then the upmost BaseNetwork stack will be delete.


```sh
cdk destroy -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 StatelessResource
```
