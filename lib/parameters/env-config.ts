import * as dotenv from 'dotenv';
import * as path from 'path';

//Define each parameters' type
export interface StackConfig {
    domainName: string;
    cidrBlock: string;
}

//Get parameter from .env file, if value not exist, get default's value

export const resolveConfig = (deployEnv: string): StackConfig => {
    dotenv.config({ path: path.resolve(__dirname, `../.env.${deployEnv}`) });

    return {
        domainName: process.env.DOMAIN_NAME || '',
        cidrBlock: process.env.CIDR_BLOCK || '10.1.0.0/16'
    }
};
