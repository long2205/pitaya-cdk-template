# CDK Template
Pitaya CDK template 😃 (in Typescript)

## Tables of contents
- [Background](#background)
- [Requirements](#requirements)
- [Stacks structure](#stacks-structure)
- [Files structure](#files-structure-and-its-meaning)
- [Commands](#commands)
- []
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
4. AWS Credential (I will use AWS SSO Account with --profile flag)

## Stacks structure
The template include 3 major stacks:
- Base Network
- Stateful Resources
- Stateless Resources

Stacks will be deploy in the following order:

Stateful and Stateless stacks depended on BaseNetwork stack.<bR>
BaseNetwork stack will be created if you didn't initiate it first.

You can extend to more stacks. But the less stacks the better.

**⚠️⚠️⚠️Please also keep in mind that this stack will be deploy in Tokyo Region as default⚠️⚠️⚠️**<br>
Set different region in .env file if needed to

![stacks](/stacks.png)
## Files structure and its meaning
```sh
pitaya-cdk-template
├── assets
│   └── lambda-code.py #example lambda function's code
├── bin
│   └── pitaya-cdk-template.ts # entry point, stacks will be loaded here
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
You need to specify which environment to deploy with context **deployEnv** and supply it on every cdk command. <br> 

`-c deployEnv=dev`

### Git clone and bootstrap cdk to your AWS account
```sh
# Clone project
git clone git@github.com:long2205/pitaya-cdk-template.git
```

Register account ID (and default region) in lib/constants.ts
```sh
# Bootstrap to your AWS
cdk bootstrap -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦
```

### Deploy stacks
Stacks will be deploy be upper-most order.

Which means, BaseNetwork will be deploy first, then following with stateless, etc..

Deploy commands with development environment:
```sh
# Deploy Base Network
cdk deploy -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 BaseNetwork

# Deploy Stateless resources
cdk deploy -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 StatelessResource
# Stateless stack is depended on BaseNetwork Stack. Hence when deploy, it also deploys BaseNetwork Stack. The same with Stateful Stack
```

### Delete stacks
Sometimes, you need to re-create stack. Or your business is gone and you need to delete it. 

Deleting stacks should be delete by later-most order.

Which means the latest stack should be delete first, then the upmost BaseNetwork stack will be delete.

```sh
cdk destroy -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 StatelessResource

cdk deploy -c deployEnv=dev --profile 𝘺𝘰𝘶𝘳-𝘱𝘳𝘰𝘧𝘪𝘭𝘦-𝘯𝘢𝘮𝘦 BaseNetwork
# If you only run BaseNetwork delete command, all stacks will be delete, not just BaseNetwork stack
```

## Future improvements
- Wrapped all the stacks into a [CDK Pipeline](https://docs.aws.amazon.com/cdk/v2/guide/cdk_pipeline.html) 

(This is the main reason I put parameters into .env file, but for now I still prefer control from local machine)
- Introduce [cdk-nag](https://github.com/cdklabs/cdk-nag)